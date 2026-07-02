'use client'

/**
 * RowActionDeleteButton — ปุ่ม action ระดับแถว (ยกเลิกคำเชิญ / ลบสมาชิก) พร้อม Sweet Alerts confirm
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx
 *   (cancelButton(): Swal.fire({ icon:'warning', showCancelButton, confirmButtonText, customClass }))
 * + in-app precedent (Swal preConfirm+fetch ใน flow เดียว, error ค้าง dialog ผ่าน showValidationMessage):
 *   src/app/(paces)/seller/(dashboard)/inventory/components/SubscribeButton.tsx
 *
 * ใช้ร่วมกัน 2 จุด: ยกเลิกคำเชิญ (DELETE .../invites/[id]) + ลบสมาชิก (DELETE .../members/[id])
 * ต่างแค่ endpoint/ข้อความ/error map — โครง Swal เดียวกันทั้งคู่ จึงรวมเป็น component เดียว กัน duplicate
 */

import Icon from '@/components/wrappers/Icon'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'

interface RowActionDeleteButtonProps {
  endpoint: string
  ariaLabel: string
  icon: string
  confirmTitle: string
  confirmText: string
  successMessage: string
  /** map error code (จาก { error: CODE }) → ข้อความไทย */
  errorMessages: Record<string, string>
}

export default function RowActionDeleteButton({
  endpoint,
  ariaLabel,
  icon,
  confirmTitle,
  confirmText,
  successMessage,
  errorMessages,
}: RowActionDeleteButtonProps) {
  const router = useRouter()

  const handleClick = async () => {
    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'warning',
      title: confirmTitle,
      text: confirmText,
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      customClass: {
        confirmButton: 'btn bg-danger text-white hover:bg-danger-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      preConfirm: async () => {
        try {
          const res = await fetch(endpoint, { method: 'DELETE' })
          if (res.ok) return true
          const data = await res.json().catch(() => ({}))
          Swal.showValidationMessage(errorMessages[data?.error as string] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
          return false
        } catch {
          Swal.showValidationMessage('เกิดข้อผิดพลาด กรุณาลองใหม่')
          return false
        }
      },
    })

    if (result.isConfirmed && result.value === true) {
      pacesToast.success(successMessage)
      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      className="btn btn-sm btn-icon bg-danger/15 text-danger hover:bg-danger/25"
    >
      <Icon icon={icon} className="text-sm" aria-hidden="true" />
    </button>
  )
}
