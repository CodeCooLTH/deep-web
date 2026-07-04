// CSRF protection (NFR-2.2) — stateless Origin-header allowlist
// prod = deepthailand.app + subdomain เท่านั้น; dev (non-prod) = + deepth.local (ทุก port)
// ตรวจด้วย hostname suffix — กัน spoof แบบ deepthailand.app.evil.com / notdeepthailand.app

const PROD_ROOT = 'deepthailand.app'
const DEV_ROOT = 'deepth.local'

/**
 * @param origin - ค่า Origin header (อาจ null/ว่าง/ไม่ใช่ URL)
 * @param isProd - default จาก NODE_ENV; รับ param เพื่อให้ test ฉีดได้
 * @returns true = origin อยู่ใน allowlist
 */
export function isAllowedOrigin(
  origin: string | null | undefined,
  isProd: boolean = process.env.NODE_ENV === 'production',
): boolean {
  if (!origin) return false
  let host: string
  try {
    host = new URL(origin).hostname
  } catch {
    return false
  }
  const matches = (root: string) => host === root || host.endsWith('.' + root)
  if (matches(PROD_ROOT)) return true
  if (!isProd && matches(DEV_ROOT)) return true
  // dev-only: อนุญาต localhost/127.0.0.1 (เข้า dev ผ่าน localhost:3000 ได้โดยไม่ต้องตั้ง deepth.local)
  if (!isProd && (host === 'localhost' || host === '127.0.0.1')) return true
  return false
}
