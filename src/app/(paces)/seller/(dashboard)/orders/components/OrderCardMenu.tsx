/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx (hs-dropdown pattern L31-55)
 *       theme/paces/Admin/TS/src/assets/css/custom/_dropdown.css (dropdown CSS primitive)
 *
 * SafePay domain component — ไม่มี theme equivalent ตรง.
 * dropdown เปิดขึ้นบน (bottom-full) ตาม mockup list.html L202-210 เพื่อไม่ overflow ออกนอก card
 * เนื้อหาเมนูผันตาม status ตาม convention §3 + §4 (seller-action-placement.md)
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import type { OrderStatus } from './data'

interface OrderCardMenuProps {
  token: string
  status: OrderStatus
  onCancelRequest: (token: string) => void
}

export default function OrderCardMenu({ token, status, onCancelRequest }: OrderCardMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // ปิด dropdown เมื่อคลิกนอก component (Preline hs-dropdown ทำแบบนี้เช่นกัน)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // CONFIRMED / CANCELLED → เหลือแค่ "ดูรายละเอียด"
  const isTerminal = status === 'CONFIRMED' || status === 'CANCELLED'
  const canEdit = status === 'PENDING'
  const canCancel = status === 'PENDING' || status === 'SHIPPED'

  // คัดลอกลิงก์ผู้ซื้อ — ย้ายมาจาก footer การ์ด (redesign v8.2); feedback = toast แทน icon-flash
  const handleCopyLink = async () => {
    const url = `${resolveBuyerBaseUrl()}/o/${token}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // fallback HTTP context
      const el = document.createElement('textarea')
      el.value = url
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    toast.success('คัดลอกลิงก์ผู้ซื้อแล้ว')
    setOpen(false)
  }

  return (
    // ใช้ relative + ref เพื่อ detect click outside แทน Preline JS ที่ต้องการ browser env
    <div className="relative" ref={ref}>
      {/* min-h-11 = touch target ≥44px (impeccable product rule M3-#1) */}
      <button
        type="button"
        className="btn btn-sm btn-icon min-h-11 border-default-300 text-default-700 hover:bg-default-100"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="เมนูเพิ่มเติม"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Icon icon="dots-vertical" className="size-4" />
      </button>

      {open && (
        // dropdown ลอยขึ้น (bottom-full) ตาม mockup — ป้องกัน overflow ออกนอกหน้า
        <div
          className="absolute bottom-full right-0 z-30 mb-1 min-w-44 overflow-hidden rounded border border-default-300 bg-card shadow-lg"
          role="menu"
          aria-orientation="vertical"
        >
          <div className="space-y-0.5 p-1">
            {/* คัดลอกลิงก์ผู้ซื้อ — แสดงทุกสถานะ */}
            <button
              type="button"
              className="dropdown-item text-sm"
              role="menuitem"
              onClick={handleCopyLink}
            >
              <Icon icon="copy" className="size-4" />
              คัดลอกลิงก์ผู้ซื้อ
            </button>
            <hr className="dropdown-divider" />

            {!isTerminal && (
              <>
                {/* แก้ไขออเดอร์ — เฉพาะ PENDING */}
                {canEdit && (
                  <Link
                    href={`/orders/${token}/edit`}
                    className="dropdown-item text-sm"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    <Icon icon="pencil" className="size-4" />
                    แก้ไขออเดอร์
                  </Link>
                )}

                {/* ดูรายละเอียด */}
                <Link
                  href={`/orders/${token}`}
                  className="dropdown-item text-sm"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  <Icon icon="eye" className="size-4" />
                  ดูรายละเอียด
                </Link>

                {/* divider คั่นก่อน destructive ตาม convention §3 */}
                {canCancel && <hr className="dropdown-divider" />}

                {/* ยกเลิกออเดอร์ — เฉพาะ PENDING/SHIPPED; text-danger + confirm modal (D3) */}
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
                    ยกเลิกออเดอร์
                  </button>
                )}
              </>
            )}

            {/* terminal status: เหลือแค่ ดูรายละเอียด */}
            {isTerminal && (
              <Link
                href={`/orders/${token}`}
                className="dropdown-item text-sm"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <Icon icon="eye" className="size-4" />
                ดูรายละเอียด
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
