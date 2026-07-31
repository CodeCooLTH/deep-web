/**
 * OrderOverflowMenu — เมนู ⋮ (action รอง) ของหน้ารายละเอียดคำสั่งซื้อ (seller), S-5/S-6
 *
 * รับ `items` ที่คำนวณมาแล้วจาก `getOrderActionSet()` (order-action-set.ts, T5 contract) — ไฟล์นี้
 * ไม่มี logic ต่อสถานะเอง แค่ render list ที่ได้รับมา ปุ่ม destructive (key === 'cancel-order' =
 * "ยกเลิกคำสั่งซื้อ") ใช้ text-danger ตามสเปก
 *
 * ใช้ custom React dropdown (useState + click-outside) แทน Preline hs-dropdown — เหตุผลเดียวกับ
 * OrderCardMenu.tsx: hs-dropdown เปิดแต่ menu opacity ค้าง 0 เมื่อ list/สถานะ re-render (Preline
 * inline-state หาย). custom React robust กับ list dynamic (บทเรียน 2026-06-15)
 *
 * size: 'lg' = 44px trigger (แถบ action ล่าง <1024, ทุกปุ่มต้อง tap target ≥44px) / 'sm' = 37px
 * (.btn-icon ปกติของ Paces — มุมขวาบนของการ์ดหัวหน้า/แถบตรึง ≥1024)
 * dropDirection: 'up' = กางขึ้น (ปุ่มติดขอบล่างจอ กันเมนูโดนตัด) / 'down' = กางลง (ปกติ)
 *
 * Base (dropdown markup + click-outside pattern): orders/components/OrderCardMenu.tsx
 * Base (style .dropdown-item): theme/paces/Admin/TS/src/assets/css/custom/_dropdown.css
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import { useEffect, useRef, useState } from 'react'
import type { ActionItem } from './order-action-set'

export interface OrderOverflowMenuProps {
  items: ActionItem[]
  onAction: (key: string) => void
  /** 44px (แถบล่าง) / 37px (inline·stuck) — ค่าเริ่มต้น 'sm' */
  size?: 'sm' | 'lg'
  /** ทิศทางกางเมนู — ค่าเริ่มต้น 'down' */
  dropDirection?: 'up' | 'down'
}

// key เดียวใน order-action-set.ts ที่เป็น action ทำลายล้าง (ยกเลิกคำสั่งซื้อ) — ต้องเด่นด้วย text-danger
const DESTRUCTIVE_KEYS = new Set(['cancel-order'])

export default function OrderOverflowMenu({ items, onAction, size = 'sm', dropDirection = 'down' }: OrderOverflowMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // ไม่มี action รองเลย (เช่น CONFIRMED ที่ไม่มี field พัสดุ) → ไม่ render ปุ่ม ⋮ เปล่า ๆ
  if (items.length === 0) return null

  // .btn-icon (Paces) = size-9.25 (37px) โดย default; ปุ่มขนาด 44px ใช้ min-h-11/min-w-11
  // override ขึ้นไป (min-width/min-height ชนะ width/height ที่ตั้งไว้ก่อนหน้าตาม CSS spec) —
  // pattern เดียวกับ OrderCardMenu.tsx ไม่ต้องเติม arbitrary size ใหม่
  const sizeClass = size === 'lg' ? 'min-h-11 min-w-11' : ''
  const menuPositionClass = dropDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={`btn btn-icon border border-default-300 text-default-700 hover:bg-default-100 justify-center ${sizeClass}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="ตัวเลือกเพิ่มเติม"
        onClick={() => setOpen((p) => !p)}
      >
        <Icon icon="dots-vertical" className="text-lg" />
      </button>

      {open && (
        <div
          className={`absolute end-0 z-30 ${menuPositionClass} min-w-44 overflow-hidden rounded border border-default-300 bg-card shadow-lg`}
          role="menu"
          aria-orientation="vertical"
        >
          <div className="space-y-0.5 p-1">
            {items.map((item) => {
              const destructive = DESTRUCTIVE_KEYS.has(item.key)
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`dropdown-item text-sm ${destructive ? 'text-danger hover:bg-danger/10' : ''}`}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    onAction(item.key)
                  }}
                >
                  <Icon icon={item.icon} className="size-4" />
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
