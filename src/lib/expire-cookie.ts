/**
 * expire-cookie — ลบคุกกี้ให้ **เบราว์เซอร์ยอมรับจริง** (แก้ 2026-09-20)
 *
 * ## บั๊กที่แก้ — ด่าน 3.1.1 ล้าง session ไม่ออก แล้วกลายเป็นลูป
 *
 * หัวหน้าเจอบน iPad: ล็อกอิน Apple แล้ว **จอขาว เลื่อนไม่ได้** ลากรีเฟรชได้แค่จอโหลดค้าง
 *
 * ลูกโซ่:
 *   1. บัญชีนั้นมีร้านที่ยังตั้งค่าไม่เสร็จ ⇒ `shouldBlockAppRegistration()` = true
 *   2. `proxy.ts` เตะไป `/auth/sign-in?app_setup_required=1` พร้อม **สั่งลบคุกกี้ session**
 *   3. 🛑 คำสั่งลบนั้น **ไม่มีผลบน prod** — `res.cookies.delete(name)` ของ Next ส่งออกไปว่า
 *      `__Secure-next-auth.session-token=; Path=/; Expires=1970…` **ไม่มีแฟล็ก `Secure`**
 *      และตามสเปกคุกกี้ ชื่อที่ขึ้นต้น `__Secure-` ที่ไม่มีแฟล็กนั้น **ถูกเบราว์เซอร์ทิ้งทั้งใบ**
 *      ⇒ session เดิมยังอยู่ครบ
 *   4. หน้า `/auth/sign-in` เห็นว่ายังล็อกอินอยู่ ⇒ ส่งกลับ `/dashboard`
 *   5. `/dashboard` เจอด่านเดิม ⇒ กลับไปข้อ 2 **วนไม่จบ** ⇒ WebView ได้หน้าเปล่า
 *
 * พิสูจน์ด้วยการยิง `NextResponse.redirect(...).cookies.delete(...)` แล้วอ่าน `Set-Cookie`
 * ที่ออกไปจริง (มีเทสปักไว้ในไฟล์เทสของโมดูลนี้ ไม่ใช่เชื่อจากเอกสาร)
 *
 * 🛑 ชื่อธรรมดา (dev บน http) ต้อง **ไม่มี** `Secure` — ใส่ไปเบราว์เซอร์จะทิ้งคำสั่งลบเหมือนกัน
 * เกณฑ์จึงต้องดูจาก *ชื่อคุกกี้* ไม่ใช่ตั้งค่าเดียวกันหมด
 *
 * 🛑 ต้องลบ **ลูกที่ถูกหั่น** ด้วย — next-auth หั่นคุกกี้ที่ยาวเกิน 4096 ไบต์เป็น `.0`, `.1`, …
 * (`next-auth/core/lib/cookie.js`) ลบเฉพาะชื่อหลักจะเหลือลูกค้างแล้ว session ยังประกอบกลับได้
 */
import type { NextResponse } from 'next/server'

/** จำนวนลูกที่ตามไปลบ — JWT ของเราอยู่ราว 1KB ใบเดียว เผื่อไว้ 3 ใบพอสำหรับกรณีโตผิดปกติ */
const MAX_CHUNKS = 3

/**
 * ชื่อนี้ต้องมีแฟล็ก `Secure` ไหม
 *
 * `__Secure-` และ `__Host-` เป็น prefix ที่เบราว์เซอร์บังคับกติกาเอง — ส่งคำสั่งที่ไม่ตรงกติกา
 * ไม่ได้ error อะไรเลย มันแค่ **เงียบ ๆ ไม่ทำตาม** ซึ่งคือสิ่งที่เกิดขึ้นจริงบน prod
 */
export function cookieNeedsSecure(name: string): boolean {
  return name.startsWith('__Secure-') || name.startsWith('__Host-')
}

/**
 * สั่งลบคุกกี้ 1 ใบ (พร้อมลูกที่ถูกหั่น) ลงใน response ที่ส่งกลับไป
 *
 * ใช้ `set` ค่าว่าง + `maxAge: 0` ไม่ใช่ `delete()` เพราะต้องคุมแอตทริบิวต์เอง
 * `path: '/'` ต้องตรงกับตอนตั้ง ไม่งั้นเบราว์เซอร์มองเป็นคนละใบแล้วไม่ลบ
 */
export function expireCookie(res: NextResponse, name: string): void {
  for (const suffix of ['', ...Array.from({ length: MAX_CHUNKS }, (_, i) => `.${i}`)]) {
    res.cookies.set(`${name}${suffix}`, '', {
      path: '/',
      maxAge: 0,
      ...(cookieNeedsSecure(name) ? { secure: true } : {}),
    })
  }
}

/** ลบหลายใบในคำสั่งเดียว — ผู้เรียกส่งรายชื่อทั้งแบบ `__Secure-` และชื่อธรรมดามาได้เลย */
export function expireCookies(res: NextResponse, names: readonly string[]): void {
  for (const name of names) expireCookie(res, name)
}
