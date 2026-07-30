import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { todayThaiIsoDate } from '@/lib/date-range'
import { AI_SUGGEST_FREE_DAILY_LIMIT, AI_SUGGEST_EXTRA_USE_PRICE_BAHT } from '@/lib/ai-suggest-limit'
import { getBalance } from '@/services/wallet.service'
import { getSubscriptionStatus } from '@/services/business-package.service'

/**
 * ai-suggest-quota.service — โควตาฟรีรายวัน + สถานะ paid-plan สำหรับ ai-suggest (feature 00019 ext, 2026-07-29)
 * SSOT: docs/20 - Features/00019 - AI Reply Assistant/EXTENSIONS-2026-07-29-usage-limit.md
 *
 * [สำคัญ] Gate นี้ fail-closed เสมอ (NFR-AIQ-Consistency) — ต่างจาก ai-context.service ที่ fail-soft โดยตั้งใจ
 * (TFR-009) เพราะ context ล้มเหลว = คุณภาพร่างลดลง (safe to degrade) แต่ quota/paid-plan-check ล้มเหลว =
 * เสี่ยงปล่อยใช้ไม่จำกัดหรือเก็บเงินผิด (ห้าม degrade) — ทุกฟังก์ชันด้านล่าง**ไม่กลืน error เอง**
 * (ยกเว้น logUsageEvent ซึ่งเป็น audit log best-effort ตามสัญญาที่ระบุไว้) ให้ caller (route) ตัดสินใจ
 * fail-closed เอง
 */

export type AiQuotaStatus = {
  isPaidPlan: boolean
  freeLimit: number
  usedToday: number | null // null เมื่อ isPaidPlan (ไม่ track — FR-AIQ-01/02)
  freeRemaining: number | null // null เมื่อ isPaidPlan
  canUseCredit: boolean // = !isPaidPlan && balance >= priceBaht
  priceBaht: number
  balance: number
}

/**
 * isOwnerPaidPlan — owner ของร้านนี้มี Business Package ACTIVE ไหม (ทุก tier นับเท่ากัน, BR-AIQ-02)
 * เช็คตัวนี้ "ก่อนเสมอ" ตาม BR-AIQ-12 — ถ้า true ผู้เรียกต้องไม่แตะ claimFreeUsageOrFail/refundFreeUsage เลย
 *
 * NOT_SUBSCRIBED (ไม่มี row เลย, E11) และ LOCKED_RENEWAL_FAILED = ไม่นับเป็น paid (คืน false)
 */
export async function isOwnerPaidPlan(shopId: string): Promise<boolean> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { userId: true } })
  if (!shop) return false // ไม่ควรเกิด — resolveActiveShopContext ที่ชั้น route กรอง shop ที่มีอยู่จริงมาก่อนแล้ว
  const sub = await getSubscriptionStatus(shop.userId)
  return sub?.status === 'ACTIVE'
}

/** อ่านจำนวนที่ใช้โควตาฟรีไปแล้ววันนี้ (ปฏิทินไทย) — read-only, ไม่สร้างแถว (E8) */
async function getUsedTodayCount(shopId: string): Promise<number> {
  const date = todayThaiIsoDate()
  const row = await prisma.aiSuggestDailyUsage.findUnique({
    where: { shopId_date: { shopId, date } },
    select: { count: true },
  })
  return row?.count ?? 0
}

/**
 * getAiSuggestQuotaStatus — สถานะโควตา/เครดิตล่วงหน้า (GET /api/chat/ai-quota, FR-AIQ-05)
 * อ่านอย่างเดียว: เรียก isOwnerPaidPlan ก่อนเสมอ — ถ้า paid คืนทันทีโดย**ไม่ query AiSuggestDailyUsage เลย**
 * (NFR-AIQ-Perf) balance ยังคง query เสมอทั้ง 2 กรณีเพราะ response contract ("balance" field) กำหนดให้ส่งกลับ
 * เสมอแม้ isPaidPlan:true (ไว้ให้ UI แสดงยอดกระเป๋าเงินเฉย ๆ ไม่ใช้ตัดสินสิทธิ์) — ดู decision note ใน commit
 */
export async function getAiSuggestQuotaStatus(shopId: string): Promise<AiQuotaStatus> {
  const isPaidPlan = await isOwnerPaidPlan(shopId)
  const balance = await getBalance(shopId)

  if (isPaidPlan) {
    return {
      isPaidPlan: true,
      freeLimit: AI_SUGGEST_FREE_DAILY_LIMIT,
      usedToday: null,
      freeRemaining: null,
      canUseCredit: false,
      priceBaht: AI_SUGGEST_EXTRA_USE_PRICE_BAHT,
      balance,
    }
  }

  const usedToday = await getUsedTodayCount(shopId)
  const freeRemaining = Math.max(0, AI_SUGGEST_FREE_DAILY_LIMIT - usedToday)
  return {
    isPaidPlan: false,
    freeLimit: AI_SUGGEST_FREE_DAILY_LIMIT,
    usedToday,
    freeRemaining,
    canUseCredit: balance >= AI_SUGGEST_EXTRA_USE_PRICE_BAHT,
    priceBaht: AI_SUGGEST_EXTRA_USE_PRICE_BAHT,
    balance,
  }
}

/**
 * claimFreeUsageOrFail — atomic conditional claim free slot ของวันนี้ (FR-AIQ-07/NFR-AIQ-Concurrency)
 * เรียกเฉพาะเมื่อ isOwnerPaidPlan=false เท่านั้น (unlimited path ไม่มี shared state ให้แข่ง)
 *
 * ทำไม atomic conditional updateMany ไม่ใช่ read-then-write (มิเรอร์ deductCredit ใน wallet.service.ts):
 * ถ้า read count ก่อนแล้ว increment ทีหลัง (2 query) — 2 request concurrent อ่าน count เดิม (เช่น 9)
 * พร้อมกัน → ทั้งคู่ผ่าน check < 10 → increment ทั้งคู่ → count กลายเป็น 11 (เกินโควตา, E5 fail)
 * conditional WHERE count < LIMIT ทำ atomic ใน DB เดียว: คนแรกชนะ count(matched)=1, คนที่สอง WHERE
 * ไม่ตรง (count ถูกอัปเดตเป็น 10 ไปแล้ว) → count(matched)=0 → claim ไม่สำเร็จ
 *
 * แยก 2 กรณีที่ claim ไม่สำเร็จรอบแรก: "ยังไม่มีแถวของวันนี้" (E8, lazy-create) vs "เต็มโควตาแล้ว" —
 * กัน race ตอน create ด้วย unique(shopId,date): ถ้าอีก request ชนะสร้างแถวไปก่อน (P2002) ให้ retry
 * claim ผ่าน updateMany เดิม (แถวมีอยู่แล้วตอนนี้)
 *
 * @returns true = claim สำเร็จ (ยังอยู่ในโควตาฟรี), false = เต็มโควตาแล้ว (count >= LIMIT)
 */
export async function claimFreeUsageOrFail(shopId: string): Promise<boolean> {
  const date = todayThaiIsoDate()

  const claimed = await prisma.aiSuggestDailyUsage.updateMany({
    where: { shopId, date, count: { lt: AI_SUGGEST_FREE_DAILY_LIMIT } },
    data: { count: { increment: 1 } },
  })
  if (claimed.count > 0) return true

  // ไม่ได้ claim — เช็คว่ามีแถวของวันนี้อยู่แล้วไหม (แยก "เต็มโควตา" กับ "ยังไม่เคยมีแถว")
  const existing = await prisma.aiSuggestDailyUsage.findUnique({
    where: { shopId_date: { shopId, date } },
    select: { id: true },
  })
  if (existing) return false // มีแถวแล้ว แต่ updateMany ไม่ผ่าน = เต็มโควตาจริง (count >= LIMIT)

  // ยังไม่เคยมีแถวของวันนี้เลย (ใช้ครั้งแรกของวัน, E8) → lazy-create count=1
  try {
    await prisma.aiSuggestDailyUsage.create({ data: { shopId, date, count: 1 } })
    return true
  } catch (e) {
    // race: อีก request ใช้ครั้งแรกของวันพร้อมกัน ชนะสร้างแถวไปก่อน (unique constraint) → retry claim
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const retry = await prisma.aiSuggestDailyUsage.updateMany({
        where: { shopId, date, count: { lt: AI_SUGGEST_FREE_DAILY_LIMIT } },
        data: { count: { increment: 1 } },
      })
      return retry.count > 0
    }
    throw e
  }
}

/**
 * refundFreeUsage — คืนโควตาฟรีที่ใช้ไป (BR-AIQ-06/07, free path เท่านั้น) เมื่อ Gemini ล้มเหลวจริง
 * atomic decrement + guard count > 0 กัน DB CHECK(count >= 0) — idempotent-safe (ถ้าเรียกซ้ำ/count=0 อยู่แล้ว
 * เป็น no-op เงียบ ๆ ไม่ throw เพราะ refund ควรเป็น best-effort compensate ไม่ใช่จุดที่ทำให้ error response พัง)
 */
export async function refundFreeUsage(shopId: string): Promise<void> {
  const date = todayThaiIsoDate()
  await prisma.aiSuggestDailyUsage.updateMany({
    where: { shopId, date, count: { gt: 0 } },
    data: { count: { decrement: 1 } },
  })
}

/**
 * getFreeRemainingAfterClaim — freeRemaining สำหรับ response ของ POST ai-suggest หลัง claim free path
 * สำเร็จ (API Contract §"Response 200 (ขยาย)") — ไม่ได้อยู่ใน locked contract แต่จำเป็นเพราะ
 * claimFreeUsageOrFail คืนแค่ boolean (ตามสัญญา) ไม่คืน count ที่อัปเดตแล้ว
 */
export async function getFreeRemainingAfterClaim(shopId: string): Promise<number> {
  const usedToday = await getUsedTodayCount(shopId)
  return Math.max(0, AI_SUGGEST_FREE_DAILY_LIMIT - usedToday)
}

/**
 * logUsageEvent — audit log ai-suggest ที่ผ่าน gate สำเร็จ (ทั้ง 3 path) — NFR-AIQ-Obs
 * [สำคัญ] best-effort เสมอ: ห้าม error จากตัวนี้ทำให้ request หลัก (ที่ผู้ใช้รอ suggestions อยู่) พัง —
 * ต่างจากฟังก์ชันอื่นในไฟล์นี้ที่ fail-closed เพราะนี่เป็นแค่ audit trail ไม่ใช่ gate logic
 */
export async function logUsageEvent(input: {
  shopId: string
  conversationId: string
  kind: 'FREE' | 'CREDIT' | 'UNLIMITED_PLAN'
  amountBaht?: number
}): Promise<void> {
  try {
    await prisma.aiSuggestUsageEvent.create({
      data: {
        shopId: input.shopId,
        conversationId: input.conversationId,
        kind: input.kind,
        amountBaht: input.amountBaht ?? 0,
        status: 'SUCCESS',
        businessDay: todayThaiIsoDate(),
      },
    })
  } catch (e) {
    console.error('[ai-suggest-quota] logUsageEvent failed (best-effort, ignored)', e instanceof Error ? e.message : e)
  }
}

/**
 * refundUsageEvent — พลิก audit log ล่าสุดของ (shopId, conversationId, kind) จาก SUCCESS → REFUNDED
 * (BR-AIQ-07) ไม่ได้อยู่ใน locked contract — ส่วนเสริมให้ AiSuggestUsageEvent.status สะท้อนความจริง
 * สำหรับ admin cost dashboard ในอนาคต (Deferred) เรียกคู่กับ refundFreeUsage/creditWallet-compensate เสมอ
 * best-effort เช่นเดียวกับ logUsageEvent — ห้ามทำให้ error response หลักพัง
 */
export async function refundUsageEvent(
  shopId: string,
  conversationId: string,
  kind: 'FREE' | 'CREDIT',
): Promise<void> {
  try {
    const latest = await prisma.aiSuggestUsageEvent.findFirst({
      where: { shopId, conversationId, kind, status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (latest) {
      await prisma.aiSuggestUsageEvent.update({ where: { id: latest.id }, data: { status: 'REFUNDED' } })
    }
  } catch (e) {
    console.error('[ai-suggest-quota] refundUsageEvent failed (best-effort, ignored)', e instanceof Error ? e.message : e)
  }
}
