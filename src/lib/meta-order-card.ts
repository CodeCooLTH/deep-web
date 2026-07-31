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
}

/** "฿400.00 order" / "฿1,130.00 order" — ทั้งบรรทัดต้องตรงรูปนี้เท่านั้น กันจับข้อความจริงของร้าน */
const ORDER_CARD = /^(฿[\d,]+(?:\.\d{2})?)\s+order$/i

export function parseMetaOrderCard(body: string | null | undefined): MetaOrderCard | null {
  if (!body) return null
  const m = ORDER_CARD.exec(body.trim())
  return m ? { amount: m[1] } : null
}
