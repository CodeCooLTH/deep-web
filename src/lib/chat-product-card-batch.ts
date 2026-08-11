/**
 * chat-product-card-batch — "ส่งการ์ดสินค้าหลายชิ้นได้กี่ใบต่อข้อความ และจะถูกแบ่งเป็นกี่ข้อความ"
 * ที่เดียวของระบบ (ส่วนขยาย 2026-08-11 — user สั่ง "อยากส่งหลายรายการได้")
 *
 * 🛑 ทำไมต้องเป็นไฟล์เดียว (HR16): ตัวเลขเดียวกันนี้ถูกใช้ **3 ที่ที่ต้องตรงกันเป๊ะ** —
 *   1. หน้าจอ (ป้ายบอกว่าจะแบ่งกี่ข้อความ ก่อนผู้ขายกดส่ง)
 *   2. route (ตัด array ที่รับมาเป็นชุด ๆ แล้วยิงทีละข้อความ)
 *   3. ตัวเทส
 * ถ้าหน้าจอบอก "2 ข้อความ" แล้ว server แบ่งเป็น 3 ผู้ขายจะเลิกเชื่อป้ายนั้นถาวร และไม่มี `tsc`/build
 * ตัวไหนจับได้ เพราะเลขทั้งสองฝั่ง "ถูก" ในตัวเอง
 *
 * เพดานต่อข้อความมาจากข้อจำกัดจริงของปลายทาง (ห้ามแก้จากความจำ — ยืนยันกับเอกสารแล้ว):
 *   - Messenger / Instagram: Generic Template `elements` ≤ **10** (ดู lib/meta/product-card.ts)
 *   - LINE: Flex carousel `contents` ≤ **12** (เอกสาร Messaging API)
 *   - DEEP (แชทในแอปผู้ซื้อของเราเอง): **1** — ไม่ใช่ลิมิตของ API แต่เป็นลิมิตของ *ตัวเรนเดอร์*
 *     🛑 แอปผู้ซื้อ (`(marketing)/(buyer-app)/messages/[shopId]/ChatThread.tsx`) วาดการ์ดสินค้าจาก
 *     `msg.productCard` ซึ่งเป็น **ใบเดียว** — ส่ง 5 ชิ้นเข้าเธรด DEEP แล้วตั้งเพดานเป็น 10 จะได้
 *     ข้อความเดียวที่ลูกค้าเห็นสินค้าชิ้นแรกชิ้นเดียว **อีก 4 ชิ้นหายเงียบ** ซึ่งแย่กว่าไม่มีฟีเจอร์
 *     (`docs/conventions/known-limitation-vs-unfinished.md`) — ตั้งเป็น 1 แล้วปล่อยให้กลไก
 *     "แบ่งเป็น N ข้อความ" ที่มีป้ายบอกผู้ขายอยู่แล้วทำงานแทน ลูกค้าจึงได้ครบทุกชิ้นเสมอ
 *     วันที่แอปผู้ซื้อวาด carousel ได้ ค่อยยกเลขนี้ขึ้น — แก้ที่นี่ที่เดียว
 */

import { resolveChatChannel } from '@/lib/chat-channel'

/** จำนวนการ์ดสูงสุดใน "หนึ่งข้อความ" ต่อช่องทาง */
const CARDS_PER_MESSAGE: Record<ReturnType<typeof resolveChatChannel>, number> = {
  MESSENGER: 10,
  INSTAGRAM: 10,
  LINE: 12,
  DEEP: 1,
}

/**
 * การกดส่งหนึ่งครั้งต้องไม่กลายเป็นเกิน 3 ข้อความ (user เคาะ 2026-08-11)
 *
 * 🛑 กติกาผูกกับ **จำนวนข้อความ ไม่ใช่จำนวนชิ้น** โดยตั้งใจ — สิ่งที่ลูกค้ารำคาญคือ "แจ้งเตือนเด้งรัว"
 * ไม่ใช่ "การ์ดเยอะในใบเดียว" ผูกกับจำนวนชิ้นแล้วช่องทางที่เพดานต่อข้อความต่ำ (DEEP = 1) จะยิงเป็น
 * สิบข้อความได้ทั้งที่นับชิ้นแล้วดูไม่เยอะ
 */
const MAX_MESSAGES_PER_SEND = 3

export function productCardsPerMessage(channel: string): number {
  return CARDS_PER_MESSAGE[resolveChatChannel(channel)]
}

/** เลือกได้มากสุดกี่ชิ้นต่อการส่งหนึ่งครั้ง (UI ต้องกันไม่ให้เลือกเกินนี้ · route บังคับซ้ำอีกชั้น) */
export function maxSelectableProducts(channel: string): number {
  return productCardsPerMessage(channel) * MAX_MESSAGES_PER_SEND
}

/**
 * แบ่งรายการสินค้าเป็นชุดตามเพดานของช่องทาง — ชุดละ 1 ข้อความ
 *
 * ห้ามคืน `[[]]` เมื่อ input ว่าง: ผู้เรียกวนส่งตามจำนวนชุด ชุดว่างหนึ่งชุด = ยิงข้อความเปล่า 1 ใบ
 */
export function chunkProductCards(productIds: string[], perMessage: number): string[][] {
  if (productIds.length === 0) return []
  const size = Math.max(1, Math.floor(perMessage))
  const out: string[][] = []
  for (let i = 0; i < productIds.length; i += size) out.push(productIds.slice(i, i + size))
  return out
}

/**
 * id ที่ "ออกไปถึงลูกค้าแล้วจริง" เมื่อการส่งล้มกลางคัน — ใช้ตอน route ตอบ **207** (ส่งได้บางส่วน)
 *
 * 🛑 ทำไมคำนวณย้อนได้โดยไม่ต้องให้ route ส่งรายชื่อ id กลับมา: route แบ่งชุดด้วย `chunkProductCards`
 * ตัวนี้เอง แล้ววนส่งเรียงจากชุดแรกไปชุดสุดท้าย **ล้มที่ชุดไหนก็หยุดทันที** (`return 207` ไม่ใช่
 * `continue`) ⇒ "สำเร็จ i ข้อความ" แปลว่า i ชุดแรกออกไปครบ ไม่มีทางเป็นชุดที่ 1 กับ 3 โดยข้าม 2
 * ลำดับนี้จึงเป็นสิ่งที่รับประกันความถูกต้องของฟังก์ชันนี้ทั้งหมด — **ถ้าวันไหนมีคนเปลี่ยน route ให้
 * ส่งต่อทั้งที่ชุดกลางล้ม ต้องมาแก้ที่นี่ด้วย** ไม่งั้นเราจะติ๊กของที่ยังไม่ถึงลูกค้าออกไปเงียบ ๆ
 *
 * เหตุผลที่ต้องมีเลย: ข้อความ error ของ 207 สั่งผู้ขายว่า "เลือกเฉพาะรายการที่ยังไม่ได้ส่งแล้วลองใหม่"
 * ซึ่งเขาทำตามไม่ได้ — บนจอเขาเห็นแค่ "ส่งได้ 1 จาก 3 ข้อความ" ไม่มีทางรู้ว่าข้อความที่ 1 บรรจุ
 * สินค้าใบไหนบ้าง (ต้องรู้เพดานต่อช่องทางแล้วหารเอง) กดส่งซ้ำทั้งชุด = ลูกค้าได้การ์ดซ้ำ และบน LINE
 * reply token ถูก claim ไปแล้วรอบแรก รอบสองตกไปใช้ push ซึ่งนับโควตา = เงินร้านจริง
 */
export function sentProductIds(productIds: string[], perMessage: number, sentMessages: number): string[] {
  if (sentMessages <= 0) return []
  return chunkProductCards(productIds, perMessage).slice(0, sentMessages).flat()
}

/** จะถูกแบ่งเป็นกี่ข้อความ — ตัวเลขที่หน้าจอสัญญากับผู้ขายไว้ ต้องมาจากสูตรเดียวกับตอนส่งจริง */
export function productCardMessageCount(count: number, perMessage: number): number {
  if (count <= 0) return 0
  return Math.ceil(count / Math.max(1, Math.floor(perMessage)))
}

/**
 * คำที่หน้าจอใช้บอกสถานะการเลือก — **ครอบทั้ง 3 สถานะ** ตาม
 * `docs/conventions/partial-data-must-be-labeled-or-filled.md`
 *
 * ตัวกลาง ("พอดีเพดาน") คือตัวที่มักถูกลืม: ผู้ขายที่เลือกครบ 10 พอดีต้องรู้ล่วงหน้าว่าชิ้นที่ 11
 * จะเปลี่ยนพฤติกรรม ไม่ใช่ไปเจอเอาตอนป้ายเหลืองเด้งขึ้นมาเฉย ๆ
 */
export function describeProductSelection(
  count: number,
  perMessage: number,
): { text: string; messageCount: number; exceedsPerMessage: boolean } {
  const messageCount = productCardMessageCount(count, perMessage)
  if (count <= 0) return { text: 'แตะสินค้าเพื่อเลือก', messageCount: 0, exceedsPerMessage: false }
  if (count < perMessage) return { text: `เลือกแล้ว ${count} รายการ`, messageCount, exceedsPerMessage: false }
  if (count === perMessage) {
    return {
      text: `เลือกแล้ว ${count} รายการ · สูงสุดต่อการ์ด ${perMessage} ชิ้น`,
      messageCount,
      exceedsPerMessage: false,
    }
  }
  return {
    text: `เลือก ${count} รายการ — ระบบจะแบ่งส่งเป็น ${messageCount} ข้อความ (การ์ดละไม่เกิน ${perMessage} ชิ้น)`,
    messageCount,
    exceedsPerMessage: true,
  }
}

/** คำบนปุ่มส่ง — ผลของการแบ่งต้องอยู่บนปุ่มเองด้วย ไม่ใช่แค่ป้ายด้านบน (มติ user 2026-08-11) */
export function productSendButtonLabel(count: number, perMessage: number): string {
  if (count <= 0) return 'ส่งการ์ดสินค้า'
  const messageCount = productCardMessageCount(count, perMessage)
  if (messageCount <= 1) return `ส่งการ์ดสินค้า (${count})`
  return `ส่ง ${messageCount} ข้อความ (${count} รายการ)`
}
