'use client'

/**
 * AppointmentCalendar — ปฏิทินคิวของร้าน **เฉพาะเดสก์ท็อป (≥lg)** (feature 00024, FR-RSV-04)
 *
 * 🛑 2026-08-10: หน้า /queues render ตัวนี้ใต้ `hidden lg:block` แล้ว มือถือ/แท็บเล็ตได้
 *   `src/components/safepay/appointment-board/AppointmentMonthBoard.tsx` แทน (user สั่ง)
 *   → กิ่งมือถือทั้งหมดในไฟล์นี้ (state `isMobile`, effect `matchMedia(max-width:767px)`,
 *   มุมมอง dayGridWeek/listWeek บังคับ, layout ช่องวันแนวตั้ง, `capClassMobile`) ถูกลบทิ้ง
 *   เพราะเข้าไม่ถึงแล้ว — ถ้ายังอยู่ คนอ่านคนถัดไปจะมาแก้ผิดไฟล์
 *   เส้นสลับคือ lg (1024) ไม่ใช่ 768 ที่เคยใช้ในนี้ ให้ตรงกับ seller shell ทั้งตัว
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/calendar/components/CalendarPage.tsx
 *   (FullCalendar + dayGrid/timeGrid/list + headerToolbar + โครง .card)
 *   chase ในโปรเจกต์: src/app/(paces)/seller/(dashboard)/calendar/components/BookingCalendar.tsx
 *   ซึ่ง copy จาก theme ตัวเดียวกันไปแล้วสำหรับปฏิทินการจองห้องพัก (00017 P2)
 *
 * ตัดจาก theme: external events (drag-drop), AddEditModal, editable/droppable
 *   — การย้ายนัดด้วยการลากยังไม่รองรับ ถ้าเปิด editable ไว้ผู้ใช้จะลากแล้วเข้าใจว่าบันทึกแล้ว
 *     ทั้งที่ไม่ได้บันทึก (เหตุผลเดียวกับที่ BookingCalendar ตัดออก)
 *
 * IMPORTANT: เวอร์ชันแรกของหน้านี้ประกอบ agenda list เองโดยไม่ได้ copy จาก theme ซึ่งผิด
 *   Hard Rule 1 — user ตีกลับ 2026-07-31 ("หน้าปฏิทิน ต้องใช้ paces calendar")
 *
 * IMPORTANT: หัวเรื่องเดือน/ช่วงวัน render เอง ไม่ใช้ title ของ FullCalendar เพราะ FullCalendar
 *   แสดงปี ค.ศ. ส่วนทั้งระบบต้องเป็น พ.ศ. ผ่าน src/lib/format-date.ts
 *   (docs/conventions/date-format.md) จึงตั้ง center: '' แล้ววาดหัวเรื่องเองที่ card-header
 *
 * IMPORTANT: คำว่า "ที่นั่ง" (serviceSeat) เป็นกลไกภายใน ห้ามโผล่ในหน้าจอ — ผู้ใช้เห็นได้แค่
 *   "จองแล้ว n จาก m คิว" ซึ่งคำนวณฝั่ง client เพราะ API ไม่ได้ส่งจำนวนมาให้ (API.md §4.5)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { parseQueueDateParam } from '@/lib/queue-date-param'
import { useRouter } from 'next/navigation'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
// interactionPlugin จำเป็นสำหรับ dateClick (กดช่องวันเพื่อสร้างการจอง) — option นี้มาจาก
// type augmentation ของ plugin ตัวนี้ ไม่ได้อยู่ใน core. theme ก็ import ตัวเดียวกัน
// ยังคง editable/selectable = false — เปิด plugin ไม่ได้แปลว่าเปิดการลาก
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import type { DatesSetArg, DateSelectArg, EventClickArg, EventInput } from '@fullcalendar/core'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import {
  APPOINTMENT_STATUS_LABEL,
  isAllDayAppointment,
  type AppointmentStatus,
} from '@/lib/appointments'
import { formatDateTH, formatMonthYearTH } from '@/lib/format-date'

type ResourceOption = { id: string; name: string; capacity: number }

/** รูปแบบ item ที่ GET /api/shops/current/appointments คืนมา (API.md §4.5) */
type AppointmentItem = {
  orderToken: string
  orderNo: string | null
  resource: { id: string; name: string; capacity: number } | null
  start: string
  end: string
  appointmentStatus: string | null
  buyerName: string | null
}

type Props = {
  resources: ResourceOption[]
  /** คำเรียกการสร้างรายการของร้านนี้ (ORDER_VOCAB) — ห้าม hardcode "จองคิว" (HR16, 2026-08-10) */
  createLabelShort: string
}

const ALL = ''

/**
 * สีของสถานะนัด — ใช้ token ของ Paces ไม่ hardcode hex
 *
 * Verified-Means-Green (ปรับ 2026-08-07 feature 00036): เขียวสงวนให้ "ให้บริการแล้ว" ตัวเดียว
 * เพราะเป็นสถานะเดียวที่เป็นข้อเท็จจริงซึ่งเกิดขึ้นแล้ว — "ลูกค้ายืนยันแล้ว" คือคำบอกว่าจะมา
 * (ยังไม่ถึงวันนัดด้วยซ้ำ) จึงเป็น primary ไม่ใช่เขียว · สถานะที่ยังไม่นิ่ง (นัดแล้ว) ใช้ warning
 * ไม่มาตามนัด = danger เพราะเป็นผลลบจริง · SSOT ของชุดสี = src/lib/appointment-stage.ts
 */
const STATUS_CLASS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'appt-ev-scheduled',
  CONFIRMED_BY_BUYER: 'appt-ev-confirmed',
  RESCHEDULE_REQUESTED: 'appt-ev-reschedule',
  COMPLETED: 'appt-ev-completed',
  NO_SHOW: 'appt-ev-noshow',
}

/**
 * จุดสีในคำอธิบายใต้ปฏิทิน ต้องแยกได้ครบ 5 สถานะเท่ากับป้ายบนปฏิทิน
 * เดิม 5 สถานะยุบเหลือ 3 สี ทำให้ "ลูกค้าขอเลื่อน" (สถานะเดียวที่ร้านต้องลงมือทำ)
 * หน้าตาเหมือน "นัดแล้ว" เป๊ะ — กวาดตาทั้งเดือนแล้วหาใบที่ต้องโทรกลับไม่เจอ
 */
const STATUS_DOT: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-warning',
  // primary/success สลับกันกับของเดิม 2026-08-07 (feature 00036 — user เคาะ): เขียวต้องอยู่กับ
  // สิ่งที่เกิดขึ้นแล้วเท่านั้น ไม่ใช่กับคำบอกของผู้ซื้อว่าจะมา — เหตุผลเต็มอยู่ที่ _calendar.css
  // และ SSOT ของชุดสีอยู่ที่ src/lib/appointment-stage.ts (หน้า /orders ใช้ชุดเดียวกัน)
  CONFIRMED_BY_BUYER: 'bg-primary',
  RESCHEDULE_REQUESTED: 'bg-info',
  COMPLETED: 'bg-success',
  NO_SHOW: 'bg-danger',
}

const STATUS_ORDER: AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED_BY_BUYER',
  'RESCHEDULE_REQUESTED',
  'COMPLETED',
  'NO_SHOW',
]

/**
 * จำนวนนัดที่ทับช่วงเวลาของ item นี้ บนคิวงานเดียวกัน (รวมตัวเอง)
 *
 * ใช้แสดง "จองแล้ว n จาก m คิว" — API ไม่ได้ส่งตัวเลขนี้มา จึงนับจาก dataset ที่โหลดอยู่
 * เกณฑ์ทับซ้อนมาตรฐาน: a.start < b.end && b.start < a.end (ต่อกันพอดีไม่ถือว่าทับ ตรงกับ
 * '[)' ของ EXCLUDE constraint ฝั่ง DB)
 *
 * IMPORTANT: เป็นตัวเลข "เพื่อดู" เท่านั้น ไม่ใช่ตัวตัดสินว่าจองได้/ไม่ได้ (BR-RSV-18)
 */

// ── ความจุรายวัน (FR-RSV-04) ────────────────────────────────────────────────
// เจ้าของร้านถามว่า "วันไหนยังรับรถได้อีก" ไม่ใช่ "วันนี้มีใบนัดกี่ใบ" — ร้านมีหลายคิวงาน
// ถ้าโชว์แต่ใบนัด ต้องนับเองว่าเหลือที่ว่างไหม จึงสรุปเป็นแถบความจุต่อวัน
//
// IMPORTANT: เป็นตัวเลข "เพื่อดู" เท่านั้น ไม่ใช่ตัวตัดสินว่าจองได้/ไม่ได้ (BR-RSV-18)
// ตัวตัดสินจริงคือ EXCLUDE constraint ตอนบันทึก — วันที่ขึ้นว่าเต็มจึงกันแค่ปุ่มลัด
// ไม่ได้กันการสร้างออเดอร์ผ่านเส้นทางปกติ

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 86_400_000

/** คีย์ "YYYY-MM-DD" ตามปฏิทินไทย — ใช้จับนัดเข้ากับช่องวันของ FullCalendar */
function bangkokDayKey(d: Date): string {
  return new Date(d.getTime() + BKK_OFFSET_MS).toISOString().slice(0, 10)
}

/** ช่องวันของ FullCalendar เป็นเวลาเครื่อง — แปลงเป็นคีย์เดียวกันเพื่อเทียบกันได้ */
function localDayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function bookedAtSameTime(item: AppointmentItem, all: AppointmentItem[]): number {
  if (!item.resource) return 0
  const aStart = new Date(item.start).getTime()
  const aEnd = new Date(item.end).getTime()
  return all.filter((other) => {
    if (other.resource?.id !== item.resource!.id) return false
    const bStart = new Date(other.start).getTime()
    const bEnd = new Date(other.end).getTime()
    return aStart < bEnd && bStart < aEnd
  }).length
}

export default function AppointmentCalendar({ resources, createLabelShort }: Props) {
  const router = useRouter()
  const calendarRef = useRef<FullCalendar | null>(null)
  const dateParam = parseQueueDateParam(useSearchParams().get('date'))
  const [resourceId, setResourceId] = useState<string>(ALL)
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [title, setTitle] = useState('')
  const [items, setItems] = useState<AppointmentItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetchAppointments = useCallback(async (from: string, to: string, resource: string) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from, to, ...(resource ? { resourceId: resource } : {}) })
      const res = await fetch(`/api/shops/current/appointments?${qs}`, { cache: 'no-store' })
      if (!res.ok) {
        pacesToast.error('โหลดปฏิทินไม่สำเร็จ ลองอีกครั้ง')
        return
      }
      const json = (await res.json()) as { items: AppointmentItem[] }
      setItems(Array.isArray(json.items) ? json.items : [])
    } catch {
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    } finally {
      setLoading(false)
    }
  }, [])

  // datesSet ยิงทุกครั้งที่เปลี่ยนเดือน/มุมมอง — ใช้เป็นตัวกระตุ้นโหลดช่วงที่มองเห็นจริง
  // และเป็นที่เดียวที่รู้ช่วงวันที่ปัจจุบัน จึงประกอบหัวเรื่อง พ.ศ. ที่นี่ด้วย
  const onDatesSet = useCallback((arg: DatesSetArg) => {
    setRange({ from: arg.start.toISOString(), to: arg.end.toISOString() })
    const days = Math.round((arg.end.getTime() - arg.start.getTime()) / 86_400_000)
    if (days > 8) {
      // มุมมองเดือน — ใช้กลางช่วงกันเดือนเพี้ยน เพราะ dayGridMonth คาบเกี่ยวปลายเดือนก่อน
      setTitle(formatMonthYearTH(new Date((arg.start.getTime() + arg.end.getTime()) / 2)))
    } else if (days > 1) {
      setTitle(`${formatDateTH(arg.start)} – ${formatDateTH(new Date(arg.end.getTime() - 1))}`)
    } else {
      setTitle(formatDateTH(arg.start))
    }
  }, [])

  useEffect(() => {
    if (range) fetchAppointments(range.from, range.to, resourceId)
  }, [range, resourceId, fetchAppointments])




  /**
   * ความจุรวมของวันหนึ่ง = ผลรวม capacity ของคิวงานที่กำลังดูอยู่
   * กรองคิวงานเดียว → นับเฉพาะตัวนั้น (user ตัดสิน 2026-07-31: รวมทุกคิวงานเป็นตัวเดียว)
   */
  const totalCapacity = useMemo(
    () =>
      (resourceId ? resources.filter((r) => r.id === resourceId) : resources).reduce(
        (sum, r) => sum + r.capacity,
        0,
      ),
    [resources, resourceId],
  )

  /** จำนวนนัดต่อวัน (คีย์ตามปฏิทินไทย) — นับนัดที่คาบเกี่ยววันนั้น */
  const bookedByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const it of items) {
      const start = new Date(it.start)
      const end = new Date(it.end)
      // นัดข้ามวันนับเข้าทุกวันที่มันกิน — วันนั้นถือว่าคิวถูกใช้ไปแล้ว
      for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
        const k = bangkokDayKey(new Date(t))
        map.set(k, (map.get(k) ?? 0) + 1)
        if (end.getTime() - t <= DAY_MS) break
      }
    }
    return map
  }, [items])

  /**
   * กดช่องวัน → เปิดฟอร์มสร้างออเดอร์พร้อมวันที่กรอกไว้ให้แล้ว
   * (user ตัดสิน 2026-07-31: ใช้ /orders/new เดิม ไม่ทำฟอร์มย่อในปฏิทิน)
   * วันที่เต็มแล้วไม่เปิด — กันการเสียเวลากรอกแล้วโดนปฏิเสธตอนบันทึก
   */
  const onDateClick = useCallback(
    (arg: { date: Date }) => {
      const key = localDayKey(arg.date)
      if (totalCapacity > 0 && (bookedByDay.get(key) ?? 0) >= totalCapacity) {
        // เดิม return เปล่า ๆ — ผู้ใช้กดแล้วไม่มีอะไรเกิดขึ้น แล้วสรุปว่าเว็บพัง
        // ต้องบอกว่า "ถูกป้องกันไว้" ไม่ใช่เงียบ (impeccable critique 2026-07-31)
        pacesToast.warning(`${formatDateTH(arg.date)} รับนัดเต็มแล้ว — เลือกวันอื่น`)
        return
      }
      router.push(`/orders/new?appointmentDate=${key}`)
    },
    [router, bookedByDay, totalCapacity],
  )

  const events: EventInput[] = useMemo(
    () =>
      items.map((it) => {
        const status = (it.appointmentStatus ?? 'SCHEDULED') as AppointmentStatus
        const who = it.buyerName ?? 'ไม่ระบุชื่อ'
        // เลือกคิวงานเดียวอยู่แล้ว → ไม่ต้องใส่ชื่อซ้ำทุกใบ
        const base = resourceId ? who : `${it.resource?.name ?? '—'} · ${who}`
        // ป้ายความจุเฉพาะคิวงานที่รับได้มากกว่า 1 (capacity=1 ไม่ต้องบอก ทุกคนรู้อยู่แล้ว)
        const cap =
          it.resource && it.resource.capacity > 1
            ? ` (จองแล้ว ${bookedAtSameTime(it, items)} จาก ${it.resource.capacity} คิว)`
            : ''
        // เลขคำสั่งซื้อต่อท้ายเพื่อให้เห็น "มาจากออเดอร์ไหน" ก่อนกด ไม่ใช่กดแล้วค่อยรู้
          // (user สั่ง 2026-07-31: การจองต้อง map กับ order ได้)
        return {
          id: it.orderToken,
          title: `${base}${cap}${it.orderNo ? ` · ${it.orderNo}` : ''}`,
          start: it.start,
          end: it.end,
          // นัดรายวัน (FR-RSV-13) ให้ FullCalendar วางเป็น all-day ไม่ใช่แถบเวลา 00:00-00:00
          allDay: isAllDayAppointment(new Date(it.start), new Date(it.end)),
          // fallback ใช้สีของ "จบแล้ว" — สถานะที่ไม่รู้จักไม่ควรดูเหมือนสิ่งที่ต้องลงมือทำ
          className: STATUS_CLASS[status] ?? 'appt-ev-completed',
        }
      }),
    [items, resourceId],
  )

  const onEventClick = useCallback(
    (arg: EventClickArg) => router.push(`/orders/${arg.event.id}`),
    [router],
  )

  const filteredResource = resources.find((r) => r.id === resourceId) ?? null

  return (
    <div className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="card-title">ปฏิทินคิว{title ? ` · ${title}` : ''}</h4>
          {filteredResource ? (
            <p className="text-default-500 mt-0.5 text-sm">
              กำลังดูเฉพาะ {filteredResource.name} · นัดของประเภทงานอื่นถูกซ่อนอยู่
            </p>
          ) : (
            <p className="text-default-500 mt-0.5 text-sm">
              กดที่นัดเพื่อเปิดคำสั่งซื้อ · นัดที่ยกเลิกแล้วไม่แสดง
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* field ที่ bind state ใช้ form-select native ไม่ใช่ hs-dropdown */}
          {resources.length > 1 && (
            <select
              className="form-select min-h-11"
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              aria-label="กรองตามประเภทงาน"
            >
              <option value="">ดูทั้งหมด</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
          {loading && (
            <Icon icon="tabler:loader-2" className="text-default-400 size-5 animate-spin" />
          )}
        </div>
      </div>

      {/* appointment-calendar — scope ของ CSS ที่ทำให้ปุ่มมุมมองที่กำลังใช้อยู่เด่นกว่าปุ่มอื่น
          (ดู src/assets/css/plugins/_calendar.css) ไม่กระทบปฏิทินการจองห้องพักของ 00017 */}
      <div className="card-body appointment-calendar">
        <FullCalendar
          /* ref นี้จำเป็นจริง — ไม่มีมันแล้ว calendarRef.current เป็น null ตลอด
             ทำให้ effect ที่สลับมุมมองตามขนาดจอไม่เคยทำงานเลย (เจอ 2026-08-01) */
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          /**
           * `?date=YYYY-MM-DD` → เปิดปฏิทินที่เดือนของวันนั้น (ไทล์ "นัดวันนี้" ส่งมาให้)
           *
           * 🛑 เป็น `initialDate` ไม่ใช่ state ที่ผูกกับ URL — FullCalendar อ่านค่านี้ครั้งเดียว
           * ตอน mount ถ้าผูกต่อเนื่อง ผู้ใช้กดเดือนหน้าแล้วจะถูกดีดกลับทุก re-render เพราะ
           * `?date=` ยังอยู่ใน URL (บั๊กคู่แฝดกับ `autoOpened` ใน AppointmentMonthBoard)
           *
           * ค่าที่ไทล์ส่งมาคือ "วันนี้" ซึ่งตรงกับค่าตั้งต้นของ FullCalendar อยู่แล้ว —
           * บรรทัดนี้จึงมีผลจริงกับลิงก์ที่ชี้วันอื่น (เช่น เปิดจากประวัติ) ไม่ใช่โค้ดตาย
           */
          initialDate={dateParam ?? undefined}
          locale="th"
          height="auto"
          firstDay={1}
          buttonText={{
            today: 'วันนี้',
            month: 'เดือน',
            week: 'สัปดาห์',
            day: 'วัน',
            list: 'รายการ',
          }}
          // 'prev,next,today' คั่นด้วยจุลภาคล้วน = กลุ่มเดียว ตรงกับ theme —
          // เขียนเป็น 'prev,next today' (เว้นวรรค) จะกลายเป็นสองกลุ่มแล้วปุ่มตกบรรทัด
          // center ว่างเพราะวาดหัวเรื่อง พ.ศ. เองที่ card-header (FullCalendar แสดง ค.ศ.)
          /**
           * มือถือเหลือปุ่มมุมมองตัวเดียว — 8 ปุ่มไม่มีทางพอที่ 375px
           * (เจอจริง: "วันนี้" ถูกบีบเป็นสองบรรทัดระหว่างปุ่ม prev/next กับปุ่มมุมมอง)
           * ต้องลดจำนวนปุ่ม ไม่ใช่บีบให้พอ — เก็บ "รายการ" ไว้เพราะเป็นมุมมองที่ร้าน
           * ใช้จริงบนมือถือ ("วันนี้ใครเข้ามาบ้าง") ส่วนเดือน/สัปดาห์เวลา/วัน ตัดออก
           * เพราะซับซ้อนเกินจำเป็นบนจอแคบและเป็นต้นเหตุ overflow โดยตรง
           */
          headerToolbar={{
            left: 'prev,next,today',
            center: '',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
          }}
          noEventsText="ช่วงนี้ยังไม่มีนัด — นัดจะขึ้นเมื่อคุณระบุวันเข้าใช้บริการตอนสร้างออเดอร์"
          allDayText="ทั้งวัน"
          events={events}
          eventClick={onEventClick}
          datesSet={onDatesSet}
          dateClick={onDateClick}
          /* ช่องวันบอก 3 อย่างในบรรทัดเดียว: เลขวัน · จองแล้วกี่จากกี่คิว · ปุ่มจอง (โผล่ตอน hover)
             ปุ่มอยู่ในแถบหัวช่องเพราะ FullCalendar ให้เราแทรก DOM ได้แค่ตรงนี้โดยไม่ต้องแฮ็ก
             ภายใน — ต่างจาก mockup ที่วาดปุ่มไว้ก้นช่อง */
          dayCellClassNames={(arg) => {
            if (totalCapacity <= 0) return []
            const n = bookedByDay.get(localDayKey(arg.date)) ?? 0
            if (n >= totalCapacity) return ['appt-day-full']
            /**
             * IMPORTANT: ต้องมี `n > 0` ด้วย
             *
             * เดิมเช็คแค่ `n === totalCapacity - 1` — ร้านที่ความจุรวม = 1 (คิวงานเดียว
             * ความจุ 1 ซึ่งเป็นเคสปกติของลูกค้ากลุ่มแรก) จะได้ `totalCapacity - 1 = 0`
             * ทำให้ **วันที่ว่างเปล่า (n = 0) เข้าเงื่อนไข "ใกล้เต็ม" ทุกวัน**
             * วัดบน prod: ย้อมไป 42 จาก 42 ช่อง = ทั้งเดือนเป็นครีม ซึ่งกลับหัวกับความหมาย
             * (user รายงาน 2026-08-01: "สีมันไม่ได้เลย หน้านี้")
             */
            if (n > 0 && n === totalCapacity - 1) return ['appt-day-tight']
            return []
          }}
          dayCellContent={(arg) => {
            const n = bookedByDay.get(localDayKey(arg.date)) ?? 0
            const full = totalCapacity > 0 && n >= totalCapacity
            const cap =
              n > 0 && totalCapacity > 0
                ? full
                  ? `เต็ม ${n}/${totalCapacity}`
                  : `${n}/${totalCapacity}`
                : ''
            const tight = totalCapacity > 0 && !full && n > 0 && n === totalCapacity - 1
            /**
             * สีอยู่ที่ "ตัวเลข" ไม่ใช่พื้นทั้งช่อง — ตัวเลข n/m คือข้อมูลจริง
             * ส่วนพื้นที่ย้อม 100x100px เป็นของตกแต่งที่ทับ Cool Mist ของทั้งระบบ
             * (Design Spec: safepay-ux 2026-08-01 หลัง user บอกว่า "สีมันไม่ได้เลย")
             *
             * วันเต็มได้ pill เล็ก (idiom เดียวกับ badge ของ Paces)
             */
            const capClass = full
              ? 'bg-danger/15 text-danger-ink rounded px-1.5 py-0.5 font-bold'
              : tight
                ? 'text-warning-ink font-bold'
                : 'text-default-600 font-semibold'
            /**
             * ปุ่ม "จอง" ต้องเป็น <button> จริง ไม่ใช่ <span>
             * เดิมเป็น span ที่พึ่ง dateClick ของช่องทั้งช่อง → คีย์บอร์ดเข้าไม่ถึงเลย
             * และ CSS ซ่อนด้วย :hover ทำให้จอสัมผัสไม่มีวันเห็น (แก้ที่ _calendar.css ด้วย)
             */
            const addButton = (
              <button
                type="button"
                className={`appt-day-add btn btn-icon min-h-11 min-w-11 ${full ? 'text-danger-ink' : 'text-primary'}`}
                aria-label={
                  full
                    ? `${arg.dayNumberText} รับนัดเต็มแล้ว`
                    : `${createLabelShort} วันที่ ${arg.dayNumberText}`
                }
                onClick={(e) => {
                  // กันไม่ให้ dateClick ของช่องทำงานซ้ำอีกรอบ
                  e.stopPropagation()
                  onDateClick({ date: arg.date })
                }}
              >
                <Icon icon={full ? 'tabler:ban' : 'tabler:plus'} className="size-4" />
              </button>
            )

            return (
              <div className="flex w-full items-center justify-between gap-2">
                <span className={`appt-day-cap text-xs ${capClass}`}>{cap}</span>
                <span className="flex items-center gap-1.5">
                  {addButton}
                  <span
                    className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                      arg.isToday ? 'bg-primary text-white' : 'text-default-700'
                    }`}
                  >
                    {arg.dayNumberText}
                  </span>
                </span>
              </div>
            )
          }}
          // ตัด editable/droppable ออกจาก theme — ยังไม่รองรับการลากเปลี่ยนวัน
          // ถ้าเปิดไว้ผู้ใช้จะลากแล้วเข้าใจว่าบันทึกแล้วทั้งที่ไม่ได้บันทึก
          editable={false}
          selectable={false}
          /**
           * เพิ่มจาก theme (theme กับ BookingCalendar ของ 00017 ไม่ได้ตั้งค่านี้)
           *
           * ค่า default ของ FullCalendar คือ 'auto' ซึ่งแปลว่านัด "แบบมีเวลา" ในมุมมองเดือน
           * จะถูก render เป็น dot event (จุด + ข้อความ พื้นหลังโปร่งใสเสมอ) → class
           * bg-warning/bg-success/bg-danger ไม่มีผลเลย เหลือแค่ text-white ที่กลืนไปกับ
           * พื้นช่องวัน วัดได้จริง contrast 1.04:1 (ต้องการ 4.5:1) และทุกสถานะหน้าตาเหมือนกันหมด
           *
           * 00017 ไม่เจอปัญหานี้เพราะการจองห้องพักเป็น all-day ซึ่ง render เป็นบล็อกอยู่แล้ว
           * ร้านที่ตั้งหน่วยเวลาเป็นรายวันของ 00024 ก็รอดด้วยเหตุผลเดียวกัน
           */
          eventDisplay="block"
          dayMaxEvents={3}
        />

        {/* คำอธิบายสี — วางใต้ปฏิทิน ไม่ใช่เหนือ เพราะเป็นตัวช่วยอ่านที่เปิดดูตอนเห็นสีแล้ว
            ถ้าวางไว้ข้างบนจะไปคั่นระหว่างหัวเรื่องกับ toolbar ทำให้อ่านลำดับไม่ออก */}
        <div className="border-default-200 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm">
          {STATUS_ORDER.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={`${STATUS_DOT[s]} inline-block size-3 rounded`} />
              <span className="text-default-600">{APPOINTMENT_STATUS_LABEL[s]}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
