// Utility: validate ?callbackUrl= จาก query string ก่อนใช้ redirect หลัง login สำเร็จ
// ทำไม: กัน open-redirect — callbackUrl มาจาก URL ที่ผู้ใช้ (หรือ attacker) กำหนดเองได้
// (เช่น /auth/sign-in?callbackUrl=https://evil.com) จึงต้องอนุญาตเฉพาะ relative path
// ในโดเมนเดียวกันเท่านั้น ก่อนส่งเข้า router.push()/signIn({ callbackUrl })
export const DEFAULT_CALLBACK_URL = '/'

/**
 * ตรวจว่า raw string ที่ได้จาก searchParams.get('callbackUrl') ปลอดภัยพอจะใช้ redirect ไหม
 * เงื่อนไขผ่าน: ต้องขึ้นต้นด้วย '/' เดี่ยว ๆ (relative path) เท่านั้น
 * ปฏิเสธ: absolute URL (http://, https://), protocol-relative ('//evil.com'),
 *         backslash trick ('/\evil.com' — browser บางตัวตีความ '\' เป็น '/'),
 *         หรือมี '://' ปนอยู่ (เผื่อ encode/พิมพ์แปลก ๆ เช่น '/http://evil.com')
 */
export function getSafeCallbackUrl(
  raw: string | null | undefined,
  fallback: string = DEFAULT_CALLBACK_URL,
): string {
  if (!raw) return fallback
  if (!raw.startsWith('/')) return fallback
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (raw.includes('://')) return fallback

  return raw
}
