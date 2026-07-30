import { prisma } from '@/lib/prisma'
import { getWindowState, sendOutboundMessage } from '@/services/channel-chat.service'

/**
 * auto-reply-send.service — จุดเดียวที่ระบบตอบอัตโนมัติส่งข้อความออก (feature 00023, S-06)
 *
 * SSOT: docs/20 - Features/00023 - Chat Auto-Reply/SDS.md {TD-005 system actor, TD-006 กัน echo}
 *
 * WARNING: reviewer มี grep gate ว่า call-site ของ `sendAutoReply` ต้องมีที่เดียว — ถ้ามีที่อื่น
 * ยิง `sendOutboundMessage` ด้วย `autoReplyKind` เองเมื่อไหร่ การกันตอบซ้ำ/การนับ/การติดป้าย
 * จะกระจายจนตรวจไม่ได้ว่าครบหรือไม่
 */

/** ผลของการพยายามส่ง — caller (processor) เอาไปตัดสินว่าจะเขียน log แบบไหน */
export type SendAutoReplyResult =
  | { sent: true; messageId: string; attempts: number }
  | { sent: false; reason: SendSkipReason; error?: string; attempts: number }

export type SendSkipReason =
  | 'WINDOW_CLOSED'
  | 'CHANNEL_INACTIVE'
  | 'PAUSED_HUMAN_TAKEOVER'
  | 'HANDED_OFF'
  | 'SPAM'
  | 'CONVERSATION_NOT_FOUND'
  | 'SEND_FAILED'

/**
 * ลองซ้ำในตัวเอง 3 ครั้ง backoff 1s -> 2s -> 4s (SDS TD-001 ชั้นที่ 2)
 *
 * WARNING: ห้ามเปลี่ยนเป็น "โยนงานกลับไปให้ sweeper ลองใหม่" — cron ของโปรเจกต์นี้เป็น **รายวัน**
 * (ผู้ใช้ตัดสินแล้วว่าไม่อัป plan) การโยนไป sweeper = ลูกค้ารอคำตอบข้ามวัน ซึ่งเท่ากับไม่ได้คำตอบ
 * ความล้มเหลวส่วนใหญ่เป็นแบบชั่วคราว (เน็ตกระตุก/Meta ตอบช้า) และจบที่ชั้นนี้
 */
const MAX_ATTEMPTS = 3
const BACKOFF_MS = [1000, 2000, 4000]

/** แยกออกมาเพื่อให้ test แทนที่ได้ ไม่ต้องรอจริง 7 วินาที */
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type SendAutoReplyParams = {
  conversationId: string
  /**
   * shopId ที่ผู้เรียกเชื่อว่าเป็นเจ้าของเธรดนี้ — มาจาก `AutoReplyJob.shopId` ซึ่งถูกเขียนตอน
   * ingest webhook ฝั่ง server เท่านั้น ไม่เคยมาจาก client
   * ส่งต่อให้ `sendOutboundMessage` cross-check กับเธรดจริง (TD-005)
   */
  shopId: string
  text: string
  /** true = อยู่ในโหมดทดสอบ -> ติดป้าย AUTO_TEST แทน AUTO */
  isTest: boolean
}

/**
 * sendAutoReply — ตรวจเงื่อนไขทั้งหมดแล้วส่ง พร้อมติดป้ายว่าระบบเป็นผู้ส่ง
 *
 * ลำดับการตรวจ: เธรดมีจริง -> ไม่ใช่สแปม -> ไม่ถูกส่งต่อ -> ไม่ถูกหยุด -> หน้าต่าง 24 ชม.
 * -> channel ยัง ACTIVE -> ค่อยยิง
 */
export async function sendAutoReply(params: SendAutoReplyParams): Promise<SendAutoReplyResult> {
  const conversation = await prisma.conversation.findFirst({
    // shopId ใน where ไม่ใช่เช็คทีหลัง — กันยิงข้ามร้านตั้งแต่ชั้น query
    where: { id: params.conversationId, shopId: params.shopId },
    select: {
      id: true,
      isSpam: true,
      handoffAt: true,
      autoReplyPausedUntil: true,
      lastInboundAt: true,
      shopChannel: { select: { status: true } },
    },
  })

  if (!conversation) return { sent: false, reason: 'CONVERSATION_NOT_FOUND', attempts: 0 }
  if (conversation.isSpam) return { sent: false, reason: 'SPAM', attempts: 0 }
  if (conversation.handoffAt) return { sent: false, reason: 'HANDED_OFF', attempts: 0 }

  // WARNING (TD-006 ชั้นที่สำคัญที่สุด): ตัดสิน "พนักงานเข้ามาตอบแล้วหรือยัง" จากค่าที่ **ถูกเขียนไว้**
  // ที่ autoReplyPausedUntil เท่านั้น
  //
  // ห้ามเปลี่ยนไปสแกนหาข้อความ SHOP ล่าสุดแล้วอนุมานเอาเด็ดขาด — เพราะ echo ของคำตอบที่บอทเพิ่ง
  // ส่งเองจะถูก ingest เขียนลง DB ด้วย autoReplyKind = null ชั่วขณะ (ก่อนที่ sendOutboundMessage
  // จะ UPDATE ติดป้ายทัน) การสแกนในหน้าต่างเวลานั้นจะอ่านคำตอบของบอทเองเป็น "พนักงานตอบ"
  // แล้วระบบจะหยุดตัวเองถาวร โดยอาการดูเหมือนบั๊ก cooldown ทุกประการ
  if (conversation.autoReplyPausedUntil && conversation.autoReplyPausedUntil > new Date()) {
    return { sent: false, reason: 'PAUSED_HUMAN_TAKEOVER', attempts: 0 }
  }

  // ในทางปฏิบัติหน้าต่างเปิดเสมอบนเส้นทางนี้ (ingest เซ็ต lastInboundAt ในทรานแซกชันเดียวกับที่
  // เขียนข้อความที่ trigger งานนี้) — ตรวจไว้เป็นชั้นสุดท้าย ถ้าเข้าเงื่อนไขเมื่อไหร่แปลว่ามีบั๊ก
  // ที่อื่น ควรเห็นในบันทึกเป็น anomaly ไม่ใช่เรื่องปกติ
  if (!getWindowState(conversation.lastInboundAt).open) {
    return { sent: false, reason: 'WINDOW_CLOSED', attempts: 0 }
  }

  if (conversation.shopChannel?.status !== 'ACTIVE') {
    return { sent: false, reason: 'CHANNEL_INACTIVE', attempts: 0 }
  }

  const autoReplyKind = params.isTest ? 'AUTO_TEST' : 'AUTO'
  let lastError = ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const message = await sendOutboundMessage({
        conversationId: conversation.id,
        actorUserId: null,
        systemShopId: params.shopId,
        text: params.text,
        autoReplyKind,
      })
      return { sent: true, messageId: message.id, attempts: attempt }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)

      // ความล้มเหลวที่ลองใหม่ไปก็เหมือนเดิม — ออกทันที ไม่เสียเวลา backoff
      if (
        lastError.includes('FORBIDDEN') ||
        lastError.includes('INVALID_ACTOR') ||
        lastError.includes('NOT_EXTERNAL_CHANNEL') ||
        lastError.includes('CONVERSATION_NOT_FOUND')
      ) {
        return { sent: false, reason: 'SEND_FAILED', error: lastError, attempts: attempt }
      }

      if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS[attempt - 1]!)
    }
  }

  return { sent: false, reason: 'SEND_FAILED', error: lastError, attempts: MAX_ATTEMPTS }
}
