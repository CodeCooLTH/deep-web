// Utility: validate ?callbackUrl= จาก query string ก่อนใช้ redirect หลัง login สำเร็จ
// ทำไม: กัน open-redirect — callbackUrl มาจาก URL ที่ผู้ใช้ (หรือ attacker) กำหนดเองได้
// (เช่น /auth/sign-in?callbackUrl=https://evil.com) จึงต้องอนุญาตเฉพาะ relative path
// ในโดเมนเดียวกันเท่านั้น ก่อนส่งเข้า router.push()/signIn({ callbackUrl })
export const DEFAULT_CALLBACK_URL = '/'

// origin สมมติสำหรับ resolve relative URL — ใช้ .invalid (RFC 6761 reserved, ต่อ network ไม่ได้)
const PLACEHOLDER_ORIGIN = 'https://placeholder.invalid'

/**
 * ตรวจว่า raw string ที่ได้จาก searchParams.get('callbackUrl') ปลอดภัยพอจะใช้ redirect ไหม
 * เงื่อนไขผ่าน: relative path ใน origin เดียวกันเท่านั้น
 * วิธี: ใช้ WHATWG URL parser (อัลกอริทึมเดียวกับ browser) resolve เทียบ PLACEHOLDER_ORIGIN —
 *   ถ้า origin ที่ parse ได้เปลี่ยนไป = absolute/protocol-relative/มี trick → ปฏิเสธ.
 *   ครอบคลุม tab/newline/CR bypass ('/\t/evil.com' — URL parser strip control char แล้ว fold
 *   เป็น '//evil.com' → absolute) ที่ manual string check พลาด (reviewer must-fix).
 */
export function getSafeCallbackUrl(
  raw: string | null | undefined,
  fallback: string = DEFAULT_CALLBACK_URL,
): string {
  if (!raw) return fallback
  if (!raw.startsWith('/')) return fallback
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  try {
    const u = new URL(raw, PLACEHOLDER_ORIGIN)
    if (u.origin !== PLACEHOLDER_ORIGIN) return fallback // fold เป็น absolute = อันตราย
    return u.pathname + u.search + u.hash // relative ที่ normalize แล้ว
  } catch {
    return fallback
  }
}
