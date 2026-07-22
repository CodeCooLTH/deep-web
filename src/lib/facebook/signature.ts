import { createHmac, timingSafeEqual } from 'crypto'

// ตรวจลายเซ็น webhook ของ Meta (feature 00018)
// route webhook ถูกยกเว้นจาก CSRF Origin-check ใน proxy.ts — ลายเซ็นนี้คือ
// authentication เพียงอย่างเดียวของ route นั้น ห้ามผ่อนปรน
export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.FB_CHAT_APP_SECRET
  if (!secret || !header || !header.startsWith('sha256=')) return false

  const expected = createHmac('sha256', secret).update(rawBody).digest()
  let received: Buffer
  try {
    received = Buffer.from(header.slice('sha256='.length), 'hex')
  } catch {
    return false
  }
  // timingSafeEqual throw ถ้าความยาวไม่เท่ากัน — เช็คก่อนเพื่อคืน false แทนที่จะพัง
  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}
