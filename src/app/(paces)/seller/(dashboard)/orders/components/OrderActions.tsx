'use client'

/**
 * OrderActions — ชุดปุ่ม action ต่อ 1 ออเดอร์ (centralized) ใช้ทั้ง card (mobile) + table (desktop)
 *
 * จุดประสงค์: source เดียวของ order actions → เพิ่ม/แก้ปุ่มที่นี่ที่เดียว ได้ทั้ง 2 view เท่ากัน
 * actions: คัดลอกลิงก์ + ส่ง SMS (non-terminal) + ⋮ (ดูรายละเอียด / แก้ไข / ยกเลิก ใน OrderCardMenu)
 *
 * variant:
 *  - 'card'  (mobile) → ปุ่มแบบ icon + label
 *  - 'table' (desktop) → icon only (ประหยัดพื้นที่ใน cell)
 */

import { useEffect, useState } from 'react'
import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'
import SendSmsButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/SendSmsButton'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import type { OrderRow } from './data'
import OrderCardMenu from './OrderCardMenu'

export type OrderActionsVariant = 'card' | 'table'

interface OrderActionsProps {
  order: OrderRow
  onCancelRequest: (token: string) => void
  variant: OrderActionsVariant
}

export default function OrderActions({ order, onCancelRequest, variant }: OrderActionsProps) {
  const iconOnly = variant === 'table'
  const isTerminal = order.status === 'CONFIRMED' || order.status === 'CANCELLED'

  // resolve buyer URL runtime (กัน hydration mismatch)
  const [url, setUrl] = useState(`/o/${order.publicToken}`)
  useEffect(() => {
    setUrl(`${resolveBuyerBaseUrl()}/o/${order.publicToken}`)
  }, [order.publicToken])

  return (
    // table = จัดกลาง (ตรงกับ header "จัดการ" ที่ text-center); card = ชิดขวา
    <div className={`flex items-center gap-1.5 ${iconOnly ? 'justify-center' : 'justify-end'}`}>
      {/* คัดลอกลิงก์ผู้ซื้อ (component จัด btn/btn-icon เอง) */}
      <CopyLinkButton value={url} label="คัดลอกลิงก์" iconOnly={iconOnly} />

      {/* ส่ง SMS — เฉพาะ non-terminal */}
      {!isTerminal && (
        <SendSmsButton publicToken={order.publicToken} compact={!iconOnly} iconOnly={iconOnly} />
      )}

      {/* ⋮ overflow: ดูรายละเอียด / แก้ไข / ยกเลิก */}
      <OrderCardMenu
        token={order.publicToken}
        status={order.status}
        onCancelRequest={onCancelRequest}
      />
    </div>
  )
}
