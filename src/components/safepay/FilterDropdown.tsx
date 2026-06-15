/**
 * FilterDropdown — Single Button Dropdown (Paces theme) สำหรับ filter ใน toolbar
 *
 * ใช้แทน native <select> ใน OrdersTable: ปุ่มโชว์ icon + label ของค่าที่เลือก, เปิด
 * เป็น dropdown menu (.dropdown-item ตาม theme). active filter = soft-primary
 *
 * กลไก open/close = custom React (useState + click-outside + Escape) ไม่ใช่ Preline
 * hs-dropdown — เพราะ toolbar re-render ทุกครั้งที่เลือก filter → Preline inline-state
 * หายแล้ว menu opacity ค้าง 0 (บทเรียน OrderCardMenu 2026-06-15). custom React robust.
 *
 * Base (markup/visual): theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx
 *   → SingleButtonDropdowns (.hs-dropdown-toggle btn / .dropdown-item)
 * Base (CSS .dropdown-item): theme/paces/Admin/TS/src/assets/css/custom/_dropdown.css
 * Base (click-outside pattern): src/app/(paces)/seller/(dashboard)/orders/components/OrderCardMenu.tsx
 *
 * Shared reusable — ใช้ได้ทุกหน้า (paces) ที่ต้องการ filter dropdown (orders, products,
 * settings ฯลฯ). ดู docs/system/ui-guideline/paces-component-reference.md §FilterDropdown
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import { useEffect, useRef, useState } from 'react'

export interface FilterOption {
  value: string
  label: string
}

interface FilterDropdownProps {
  /** tabler icon name นำหน้าปุ่ม (เช่น 'truck') — ไม่ส่ง = ไม่มี icon (เช่น page size) */
  icon?: string
  /** ค่าที่เลือกปัจจุบัน */
  value: string
  /** option ทั้งหมดใน menu (รวมตัว "ทั้งหมด" ถ้ามี) */
  options: FilterOption[]
  onChange: (value: string) => void
  /** label บนปุ่มเมื่อ value === resetValue (เช่น "สถานะ") — ไม่ส่ง = โชว์ label ของ option ที่ match เสมอ */
  defaultLabel?: string
  /** ค่าที่ถือว่า "ยังไม่กรอง/default" (เช่น 'All') — value === resetValue → ปุ่ม neutral + defaultLabel */
  resetValue?: string
  /** เปิดลงขวา (กัน overflow ขอบจอ เช่น page size ท้าย toolbar) */
  align?: 'left' | 'right'
  /** class เพิ่มที่ปุ่ม trigger */
  className?: string
}

export default function FilterDropdown({
  icon,
  value,
  options,
  onChange,
  defaultLabel,
  resetValue,
  align = 'left',
  className = '',
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const selected = options.find((o) => o.value === value)
  // active = มี resetValue และ value ไม่ใช่ค่า default
  const isActive = resetValue !== undefined && value !== resetValue
  // label บนปุ่ม: default state → defaultLabel; มีค่า/ไม่มี resetValue → label ของ option
  const triggerLabel =
    !isActive && defaultLabel !== undefined ? defaultLabel : (selected?.label ?? defaultLabel ?? '')

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
        className={`btn text-nowrap ${
          isActive ? 'bg-primary/15 text-primary hover:bg-primary hover:text-white' : 'bg-light text-dark'
        } ${className}`.trim()}
      >
        {icon && <Icon icon={icon} className="text-base" />}
        {triggerLabel}
        <Icon
          icon="chevron-down"
          className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className={`absolute top-full z-30 mt-1 min-w-44 rounded border border-default-300 bg-card p-1 shadow-lg ${
            align === 'right' ? 'end-0' : 'start-0'
          }`}
          role="menu"
          aria-orientation="vertical"
        >
          {options.map((opt) => {
            const active = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitem"
                className={`dropdown-item ${active ? 'active' : ''}`}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
              >
                {/* check icon ซ้ายเมื่อ active; spacer กว้างเท่ากันเมื่อไม่ active เพื่อ align text */}
                {active ? (
                  <Icon icon="check" className="size-4 shrink-0 text-primary" />
                ) : (
                  <span className="size-4 shrink-0" aria-hidden="true" />
                )}
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
