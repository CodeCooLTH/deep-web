import { prisma } from '@/lib/prisma'
import { getConfig } from '@/services/auto-reply-config.service'

/**
 * auto-reply-takeover — "พนักงานเข้ามาตอบเอง แล้วบอทต้องหลบ"
 *
 * WARNING (บั๊กจริงที่ user เจอ 2026-07-31): กลไกนี้ถูกออกแบบไว้ตั้งแต่แรกและมีครบทุกอย่าง
 * **ยกเว้นคนเขียนค่า** — `AutoReplyConfig.humanTakeoverPauseMode` ถูกเก็บ/อ่านเข้า config,
 * `Conversation.autoReplyPausedUntil` มี gate อ่านที่ auto-reply.service.ts:263 และ
 * auto-reply-send.service.ts:85, มี skipReason `PAUSED_HUMAN_TAKEOVER`, มี test คลุมทั้งสองไฟล์
 * แต่ไม่มีโค้ดบรรทัดไหนในระบบเซ็ต `autoReplyPausedUntil` เป็นเวลาอนาคตเลยสักที่ (มีแต่เซ็ต null)
 *
 * ผลคือพนักงานตามเข้าไปคุยกับลูกค้าเอง แล้วบอทยังตอบแทรกอยู่ — ไฟล์นี้คือชิ้นที่หายไป
 *
 * เรียกจากทุกเส้นทางที่ "คน" ส่งข้อความออกในนามร้าน:
 *   - chat.service.ts sendMessage      (แชทในแอป DEEP)
 *   - channel-chat.service.ts sendOutboundMessage (Messenger/IG/LINE/TikTok)
 * ห้ามเรียกเมื่อ `autoReplyKind` มีค่า — นั่นคือบอทส่งเอง ไม่ใช่คน
 */

/** ระยะเวลาหยุดของโหมดที่วัดเป็นเวลา — โหมดอื่นหยุดแบบไม่มีกำหนด (ดู resolveTakeover) */
const PAUSE_MS_BY_MODE: Record<string, number> = {
  '30M': 30 * 60 * 1000,
  '2H': 2 * 60 * 60 * 1000,
}

/**
 * โหมดที่หยุด "ไม่มีกำหนด" ใช้ `handoffAt` แทน `autoReplyPausedUntil`
 *
 * เหตุผล: `autoReplyPausedUntil` เป็น DateTime อย่างเดียว แทนสถานะ "หยุดจนกว่าจะสั่ง" ไม่ได้
 * (คำถามที่ค้างไว้ตั้งแต่ TestCase.md Q10 และเป็นสาเหตุที่ฟีเจอร์นี้ไม่เคยถูกเขียนจนจบ)
 * `handoffAt` มีความหมายตรงตัวอยู่แล้วว่า "ส่งต่อให้คนดูแลแล้ว" — เหมือนที่
 * MAX_REPLIES_REACHED ใช้ — และ API `clearHandoff` สำหรับคืนเธรดให้ระบบก็มีอยู่แล้ว
 * จึงไม่ต้องเพิ่มคอลัมน์ใหม่บน DB ที่แชร์กับ prod
 */
export const HANDOFF_REASON_HUMAN = 'HUMAN_TAKEOVER'
export const HANDOFF_REASON_HUMAN_UNTIL_RESOLVED = 'HUMAN_TAKEOVER_UNTIL_RESOLVED'

/**
 * พนักงานส่งข้อความเองในเธรดนี้ → หยุดบอทตามโหมดที่ร้านตั้งไว้
 *
 * ห้าม throw ออกไปเด็ดขาด: ฟังก์ชันนี้ถูกเรียกหลังข้อความ "ส่งถึงลูกค้าไปแล้ว" การพังตรงนี้
 * ต้องไม่ทำให้ทั้ง request ล้มจนหน้าจอขึ้น error ทั้งที่ข้อความส่งสำเร็จ (แบบเดียวกับ TD-008)
 */
export async function pauseForHumanTakeover(conversationId: string, knownShopId?: string): Promise<void> {
  try {
    // caller ที่ถือ shopId อยู่แล้วส่งมาได้ (ประหยัด 1 query); caller ที่อยู่หลัง $transaction
    // แล้วเหลือแค่ conversationId ปล่อยว่างได้ — ไม่บังคับให้ต้องขุด shopId ออกมาส่ง
    const shopId =
      knownShopId ??
      (await prisma.conversation.findUnique({ where: { id: conversationId }, select: { shopId: true } }))?.shopId
    if (!shopId) return

    const config = await getConfig(shopId)
    const mode = config.humanTakeoverPauseMode

    const pauseMs = PAUSE_MS_BY_MODE[mode]
    if (pauseMs !== undefined) {
      // ทับค่าเดิมเสมอ (ไม่ใช่ต่อเวลาจากของเดิม) — พนักงานตอบครั้งล่าสุดเมื่อไหร่
      // คือจุดตั้งต้นที่ถูกต้อง ไม่ใช่ครั้งแรกที่เคยตอบ
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { autoReplyPausedUntil: new Date(Date.now() + pauseMs) },
      })
      return
    }

    if (mode === 'MANUAL' || mode === 'UNTIL_RESOLVED') {
      // ไม่ทับ handoff ที่มีอยู่แล้ว — ถ้าเธรดถูกส่งต่อด้วยเหตุอื่น (เช่น MAX_REPLIES_REACHED)
      // เหตุผลเดิมมีค่าในการ debug มากกว่า และผลลัพธ์ที่ผู้ใช้เห็นเหมือนกันทุกประการ
      await prisma.conversation.updateMany({
        where: { id: conversationId, handoffAt: null },
        data: {
          handoffAt: new Date(),
          handoffReason: mode === 'MANUAL' ? HANDOFF_REASON_HUMAN : HANDOFF_REASON_HUMAN_UNTIL_RESOLVED,
        },
      })
    }
  } catch (e) {
    console.error('[auto-reply-takeover] pause ล้มเหลว', { conversationId, error: e })
  }
}

/**
 * ร้านกดปิดงานเธรด (resolve) → คืนเธรดให้ระบบดูแลต่อ เฉพาะที่หยุดด้วยโหมด UNTIL_RESOLVED
 *
 * เงื่อนไข `handoffReason` แคบไว้ตั้งใจ: เธรดที่ถูกล็อกด้วยเหตุอื่น (พนักงานกดรับช่วงเอง,
 * ตอบครบเพดาน, ส่งไม่สำเร็จ) ต้องไม่ถูกปลดโดยบังเอิญจากการกดปิดงาน
 */
export async function clearTakeoverOnResolve(conversationId: string, shopId: string): Promise<void> {
  try {
    await prisma.conversation.updateMany({
      where: { id: conversationId, shopId, handoffReason: HANDOFF_REASON_HUMAN_UNTIL_RESOLVED },
      data: { handoffAt: null, handoffReason: null },
    })
  } catch (e) {
    console.error('[auto-reply-takeover] clear ล้มเหลว', { conversationId, shopId, error: e })
  }
}
