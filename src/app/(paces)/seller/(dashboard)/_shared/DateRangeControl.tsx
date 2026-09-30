'use client'

/**
 * DateRangeControl — ตัวเลือกช่วงเวลาของหน้าการเงินร้าน (ตัวเดียวทุกแท็บ)
 *
 * Base: src/app/(paces)/seller/(dashboard)/expenses/components/ExpenseToolbar.tsx (ยกส่วนเลือกช่วงออกมา)
 *   - segmented button group: docs/system/ui-guideline/paces-component-reference.md §2 Button Group
 *   - custom range picker: Flatpickr wrapper mode="range"
 *
 * ที่มา 2026-10-01 (user: "เช็ค filter สิทำครบและใช้งานได้จริงยัง"):
 *   - แท็บยอดเก็บเงินมีแต่ปฏิทิน ไม่มี วันนี้/7 วัน/30 วัน/เดือนนี้ แบบแท็บค่าใช้จ่าย
 *   - แท็บกำไรขาดทุนไม่มีตัวเลือกช่วงเวลาเลย
 *   - ปฏิทินโชว์ "01 Sep, 2026" (เดือนอังกฤษ ปี ค.ศ.) ขัดกับวันที่ทั้งระบบ
 *   - ช่องกำหนดเองในแท็บค่าใช้จ่ายว่างเปล่าทั้งที่กำลังกรองช่วงนั้นอยู่ (ไม่มี defaultDate)
 * ⇒ ยกเป็นตัวเดียว ใช้ร่วมกัน ไม่ให้แต่ละแท็บมีตัวกรองคนละแบบอีก
 *
 * 🛑 ปฏิทินแสดงผลผ่าน formatDate ตัวกลาง (วัน-เดือน-ปี พ.ศ.) — ห้ามตั้ง dateFormat ของ Flatpickr เอง
 * (หัวปฏิทินด้านในยังเป็นปี ค.ศ. เพราะ Flatpickr ไม่มีโหมด พ.ศ. — ช่องที่อ่านค่าเป็น พ.ศ. ถูกต้อง)
 */
import { useMemo } from 'react'
import { Thai } from 'flatpickr/dist/l10n/th'
import Flatpickr from '@/components/wrappers/Flatpickr'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatDate, thaiDayKey } from '@/lib/format-date'
import { DATE_RANGE_OPTIONS, type DateRangePreset } from '@/lib/date-range'

type Props = {
  range: DateRangePreset
  /** ช่วงที่กำหนดเองอยู่ ("YYYY-MM-DD" คู่) — ใช้เติมปฏิทินให้เห็นว่ากำลังกรองช่วงไหน */
  customDates: [string, string] | null
  onRangeChange: (r: DateRangePreset) => void
  onCustomChange: (dates: [string, string]) => void
  /** กำลังโหลดผลของช่วงใหม่ — ปิดปุ่มกันกดซ้อน */
  pending?: boolean
}

/** "YYYY-MM-DD" → Date เที่ยงคืน local (Flatpickr ทำงานบน local time ของเบราว์เซอร์) */
function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function DateRangeControl({ range, customDates, onRangeChange, onCustomChange, pending }: Props) {
  const pickerOptions = useMemo(
    () => ({
      mode: 'range' as const,
      locale: Thai,
      // แสดงผลด้วยตัวกลาง — "01-09-2569 ถึง 30-09-2569"
      formatDate: (d: Date) => formatDate(d),
      defaultDate: customDates ? customDates.map(isoToLocalDate) : undefined,
      disableMobile: true,
    }),
    [customDates],
  )

  const handlePicked = (selected: Date[]) => {
    if (selected.length !== 2) return
    // Flatpickr คืนเที่ยงคืน local — toISOString() จะเลื่อนถอยไป 1 วัน ต้องตัดวันด้วยเวลาไทย
    onCustomChange([thaiDayKey(selected[0]), thaiDayKey(selected[1])])
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3" aria-busy={pending || undefined}>
      {/* จอแคบ: ชิปเลื่อนแนวนอน (segmented 5 ปุ่มไม่พอกว้าง แตกบรรทัดแล้วอ่านเป็นคนละกลุ่ม) */}
      <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 sm:hidden" role="group" aria-label="ช่วงเวลา">
        {DATE_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={pending}
            onClick={() => onRangeChange(opt.value)}
            aria-pressed={range === opt.value}
            className={cn(
              'btn btn-sm min-h-11 shrink-0 rounded-full',
              range === opt.value ? 'bg-primary/15 text-primary-ink font-semibold' : 'bg-light text-dark',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* จอ ≥sm: segmented ติดกันเป็นแถบเดียว */}
      <div className="hidden sm:inline-flex" role="group" aria-label="ช่วงเวลา">
        {DATE_RANGE_OPTIONS.map((opt, idx) => (
          <button
            key={opt.value}
            type="button"
            disabled={pending}
            onClick={() => onRangeChange(opt.value)}
            aria-pressed={range === opt.value}
            className={cn(
              'btn btn-sm',
              idx === 0 && 'rounded-e-none',
              idx > 0 && idx < DATE_RANGE_OPTIONS.length - 1 && 'rounded-none',
              idx === DATE_RANGE_OPTIONS.length - 1 && 'rounded-s-none',
              range === opt.value ? 'bg-primary/15 text-primary-ink' : 'bg-light text-dark',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="input-icon-group w-full sm:w-auto">
          <Icon icon="calendar" className="input-icon" aria-hidden="true" />
          <Flatpickr
            className="form-input sm:min-w-64"
            placeholder="เลือกวันเริ่ม – วันสิ้นสุด"
            aria-label="เลือกช่วงวันที่"
            options={pickerOptions}
            onChange={handlePicked}
          />
        </div>
      )}

      {pending && (
        <Icon icon="loader-2" className="text-default-500 size-4 animate-spin" aria-label="กำลังโหลด" />
      )}
    </div>
  )
}
