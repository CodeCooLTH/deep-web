'use client'

/**
 * FilterDropdownShell — เปลือกของดรอปดาวน์ใน toolbar (trigger + แผง + click-outside + Escape)
 *
 * สกัดออกมาจาก FilterDropdown.tsx (impeccable audit P2-4) เพราะ OrderDateFilterDropdown
 * ก็อปเปลือกชุดนี้ไปทั้งดุ้น ~60 บรรทัด ผลคือแถบเครื่องมือเดียวกันมีปุ่ม 6 ตัว 5 ตัวมาจาก
 * ตัวแม่ อีกตัวจากสำเนา — แก้สไตล์ trigger ที่ตัวแม่แล้วตัวนั้นไม่ตามอัตโนมัติ
 *
 * Base (markup/visual): theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx
 *   → SingleButtonDropdowns (.hs-dropdown-toggle btn) — ทางอ้อมผ่าน FilterDropdown ที่
 *   source มาจากที่นั่นตั้งแต่ต้น งานนี้แค่ deduplicate ไม่ได้ไป source ใหม่
 *
 * [สำคัญ] open/close เป็น custom React state ไม่ใช่ Preline hs-dropdown — toolbar re-render
 * ทุกครั้งที่เลือก filter แล้ว inline-state ของ Preline หายจน menu ค้าง opacity 0
 * (บทเรียน OrderCardMenu 2026-06-15) ห้าม refactor กลับไปใช้ hs-dropdown
 *
 * [สำคัญ] shell ไม่ยัด role ให้เอง — ผู้เรียกประกาศเองว่าเนื้อหาข้างในเป็นอะไร
 * (FilterDropdown = role="menu" ล้วน · OrderDateFilterDropdown มีโหมดที่เป็น role="group"
 * เพราะข้างในเป็น input ไม่ใช่ตัวเลือก) การยัด role="menu" ให้ทุกคนคือต้นเหตุ audit P2-1
 */

import Icon from '@/components/wrappers/Icon'
import { useEffect, useRef, type ReactNode } from 'react'

interface FilterDropdownShellProps {
  /** เนื้อหาในปุ่ม trigger ไม่รวม chevron — shell แปะ chevron ให้เอง */
  triggerContent: ReactNode
  /** true = มีตัวกรองทำงานอยู่ → ปุ่มเป็นสี primary tonal */
  isActive: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** เปิดลงขวา (กัน overflow ขอบจอ เช่น page size ท้าย toolbar) */
  align?: 'left' | 'right'
  /** class เพิ่มที่ปุ่ม trigger */
  className?: string
  /** class เพิ่มที่แผง — เผื่อความกว้างต่างกัน (min-w-44 vs min-w-52) */
  panelClassName?: string
  /** aria-haspopup ของ trigger — เมนูล้วนใช้ 'menu', แผงที่มี input ใช้ 'dialog' */
  haspopup?: 'menu' | 'dialog'
  /** เนื้อหาแผง — ผู้เรียกเป็นคนประกาศ role/aria เอง */
  children: ReactNode
}

export default function FilterDropdownShell({
  triggerContent,
  isActive,
  open,
  onOpenChange,
  align = 'left',
  className = '',
  panelClassName = 'min-w-44',
  haspopup = 'menu',
  children
}: FilterDropdownShellProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onOpenChange])

  return (
    <div className='relative inline-flex' ref={ref}>
      <button
        type='button'
        aria-haspopup={haspopup}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={`btn text-nowrap ${
          isActive ? 'bg-primary/15 text-primary hover:bg-primary hover:text-white' : 'bg-light text-dark'
        } ${className}`.trim()}
      >
        {triggerContent}
        <Icon icon='chevron-down' className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`border-default-300 bg-card absolute top-full z-30 mt-1 rounded border p-1 shadow-lg ${panelClassName} ${
            align === 'right' ? 'end-0' : 'start-0'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  )
}
