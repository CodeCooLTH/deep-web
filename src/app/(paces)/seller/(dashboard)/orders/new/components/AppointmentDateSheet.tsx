'use client'

/**
 * AppointmentDateSheet — ปฏิทินเต็มจอสำหรับเลือกวันนัด (user สั่ง 2026-08-07)
 *
 * Base: src/app/(paces)/seller/(dashboard)/queues/components/AppointmentCalendar.tsx
 *   (FullCalendar dayGridMonth + interactionPlugin + dayCellClassNames ย้อมวันใกล้เต็ม/เต็ม
 *   + หัวเรื่องเดือนที่วาดเอง) ซึ่ง copy มาจาก
 *   theme/paces/Admin/TS/src/app/(admin)/apps/calendar/components/CalendarPage.tsx อีกทอด
 * Base (โครง sheet): ./AddressSearchSheet.tsx — sheet เต็มจอของฟอร์มเดียวกันนี้
 *   (fixed inset-0 z-80 + แถบหัวมีปุ่มย้อนกลับ + useLockBodyScroll)
 *
 * ทำไมไม่ใช้ <input type="date"> เดิม: ช่องเดิมบอกได้แค่ "วันนี้คือวันอะไร" ผู้ขายต้องเดาเองว่า
 * วันไหนคิวว่าง แล้วไปรู้ตอนกดบันทึกไม่ผ่าน — ข้อมูลความว่างมีอยู่แล้วใน API เดิม
 * (/api/shops/current/service-resources/availability) แค่ไม่เคยถูกเอามาแสดงเป็นภาพรวมเดือน
 *
 * IMPORTANT: หัวเรื่องเดือนวาดเอง ไม่ใช้ title ของ FullCalendar — FullCalendar แสดงปี ค.ศ.
 *   ส่วนทั้งระบบต้องเป็น พ.ศ. ผ่าน src/lib/format-date.ts (docs/conventions/date-format.md)
 *   เหตุผลเดียวกับที่ AppointmentCalendar ตั้ง center: '' ไว้
 *
 * IMPORTANT: คำว่า "ที่นั่ง" (serviceSeat) เป็นกลไกภายใน ห้ามโผล่บนจอ — ผู้ใช้เห็นได้แค่
 *   "จองแล้ว n จาก m คิว" (เหมือน AppointmentCalendar/AppointmentBlock)
 *
 * IMPORTANT: ตัวเลขที่นี่ใช้ **แสดงผลและกันการกดล่วงหน้า** เท่านั้น ตัวตัดสินจริงคือ
 *   setOrRescheduleAppointment ที่วน seat ครอบ SAVEPOINT — ห้ามถือว่าเลขบนจอคือคำตอบสุดท้าย
 *   (ระหว่างที่ปฏิทินเปิดค้าง อีกเครื่องอาจจองแทรกได้)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
// DatesSetArg อยู่ใน core ส่วน DateClickArg มาจาก type augmentation ของ interaction plugin
// (คนละแพ็กเกจ — import รวมกันแล้ว tsc ฟ้อง TS2614)
import type { DatesSetArg } from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { formatMonthYearTH } from '@/lib/format-date'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

/** ช่วงที่ถูกจองแล้ว 1 แถวต่อ 1 นัด (API.md §4.4 — ไม่ได้ aggregate มาให้) */
interface BusyWindow {
  start: string
  end: string
}

interface Props {
  open: boolean
  /** คิวงานที่เลือกไว้ในฟอร์ม — ปฏิทินโชว์ความว่างของคิวนี้คิวเดียว (user เคาะ 2026-08-07) */
  resourceId?: string
  /** ชื่อคิวงาน — โชว์ใต้หัวเรื่องให้รู้ว่ากำลังดูความว่างของคิวไหน */
  resourceName?: string
  /** ค่าที่เลือกอยู่ "YYYY-MM-DD" */
  value?: string
  onSelect: (date: string) => void
  onClose: () => void
}

/** "YYYY-MM-DD" ตามเวลาเครื่อง (ตรงกับที่ AppointmentBlock ใช้เก็บค่า ห้ามใช้ toISOString ที่เป็น UTC) */
function localDateKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default function AppointmentDateSheet({
  open,
  resourceId,
  resourceName,
  value,
  onSelect,
  onClose,
}: Props) {
  useLockBodyScroll(open)

  const calRef = useRef<FullCalendar>(null)
  const [capacity, setCapacity] = useState<number | null>(null)
  const [busy, setBusy] = useState<BusyWindow[]>([])
  const [loading, setLoading] = useState(false)
  /** เดือนที่กำลังมองอยู่ — วาดหัวเรื่อง พ.ศ. เอง (FullCalendar ให้มาเป็น ค.ศ.) */
  const [viewStart, setViewStart] = useState<Date | null>(null)
  /**
   * ช่วงที่โหลดไปแล้ว — กัน datesSet ยิงซ้ำช่วงเดิม
   * (FullCalendar เรียก datesSet ทุกครั้งที่ re-render ไม่ใช่เฉพาะตอนเปลี่ยนเดือน)
   */
  const loadedRangeRef = useRef<string>('')

  const loadRange = useCallback(
    async (from: Date, to: Date) => {
      if (!resourceId) {
        setBusy([])
        setCapacity(null)
        return
      }
      const key = `${resourceId}|${from.toISOString()}|${to.toISOString()}`
      if (loadedRangeRef.current === key) return
      loadedRangeRef.current = key

      setLoading(true)
      try {
        const res = await fetch(
          `/api/shops/current/service-resources/availability?resourceId=${resourceId}&from=${from.toISOString()}&to=${to.toISOString()}`,
        )
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { capacity: number; busy: BusyWindow[] }
        setCapacity(data.capacity ?? null)
        setBusy(data.busy ?? [])
      } catch {
        // โหลดไม่ได้ = ไม่รู้ว่าวันไหนเต็ม → ปล่อยให้กดได้ทุกวันแล้วให้ server ตัดสิน
        // (ห้ามย้อมว่าง/เต็มมั่ว — ตัวเลขที่ผิดแย่กว่าไม่มีตัวเลข)
        setCapacity(null)
        setBusy([])
        loadedRangeRef.current = ''
        pacesToast.error('โหลดคิวว่างไม่สำเร็จ — ยังเลือกวันได้ตามปกติ')
      } finally {
        setLoading(false)
      }
    },
    [resourceId],
  )

  // เปลี่ยนคิวงานระหว่างที่ชีตเปิด = ข้อมูลเดิมใช้ไม่ได้แล้ว
  useEffect(() => {
    loadedRangeRef.current = ''
    setBusy([])
    setCapacity(null)
  }, [resourceId])

  /** จำนวนนัดต่อวัน — 1 นัดที่คร่อมหลายวันต้องนับให้ทุกวันที่มันกิน ไม่ใช่เฉพาะวันเริ่ม */
  const countByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of busy) {
      const start = new Date(b.start)
      const end = new Date(b.end)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      while (cursor.getTime() < end.getTime()) {
        const k = localDateKey(cursor)
        map.set(k, (map.get(k) ?? 0) + 1)
        cursor.setDate(cursor.getDate() + 1)
      }
    }
    return map
  }, [busy])

  const isFull = useCallback(
    (key: string) => capacity != null && capacity > 0 && (countByDay.get(key) ?? 0) >= capacity,
    [capacity, countByDay],
  )

  const onDatesSet = useCallback(
    (arg: DatesSetArg) => {
      setViewStart(arg.view.currentStart)
      void loadRange(arg.start, arg.end)
    },
    [loadRange],
  )

  const onDateClick = useCallback(
    (arg: DateClickArg) => {
      const key = localDateKey(arg.date)
      // วันที่เต็มกดไม่ได้ (user เคาะ 2026-08-07) — วันที่ผ่านมาแล้วยังกดได้ เพราะร้านคีย์งาน
      // ที่ทำไปแล้วย้อนหลังเป็นเรื่องปกติ
      if (isFull(key)) {
        pacesToast.warning('วันนี้คิวเต็มแล้ว เลือกวันอื่น')
        return
      }
      onSelect(key)
      onClose()
    },
    [isFull, onSelect, onClose],
  )

  const goPrev = () => calRef.current?.getApi().prev()
  const goNext = () => calRef.current?.getApi().next()
  const goToday = () => calRef.current?.getApi().today()

  if (!open) return null

  return (
    /* HR7: fixed inset-0 z-80 = full-screen viewport-lock (Paces ไม่มี token) — ชุดเดียวกับ
       AddressSearchSheet ที่เปิดจากฟอร์มเดียวกัน */
    <div className="fixed inset-0 z-80 flex flex-col bg-card" role="dialog" aria-label="เลือกวันนัด">
      <div className="flex shrink-0 items-center gap-3 border-b border-default-200 px-4 py-3">
        <button type="button" onClick={onClose} aria-label="ย้อนกลับ" className="shrink-0 text-default-500">
          <Icon icon="chevron-left" className="size-6" />
        </button>
        <Icon icon="calendar-event" className="size-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-dark">เลือกวันนัด</h3>
          {resourceName && <p className="truncate text-xs text-default-500">{resourceName}</p>}
        </div>
      </div>

      {/* หัวเรื่องเดือน + ปุ่มเลื่อน — วาดเองเพราะต้องเป็น พ.ศ. (ดูหมายเหตุหัวไฟล์) */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
        <button type="button" onClick={goPrev} aria-label="เดือนก่อนหน้า" className="btn btn-sm btn-soft-default">
          <Icon icon="chevron-left" className="size-4" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <h4 className="truncate text-sm font-semibold text-dark">
            {viewStart ? formatMonthYearTH(viewStart) : ''}
          </h4>
          {loading && <Icon icon="loader-2" className="size-4 animate-spin text-default-400" />}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={goToday} className="btn btn-sm btn-soft-primary">
            วันนี้
          </button>
          <button type="button" onClick={goNext} aria-label="เดือนถัดไป" className="btn btn-sm btn-soft-default">
            <Icon icon="chevron-right" className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          initialDate={value ? new Date(`${value}T00:00`) : undefined}
          headerToolbar={false}
          height="auto"
          locale="th"
          firstDay={0}
          editable={false}
          selectable={false}
          datesSet={onDatesSet}
          dateClick={onDateClick}
          /**
           * ย้อมช่องวันตามความว่าง — ชุดสีเดียวกับ AppointmentCalendar ในหน้า /queues
           * (เต็ม = danger, ใกล้เต็ม = warning) ผู้ขายจะได้อ่านปฏิทินสองที่ด้วยกติกาเดียว
           * เต็ม: cursor-not-allowed ด้วย เพราะกดไปก็ไม่มีผล (dateClick กันไว้อีกชั้น)
           */
          dayCellClassNames={(arg) => {
            const key = localDateKey(arg.date)
            const cls: string[] = []
            if (value === key) cls.push('bg-primary/15')
            if (capacity == null) return cls
            const used = countByDay.get(key) ?? 0
            if (capacity > 0 && used >= capacity) cls.push('bg-danger/15', 'cursor-not-allowed')
            else if (used > 0) cls.push('bg-warning/15')
            return cls
          }}
          dayCellContent={(arg) => {
            const key = localDateKey(arg.date)
            const used = countByDay.get(key) ?? 0
            return (
              <div className="flex flex-col items-center gap-0.5 py-1">
                <span className="text-sm">{arg.dayNumberText}</span>
                {capacity != null && capacity > 0 && (
                  <span
                    className={`text-2xs leading-none ${
                      used >= capacity ? 'text-danger-ink' : used > 0 ? 'text-warning-ink' : 'text-default-400'
                    }`}
                  >
                    {used >= capacity ? 'เต็ม' : `${capacity - used} คิว`}
                  </span>
                )}
              </div>
            )
          }}
        />
      </div>

      {/* คำอธิบายสี — ไม่มีคำอธิบายแล้วสีที่ย้อมไว้กลายเป็นสีที่ต้องเดาความหมายเอง */}
      <div className="flex shrink-0 items-center justify-center gap-4 border-t border-default-200 px-4 py-3 text-xs text-default-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded bg-default-100 ring-1 ring-default-200" aria-hidden="true" />
          ว่าง
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-warning/15 size-3 rounded" aria-hidden="true" />
          มีคิวแล้ว
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-danger/15 size-3 rounded" aria-hidden="true" />
          เต็ม
        </span>
      </div>
    </div>
  )
}
