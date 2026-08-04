import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { deductCredit } from '@/services/wallet.service'
import { getPersonalShop } from '@/lib/shop-context'
import {
  BUSINESS_PACKAGE_TIER_CONFIG, TIER_ORDER, BUSINESS_PACKAGE_RENEWAL_PERIOD_DAYS,
  WALLET_REASON_BUSINESS, WALLET_DESC_BUSINESS, SHOP_LOCK_REASON, GRACE_ELIGIBLE_LOCK_REASONS,
  type BusinessPackageTier,
} from '@/lib/business-package'
import type { Prisma } from '@prisma/client'

function addDays(d: Date, n: number) { return new Date(d.getTime() + n * 86_400_000) }

/**
 * getSubscriptionStatus — สถานะ subscription ระดับ owner
 * ไม่มี row = null (NOT_SUBSCRIBED pseudo-state — ไม่ใช่ enum value ใน DB)
 */
export async function getSubscriptionStatus(ownerId: string) {
  const sub = await prisma.businessPackageSubscription.findUnique({ where: { ownerId } })
  return sub ?? null // null = NOT_SUBSCRIBED (FREE pseudo-state)
}

/**
 * subscribeBusinessPackage — สมัครครั้งแรก (ต้องไม่มี subscription row มาก่อน + ต้องมี Personal shop)
 */
export async function subscribeBusinessPackage(ownerId: string, tier: BusinessPackageTier) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.businessPackageSubscription.findUnique({ where: { ownerId }, select: { id: true } })
    if (existing) throw new Error('SUBSCRIPTION_ALREADY_EXISTS')

    const personal = await getPersonalShop(ownerId) // read-only lookup, ผูก tx ผ่าน tx.shop เพื่อ consistency ในทางปฏิบัติ
    if (!personal) throw new Error('PERSONAL_SHOP_REQUIRED')

    const subId = randomUUID()
    await deductCredit(
      personal.id, BUSINESS_PACKAGE_TIER_CONFIG[tier].priceBaht, subId,
      WALLET_DESC_BUSINESS.SUBSCRIBE, WALLET_REASON_BUSINESS.BUSINESS_PACKAGE_SUBSCRIPTION, tx,
    )

    const now = new Date()
    await tx.businessPackageSubscription.create({
      data: {
        id: subId, ownerId, tier, status: 'ACTIVE',
        activatedAt: now, currentPeriodStart: now,
        nextRenewalAt: addDays(now, BUSINESS_PACKAGE_RENEWAL_PERIOD_DAYS),
      },
    })

    await reconcileBusinessLocksAfterQuotaChange(ownerId, tier, tx) // ปลดล็อก shop ที่ค้าง grace จาก cancel ก่อนหน้า (ถ้ามี)
    return { status: 'ACTIVE' as const, nextRenewalAt: addDays(now, BUSINESS_PACKAGE_RENEWAL_PERIOD_DAYS) }
  })
}

/**
 * upgradeBusinessPackage — เปลี่ยน tier ขึ้น (ต้องมี subscription ACTIVE + tier ใหม่สูงกว่าเดิม)
 * รีเซ็ต cycle ใหม่ (currentPeriodStart/nextRenewalAt) ทันที
 */
export async function upgradeBusinessPackage(ownerId: string, newTier: BusinessPackageTier) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.businessPackageSubscription.findUnique({ where: { ownerId } })
    if (!sub || sub.status !== 'ACTIVE') throw new Error('SUBSCRIPTION_NOT_ACTIVE')
    if (TIER_ORDER[newTier] <= TIER_ORDER[sub.tier as BusinessPackageTier]) {
      throw new Error('NOT_AN_UPGRADE')
    }
    const personal = await getPersonalShop(ownerId)
    if (!personal) throw new Error('PERSONAL_SHOP_REQUIRED')

    await deductCredit(
      personal.id, BUSINESS_PACKAGE_TIER_CONFIG[newTier].priceBaht, sub.id,
      WALLET_DESC_BUSINESS.UPGRADE, WALLET_REASON_BUSINESS.BUSINESS_PACKAGE_SUBSCRIPTION, tx,
    )
    const now = new Date()
    await tx.businessPackageSubscription.update({
      where: { ownerId },
      data: { tier: newTier, currentPeriodStart: now, nextRenewalAt: addDays(now, BUSINESS_PACKAGE_RENEWAL_PERIOD_DAYS), lastRenewalAt: now },
    })
    await reconcileBusinessLocksAfterQuotaChange(ownerId, newTier, tx)
    return { tier: newTier }
  })
}

/**
 * downgradeBusinessPackage — เปลี่ยน tier ลง (ต้องมี subscription ACTIVE + tier ใหม่ต่ำกว่าเดิม)
 * ไม่แตะ billing cycle (RD-4) — owner เลือก keepShopIds ถ้าจำนวน business เกินโควตาใหม่
 */
export async function downgradeBusinessPackage(
  ownerId: string, newTier: BusinessPackageTier, keepShopIds: string[],
) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.businessPackageSubscription.findUnique({ where: { ownerId } })
    if (!sub || sub.status !== 'ACTIVE') throw new Error('SUBSCRIPTION_NOT_ACTIVE')
    if (TIER_ORDER[newTier] >= TIER_ORDER[sub.tier as BusinessPackageTier]) {
      throw new Error('NOT_A_DOWNGRADE')
    }
    const newQuota = BUSINESS_PACKAGE_TIER_CONFIG[newTier]
    const allShops = await tx.shop.findMany({
      where: { userId: ownerId, kind: 'BUSINESS', deletedAt: null }, select: { id: true },
    })
    if (newQuota.maxBusinesses !== null) {
      if (keepShopIds.length > newQuota.maxBusinesses) throw new Error('KEEP_SELECTION_EXCEEDS_QUOTA')
      const validIds = new Set(allShops.map((s) => s.id))
      if (!keepShopIds.every((id) => validIds.has(id))) throw new Error('INVALID_SHOP_SELECTION')
      const keepSet = new Set(keepShopIds)
      const toLock = allShops.filter((s) => !keepSet.has(s.id)).map((s) => s.id)
      if (toLock.length) {
        await tx.shop.updateMany({
          where: { id: { in: toLock } },
          data: { packageLockedAt: new Date(), packageLockReason: SHOP_LOCK_REASON.QUOTA_EXCEEDED_BUSINESS_COUNT },
        })
      }
    }
    await tx.businessPackageSubscription.update({ where: { ownerId }, data: { tier: newTier } }) // ไม่แตะ cycle (RD-4)
    await reconcileBusinessLocksAfterQuotaChange(ownerId, newTier, tx)
    return { tier: newTier }
  })
}

/**
 * cancelBusinessPackage — ยกเลิก: lock ทุก business shop ทันที (T+0) แล้วลบ subscription row
 * เริ่มนับ 30-day grace (autoSoftDeleteLapsedShops) จาก packageLockedAt ที่เพิ่งตั้ง
 */
export async function cancelBusinessPackage(ownerId: string) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.businessPackageSubscription.findUnique({ where: { ownerId } })
    if (!sub || sub.status !== 'ACTIVE') throw new Error('SUBSCRIPTION_NOT_ACTIVE')
    await lockAllBusinessShops(ownerId, SHOP_LOCK_REASON.OWNER_CANCELLED_PACKAGE, tx)
    await tx.businessPackageSubscription.delete({ where: { ownerId } })
    return { status: 'NOT_SUBSCRIBED' as const }
  })
}

/**
 * reactivateBusinessPackage — เปิดใช้ subscription ที่ถูก LOCKED_RENEWAL_FAILED กลับมา ACTIVE
 * หัก credit รอบใหม่ทันที (เหมือน renew) แล้ว reconcile ปลดล็อก shop ตาม quota tier เดิม
 */
export async function reactivateBusinessPackage(ownerId: string) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.businessPackageSubscription.findUnique({ where: { ownerId } })
    if (!sub || sub.status !== 'LOCKED_RENEWAL_FAILED') throw new Error('SUBSCRIPTION_NOT_LOCKED')
    const personal = await getPersonalShop(ownerId)
    if (!personal) throw new Error('PERSONAL_SHOP_REQUIRED')
    await deductCredit(
      personal.id, BUSINESS_PACKAGE_TIER_CONFIG[sub.tier as BusinessPackageTier].priceBaht, sub.id,
      WALLET_DESC_BUSINESS.REACTIVATE, WALLET_REASON_BUSINESS.BUSINESS_PACKAGE_SUBSCRIPTION, tx,
    )
    const now = new Date()
    await tx.businessPackageSubscription.update({
      where: { ownerId },
      data: { status: 'ACTIVE', currentPeriodStart: now, nextRenewalAt: addDays(now, BUSINESS_PACKAGE_RENEWAL_PERIOD_DAYS), lastRenewalAt: now, lockedAt: null },
    })
    await reconcileBusinessLocksAfterQuotaChange(ownerId, sub.tier as BusinessPackageTier, tx)
    return { status: 'ACTIVE' as const }
  })
}

/** renewOrLockBusinessPackage — เรียกจาก cron เท่านั้น (ไม่มี HTTP endpoint ตรง) */
export async function renewOrLockBusinessPackage(ownerId: string): Promise<'RENEWED' | 'LOCKED' | 'SKIPPED'> {
  return prisma.$transaction(async (tx) => {
    const now = new Date()
    const before = await tx.businessPackageSubscription.findUnique({ where: { ownerId } })
    if (!before || before.status !== 'ACTIVE' || before.nextRenewalAt > now) return 'SKIPPED'

    const claimed = await tx.businessPackageSubscription.updateMany({
      where: { ownerId, status: 'ACTIVE', nextRenewalAt: before.nextRenewalAt },
      data: { nextRenewalAt: addDays(now, BUSINESS_PACKAGE_RENEWAL_PERIOD_DAYS) },
    })
    if (claimed.count === 0) return 'SKIPPED'

    const personal = await getPersonalShop(ownerId)
    if (!personal) { // edge: Personal shop หาย — ปฏิบัติเหมือนยอดเงินไม่พอ
      await tx.businessPackageSubscription.update({
        where: { ownerId }, data: { status: 'LOCKED_RENEWAL_FAILED', lockedAt: now, nextRenewalAt: before.nextRenewalAt },
      })
      await lockAllBusinessShops(ownerId, SHOP_LOCK_REASON.RENEWAL_FAILED, tx)
      return 'LOCKED'
    }

    try {
      await deductCredit(
        personal.id, BUSINESS_PACKAGE_TIER_CONFIG[before.tier as BusinessPackageTier].priceBaht, before.id,
        WALLET_DESC_BUSINESS.RENEW, WALLET_REASON_BUSINESS.BUSINESS_PACKAGE_SUBSCRIPTION, tx,
      )
    } catch (e) {
      if (e instanceof Error && e.message === 'INSUFFICIENT_CREDIT') {
        await tx.businessPackageSubscription.update({
          where: { ownerId }, data: { status: 'LOCKED_RENEWAL_FAILED', lockedAt: now, nextRenewalAt: before.nextRenewalAt },
        })
        await lockAllBusinessShops(ownerId, SHOP_LOCK_REASON.RENEWAL_FAILED, tx)
        return 'LOCKED'
      }
      throw e
    }
    await tx.businessPackageSubscription.update({ where: { ownerId }, data: { currentPeriodStart: now, lastRenewalAt: now } })
    return 'RENEWED'
  })
}

/** lockAllBusinessShops — shared helper (TFR-004) ใช้โดย renewOrLock + cancel */
export async function lockAllBusinessShops(ownerId: string, reason: string, tx: Prisma.TransactionClient) {
  await tx.shop.updateMany({
    where: { userId: ownerId, kind: 'BUSINESS', deletedAt: null, purgedAt: null },
    data: { packageLockedAt: new Date(), packageLockReason: reason },
  })
}

/** reconcileBusinessLocksAfterQuotaChange — SRS TFR-016 (pseudocode เต็มอ้างอิงจาก SRS) */
export async function reconcileBusinessLocksAfterQuotaChange(
  ownerId: string, tier: BusinessPackageTier, tx: Prisma.TransactionClient,
) {
  const quota = BUSINESS_PACKAGE_TIER_CONFIG[tier]

  // A) business-count — unlock candidates (grace-eligible + quota-exceeded) ตาม slot ว่าง, เก่าสุดก่อน (RD-10)
  const activeCount = await tx.shop.count({
    where: { userId: ownerId, kind: 'BUSINESS', deletedAt: null, packageLockedAt: null },
  })
  const candidates = await tx.shop.findMany({
    where: {
      userId: ownerId, kind: 'BUSINESS', deletedAt: null,
      packageLockReason: { in: [...GRACE_ELIGIBLE_LOCK_REASONS, SHOP_LOCK_REASON.QUOTA_EXCEEDED_BUSINESS_COUNT] },
    },
    orderBy: { createdAt: 'asc' }, select: { id: true },
  })
  const slots = quota.maxBusinesses === null ? candidates.length : Math.max(0, quota.maxBusinesses - activeCount)
  const toUnlock = candidates.slice(0, slots).map((c) => c.id)
  if (toUnlock.length) {
    await tx.shop.updateMany({ where: { id: { in: toUnlock } }, data: { packageLockedAt: null, packageLockReason: null } })
  }

  // B) admin-count — re-lock ที่เกิน, unlock ที่พอดี (ทุก shop ที่ active ตอนนี้ รวมที่เพิ่ง unlock ใน A)
  const activeShops = await tx.shop.findMany({
    where: { userId: ownerId, kind: 'BUSINESS', deletedAt: null, packageLockedAt: null }, select: { id: true },
  })
  for (const shop of activeShops) {
    const adminCount = await tx.shopMember.count({ where: { shopId: shop.id, role: 'ADMIN' } })
    if (quota.maxAdminsPerBusiness !== null && adminCount > quota.maxAdminsPerBusiness) {
      await tx.shop.update({
        where: { id: shop.id },
        data: { packageLockedAt: new Date(), packageLockReason: SHOP_LOCK_REASON.QUOTA_EXCEEDED_ADMIN_COUNT },
      })
    }
  }
  const adminLocked = await tx.shop.findMany({
    where: { userId: ownerId, kind: 'BUSINESS', deletedAt: null, packageLockReason: SHOP_LOCK_REASON.QUOTA_EXCEEDED_ADMIN_COUNT },
    select: { id: true },
  })
  for (const shop of adminLocked) {
    const adminCount = await tx.shopMember.count({ where: { shopId: shop.id, role: 'ADMIN' } })
    if (quota.maxAdminsPerBusiness === null || adminCount <= quota.maxAdminsPerBusiness) {
      await tx.shop.update({ where: { id: shop.id }, data: { packageLockedAt: null, packageLockReason: null } })
    }
  }
}
