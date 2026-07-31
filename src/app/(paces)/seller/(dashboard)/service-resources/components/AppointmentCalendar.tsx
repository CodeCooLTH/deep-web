'use client'

/**
 * AppointmentCalendar — ปฏิทินคิวของร้าน (feature 00024, FR-RSV-04)
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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import FullCalendar from '@fullcalendar/react'
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core'
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

type Props = { resources: ResourceOption[] }

const ALL = ''

/**
 * สีของสถานะนัด — ใช้ token ของ Paces ไม่ hardcode hex
 *
 * Verified-Means-Green: เขียวเฉพาะสถานะที่ "ยืนยันแล้วจริง" (ลูกค้ายืนยัน / ให้บริการแล้ว)
 * สถานะที่ยังไม่นิ่ง (นัดแล้ว / ขอเลื่อน) ใช้ warning ไม่ใช่เขียว เพื่อไม่ให้สัญญาณ trust เฟ้อ
 * ไม่มาตามนัด = danger เพราะเป็นผลลบจริง
 */
const STATUS_CLASS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-warning border-warning text-white',
  CONFIRMED_BY_BUYER: 'bg-success border-success text-white',
  RESCHEDULE_REQUESTED: 'bg-warning border-warning text-white',
  COMPLETED: 'bg-success border-success text-white',
  NO_SHOW: 'bg-danger border-danger text-white',
}

const STATUS_DOT: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-warning',
  CONFIRMED_BY_BUYER: 'bg-success',
  RESCHEDULE_REQUESTED: 'bg-warning',
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

export default function AppointmentCalendar({ resources }: Props) {
  const router = useRouter()
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
        return {
          id: it.orderToken,
          title: `${base}${cap}`,
          start: it.start,
          end: it.end,
          // นัดรายวัน (FR-RSV-13) ให้ FullCalendar วางเป็น all-day ไม่ใช่แถบเวลา 00:00-00:00
          allDay: isAllDayAppointment(new Date(it.start), new Date(it.end)),
          className: STATUS_CLASS[status] ?? 'bg-default-400 border-default-400 text-white',
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
              กำลังดูเฉพาะ {filteredResource.name} · นัดของคิวงานอื่นถูกซ่อนอยู่
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
              aria-label="กรองตามคิวงาน"
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

      <div className="card-body">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {STATUS_ORDER.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={`${STATUS_DOT[s]} inline-block size-3 rounded`} />
              <span className="text-default-600">{APPOINTMENT_STATUS_LABEL[s]}</span>
            </span>
          ))}
        </div>

        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
          initialView="dayGridMonth"
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
          // center ว่างเพราะวาดหัวเรื่อง พ.ศ. เองที่ card-header (FullCalendar แสดง ค.ศ.)
          headerToolbar={{
            left: 'prev,next today',
            center: '',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
          }}
          noEventsText="ยังไม่มีนัดในช่วงนี้"
          allDayText="ทั้งวัน"
          events={events}
          eventClick={onEventClick}
          datesSet={onDatesSet}
          // ตัด editable/droppable ออกจาก theme — ยังไม่รองรับการลากเปลี่ยนวัน
          // ถ้าเปิดไว้ผู้ใช้จะลากแล้วเข้าใจว่าบันทึกแล้วทั้งที่ไม่ได้บันทึก
          editable={false}
          selectable={false}
          dayMaxEvents={3}
        />
      </div>
    </div>
  )
}
