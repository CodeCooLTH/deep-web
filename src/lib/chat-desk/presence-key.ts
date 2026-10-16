import 'server-only'
import { createHmac } from 'node:crypto'

/**
 * คีย์ presence ทึบของ (ร้าน, คน) — SDS TD-07
 * ทำไม HMAC: คนนอกที่รู้ shopId เข้าช่อง presence ได้ แต่ปลอมตัวเป็นสมาชิกไม่ได้เพราะไม่มี secret
 * และคีย์ไม่เปิดเผย userId · อ่าน secret ใน function (ไม่ throw ตอน import) เพื่อให้เทสตั้ง env ได้
 */
export function presenceKeyFor(shopId: string, userId: string): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET ไม่ได้ตั้งค่า — ออกคีย์ presence ไม่ได้')
  return createHmac('sha256', secret)
    .update(`chat-desk-presence:v1:${shopId}:${userId}`)
    .digest('base64url')
    .slice(0, 22)
}
