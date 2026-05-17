'use client'

/**
 * CancelOrderModal — Confirm modal สำหรับยกเลิกออเดอร์จาก list page
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 *   (card overlay/backdrop shell — hs-overlay controlled via React state แทน data-hs-overlay
 *    เหมือน pattern ใน TopUpRequestModal)
 * CSS: theme/paces/Admin/TS/src/assets/css/custom/_modal.css
 *   (bg-default-900/50 backdrop, card wrapper)
 *
 * ทำไมใช้ controlled prop แทน hs-overlay attribute:
 *   modal เปิดจาก React state ใน parent (OrdersList) — ต้องการ reset/close ผ่าน onClose
 *   ไม่ใช่ Preline trigger จาก DOM element โดยตรง
 *
 * ห้ามใช้ window.confirm — D3 convention (docs/conventions/seller-action-placement.md §3)
 *
 * Toast: ToastContainer mount อยู่แล้วใน AppProvidersWrapper (paces layout)
 */

import { Icon } from '@iconify/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'react-toastify'

interface CancelOrderModalProps {
  open: boolean
  token: string | null
  displayId?: string
  onClose: () => void
}

export default function CancelOrderModal({
  open,
  token,
  displayId,
  onClose,
}: CancelOrderModalProps) {
  const router = useRouter()
  const [isCancelling, setIsCancelling] = useState(false)

  // modal ปิด → reset และส่งกลับ parent
  const handleClose = () => {
    if (isCancelling) return
    onClose()
  }

  const handleConfirm = async () => {
    if (!token || isCancelling) return
    setIsCancelling(true)
    try {
      const res = await fetch(`/api/orders/${token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        toast.success('ยกเลิกออเดอร์แล้ว')
        router.refresh()
        onClose()
      } else {
        // ดึงข้อความ error จาก response ก่อน fallback
        const data = await res.json().catch(() => ({}))
        toast.error(
          typeof data?.error === 'string' ? data.error : 'ยกเลิกออเดอร์ไม่สำเร็จ กรุณาลองใหม่',
        )
        // modal ค้างไว้เพื่อให้ retry
      }
    } catch {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
      // modal ค้างไว้เพื่อให้ retry
    } finally {
      setIsCancelling(false)
    }
  }

  if (!open) return null

  return (
    /* overlay backdrop — copy shell จาก AddCategoryModal แล้วปรับเป็น controlled React state
       bg-dark/40 ตาม spec; กดนอก card = ปิด (เหมือน TopUpRequestModal pattern) */
    <div
      className="size-full fixed top-0 start-0 z-80 overflow-x-hidden overflow-y-auto bg-dark/40 flex items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancelOrderModalLabel"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      {/* animation wrapper — copy จาก hs-overlay-animation-target ใน _modal.css */}
      <div className="ease-in-out transition-all duration-200 sm:max-w-sm w-[calc(100%-24px)] m-3 sm:mx-auto flex items-center">
        <div className="w-full flex flex-col card pointer-events-auto">

          {/* Header */}
          <div className="card-header p-5">
            <h3 id="cancelOrderModalLabel" className="font-medium text-sm">
              ยกเลิกออเดอร์
            </h3>
            <button
              type="button"
              aria-label="ปิด"
              onClick={handleClose}
              disabled={isCancelling}
              className="disabled:opacity-40"
            >
              <Icon icon="tabler:x" className="text-2xl align-middle text-default-600" />
            </button>
          </div>

          {/* Body — danger icon + ข้อความยืนยัน */}
          <div className="card-body flex flex-col items-center text-center gap-4 py-6">
            {/* วงกลม danger icon */}
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
              <Icon icon="tabler:circle-x" className="text-3xl" />
            </span>

            <div>
              <p className="font-semibold text-default-800 text-base">ยกเลิกออเดอร์นี้?</p>
              <p className="mt-1 text-sm text-default-500">
                {displayId
                  ? `ออเดอร์ #${displayId} จะถูกปิด · ย้อนกลับไม่ได้`
                  : 'ออเดอร์นี้จะถูกปิด · ย้อนกลับไม่ได้'}
              </p>
            </div>
          </div>

          {/* Footer — 2 ปุ่ม */}
          <div className="flex justify-end items-center gap-x-2 border-t border-default-300 card-body">
            <button
              type="button"
              className="btn bg-light hover:text-primary disabled:opacity-40"
              onClick={handleClose}
              disabled={isCancelling}
            >
              ไม่ใช่ตอนนี้
            </button>
            <button
              type="button"
              className="btn bg-danger text-white hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-2"
              onClick={handleConfirm}
              disabled={isCancelling || !token}
            >
              {isCancelling && (
                <Icon icon="tabler:loader-2" className="size-4 animate-spin" />
              )}
              ยืนยันยกเลิก
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
