'use client'

/**
 * UpgradeToProCard — การ์ดโปรโมทอัพเกรดจาก Deep Stock (BASIC) → Deep Stock Pro
 * (feat 00009 S-16, FR-DSP-06) แสดงเฉพาะเมื่อ entitlement ACTIVE + package BASIC
 *
 * Base (โครงการ์ด): src/app/(paces)/seller/(dashboard)/inventory/components/AdvanceWarningBanner.tsx
 *   (role="alert" full-width rounded-lg border/bg block + ปุ่ม/ลิงก์ท้ายบรรทัด) — สลับ tone จาก
 *   warning เป็น primary tone (border-primary/20 bg-primary/10) ตาม UX-Design-Spec.md ส่วน S-16
 * Base (confirm + fetch flow): SubscribeButton.tsx (Swal.fire preConfirm + showLoaderOnConfirm +
 *   showValidationMessage + allowOutsideClick guard) — POST /api/inventory/upgrade (API.md §4.2)
 *
 * Adaptations vs AdvanceWarningBanner:
 * - ปุ่ม CTA แทนลิงก์ท้ายบรรทัด (ต้องเปิด Sweet Alerts confirm ไม่ใช่ navigate ไปหน้าอื่น)
 * - เพิ่ม icon `crown` นำหน้าหัวข้อ (promo tone — สื่อถึง "อัพเกรด")
 * - client component (มี Sweet Alerts state) ต่างจาก banner ต้นทางที่เป็น server component ล้วน
 */

import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { INVENTORY_PRO_PRICE } from '@/lib/inventory-addon'

// map HTTP status → validation message — Base: SubscribeButton.tsx subscribeErrorMessage
// (route /api/inventory/upgrade คืน data.error เป็นไทยอยู่แล้วสำหรับ 409/500 — ใช้ตรง ๆ,
// 402 override เป็นข้อความมีลิงก์ /wallet ให้สอดคล้อง pattern เดียวกับ SubscribeButton/PackageSelector)
function upgradeErrorMessage(status: number, apiError: string): string {
  if (status === 402) {
    return 'ยอดเงินไม่พอ — <a href="/wallet" class="underline">เติมเงินก่อนอัพเกรด</a>'
  }
  if (status === 409) {
    return apiError || 'ไม่สามารถอัพเกรดได้ในขณะนี้'
  }
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
}

export default function UpgradeToProCard() {
  const router = useRouter()

  const handleUpgrade = async () => {
    // Base: SubscribeButton.tsx handleOpenDialog ทั้งฟังก์ชัน (confirm+fetch ใน flow เดียว,
    // error ค้าง dialog ผ่าน showValidationMessage)
    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'question',
      title: 'อัพเกรดเป็น Deep Stock Pro?',
      text: `จ่ายเต็ม ฿${INVENTORY_PRO_PRICE} ไม่มีการคิดตามสัดส่วนวันที่เหลือ`,
      showCancelButton: true,
      confirmButtonText: `อัพเกรด ฿${INVENTORY_PRO_PRICE}`,
      cancelButtonText: 'ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      // preConfirm: ยิง POST (ไม่มี body — API.md §4.2) ระหว่าง dialog ค้าง; error → showValidationMessage
      preConfirm: async () => {
        try {
          const res = await fetch('/api/inventory/upgrade', { method: 'POST' })
          const data = await res.json().catch(() => ({}))
          if (res.ok) return true
          Swal.showValidationMessage(upgradeErrorMessage(res.status, data?.error ?? ''))
          return false
        } catch {
          Swal.showValidationMessage('เกิดข้อผิดพลาด กรุณาลองใหม่')
          return false
        }
      },
    })

    if (result.isConfirmed && result.value === true) {
      pacesToast.success('อัพเกรดเป็น Deep Stock Pro สำเร็จ')
      router.refresh()
    }
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-primary"
    >
      <div className="flex items-center gap-2">
        <Icon icon="crown" className="size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-bold">อัพเกรดเป็น Deep Stock Pro</p>
          <p className="font-normal text-primary/80">
            ปลดล็อกแจ้งเตือนสต็อกใกล้หมด ประวัติการเคลื่อนไหว และนำเข้า/ส่งออก CSV
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleUpgrade}
        className="btn shrink-0 bg-primary text-white hover:bg-primary-hover"
      >
        อัพเกรด ฿{INVENTORY_PRO_PRICE}
      </button>
    </div>
  )
}
