'use client'

/**
 * SendSmsButton — ปุ่มส่งลิงก์ทาง SMS พร้อม Sweet Alerts confirm dialog
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx
 *   (ajaxAlert(): Swal.fire({ preConfirm + showLoaderOnConfirm + allowOutsideClick }))
 *   confirm + fetch ใน flow เดียว; error (402/429/422) แสดงในกล่อง dialog ผ่าน showValidationMessage
 *   (Hard Rule safepay-ux #8 — blocking dialog ใน seller ต้องใช้ Sweet Alerts; ลบ custom card-overlay เดิม)
 *
 * RC-8: ห้ามรับ buyerContact/phone ใดๆ — server-side ดึง buyer phone เองผ่าน DAL
 *
 * compact/iconOnly: ปรับขนาด/รูปแบบปุ่ม trigger; dialog เหมือนกันทุกโหมด (Swal center)
 * ลบ 403-L2 error case ออก — route ไม่ return 403 L2 อีก (product decision 2026-05-17)
 */

import Icon from '@/components/wrappers/Icon'
import { useEffect, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'

// RC-8: ห้ามรับ buyerContact/phone ใดๆ — server-side ดึง buyer phone เองผ่าน DAL
interface SendSmsButtonProps {
  publicToken: string
  /** compact=true → ปุ่มเล็ก icon+text สั้น สำหรับ list row footer */
  compact?: boolean
  /** iconOnly=true → icon button ล้วน (Paces .btn-icon) สำหรับ action bar การ์ด */
  iconOnly?: boolean
  /** class เพิ่ม (เช่น rounded-none สำหรับ button group) — ใช้กับ iconOnly */
  className?: string
  /** emphasis='primary' → ปุ่ม compact เป็นสีน้ำเงินเด่น (CTA หลักในการ์ดออเดอร์); default = outline เดิม (ไม่กระทบ call-site อื่น เช่น StatusHero) */
  emphasis?: 'default' | 'primary'
}

// SUCCESS_RESET_MS: reset ปุ่มกลับ idle หลัง success (ยังใช้งานอยู่)
const SUCCESS_RESET_MS = 3000

// map HTTP status → validation message (HTML; แสดงในกล่อง dialog ผ่าน showValidationMessage)
// หมายเหตุ: ไม่มี case 403 (L2 gate) แล้ว — route ไม่ return 403 อีกตาม product decision 2026-05-17
function smsErrorMessage(status: number): string {
  switch (status) {
    case 402:
      return 'เครดิตไม่พอ — <a href="/wallet" class="underline">ซื้อเครดิต SMS</a>'
    case 429:
      return 'ส่ง SMS บ่อยเกินไป กรุณารอสักครู่'
    case 422:
      return 'ยังไม่มีเบอร์ผู้ซื้อในออเดอร์นี้ — ไม่สามารถส่ง SMS ได้'
    default:
      return 'ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่'
  }
}

export default function SendSmsButton({ publicToken, compact = false, iconOnly = false, className = '', emphasis = 'default' }: SendSmsButtonProps) {
  const [showSuccess, setShowSuccess] = useState(false)

  // useRef เพื่อ clear timeout ได้ทั้ง on unmount และ on state change — กัน leak
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // cleanup timer เมื่อ unmount — กัน setState after unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const handleOpenDialog = async () => {
    // Base: ajaxAlert() — confirm + fetch ใน flow เดียว, error ค้าง dialog ผ่าน showValidationMessage
    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'question',
      title: 'ส่งลิงก์ทาง SMS?',
      text: 'ระบบจะส่งลิงก์คำสั่งซื้อทาง SMS ให้ผู้ซื้อ และหัก ฿1 จากเครดิต SMS ของคุณ',
      showCancelButton: true,
      confirmButtonText: 'ส่ง SMS',
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
          // NO body — RC-8: ห้ามส่ง buyerContact ใดๆ มาจาก client; route ดึงเองผ่าน DAL
          const res = await fetch(`/api/orders/${publicToken}/send-sms`, {
            method: 'POST',
          })
          if (res.ok) return true
          Swal.showValidationMessage(smsErrorMessage(res.status))
          return false
        } catch {
          Swal.showValidationMessage('ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่')
          return false
        }
      },
    })

    if (result.isConfirmed && result.value === true) {
      pacesToast.success('ส่ง SMS แล้ว ฿1 ถูกหักจากเครดิต')
      setShowSuccess(true)
      // reset success state หลัง SUCCESS_RESET_MS
      timerRef.current = setTimeout(() => {
        setShowSuccess(false)
        timerRef.current = null
      }, SUCCESS_RESET_MS)
    }
  }

  // ── ปุ่มหลัก ── (dialog จัดการโดย Swal — ไม่มี overlay JSX ในนี้แล้ว)
  if (showSuccess) {
    return iconOnly ? (
      <span className="btn btn-icon border border-success/30 bg-success/10 text-success" aria-label="ส่ง SMS แล้ว">
        <Icon icon="check" className="text-base" />
      </span>
    ) : (
      <span className="text-xs text-success font-medium">ส่งแล้ว</span>
    )
  }

  return (
    <button
      type="button"
      onClick={handleOpenDialog}
      aria-label="ส่งลิงก์ทาง SMS"
      className={
        iconOnly
          ? `btn btn-icon border border-default-300 bg-card hover:bg-default-50 text-default-700 ${className}`.trim()
          : compact
            ? `btn btn-sm inline-flex items-center gap-1 text-xs min-h-11 ${emphasis === 'primary' ? 'bg-primary text-white hover:bg-primary-hover border border-primary' : 'border border-default-300 bg-card hover:bg-default-50 text-default-700'} ${className}`.trim()
            : 'btn btn-sm border border-default-300 bg-card hover:bg-default-50 text-default-700 inline-flex items-center gap-1.5 text-xs'
      }
    >
      <Icon icon="message" className="text-base" aria-hidden="true" />
      {!iconOnly && (compact ? 'ส่ง SMS' : 'ส่งลิงก์ทาง SMS (฿1)')}
    </button>
  )
}
