/**
 * ปุ่มกลับ (back) สำหรับ fullscreen overlay pages — client component
 *
 * ทำไมแยก component: FullscreenPageHeader เป็น server component
 * แต่ router.back() ต้องใช้ useRouter (client) → แยก client ย่อยออกมา
 * แล้ว import เข้า server component ได้โดยตรง
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerMobileHeader.tsx
 *       (back button: w-11 h-11 rounded-xl + history-aware → /dashboard fallback — pattern เดียวกัน)
 */
'use client'

import { Icon } from '@iconify/react'
import { useRouter } from 'next/navigation'

export default function FullscreenBackButton() {
  const router = useRouter()

  const handleBack = () => {
    // deep-link safe: ถ้าไม่มี history → ไป /dashboard แทน back() ออกแอป
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="กลับ"
      className="w-11 h-11 rounded-xl text-[#374151] hover:bg-gray-50 inline-flex items-center justify-center shrink-0"
    >
      {/* tabler:arrow-left ตาม convention project (raw @iconify/react — ใส่ prefix เอง) */}
      <Icon icon="tabler:arrow-left" width={22} height={22} />
    </button>
  )
}
