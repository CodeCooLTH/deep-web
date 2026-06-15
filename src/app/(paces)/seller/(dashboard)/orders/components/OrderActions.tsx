'use client'

/**
 * OrderActions — ชุดปุ่ม action ต่อ 1 ออเดอร์ (centralized) ใช้ทั้ง card (mobile) + table (desktop)
 *
 * จุดประสงค์: source เดียวของ order actions → เพิ่ม/แก้ปุ่มที่นี่ที่เดียว ได้ทั้ง 2 view
 *
 * variant:
 *  - 'table' (desktop) → ปุ่มชัดเรียง [ดู] [แก้ไข] [SMS] [copy] icon-only (ไม่มี ⋮ — user req 2026-06-15)
 *  - 'card'  (mobile)  → copy + SMS (icon+label) + ⋮ (ดู/แก้ไข/ยกเลิก ใน OrderCardMenu)
 *
 * action ทั้งหมดนิยามที่นี่ที่เดียว — เพิ่มปุ่มใหม่ = แก้ component นี้ ได้ทั้ง 2 view
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
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

const ICON_BTN = 'btn btn-icon border-default-300 text-default-700 hover:bg-default-100'

export default function OrderActions({ order, onCancelRequest, variant }: OrderActionsProps) {
  const isTerminal = order.status === 'CONFIRMED' || order.status === 'CANCELLED'
  const canEdit = order.status === 'PENDING'

  // resolve buyer URL runtime (กัน hydration mismatch)
  const [url, setUrl] = useState(`/o/${order.publicToken}`)
  useEffect(() => {
    setUrl(`${resolveBuyerBaseUrl()}/o/${order.publicToken}`)
  }, [order.publicToken])

  // ── desktop (table): button group [ดู][แก้ไข][SMS][copy] icon-only, ไม่มี ⋮ ──
  // button group ตาม theme ui/buttons: inline-flex + rounded-*-none + -ms-px (ปุ่มเชื่อมกัน)
  // ดู=ตัวแรก (rounded-e-none), copy=ตัวสุดท้าย (rounded-s-none), กลาง rounded-none
  if (variant === 'table') {
    return (
      <div className="flex justify-start">
        <div className="inline-flex">
          <Link href={`/orders/${order.publicToken}`} aria-label="ดูรายละเอียด" className={`${ICON_BTN} rounded-e-none`}>
            <Icon icon="eye" className="text-base" />
          </Link>
          {canEdit && (
            <Link href={`/orders/${order.publicToken}/edit`} aria-label="แก้ไข" className={`${ICON_BTN} -ms-px rounded-none`}>
              <Icon icon="pencil" className="text-base" />
            </Link>
          )}
          {!isTerminal && (
            <SendSmsButton publicToken={order.publicToken} iconOnly className="-ms-px rounded-none" />
          )}
          <CopyLinkButton value={url} label="คัดลอกลิงก์" iconOnly className="-ms-px rounded-s-none" />
        </div>
      </div>
    )
  }

  // ── mobile (card): copy + SMS (icon+label) + ⋮ overflow (ดู/แก้ไข/ยกเลิก) ──
  return (
    <div className="flex items-center justify-end gap-1.5">
      <CopyLinkButton value={url} label="คัดลอกลิงก์" />
      {!isTerminal && <SendSmsButton publicToken={order.publicToken} compact />}
      <OrderCardMenu
        token={order.publicToken}
        status={order.status}
        onCancelRequest={onCancelRequest}
      />
    </div>
  )
}
