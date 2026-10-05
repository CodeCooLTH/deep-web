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
 * หัวปฏิทินด้านใน: Flatpickr ไม่มีโหมด พ.ศ. (ช่องปีเป็น <input type=number> ค.ศ.) ⇒ syncBuddhistYear
 * ซ่อนช่องนั้นแล้ววางป้ายปี พ.ศ. แทน (เลื่อนปีด้วยลูกศรเดือนได้เหมือนเดิม) — 2026-10-01
 */
import { useEffect, useMemo, useRef } from 'react'
import { Thai } from 'flatpickr/dist/l10n/th'
import Flatpickr from '@/components/wrappers/Flatpickr'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatLocalCalendarDate, localDayKey, toBuddhistYear } from '@/lib/format-date'
import { DATE_RANGE_OPTIONS, MAX_CUSTOM_RANGE_DAYS, isValidCustomRange, type DateRangePreset } from '@/lib/date-range'
import { pacesToast } from '@/lib/paces-toast'

type Props = {
  range: DateRangePreset
  /** ช่วงที่กำหนดเองอยู่ ("YYYY-MM-DD" คู่) — ใช้เติมปฏิทินให้เห็นว่ากำลังกรองช่วงไหน */
  customDates: [string, string] | null
  onRangeChange: (r: DateRangePreset) => void
  onCustomChange: (dates: [string, string]) => void
  /** กำลังโหลดผลของช่วงใหม่ — ปิดปุ่มกันกดซ้อน */
  pending?: boolean
}

type FlatpickrLike = { currentYear: number; yearElements?: HTMLInputElement[] }

/**
 * แทนช่องปี ค.ศ. บนหัวปฏิทินด้วยป้าย พ.ศ. — เรียกทุกครั้งที่เปิด/เปลี่ยนเดือน/เปลี่ยนปี
 * ทำงานกับ DOM ของ Flatpickr ตรง ๆ เพราะไม่มี option ให้ตั้งปฏิทินพุทธศักราช
 */
function syncBuddhistYear(_d: Date[], _s: string, fp: FlatpickrLike) {
  for (const input of fp.yearElements ?? []) {
    const wrapper = input.parentElement
    if (!wrapper) continue
    wrapper.style.display = 'none'
    let label = wrapper.nextElementSibling as HTMLElement | null
    if (!label || !label.classList.contains('fp-be-year')) {
      label = document.createElement('span')
      // คลาส Tailwind ปกติ (ไม่ใช่ inline style) — ป้ายนี้แค่อ่าน เปลี่ยนปีด้วยลูกศรเดือนของ Flatpickr
      label.className = 'fp-be-year ps-1 font-semibold'
      wrapper.after(label)
    }
    label.textContent = String(toBuddhistYear(fp.currentYear))
  }
}

/** "YYYY-MM-DD" → Date เที่ยงคืน local (Flatpickr ทำงานบน local time ของเบราว์เซอร์) */
function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function DateRangeControl({ range, customDates, onRangeChange, onCustomChange, pending }: Props) {
  /**
   * 🛑 ห้ามส่ง onChange เป็น prop ของ <Flatpickr> — react-flatpickr v4 **push handler จาก prop เข้าไปใน
   * object options ทุกครั้งที่ render** (mergeHooks แก้ object เดิม) และ options ของเราถูก memo ไว้
   * ⇒ handler สะสมข้ามรอบ เลือกวันครั้งเดียวยิง router.push หลายครั้งด้วย closure เก่า (review 2026-10-01)
   * ⇒ ใส่ onChange ไว้ใน options เอง แล้วเรียก handler ล่าสุดผ่าน ref
   */
  const onCustomChangeRef = useRef(onCustomChange)
  useEffect(() => {
    onCustomChangeRef.current = onCustomChange
  }, [onCustomChange])

  const pickerOptions = useMemo(
    () => ({
      mode: 'range' as const,
      locale: Thai,
      // แสดงผล วัน-เดือน-ปี พ.ศ. ตามวันที่ที่ผู้ใช้จิ้ม (ปฏิทินเครื่อง — ไม่ตัดด้วยเวลาไทย ดู localDayKey)
      formatDate: (d: Date) => formatLocalCalendarDate(d),
      onChange: (selected: Date[]) => {
        if (selected.length !== 2) return
        const pair: [string, string] = [localDayKey(selected[0]), localDayKey(selected[1])]
        // กติกาเดียวกับหน้า/API — เกินเพดานแล้วเงียบไปจะได้หน้าที่ถอยไป "เดือนนี้" เองโดยไม่รู้สาเหตุ
        if (!isValidCustomRange(pair[0], pair[1])) {
          pacesToast.warning(`เลือกช่วงได้ไม่เกิน ${MAX_CUSTOM_RANGE_DAYS} วัน`)
          return
        }
        onCustomChangeRef.current(pair)
      },
      defaultDate: customDates ? customDates.map(isoToLocalDate) : undefined,
      disableMobile: true,
      onReady: syncBuddhistYear,
      onOpen: syncBuddhistYear,
      onMonthChange: syncBuddhistYear,
      onYearChange: syncBuddhistYear,
    }),
    [customDates],
  )

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3" aria-busy={pending || undefined}>
      {/* จอแคบ: ชิป 4 ช่วงแบ่งความกว้างเท่ากัน + ปุ่มปฏิทิน 44px สำหรับ "กำหนดเอง" (มติ 2026-10-01)
          เดิมเป็นแถบเลื่อนแนวนอน 5 ชิป ~300px ในพื้นที่ 288px (จอ 320) ⇒ "กำหนดเอง" ถูกตัดครึ่ง
          และไม่มีอะไรบอกว่าเลื่อนได้ · แพตเทิร์นเดียวกับแอปบัญชี (ช่วงสำเร็จรูป + ไอคอนปฏิทิน) ไม่ต้องเลื่อน */}
      <div className="flex w-full items-center gap-1.5 sm:hidden" role="group" aria-label="ช่วงเวลา">
        {DATE_RANGE_OPTIONS.filter((o) => o.value !== 'custom').map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-disabled={pending || undefined}
            onClick={() => !pending && onRangeChange(opt.value)}
            aria-pressed={range === opt.value}
            className={cn(
              'btn btn-sm min-h-11 min-w-0 flex-1 rounded-full px-1 whitespace-nowrap',
              range === opt.value ? 'bg-primary/15 text-primary-ink font-semibold' : 'bg-light text-dark',
            )}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          aria-disabled={pending || undefined}
          onClick={() => !pending && onRangeChange('custom')}
          aria-pressed={range === 'custom'}
          aria-label="กำหนดเอง"
          title="กำหนดเอง"
          className={cn(
            'btn btn-icon size-11 shrink-0 rounded-full',
            range === 'custom' ? 'bg-primary/15 text-primary-ink' : 'bg-light text-dark',
          )}
        >
          <Icon icon="calendar-event" className="text-lg" aria-hidden="true" />
        </button>
      </div>

      {/* จอ ≥sm: segmented ติดกันเป็นแถบเดียว */}
      <div className="hidden sm:inline-flex" role="group" aria-label="ช่วงเวลา">
        {DATE_RANGE_OPTIONS.map((opt, idx) => (
          <button
            key={opt.value}
            type="button"
            // aria-disabled ไม่ใช่ disabled — disabled ดึงโฟกัสออกจากปุ่มที่เพิ่งกด (คีย์บอร์ด/screen reader หลุดตำแหน่ง)
            aria-disabled={pending || undefined}
            onClick={() => !pending && onRangeChange(opt.value)}
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
          />
        </div>
      )}

      {pending && (
        <span className="inline-flex items-center">
          <Icon icon="loader-2" className="text-default-500 size-4 animate-spin" aria-hidden="true" />
          {/* ไอคอน iconify ใส่ aria-hidden เอง — ประกาศสถานะผ่าน role="status" แทน */}
          <span role="status" className="sr-only">
            กำลังโหลด
          </span>
        </span>
      )}
    </div>
  )
}
