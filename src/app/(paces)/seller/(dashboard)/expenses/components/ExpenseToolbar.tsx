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
 *   - ส่วนเลือกช่วงเวลา: ../../_shared/DateRangeControl.tsx
 *
 * Design Spec: docs/superpowers/specs/2026-08-02-expenses-redesign-design-spec.md §1A–1C, §5
 */
import Icon from '@/components/wrappers/Icon'
import type { DateRangePreset } from '@/lib/date-range'
import DateRangeControl from '../../_shared/DateRangeControl'

type Props = {
  range: DateRangePreset
  customDates: [string, string] | null
  onRangeChange: (r: DateRangePreset) => void
  onCustomChange: (dates: [string, string]) => void
  onAdd: () => void
}

/** ตัวเลือกช่วงเวลาย้ายไป DateRangeControl (ใช้ร่วมกับแท็บยอดเก็บเงิน/กำไรขาดทุนของ /sales — 2026-10-01) */
export default function ExpenseToolbar({ range, customDates, onRangeChange, onCustomChange, onAdd }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <DateRangeControl
        range={range}
        customDates={customDates}
        onRangeChange={onRangeChange}
        onCustomChange={onCustomChange}
      />

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
  )
}
