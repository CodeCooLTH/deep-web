'use client'

/**
 * ฝั่ง WebView ของ OAuth ผ่าน Custom Tab (แอปผู้ขาย Android) — ส่งงานให้ native เปิดแท็บ
 *
 * ผู้เรียกทุกราย (หน้าล็อกอิน · คำเชิญ · /account · ลิงก์เชื่อมเพจ) ทำแบบเดียวกัน:
 *   if (await startAppOAuth(go)) { คืนสถานะปุ่ม; return }   // ส่งให้แท็บแล้ว
 *   …ทางเดิมของเว็บ (signIn / href) …
 *
 * คืน false ทุกกรณีที่ไม่ใช่แอป Android ⇒ เบราว์เซอร์และแอป iOS เดินทางเดิมทุกประการ
 * สเปก `docs/superpowers/specs/2026-10-01-android-oauth-custom-tabs-design.md`
 */
import { APP_UA_MARKER } from '@/lib/app-shell'
import { APP_OAUTH_NONCE_KEY, OPEN_AUTH_MESSAGE, buildAppOAuthStartPath, type AppOAuthGo } from '@/lib/app-oauth'

type RNWindow = Window & { ReactNativeWebView?: { postMessage: (msg: string) => void } }

/** อยู่ใน WebView ของแอปผู้ขายบน Android ไหม — ต้องมีทั้ง marker ของแอปและช่องส่งข้อความหา native */
export function isAndroidSellerApp(w: (Window & RNWindow) | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  if (!w) return false
  const ua = w.navigator?.userAgent ?? ''
  return ua.includes(APP_UA_MARKER) && /Android/i.test(ua) && typeof w.ReactNativeWebView?.postMessage === 'function'
}

function randomNonce(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * เปิดแท็บให้ทำ OAuth — คืน true เมื่อส่งให้ native แล้ว (ผู้เรียกต้องหยุดทางเว็บ)
 *
 * 🛑 ขอตั๋วขาไป **ก่อน** เปิดแท็บเสมอ — การเชื่อมบัญชี/เพจต้องรู้ว่า "ใคร" แต่แท็บไม่มี cookie ของ WebView
 * ขอไม่สำเร็จ (เครือข่าย) ก็ยังเปิดแท็บได้: ล็อกอินไม่ต้องใช้ตั๋ว ส่วนเชื่อมบัญชีแท็บจะเจอหน้าล็อกอินเอง
 */
export async function startAppOAuth(go: AppOAuthGo): Promise<boolean> {
  const w = typeof window === 'undefined' ? undefined : (window as RNWindow)
  if (!w || !isAndroidSellerApp(w)) return false

  let ticket: string | null = null
  try {
    const res = await fetch('/api/seller/app-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (res.ok) ticket = ((await res.json()) as { ticket?: string | null }).ticket ?? null
  } catch {
    /* ดูคอมเมนต์ด้านบน — ยังเปิดแท็บต่อ */
  }

  const nonce = randomNonce()
  try {
    /* localStorage ไม่ใช่ sessionStorage — ระหว่างอยู่ในแท็บ Android อาจปิด process ของแอปทิ้ง
       แอปเปิดใหม่แล้วยังต้องแลกตั๋วได้ */
    w.localStorage.setItem(APP_OAUTH_NONCE_KEY, nonce)
  } catch {
    return false // เก็บ nonce ไม่ได้ = แลกตั๋วขากลับไม่ได้แน่นอน ⇒ อย่าเปิดแท็บที่จบไม่ได้
  }

  const url = `${w.location.origin}${buildAppOAuthStartPath(go, nonce, ticket)}`
  w.ReactNativeWebView!.postMessage(JSON.stringify({ type: OPEN_AUTH_MESSAGE, url }))
  return true
}
