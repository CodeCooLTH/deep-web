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
import { useState } from 'react'
import FilterDropdownShell from './FilterDropdownShell'

export interface FilterOptionBadge {
  /** ตัวเลขท้าย option (เช่น จำนวนออเดอร์ต่อกองงาน) */
  label: string | number
  /** class ของ badge — token ตามความหมาย เช่น 'bg-warning/15 text-warning-ink' */
  className: string
}

export interface FilterOption {
  value: string
  label: string
  /** ตัวเลขท้าย option (เช่น จำนวนต่อกองงานพัสดุ) — ไม่ส่ง = ไม่มี badge */
  badge?: FilterOptionBadge
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
  className = ''
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false)

  const selected = options.find(o => o.value === value)
  // active = มี resetValue และ value ไม่ใช่ค่า default
  const isActive = resetValue !== undefined && value !== resetValue
  // label บนปุ่ม: default state → defaultLabel; มีค่า/ไม่มี resetValue → label ของ option
  const triggerLabel = !isActive && defaultLabel !== undefined ? defaultLabel : (selected?.label ?? defaultLabel ?? '')

  return (
    <FilterDropdownShell
      isActive={isActive}
      open={open}
      onOpenChange={setOpen}
      align={align}
      className={className}
      triggerContent={
        <>
          {icon && <Icon icon={icon} className='text-base' />}
          {triggerLabel}
        </>
      }
    >
      {/* role อยู่ที่นี่ ไม่ใช่ที่เปลือก — เนื้อหาของ component นี้เป็น menuitem ล้วน */}
      <div role='menu' aria-orientation='vertical'>
        {options.map(opt => {
          const active = opt.value === value
          return (
            <button
              key={opt.value}
              type='button'
              role='menuitem'
              className={`dropdown-item ${active ? 'active' : ''}`}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
            >
              {/* check icon ซ้ายเมื่อ active; spacer กว้างเท่ากันเมื่อไม่ active เพื่อ align text */}
              {active ? (
                <Icon icon='check' className='size-4 shrink-0 text-primary' />
              ) : (
                <span className='size-4 shrink-0' aria-hidden='true' />
              )}
              <span className='min-w-0 flex-1 truncate text-start'>{opt.label}</span>
              {opt.badge != null && (
                <span className={`badge ms-2 shrink-0 tabular-nums ${opt.badge.className}`}>{opt.badge.label}</span>
              )}
            </button>
          )
        })}
      </div>
    </FilterDropdownShell>
  )
}
