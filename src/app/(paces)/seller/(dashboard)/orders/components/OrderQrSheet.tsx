'use client'

/**
 * OrderQrSheet — QR โค้ดของลิงก์ออเดอร์ ให้ลูกค้าสแกนเปิดหน้า /o/{code}
 *  - มือถือ (<lg): bottom-sheet เลื่อนขึ้นจากล่าง · desktop (lg): modal กลางจอ (component เดียว responsive)
 *  - React-state (ไม่ใช้ Preline hs-overlay) — trigger อยู่ในแถว list ที่ re-render (search/filter/lazy-load)
 *    Preline inline-state จะหาย/ค้าง (บทเรียนเดียวกับ OrderCardMenu.tsx)
 *  - QR: qrcode.react (QRCodeSVG) · link row + ปุ่มคัดลอก: reuse CopyLinkButton showPreview (HR9 pacesToast ในตัว)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx (offcanvasBottom: fixed inset-x-0 bottom-0 rounded-t-2xl)
 *       theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx (#standard-modal centered — desktop)
 *       in-app precedent: AccountSwitcherSheet.tsx (scrim bg-default-900/40 + grip + close)
 */

import { useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import Icon from '@/components/wrappers/Icon'
import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'
import type { OrderRow } from './data'
import { formatOrderNo } from '@/lib/order-no'

interface Props {
  order: OrderRow
  /** buyer URL เต็ม (resolved) ที่ QR จะเข้ารหัส — ตัวเดียวกับปุ่มคัดลอกลิงก์ */
  url: string
  onClose: () => void
}

export default function OrderQrSheet({ order, url, onClose }: Props) {
  // ESC ปิด (เหมือนทุก sheet ในแอป)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // เลขคำสั่งซื้อ DP… (user 2026-07-25) — ตรงกับหน้าการ์ด/ตาราง
  const cardId = formatOrderNo(order.publicToken, order.createdAtISO)

  return (
    // HR7: z-80 = viewport overlay lock (Paces ไม่มี token; precedent SalesChartSheet/AccountSwitcherSheet)
    <div
      className="fixed inset-0 z-80 flex items-end justify-center lg:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="QR โค้ดออเดอร์"
    >
      {/* scrim — คลิกเพื่อปิด (precedent AccountSwitcherSheet: bg-default-900/40 backdrop-blur-xs) */}
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="absolute inset-0 bg-default-900/40 backdrop-blur-xs"
      />

      {/* panel — มือถือ: bottom-sheet เต็มกว้าง · desktop: modal กลาง max-w-sm
          HR7: pb-[calc(env(safe-area-inset-bottom)+1.25rem)] — safe-area มือถือ ไม่มี token (precedent sheet อื่น) */}
      <div className="relative w-full max-w-md rounded-t-2xl bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-2 shadow-lg lg:w-full lg:max-w-sm lg:rounded-2xl lg:pb-6 lg:pt-5">
        {/* grip (มือถือเท่านั้น) */}
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-default-300 lg:hidden" />

        {/* close มุมขวาบน (desktop) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="btn btn-icon absolute end-3 top-3 hidden text-default-500 hover:bg-default-100 lg:inline-flex"
        >
          <Icon icon="x" className="text-lg" />
        </button>

        <h3 className="text-center text-base font-bold text-default-900">QR สำหรับลูกค้า</h3>
        <p className="mt-0.5 text-center text-xs text-default-500">ให้ลูกค้าสแกนเพื่อเปิดหน้าออเดอร์</p>

        {/* QR — พื้นขาวเสมอเพื่อสแกนติด (bg-white = utility ปกติ ไม่ใช่ arbitrary) */}
        <div className="mx-auto mt-4 flex w-fit items-center justify-center rounded-2xl border border-default-200 bg-white p-4">
          {url ? (
            <QRCodeSVG value={url} size={160} />
          ) : (
            <span className="flex size-40 items-center justify-center text-default-300">
              <Icon icon="qrcode" className="text-6xl" />
            </span>
          )}
        </div>

        {/* สรุปออเดอร์ */}
        <p className="mt-3 text-center text-xs text-default-500">
          ออเดอร์ <span className="font-semibold text-default-900">{cardId}</span>
          {' · '}
          {order.buyerName ?? 'ลูกค้า'}
          {' · '}
          <span className="font-semibold text-default-900">฿{order.total.toLocaleString('th-TH')}</span>
        </p>

        {/* link + copy — reuse CopyLinkButton showPreview (แถบ URL + ปุ่มคัดลอก) */}
        <div className="mt-4">
          <CopyLinkButton value={url} label="คัดลอก" showPreview />
        </div>
      </div>
    </div>
  )
}
