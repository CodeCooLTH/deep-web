/**
 * HMAC-signed SMS unlock proof cookie
 *
 * เหตุผลที่ใช้ signed cookie แทน ?unlocked=1 query param:
 * - query param เป็น client-trusted: ใครก็ได้แค่ต่อ ?unlocked=1 ข้าม PhoneUnlock
 * - signed cookie พิสูจน์ว่า server เท่านั้นที่ออก proof ตอน consumeSmsCode
 *   client ไม่สามารถ forge ได้โดยไม่รู้ NEXTAUTH_SECRET
 *
 * Fail-closed design:
 * - SECRET ไม่มี → throw ตอน module load (เห็นปัญหาเร็ว ไม่ bypass เงียบ)
 * - verifySmsUnlock error ทุกอย่าง → return false (ไม่ throw ออก)
 * - timingSafeEqual ป้องกัน timing side-channel บน HMAC compare
 */
import crypto from 'crypto'

// ใช้ NEXTAUTH_SECRET เดียวกับ auth.ts — ตรวจสอบแล้วว่าชื่อ env เดียวกัน
const SECRET = process.env.NEXTAUTH_SECRET
if (!SECRET) {
  throw new Error('[sms-unlock-cookie] NEXTAUTH_SECRET ไม่ได้ตั้งค่า — fail-closed')
}

export const SMS_UNLOCK_COOKIE = 'o_smsunlock'

export const smsUnlockCookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  // path:'/' จำเป็น — cookie ถูกอ่านทั้ง RSC `/o/[token]` และ route `/api/orders/[token]/confirm` (Path A)
  // ถ้าแคบเป็น `/o/` browser จะไม่ส่ง cookie ไปที่ `/api/orders/*` → confirm Path A ไม่ได้รับ cookie → พัง
  // ปลอดภัยเพราะ HMAC bind orderId + SameSite=Lax + httpOnly — ไม่มี exploitable chain
  // (Phase 5 security audit — F3)
  path: '/',
  maxAge: 72 * 3600,
}

/**
 * สร้าง signed proof สำหรับ orderId ที่ผ่านการ consume code แล้ว
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256)
 */
export function signSmsUnlock(orderId: string): string {
  const payload = {
    oid: orderId,
    exp: Date.now() + 72 * 3600 * 1000,
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto
    .createHmac('sha256', SECRET!)
    .update(payloadB64)
    .digest('base64url')
  return `${payloadB64}.${sig}`
}

/**
 * ตรวจ proof cookie ว่าถูกต้องสำหรับ orderId ที่กำหนด
 *
 * - timing-safe compare (กัน HMAC timing attack)
 * - ทุก error path → return false (fail-closed)
 * - ไม่ throw ออก (caller ใน RSC/route handler ไม่ต้อง try-catch)
 */
export function verifySmsUnlock(
  cookieValue: string | undefined,
  orderId: string,
): boolean {
  if (!cookieValue) return false
  try {
    const dot = cookieValue.indexOf('.')
    if (dot === -1) return false

    const payloadB64 = cookieValue.slice(0, dot)
    const sigProvided = cookieValue.slice(dot + 1)

    // คำนวณ expected signature ด้วย key เดียวกัน
    const expectedSig = crypto
      .createHmac('sha256', SECRET!)
      .update(payloadB64)
      .digest('base64url')

    // timing-safe compare — ทั้ง 2 string ต้องความยาวเท่ากันก่อน compare
    const provided = Buffer.from(sigProvided)
    const expected = Buffer.from(expectedSig)
    if (provided.length !== expected.length) return false
    if (!crypto.timingSafeEqual(provided, expected)) return false

    // parse payload หลัง verify sig แล้วเท่านั้น
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as { oid: string; exp: number }

    // ตรวจ orderId ตรงกัน + ยังไม่หมดอายุ
    if (payload.oid !== orderId) return false
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return false

    return true
  } catch {
    // parse error หรือ error อื่น → fail-closed
    return false
  }
}
