import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { deductCredit } from '@/services/wallet.service'
import {
  EntitlementStatus, INVENTORY_ADDON_PRICE, INVENTORY_ADVANCE_WARNING_DAYS,
  INVENTORY_RENEWAL_PERIOD_DAYS, WALLET_REASON, WALLET_DESC, addDays,
} from '@/lib/inventory-addon'

/**
 * getEntitlementStatus — สถานะ Inventory Add-on ของ shop
 * ไม่มี row = 'NOT_SUBSCRIBED' (ไม่ใช่ enum value ใน DB — ดู DATABASE.md §3.1 FROZEN CONTRACT)
 */
export async function getEntitlementStatus(shopId: string): Promise<EntitlementStatus> {
  const row = await prisma.inventoryEntitlement.findUnique({
    where: { shopId },
    select: { status: true },
  })
  return row?.status ?? 'NOT_SUBSCRIBED'
}

export async function isEntitlementActive(shopId: string): Promise<boolean> {
  return (await getEntitlementStatus(shopId)) === 'ACTIVE'
}

/**
 * subscribeInventoryEntitlement — สมัครครั้งแรก (ต้องไม่มี entitlement row มาก่อน)
 */
export async function subscribeInventoryEntitlement(
  shopId: string,
): Promise<{ status: 'ACTIVE'; nextRenewalAt: Date }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.inventoryEntitlement.findUnique({ where: { shopId }, select: { id: true } })
    if (existing) throw new Error('ENTITLEMENT_ALREADY_EXISTS')

    // pre-generate id (Prisma @default(uuid()) เป็น client-side generation อยู่แล้ว —
    // generate เองที่นี่เพื่อใช้เป็น WalletTransaction.refId ก่อน row จะถูก create จริง
    // ตาม guidance ใน DATABASE.md §3.4 "refId แนะนำ = InventoryEntitlement.id")
    const entitlementId = randomUUID()

    // deductCredit ก่อน — ถ้า INSUFFICIENT_CREDIT throw → rollback ทั้ง tx (ไม่มี entitlement ค้าง)
    await deductCredit(
      shopId, INVENTORY_ADDON_PRICE, entitlementId,
      WALLET_DESC.SUBSCRIBE, WALLET_REASON.INVENTORY_SUBSCRIPTION, tx,
    )

    const now = new Date()
    const nextRenewalAt = addDays(now, INVENTORY_RENEWAL_PERIOD_DAYS)
    await tx.inventoryEntitlement.create({
      data: {
        id: entitlementId, shopId, status: 'ACTIVE',
        activatedAt: now, currentPeriodStart: now, nextRenewalAt,
      },
    })
    return { status: 'ACTIVE', nextRenewalAt }
  })
}

/**
 * reactivateInventoryEntitlement — เปิดใช้ใหม่จากสถานะ LOCKED (หัก ฿199 อีกครั้ง)
 */
export async function reactivateInventoryEntitlement(
  shopId: string,
): Promise<{ status: 'ACTIVE'; nextRenewalAt: Date }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.inventoryEntitlement.findUnique({ where: { shopId } })
    if (!existing || existing.status !== 'LOCKED') throw new Error('ENTITLEMENT_NOT_LOCKED')

    await deductCredit(
      shopId, INVENTORY_ADDON_PRICE, existing.id,
      WALLET_DESC.REACTIVATE, WALLET_REASON.INVENTORY_SUBSCRIPTION, tx,
    )

    const now = new Date()
    const nextRenewalAt = addDays(now, INVENTORY_RENEWAL_PERIOD_DAYS)
    await tx.inventoryEntitlement.update({
      where: { shopId },
      data: {
        // ⚠️ ห้าม set activatedAt ตรงนี้ — DATABASE.md §3.1: activatedAt ตั้งครั้งเดียวตอน
        // subscribe แรก ห้ามเปลี่ยนแม้ reactivate (เป็น marker วันสมัครเดิม/cohort/tenure)
        status: 'ACTIVE', currentPeriodStart: now,
        nextRenewalAt, lastRenewalAt: now, lockedAt: null,
      },
    })
    return { status: 'ACTIVE', nextRenewalAt }
  })
}

/**
 * renewOrLockEntitlement — เรียกจาก cron รายวันต่อ shop ที่ nextRenewalAt <= now
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

    try {
      await deductCredit(
        shopId, INVENTORY_ADDON_PRICE, before.id,
        WALLET_DESC.RENEW, WALLET_REASON.INVENTORY_SUBSCRIPTION, tx,
      )
    } catch (e) {
      if (e instanceof Error && e.message === 'INSUFFICIENT_CREDIT') {
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
 */
export function shouldWarnAdvance(
  entitlement: { status: EntitlementStatus; nextRenewalAt: Date } | null,
  balance: number,
): boolean {
  if (!entitlement || entitlement.status !== 'ACTIVE') return false
  const daysUntilRenewal = Math.ceil((entitlement.nextRenewalAt.getTime() - Date.now()) / 86_400_000)
  return daysUntilRenewal <= INVENTORY_ADVANCE_WARNING_DAYS && daysUntilRenewal >= 0
    && balance < INVENTORY_ADDON_PRICE
}
