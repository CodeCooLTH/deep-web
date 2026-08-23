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

import { resolveBackNavigation } from '@/lib/back-navigation'
import { pacesConfirm } from '@/lib/paces-swal'

export default function FullscreenBackButton({
  backHref,
  backFallbackHref,
  isDirty,
}: {
  backHref?: string
  backFallbackHref?: string
  isDirty?: boolean
}) {
  const router = useRouter()

  const navigateAway = () => {
    /**
     * 🛑 ตรรกะทั้งหมดอยู่ที่ `resolveBackNavigation` (ฟังก์ชันบริสุทธิ์) ไม่ใช่ที่นี่ —
     * เดิมเป็น if/else ในนี้แล้วสาขา `backHref` สั่ง **`push`** ซึ่งเพิ่ม entry เข้าประวัติ
     * ⇒ หน้าแก้ไขออเดอร์กับหน้ารายละเอียดผลักกันไปมาไม่รู้จบ (user เจอบน prod 2026-08-23)
     * ไม่มี gate ไหนจับได้เพราะ `router.push()` ถูกทุกตัวอักษร — ยกออกไปให้เทสจับแทน
     */
    const nav = resolveBackNavigation({
      backHref,
      backFallbackHref,
      historyLength: typeof window === 'undefined' ? 0 : window.history.length,
    })

    if (nav.action === 'back') router.back()
    else if (nav.action === 'replace') router.replace(nav.href)
    else router.push(nav.href)
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
      className="w-11 h-11 rounded-lg bg-light text-default-700 hover:bg-light-hover hover:text-dark active:scale-95 transition-transform inline-flex items-center justify-center shrink-0"
    >
      {/* tabler:arrow-left ตาม convention project (raw @iconify/react — ใส่ prefix เอง) */}
      <Icon icon="tabler:arrow-left" width={22} height={22} />
    </button>
  )
}
