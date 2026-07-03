import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { deductCredit } from '@/services/wallet.service'
import {
  EntitlementStatus, InventoryPackage, INVENTORY_ADVANCE_WARNING_DAYS,
  INVENTORY_RENEWAL_PERIOD_DAYS, PACKAGE_PRICE, WALLET_REASON, WALLET_DESC, addDays,
} from '@/lib/inventory-addon'

/**
 * getEntitlementInfo — คืนทั้ง status+package ในควอรี่เดียว (Deep Stock Pro, feature 00009)
 * ไม่มี row = 'NOT_SUBSCRIBED' / package=null (ไม่ใช่ enum value ใน DB — ดู DATABASE.md §3.1 FROZEN CONTRACT)
 */
export async function getEntitlementInfo(
  shopId: string,
): Promise<{ status: EntitlementStatus; package: InventoryPackage | null }> {
  const row = await prisma.inventoryEntitlement.findUnique({
    where: { shopId },
    select: { status: true, package: true },
  })
  return { status: row?.status ?? 'NOT_SUBSCRIBED', package: row?.package ?? null }
}

/**
 * getEntitlementStatus — signature เดิม ไม่เปลี่ยน (backward-compat 100% กับทุก call-site เดิม)
 * internal reuse getEntitlementInfo
 */
export async function getEntitlementStatus(shopId: string): Promise<EntitlementStatus> {
  return (await getEntitlementInfo(shopId)).status
}

export async function isEntitlementActive(shopId: string): Promise<boolean> {
  return (await getEntitlementStatus(shopId)) === 'ACTIVE'
}

/**
 * isProActive — PRO-gate helper (ใช้กับ Alert/Audit/CSV — feature 00009)
 */
export async function isProActive(shopId: string): Promise<boolean> {
  const info = await getEntitlementInfo(shopId)
  return info.status === 'ACTIVE' && info.package === 'PRO'
}

/**
 * subscribeInventoryEntitlement — สมัครครั้งแรก (ต้องไม่มี entitlement row มาก่อน)
 * BREAKING (feature 00009) — เพิ่ม param pkg (เดิม: subscribeInventoryEntitlement(shopId))
 */
export async function subscribeInventoryEntitlement(
  shopId: string,
  pkg: InventoryPackage,
): Promise<{ status: 'ACTIVE'; package: InventoryPackage; nextRenewalAt: Date }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.inventoryEntitlement.findUnique({ where: { shopId }, select: { id: true } })
    if (existing) throw new Error('ENTITLEMENT_ALREADY_EXISTS')

    // pre-generate id (Prisma @default(uuid()) เป็น client-side generation อยู่แล้ว —
    // generate เองที่นี่เพื่อใช้เป็น WalletTransaction.refId ก่อน row จะถูก create จริง
    // ตาม guidance ใน DATABASE.md §3.4 "refId แนะนำ = InventoryEntitlement.id")
    const entitlementId = randomUUID()
    const price = PACKAGE_PRICE[pkg]
    const reason = pkg === 'PRO' ? WALLET_REASON.INVENTORY_SUBSCRIPTION_PRO : WALLET_REASON.INVENTORY_SUBSCRIPTION_BASIC

    // deductCredit ก่อน — ถ้า INSUFFICIENT_CREDIT throw → rollback ทั้ง tx (ไม่มี entitlement ค้าง)
    await deductCredit(shopId, price, entitlementId, WALLET_DESC.subscribe(pkg), reason, tx)

    const now = new Date()
    const nextRenewalAt = addDays(now, INVENTORY_RENEWAL_PERIOD_DAYS)
    await tx.inventoryEntitlement.create({
      data: {
        id: entitlementId, shopId, status: 'ACTIVE', package: pkg,
        activatedAt: now, currentPeriodStart: now, nextRenewalAt,
      },
    })
    return { status: 'ACTIVE', package: pkg, nextRenewalAt }
  })
}

/**
 * upgradeToProEntitlement — อัพเกรด BASIC ACTIVE → PRO ACTIVE กลางรอบ (no-proration, BR-DSP-06)
 * currentPeriodStart/nextRenewalAt reset ใหม่เหมือน reactivate; ห้ามแตะ activatedAt
 */
export async function upgradeToProEntitlement(
  shopId: string,
): Promise<{ status: 'ACTIVE'; package: 'PRO'; nextRenewalAt: Date }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.inventoryEntitlement.findUnique({ where: { shopId } })
    if (!existing || existing.status !== 'ACTIVE') throw new Error('ENTITLEMENT_NOT_ACTIVE')
    if (existing.package === 'PRO') throw new Error('ALREADY_PRO')

    await deductCredit(
      shopId, PACKAGE_PRICE.PRO, existing.id,
      WALLET_DESC.UPGRADE, WALLET_REASON.INVENTORY_SUBSCRIPTION_PRO_UPGRADE, tx,
    )

    const now = new Date()
    const nextRenewalAt = addDays(now, INVENTORY_RENEWAL_PERIOD_DAYS)
    await tx.inventoryEntitlement.update({
      where: { shopId },
      // ⚠️ ห้ามแตะ activatedAt — marker วันสมัครเดิม/cohort/tenure (เหมือน reactivate)
      data: { package: 'PRO', currentPeriodStart: now, nextRenewalAt, lastRenewalAt: now },
    })
    return { status: 'ACTIVE', package: 'PRO', nextRenewalAt }
  })
}

/**
 * reactivateInventoryEntitlement — เปิดใช้ใหม่จากสถานะ LOCKED (หัก ฿ ตาม package ที่เลือกใหม่)
 * BREAKING (feature 00009) — เพิ่ม param pkg; explicit choice ตอนนั้น ไม่ auto-restore ค่าก่อนล็อก
 */
export async function reactivateInventoryEntitlement(
  shopId: string,
  pkg: InventoryPackage,
): Promise<{ status: 'ACTIVE'; package: InventoryPackage; nextRenewalAt: Date }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.inventoryEntitlement.findUnique({ where: { shopId } })
    if (!existing || existing.status !== 'LOCKED') throw new Error('ENTITLEMENT_NOT_LOCKED')

    const price = PACKAGE_PRICE[pkg]
    const reason = pkg === 'PRO' ? WALLET_REASON.INVENTORY_SUBSCRIPTION_PRO : WALLET_REASON.INVENTORY_SUBSCRIPTION_BASIC
    await deductCredit(shopId, price, existing.id, WALLET_DESC.reactivate(pkg), reason, tx)

    const now = new Date()
    const nextRenewalAt = addDays(now, INVENTORY_RENEWAL_PERIOD_DAYS)
    await tx.inventoryEntitlement.update({
      where: { shopId },
      data: {
        // ⚠️ ห้าม set activatedAt ตรงนี้ — DATABASE.md §3.1: activatedAt ตั้งครั้งเดียวตอน
        // subscribe แรก ห้ามเปลี่ยนแม้ reactivate (เป็น marker วันสมัครเดิม/cohort/tenure)
        status: 'ACTIVE', package: pkg, currentPeriodStart: now,
        nextRenewalAt, lastRenewalAt: now, lockedAt: null,
      },
    })
    return { status: 'ACTIVE', package: pkg, nextRenewalAt }
  })
}

/**
 * renewOrLockEntitlement — เรียกจาก cron รายวันต่อ shop ที่ nextRenewalAt <= now
 * package-aware pricing (feature 00009) — ราคาตาม package ปัจจุบัน, package ไม่เปลี่ยนไม่ว่า RENEWED/LOCKED
 *
 * 🛑 TD-003 — claim-before-deduct + revert-on-fail:
 * SRS pseudocode เดิมเสนอ idempotent guard ก่อน deduct เฉย ๆ แต่ไม่ reconcile กับ
 * DATABASE.md §3.1 ("lock ต้องไม่แตะ nextRenewalAt") — ออกแบบนี้แก้ทั้งสองข้อพร้อมกัน:
 *   1) claim ล่วงหน้าด้วย atomic updateMany (RC-3 pattern — WHERE เทียบ nextRenewalAt
 *      snapshot ที่เพิ่งอ่าน) กัน cron 2 invocation (double-trigger/retry) deduct ซ้ำ
 *      สำหรับ shop เดียวกัน (count===0 = ถูก claim ไปแล้วโดย invocation อื่น → SKIPPED)
 *   2) ถ้า deduct ล้มเหลว (INSUFFICIENT_CREDIT) ต้อง revert nextRenewalAt กลับค่า
 *      before.nextRenewalAt เดิม (ไม่ใช่ค่าที่ advance ไปแล้วตอน claim) — เพื่อรักษา
 *      invariant "LOCKED ต้องไม่แตะ nextRenewalAt" (เก็บไว้เป็นหลักฐานว่ารอบไหน fail
 *      สำหรับตอน reactivate ทีหลัง)
 *   OD-A: เครดิตไม่พอ → LOCKED ทันที ไม่ fallback หัก package ต่ำกว่า (lock ทั้งก้อน)
 */
export async function renewOrLockEntitlement(
  shopId: string,
): Promise<'RENEWED' | 'LOCKED' | 'SKIPPED'> {
  return prisma.$transaction(async (tx) => {
    const now = new Date()
    const before = await tx.inventoryEntitlement.findUnique({ where: { shopId } })
    if (!before || before.status !== 'ACTIVE' || before.nextRenewalAt > now) return 'SKIPPED'

    // RC-3 atomic "claim" — WHERE เทียบ nextRenewalAt snapshot ที่เพิ่งอ่าน (optimistic lock)
    // กัน 2 invocation ของ cron (double-trigger/retry) deduct ซ้ำสำหรับ shop เดียวกัน
    const claimed = await tx.inventoryEntitlement.updateMany({
      where: { shopId, status: 'ACTIVE', nextRenewalAt: before.nextRenewalAt },
      data: { nextRenewalAt: addDays(now, INVENTORY_RENEWAL_PERIOD_DAYS) },
    })
    if (claimed.count === 0) return 'SKIPPED' // ถูก claim ไปแล้วโดย invocation อื่น

    const pkg = before.package as InventoryPackage
    const price = PACKAGE_PRICE[pkg]
    const reason = pkg === 'PRO' ? WALLET_REASON.INVENTORY_SUBSCRIPTION_PRO : WALLET_REASON.INVENTORY_SUBSCRIPTION_BASIC

    try {
      await deductCredit(shopId, price, before.id, WALLET_DESC.renew(pkg), reason, tx)
    } catch (e) {
      if (e instanceof Error && e.message === 'INSUFFICIENT_CREDIT') {
        // OD-A: ไม่ fallback หัก package ต่ำกว่า — LOCKED ทันที, package ไม่เปลี่ยน
        // revert nextRenewalAt กลับค่าเดิม — DATABASE.md §3.1 กำหนดว่า lock ต้องไม่แตะ
        // currentPeriodStart/nextRenewalAt (เก็บไว้เป็นหลักฐานว่ารอบไหน fail)
        await tx.inventoryEntitlement.update({
          where: { shopId },
          data: { status: 'LOCKED', lockedAt: now, nextRenewalAt: before.nextRenewalAt },
        })
        return 'LOCKED'
      }
      throw e
    }

    await tx.inventoryEntitlement.update({
      where: { shopId },
      data: { currentPeriodStart: now, lastRenewalAt: now }, // nextRenewalAt ถูก advance จาก claim แล้ว
    })
    return 'RENEWED'
  })
}

/**
 * shouldWarnAdvance — เตือนล่วงหน้าก่อน renewal เมื่อ ACTIVE + ใกล้ครบรอบ (≤3 วัน) + เครดิตไม่พอ
 * BREAKING (feature 00009) — เพิ่ม field package ใน entitlement param (ราคาที่เทียบ = ตาม package)
 */
export function shouldWarnAdvance(
  entitlement: { status: EntitlementStatus; package: InventoryPackage; nextRenewalAt: Date } | null,
  balance: number,
): boolean {
  if (!entitlement || entitlement.status !== 'ACTIVE') return false
  const daysUntilRenewal = Math.ceil((entitlement.nextRenewalAt.getTime() - Date.now()) / 86_400_000)
  const price = PACKAGE_PRICE[entitlement.package]
  return daysUntilRenewal <= INVENTORY_ADVANCE_WARNING_DAYS && daysUntilRenewal >= 0 && balance < price
}
