// ตัวตัดสิน "ผู้ซื้อมีข้อความใหม่จากร้าน" — client-safe · นิยามเดียวของ 3 จอผู้ซื้อ
//
// เดิมแต่ละจอตัดสินจาก `lastSenderRole==='SHOP'` ซึ่งใช้ไม่ได้อีกต่อไป: ข้อความระบบแจ้ง (AUTO_NOTICE, 00078)
// ตั้งใจไม่เปลี่ยน lastSenderRole เพื่อให้ฝั่งร้านยังขึ้น "รอตอบ" → ผู้ซื้อต้องไม่พึ่งค่านั้นอีก
// ใช้เวลา "ข้อความร้านที่ผู้ซื้อเห็นล่าสุด" (`lastShopMessageAt`, คำนวณจากแถวข้อความจริงฝั่ง service)
// เทียบกับเวลาที่ผู้ซื้ออ่านล่าสุด — ไม่ต้องมีคอลัมน์ใหม่

type TimeLike = string | Date | null | undefined

export type BuyerUnreadFacts = {
  /** เวลาข้อความฝั่งร้านล่าสุดที่ผู้ซื้อมองเห็น (ไม่นับการ์ดภายใน/ข้อความที่ถูกลบ) · undefined = payload เก่าที่ยังไม่มีฟิลด์นี้ */
  lastShopMessageAt?: TimeLike
  buyerLastReadAt: TimeLike
  // ใช้เฉพาะตอน payload เก่าไม่มี lastShopMessageAt (fallback ให้เท่านิยามเดิมทุกประการ)
  lastSenderRole?: 'BUYER' | 'SHOP' | null
  lastMessageAt?: TimeLike
}

const ms = (t: TimeLike): number | null => (t == null ? null : typeof t === 'string' ? Date.parse(t) : t.getTime())

export function buyerHasUnreadFromShop(c: BuyerUnreadFacts): boolean {
  const read = ms(c.buyerLastReadAt)
  if (c.lastShopMessageAt === undefined) {
    const last = ms(c.lastMessageAt)
    return c.lastSenderRole === 'SHOP' && (read === null || (last !== null && last > read))
  }
  const shopAt = ms(c.lastShopMessageAt)
  return shopAt !== null && (read === null || shopAt > read)
}
