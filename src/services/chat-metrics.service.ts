import { prisma } from '@/lib/prisma'
import type { SenderRole } from '@/services/chat.service'

// Response-rate / Response-time trust metric (feature 00011 ext #2 — response-rate-metric.md)
// BR-RESP-01: ผูก Shop (business = ต่อร้าน) · BR-RESP-02: buyer-initiate เสมอ → ข้อความแรกของทุก
// conversation = BUYER โดย design (ดู DATABASE.md/schema comment ChatMessage.senderRole)

export const CHAT_METRICS_WINDOW_DAYS = 90 // BR-RESP-04
export const CHAT_METRICS_MIN_SAMPLE_SIZE = 3 // FR-RESP-04 sample-size gate (เหมือน showRating)

export interface ChatMetricsResult {
  sampleSize: number
  answeredCount: number
  // null เมื่อ sampleSize=0 (หารไม่ได้ — FR-RESP-05 ร้านไม่มี conversation)
  responseRate: number | null
  // null เมื่อ answeredCount=0 (ไม่มี conv ไหนถูกตอบเลย)
  medianResponseSec: number | null
}

/**
 * computeShopChatMetrics — คำนวณ response-rate/response-time ของร้านจาก Conversation/ChatMessage จริง
 * (S-23, FR-RESP-01..03)
 *
 * ขั้นตอน:
 * 1. หา conversation ของ shop ที่มีข้อความ BUYER อย่างน้อย 1 ข้อความใน rolling window (createdAt >= now-windowDays)
 *    → sampleSize = จำนวน conversation ที่เข้าเงื่อนไข (FR-RESP-01)
 * 2. ต่อ conversation ที่เข้าเงื่อนไข: ดึงประวัติข้อความ "ทั้งหมด" (ไม่จำกัดแค่ในหน้าต่าง — เพราะ
 *    conversation ที่คุยมานานแล้วแต่ buyer เพิ่งทักใน window ยังต้องนับ "ข้อความแรกจริง" ของ conv นั้น
 *    ไม่ใช่ข้อความแรกภายใน window) แล้วหา first message (เสมอเป็น BUYER ตาม BR-RESP-02) +
 *    first SHOP reply ที่ createdAt > first message นั้น
 * 3. answeredCount = จำนวน conv ที่มี SHOP reply แบบนั้น; responseRate = answeredCount/sampleSize*100 (ปัดเต็ม)
 * 4. medianResponseSec = median(shopReplyAt - buyerFirstAt) หน่วยวินาที เฉพาะ conv ที่ตอบแล้ว
 *
 * เลี่ยง N+1: query ChatMessage ของ shop ทั้งหมด (ที่เกี่ยวข้อง) 2 รอบ (หา qualifying id + ดึง full history)
 * แทนที่จะ query ต่อ conversation — เพียงพอสำหรับ cron batch รายวัน (ไม่ใช่ hot path หน้า public profile)
 */
export async function computeShopChatMetrics(
  shopId: string,
  windowDays: number = CHAT_METRICS_WINDOW_DAYS,
): Promise<ChatMetricsResult> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

  // Step 1: conversation ของ shop ที่มีข้อความ BUYER ใน window อย่างน้อย 1 ข้อความ (FR-RESP-01)
  const recentBuyerMessages = await prisma.chatMessage.findMany({
    where: {
      senderRole: 'BUYER' satisfies SenderRole,
      createdAt: { gte: windowStart },
      conversation: { shopId },
    },
    select: { conversationId: true },
    distinct: ['conversationId'],
  })

  const qualifyingConversationIds = recentBuyerMessages.map((m) => m.conversationId)
  const sampleSize = qualifyingConversationIds.length

  if (sampleSize === 0) {
    // FR-RESP-05: ร้านไม่มี conversation (หรือไม่มี buyer message ใน window) → sample=0, ไม่ error
    return { sampleSize: 0, answeredCount: 0, responseRate: null, medianResponseSec: null }
  }

  // Step 2: ดึงประวัติข้อความ "ทั้งหมด" ของ conversation ที่เข้าเงื่อนไข (ไม่จำกัดช่วงเวลา — ต้องการ
  // ข้อความแรกจริงของ conv เพื่อวัด response time แม้ conv จะเก่ากว่า window)
  const allMessages = await prisma.chatMessage.findMany({
    where: { conversationId: { in: qualifyingConversationIds } },
    select: { conversationId: true, senderRole: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  // group ใน JS ต่อ conversationId (เรียง createdAt asc มาแล้วจาก query)
  const messagesByConversation = new Map<
    string,
    { conversationId: string; senderRole: string; createdAt: Date }[]
  >()
  for (const msg of allMessages) {
    const bucket = messagesByConversation.get(msg.conversationId)
    if (bucket) bucket.push(msg)
    else messagesByConversation.set(msg.conversationId, [msg])
  }

  const responseSecondsAnswered: number[] = []
  let answeredCount = 0

  for (const conversationId of qualifyingConversationIds) {
    const msgs = messagesByConversation.get(conversationId)
    if (!msgs || msgs.length === 0) continue // ไม่ควรเกิด (มี buyer msg ก็ต้องมีอย่างน้อย 1) แต่กันไว้

    // ข้อความแรกของ conversation = BUYER เสมอโดย design (BR-RESP-02) — ใช้ msgs[0] ตรง ๆ
    const firstMessage = msgs[0]
    const firstReply = msgs.find(
      (m) => m.senderRole === ('SHOP' satisfies SenderRole) && m.createdAt > firstMessage.createdAt,
    )

    if (firstReply) {
      answeredCount += 1
      const diffSec = Math.round((firstReply.createdAt.getTime() - firstMessage.createdAt.getTime()) / 1000)
      responseSecondsAnswered.push(diffSec)
    }
  }

  const responseRate = Math.round((answeredCount / sampleSize) * 100) // FR-RESP-02
  const medianResponseSec =
    responseSecondsAnswered.length > 0 ? median(responseSecondsAnswered) : null // FR-RESP-03

  return { sampleSize, answeredCount, responseRate, medianResponseSec }
}

// median ของ array ตัวเลข — เรียงก่อนคำนวณ; คู่ = เฉลี่ย 2 ตัวกลาง (ปัดเต็มวินาที)
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }
  return sorted[mid]
}

/**
 * applyShopChatMetrics — compute แล้วเขียนลง Shop 4 field (S-23) ให้ cron (S-24) เรียกต่อร้าน
 * FR-RESP-04 sample-size gate ≥3: ถ้า sampleSize ไม่ถึงเกณฑ์ → เขียน responseRate/medianResponseSec
 * เป็น null (ซ่อน section ฝั่ง UI) แต่ยังเขียน sampleSize จริง (debug/observability) เสมอ
 */
export async function applyShopChatMetrics(
  shopId: string,
  windowDays: number = CHAT_METRICS_WINDOW_DAYS,
): Promise<ChatMetricsResult> {
  const metrics = await computeShopChatMetrics(shopId, windowDays)
  const passesGate = metrics.sampleSize >= CHAT_METRICS_MIN_SAMPLE_SIZE

  await prisma.shop.update({
    where: { id: shopId },
    data: {
      chatResponseRate: passesGate ? metrics.responseRate : null,
      chatResponseSampleSize: metrics.sampleSize,
      chatMedianResponseSec: passesGate ? metrics.medianResponseSec : null,
      chatMetricsUpdatedAt: new Date(),
    },
  })

  return metrics
}
