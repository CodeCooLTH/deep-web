/**
 * OAuth ผ่าน Custom Tab สำหรับแอปผู้ขาย Android — ส่วนที่เป็นกฎล้วน (ไม่มี I/O)
 *
 * ทำไมต้องออกไป Custom Tab: Facebook ปิดการล็อกอินใน Android WebView ตั้งแต่ 2021 ⇒ ทั้งสาย OAuth
 * ต้องเริ่มและจบในแท็บ (คุกกี้ state ของ NextAuth อยู่คนละ jar กับ WebView) แล้วส่ง session กลับ
 * ด้วยตั๋วใช้ครั้งเดียว — สเปก `docs/superpowers/specs/2026-10-01-android-oauth-custom-tabs-design.md`
 *
 * ใช้ได้ทั้งฝั่ง client และ server (ไม่ import อะไรที่ผูกกับฝั่งใดฝั่งหนึ่ง)
 */

/** คุกกี้ในแท็บ = "แท็บนี้ถูกเปิดจากแอป ให้ส่งกลับเมื่อจบ" · ค่า = nonce ที่ผูกตั๋วขากลับ */
export const APP_OAUTH_COOKIE = 'deep_app_oauth'
/** อายุคุกกี้ในแท็บ (วินาที) — นานพอสำหรับ 2FA ของ Facebook แต่ไม่ค้างไปถึงการใช้ Chrome ครั้งหน้า */
export const APP_OAUTH_COOKIE_MAX_AGE = 15 * 60
/** scheme ขากลับเข้าแอป — ต้องตรงกับ `scheme` ใน app.config.ts ของ deep-seller-app */
export const APP_OAUTH_RETURN_URL = 'deepseller://oauth'
/** ข้อความ postMessage จาก WebView → native — ต้องตรงกับ SellerWebView.tsx */
export const OPEN_AUTH_MESSAGE = 'deep:open-auth'
/** localStorage key ของ nonce ใน WebView (ฝั่ง /auth/app-enter อ่าน) */
export const APP_OAUTH_NONCE_KEY = 'deep_app_oauth_nonce'

export const APP_OAUTH_PROVIDERS = ['facebook', 'line', 'instagram', 'apple'] as const
export type AppOAuthProvider = (typeof APP_OAUTH_PROVIDERS)[number]

/**
 * ทางเข้าที่อนุญาตให้แท็บเริ่ม — 🛑 allow-list เท่านั้น ห้ามรับ URL อิสระ
 * แท็บถือ session ของผู้ใช้ (ได้จากตั๋วขาไป) ⇒ `go` ที่เป็น URL ใด ๆ = open redirect ที่พา session ไปด้วย
 */
export const APP_OAUTH_CONNECT_PATHS = ['/api/channels/facebook/connect'] as const

export type AppOAuthGo =
  | { kind: 'signin'; provider: AppOAuthProvider; callbackUrl: string }
  | { kind: 'link'; provider: AppOAuthProvider }
  | { kind: 'connect'; path: (typeof APP_OAUTH_CONNECT_PATHS)[number] }

/** path ภายในเว็บเราเท่านั้น (กัน `//evil` · `\` · ขึ้นบรรทัดใหม่) — ไม่ผ่าน = null */
export function sanitizeInternalPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\r\n]/.test(raw)) return null
  return raw
}

function isProvider(v: string): v is AppOAuthProvider {
  return (APP_OAUTH_PROVIDERS as readonly string[]).includes(v)
}

/** เข้ารหัส `go` ลง URL ของแท็บ */
export function encodeAppOAuthGo(go: AppOAuthGo): string {
  if (go.kind === 'connect') return `connect:${go.path}`
  if (go.kind === 'link') return `link:${go.provider}`
  return `signin:${go.provider}:${go.callbackUrl}`
}

/** อ่าน `go` จาก URL ของแท็บ — ค่าที่ไม่อยู่ใน allow-list คืน null (แท็บแสดงข้อผิดพลาด ไม่เดินต่อ) */
export function parseAppOAuthGo(raw: string | null | undefined): AppOAuthGo | null {
  if (!raw) return null
  const [kind, ...rest] = raw.split(':')
  if (kind === 'connect') {
    const path = rest.join(':')
    return (APP_OAUTH_CONNECT_PATHS as readonly string[]).includes(path)
      ? { kind: 'connect', path: path as (typeof APP_OAUTH_CONNECT_PATHS)[number] }
      : null
  }
  if (kind === 'link') {
    const p = rest.join(':')
    return isProvider(p) ? { kind: 'link', provider: p } : null
  }
  if (kind === 'signin') {
    const [p, ...cb] = rest
    if (!p || !isProvider(p)) return null
    const callbackUrl = sanitizeInternalPath(cb.join(':')) ?? '/dashboard'
    return { kind: 'signin', provider: p, callbackUrl }
  }
  return null
}

/**
 * หน้านี้ "ยังอยู่กลางสาย" ไหม — ถ้าใช่ แท็บต้องเดินต่อ ห้ามส่งกลับแอป
 *
 * - `/auth/app-oauth` = หน้าเริ่มเอง (ตั้งคุกกี้แล้วกำลังจะพาออกไปหาผู้ให้บริการ)
 * - `/auth/callback/*` = หน้ารอ session นิ่งแล้วพาไปปลายทาง — ส่งกลับตรงนี้ได้ก็จริงแต่ปลายทางยังไม่ชัด
 * - `/settings/channels/select` = เลือกเพจ อ่าน token จากคุกกี้ **ในแท็บ** ⇒ ส่งกลับตรงนี้
 *   WebView จะไม่มีคุกกี้นั้น หน้าเลือกเพจว่างเปล่า (ต้องเลือกให้จบในแท็บ แล้วกลับตอนถึง `/settings/channels`)
 */
export function isAppOAuthInFlight(pathname: string): boolean {
  return (
    pathname === '/auth/app-oauth' ||
    pathname.startsWith('/auth/callback/') ||
    pathname === '/settings/channels/select' ||
    pathname.startsWith('/settings/channels/select/')
  )
}

/** URL ขากลับเข้าแอป — ไม่มีตั๋ว (ล็อกอินไม่สำเร็จ) ก็ยังส่งกลับ ให้ WebView แสดงหน้าปลายทาง (เช่น ข้อผิดพลาด) */
export function buildAppReturnUrl(ticket: string | null, next: string): string {
  const q = new URLSearchParams()
  if (ticket) q.set('t', ticket)
  q.set('next', sanitizeInternalPath(next) ?? '/dashboard')
  return `${APP_OAUTH_RETURN_URL}?${q.toString()}`
}

/** URL เริ่มต้นของแท็บ (path ภายใน — ผู้เรียกต่อ origin เอง) */
export function buildAppOAuthStartPath(go: AppOAuthGo, nonce: string, ticket: string | null): string {
  const q = new URLSearchParams({ go: encodeAppOAuthGo(go), n: nonce })
  if (ticket) q.set('t', ticket)
  return `/auth/app-oauth?${q.toString()}`
}

/** nonce ต้องยาวพอและเป็นอักขระปลอดภัย — กันค่าว่าง/สั้นที่ทำให้การผูกตั๋วไม่มีความหมาย */
export function isValidNonce(n: string | null | undefined): n is string {
  return typeof n === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(n)
}
