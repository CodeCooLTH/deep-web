/**
 * auto-order-internal-message.service — เขียน "การ์ดผลลัพธ์" ลงเธรดแชท (00061 · TFR-020)
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * 🛑 ไฟล์นี้ import แค่ 2 อย่าง: `prisma` กับค่าคงที่ที่ไม่มี runtime behavior
 *
 * เจตนาไม่ใช่ "ห้าม import ทุกอย่าง" แต่คือ **ห้ามแตะสิ่งที่มี runtime behavior ของ
 * `sendMessage()` / `sendOutboundMessage()` / `detectAutoOrderTrigger()`** เพราะการ์ดนี้เป็น
 * ข้อความภายในที่ลูกค้าต้องไม่เห็นและต้องไม่ไปกระตุ้นอะไรทั้งสิ้น:
 *
 *   - ไม่ส่งออกช่องทางภายนอก (ลูกค้าจะได้รับข้อความที่ไม่ได้ตั้งใจส่ง)
 *   - ไม่สั่งบอทอัตโนมัติของห้องหยุด (`pauseForHumanTakeover` อยู่ *ข้างใน* sendMessage)
 *   - ไม่เข้าคิว auto-reply · ไม่เพิ่มตัวนับ unread
 *   - ไม่กลายเป็นจุดเข้าที่ 3 ของตัวดักจับ (วงจรป้อนกลับ — TFR-021)
 *
 * ผลทั้งหมดนี้ **ได้มาจากการไม่มีสายให้ตัด ไม่ใช่จากการเขียน if กันไว้** — และ `tsc` เป็นด่าน
 * ที่บังคับมันจริง เพราะ `sendMessage()` รับ `SendableMessageType` ซึ่งไม่มีค่านี้อยู่
 * ═════════════════════════════════════════════════════════════════════════════
 */
import 'server-only'

import { prisma } from '@/lib/prisma'
import { AUTO_ORDER_RESULT_TYPE } from '@/lib/auto-order-message-type'

/**
 * ชนิดของการ์ด — บอกว่าใบนี้กำลัง *พูดเรื่องอะไร*
 *
 * สถานะของตัวออเดอร์เอง (กำลังอ่าน / สร้างสำเร็จ / ตกร่าง) **อ่านสดจากแถว `Order` ที่ join มา
 * เสมอ ไม่ snapshot ลงคอลัมน์** — ธงที่เก็บแยกจะค้างทันทีที่มีทางเข้าใหม่ที่ลืมอัปเดต
 * (`docs/conventions/stored-flag-vs-owner-truth.md`) ⇒ การ์ด `RESULT` ใบเดียวเปลี่ยนหน้าตา
 * จาก "กำลังอ่าน" เป็น "สร้างแล้ว/ตกร่าง" ได้เองโดยไม่ต้องเขียนแถวใหม่
 */
export type AutoOrderCardKind = 'RESULT' | 'SOURCE_EDITED' | 'SOURCE_UNSENT'

/**
 * เขียนการ์ดลงเธรด — insert ตรง ไม่ผ่านเส้นทางส่งข้อความใด ๆ
 *
 * 🛑 **ไม่แตะ `Conversation.lastMessageAt` / preview / `lastSenderRole` เลย** (AC-ACO-61)
 * การ์ดนี้เป็นเนื้อหารองที่เห็นได้จากในเธรด ไม่ใช่เหตุการณ์ระดับ "มีคนคุยใหม่" —
 * ดันห้องขึ้นบนสุดของ inbox เพราะ background job ทำงานเสร็จ = รายการแชทกระโดดโดยไม่มีใคร
 * พิมพ์อะไรใหม่จริง ๆ
 *
 * 🛑 `body` เป็น `null` เสมอ — เนื้อหาทั้งหมดของการ์ด derive จากแถว `Order` ตอนแสดงผล
 * ถ้าเขียนข้อความสรุปลง `body` มันจะกลายเป็นสำเนาที่ค้างทันทีที่ออเดอร์ถูกแก้
 *
 * @param orderId `null` ได้ — การ์ด "กำลังอ่าน" ถูกเขียนก่อนที่จะรู้ผลลัพธ์ (TFR-005 ขั้น 6)
 *                แล้วค่อย update ทีหลัง
 */
export async function writeAutoOrderResultMessage(params: {
  conversationId: string
  orderId: string | null
  kind: AutoOrderCardKind
}) {
  return prisma.chatMessage.create({
    data: {
      conversationId: params.conversationId,
      senderRole: 'SHOP',
      type: AUTO_ORDER_RESULT_TYPE,
      autoOrderId: params.orderId,
      autoOrderKind: params.kind,
      body: null,
      imageUrl: null,
    },
    select: { id: true },
  })
}

/**
 * ผูกการ์ดที่เขียนไว้ล่วงหน้าเข้ากับออเดอร์ที่เพิ่งเกิด
 *
 * แยกจากการเขียนเพราะการ์ด "กำลังอ่าน" ต้องขึ้นจอ **ก่อน** ที่จะรู้ผล — ถ้ารอให้รู้ผลก่อน
 * แล้วค่อยเขียน ผู้ขายจะเห็นความเงียบตลอดช่วงที่ระบบกำลังทำงาน ซึ่งอ่านเป็น "มันไม่ทำงาน"
 */
export async function attachAutoOrderToCard(chatMessageId: string, orderId: string) {
  await prisma.chatMessage.update({
    where: { id: chatMessageId },
    data: { autoOrderId: orderId },
  })
}

/**
 * หาการ์ดกำพร้า (เขียนไว้แล้วแต่ไม่เคยถูกผูกกับออเดอร์) ในห้องเดียวกันหลังเวลาที่กำหนด
 *
 * ⚠️ **heuristic ไม่ perfect และรู้ตัว** — ถ้าห้องเดียวกันมี ≥2 ข้อความค้างพร้อมกัน อาจจับคู่
 * ผิดใบ. ยอมรับเป็นความเสี่ยงขอบของ v1 เพราะทางเลือกคือเก็บ `chatMessageId` ต้นทางลงการ์ด
 * ซึ่งต้องเพิ่มคอลัมน์ที่ 3 บนตารางที่ใหญ่ที่สุดของระบบเพื่อกันเคสที่เกิดยาก
 */
export async function findOrphanAutoOrderCard(conversationId: string, after: Date) {
  return prisma.chatMessage.findFirst({
    where: {
      conversationId,
      type: AUTO_ORDER_RESULT_TYPE,
      autoOrderId: null,
      createdAt: { gte: after },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
}
