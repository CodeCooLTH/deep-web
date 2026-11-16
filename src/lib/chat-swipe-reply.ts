/**
 * ปัดข้อความ = ตอบกลับข้อความนั้น — ชุดเดียวกับแอปผู้ขาย (deep-seller-app `logic/swipe-reply.ts`)
 * user สั่ง 2026-11-16: "สไลด์ไปทางขวาแล้วเป็นตอบกลับของ chat native ทำได้ แต่ web ทำไม่ได้"
 *
 * แบบ Messenger: ข้อความลูกค้า (ชิดซ้าย) ปัดไปขวา — ไอคอนโผล่ซ้าย · ข้อความเรา (ชิดขวา) ปัดไปซ้าย — ไอคอนโผล่ขวา
 * ลากตามนิ้วแบบหน่วง · ถึงระยะ = สั่นเบา ๆ ครั้งเดียว · ปล่อยหลังถึงระยะ = ตอบกลับ (ไม่ถึง = เด้งกลับเฉย ๆ)
 * 🛑 ล็อกแนวนอน: ต้องไปทางที่ถูกเกิน 16px ก่อนแนวตั้งเกิน 12px — เลื่อนอ่านเธรดขึ้นลงต้องไม่ติด
 * ตัวเลขทุกตัวเท่าแอป — แก้ฝั่งหนึ่งต้องแก้อีกฝั่ง
 */

/** ระยะที่ลาก "ไปทางที่ตอบกลับได้" — ข้อความเรา (mine) = ไปทางซ้าย (dx ติดลบ) */
export function swipeDistance(dx: number, mine: boolean): number {
  return mine ? -dx : dx
}

/** ระยะลากที่นับว่า "ตอบกลับ" */
export const SWIPE_REPLY_TRIGGER = 64
/** บับเบิลเลื่อนตามนิ้วได้ไกลสุด (หลังถึงระยะ = หน่วงหนัก) */
export const SWIPE_REPLY_MAX = 88
/** ต้องลากไปทางที่ถูกเกินเท่านี้ก่อนถึงจะเริ่มปัด (แอป activeOffsetX 16) */
export const SWIPE_REPLY_ACTIVATE = 16
/** แนวตั้งเกินเท่านี้ก่อนเริ่มปัด = ผู้ใช้กำลังเลื่อนเธรด ยกเลิก (แอป failOffsetY ±12) */
export const SWIPE_REPLY_FAIL_Y = 12

/** นิ้วลากไป dx (ทางที่ถูกแล้ว) → บับเบิลเลื่อนเท่าไร (ผิดทาง = 0 · ใกล้ระยะ = ตามนิ้ว · เกินระยะ = หน่วง) */
export function swipeOffset(dx: number): number {
  if (!Number.isFinite(dx) || dx <= 0) return 0
  if (dx <= SWIPE_REPLY_TRIGGER) return dx
  return Math.min(SWIPE_REPLY_MAX, SWIPE_REPLY_TRIGGER + (dx - SWIPE_REPLY_TRIGGER) * 0.3)
}

/** ความชัดของไอคอนตอบกลับ 0–1 */
export function swipeIconOpacity(dx: number): number {
  return Math.max(0, Math.min(1, swipeOffset(dx) / SWIPE_REPLY_TRIGGER))
}

/** ลากถึงระยะตอบกลับแล้วไหม */
export function swipeReached(dx: number): boolean {
  return Number.isFinite(dx) && dx >= SWIPE_REPLY_TRIGGER
}

/**
 * ก่อนเริ่มปัด: ตัดสินจากระยะนิ้วตั้งแต่แตะ
 * 'swipe' = เริ่มปัด · 'cancel' = เป็นการเลื่อนเธรด/ปัดผิดทาง (ไม่ยุ่งกับ gesture นี้อีก) · 'pending' = ยังไม่รู้
 */
export function swipeLock(dx: number, dy: number, mine: boolean): 'pending' | 'swipe' | 'cancel' {
  if (Math.abs(dy) > SWIPE_REPLY_FAIL_Y) return 'cancel'
  const d = swipeDistance(dx, mine)
  if (d > SWIPE_REPLY_ACTIVATE) return 'swipe'
  if (d < -SWIPE_REPLY_ACTIVATE) return 'cancel'
  return 'pending'
}
