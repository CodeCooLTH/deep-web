/**
 * HMAC-signed Bearer token สำหรับ Buyer App (mobile)
 *
 * ทำไมไม่ใช้ NextAuth session cookie:
 * - มือถือ (React Native) ไม่มี cookie jar แบบ browser → ใช้ Bearer token ใน
 *   `Authorization` header สะดวกกว่า (เก็บใน expo-secure-store ฝั่งแอป)
 * - ยึด pattern เดียวกับ `sms-unlock-cookie.ts`: base64url(payload).HMAC-SHA256
 *   เซ็นด้วย NEXTAUTH_SECRET — client forge ไม่ได้ถ้าไม่รู้ secret
 *
 * Fail-closed: SECRET ไม่มี → throw ตอน module load. verify error → null.
 */
import crypto from 'crypto'

const SECRET = process.env.NEXTAUTH_SECRET
if (!SECRET) {
  throw new Error('[app-token] NEXTAUTH_SECRET ไม่ได้ตั้งค่า — fail-closed')
}

// อายุ token แอป — 30 วัน (ตรงกับ session.maxAge ของ NextAuth ใน lib/auth.ts)
const TTL_MS = 30 * 24 * 60 * 60 * 1000

type AppTokenPayload = { uid: string; exp: number }

/** สร้าง Bearer token สำหรับ userId หลัง verify OTP สำเร็จ */
export function signAppToken(userId: string): string {
  const payload: AppTokenPayload = { uid: userId, exp: Date.now() + TTL_MS }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET!).update(payloadB64).digest('base64url')
  return `${payloadB64}.${sig}`
}

/**
 * ตรวจ token → คืน userId ถ้า valid + ยังไม่หมดอายุ, ไม่งั้น null.
 * timing-safe compare. ทุก error path → null (fail-closed, ไม่ throw ออก).
 */
export function verifyAppToken(token: string | undefined | null): string | null {
  if (!token) return null
  try {
    const dot = token.indexOf('.')
    if (dot === -1) return null

    const payloadB64 = token.slice(0, dot)
    const sigProvided = token.slice(dot + 1)
    const expectedSig = crypto.createHmac('sha256', SECRET!).update(payloadB64).digest('base64url')

    const provided = Buffer.from(sigProvided)
    const expected = Buffer.from(expectedSig)
    if (provided.length !== expected.length) return null
    if (!crypto.timingSafeEqual(provided, expected)) return null

    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as AppTokenPayload

    if (typeof payload.uid !== 'string' || !payload.uid) return null
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null

    return payload.uid
  } catch {
    return null
  }
}
