// feature 00023 Deep Chat-Bot Assistant — phase `00023-ai-enhance` A-06 + A-07
// SSOT: docs/scope/2026-08-01-00023-ai-enhance-scope-baseline.md
//       + PRD.md §3.9 BR-AR-35/36 · BRD.md §2.8 FR-028
//
// เพดานค่าใช้จ่ายต่อวัน + การหักเงินตามต้นทุน token จริง
//
// WARNING: ทุกฟังก์ชันในไฟล์นี้อยู่ในเส้นทางที่ลูกค้ารอคำตอบอยู่ — **ห้าม throw**
// ความล้มเหลวของการคิดเงินต้องไม่ทำให้ลูกค้าไม่ได้คำตอบ (บันทึกพลาดเสียหายน้อยกว่าตอบไม่ได้)

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { todayThaiIsoDate } from '@/lib/date-range'
import { computeUsageCost, type TokenUsage } from '@/lib/ai-pricing'
import { isOwnerPaidPlan } from '@/services/ai-suggest-quota.service'
import { deductCredit } from '@/services/wallet.service'
import {
  USD_TO_THB_RATE,
  DEFAULT_AI_DAILY_CAP_BAHT,
  AI_CAP_ALERT_RATIO,
} from '@/lib/auto-reply-constants'

/** kind ของแถวใน AiSuggestUsageEvent — แยกจากของ 00019 เพื่อรายงานต้นทุนคนละก้อนได้ */
export const AI_ENHANCE_USAGE_KIND = 'AUTO_REPLY_AI_ENHANCE'

export type CapDecision =
  | { allowed: true; unlimited: boolean; usedBaht: number; capBaht: number }
  | { allowed: false; reason: 'DAILY_CAP_REACHED' | 'INSUFFICIENT_CREDIT' }

/**
 * ตรวจก่อนเรียก AI (BR-AR-36 "ตรวจก่อนเรียก")
 *
 * ต้นทุนจริงรู้ได้ก็ต่อเมื่อ Gemini ตอบกลับมาแล้ว จึงตรวจล่วงหน้าได้แค่ระดับ gate:
 *   (ก) ร้าน Subscription -> ผ่านตลอด ไม่ตรวจอะไรเลย
 *   (ข) ยอดใช้วันนี้ยังไม่ถึงเพดาน
 *   (ค) กระเป๋าเงินยังมียอด (> 0) — ไม่ตรวจว่าพอจ่ายครั้งนี้ไหมเพราะยังไม่รู้ราคา
 *
 * ความเสี่ยง "จ่ายฟรีรอบสุดท้าย" ถูกจำกัดขนาดโดยธรรมชาติ — ต้นทุนต่อครั้งเป็นเศษสตางค์
 */
export async function checkCapBeforeCall(shopId: string): Promise<CapDecision> {
  try {
    if (await isOwnerPaidPlan(shopId)) {
      return { allowed: true, unlimited: true, usedBaht: 0, capBaht: 0 }
    }

    const [config, wallet, usedBaht] = await Promise.all([
      prisma.autoReplyConfig.findUnique({
        where: { shopId },
        select: { aiDailyCapBaht: true },
      }),
      prisma.sellerWallet.findUnique({ where: { shopId }, select: { balance: true } }),
      sumTodayBaht(shopId),
    ])

    const capBaht = config?.aiDailyCapBaht ?? DEFAULT_AI_DAILY_CAP_BAHT
    if (usedBaht >= capBaht) return { allowed: false, reason: 'DAILY_CAP_REACHED' }

    // ไม่มีกระเป๋าเลย = ยังไม่เคยเติมเงิน ถือว่ายอดเงินไม่พอ (ไม่ใช่ error)
    if (!wallet || wallet.balance <= 0) return { allowed: false, reason: 'INSUFFICIENT_CREDIT' }

    return { allowed: true, unlimited: false, usedBaht, capBaht }
  } catch (e) {
    // ตรวจไม่ได้ = ไม่กล้าใช้เงินร้าน (fail-closed ฝั่งค่าใช้จ่าย ต่างจากฝั่งตอบลูกค้า
    // ที่ fail แล้วยังส่งคำตอบดิบได้ — ตรงนี้ถ้าเดาผิดคือเงินร้านหาย)
    console.error('[ai-enhance-billing] checkCap ล้มเหลว', e)
    return { allowed: false, reason: 'INSUFFICIENT_CREDIT' }
  }
}

/** ยอดใช้ AI Enhance ของวันนี้ (บาท) — อ่านจาก costUsd ที่บันทึกไว้ทุกครั้ง */
export async function sumTodayBaht(shopId: string): Promise<number> {
  const businessDay = todayThaiIsoDate()
  const agg = await prisma.aiSuggestUsageEvent.aggregate({
    where: { shopId, businessDay, kind: AI_ENHANCE_USAGE_KIND },
    _sum: { costUsd: true },
  })
  const usd = agg._sum.costUsd ? Number(agg._sum.costUsd) : 0
  return usd * USD_TO_THB_RATE
}

export interface RecordUsageParams {
  shopId: string
  conversationId: string
  usage: TokenUsage | null
  status: 'SUCCESS' | 'FAILED'
}

/**
 * บันทึกการใช้ + สะสมเศษ + หักเงินเมื่อครบ 1 บาท (BR-AR-36)
 *
 * ทำไมสะสมแทนหักทันที: `SellerWallet.balance` เป็นจำนวนเต็มบาท และ `deductCredit` โยน
 * INVALID_AMOUNT ถ้า amount ไม่ใช่ integer บวก — แต่ต้นทุนต่อครั้งของ flash-lite เป็น
 * เศษสตางค์ ปัดขึ้น 1 บาททุกครั้งจะกลายเป็น "1 บาท/ครั้งคงที่" ซึ่ง user ปฏิเสธไปแล้ว
 *
 * WARNING: การบวกเศษกับการหักต้องอยู่ในทรานแซกชันเดียวกัน — ถ้าบวกสำเร็จแล้วหักพลาด
 * เศษจะค้างเกิน 1 บาทแล้วรอบหน้าหักสองเท่า; ถ้าหักสำเร็จแล้วลดเศษพลาด ร้านโดนหักซ้ำ
 */
export async function recordUsageAndBill(params: RecordUsageParams): Promise<void> {
  const { shopId, conversationId, usage, status } = params
  try {
    const cost = usage ? computeUsageCost(usage) : null
    const costUsd = cost ? cost.costUsd : 0
    const costBaht = costUsd * USD_TO_THB_RATE

    await prisma.aiSuggestUsageEvent.create({
      data: {
        shopId,
        conversationId,
        kind: AI_ENHANCE_USAGE_KIND,
        // amountBaht = จำนวนที่ "หักจริงจากกระเป๋า" ในครั้งนี้ ซึ่งส่วนใหญ่เป็น 0
        // เพราะยังไม่ครบ 1 บาท — ยอดจริงอ่านจาก costUsd
        amountBaht: 0,
        status,
        businessDay: todayThaiIsoDate(),
        aiModel: usage?.model ?? null,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        costUsd: cost ? new Prisma.Decimal(costUsd.toFixed(8)) : null,
      },
    })

    if (status !== 'SUCCESS' || costBaht <= 0) return
    if (await isOwnerPaidPlan(shopId)) return // Subscription ไม่หักเงิน

    await prisma.$transaction(async (tx) => {
      const wallet = await tx.sellerWallet.findUnique({
        where: { shopId },
        select: { pendingAiCostBaht: true },
      })
      if (!wallet) return

      const pending = Number(wallet.pendingAiCostBaht) + costBaht
      const whole = Math.floor(pending)

      if (whole < 1) {
        await tx.sellerWallet.update({
          where: { shopId },
          data: { pendingAiCostBaht: new Prisma.Decimal(pending.toFixed(4)) },
        })
        return
      }

      // หักจำนวนเต็ม แล้วเหลือเศษสะสมต่อ — ทั้งสองคำสั่งอยู่ใน tx เดียวกัน
      await deductCredit(
        shopId,
        whole,
        undefined,
        `ค่าเรียบเรียงคำตอบด้วย AI (${whole} บาท)`,
        'AI_ENHANCE',
        tx,
      )
      await tx.sellerWallet.update({
        where: { shopId },
        data: { pendingAiCostBaht: new Prisma.Decimal((pending - whole).toFixed(4)) },
      })
    })
  } catch (e) {
    // บันทึก/หักพลาด ต้องไม่ทำให้ลูกค้าไม่ได้คำตอบ — ข้อความส่งไปแล้วตอนถึงจุดนี้
    console.error('[ai-enhance-billing] บันทึก/หักเงินล้มเหลว', e)
  }
}

/**
 * ถึงเกณฑ์เตือน 80% แล้วหรือยัง — คืน true ครั้งเดียวต่อวัน (BR-AR-35)
 *
 * ใช้ `aiCapAlertedDay` เป็นตัวกันเตือนซ้ำ: เก็บเป็น "วัน" ไม่ใช่ boolean เพื่อให้รีเซ็ตเอง
 * เมื่อขึ้นวันใหม่โดยไม่ต้องมี cron มาล้าง
 */
export async function shouldAlertCap(shopId: string, usedBaht: number, capBaht: number): Promise<boolean> {
  try {
    if (capBaht <= 0 || usedBaht < capBaht * AI_CAP_ALERT_RATIO) return false
    const today = todayThaiIsoDate()
    const { count } = await prisma.autoReplyConfig.updateMany({
      // เงื่อนไขใน WHERE ทำให้ "ใครถึงก่อนได้ไป" — สองข้อความพร้อมกันจะมีตัวเดียวที่ count=1
      where: { shopId, OR: [{ aiCapAlertedDay: null }, { aiCapAlertedDay: { not: today } }] },
      data: { aiCapAlertedDay: today },
    })
    return count === 1
  } catch (e) {
    console.error('[ai-enhance-billing] shouldAlertCap ล้มเหลว', e)
    return false
  }
}
