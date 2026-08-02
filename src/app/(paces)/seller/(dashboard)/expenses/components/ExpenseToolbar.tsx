'use client'

/**
 * ExpenseToolbar — เลือกช่วงเวลา + ปุ่มเพิ่มค่าใช้จ่าย (feature 00016 redesign)
 *
 * ย้ายตัวเลือกช่วงเวลาออกมาจาก PnlReportCard เพราะตอนนี้มัน "คุมทั้งหน้า" ไม่ใช่คุมแค่การ์ดเดียว —
 * ทั้งรายงาน P&L, การ์ดแยกหมวด, สรุปเร็ว และตัวรายการ อ่านจากช่วงเดียวกันหมด
 *
 * Base:
 *   - segmented button group: docs/system/ui-guideline/paces-component-reference.md §2 Button Group
 *     (inline-flex + .btn + rounded-*-none) — ไม่ใช้ hs-dropdown เพราะ toolbar นี้ re-render ทุกครั้ง
 *     ที่เปลี่ยนช่วง (ดู component reference §3)
 *   - custom range picker: src/app/(paces)/seller/(dashboard)/sales/components/SalesDateRange.tsx
 *     (Flatpickr wrapper mode="range")
 *
 * Design Spec: docs/superpowers/specs/2026-08-02-expenses-redesign-design-spec.md §1A–1C, §5
 */
import Flatpickr from '@/components/wrappers/Flatpickr'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import type { DateRangePreset } from '@/lib/date-range'

const RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'วันนี้' },
  { value: '7d', label: '7 วัน' },
  { value: '30d', label: '30 วัน' },
  { value: 'month', label: 'เดือนนี้' },
  { value: 'custom', label: 'กำหนดเอง' },
]

type Props = {
  range: DateRangePreset
  onRangeChange: (r: DateRangePreset) => void
  onCustomChange: (dates: Date[]) => void
  onAdd: () => void
}

export default function ExpenseToolbar({ range, onRangeChange, onCustomChange, onAdd }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* จอแคบ: ชิปเลื่อนแนวนอน (segmented 5 ปุ่มไม่พอกว้าง แตกบรรทัดแล้วอ่านเป็นคนละกลุ่ม) */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 sm:hidden" role="group" aria-label="ช่วงเวลารายงาน">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onRangeChange(opt.value)}
            aria-pressed={range === opt.value}
            className={cn(
              'btn btn-sm shrink-0 rounded-full',
              range === opt.value ? 'bg-primary/15 text-primary font-semibold' : 'bg-light text-dark',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* จอ ≥sm: segmented ติดกันเป็นแถบเดียว */}
      <div className="hidden sm:inline-flex" role="group" aria-label="ช่วงเวลารายงาน">
        {RANGE_OPTIONS.map((opt, idx) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onRangeChange(opt.value)}
            aria-pressed={range === opt.value}
            className={cn(
              'btn btn-sm',
              idx === 0 && 'rounded-e-none',
              idx > 0 && idx < RANGE_OPTIONS.length - 1 && 'rounded-none',
              idx === RANGE_OPTIONS.length - 1 && 'rounded-s-none',
              range === opt.value ? 'bg-primary/15 text-primary' : 'bg-light text-dark',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {range === 'custom' && (
          <div className="input-icon-group">
            <Icon icon="calendar" className="input-icon" aria-hidden="true" />
            <Flatpickr
              className="form-input"
              style={{ minWidth: 220 }}
              options={{ dateFormat: 'd M, Y', mode: 'range' }}
              onChange={onCustomChange}
            />
          </div>
        )}

        {/* ปุ่มหลักของหน้า — จอแคบใช้แถบล่างจอแทน (ExpenseWorkspace) จึงซ่อนตัวนี้ */}
        <button
          type="button"
          onClick={onAdd}
          className="btn bg-primary hover:bg-primary-hover hidden items-center gap-1.5 text-white sm:inline-flex"
        >
          <Icon icon="plus" aria-hidden="true" />
          เพิ่มค่าใช้จ่าย
        </button>
      </div>
    </div>
  )
}
