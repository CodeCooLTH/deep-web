/**
 * OrderCardMenu — ⋮ overflow menu (mobile card เท่านั้น; desktop ใช้ปุ่มชัด ไม่มี ⋮)
 *
 * ใช้ custom React dropdown (useState + click-outside) + class Paces (.dropdown-item/.dropdown-divider)
 * ทำไมไม่ใช้ Preline hs-dropdown: ทดสอบแล้ว (2026-06-15) hs-dropdown เปิดแต่ menu opacity ค้าง 0
 * (มองไม่เห็น) เพราะ list มี lazy-load + filter → React re-render ทำให้ Preline inline-state หาย
 * (Preline+React dynamic-list incompatibility). custom React robust กับ list dynamic.
 *
 * Base (style): theme/paces/Admin/TS/src/assets/css/custom/_dropdown.css (.dropdown-item)
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { OrderStatus } from './data'

interface OrderCardMenuProps {
  /** ชื่อของสิ่งนั้นตามประเภทกิจการ (feature 00030) — ต้องตรงกับเมนู ⋮ ของหน้ารายละเอียด */
  orderNoun?: string
  token: string
  status: OrderStatus
  onCancelRequest: (token: string) => void
}

export default function OrderCardMenu({ token, status, onCancelRequest, orderNoun = 'คำสั่งซื้อ' }: OrderCardMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const isTerminal = status === 'CONFIRMED' || status === 'CANCELLED'
  const canEdit = status === 'PENDING'
  const canCancel = status === 'PENDING' || status === 'SHIPPED'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn-icon border-default-300 text-default-700 hover:bg-default-100 min-h-11 min-w-11"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="เมนูเพิ่มเติม"
        onClick={() => setOpen((p) => !p)}
      >
        <Icon icon="dots-vertical" className="size-4" />
      </button>

      {open && (
        <div
          className="absolute bottom-full right-0 z-30 mb-1 min-w-44 overflow-hidden rounded border border-default-300 bg-card shadow-lg"
          role="menu"
          aria-orientation="vertical"
        >
          <div className="space-y-0.5 p-1">
            {canEdit && (
              <Link href={`/orders/${token}/edit`} className="dropdown-item text-sm" role="menuitem" onClick={() => setOpen(false)}>
                <Icon icon="pencil" className="size-4" />
                แก้ไข{orderNoun}
              </Link>
            )}
            <Link href={`/orders/${token}`} className="dropdown-item text-sm" role="menuitem" onClick={() => setOpen(false)}>
              <Icon icon="eye" className="size-4" />
              ดูรายละเอียด
            </Link>
            {canCancel && <hr className="dropdown-divider" />}
            {canCancel && (
              <button
                type="button"
                className="dropdown-item text-sm text-danger hover:bg-danger/10"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onCancelRequest(token)
                }}
              >
                <Icon icon="x" className="size-4" />
                ยกเลิก{orderNoun}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
