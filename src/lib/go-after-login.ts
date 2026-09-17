'use client'

/**
 * goAfterLogin — พาไปหน้าถัดไปหลังล็อกอินสำเร็จ (แก้ 2026-09-17)
 *
 * ## บั๊กที่แก้
 *
 * ล็อกอิน `appreview` ด้วยรหัสผ่านแล้ว **ไม่พาเข้าไป ต้องรีเฟรชเอง** (หัวหน้าเจอบน iPhone)
 *
 * ## สองอย่างที่ต้องทำ และแต่ละอย่างแก้คนละปัญหา
 *
 * **1. รอให้เห็น session ก่อน** — `signIn(..., { redirect: false })` คืน `ok: true` ทันทีที่
 * เซิร์ฟเวอร์ **ยอมรับรหัสผ่าน** ไม่ได้แปลว่า **เบราว์เซอร์เก็บคุกกี้ลงแล้ว**
 * ⇒ ไปทันทีอาจยิงคำขอที่ยังไม่มีคุกกี้ ⇒ proxy เตะกลับหน้าล็อกอิน
 * (`getSession()` ยิงเน็ตจริง ไม่ใช่อ่านแคช — ตรวจซอร์สของ next-auth แล้ว)
 *
 * **2. hard-navigate ไม่ใช่ `router.push`/`router.refresh`**
 *
 * 🛑 รอบ #67 ใช้ `router.refresh()` + `router.push()` แล้ว **ยังต้องรีเฟรชเองอยู่ดี** —
 * เพราะรีโปนี้เคยเจอปัญหาเดียวกันตอนสลับร้านและ **เลิกใช้ `router.refresh()` ไปแล้ว**
 * ด้วยเหตุผลที่เขียนไว้เองใน `useShopSwitcher.ts`:
 *
 *   "hard-navigate เสมอ (ไม่ใช่ router.refresh) — บังคับ server data ทุกหน้า re-render ใหม่หมด"
 *
 * การล็อกอินเปลี่ยน **ตัวตนของผู้ใช้** ⇒ ทุกหน้าที่เรนเดอร์ฝั่งเซิร์ฟเวอร์ต้องคิดใหม่หมด
 * (เมนู · สิทธิ์ · ร้านที่ active) — สถานการณ์เดียวกับการสลับร้านเป๊ะ
 *
 * ## 🛑 ทำไมต้องเป็นตัวกลาง ไม่ให้แต่ละที่เขียนเอง
 *
 * ตอนไล่จริงมี **8 จุด** ในระบบที่ล็อกอินแล้วพาไปหน้าถัดไป — ผู้ขาย 4 (รหัสผ่าน · OTP สมัคร ·
 * OTP เข้าระบบ · รับคำเชิญ) · แอดมิน 2 · ผู้ซื้อ 2 — ปล่อยให้แต่ละที่เขียนเอง จะมีที่ที่ลืมเสมอ
 * และคนแก้จะเห็นแค่จุดที่ตัวเองกำลังดูอยู่ (บทเรียนเดียวกับ `signOutSeller`)
 *
 * เทสที่กันถอย (`__tests__/go-after-login.test.ts`) จึง **กวาดทั้ง `src/`** หาทุก
 * `signIn(redirect:false)` เอง ไม่ใช่รายชื่อไฟล์ที่ฮาร์ดโค้ดไว้ — ทางเข้าใหม่ที่เพิ่มทีหลัง
 * จะถูกจับได้เองโดยไม่ต้องมีใครจำมาแก้เทส
 */
import { getSession } from 'next-auth/react'

import { waitForSession } from '@/lib/wait-for-session'

export interface GoAfterLoginDeps {
  waitForSession: typeof waitForSession
  getSession: typeof getSession
  /* ฉีดเข้ามาได้เพื่อเทส — jsdom แทนที่ window.location ตรง ๆ ไม่ได้ */
  assign: (url: string) => void
  reload: () => void
}

const realDeps: GoAfterLoginDeps = {
  waitForSession,
  getSession,
  assign: (url) => window.location.assign(url),
  reload: () => window.location.reload(),
}

/**
 * @param destination ปลายทาง — ไม่ส่ง = โหลดหน้าเดิมใหม่ (ใช้เมื่อหน้าปัจจุบันจะเปลี่ยนเนื้อหา
 *   เองเมื่อ session เปลี่ยน เช่นหน้ารับคำเชิญ)
 *
 * 🛑 ถามไม่เห็น session ก็ต้องไปต่อ ไม่ใช่ค้าง — ผู้ใช้กดปุ่มแล้วต้องได้ผลลัพธ์เสมอ
 * (ถ้าไปแล้วโดนเตะกลับจริง อย่างน้อยเขาเห็นหน้าล็อกอินพร้อมลองใหม่ ดีกว่าจอค้าง)
 *
 * ใช้ `assign` ไม่ใช่ `replace` — ให้ปุ่มย้อนกลับยังทำงานตามปกติ
 */
export async function goAfterLogin(
  destination?: string,
  deps: GoAfterLoginDeps = realDeps,
): Promise<void> {
  await deps.waitForSession(deps.getSession)
  if (destination) {
    deps.assign(destination)
    return
  }
  deps.reload()
}
