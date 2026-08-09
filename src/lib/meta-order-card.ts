/**
 * meta-order-card — การ์ด "คำขอชำระเงิน" ที่ Meta ส่งเข้ามาในเธรด (feature 00018)
 *
 * user สั่ง 2026-07-31 ให้แสดงเหมือน Business Suite (การ์ดยอดเงิน + สถานะ + ปุ่ม)
 *
 * ข้อจำกัดที่ต้องรู้ก่อนแก้ไฟล์นี้ — ตรวจจากข้อมูลจริงทั้งฐาน ไม่ได้เดา:
 *   1. Meta **ไม่ได้ส่ง payload ของการ์ด** มาให้เลย ส่งมาเป็นข้อความล้วน 2 ชิ้นแยกกัน
 *      "฿400.00 order" (ตัวการ์ด) กับ "You requested ฿400.00. <ชื่อ> can review and confirm
 *      this order." (คำบรรยาย ซึ่งจับเป็นบรรทัดระบบใน meta-system-notice.ts แล้ว)
 *   2. **ไม่มีข้อความสถานะการชำระเงินเลยสักรายการในฐาน** (สำรวจ ChatMessage ทั้งหมด: มีแต่
 *      "฿N order" 98 ครั้ง, "You requested…", "Auto-label added:…", "Transfer requested")
 *      → เราจึงไม่รู้ว่าจ่ายแล้วหรือยัง ห้ามเขียน "รอชำระเงิน" เป็นข้อเท็จจริง
 *   3. ปุ่ม "Mark as paid"/"View order" ในภาพอ้างอิงเป็น action บนออเดอร์ฝั่ง Meta ซึ่งไม่มี API
 *      ให้เราเรียก — ทำปุ่มที่กดแล้วไม่เกิดอะไรไม่ได้ (กฎเดิมของไฟล์ InboxList)
 *
 * ที่ทำได้จริงคือยกยอดเงินขึ้นมาให้เด่นเป็นการ์ด แทนบับเบิลข้อความที่กลืนไปกับแชท
 *
 * pure module — ไม่ import อะไรเลย ใช้ได้ทั้ง client/server
 */

export interface MetaOrderCard {
  /** ยอดเงินตามที่ Meta ส่งมา เช่น "฿400.00" — คงรูปเดิมไว้ ไม่ reformat เพื่อไม่ให้ตัวเลขเพี้ยน */
  amount: string
  /**
   * สถานะดิบของ Meta เช่น "Waiting for payment" — **ภาษาอังกฤษเสมอ ห้ามแปลไทย**
   * (user เคาะ 2026-08-09: ต้องตรงกับ Business Suite 100% การแปลเองเสี่ยงแปลผิด)
   *
   * null = ข้อความที่บันทึกก่อนมี subtitle (ก่อน 2026-08-07) — **ไม่รู้สถานะ ไม่ใช่ "ไม่มีสถานะ"**
   * ห้ามเติมคำแทนตอนเป็น null
   */
  status: string | null
}

/**
 * รับได้ 3 รูป (ทั้งหมดมีอยู่จริงในฐาน/เทส):
 *   "฿400.00 order"                                         ← ทางเข้าเดิม (webhook) ไม่มีคำนำหน้า
 *   "[การ์ดจาก Facebook] ฿360.00 order"                       ← subtitle ว่าง
 *   "[การ์ดจาก Facebook] ฿360.00 order — Waiting for payment"  ← รูปปัจจุบันของเส้น Graph sync
 *
 * บั๊กที่เพิ่งแก้ (user report 2026-08-09): regex เดิมรับเฉพาะรูปแรกทั้งบรรทัดเป๊ะ ๆ ส่วนเส้น
 * Graph sync/backfill (ที่เพิ่ง backfill เข้ามา 2026-08-07) เติมคำนำหน้าและสถานะเสมอ
 * → การ์ดจากเส้นนั้น **ไม่มีทางเรนเดอร์เป็นการ์ดได้เลย** ตกไปเป็นบรรทัดข้อความระบบดิบ ๆ
 *
 * IMPORTANT: ยัง anchor เต็มบรรทัด (`^...$`) เหมือนเดิม เพื่อกันจับข้อความจริงของร้านที่บังเอิญ
 * มีคำว่า order ปนอยู่ — และ regex ต้องแคบพอที่การ์ดชนิดอื่นซึ่งใช้คำนำหน้าเดียวกัน
 * ("[การ์ดจาก Facebook] Video call — Call again") จะไม่ถูกจับมาเป็นการ์ดยอดเงิน
 *
 * IMPORTANT: คำนำหน้าผูกกับ CARD_PREFIX ใน channel-chat.service.ts — แก้คำนั้นต้องแก้ 3 ที่
 * (channel-chat.service.ts · meta-system-notice.ts · ที่นี่) เพราะไฟล์นี้เป็น pure module
 * ที่ import ข้ามไปหาไฟล์ซึ่งมี server code ไม่ได้
 */
const ORDER_CARD =
  /^(?:\[การ์ดจาก Facebook\]\s+)?(฿[\d,]+(?:\.\d{2})?)\s+order(?:\s+—\s+(.+))?$/i

/**
 * ท้ายข้อความของการ์ดหลายใบ (carousel) — composeStructuredText ต่อ " และอีก N รายการ" ไว้
 * ยังไม่เคยเจอกับการ์ดยอดเงินจริง (มันเป็นใบเดี่ยวเสมอเท่าที่มีหลักฐาน) แต่ถ้าเกิดขึ้น
 * มันจะไหลไปอยู่ในสถานะแล้วผู้ขายจะเห็น "Waiting for payment และอีก 2 รายการ" ซึ่งอ่านไม่รู้เรื่อง
 */
const CAROUSEL_SUFFIX = /\s+และอีก\s+\d+\s+รายการ$/

export function parseMetaOrderCard(body: string | null | undefined): MetaOrderCard | null {
  if (!body) return null
  const m = ORDER_CARD.exec(body.trim())
  if (!m) return null
  const status = m[2]?.replace(CAROUSEL_SUFFIX, '').trim()
  return { amount: m[1], status: status || null }
}
