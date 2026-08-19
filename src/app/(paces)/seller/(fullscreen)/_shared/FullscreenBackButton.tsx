/**
 * ปุ่มกลับ (back) สำหรับ fullscreen overlay pages — client component
 *
 * ทำไมแยก component: FullscreenPageHeader เป็น server component
 * แต่ router.back() ต้องใช้ useRouter (client) → แยก client ย่อยออกมา
 * แล้ว import เข้า server component ได้โดยตรง
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerMobileHeader.tsx
 *       (back button: w-11 h-11 rounded-xl + history-aware → /dashboard fallback — pattern เดียวกัน)
 *
 * feature 00035 (รื้อ canvas 2026-08-07 รอบสอง) — prop `isDirty` optional: ปุ่มนี้เคย router.push()
 * ตรง ๆ โดยไม่เช็คว่ามีงานที่ยังไม่บันทึกค้างอยู่ (ตัวจัดหน้าร้านมี useUnsavedChangesGuard ดัก
 * beforeunload/popstate ไว้แล้ว แต่ปุ่มนี้เป็น in-app navigation ไม่ผ่าน guard นั้นเลย — งานหายเงียบ ๆ)
 * เด้ง pacesConfirm เดียวกับปุ่ม "ยกเลิก" ก่อนออกเมื่อ isDirty=true — ไม่ส่ง/false = พฤติกรรมเดิมเป๊ะ
 */
'use client'

import { Icon } from '@iconify/react'
import { useRouter } from 'next/navigation'

import { pacesConfirm } from '@/lib/paces-swal'

export default function FullscreenBackButton({
  backHref,
  isDirty,
  className,
}: {
  backHref?: string
  isDirty?: boolean
  /**
   * สไตล์ของปุ่มตามบริบทที่ไปวาง — ไม่ส่ง = ค่าเดิมของหน้า fullscreen (bg-light)
   *
   * 🛑 มีไว้เพราะ **ปุ่มต้องเข้ากับแถบที่มันอยู่ ไม่ใช่เข้ากับหน้าอื่นที่ใช้ component เดียวกัน**
   * หัวแชทมีปุ่มไอคอนข้าง ๆ ที่ใช้ primitive `.btn.btn-icon` ของ Paces อยู่แล้ว ปุ่มย้อนกลับ
   * ที่แปะสไตล์ของหน้า fullscreen (พื้น `bg-light` ทึบ) จะเด่นผิดจังหวะกว่าเพื่อนบ้านทั้งแถว
   * (user ทัก 2026-08-19: "ปุ่มย้อนกลับของแชทต้องเหมือนเมนู tab อื่น ๆ ดูธีมระบบด้วย")
   *
   * ใช้ primitive ของธีมเสมอ ห้ามส่งค่าดิบเข้ามา (Hard Rule 7)
   */
  className?: string
}) {
  const router = useRouter()

  const navigateAway = () => {
    // backHref = ปลายทางตายตัว (เช่น orders/new → /orders เสมอ ไม่ใช่ previous)
    if (backHref) {
      router.push(backHref)
      return
    }
    // deep-link safe: ถ้าไม่มี history → ไป /dashboard แทน back() ออกแอป
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/dashboard')
    }
  }

  const handleBack = async () => {
    if (isDirty) {
      const confirmed = await pacesConfirm.warning(
        'ออกจากหน้านี้โดยไม่บันทึก?',
        'การเปลี่ยนแปลงที่ยังไม่บันทึกจะหายไปทั้งหมด',
        { confirmButtonText: 'ออกจากหน้านี้' },
      )
      if (!confirmed) return
    }
    navigateAway()
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="กลับ"
      // bg-light resting state (ปุ่มจริง ไม่จาง) — Base: theme ui/buttons "btn bg-light"; rounded-lg = radius token
      className={
        className ??
        'w-11 h-11 rounded-lg bg-light text-default-700 hover:bg-light-hover hover:text-dark active:scale-95 transition-transform inline-flex items-center justify-center shrink-0'
      }
    >
      {/* tabler:arrow-left ตาม convention project (raw @iconify/react — ใส่ prefix เอง) */}
      <Icon icon="tabler:arrow-left" width={22} height={22} />
    </button>
  )
}
