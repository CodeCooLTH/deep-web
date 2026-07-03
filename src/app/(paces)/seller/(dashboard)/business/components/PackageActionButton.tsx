'use client'

/**
 * PackageActionButton — ปุ่ม "สมัคร"/"อัพเกรด" บนการ์ด tier ของ package matrix พร้อม Sweet Alerts confirm
 *
 * Base: src/app/(paces)/seller/(dashboard)/inventory/components/SubscribeButton.tsx (ทั้งไฟล์)
 *   (Swal.fire({ preConfirm + showLoaderOnConfirm + allowOutsideClick }) — confirm + fetch ใน flow เดียว
 *   error ค้าง dialog ผ่าน showValidationMessage; Hard Rule safepay-ux #8/#9 — การเงินใน seller ต้องใช้ Sweet Alerts)
 *
 * ต่างจาก SubscribeButton (feature 00003 — แผนเดียว ฿199 คงที่):
 * - รับ tier + price + mode ('subscribe' | 'upgrade') เป็น prop เพราะ 4 tier มีราคา/endpoint ต่างกัน
 *   (มิเรอร์ API.md §4.2 POST /business/subscribe และ §4.3 POST /business/upgrade)
 * - error mapping ต่างจาก inventory เพราะ error code ชุดใหม่ (API.md §5): 412 PERSONAL_SHOP_REQUIRED,
 *   409 SUBSCRIPTION_ALREADY_EXISTS/NOT_AN_UPGRADE, 402 INSUFFICIENT_CREDIT
 */

import Icon from '@/components/wrappers/Icon'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'
import type { BusinessPackageTier } from '@/lib/business-package'

export interface PackageActionButtonProps {
  tier: BusinessPackageTier
  tierLabel: string
  price: number
  mode: 'subscribe' | 'upgrade'
}

// map HTTP status + error code → ข้อความ validation message (API.md §5)
function actionErrorMessage(status: number, code: string | undefined, mode: 'subscribe' | 'upgrade'): string {
  if (status === 402) return 'เครดิตไม่พอ — <a href="/wallet" class="underline">เติมเครดิตก่อน</a>'
  if (status === 412) return 'ยังไม่พบร้านค้าส่วนตัวสำหรับหักเครดิต'
  if (status === 409 && code === 'SUBSCRIPTION_ALREADY_EXISTS') return 'สมัครแพ็กเกจอยู่แล้ว'
  if (status === 409 && code === 'SUBSCRIPTION_NOT_ACTIVE') return 'สถานะแพ็กเกจไม่พร้อมอัพเกรด'
  if (status === 409 && code === 'NOT_AN_UPGRADE') return 'เลือก tier ที่สูงกว่าปัจจุบันเท่านั้น'
  if (status === 400) return 'ข้อมูลไม่ถูกต้อง'
  return mode === 'subscribe' ? 'สมัครแพ็กเกจไม่สำเร็จ กรุณาลองใหม่' : 'อัพเกรดแพ็กเกจไม่สำเร็จ กรุณาลองใหม่'
}

export default function PackageActionButton({ tier, tierLabel, price, mode }: PackageActionButtonProps) {
  const router = useRouter()
  const priceLabel = `฿${price.toLocaleString('th-TH')}`
  const endpoint = mode === 'subscribe' ? '/api/business/subscribe' : '/api/business/upgrade'
  const actionLabel = mode === 'subscribe' ? 'สมัคร' : 'อัพเกรด'

  const handleOpenDialog = async () => {
    // Base: SubscribeButton.handleOpenDialog — confirm + fetch ใน flow เดียว, error ค้าง dialog ผ่าน showValidationMessage
    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'question',
      title: `${actionLabel}แพ็กเกจ ${tierLabel}?`,
      text:
        mode === 'subscribe'
          ? `ระบบจะหักเครดิต ${priceLabel} จากกระเป๋าเงินของคุณทันที และเริ่มรอบใช้งาน 30 วัน`
          : `ระบบจะหักเครดิตเต็มราคา ${priceLabel} ทันทีและเริ่มรอบใหม่ (ไม่คิดเศษวันจากรอบเดิม)`,
      showCancelButton: true,
      confirmButtonText: `${actionLabel} ${priceLabel}`,
      cancelButtonText: 'ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      preConfirm: async () => {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tier }),
          })
          if (res.ok) return true
          const body = await res.json().catch(() => ({}))
          Swal.showValidationMessage(actionErrorMessage(res.status, body?.error, mode))
          return false
        } catch {
          Swal.showValidationMessage('เกิดข้อผิดพลาด กรุณาลองใหม่')
          return false
        }
      },
    })

    if (result.isConfirmed && result.value === true) {
      pacesToast.success(`${actionLabel}แพ็กเกจ ${tierLabel} สำเร็จ`)
      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={handleOpenDialog}
      aria-label={`${actionLabel}แพ็กเกจ ${tierLabel}`}
      className="btn bg-primary text-white hover:bg-primary-hover w-full inline-flex items-center justify-center gap-1.5"
    >
      <Icon icon="rocket" className="text-base" aria-hidden="true" />
      {actionLabel}
    </button>
  )
}
