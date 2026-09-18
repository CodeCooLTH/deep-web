/**
 * post-auth-redirect — "ล็อกอินสำเร็จแล้วควรไปไหน" (แก้ 2026-09-17)
 *
 * ## บั๊กที่แก้
 *
 * ออกจากระบบ → กด Sign in with Apple → **ยืนยันกับ Apple สำเร็จ** → กลับมาแล้ว
 * **ยังอยู่หน้าล็อกอินเหมือนเดิม** (หัวหน้าเจอบน iPhone หลังติดตั้งใหม่รอบสอง)
 *
 * ## ลูกโซ่ (ไล่จากซอร์สของ next-auth ครบทุกขั้น)
 *
 * 1. `signOut({ callbackUrl: '/auth/sign-in' })` ⇒ next-auth เขียนคุกกี้
 *    `__Secure-next-auth.callback-url = /auth/sign-in`
 * 2. กดปุ่ม Apple → `signIn()` ยิง POST ที่ "ควร" ทับคุกกี้นั้นเป็น `/dashboard`
 *    แล้ว **เด้งออกไป appleid.apple.com ทันที** — ถ้า WebView เขียนคุกกี้ไม่ทัน
 *    ค่าที่ค้างอยู่ยังเป็น `/auth/sign-in` (คลาสเดียวกับคุกกี้ CSRF ที่แก้ไปเมื่อ 2026-09-16)
 * 3. Apple ส่งกลับแบบ `form_post` ซึ่ง **ไม่มีพารามิเตอร์ `callbackUrl` ติดมา**
 *    ⇒ `createCallbackUrl()` ถอยไปอ่าน **คุกกี้** (`core/lib/callback-url.js`)
 * 4. `callbacks.redirect` เดิมปล่อยผ่านทุก path ที่ขึ้นต้นด้วย `/` ⇒ คืน `/auth/sign-in`
 * 5. หน้าล็อกอิน **ไม่เคยเช็ค session** และ `proxy.ts` ยกเว้น `/auth` จากด่านทุกด่าน
 *    ⇒ ผู้ใช้ **ล็อกอินสำเร็จแล้วจริง ๆ** แต่นั่งมองฟอร์มล็อกอินอยู่
 *
 * ครั้งแรกหลังติดตั้งใหม่ไม่เป็น เพราะยังไม่เคย `signOut` ⇒ ไม่มีคุกกี้ค้าง
 *
 * ## กฎที่ใช้แก้ — ไม่พึ่งจังหวะของคุกกี้เลย
 *
 * **ปลายทางหลังล็อกอินสำเร็จ ห้ามเป็นหน้าล็อกอิน/สมัคร/ยืนยันตัวตน** ไม่ว่าค่านั้นมาจากไหน
 * เพราะมันไม่ใช่ปลายทางที่ถูกต้องในทุกกรณี ไม่ใช่แค่กรณีคุกกี้ค้าง
 *
 * 🛑 **แต่ห้ามเหมารวม `/auth/*` ทั้งหมด** — `/auth/callback/line` และ
 * `/auth/callback/instagram` เป็นปลายทางที่ **ถูกต้องและจำเป็น** (หน้ารอ session ให้นิ่ง
 * ก่อนส่งต่อ) ⇒ เหมารวมเมื่อไหร่ **LINE กับ Instagram ล็อกอินไม่ได้ทันที**
 */

/** ปลายทางปริยายเมื่อค่าที่ได้มาใช้ไม่ได้ */
import { DEFAULT_SELLER_CALLBACK } from '@/lib/safe-callback-url'

/** หน้าที่ "อยู่ระหว่างยืนยันตัวตน" — ไปที่นี่หลังล็อกอินสำเร็จแล้วคือวนกลับที่เดิม */
function isAuthLandingPath(pathname: string): boolean {
  if (!pathname.startsWith('/auth')) return false
  /* สะพานรอ session ของ LINE/IG — เป็นปลายทางที่ถูกต้อง ห้ามตัดทิ้ง */
  if (pathname.startsWith('/auth/callback/')) return false
  return true
}

/**
 * คืนปลายทางที่ใช้ได้จริงหลังล็อกอินสำเร็จ
 *
 * รักษาพฤติกรรมเดิมทุกอย่าง (relative ผ่าน · same-origin ผ่าน · นอก origin ตกไป baseUrl)
 * แล้วเพิ่มกฎเดียว: ห้ามลงเอยที่หน้ายืนยันตัวตน
 *
 * 🛑 **คืนเป็น URL เต็มเสมอ ห้ามคืน path ลอย ๆ** (แก้ 2026-09-18)
 *
 * ค่านี้ไม่ได้ถูกใช้แค่เป็น `Location` ของ 302 (ซึ่งรับ path ได้ — Apple จึงไม่เป็นอะไร)
 * แต่ยังถูกส่งกลับเป็น `data.url` ให้ `signIn(..., { redirect: false })` ฝั่งหน้าเว็บ
 * ซึ่งทำ `new URL(data.url)` ⇒ path ลอย ๆ ทำให้ **throw หลังคุกกี้ session ตั้งไปแล้ว**
 * ⇒ ปุ่มกลับเป็น "เข้าสู่ระบบ" เฉย ๆ ไม่เปลี่ยนหน้า รีเฟรชแล้วถึงเข้าได้
 * (หัวหน้าเจอกับรหัสผ่าน `appreview` บน iPhone · กระทบทุกทางเข้า `redirect: false`
 * จากหน้า `/auth/*` ทั้งผู้ขาย แอดมิน ผู้ซื้อ — ตั้งแต่ #64)
 *
 * ต่อ path ด้วยการต่อสตริง **ไม่ใช่ `new URL(path, baseUrl)`** — แบบหลังตีความ
 * `//evil.com` เป็นโดเมนอื่น (open-redirect) · แบบต่อสตริงคือสัญญาเดียวกับ callback
 * ปริยายของ next-auth (`core/lib/default-callbacks.js`)
 */
export function resolvePostAuthRedirect(
  url: string,
  baseUrl: string,
  fallback: string = DEFAULT_SELLER_CALLBACK,
): string {
  if (url.startsWith('/')) {
    /**
     * ส่งทั้งเส้นรวม query เข้าไปได้เลย **ไม่ต้องตัด** — การตรวจยึดตำแหน่งแรกด้วย
     * `startsWith` ⇒ อะไรที่ต่อท้ายหลัง `?`/`#` เปลี่ยนคำตอบไม่ได้
     *
     * 🛑 เคยเขียนตัดไว้ แล้ว mutation พิสูจน์ว่า **ถอดออกก็ไม่มีเทสไหนแดง** = โค้ดที่ไม่ได้
     * ทำอะไรเลย ⇒ ตัดทิ้งแทนที่จะเก็บไว้ให้คนถัดไปเข้าใจผิดว่ามันกันอะไรอยู่
     * (มีเทสปักหมุดเคสที่หลอกตาที่สุดไว้: `/auth/sign-in?next=/auth/callback/line`)
     */
    return `${baseUrl}${isAuthLandingPath(url) ? fallback : url}`
  }

  try {
    const parsed = new URL(url)
    if (parsed.origin !== new URL(baseUrl).origin) return baseUrl
    return isAuthLandingPath(parsed.pathname) ? `${baseUrl}${fallback}` : url
  } catch {
    /* URL ใช้ไม่ได้ — ถอยไปที่เดิมเหมือนพฤติกรรมเดิม */
    return baseUrl
  }
}
