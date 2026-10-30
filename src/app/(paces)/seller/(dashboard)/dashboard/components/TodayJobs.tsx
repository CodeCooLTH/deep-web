'use client'

/**
 * TodayJobs — การ์ด "งานวันนี้" บนหน้าแรกของฝ่ายช่าง (00071 P3 · S-15 · มติ Controller ข้อ 4)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx
 *   (โครง .card + .card-header ยกจาก OrderStatusBand ข้างกัน — ตัวนั้นก็ยกจากธีมเดียวกัน)
 *   แถวนัดใช้ AppointmentDayRows เดิมทั้งดุ้น (ไม่มีจำนวนเงิน/มัดจำโดยโครงสร้าง — ต่างจาก AppointmentDayCard)
 *
 * 🛑 ห้าม mount แล้วซ่อนด้วย CSS (`hidden`/`lg:hidden`) สำหรับบทบาทที่ไม่เกี่ยว — endpoint /day คืนเบอร์ลูกค้า
 * ผู้เรียก (page.tsx) ตัดสินด้วย `homeBlocks().todayJobs` แล้ว "ไม่ render" เท่านั้น
 * (มือถือกับเดสก์ท็อปของช่างเองจะ mount คนละที่ — คำขอซ้อนกันใช้คำขอเดียวร่วมกันด้านล่าง)
 *
 * 00086 P3 (T9 · BRD FR-008 · ต้นแบบ screenHome): การ์ดนี้ mount เฉพาะช่างล้วนในร้านบริการ (`homeBlocks().todayJobs`)
 * จึงแยกเป็น "งานของฉันวันนี้ · N งาน" (ของฉัน ∧ ยังไม่ปิด) + "ยังไม่มีคนรับ · N งาน" (ซ่อนเมื่อ 0)
 * กติกาแบ่งกองอยู่ที่ `technicianTodayGroups` (src/lib/technician-jobs.ts) — ตัวเดียวกับหน้า /my-jobs
 * การ์ดที่สองโผล่หลังโหลดเสร็จเท่านั้น (โหลด/ล้ม อยู่ในการ์ดแรกที่เดียว)
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import AppointmentDayRows from '@/components/safepay/appointment-board/AppointmentDayRows'
import type { AppointmentDayApiItem } from '@/components/safepay/appointment-board/types'
import { thaiDayKey } from '@/lib/format-date'
import { technicianTodayGroups } from '@/lib/technician-jobs'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'

const MAX_SHOWN = 3

// มือถือ + เดสก์ท็อปของหน้าเดียวกัน mount การ์ดนี้พร้อมกัน (คนละ breakpoint) — แชร์คำขอที่ยังค้างอยู่ ไม่ยิงสองรอบ
let inflight: { day: string; promise: Promise<AppointmentDayApiItem[]> } | null = null

function fetchDay(day: string): Promise<AppointmentDayApiItem[]> {
  if (inflight && inflight.day === day) return inflight.promise
  const promise = fetch(`/api/shops/current/appointments/day?${new URLSearchParams({ date: day })}`, {
    cache: 'no-store',
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status))
      const json = (await res.json()) as { items?: AppointmentDayApiItem[] }
      return Array.isArray(json.items) ? json.items : []
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null
    })
  inflight = { day, promise }
  return promise
}

export default function TodayJobs({
  className = '',
  viewerUserId,
}: {
  className?: string
  /** session userId ของผู้ดู — เทียบ "งานของฉัน" กับ assignee.userId · null = ไม่มีงานไหนเป็นของฉัน */
  viewerUserId: string | null
}) {
  const router = useRouter()
  const [items, setItems] = useState<AppointmentDayApiItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [day] = useState(() => thaiDayKey(new Date()))

  const load = useCallback(() => {
    setFailed(false)
    setItems(null)
    fetchDay(day).then(setItems, () => setFailed(true))
  }, [day])

  useEffect(() => {
    // เรียกใน effect: ตั้ง state ตอนเริ่มโหลดเป็นเรื่องปกติของการดึงข้อมูลฝั่ง client
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  return (
    <TodayJobsView
      className={className}
      failed={failed}
      groups={items ? technicianTodayGroups(items, viewerUserId) : null}
      onRetry={load}
      onRowClick={(token) => router.push(`/orders/${token}`)}
    />
  )
}

/** ส่วนแสดงผลล้วน (ไม่มี state/fetch) — แยกไว้ให้เทส render ได้ทุกสถานะใน environment node */
export function TodayJobsView({
  className = '',
  failed,
  groups,
  onRetry,
  onRowClick: openRow,
}: {
  className?: string
  failed: boolean
  /** null = กำลังโหลด */
  groups: { mine: AppointmentDayApiItem[]; unassigned: AppointmentDayApiItem[] } | null
  onRetry: () => void
  onRowClick: (orderToken: string) => void
}) {
  // ข้อความทั้งหมดผ่าน dictionary (00047) — ไม่ฝังไทยในคอมโพเนนต์ที่ผู้ใช้สลับเป็น EN ได้
  const t = useT().dashboard
  const mineCount = groups?.mine.length ?? 0

  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      <div className="card min-h-11 lg:min-h-0 flex-1">
        <div className="card-header !py-3 flex items-center justify-between gap-2">
          <h4 className="card-title flex min-w-0 items-center gap-1.5">
            <Icon icon="tabler:calendar-event" className="size-4 shrink-0 text-primary" />
            {/* ไม่ขึ้น "· 0 งาน" (critique P2 เดิมของการ์ดนี้) — ว่างแล้วข้อความในการ์ดบอกเอง */}
            <span className="truncate">
              {groups && mineCount > 0 ? fmt(t.todayMineTitleCount, { n: mineCount }) : t.todayMineTitle}
            </span>
          </h4>
          <Link
            href="/my-jobs"
            className="text-primary text-sm font-medium inline-flex shrink-0 items-center min-h-11 lg:min-h-0 gap-0.5"
          >
            {t.todayMineSeeAll}
            <Icon icon="tabler:chevron-right" className="size-4" />
          </Link>
        </div>
        <div className="card-body !p-4">
          {failed ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <p className="text-sm text-default-500">{t.todayJobsLoadFailed}</p>
              <button type="button" onClick={onRetry} className="btn btn-sm border-default-300 hover:border-default-400 font-semibold min-h-11 lg:min-h-0">
                {t.todayJobsRetry}
              </button>
            </div>
          ) : groups === null ? (
            <span className="bg-default-300 block h-16 animate-pulse rounded-lg" aria-hidden="true" />
          ) : mineCount === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <p className="text-sm text-default-500">{t.todayMineEmpty}</p>
              <Link href="/queues" className="text-primary text-sm font-medium inline-flex items-center min-h-11 lg:min-h-0 gap-0.5">
                {t.todayJobsMonth}
                <Icon icon="tabler:chevron-right" className="size-4" />
              </Link>
            </div>
          ) : (
            <>
              <AppointmentDayRows
                items={groups.mine.slice(0, MAX_SHOWN)}
                showResourceName
                showAssignee
                onRowClick={openRow}
              />
              {mineCount > MAX_SHOWN && (
                <Link
                  href="/my-jobs"
                  className="text-primary text-sm font-medium mt-2 inline-flex items-center min-h-11 lg:min-h-0 gap-0.5"
                >
                  {fmt(t.todayMineAll, { n: mineCount })}
                  <Icon icon="tabler:chevron-right" className="size-4" />
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {/* ยังไม่มีคนรับ — ซ่อนเมื่อ 0 และโผล่หลังโหลดเสร็จเท่านั้น (ไม่มีหัวว่าง/skeleton ซ้อนสองใบ) */}
      {groups && groups.unassigned.length > 0 && (
        <div className="card">
          <div className="card-header !py-3 flex items-center">
            <h4 className="card-title flex min-w-0 items-center gap-1.5">
              <Icon icon="tabler:user-check" className="size-4 shrink-0 text-primary" />
              <span className="truncate">{fmt(t.todayUnassignedTitleCount, { n: groups.unassigned.length })}</span>
            </h4>
          </div>
          <div className="card-body !p-4">
            <AppointmentDayRows
              items={groups.unassigned.slice(0, MAX_SHOWN)}
              showResourceName
              showAssignee
              onRowClick={openRow}
            />
            <p className="mt-2 mb-0 text-xs text-default-700">{t.todayUnassignedHint}</p>
          </div>
        </div>
      )}
    </div>
  )
}
