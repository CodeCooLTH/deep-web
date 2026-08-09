import { createHmac, timingSafeEqual } from 'crypto'

// ตรวจลายเซ็น webhook ของ LINE (feature 00025, BR-LINE-05, TFR-LINE-02 ขั้น 4)
//
// route webhook (S-6) ถูกยกเว้นจาก CSRF Origin-check ใน proxy.ts เหมือน webhook ของ Meta —
// ลายเซ็นนี้คือ authentication เพียงอย่างเดียวของ route นั้น ห้ามผ่อนปรน
//
// ต่างจาก Meta (facebook/signature.ts) ตรงที่ LINE ส่งลายเซ็นเป็น **base64 ล้วน ๆ** ใน header
// `x-line-signature` (ไม่มี prefix แบบ `sha256=` ของ Meta ที่เป็น hex) — ดู API.md §2:
// "ลายเซ็น base64 ของ HMAC-SHA256(raw body, channelSecret)"
//
// 🛑 ต้องใช้ crypto.timingSafeEqual ห้ามใช้ === เทียบสตริง/buffer ตรง ๆ (BR-LINE-05) — การเทียบด้วย
// === รั่วเวลาออกมาให้ผู้โจมตีเดาไบต์ทีละไบต์ได้ (timing attack) timingSafeEqual เทียบเวลาคงที่เสมอ
// แต่ throw เมื่อความยาว buffer ไม่เท่ากัน — ต้องเช็คความยาวเองก่อนเพื่อคืน false แทนที่จะให้ throw
// หลุดออกไปเป็น 500 (webhook ของ LINE ต้องตอบ 200 เสมอตาม TFR-LINE-03)
export function validateSignature(
  rawBody: string,
  channelSecret: string,
  headerValue: string | null,
): boolean {
  if (!channelSecret || !headerValue) return false

  const expected = createHmac('sha256', channelSecret).update(rawBody).digest()

  let received: Buffer
  try {
    received = Buffer.from(headerValue, 'base64')
  } catch {
    // ฟอร์แมตผิดจนถอด base64 ไม่ได้เลย (Buffer.from ปกติไม่ throw กับ base64 แต่กันไว้ไม่ให้หลุด 500)
    return false
  }

  // ความยาวไม่เท่ากัน = ไม่ใช่ลายเซ็นที่ถูกต้องแน่นอนอยู่แล้ว (ทั้งกรณี header ว่าง/รูปแบบผิด/ยาวไม่พอ)
  // เช็คก่อนเรียก timingSafeEqual เสมอ เพราะมันโยน error เมื่อ buffer สองฝั่งยาวไม่เท่ากัน
  if (received.length !== expected.length) return false

  return timingSafeEqual(received, expected)
}
