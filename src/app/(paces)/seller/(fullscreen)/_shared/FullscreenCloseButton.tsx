/**
 * ปุ่มปิด fullscreen overlay — client component เพราะต้องใช้ router.back()
 *
 * ไม่มี Paces fullscreen-overlay layout ตรง ๆ (Explore E2 ยืนยัน: theme/paces/Admin/TS/src/layouts/
 * มีแต่ Vertical/Horizontal/Main ซึ่งเป็น sidebar-shell ทั้งหมด ไม่มี fullscreen-overlay)
 *
 * Nearest structural ref:
 *   theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/page.tsx
 *   — Discard button ในกลุ่ม action-bar (className "btn bg-danger text-white")
 *
 * ใช้ router.back() เพื่อรักษา UX (กลับหน้าก่อน) — fallback ไป /dashboard
 * ถ้าไม่มี history (เช่น เปิด URL โดยตรง); proxy rewrite ครอบให้อัตโนมัติบน seller subdomain
 */
'use client'

import { Icon } from '@iconify/react'
import { useRouter } from 'next/navigation'

export default function FullscreenCloseButton() {
  const router = useRouter()

  const onClose = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      // fallback: ไม่มี history → ไป dashboard (proxy rewrite ครอบให้บน seller subdomain)
      router.push('/dashboard')
    }
  }

  return (
    <button
      type="button"
      onClick={onClose}
      className="btn btn-icon border border-default-300 text-default-900 hover:bg-default-50 flex items-center gap-2 px-4 py-2"
    >
      {/* tabler:x ตาม convention icons ของ project (tabler icon names) */}
      <Icon icon="tabler:x" width={20} height={20} />
      <span className="hidden sm:inline">ยกเลิก</span>
    </button>
  )
}
