/**
 * HMAC-signed link-intent cookie สำหรับ Account Linking (FR-LO-16)
 *
 * เหตุผลที่ต้องใช้ intent cookie:
 * NextAuth v4 สร้าง defaultToken ใหม่ใน OAuth callback โดยไม่อ่าน session เดิม
 * → ทำ linking native ผ่าน session ไม่ได้ → ต้องผูก userId ไว้ใน signed cookie
 *   ที่ server ออก, client ปลอมแปลงไม่ได้ (HMAC-SHA256 + NEXTAUTH_SECRET)
 *
 * Fail-closed design (เหมือน sms-unlock-cookie.ts):
 * - SECRET ไม่มี → throw ตอน module load
 * - verifyLinkIntent ทุก error path → return null (ไม่ throw)
 * - timingSafeEqual ป้องกัน timing side-channel บน HMAC compare
 * - exp ฝังใน payload → server enforce ไม่ใช่ cookie maxAge เพียงอย่างเดียว
 */
import crypto from 'crypto'

const SECRET = process.env.NEXTAUTH_SECRET
if (!SECRET) {
  throw new Error('[link-intent] NEXTAUTH_SECRET ไม่ได้ตั้งค่า — fail-closed')
}

export const LINK_INTENT_COOKIE = 'deep_link_intent'

interface LinkIntentPayload {
  userId: string
  provider: string
  exp: number
}

/**
 * สร้าง signed token สำหรับ link intent
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256)
 * TTL: 5 นาที (300 วินาที) — สั้นพอ ป้องกัน replay หลัง OAuth flow เสร็จ
 */
export function signLinkIntent(params: { userId: string; provider: string }): string {
  const payload: LinkIntentPayload = {
    userId: params.userId,
    provider: params.provider,
    exp: Date.now() + 5 * 60 * 1000, // 5 นาที
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto
    .createHmac('sha256', SECRET!)
    .update(payloadB64)
    .digest('base64url')
  return `${payloadB64}.${sig}`
}

/**
 * ตรวจ signed token — คืน payload ถ้าถูกต้อง, null ถ้าเพี้ยน/หมดอายุ
 * - timing-safe compare กัน HMAC timing attack
 * - ทุก error path → null (fail-closed)
 */
export function verifyLinkIntent(token: string): { userId: string; provider: string } | null {
  if (!token) return null
  try {
    const dot = token.indexOf('.')
    if (dot === -1) return null

    const payloadB64 = token.slice(0, dot)
    const sigProvided = token.slice(dot + 1)

    // คำนวณ expected signature ด้วย key เดียวกัน
    const expectedSig = crypto
      .createHmac('sha256', SECRET!)
      .update(payloadB64)
      .digest('base64url')

    // timing-safe compare — ทั้ง 2 buffer ต้องความยาวเท่ากันก่อน compare
    const provided = Buffer.from(sigProvided)
    const expected = Buffer.from(expectedSig)
    if (provided.length !== expected.length) return null
    if (!crypto.timingSafeEqual(provided, expected)) return null

    // parse payload หลัง verify sig แล้วเท่านั้น (กัน injection)
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as LinkIntentPayload

    // ตรวจ field ครบ + ยังไม่หมดอายุ
    if (typeof payload.userId !== 'string' || !payload.userId) return null
    if (typeof payload.provider !== 'string' || !payload.provider) return null
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null

    return { userId: payload.userId, provider: payload.provider }
  } catch {
    // parse error หรือ error อื่น → fail-closed
    return null
  }
}
