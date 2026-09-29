'use client'

/**
 * FollowUpCalendar — ปฏิทินเดือนของหน้ารวมติดตามลูกค้า (00066 พื้นผิว c)
 *
 * Base:
 *  - เดสก์ท็อป (≥lg): theme/paces/Admin/TS/src/app/(admin)/apps/calendar/components/CalendarPage.tsx
 *    ตามที่ src/app/(paces)/seller/(dashboard)/queues/components/AppointmentCalendar.tsx ดัดแปลงไว้แล้ว:
 *    ตัด external events/editable/droppable/AddEditModal · หัวเดือน render เอง เป็น พ.ศ. (FullCalendar แสดง ค.ศ.)
 *    · dayMaxEvents=3 · "+N"/กดรายการ/กดช่องวัน = เปิดชีตวัน (ไม่ใช่ popover — โดนตัด และการ์ดมีปุ่ม+แถวเปิดต่อท้ายใหญ่เกิน)
 *  - มือถือ (<lg): ตารางเดือนแบบจุดสี ตามแนว src/components/safepay/appointment-board/AppointmentMonthBoard.tsx
 *    (เลข "วันมีของเลยกำหนด" ตัวหนา+ขีดใต้ · จุดไม่ใช่ตัวแบก AA) — เขียนเป็นตารางปุ่ม 7 คอลัมน์ล้วน ไม่ใช้ FullCalendar
 *    เพราะบอร์ดพี่น้องต้องรื้อทรงตารางด้วย CSS scope (.appt-date-sheet) ซึ่งเป็นของนัดหมาย
 *
 * เดสก์ท็อปกับมือถือ mount ตัวเดียว (useIsDesktop) — ไม่ render สองชุดแล้วซ่อนด้วย CSS
 * event ทุกใบเป็น all-day ด้วยคีย์วันไทย (thaiDayKey) — ไม่ส่ง timestamp เข้า FullCalendar เพราะมันวางตามเขตเวลาเครื่อง
 * ทำให้ผู้ใช้นอกไทยเห็นรายการข้ามวัน · เวลาแสดงเป็นข้อความหน้าหัวข้อ (formatTimeHM) · งานทั้งวันไม่แสดงเวลา (BR-ACT-03)
 * สีตาม UX §0.2 ผ่านคลาส fu-ev-* ใน _calendar.css (ไม่มีเขียว) · ทำแล้ว = ไอคอน check นำหน้า (eventContent — ไม่ฝังตัวอักษรใน string)
 */
import { useEffect, useMemo, useRef } from 'react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { formatDateTH, formatMonthYearTH, formatTimeHM, thaiDayKey, weekdayShortTH } from '@/lib/format-date'
import { buildMonthGrid, groupByDay, itemTone, monthOfDay, type DayTone } from '@/lib/follow-up-page'
import type { FollowUpDto } from '@/services/customer-follow-up.service'
import { useIsDesktop } from './useIsDesktop'

// หัวคอลัมน์จันทร์→อาทิตย์ จากชุดวันของ format-date (ไม่พิมพ์ชื่อวันเอง) — 2026-06-01 เป็นวันจันทร์
const DOW = Array.from({ length: 7 }, (_, i) => weekdayShortTH(new Date(`2026-06-0${i + 1}T05:00:00Z`)))

/** จุดสีของสถานะ — ทำแล้วเป็นวงกลวง (รูปทรงต่าง ไม่ใช่สีต่าง) */
const DOT: Record<DayTone, string> = {
  late: 'bg-danger',
  today: 'bg-warning',
  normal: 'bg-primary',
  done: 'border border-default-500',
}

function Legend() {
  const t = useT().followUps
  const rows: { tone: DayTone; label: string }[] = [
    { tone: 'late', label: t.legendOverdue },
    { tone: 'today', label: t.legendToday },
    { tone: 'normal', label: t.legendNormal },
    { tone: 'done', label: t.legendDone },
  ]
  return (
    <div className="border-default-200 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm">
      {rows.map((r) => (
        <span key={r.tone} className="inline-flex items-center gap-1.5">
          <span className={`${DOT[r.tone]} inline-block size-2.5 rounded-full`} aria-hidden="true" />
          <span className="text-default-700">{r.label}</span>
        </span>
      ))}
    </div>
  )
}

type Props = {
  /** YYYY-MM */
  month: string
  /** วันนี้ (ไทย) YYYY-MM-DD */
  todayKey: string
  /** null = เดือนนี้ยังโหลดไม่เสร็จ */
  items: FollowUpDto[] | null
  truncated: boolean
  onMonthChange: (m: string) => void
  onOpenDay: (dayKey: string) => void
}

export default function FollowUpCalendar({ month, todayKey, items, truncated, onMonthChange, onOpenDay }: Props) {
  const t = useT().followUps
  const isDesktop = useIsDesktop()
  const calRef = useRef<FullCalendar | null>(null)

  // FullCalendar ถือวันของตัวเอง — ซิงก์เมื่อเดือนใน URL เปลี่ยน (จากปุ่มของเรา/ชีตวันเดินข้ามเดือน)
  useEffect(() => {
    if (isDesktop) calRef.current?.getApi().gotoDate(`${month}-01`)
  }, [month, isDesktop])

  const { tally } = useMemo(() => groupByDay(items ?? []), [items])

  const events = useMemo(
    () =>
      (items ?? []).map((it) => {
        const tone = itemTone(it)
        const time = it.allDay ? t.allDay : formatTimeHM(it.dueAt)
        return {
          id: it.id,
          title: `${time} ${it.title}`,
          start: thaiDayKey(it.dueAt),
          allDay: true,
          className: `fu-ev-${tone}`,
          // เรียงในวันเดียวกันตามเวลา (dueAt) — FullCalendar ค่าตั้งต้นเรียงตามชื่อ
          sortKey: new Date(it.dueAt).getTime(),
          done: tone === 'done',
        }
      }),
    [items, t.allDay],
  )

  const shift = (d: number) => {
    const [y, m] = month.split('-').map(Number) as [number, number]
    const idx = y * 12 + (m - 1) + d
    onMonthChange(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`)
  }
  // กลางเดือนกันเขตเวลาเลื่อนวัน (formatMonthYearTH ตีความตามไทย)
  const title = formatMonthYearTH(new Date(`${month}-15T05:00:00Z`))

  return (
    <div className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label={t.calPrev}
            className="btn text-default-700 hover:bg-default-100 min-h-11 min-w-11 lg:min-h-0 lg:min-w-0"
          >
            <Icon icon="chevron-left" className="size-5" aria-hidden="true" />
          </button>
          <h4 className="card-title min-w-36 text-center" aria-live="polite">
            {title}
          </h4>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label={t.calNext}
            className="btn text-default-700 hover:bg-default-100 min-h-11 min-w-11 lg:min-h-0 lg:min-w-0"
          >
            <Icon icon="chevron-right" className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {items === null && <span className="text-default-600 text-sm">{t.loading}</span>}
          {month !== monthOfDay(todayKey) && (
            <button
              type="button"
              onClick={() => onMonthChange(monthOfDay(todayKey))}
              className="btn border-default-300 text-default-800 hover:bg-light min-h-11 border lg:min-h-0"
            >
              {t.calToday}
            </button>
          )}
        </div>
      </div>

      {truncated && (
        // 1,000 พอดี = ไม่มีแถบ (service ตัดสินด้วย take+1) — เตือนเมื่อ "ไม่ครบจริง" เท่านั้น
        <div
          role="status"
          className="bg-warning/15 text-warning-ink mx-4 mt-4 flex items-start gap-2 rounded-lg p-3 text-sm"
        >
          <Icon icon="alert-triangle" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t.calTruncated}</span>
        </div>
      )}

      {/* follow-up-calendar = scope ของสี fu-ev-* (src/assets/css/plugins/_calendar.css) */}
      <div className="card-body follow-up-calendar" aria-busy={items === null}>
        {isDesktop ? (
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            initialDate={`${month}-01`}
            locale="th"
            height="auto"
            firstDay={1}
            // หัวเดือน render เอง (พ.ศ.) — ไม่ใช้ toolbar ของ FullCalendar
            headerToolbar={false}
            events={events}
            eventOrder="sortKey"
            eventDisplay="block"
            eventContent={(arg) => (
              <span className="flex min-w-0 items-center gap-1 px-1">
                {arg.event.extendedProps.done === true && <Icon icon="check" className="size-3 shrink-0" aria-hidden="true" />}
                <span className="fc-event-title truncate">{arg.event.title}</span>
              </span>
            )}
            dayMaxEvents={3}
            moreLinkContent={(arg) => fmt(t.calMore, { n: arg.num })}
            moreLinkClick={(arg) => onOpenDay(localKey(arg.date))}
            eventClick={(arg) => onOpenDay(arg.event.startStr.slice(0, 10))}
            dateClick={(arg) => onOpenDay(arg.dateStr.slice(0, 10))}
            // ไม่ลาก ไม่สร้างจากปฏิทิน — ลากแล้วผู้ใช้จะเข้าใจว่าบันทึกแล้วทั้งที่ไม่ได้บันทึก
            editable={false}
            selectable={false}
            dayCellContent={(arg) => (
              <span
                className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                  localKey(arg.date) === todayKey ? 'bg-primary text-white' : 'text-default-700'
                }`}
              >
                {arg.dayNumberText}
              </span>
            )}
          />
        ) : (
          <div role="grid" aria-label={title}>
            <div role="row" className="text-default-600 mb-1 grid grid-cols-7 text-center text-xs font-medium">
              {DOW.map((d) => (
                <span key={d} role="columnheader" className="py-1">
                  {d}
                </span>
              ))}
            </div>
            {buildMonthGrid(month).map((week, wi) => (
              <div key={wi} role="row" className="grid grid-cols-7">
                {week.map((c) => {
                  const n = tally.get(c.key)
                  const total = n ? n.late + n.today + n.normal + n.done : 0
                  if (!c.inMonth) {
                    // เดือนข้างเคียง — ไม่มีข้อมูลของเดือนนั้นในมือ จึงไม่โชว์จุดและไม่รับกด (กันเปิดชีตว่างผิดความหมาย)
                    return (
                      <span key={c.key} role="gridcell" aria-hidden="true" className="text-default-400 flex min-h-11 items-start justify-center pt-1.5 text-sm">
                        {c.day}
                      </span>
                    )
                  }
                  const dots: DayTone[] = n
                    ? (['late', 'today', 'normal', 'done'] as DayTone[]).filter((k) => n[k] > 0).slice(0, 3)
                    : []
                  return (
                    <button
                      key={c.key}
                      type="button"
                      role="gridcell"
                      onClick={() => onOpenDay(c.key)}
                      aria-label={fmt(t.calCellAria, {
                        date: formatDateTH(new Date(`${c.key}T05:00:00Z`)),
                        late: n?.late ?? 0,
                        today: n?.today ?? 0,
                        normal: n?.normal ?? 0,
                        done: n?.done ?? 0,
                      })}
                      className="hover:bg-default-100 flex min-h-11 flex-col items-center gap-1 rounded-lg pt-1"
                    >
                      {/* ตัวแบกความหมายคือ "เลขตัวหนา + ขีดใต้" ของวันที่มีเลยกำหนด — จุดเล็กเป็น non-text ตก 3:1 */}
                      <span
                        className={`inline-flex size-6 items-center justify-center rounded-full text-sm ${
                          c.key === todayKey ? 'ring-primary ring-1' : ''
                        } ${n && n.late > 0 ? 'text-danger-ink font-bold underline underline-offset-2' : total > 0 ? 'text-default-900 font-medium' : 'text-default-700'}`}
                      >
                        {c.day}
                      </span>
                      <span className="flex h-2 items-center gap-0.5" aria-hidden="true">
                        {dots.map((k) => (
                          <span key={k} className={`${DOT[k]} block size-1.5 rounded-full`} />
                        ))}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
        <Legend />
      </div>
    </div>
  )
}

/** "YYYY-MM-DD" ตามเวลาเครื่อง — ช่องวันของ FullCalendar เป็นเวลาเครื่อง (ตามพี่น้อง AppointmentCalendar.localDayKey) */
function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
