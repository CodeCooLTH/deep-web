'use client'

/**
 * AppointmentCalendar — ปฏิทินคิวของร้าน mobile-first (feature 00024, FR-RSV-04)
 *
 * Base: src/app/(paces)/seller/(dashboard)/bookings/page.tsx
 *   — โครง list เดียวกัน: .card > การ์ด mobile (divide-y) / ตาราง desktop (.table)
 *     ซึ่ง chase ต่อไปที่ theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/CustomerTable.tsx
 *   + legend จุดสี: src/app/(paces)/seller/(dashboard)/calendar/components/BookingCalendar.tsx
 *   + ตัวกรอง: src/components/safepay/FilterDropdown.tsx (§3b paces-component-reference)
 *
 * Design Spec: safepay-ux ส่วน B
 *
 * IMPORTANT: toggle รายวัน/รายสัปดาห์ ขับด้วย React state เอง ไม่ใช้ Preline data-hs-tab —
 * component นี้ re-render ทุกครั้งที่ fetch ข้อมูลใหม่ ซึ่งเข้าเงื่อนไขบั๊ก "Preline inline-state
 * หายหลัง re-render" เป๊ะ (เหตุผลเดียวกับที่ FilterDropdown ต้อง custom แทน hs-dropdown)
 *
 * IMPORTANT: คำว่า "ที่นั่ง" (serviceSeat) เป็นกลไกภายใน ห้ามโผล่ในหน้าจอ — ผู้ใช้เห็นได้แค่
 * "จองแล้ว n จาก m คิว" ซึ่งคำนวณฝั่ง client เพราะ API ไม่ได้ส่งจำนวนมาให้ (API.md §4.5)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import { pacesToast } from '@/lib/paces-toast'
import {
  APPOINTMENT_STATUS_LABEL,
  type AppointmentStatus,
} from '@/lib/appointments'
import {
  formatDateTH,
  formatTimeHM,
  formatWeekdayDateTH,
  weekdayShortTH,
} from '@/lib/format-date'

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

const ALL = 'ALL'

/**
 * สีของสถานะนัด — soft badge ตาม _badge.css ของ Paces
 *
 * Verified-Means-Green: เขียวเฉพาะสถานะที่ "ยืนยันแล้วจริง" (ลูกค้ายืนยัน / ให้บริการแล้ว)
 * สถานะที่ยังไม่นิ่ง (นัดแล้ว / ขอเลื่อน) ใช้ warning ไม่ใช่เขียว เพื่อไม่ให้สัญญาณ trust เฟ้อ
 * ไม่มาตามนัด = danger เพราะเป็นผลลบจริง
 */
const STATUS_CLASS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-warning/15 text-warning',
  CONFIRMED_BY_BUYER: 'bg-success/15 text-success',
  RESCHEDULE_REQUESTED: 'bg-warning/15 text-warning',
  COMPLETED: 'bg-success/15 text-success',
  NO_SHOW: 'bg-danger/15 text-danger',
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

// ── ตัวช่วยเรื่องวัน (คิดตามปฏิทินไทยเสมอ) ────────────────────────────────────
const DAY_MS = 86_400_000
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000

/** เที่ยงคืนของวันไทยที่ครอบ d — คืนเป็น Date (instant จริง) */
function startOfBangkokDay(d: Date): Date {
  const shifted = d.getTime() + BKK_OFFSET_MS
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - BKK_OFFSET_MS)
}

/** วันจันทร์ของสัปดาห์ที่ครอบ d (สัปดาห์เริ่มจันทร์ตามการใช้งานของร้าน) */
function startOfBangkokWeek(d: Date): Date {
  const day0 = startOfBangkokDay(d)
  const idx = Math.floor((day0.getTime() + BKK_OFFSET_MS) / DAY_MS)
  // epoch day 0 = พฤหัสบดี → หาว่าห่างจากจันทร์กี่วัน
  const dow = (((idx + 3) % 7) + 7) % 7
  return new Date(day0.getTime() - dow * DAY_MS)
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS)
}

function sameBangkokDay(a: Date, b: Date): boolean {
  return startOfBangkokDay(a).getTime() === startOfBangkokDay(b).getTime()
}

/**
 * จำนวนนัดที่ทับช่วงเวลาของ item นี้ บนทรัพยากรเดียวกัน (รวมตัวเอง)
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

function StatusBadge({ status }: { status: string | null }) {
  if (!status || !(status in APPOINTMENT_STATUS_LABEL)) return null
  const s = status as AppointmentStatus
  return <span className={`badge ${STATUS_CLASS[s]}`}>{APPOINTMENT_STATUS_LABEL[s]}</span>
}

/** ป้ายความจุ — แสดงเฉพาะทรัพยากรที่รับได้มากกว่า 1 คิว (capacity=1 ไม่ต้องบอก ทุกคนรู้อยู่แล้ว) */
function CapacityChip({ item, all }: { item: AppointmentItem; all: AppointmentItem[] }) {
  if (!item.resource || item.resource.capacity <= 1) return null
  return (
    <span className="badge bg-default-100 text-default-600 inline-flex items-center gap-1">
      <Icon icon="tabler:users" className="size-3.5" />
      จองแล้ว {bookedAtSameTime(item, all)} จาก {item.resource.capacity} คิว
    </span>
  )
}

export default function AppointmentCalendar({ resources }: Props) {
  const [mode, setMode] = useState<'day' | 'week'>('day')
  const [anchor, setAnchor] = useState(() => startOfBangkokDay(new Date()))
  const [resourceId, setResourceId] = useState<string>(ALL)
  const [items, setItems] = useState<AppointmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  // วันที่เลือกภายใน week view บนมือถือ (desktop แสดงทั้ง 7 วันพร้อมกัน ไม่ต้องเลือก)
  const [pickedDay, setPickedDay] = useState<Date | null>(null)

  const rangeStart = mode === 'day' ? anchor : startOfBangkokWeek(anchor)
  const rangeEnd = mode === 'day' ? addDays(anchor, 1) : addDays(startOfBangkokWeek(anchor), 7)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const qs = new URLSearchParams({
        from: rangeStart.toISOString(),
        to: rangeEnd.toISOString(),
      })
      if (resourceId !== ALL) qs.set('resourceId', resourceId)
      const res = await fetch(`/api/shops/current/appointments?${qs}`, { cache: 'no-store' })
      if (!res.ok) {
        setFailed(true)
        pacesToast.error('โหลดปฏิทินไม่สำเร็จ ลองอีกครั้ง')
        return
      }
      const data = await res.json()
      setItems(Array.isArray(data?.items) ? data.items : [])
    } catch {
      setFailed(true)
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    } finally {
      setLoading(false)
    }
    // rangeStart/rangeEnd เป็น Date ใหม่ทุก render → ใช้ค่า epoch เป็น dep แทนเพื่อไม่ให้ loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart.getTime(), rangeEnd.getTime(), resourceId])

  useEffect(() => {
    load()
  }, [load])

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(startOfBangkokWeek(anchor), i)),
    [anchor],
  )

  const itemsOfDay = useCallback(
    (day: Date) => items.filter((it) => sameBangkokDay(new Date(it.start), day)),
    [items],
  )

  const today = startOfBangkokDay(new Date())
  const isOnToday =
    mode === 'day'
      ? sameBangkokDay(anchor, today)
      : startOfBangkokWeek(anchor).getTime() === startOfBangkokWeek(today).getTime()

  const step = (dir: 1 | -1) => {
    setPickedDay(null)
    setAnchor((prev) => addDays(prev, mode === 'day' ? dir : dir * 7))
  }

  const goToday = () => {
    setPickedDay(null)
    setAnchor(startOfBangkokDay(new Date()))
  }

  // มือถือ week view แสดงทีละวัน — default เป็นวันแรกของสัปดาห์ที่มีนัด ถ้าไม่มีเลยใช้วันจันทร์
  const mobileWeekDay =
    pickedDay ?? weekDays.find((d) => itemsOfDay(d).length > 0) ?? weekDays[0]

  const headerLabel =
    mode === 'day'
      ? formatWeekdayDateTH(anchor)
      : `${formatDateTH(weekDays[0])} – ${formatDateTH(weekDays[6])}`

  // ตัวกรองที่มีตัวเลือกเดียวไม่ได้ทำอะไร — ซ่อนไปเลย
  const showFilter = resources.length > 1
  const filterOptions = [
    { value: ALL, label: 'ทุกทรัพยากร' },
    ...resources.map((r) => ({ value: r.id, label: r.name })),
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* ── แถบควบคุม: โหมด + ตัวกรอง ── */}
      <div className="card">
        <div className="card-body flex flex-wrap items-center justify-between gap-3">
          {/* toggle ขับด้วย state เอง ไม่ใช่ Preline (ดูหมายเหตุหัวไฟล์) */}
          <div className="bg-default-100 inline-flex rounded-lg p-1">
            {(['day', 'week'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setPickedDay(null)
                }}
                aria-pressed={mode === m}
                className={`btn min-h-11 px-4 text-sm ${
                  mode === m ? 'bg-primary text-white' : 'text-default-700'
                }`}
              >
                {m === 'day' ? 'รายวัน' : 'รายสัปดาห์'}
              </button>
            ))}
          </div>

          {showFilter && (
            <FilterDropdown
              icon="filter"
              value={resourceId}
              options={filterOptions}
              onChange={setResourceId}
              defaultLabel="ทรัพยากร"
              resetValue={ALL}
              align="right"
            />
          )}
        </div>
      </div>

      {/* ── ตัวเลื่อนวัน/สัปดาห์ ── */}
      <div className="card">
        <div className="card-body flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={mode === 'day' ? 'วันก่อนหน้า' : 'สัปดาห์ก่อนหน้า'}
            className="btn bg-default-100 text-default-700 hover:bg-default-200 min-h-11 min-w-11"
          >
            <Icon icon="tabler:chevron-left" className="size-4" />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <p className="text-default-800 truncate font-medium">{headerLabel}</p>
            {loading && (
              <Icon icon="tabler:loader-2" className="text-default-400 size-4 animate-spin" />
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* ปุ่ม "วันนี้" โผล่เฉพาะตอนไม่ได้อยู่ที่วันนี้ — ลด noise */}
            {!isOnToday && (
              <button
                type="button"
                onClick={goToday}
                className="btn bg-default-100 text-default-700 hover:bg-default-200 min-h-11 px-3 text-sm"
              >
                วันนี้
              </button>
            )}
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={mode === 'day' ? 'วันถัดไป' : 'สัปดาห์ถัดไป'}
              className="btn bg-default-100 text-default-700 hover:bg-default-200 min-h-11 min-w-11"
            >
              <Icon icon="tabler:chevron-right" className="size-4" />
            </button>
          </div>
        </div>

        {/* week view บนมือถือ/แท็บเล็ต: แถบเลือกวัน (desktop เห็นทั้ง 7 วันอยู่แล้ว) */}
        {mode === 'week' && (
          <div className="border-default-200 flex gap-2 overflow-x-auto border-t p-3 lg:hidden">
            {weekDays.map((d) => {
              const count = itemsOfDay(d).length
              const picked = sameBangkokDay(d, mobileWeekDay)
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => setPickedDay(d)}
                  aria-pressed={picked}
                  className={`btn min-h-11 flex-col gap-0.5 px-3 ${
                    picked ? 'bg-primary text-white' : 'bg-default-100 text-default-700'
                  }`}
                >
                  <span className="text-xs">{weekdayShortTH(d)}</span>
                  <span className="text-sm font-medium">{formatDateTH(d).slice(0, 2)}</span>
                  <span
                    className={`size-1.5 rounded-full ${
                      count > 0 ? (picked ? 'bg-white' : 'bg-primary') : 'bg-transparent'
                    }`}
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── เนื้อหา ── */}
      {failed ? (
        <div className="card">
          <div className="card-body flex flex-col items-center gap-3 py-12 text-center">
            <div className="bg-default-100 flex size-14 items-center justify-center rounded-full">
              <Icon icon="tabler:refresh" className="text-default-400 size-7" />
            </div>
            <div>
              <h5 className="text-default-800 font-medium">โหลดปฏิทินไม่สำเร็จ</h5>
              <p className="text-default-500 mt-1 text-sm">ตรวจสัญญาณแล้วลองใหม่อีกครั้ง</p>
            </div>
            <button
              type="button"
              onClick={load}
              className="btn bg-default-100 text-default-700 hover:bg-default-200 min-h-11"
            >
              <Icon icon="tabler:refresh" className="me-1 size-4" />
              ลองอีกครั้ง
            </button>
          </div>
        </div>
      ) : mode === 'week' ? (
        <>
          {/* มือถือ/แท็บเล็ต: agenda ของวันที่เลือกจากแถบด้านบน */}
          <div className="lg:hidden">
            <DayAgenda day={mobileWeekDay} items={itemsOfDay(mobileWeekDay)} all={items} loading={loading} />
          </div>
          {/* desktop: เห็นทั้ง 7 วันพร้อมกัน — ใช้พื้นที่กว้างจริง ไม่ปล่อยว่าง */}
          <div className="gap-base hidden grid-cols-7 lg:grid">
            {weekDays.map((d) => {
              const dayItems = itemsOfDay(d)
              return (
                <div key={d.toISOString()} className="card">
                  <div className="card-header">
                    <h4 className="card-title text-sm">
                      {weekdayShortTH(d)} {formatDateTH(d).slice(0, 2)}
                    </h4>
                  </div>
                  <div className="card-body flex flex-col gap-2">
                    {dayItems.length === 0 ? (
                      <p className="text-default-400 text-sm">ยังไม่มีนัด</p>
                    ) : (
                      dayItems.map((it) => (
                        <Link
                          key={it.orderToken}
                          href={`/orders/${it.orderToken}`}
                          className="border-default-200 hover:bg-default-50 block rounded-lg border p-2"
                        >
                          <p className="text-default-800 text-sm font-medium">
                            {formatTimeHM(it.start)}
                          </p>
                          <p className="text-default-600 truncate text-sm">
                            {it.buyerName ?? 'ไม่ระบุชื่อ'}
                          </p>
                          <p className="text-default-500 truncate text-sm">
                            {it.resource?.name ?? '—'}
                          </p>
                          <div className="mt-1">
                            <StatusBadge status={it.appointmentStatus} />
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <DayAgenda day={anchor} items={itemsOfDay(anchor)} all={items} loading={loading} />
      )}

      {/* ── คำอธิบายสีสถานะ ── */}
      <div className="card">
        <div className="card-body flex flex-wrap items-center gap-x-4 gap-y-2">
          {STATUS_ORDER.map((s) => (
            <span key={s} className="text-default-600 inline-flex items-center gap-1.5 text-sm">
              <span className={`size-2 rounded-full ${STATUS_DOT[s]}`} />
              {APPOINTMENT_STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * รายการนัดของวันหนึ่ง — การ์ดบนมือถือ / ตารางบนเดสก์ท็อป
 *
 * `all` = ทุก item ที่โหลดอยู่ (ไม่ใช่เฉพาะของวันนี้) เพราะการนับความจุต้องดูนัดที่ทับ
 * ช่วงเวลากันซึ่งอาจคาบเกี่ยวข้ามวัน
 */
function DayAgenda({
  day,
  items,
  all,
  loading,
}: {
  day: Date
  items: AppointmentItem[]
  all: AppointmentItem[]
  loading: boolean
}) {
  if (items.length === 0) {
    return (
      <div className="card">
        <div className="card-body flex flex-col items-center gap-3 py-12 text-center">
          <div className="bg-default-100 flex size-14 items-center justify-center rounded-full">
            <Icon icon="tabler:calendar-event" className="text-default-400 size-7" />
          </div>
          <div>
            <h5 className="text-default-800 font-medium">
              {loading ? 'กำลังโหลด' : `ยังไม่มีนัดวัน${formatWeekdayDateTH(day)}`}
            </h5>
            {!loading && (
              <p className="text-default-500 mt-1 text-sm">
                นัดจะขึ้นที่นี่เมื่อคุณระบุวันเข้าใช้บริการตอนสร้างออเดอร์
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">{formatWeekdayDateTH(day)}</h4>
        <p className="text-default-500 mt-0.5 text-sm">{items.length} รายการ</p>
      </div>

      {/* mobile: การ์ด */}
      <div className="divide-default-200 divide-y lg:hidden">
        {items.map((it) => (
          <Link key={it.orderToken} href={`/orders/${it.orderToken}`} className="block p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-default-800 font-medium">
                  {formatTimeHM(it.start)} – {formatTimeHM(it.end)}
                </p>
                <p className="text-default-600 mt-0.5 truncate text-sm">
                  {it.buyerName ?? 'ไม่ระบุชื่อ'}
                </p>
                <p className="text-default-500 mt-0.5 truncate text-sm">
                  {it.resource?.name ?? '—'}
                </p>
                <div className="mt-1.5">
                  <CapacityChip item={it} all={all} />
                </div>
              </div>
              <div className="shrink-0 text-end">
                <StatusBadge status={it.appointmentStatus} />
                {it.orderNo && (
                  <p className="text-default-500 mt-1 text-sm">{it.orderNo}</p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* desktop: ตาราง */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="table w-full">
          <thead>
            <tr>
              {['เวลา', 'ลูกค้า', 'ทรัพยากร', 'สถานะ', 'เลขคำสั่งซื้อ'].map((h) => (
                <th
                  key={h}
                  className="text-default-500 px-4 py-3 text-start text-sm font-medium"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-default-200 divide-y">
            {items.map((it) => (
              <tr key={it.orderToken}>
                <td className="px-4 py-3">
                  <Link
                    href={`/orders/${it.orderToken}`}
                    className="text-default-800 font-medium"
                  >
                    {formatTimeHM(it.start)} – {formatTimeHM(it.end)}
                  </Link>
                </td>
                <td className="text-default-700 px-4 py-3">{it.buyerName ?? 'ไม่ระบุชื่อ'}</td>
                <td className="text-default-700 px-4 py-3">
                  {it.resource?.name ?? '—'}
                  <div className="mt-1">
                    <CapacityChip item={it} all={all} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={it.appointmentStatus} />
                </td>
                <td className="text-default-700 px-4 py-3">{it.orderNo ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
