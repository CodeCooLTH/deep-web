'use client'

/**
 * signOutSeller — ออกจากระบบฝั่งผู้ขาย โดยล้างของที่ค้างให้ครบ (แก้ 2026-09-17)
 *
 * ## ทำไมต้องมีตัวกลาง ไม่เรียก `signOut()` ตรง ๆ
 *
 * `signOut()` ของ next-auth **ล้างแค่คุกกี้ session ตัวเดียว** ที่เหลือค้างทั้งหมด
 * และเคยทำให้เกิดบั๊ก prod มาแล้ว (`callback-url` ค้าง ⇒ ล็อกอินสำเร็จแล้วถูกส่งกลับ
 * หน้าล็อกอิน) ⇒ ถ้าปล่อยให้แต่ละที่เรียกเอง จะมีที่ที่ลืมล้างเสมอ
 *
 * 🛑 ต้องยิงล้าง **ก่อน** `signOut()` — หลังจากนั้นหน้าจะถูกพาออกไปทันที โค้ดที่ตามหลัง
 * `signOut()` ไม่มีโอกาสทำงาน (บทเรียนเดียวกับการถอน push token ใน `SignOutCard`)
 *
 * 🛑 ล้มก็ต้องออกจากระบบให้ได้ — ผู้ใช้กด "ออกจากระบบ" แล้วต้องได้ออกเสมอ
 * ยอมให้คุกกี้ค้างดีกว่าค้างอยู่ในระบบที่ตั้งใจจะออก (มีเพดานเวลาไว้ด้วย)
 */
import { signOut } from 'next-auth/react'

/** เพดานเวลารอการล้าง — เน็ตช้าต้องไม่ทำให้ "ออกจากระบบ" ค้าง */
const CLEANUP_TIMEOUT_MS = 2000

export async function signOutSeller(callbackUrl = '/auth/sign-in'): Promise<void> {
  try {
    await Promise.race([
      fetch('/api/auth/cleanup', { method: 'POST', credentials: 'include' }),
      new Promise((resolve) => setTimeout(resolve, CLEANUP_TIMEOUT_MS)),
    ])
  } catch {
    /* เงียบโดยตั้งใจ — ดูเหตุผลหัวไฟล์ */
  }
  await signOut({ callbackUrl })
}
