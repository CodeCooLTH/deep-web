'use client'

/**
 * BookingCalendar — ปฏิทินว่าง/ไม่ว่างของห้องพัก (feature 00017 Phase 2, FR-LODG-09)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/calendar/components/CalendarPage.tsx
 *   (FullCalendar + dayGridPlugin + headerToolbar + โครง .card)
 *
 * ตัดจาก theme: drag-drop/editable/external events/timeGrid/list view/AddEditModal
 *   — การย้ายการจองด้วยการลากอยู่นอกขอบเขต P2 และ editable=true จะทำให้ผู้ใช้เข้าใจผิด
 *     ว่าลากเปลี่ยนวันได้ทั้งที่ระบบยังไม่รองรับ
 *
 * IMPORTANT: ช่วงที่กันคิวคือ [checkIn, checkOut) — วันเช็คเอาท์ "ว่าง" (BR-LODG-31)
 * FullCalendar ใช้ end แบบ exclusive อยู่แล้ว จึงส่ง checkOut ตรง ๆ ได้พอดี ไม่ต้อง +1/-1
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dayGridPlugin from '@fullcalendar/daygrid'
import FullCalendar from '@fullcalendar/react'
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

type RoomAvailability = {
  roomId: string
  name: string
  bookings: {
    token: string
    checkIn: string | null
    checkOut: string | null
    guestName: string | null
    status: string
  }[]
}

type Props = { rooms: { id: string; name: string }[] }

/** สีตามสถานะ — IMPORTANT: "รอยืนยัน" ห้ามเป็นเขียว (Verified-Means-Green สงวนให้ยืนยันแล้ว) */
const STATUS_CLASS: Record<string, string> = {
  PENDING: 'bg-warning border-warning text-white',
  CONFIRMED: 'bg-success border-success text-white',
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default function BookingCalendar({ rooms }: Props) {
  const router = useRouter()
  const [roomId, setRoomId] = useState<string>('')
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const [data, setData] = useState<RoomAvailability[]>([])
  const [loading, setLoading] = useState(false)

  const fetchAvailability = useCallback(
    async (from: string, to: string, room: string) => {
      setLoading(true)
      try {
        const qs = new URLSearchParams({ from, to, ...(room ? { roomId: room } : {}) })
        const res = await fetch(`/api/shops/current/rooms/availability?${qs}`, { cache: 'no-store' })
        if (!res.ok) {
          pacesToast.error('โหลดปฏิทินไม่สำเร็จ ลองอีกครั้ง')
          return
        }
        const json = (await res.json()) as { rooms: RoomAvailability[] }
        setData(json.rooms)
      } catch {
        pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  // datesSet ยิงทุกครั้งที่เปลี่ยนเดือน — ใช้เป็นตัวกระตุ้นโหลดข้อมูลช่วงที่มองเห็นจริง
  const onDatesSet = useCallback((arg: DatesSetArg) => {
    setRange({ from: toISODate(arg.start), to: toISODate(arg.end) })
  }, [])

  useEffect(() => {
    if (range) fetchAvailability(range.from, range.to, roomId)
  }, [range, roomId, fetchAvailability])

  const events: EventInput[] = useMemo(
    () =>
      data.flatMap((r) =>
        r.bookings
          .filter((b) => b.checkIn && b.checkOut)
          .map((b) => ({
            id: b.token,
            // ไม่มีห้องเดียวถูกเลือก → ใส่ชื่อห้องนำหน้าเพื่อแยกออกจากกัน
            title: roomId ? (b.guestName ?? 'ไม่ระบุชื่อ') : `${r.name} · ${b.guestName ?? 'ไม่ระบุชื่อ'}`,
            start: b.checkIn!,
            // FullCalendar end = exclusive ตรงกับนิยาม [checkIn, checkOut) พอดี
            end: b.checkOut!,
            className: STATUS_CLASS[b.status] ?? 'bg-default-400 border-default-400 text-white',
          })),
      ),
    [data, roomId],
  )

  const onEventClick = useCallback(
    (arg: EventClickArg) => router.push(`/bookings/${arg.event.id}`),
    [router],
  )

  return (
    <div className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="card-title">ปฏิทินการจอง</h4>
          <p className="text-default-500 mt-0.5 text-sm">
            วันเช็คเอาท์ถือว่าว่าง ผู้เข้าพักรายถัดไปเช็คอินวันเดียวกันได้
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* HR6: field ที่ bind state ใช้ form-select native ไม่ใช่ hs-dropdown */}
          <select
            className="form-select min-h-11"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            aria-label="กรองตามห้องพัก"
          >
            <option value="">ทุกห้อง</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {loading && <Icon icon="tabler:loader-2" className="text-default-400 size-5 animate-spin" />}
        </div>
      </div>

      <div className="card-body">
        <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-warning inline-block size-3 rounded" />
            <span className="text-default-600">รอยืนยัน</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-success inline-block size-3 rounded" />
            <span className="text-default-600">ยืนยันแล้ว</span>
          </span>
        </div>

        <FullCalendar
          plugins={[dayGridPlugin]}
          initialView="dayGridMonth"
          locale="th"
          height="auto"
          firstDay={1}
          buttonText={{ today: 'วันนี้' }}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
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
