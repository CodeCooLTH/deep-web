'use client'

/**
 * MyJobsList — เนื้อหน้า "งานของฉัน" (00086 P3 · T9 · BRD FR-008 · ต้นแบบ screenList)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx (โครง .card + .card-header)
 *   in-repo sibling: ../../dashboard/components/TodayJobs.tsx (หัวการ์ด/โหลด/ล้ม/ลองอีกครั้ง ยกมาทั้งชุด)
 * Base (ตัวกรอง 2 ช่อง): theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (Button Group)
 *   in-repo sibling: ../../orders/new/components/ArrivalModePicker.tsx (คลาสชุดเดียวกัน — sibling-surface-parity)
 * แถวงาน: AppointmentDayRows `showAssignee` (ชุดเดียวกับหน้าแรกช่าง)
 *
 * ข้อมูล: `/appointments/day?date=วันนี้` (ทั้งร้าน วันนี้) + `/appointments/carry-over` (ของฉัน ค้างจากวันก่อน
 *   + `unscheduled` ของฉันที่ยังไม่ระบุเวลา · 00086 M1)
 * การแบ่งกลุ่มทั้งหมดอยู่ที่ `myJobsSections` (src/lib/technician-jobs.ts) — ที่นี่แค่ render
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import AppointmentDayRows from '@/components/safepay/appointment-board/AppointmentDayRows'
import type { AppointmentDayApiItem, UnscheduledDayApiItem } from '@/components/safepay/appointment-board/types'
import { ARRIVAL_MODE_META } from '@/lib/arrival-mode'
import { thaiDayKey } from '@/lib/format-date'
import { MY_JOBS_FILTERS, myJobsSections, type MyJobsFilter } from '@/lib/technician-jobs'

type Loaded = { today: AppointmentDayApiItem[]; carryOver: AppointmentDayApiItem[]; unscheduled: UnscheduledDayApiItem[] }

async function fetchItems(url: string): Promise<AppointmentDayApiItem[]> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(String(res.status))
  const json = (await res.json()) as { items?: AppointmentDayApiItem[] }
  return Array.isArray(json.items) ? json.items : []
}

/** carry-over คืนสองรายการ (ค้างจากวันก่อน + ยังไม่ระบุเวลา) — คำขอเดียว ล้ม = ล้มทั้งคู่ */
async function fetchCarryOver(): Promise<Pick<Loaded, 'carryOver' | 'unscheduled'>> {
  const res = await fetch('/api/shops/current/appointments/carry-over', { cache: 'no-store' })
  if (!res.ok) throw new Error(String(res.status))
  const json = (await res.json()) as { items?: AppointmentDayApiItem[]; unscheduled?: UnscheduledDayApiItem[] }
  return {
    carryOver: Array.isArray(json.items) ? json.items : [],
    unscheduled: Array.isArray(json.unscheduled) ? json.unscheduled : [],
  }
}

export default function MyJobsList({ viewerUserId }: { viewerUserId: string | null }) {
  const router = useRouter()
  const [filter, setFilter] = useState<MyJobsFilter>('mine')
  const [data, setData] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [day] = useState(() => thaiDayKey(new Date()))

  const load = useCallback(() => {
    setFailed(false)
    setData(null)
    // สองคำขอพร้อมกัน — ล้มตัวใดตัวหนึ่ง = บอกว่าโหลดไม่สำเร็จ (ไม่โชว์ครึ่งเดียวแล้วให้เข้าใจว่าไม่มีงานค้าง)
    Promise.all([
      fetchItems(`/api/shops/current/appointments/day?${new URLSearchParams({ date: day })}`),
      fetchCarryOver(),
    ]).then(
      ([today, mine]) => setData({ today, ...mine }),
      () => setFailed(true),
    )
  }, [day])

  useEffect(() => {
    // เรียกใน effect: ตั้ง state ตอนเริ่มโหลดเป็นเรื่องปกติของการดึงข้อมูลฝั่ง client
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const sections = data ? myJobsSections(data.today, data.carryOver, filter, viewerUserId, data.unscheduled) : null

  return (
    <MyJobsView
      filter={filter}
      onFilter={setFilter}
      failed={failed}
      sections={sections}
      onRetry={load}
      onRowClick={(token) => router.push(`/orders/${token}`)}
    />
  )
}

/**
 * ส่วนแสดงผลล้วน (ไม่มี state/fetch) — แยกไว้ให้เทส render ได้ทุกสถานะใน environment node
 * (repo ไม่มี DOM — ท่าเดียวกับ StaffRolePicker.test)
 */
export function MyJobsView({
  filter,
  onFilter,
  failed,
  sections,
  onRetry,
  onRowClick: openRow,
}: {
  filter: MyJobsFilter
  onFilter: (f: MyJobsFilter) => void
  failed: boolean
  /** null = กำลังโหลด */
  sections: ReturnType<typeof myJobsSections<AppointmentDayApiItem, UnscheduledDayApiItem>> | null
  onRetry: () => void
  onRowClick: (orderToken: string) => void
}) {
  return (
    <div className="flex flex-col gap-2.5 lg:gap-4">
      {/* ตัวกรอง — คลาสชุดเดียวกับ ArrivalModePicker (`text-primary-ink` บน /15 = คอนทราสต์ AA) */}
      <div className="inline-flex w-full lg:max-w-sm" role="group" aria-label="กรองงาน">
        {MY_JOBS_FILTERS.map((f, i) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => onFilter(f.key)}
              className={`btn min-h-11 flex-1 ${i === 0 ? 'rounded-e-none' : 'rounded-s-none'} ${
                active ? 'bg-primary/15 text-primary-ink font-semibold' : 'bg-light text-dark hover:text-primary'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {failed ? (
        <div className="card">
          <div className="card-body flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-default-700">โหลดงานไม่สำเร็จ</p>
            <button
              type="button"
              onClick={onRetry}
              className="btn btn-sm border-default-300 hover:border-default-400 font-semibold min-h-11 lg:min-h-0"
            >
              ลองอีกครั้ง
            </button>
          </div>
        </div>
      ) : sections === null ? (
        <div className="flex flex-col gap-2.5" aria-busy="true">
          <span className="bg-default-300 block h-16 animate-pulse rounded-lg" aria-hidden="true" />
          <span className="bg-default-300 block h-16 animate-pulse rounded-lg" aria-hidden="true" />
        </div>
      ) : (
        <>
          {/* ค้างจากวันก่อน (Controller decision Q2) — เฉพาะตัวกรอง "งานของฉัน" ∧ มีงาน · ไม่มี = ไม่มีหัวว่าง
              warning-ink ไม่ใช่แดง: ยังไม่จบ ไม่ใช่ข้อผิดพลาด */}
          {sections.carryOver.length > 0 && (
            <div className="card">
              <div className="card-header !py-3 flex items-center">
                <h4 className="card-title flex min-w-0 items-center gap-1.5">
                  <Icon icon="tabler:clock-exclamation" className="size-4 shrink-0 text-warning-ink" />
                  <span className="truncate">ค้างจากวันก่อน · {sections.carryOver.length} งาน</span>
                </h4>
              </div>
              <div className="card-body !p-4">
                <AppointmentDayRows items={sections.carryOver} showResourceName showAssignee showDate onRowClick={openRow} />
              </div>
            </div>
          )}

          {/* ยังไม่ระบุเวลา (00086 M1 · Controller decision (a)) — งานที่มอบให้ฉันแต่ไม่มีเวลานัด ไม่อยู่ในรายการวันนี้
              ต่อจาก "ค้างจากวันก่อน" ก่อนรายการวันนี้ · ไอคอน/สีจาก ARRIVAL_MODE_META.UNSCHEDULED (สถานะที่ต้องลงมือ = warning)
              ไม่มีงาน = ไม่ render (ไม่มีหัวว่าง) · แถวไม่มีเวลา → คอลัมน์เวลาเป็น "ยังไม่ระบุเวลา" (AppointmentDayRows) */}
          {sections.unscheduled.length > 0 && (
            <div className="card">
              <div className="card-header !py-3 flex items-center">
                <h4 className="card-title flex min-w-0 items-center gap-1.5">
                  <Icon icon={`tabler:${ARRIVAL_MODE_META.UNSCHEDULED.icon}`} className="size-4 shrink-0 text-warning-ink" />
                  <span className="truncate">
                    {ARRIVAL_MODE_META.UNSCHEDULED.label} · {sections.unscheduled.length} งาน
                  </span>
                </h4>
              </div>
              <div className="card-body !p-4">
                <AppointmentDayRows items={sections.unscheduled} showResourceName showAssignee onRowClick={openRow} />
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header !py-3 flex items-center">
              <h4 className="card-title flex min-w-0 items-center gap-1.5">
                <Icon icon="tabler:calendar-event" className="size-4 shrink-0 text-primary" />
                <span className="truncate">วันนี้ · {sections.open.length} งานที่ยังไม่ปิด</span>
              </h4>
            </div>
            <div className="card-body !p-4">
              {sections.open.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <p className="text-sm text-default-700">
                    {filter === 'mine' ? 'วันนี้ยังไม่มีงานของคุณ' : 'วันนี้ยังไม่มีงาน'}
                  </p>
                  <Link
                    href="/queues"
                    className="text-primary text-sm font-medium inline-flex items-center min-h-11 lg:min-h-0 gap-0.5"
                  >
                    ดูตารางงาน
                    <Icon icon="tabler:chevron-right" className="size-4" />
                  </Link>
                </div>
              ) : (
                <AppointmentDayRows items={sections.open} showResourceName showAssignee onRowClick={openRow} />
              )}
            </div>
          </div>

          {sections.closed.length > 0 && (
            <div className="card">
              <div className="card-header !py-3 flex items-center">
                <h4 className="card-title flex min-w-0 items-center gap-1.5">
                  <Icon icon="tabler:clipboard-check" className="size-4 shrink-0 text-default-500" />
                  <span className="truncate">ปิดงานแล้ว · {sections.closed.length}</span>
                </h4>
              </div>
              <div className="card-body !p-4">
                <AppointmentDayRows items={sections.closed} showResourceName showAssignee onRowClick={openRow} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
