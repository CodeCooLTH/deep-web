'use client'

/**
 * confirmAndSignOut — ถามยืนยันแล้วออกจากระบบฝั่งผู้ขาย (ขั้นตอนเดียวกับปุ่มใน SignOutCard เดิมเป๊ะ)
 *
 * ทำไมแยกออกมา: ทางออกบนมือถือมี 2 ที่ (การ์ดหน้า /shop · แถวท้าย AccountSwitcherSheet) —
 * ปล่อยให้แต่ละที่ประกอบ confirm เอง จะมีที่ที่ข้ามคำถามหรือลืมถอน push token (ถอนอยู่ใน signOutSeller แล้ว)
 */
import { pacesConfirm } from '@/lib/paces-swal'
import { signOutSeller } from '@/lib/sign-out-seller'

export async function confirmAndSignOut(name: string): Promise<void> {
  const confirmed = await pacesConfirm.danger(
    'ออกจากระบบ?',
    `คุณจะออกจากบัญชี ${name} และกลับไปหน้าเข้าสู่ระบบ`,
    { confirmButtonText: 'ออกจากระบบ', cancelButtonText: 'ยกเลิก' },
  )
  if (!confirmed) return
  /* การถอน push token อยู่ใน `signOutSeller` (2026-09-25) — ต้องยิงก่อน signOut() เสมอ */
  await signOutSeller('/auth/sign-in')
}
