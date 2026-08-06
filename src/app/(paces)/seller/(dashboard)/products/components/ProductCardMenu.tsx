/**
 * ProductCardMenu — ⋮ overflow menu (mobile card สินค้าเท่านั้น; desktop table ใช้ปุ่มแยก)
 *
 * ใช้ custom React dropdown (useState + click-outside) แบบเดียวกับ OrderCardMenu — ห้าม hs-dropdown
 * (Preline inline-state ค้างกับ list ที่ lazy-load + filter re-render บ่อย — ดูคอมเมนต์ต้นเหตุใน
 * OrderCardMenu.tsx)
 *
 * ปุ่มลบย้ายมาอยู่ในเมนูนี้ทั้งหมด (เดิมเป็นปุ่มแดงลอยอยู่บนการ์ด แย่งลำดับชั้นกับ "แก้ไข")
 * ปิด/เปิดการขาย = สีปกติไม่ใช่ danger เพราะย้อนกลับได้ในคลิกเดียว ต่างจาก "ลบ" ที่ถาวร
 *
 * Base (style): theme/paces/Admin/TS/src/assets/css/custom/_dropdown.css (.dropdown-item/.dropdown-divider)
 * Structural template: src/app/(paces)/seller/(dashboard)/orders/components/OrderCardMenu.tsx (ก็อปทั้งโครง)
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

interface ProductCardMenuProps {
  productId: string
  isActive: boolean
  onActiveToggle: (productId: string, nextIsActive: boolean) => void
  onDeleteRequest: (productId: string) => void
}

export default function ProductCardMenu({ productId, isActive, onActiveToggle, onDeleteRequest }: ProductCardMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

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
            <Link
              href={`/products/${productId}`}
              className="dropdown-item text-sm"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <Icon icon="eye" className="size-4" />
              ดูรายละเอียด
            </Link>
            <hr className="dropdown-divider" />
            {/* ปิด/เปิดการขาย — ย้อนกลับได้ในคลิกเดียว จึงไม่ใช้สี danger */}
            <button
              type="button"
              className="dropdown-item text-sm"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onActiveToggle(productId, !isActive)
              }}
            >
              <Icon icon={isActive ? 'eye-off' : 'eye'} className="size-4" />
              {isActive ? 'ปิดการขาย' : 'เปิดขาย'}
            </button>
            <hr className="dropdown-divider" />
            <button
              type="button"
              className="dropdown-item text-sm text-danger hover:bg-danger/10"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onDeleteRequest(productId)
              }}
            >
              <Icon icon="trash" className="size-4" />
              ลบสินค้า
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
