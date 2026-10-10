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
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import AppointmentDayRows from '@/components/safepay/appointment-board/AppointmentDayRows'
import type { AppointmentDayApiItem } from '@/components/safepay/appointment-board/types'
import { thaiDayKey } from '@/lib/format-date'
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

export default function TodayJobs({ className = '' }: { className?: string }) {
  const router = useRouter()
  // ข้อความทั้งหมดผ่าน dictionary (00047) — ไม่ฝังไทยในคอมโพเนนต์ที่ผู้ใช้สลับเป็น EN ได้
  const t = useT().dashboard
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

  const total = items?.length ?? 0

  return (
    <div className={`card min-h-11 lg:min-h-0 ${className}`}>
      <div className="card-header !py-3 flex items-center justify-between">
        <h4 className="card-title flex items-center gap-1.5">
          <Icon icon="tabler:calendar-event" className="size-4 text-primary" />
          {items ? fmt(t.todayJobsTitleCount, { n: total }) : t.todayJobsTitle}
        </h4>
        <Link
          href={`/queues?date=${day}`}
          className="text-primary text-sm font-medium inline-flex items-center min-h-11 lg:min-h-0 gap-0.5"
        >
          {t.todayJobsSchedule}
          <Icon icon="tabler:chevron-right" className="size-4" />
        </Link>
      </div>
      <div className="card-body !p-4">
        {failed ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <p className="text-sm text-default-500">{t.todayJobsLoadFailed}</p>
            <button type="button" onClick={load} className="btn btn-sm border-default-300 hover:border-default-400 font-semibold min-h-11 lg:min-h-0">
              {t.todayJobsRetry}
            </button>
          </div>
        ) : items === null ? (
          <span className="bg-default-300 block h-16 animate-pulse rounded-lg" aria-hidden="true" />
        ) : total === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <p className="text-sm text-default-500">{t.todayJobsEmpty}</p>
            <Link href="/queues" className="text-primary text-sm font-medium inline-flex items-center min-h-11 lg:min-h-0 gap-0.5">
              {t.todayJobsMonth}
              <Icon icon="tabler:chevron-right" className="size-4" />
            </Link>
          </div>
        ) : (
          <>
            <AppointmentDayRows
              items={items.slice(0, MAX_SHOWN)}
              showResourceName
              onRowClick={(token) => router.push(`/orders/${token}`)}
            />
            {total > MAX_SHOWN && (
              <Link
                href={`/queues?date=${day}`}
                className="text-primary text-sm font-medium mt-2 inline-flex items-center min-h-11 lg:min-h-0 gap-0.5"
              >
                {fmt(t.todayJobsAllToday, { n: total })}
                <Icon icon="tabler:chevron-right" className="size-4" />
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  )
}
