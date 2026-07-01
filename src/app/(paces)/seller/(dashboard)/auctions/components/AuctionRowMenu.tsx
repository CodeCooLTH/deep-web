'use client'

/**
 * AuctionRowMenu — ⋮ overflow menu ต่อ 1 ประมูล (ใช้ทั้งการ์ดมือถือ AuctionRow + คอลัมน์ ⋮ ของ
 * AuctionDataTable desktop — ต่างจาก orders ที่ desktop ใช้ปุ่มชัดแยก ไม่มี ⋮)
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/components/OrderCardMenu.tsx
 *   (custom React dropdown + click-outside — เหตุผลเดิม: Preline hs-dropdown opacity ค้าง 0
 *   เมื่อ list re-render จาก filter/lazy-load)
 * เปลี่ยนจาก OrderCardMenu: เปิดลงล่าง (`top-full`) แทนเปิดขึ้นบน (`bottom-full`) — ใช้ได้ทั้งในการ์ด
 * มือถือกลางลิสต์และแถวตาราง desktop โดยไม่ชนขอบบนของ .card/thead
 *
 * 🔑 Correction จาก UI-DESIGN-SPEC เดิม (ตรวจกับ backend contract จริงใน auction.service.ts):
 *   - publishAuction() รับเฉพาะ auction ที่ status==='draft' เท่านั้น (409 ถ้า status อื่น)
 *     → ไม่มี action "เผยแพร่ทันที" สำหรับ scheduled (สเปกเดิมเขียนไว้แต่ backend ไม่รองรับ)
 *   - ไม่มี DELETE endpoint ใน Batch A-C (7 endpoint: create/list/detail/update/publish/cancel/end-early)
 *     → ไม่มี action "ลบ" สำหรับ draft (ใช้ "ยกเลิก" แทนได้ถ้าต้องการเอาออกจากรายการที่ใช้งาน)
 *   Controller: ถ้าต้องการ 2 action นี้จริง ต้องเพิ่ม FR/endpoint ใหม่ก่อน (ไม่ใช่ scope Batch D#9)
 */

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { AuctionStatus } from './data'

interface AuctionRowMenuProps {
  id: string
  status: AuctionStatus
  bidCount: number
  onPublishRequest: (id: string) => void
  onCancelRequest: (id: string) => void
}

export default function AuctionRowMenu({ id, status, bidCount, onPublishRequest, onCancelRequest }: AuctionRowMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const canEdit = status === 'draft' || status === 'scheduled'
  const canPublish = status === 'draft'
  const canCancel = status === 'draft' || status === 'scheduled' || (status === 'live' && bidCount === 0)

  return (
    <div className="relative shrink-0" ref={ref}>
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
          className="absolute right-0 top-full z-30 mt-1 min-w-44 overflow-hidden rounded border border-default-300 bg-card shadow-lg"
          role="menu"
          aria-orientation="vertical"
        >
          <div className="space-y-0.5 p-1">
            {canEdit && (
              <Link
                href={`/auctions/${id}/edit`}
                className="dropdown-item text-sm"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <Icon icon="pencil" className="size-4" />
                แก้ไข
              </Link>
            )}
            {canPublish && (
              <button
                type="button"
                className="dropdown-item text-sm"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onPublishRequest(id)
                }}
              >
                <Icon icon="send" className="size-4" />
                เผยแพร่
              </button>
            )}
            <Link
              href={`/auctions/${id}`}
              className="dropdown-item text-sm"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
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
                  onCancelRequest(id)
                }}
              >
                <Icon icon="x" className="size-4" />
                ยกเลิก
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
