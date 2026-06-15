'use client'

/**
 * SendSmsButton — ปุ่มส่งลิงก์ทาง SMS พร้อม confirm dialog
 *
 * Base (dialog shell): src/app/(paces)/seller/(dashboard)/orders/components/CancelOrderModal.tsx
 *   (controlled overlay/card/confirm-cancel pattern — backdrop bg-dark/40, card, card-header/body/footer)
 *   ดู Base เดิมของ CancelOrderModal: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 *
 * RC-8: ห้ามรับ buyerContact/phone ใดๆ — server-side ดึง buyer phone เองผ่าน DAL
 *
 * compact prop (ใหม่): ตอน true ปุ่มเล็ก icon+text สั้น สำหรับ list row; false = ปกติ
 * dialog เหมือนกันทั้งสองโหมด
 *
 * เปลี่ยนจาก inline 2-step (confirm state + timeout 5s) → confirm dialog
 * ลบ 403-L2 error case ออก — route ไม่ return 403 L2 อีก (product decision 2026-05-17)
 */

import { Icon } from '@iconify/react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'

// RC-8: ห้ามรับ buyerContact/phone ใดๆ — server-side ดึง buyer phone เองผ่าน DAL
interface SendSmsButtonProps {
  publicToken: string
  /** compact=true → ปุ่มเล็ก icon+text สั้น สำหรับ list row footer */
  compact?: boolean
  /** iconOnly=true → icon button ล้วน (Paces .btn-icon) สำหรับ action bar การ์ด */
  iconOnly?: boolean
}

// SUCCESS_RESET_MS: reset ปุ่มกลับ idle หลัง success (ยังใช้งานอยู่)
const SUCCESS_RESET_MS = 3000

export default function SendSmsButton({ publicToken, compact = false, iconOnly = false }: SendSmsButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sending, setSending] = useState(false)
  // error message แยกตาม HTTP status — บางเคส embed JSX ด้วย Link
  const [errorNode, setErrorNode] = useState<React.ReactNode | null>(null)
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

  const handleOpenDialog = () => {
    setErrorNode(null)
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    if (sending) return
    setDialogOpen(false)
    setErrorNode(null)
  }

  const handleSend = async () => {
    if (sending) return
    setSending(true)
    setErrorNode(null)

    try {
      // NO body — RC-8: ห้ามส่ง buyerContact ใดๆ มาจาก client; route ดึงเองผ่าน DAL
      const res = await fetch(`/api/orders/${publicToken}/send-sms`, {
        method: 'POST',
      })

      if (res.ok) {
        toast.success('ส่ง SMS แล้ว ฿1 ถูกหักจากเครดิต')
        setDialogOpen(false)
        setShowSuccess(true)
        // reset success state หลัง SUCCESS_RESET_MS
        timerRef.current = setTimeout(() => {
          setShowSuccess(false)
          timerRef.current = null
        }, SUCCESS_RESET_MS)
        return
      }

      // แปลง HTTP error เป็น inline node — แสดงใน dialog
      const errorResult = buildErrorNode(res.status)
      setErrorNode(errorResult)
    } catch {
      // network / unexpected error
      setErrorNode('ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* ── ปุ่มหลัก ── */}
      {showSuccess ? (
        iconOnly ? (
          <span className="btn btn-icon border border-success/30 bg-success/10 text-success" aria-label="ส่ง SMS แล้ว">
            <Icon icon="tabler:check" className="text-base" />
          </span>
        ) : (
          <span className="text-xs text-success font-medium">ส่งแล้ว</span>
        )
      ) : (
        <button
          type="button"
          onClick={handleOpenDialog}
          aria-label="ส่งลิงก์ทาง SMS"
          className={
            iconOnly
              ? 'btn btn-icon border border-default-300 bg-card hover:bg-default-50 text-default-700'
              : compact
                ? 'btn btn-sm border border-default-300 bg-card hover:bg-default-50 text-default-700 inline-flex items-center gap-1 px-2 py-1 text-xs'
                : 'btn btn-sm border border-default-300 bg-card hover:bg-default-50 text-default-700 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs'
          }
        >
          <Icon icon="tabler:message" className="text-base" aria-hidden="true" />
          {!iconOnly && (compact ? 'ส่ง SMS' : 'ส่งลิงก์ทาง SMS (฿1)')}
        </button>
      )}

      {/* ── Confirm Dialog — Base: CancelOrderModal (overlay/card/card-header/card-body/card-footer) ── */}
      {dialogOpen && (
        /* overlay backdrop — controlled React state เหมือน CancelOrderModal */
        <div
          className="size-full fixed top-0 start-0 z-80 overflow-x-hidden overflow-y-auto bg-dark/40 flex items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sendSmsDialogLabel"
          tabIndex={-1}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseDialog()
          }}
        >
          {/* animation wrapper — copy จาก CancelOrderModal */}
          <div className="ease-in-out transition-all duration-200 sm:max-w-sm w-[calc(100%-24px)] m-3 sm:mx-auto flex items-center">
            <div className="w-full flex flex-col card pointer-events-auto">

              {/* Header */}
              <div className="card-header p-5">
                <h3 id="sendSmsDialogLabel" className="font-medium text-sm">
                  ยืนยันส่งลิงก์ทาง SMS
                </h3>
                <button
                  type="button"
                  aria-label="ปิด"
                  onClick={handleCloseDialog}
                  disabled={sending}
                  className="disabled:opacity-40"
                >
                  <Icon icon="tabler:x" className="text-2xl align-middle text-default-600" />
                </button>
              </div>

              {/* Body */}
              <div className="card-body flex flex-col items-center text-center gap-4 py-6">
                {/* วงกลม primary icon */}
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon icon="tabler:message-forward" className="text-3xl" />
                </span>

                <div>
                  <p className="font-semibold text-default-800 text-base">ส่งลิงก์ทาง SMS?</p>
                  <p className="mt-1 text-sm text-default-500">
                    ระบบจะส่งลิงก์คำสั่งซื้อทาง SMS ให้ผู้ซื้อ และหัก ฿1 จากเครดิต SMS ของคุณ
                  </p>
                </div>

                {/* inline error (แสดงใน dialog ก่อนปิด) */}
                {errorNode && (
                  <p className="text-danger text-xs w-full text-left" role="alert">
                    {errorNode}
                  </p>
                )}
              </div>

              {/* Footer — 2 ปุ่ม */}
              <div className="flex justify-end items-center gap-x-2 border-t border-default-300 card-body">
                <button
                  type="button"
                  className="btn bg-light hover:text-primary disabled:opacity-40"
                  onClick={handleCloseDialog}
                  disabled={sending}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="btn bg-primary text-white hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-2"
                  onClick={handleSend}
                  disabled={sending}
                >
                  {sending && (
                    <Icon icon="tabler:loader-2" className="size-4 animate-spin" />
                  )}
                  ส่ง SMS
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  )
}

// แยก function เพื่อความชัดเจน — map HTTP status → inline error node
// หมายเหตุ: ลบ case 403 (L2 gate) ออกแล้ว — route ไม่ return 403 อีกตาม product decision 2026-05-17
function buildErrorNode(status: number): React.ReactNode {
  switch (status) {
    case 402:
      return (
        <>
          เครดิตไม่พอ —{' '}
          <Link href="/wallet" className="underline hover:text-danger-dark">
            ซื้อเครดิต SMS
          </Link>
        </>
      )
    case 429:
      return 'ส่ง SMS บ่อยเกินไป กรุณารอสักครู่'
    case 422:
      return 'ยังไม่มีเบอร์ผู้ซื้อในออเดอร์นี้ — ไม่สามารถส่ง SMS ได้'
    default:
      return 'ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่'
  }
}
