import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { matchesTriggerPhrase } from '@/lib/auto-order-parser'
import { DRAFT_EXPIRED_REASON } from '@/lib/cancel-reasons'
import { AUTO_ORDER_RESULT_TYPE } from '@/lib/auto-order-message-type'
import { writeProcessingFailedDraft } from '@/services/auto-order-detect.service'

export const maxDuration = 60

/**
 * GET /api/cron/auto-order-sweeper — 2 หน้าที่ในรอบเดียว (00061 · TFR-024)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🛑 นี่คือ **safety net ไม่ใช่กลไกหลัก** — และมันจำเป็นจริง ไม่ใช่ของประดับ
 *
 * ตัวดักจับถูกเรียกผ่าน `after()` ซึ่งบน serverless **ถูกฆ่าก่อนจบได้** ⇒ มีช่วงที่ข้อความ
 * ถูกบันทึกแล้วแต่ไม่มีใครแกะมัน และผู้ขายจะเห็นการ์ด "กำลังอ่าน" ค้างตลอดกาล
 *
 * **Phase 1 จับ 2 เคสที่มีอาการเหมือนกันทุกประการจากมุมนี้ด้วย query เดียว:**
 *   (ก) ตัวดักจับล้ม/ถูกฆ่ากลางทาง
 *   (ข) ข้อความที่ **ไม่เคยเดินผ่านจุดเข้าทั้งสองเลย** — `syncMissingMessagesFromMeta()`
 *       แทรกแถว `ChatMessage` ตรง ๆ ตอนมีคนเปิดเธรด ไม่ผ่าน `sendMessage` และไม่ผ่าน webhook
 *       ⇒ **ไม่ใช่ "ล้ม" แต่ "ไม่เคยเริ่ม"** ซึ่งไม่มีทางรู้ได้จากฝั่งตัวดักจับเลย
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export async function GET(request: Request) {
  // SECURITY: env ว่าง = reject ทันที ห้ามปล่อยให้เทียบกับ "Bearer undefined" แล้วผ่าน
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result: Record<string, unknown> = {}

  try {
    result.watchdog = await runWatchdog()
  } catch (e) {
    result.watchdogError = e instanceof Error ? e.message : String(e)
    console.error('[auto-order-sweeper] watchdog ล้มเหลว', result.watchdogError)
  }

  try {
    result.reaper = await runReaper()
  } catch (e) {
    result.reaperError = e instanceof Error ? e.message : String(e)
    console.error('[auto-order-sweeper] reaper ล้มเหลว', result.reaperError)
  }

  return NextResponse.json({ ok: true, ...result })
}

/** ขอบล่าง: ไม่ไล่ย้อนเกิน 30 นาที (ของเก่ากว่านั้นถือว่าเลยจุดที่ช่วยได้แล้ว) */
const LOOKBACK_MS = 30 * 60 * 1000
/**
 * ขอบบน: เว้น 2 นาทีสุดท้ายไว้
 *
 * 🛑 จำเป็น ไม่ใช่ margin เผื่อ — ข้อความที่เพิ่งเข้ามาเมื่อ 10 วินาทีก่อนอาจกำลังถูกแกะอยู่
 * ใน `after()` ณ วินาทีนี้พอดี ถ้าไม่เว้น watchdog จะเขียนร่าง `PROCESSING_FAILED` แข่งกับ
 * ตัวดักจับที่กำลังจะสำเร็จ แล้วชน UNIQUE ของ `sourceChatMessageId`
 */
const SETTLE_MS = 2 * 60 * 1000

async function runWatchdog() {
  const now = Date.now()

  // ร้านที่เปิดใช้งานจริง + ชุดวลี/เพจของแต่ละร้าน — ดึงครั้งเดียวแล้วเทียบ in-memory
  const configs = await prisma.autoOrderAgentConfig.findMany({
    where: { status: { not: 'OFFLINE' } },
    select: {
      status: true,
      phrases: { select: { normalizedPhrase: true } },
      channels: { where: { channel: { status: 'ACTIVE' } }, select: { shopChannelId: true } },
      testThreads: { select: { conversationId: true } },
    },
  })
  if (configs.length === 0) return { scanned: 0, recovered: 0 }

  const channelIds = configs.flatMap((c) => c.channels.map((ch) => ch.shopChannelId))
  if (channelIds.length === 0) return { scanned: 0, recovered: 0 }

  // ชุดวลีรวมของทุกร้านที่เปิดอยู่ — ใช้คัดหยาบก่อน แล้วค่อยยืนยันต่อร้านอีกที
  const phraseByChannel = new Map<string, string[]>()
  const testThreadsByChannel = new Map<string, Set<string> | null>()
  for (const c of configs) {
    const phrases = c.phrases.map((p) => p.normalizedPhrase)
    const testThreads = c.status === 'TEST' ? new Set(c.testThreads.map((t) => t.conversationId)) : null
    for (const ch of c.channels) {
      phraseByChannel.set(ch.shopChannelId, phrases)
      testThreadsByChannel.set(ch.shopChannelId, testThreads)
    }
  }

  const candidates = await prisma.chatMessage.findMany({
    where: {
      senderRole: 'SHOP',
      type: { not: AUTO_ORDER_RESULT_TYPE },
      createdAt: { gte: new Date(now - LOOKBACK_MS), lte: new Date(now - SETTLE_MS) },
      conversation: { shopChannelId: { in: channelIds } },
    },
    select: {
      id: true,
      body: true,
      conversationId: true,
      conversation: { select: { shopChannelId: true } },
    },
    // เพดานต่อรอบ — cron วิ่งบ่อย ของที่เหลือรอบหน้าเก็บต่อ ดีกว่ารอบเดียวหมดเวลา
    take: 200,
  })

  let recovered = 0
  for (const msg of candidates) {
    const channelId = msg.conversation.shopChannelId
    if (!channelId || !msg.body) continue
    const phrases = phraseByChannel.get(channelId)
    if (!phrases || phrases.length === 0) continue
    const testThreads = testThreadsByChannel.get(channelId)
    if (testThreads && !testThreads.has(msg.conversationId)) continue
    if (!matchesTriggerPhrase(msg.body, phrases)) continue

    // 🛑 ตัวตัดสินคือ "มีแถว Order ที่ชี้กลับมาที่ข้อความนี้หรือยัง" ไม่ใช่ธงบน ChatMessage —
    // ผลลัพธ์อยู่ที่ `Order` ซึ่งเป็นแหล่งความจริงเดียว ธงแยกจะค้างทันทีที่มีทางเข้าใหม่
    const existing = await prisma.order.findUnique({
      where: { sourceChatMessageId: msg.id },
      select: { id: true },
    })
    if (existing) continue

    await writeProcessingFailedDraft(msg.id)
    recovered += 1
  }

  return { scanned: candidates.length, recovered }
}

/**
 * Phase 2 — ร่างที่ค้างเกิน 7 วัน
 *
 * 🛑 **ไม่ลบแถวจริง** — เปลี่ยนเป็น `CANCELLED` พร้อมเหตุผลที่อ่านออก เพราะ (1) `OrderEvent`
 * และการ์ดในเธรดชี้มาที่แถวนี้ ลบแล้วจะเหลือของกำพร้า (2) ร้านที่ถามว่า "ร่างของฉันหายไปไหน"
 * ต้องมีคำตอบ ไม่ใช่ความว่างเปล่า
 *
 * 🛑 ใบทดสอบ (`isDryRun`) **ไม่ถูกกวาด** — มันไม่ได้อยู่ในสายตาใครและไม่รบกวนตัวเลขไหน
 * ปล่อยไว้เป็นหลักฐานให้ร้านย้อนดูผลทดสอบได้
 */
async function runReaper() {
  const res = await prisma.order.updateMany({
    where: { status: 'DRAFTED', isDryRun: false, expiresAt: { lte: new Date() } },
    data: {
      status: 'CANCELLED',
      cancelReason: DRAFT_EXPIRED_REASON,
      // CHECK `Order_draft_reasons_only_when_drafted` บังคับให้ว่างเมื่อไม่ใช่ DRAFTED
      draftReasons: [],
      expiresAt: null,
      // ระบบเป็นคนปิด ไม่ใช่ผู้ซื้อ — ค่านี้มีผลกับอัตราความสำเร็จ ห้ามใส่ 'buyer'
      cancelInitiator: 'seller',
    },
  })
  return { expired: res.count }
}
