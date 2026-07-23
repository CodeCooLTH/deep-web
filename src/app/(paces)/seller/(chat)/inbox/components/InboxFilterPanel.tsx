'use client'

/**
 * InboxFilterPanel — ปุ่ม "ตัวกรอง" + popover รวมตัวกรอง (feat 00018 S-7): สถานะ / ผูกลูกค้า / ที่ซ่อน
 *
 * Base (trigger + popover state/click-outside): src/app/(paces)/seller/(chat)/inbox/components/
 *   PageFilterDropdown.tsx + OrderCardMenu.tsx (custom React dropdown — ไม่ใช้ Preline hs-dropdown
 *   เพราะ list re-render บ่อยทำให้ inline-state พัง)
 * Base (item radio): src/components/safepay/FilterDropdown.tsx (.dropdown-item + check spacer)
 * Base (switch): theme/paces/.../form/elements/components/ChecksRadioSwitches.tsx (.form-switch)
 * Base (divider): _dropdown.css (.dropdown-divider)
 *
 * ต่างจาก PageFilterDropdown: เลือก radio "ไม่ปิด" panel ทันที (มี 3 กลุ่มปรับต่อเนื่อง) — ปิดเมื่อกด
 * ปิด/เสร็จสิ้น/คลิกนอก/Escape เท่านั้น (ตั้งใจ ตาม Design Spec)
 * Paces primitive เท่านั้น (HR7)
 */
import Icon from '@/components/wrappers/Icon'
import { useEffect, useRef, useState } from 'react'

export type ChatFilterState = {
  status: 'open' | 'resolved' | 'all'
  customerLinked: 'all' | 'linked' | 'unlinked'
  hidden: boolean
}

export const DEFAULT_CHAT_FILTER: ChatFilterState = { status: 'open', customerLinked: 'all', hidden: false }

/** จำนวนกลุ่มที่ไม่ใช่ default — โชว์เป็น badge บนปุ่ม (ไม่นับ channel tab/เพจ คนละแกน) */
export function countActiveFilters(f: ChatFilterState): number {
  let n = 0
  if (f.status !== DEFAULT_CHAT_FILTER.status) n++
  if (f.customerLinked !== DEFAULT_CHAT_FILTER.customerLinked) n++
  if (f.hidden !== DEFAULT_CHAT_FILTER.hidden) n++
  return n
}

const STATUS_OPTIONS: { value: ChatFilterState['status']; label: string }[] = [
  { value: 'open', label: 'เปิดอยู่' },
  { value: 'resolved', label: 'ปิดงานแล้ว' },
  { value: 'all', label: 'ทั้งหมด' },
]
const LINKED_OPTIONS: { value: ChatFilterState['customerLinked']; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'linked', label: 'ผูกลูกค้าแล้ว' },
  { value: 'unlinked', label: 'ยังไม่ผูกลูกค้า' },
]

type Props = {
  value: ChatFilterState
  onChange: (patch: Partial<ChatFilterState>) => void
  onClear: () => void
  /** controlled open — state อยู่ที่ InboxList เพื่อให้ popover ตัวกรองเปิดได้ทีละตัว
   *  (bug: เดิมต่างคนต่างถือ state เปิดพร้อมกันแล้วทับกันเอง) */
  open: boolean
  onOpenChange: (open: boolean) => void
}

function RadioRow({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className="dropdown-item text-sm"
    >
      <Icon icon="check" className={`size-4 ${selected ? 'text-primary' : 'opacity-0'}`} />
      {label}
    </button>
  )
}

export default function InboxFilterPanel({ value, onChange, onClear, open, onOpenChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const activeCount = countActiveFilters(value)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', onKey)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    // ไม่มี `relative` ที่ root โดยตั้งใจ — popover อ้างอิง "แถวตัวกรอง" (relative ที่ InboxList)
    // ไม่ใช่ปุ่ม เพื่อให้กว้างเท่าแถวพอดี ไม่ล้น Chat Rail/ขอบจอ (ดู comment ที่ popover)
    <div ref={ref}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`btn btn-sm inline-flex items-center gap-1.5 ${
          activeCount > 0 ? 'bg-primary/15 text-primary' : 'bg-light text-dark'
        }`}
      >
        <Icon icon="filter" className="size-4" />
        ตัวกรอง
        {activeCount > 0 && (
          <span className="badge bg-primary text-white text-2xs rounded-full px-1.5">{activeCount}</span>
        )}
        <Icon icon="chevron-down" className="size-3.5" />
      </button>

      {open && (
        // inset-x-0 (ไม่ใช่ start-0 + w-72/w-80): กว้างเท่า "แถวตัวกรอง" พอดีเสมอ ไม่ล้นออกนอก
        // Chat Rail (320px) / ขอบจอมือถือ — ดู comment เดียวกันที่ PageFilterDropdown.tsx
        <div
          className="absolute top-full inset-x-0 z-30 mt-1 overflow-hidden rounded-lg border border-default-300 bg-card shadow-lg"
          role="menu"
        >
          {/* header */}
          <div className="flex items-center justify-between border-b border-default-200 px-3 py-2">
            <span className="text-default-800 text-sm font-semibold">ตัวกรอง</span>
            <button type="button" onClick={() => onOpenChange(false)} className="text-default-500 hover:text-default-800 flex size-6 items-center justify-center rounded" aria-label="ปิด">
              <Icon icon="x" className="size-4" />
            </button>
          </div>

          <div className="p-1">
            {/* สถานะ */}
            <p className="text-default-500 px-2 pt-2 pb-1 text-xs font-medium">สถานะ</p>
            {STATUS_OPTIONS.map((o) => (
              <RadioRow key={o.value} selected={value.status === o.value} label={o.label} onClick={() => onChange({ status: o.value })} />
            ))}

            <hr className="dropdown-divider" />

            {/* ผูกลูกค้า */}
            <p className="text-default-500 px-2 pt-2 pb-1 text-xs font-medium">ผูกลูกค้า</p>
            {LINKED_OPTIONS.map((o) => (
              <RadioRow key={o.value} selected={value.customerLinked === o.value} label={o.label} onClick={() => onChange({ customerLinked: o.value })} />
            ))}

            <hr className="dropdown-divider" />

            {/* เมนูที่ซ่อนอยู่ */}
            <label className="flex cursor-pointer items-center justify-between gap-3 px-2 py-2">
              <span className="min-w-0">
                <span className="text-default-800 block text-sm">เมนูที่ซ่อนอยู่</span>
                <span className="text-default-400 block text-2xs">ดูเฉพาะบทสนทนาที่คุณซ่อนไว้</span>
              </span>
              <input
                type="checkbox"
                className="form-switch shrink-0"
                checked={value.hidden}
                onChange={(e) => onChange({ hidden: e.target.checked })}
              />
            </label>
          </div>

          {/* footer */}
          <div className="flex items-center justify-between border-t border-default-200 px-3 py-2">
            <button
              type="button"
              onClick={onClear}
              disabled={activeCount === 0}
              className="text-default-600 hover:text-default-900 text-sm disabled:opacity-40"
            >
              ล้างตัวกรอง
            </button>
            <button type="button" onClick={() => onOpenChange(false)} className="btn btn-sm bg-primary text-white hover:bg-primary-hover">
              เสร็จสิ้น
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
