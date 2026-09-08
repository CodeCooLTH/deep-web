/**
 * apple-iap.service — เปิด/ถอนสิทธิ์ Business Package จากธุรกรรมของ Apple (feature 00064)
 *
 * 🛑 ทุกฟังก์ชันในไฟล์นี้รับ **ข้อเท็จจริงที่ผ่านการตรวจลายเซ็นและตรวจ bundleId แล้ว**
 * (`AppleSubscriptionFacts`) ไม่ใช่ payload ดิบ — ตัวไฟล์นี้จึงไม่ต้องรู้เรื่อง crypto เลย
 * และเทสของมันไม่ต้องปลอมลายเซ็น
 *
 * ── ความแตกต่างที่สำคัญที่สุดจากเส้นทางกระเป๋าเงิน ──────────────────────────────
 *
 * ใบที่ `source='APPLE_IAP'` **Apple เป็นเจ้าของรอบบิล** ⇒
 *   · `nextRenewalAt` มาจาก `expiresDate` ที่ Apple แจ้ง ห้ามคำนวณ +30 วันเอง (BR-IAP-03)
 *   · cron ของเราต้องไม่แตะ (`isWalletBilled` กันไว้แล้วใน business-package.service)
 *   · ยกเลิก/คืนเงิน เกิดที่ฝั่ง Apple เราแค่รับแจ้ง
 */

import { randomUUID } from 'node:crypto'

import { prisma } from '@/lib/prisma'
import { SHOP_LOCK_REASON } from '@/lib/business-package'
import { SUBSCRIPTION_SOURCE, isAppleBilled } from '@/lib/subscription-source'
import type { AppleSubscriptionFacts } from '@/lib/apple/transaction'
import { isEntitlementActive } from '@/lib/apple/entitlement'
import { lockAllBusinessShops, reconcileBusinessLocksAfterQuotaChange } from '@/services/business-package.service'

export type LinkRejection =
  /** `originalTransactionId` นี้ผูกกับบัญชี Deep อื่นไปแล้ว (BR-IAP-04) */
  | 'TRANSACTION_OWNED_BY_ANOTHER_ACCOUNT'
  /** บัญชีนี้มีใบที่จ่ายด้วยกระเป๋าเงินอยู่ — ยังไม่ตัดสินว่าจะรวมยังไง (PRD Q-2) */
  | 'WALLET_SUBSCRIPTION_EXISTS'

export type LinkResult =
  | { ok: true; tier: AppleSubscriptionFacts['tier']; expiresAt: Date; created: boolean }
  | { ok: false; reason: LinkRejection }

/**
 * ผูกธุรกรรมของ Apple เข้ากับบัญชีผู้ขาย แล้วเปิดสิทธิ์
 *
 * เรียกจาก 2 ที่ที่รู้ว่า "เจ้าของคือใคร": endpoint ยืนยันการซื้อจากเครื่องผู้ใช้
 * (`ownerId` มาจาก session) และตัวเดินตรวจซ้ำ
 *
 * 🛑 **idempotent โดยตั้งใจ** — StoreKit ส่งธุรกรรมเดิมกลับมาทุกครั้งที่เปิดแอปจนกว่าเราจะ
 * ยืนยันสำเร็จ (นั่นคือกลไกกู้คืนของ BR-IAP-11) ⇒ เรียกซ้ำด้วยข้อมูลเดิมต้องได้ผลเดิม
 * ไม่ใช่ error และไม่ใช่การสร้างแถวใหม่
 */
export async function linkAppleSubscription(
  ownerId: string,
  facts: AppleSubscriptionFacts,
): Promise<LinkResult> {
  return prisma.$transaction(async (tx) => {
    /* 🛑 ตรวจ "ธุรกรรมนี้เป็นของบัญชีอื่นหรือเปล่า" ก่อนดูของบัญชีตัวเอง
       Apple ID เดียวเปิดสิทธิ์ให้หลายบัญชี Deep ไม่ได้ — ไม่งั้นซื้อครั้งเดียวแจกได้ไม่จำกัด */
    const byTransaction = await tx.businessPackageSubscription.findUnique({
      where: { appleOriginalTransactionId: facts.originalTransactionId },
      select: { ownerId: true },
    })
    if (byTransaction && byTransaction.ownerId !== ownerId) {
      return { ok: false as const, reason: 'TRANSACTION_OWNED_BY_ANOTHER_ACCOUNT' as const }
    }

    const existing = await tx.businessPackageSubscription.findUnique({ where: { ownerId } })

    if (existing && !isAppleBilled(existing.source)) {
      /* มีใบที่จ่ายด้วยกระเป๋าเงินอยู่ — ปฏิเสธไว้ก่อน ยังไม่ตัดสินว่าจะต่อท้ายรอบเดิม
         หรือให้ยกเลิกของเดิมก่อน (PRD Q-2) · ปฏิเสธแล้วมีคนบ่นยังแก้ทัน
         แต่ถ้าเผลอเขียนทับใบเดิม ผู้ใช้จะจ่ายสองทางโดยไม่รู้ตัว */
      return { ok: false as const, reason: 'WALLET_SUBSCRIPTION_EXISTS' as const }
    }

    const revoked = facts.revokedAt !== null
    const active = !revoked && facts.expiresAt > new Date()

    const data = {
      tier: facts.tier,
      source: SUBSCRIPTION_SOURCE.APPLE_IAP,
      appleOriginalTransactionId: facts.originalTransactionId,
      appleProductId: facts.productId,
      appleEnvironment: facts.environment,
      /* 🛑 Apple เป็นเจ้าของวันหมดอายุ — ห้าม addDays(now, 30) */
      nextRenewalAt: facts.expiresAt,
      status: active ? ('ACTIVE' as const) : ('LOCKED_RENEWAL_FAILED' as const),
      lockedAt: active ? null : new Date(),
    }

    if (!existing) {
      const now = new Date()
      await tx.businessPackageSubscription.create({
        data: {
          id: randomUUID(),
          ownerId,
          ...data,
          activatedAt: now, // ครั้งแรกเท่านั้น — ห้ามแตะตอนต่ออายุ (cohort marker)
          currentPeriodStart: now,
        },
      })
    } else {
      await tx.businessPackageSubscription.update({
        where: { ownerId },
        data: {
          ...data,
          /* ต่ออายุ = ขยับต้นรอบ · `activatedAt` ห้ามแตะ */
          currentPeriodStart: new Date(),
          lastRenewalAt: new Date(),
        },
      })
    }

    if (active) {
      await reconcileBusinessLocksAfterQuotaChange(ownerId, facts.tier, tx)
    } else {
      await lockAllBusinessShops(ownerId, SHOP_LOCK_REASON.RENEWAL_FAILED, tx)
    }

    return {
      ok: true as const,
      tier: facts.tier,
      expiresAt: facts.expiresAt,
      created: !existing,
    }
  })
}

export type ApplyOutcome =
  | 'RENEWED'
  | 'EXPIRED'
  | 'REVOKED'
  /** ยังไม่มีใครผูกธุรกรรมนี้กับบัญชี Deep — เก็บไว้ให้ตัวเดินตรวจซ้ำตามเก็บ */
  | 'NOT_LINKED'

/**
 * อัปเดตสถานะจากการแจ้งเตือนของ Apple — **ไม่รู้ว่าเจ้าของคือใคร** ต้องหาจากธุรกรรม
 *
 * ต่างจาก `linkAppleSubscription` ตรงที่ webhook ไม่มี session ⇒ ผูกบัญชีใหม่ไม่ได้
 * ได้แต่ปรับสถานะของใบที่ผูกไว้แล้ว
 *
 * 🛑 `NOT_LINKED` ไม่ใช่ error — เกิดได้ปกติเมื่อ webhook ของการซื้อครั้งแรกมาถึงเรา
 * **ก่อน** ที่เครื่องผู้ใช้จะยืนยันเสร็จ (สองเส้นทางวิ่งขนานกัน) ⇒ ห้ามตอบ 5xx ให้ Apple
 * ยิงซ้ำไม่รู้จบ · ปล่อยให้เครื่องผู้ใช้ผูกเองในอีกไม่กี่วินาที
 */
export async function applyAppleNotification(
  facts: AppleSubscriptionFacts,
  /**
   * วันสิ้นสุดช่วงผ่อนผัน จาก `signedRenewalInfo` ของการแจ้งเตือนใบเดียวกัน
   *
   * 🛑 บังคับให้ส่งเสมอ (ไม่มี default) — ถ้าปล่อยเป็น optional คนเรียกรายใหม่จะลืมส่ง
   * แล้วลูกค้าที่อยู่ในช่วงผ่อนผันจะถูกล็อกร้านเงียบ ๆ ซึ่งเป็นบั๊กที่ไม่มีใครเห็น
   * จนกว่าลูกค้าจะโทรมา · `null` = การแจ้งเตือนนี้ไม่มีช่วงผ่อนผัน (กรณีปกติ)
   */
  gracePeriodExpiresAt: Date | null,
): Promise<ApplyOutcome> {
  const sub = await prisma.businessPackageSubscription.findUnique({
    where: { appleOriginalTransactionId: facts.originalTransactionId },
    select: { ownerId: true, source: true },
  })
  if (!sub) return 'NOT_LINKED'

  /* กันเหนียว — ถ้าแถวนั้นกลายเป็นของกระเป๋าเงินไปแล้ว (ไม่ควรเกิด แต่ถ้าเกิด
     การเขียนทับจะทำให้ผู้ใช้เสียสิทธิ์ที่จ่ายเงินไว้) */
  if (!isAppleBilled(sub.source)) return 'NOT_LINKED'

  const revoked = facts.revokedAt !== null
  /* 🛑 ห้ามกลับไปเขียน `facts.expiresAt > new Date()` ตรง ๆ — ระหว่าง billing retry ของ Apple
     `expiresDate` เป็นอดีตไปแล้วแต่ผู้ใช้ยังต้องใช้งานได้จนพ้นช่วงผ่อนผัน (BR-IAP-14) */
  const active = isEntitlementActive(
    { expiresAt: facts.expiresAt, revokedAt: facts.revokedAt, gracePeriodExpiresAt },
    new Date(),
  )

  await prisma.$transaction(async (tx) => {
    await tx.businessPackageSubscription.update({
      where: { ownerId: sub.ownerId },
      data: {
        tier: facts.tier,
        appleProductId: facts.productId,
        nextRenewalAt: facts.expiresAt,
        status: active ? 'ACTIVE' : 'LOCKED_RENEWAL_FAILED',
        lockedAt: active ? null : new Date(),
        ...(active ? { lastRenewalAt: new Date(), currentPeriodStart: new Date() } : {}),
      },
    })
    if (active) {
      await reconcileBusinessLocksAfterQuotaChange(sub.ownerId, facts.tier, tx)
    } else {
      await lockAllBusinessShops(sub.ownerId, SHOP_LOCK_REASON.RENEWAL_FAILED, tx)
    }
  })

  return revoked ? 'REVOKED' : active ? 'RENEWED' : 'EXPIRED'
}
