import { GraphApiError } from './graph'

/**
 * private-reply-error — แยก "Facebook ปฏิเสธเพราะคอมเมนต์นี้ถูกทักไปแล้ว" ออกจาก error ทั่วไป
 *
 * 🛑 ทำไมต้องแยก: Meta ให้ส่ง private reply ได้ **ครั้งเดียวต่อคอมเมนต์** และโควตานั้นถูกใช้ได้
 * จากนอกระบบเรา (ผู้ขายกด "ส่งข้อความ" ใต้คอมเมนต์ใน Business Suite / Page Inbox) ซึ่ง Deep
 * มองไม่เห็นเลย — ไม่มี API ให้ถามล่วงหน้าว่าคอมเมนต์ไหนถูกทักไปแล้ว รู้ได้ทางเดียวคือ "ลองส่ง
 * แล้วโดนปฏิเสธ" เหมือนเครดิต iShip ที่รู้ยอดจริงตอนถูกปฏิเสธเท่านั้น
 *
 * เดิม error ตัวนี้ตกไปรวมกับ SEND_FAILED → route ตอบ 502 UPSTREAM_ERROR → จอขึ้น
 * **"ส่งไม่สำเร็จ ลองใหม่อีกครั้ง"** = เชิญผู้ขายให้กดสิ่งที่ไม่มีวันสำเร็จ (บน prod สะสม 25 ครั้ง
 * ก่อนถูกจับได้ 2026-08-19 — ผู้ขายกด 2 คอมเมนต์ติดกันแล้วเจอข้อความเดียวกันทั้งคู่)
 * การจัดประเภทผิดให้เป็น retryable อันตรายกว่าปกติ เพราะมันสั่งให้ผู้ใช้ทำสิ่งที่ไร้ผลซ้ำ ๆ
 * (บทเรียนเดียวกับ docs/retro/2026-08-06-iship-retry-and-credit-retrospective.md)
 */

/**
 * รหัส error ของ Meta สำหรับ "ตอบ activity นี้ไปแล้ว"
 * ข้อความที่มากับมันบน prod: `(#10900) Activity already replied to`
 */
export const META_ALREADY_REPLIED_CODE = 10900

/**
 * ตัดสินจาก **รหัส** เป็นหลัก ไม่ใช่ข้อความ
 *
 * `GraphApiError.code` มาจาก `error.code` ที่ Meta ส่งมาตรง ๆ — เป็นสัญญาที่คงที่ ส่วนข้อความ
 * เป็นภาษาอังกฤษที่ Meta แก้เมื่อไหร่ก็ได้ (รีโปนี้เคยพลาดจากการ match ข้อความมาแล้วกับ regex
 * ภาษาไทยของ iShip ที่จับ "ไม่พอ" แล้วไม่ match "ไม่เพียงพอ")
 *
 * คง string fallback ไว้เฉพาะรูปแบบ `(#10900)` ซึ่ง Meta ใส่ไว้ในข้อความเอง — เผื่อ error ถูก
 * wrap/serialize ระหว่างทางจนไม่เหลือ instance เดิม (เช่นถูกโยนผ่าน JSON) **ห้ามขยาย fallback
 * ไปจับคำว่า "already replied" เปล่า ๆ** เพราะนั่นคือการเดาความหมายจากภาษาอังกฤษของคนอื่น
 */
export function isAlreadyRepliedGraphError(err: unknown): boolean {
  if (err instanceof GraphApiError && err.code === META_ALREADY_REPLIED_CODE) return true
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return message.includes(`(#${META_ALREADY_REPLIED_CODE})`)
}
