'use client'

/**
 * CancelPackageButton — ปุ่ม "ยกเลิกแพ็กเกจ" บนการ์ด Free เมื่อ subscription ACTIVE (Design Spec §5a)
 *
 * Base: src/app/(paces)/seller/(dashboard)/inventory/components/SubscribeButton.tsx (Swal preConfirm+fetch flow)
 *   + theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx (dangerAlert —
 *   icon:'warning' + confirmButton bg-danger, htmlAlert — html list ใน dialog)
 *
 * ทำไม html list ธุรกิจ + deadline ก่อนยิง POST /cancel:
 * API.md §4.5 บังคับ "client ต้อง confirm dialog (Sweet Alerts) แสดงจำนวน business + deadline ก่อนยิง
 * request นี้" — cancel ล็อกทุก Business shop ของ owner ทันที (grace 30 วัน) เป็น action ทำลายล้างสูง
 * ต้องให้ owner เห็นผลกระทบเต็ม ๆ ก่อนกด (ต่างจาก subscribe/upgrade ที่แค่ถามราคา)
 */

import Icon from '@/components/wrappers/Icon'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'
import { escapeHtml } from '@/lib/html-escape'
import { formatDate } from '@/lib/format-date'

export interface CancelPackageButtonProps {
  /** ชื่อธุรกิจที่ owner เป็นเจ้าของ (owned เท่านั้น — ธุรกิจที่ owner คนอื่น + เราเป็น admin ไม่ถูกล็อกจาก action นี้) */
  ownedBusinessNames: string[]
}

const GRACE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

function cancelErrorMessage(status: number): string {
  if (status === 409) return 'สถานะแพ็กเกจไม่พร้อมยกเลิก (อาจไม่ได้สมัครอยู่แล้ว)'
  return 'ยกเลิกแพ็กเกจไม่สำเร็จ กรุณาลองใหม่'
}

export default function CancelPackageButton({ ownedBusinessNames }: CancelPackageButtonProps) {
  const router = useRouter()

  const handleOpenDialog = async () => {
    // deadline = วันนี้ + 30 วัน (grace เริ่มนับจาก packageLockedAt ที่ server ตั้งตอนนี้ทันที)
    const deadlineLabel = formatDate(new Date(Date.now() + GRACE_DAYS * DAY_MS))
    const listHtml =
      ownedBusinessNames.length > 0
        ? `<ul class="text-start mt-2 mb-2 space-y-1">${ownedBusinessNames
            .map((n) => `<li>&bull; ${escapeHtml(n)}</li>`)
            .join('')}</ul>`
        : ''

    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'warning',
      title: 'ยกเลิกแพ็กเกจ?',
      html: `<div class="text-start">
        <p>ธุรกิจทั้งหมด ${ownedBusinessNames.length} รายการจะถูกล็อกทันที (อ่านได้อย่างเดียว):</p>
        ${listHtml}
        <p>คุณมีเวลา ${GRACE_DAYS} วัน (ถึงวันที่ ${deadlineLabel}) ในการสมัครแพ็กเกจใหม่ก่อนข้อมูลถูกลบถาวร</p>
      </div>`,
      showCancelButton: true,
      confirmButtonText: 'ยืนยันยกเลิกแพ็กเกจ',
      cancelButtonText: 'ไม่ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      customClass: {
        confirmButton: 'btn bg-danger text-white hover:bg-danger-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      preConfirm: async () => {
        try {
          const res = await fetch('/api/business/cancel', { method: 'POST' })
          if (res.ok) return true
          Swal.showValidationMessage(cancelErrorMessage(res.status))
          return false
        } catch {
          Swal.showValidationMessage('เกิดข้อผิดพลาด กรุณาลองใหม่')
          return false
        }
      },
    })

    if (result.isConfirmed && result.value === true) {
      pacesToast.success('ยกเลิกแพ็กเกจสำเร็จ — ธุรกิจถูกล็อกแล้ว')
      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={handleOpenDialog}
      aria-label="ยกเลิกแพ็กเกจ"
      className="btn bg-light text-danger hover:bg-danger/10 w-full inline-flex items-center justify-center gap-1.5"
    >
      <Icon icon="x" className="text-base" aria-hidden="true" />
      ยกเลิกแพ็กเกจ
    </button>
  )
}
