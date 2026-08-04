'use client'

/**
 * SubscribeButton — ปุ่มสมัคร Inventory Add-on (฿199/เดือน) พร้อม Sweet Alerts confirm dialog
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/[token]/components/SendSmsButton.tsx (ทั้งไฟล์)
 *   (Swal.fire({ preConfirm + showLoaderOnConfirm + allowOutsideClick }) — confirm + fetch ใน flow เดียว
 *   error ค้าง dialog ผ่าน showValidationMessage; Hard Rule safepay-ux #8/#9 — การเงินใน seller ต้องใช้ Sweet Alerts)
 *
 * ต่างจาก SendSmsButton: ตัด showSuccess local-state + timer ทิ้ง — subscribe ทำครั้งเดียวจบ
 * (สำเร็จแล้ว entitlement เปลี่ยนสถานะ → หน้าเปลี่ยนเองผ่าน router.refresh() ไม่ต้อง reset ปุ่มกลับ idle)
 */

import Icon from '@/components/wrappers/Icon'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'

// map HTTP status → validation message (แสดงในกล่อง dialog ผ่าน showValidationMessage)
function subscribeErrorMessage(status: number): string {
  switch (status) {
    case 402:
      return 'ยอดเงินไม่พอ — <a href="/wallet" class="underline">เติมเงินก่อนสมัคร</a>'
    case 409:
      return 'สมัครใช้งานอยู่แล้ว'
    default:
      return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  }
}

export default function SubscribeButton() {
  const router = useRouter()

  const handleOpenDialog = async () => {
    // Base: SendSmsButton.handleOpenDialog — confirm + fetch ใน flow เดียว, error ค้าง dialog ผ่าน showValidationMessage
    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'question',
      title: 'สมัคร Inventory Add-on?',
      text: 'ระบบจะหักเงิน ฿199 จากกระเป๋าเงินของคุณทันที และเริ่มรอบใช้งาน 30 วัน',
      showCancelButton: true,
      confirmButtonText: 'สมัคร ฿199',
      cancelButtonText: 'ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      // preConfirm: ยิง POST ระหว่าง dialog ค้าง; ถ้า error → showValidationMessage (dialog ไม่ปิด)
      preConfirm: async () => {
        try {
          const res = await fetch('/api/inventory/subscribe', {
            method: 'POST',
          })
          if (res.ok) return true
          Swal.showValidationMessage(subscribeErrorMessage(res.status))
          return false
        } catch {
          Swal.showValidationMessage('เกิดข้อผิดพลาด กรุณาลองใหม่')
          return false
        }
      },
    })

    if (result.isConfirmed && result.value === true) {
      pacesToast.success('สมัคร Inventory Add-on สำเร็จ')
      // ไม่ setShowSuccess local state — ทำครั้งเดียวจบ หน้าจะเปลี่ยนเองผ่าน refresh (entitlement เปลี่ยนสถานะ)
      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={handleOpenDialog}
      aria-label="สมัคร Inventory Add-on"
      className="btn bg-primary text-white hover:bg-primary-hover w-full inline-flex items-center justify-center gap-1.5"
    >
      <Icon icon="rocket" className="text-base" aria-hidden="true" />
      สมัครใช้งาน
    </button>
  )
}
