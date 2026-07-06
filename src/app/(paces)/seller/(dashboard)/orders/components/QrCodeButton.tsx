'use client'

/**
 * QrCodeButton — ปุ่ม icon QR ในแถบ action ของการ์ด/ตารางออเดอร์ + จัดการเปิด/ปิด OrderQrSheet เอง
 *  - self-contained state (เหมือน OrderCardMenu) — robust กับ list ที่ re-render (Preline inline-state ไม่รอด)
 *  - resolve buyer URL ตอน mount (ไม่รอกด) เพื่อเลี่ยง flash ตอนเปิด sheet
 *  - QR/link เข้ารหัส shortCode (สั้น) fallback publicToken — ตรงกับ CopyLinkButton ใน OrderActions
 *
 * Base: theme/paces/Admin/TS/src/assets/css/custom/_buttons.css (.btn.btn-icon)
 */

import { useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import type { OrderRow } from './data'
import OrderQrSheet from './OrderQrSheet'

interface Props {
  order: OrderRow
  /** class เพิ่มบนปุ่ม trigger (เช่น min-h-11 การ์ด / -ms-px rounded-none กลุ่มปุ่มตาราง) */
  className?: string
}

export default function QrCodeButton({ order, className = '' }: Props) {
  const [open, setOpen] = useState(false)

  const copyCode = order.shortCode || order.publicToken
  // เริ่ม '' → resolve เป็น URL เต็มตอน mount (useEffect รันก่อนผู้ใช้กดเปิด sheet ได้)
  // ทำให้ QR ไม่ encode relative path ชั่วขณะ + fallback icon ใน OrderQrSheet ทำงานถูก
  const [url, setUrl] = useState('')
  useEffect(() => {
    setUrl(`${resolveBuyerBaseUrl()}/o/${copyCode}`)
  }, [copyCode])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="แสดง QR โค้ด"
        title="QR โค้ด"
        className={`btn btn-icon border border-default-300 bg-card hover:bg-default-50 text-default-700 ${className}`.trim()}
      >
        <Icon icon="qrcode" className="text-base" />
      </button>
      {open && <OrderQrSheet order={order} url={url} onClose={() => setOpen(false)} />}
    </>
  )
}
