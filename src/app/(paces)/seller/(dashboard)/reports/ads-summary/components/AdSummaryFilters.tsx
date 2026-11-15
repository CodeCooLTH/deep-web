'use client'

/**
 * AdSummaryFilters — แถบตัวกรองหน้า "สรุปโฆษณา": ช่วงวันที่ (ซ้าย) · เพจ (ขวา) (00094 FR-001 AC-2/3/4)
 *
 * Base: src/app/(paces)/seller/(dashboard)/reports/ads/components/AdReportFilters.tsx (copy ตัดปุ่มส่งออก/ลิงก์ข้ามรายงาน/บรรทัดช่วงวันที่/บรรทัดบัญชีโฆษณา)
 *   ซึ่ง Base เป็น src/components/safepay/FilterDropdown.tsx → theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx
 * ทำไมไม่ใช้ AdReportFilters ตรง ๆ: ไฟล์นั้นผูกปุ่มส่งออก xlsx + ลิงก์ไปคุณภาพโฆษณา + prop ช่วงก่อน — ไม่เกี่ยวหน้านี้ (ห้ามมีบรรทัดช่วงวันที่/เทียบช่วงก่อน · ไม่มีแถบลิงก์ข้ามรายงาน)
 *
 * 🛑 ตัวกรองอยู่ใน URL (?from=&to=&shopChannelId=) ไม่ใช่ React state — ส่งลิงก์ช่วงที่ดูอยู่ให้กันได้ ปุ่มย้อนกลับพากลับ
 */
import { useCallback, useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import FilterDropdown from '@/components/safepay/FilterDropdown'
import Icon from '@/components/wrappers/Icon'
import { DATE_RANGE_OPTIONS, resolveDateRange, type DateRangePreset } from '@/lib/date-range'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import DateRangeControl from '../../../_shared/DateRangeControl'
import { useAdReportPending } from '../../ads/components/PendingContext'

type Props = {
  from: string
  to: string
  shopChannelId: string | null
  channels: { id: string; name: string; provider: string }[]
  /** ผู้ใช้ขอช่วงยาวเกินเพดานแล้วถูกหั่น — ต้องบอก ห้ามหั่นเงียบ ๆ */
  clamped: boolean
  maxRangeDays: number
}

const ALL = 'ALL'

export default function AdSummaryFilters(props: Props) {
  const t = useT().adSummary
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const { setPending } = useAdReportPending()
  // ส่งสถานะ "กำลังคำนวณใหม่" ให้กริด (พี่น้องกันใน page.tsx) ผ่าน context
  useEffect(() => {
    setPending(pending)
  }, [pending, setPending])

  const push = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '' || v === ALL) next.delete(k)
        else next.set(k, v)
      }
      startTransition(() => router.push(`${pathname}?${next.toString()}`))
    },
    [params, pathname, router],
  )

  // preset ไหนตรงกับ from/to ใน URL — ไม่ตรงตัวไหน = กำหนดเอง
  const urlRange: DateRangePreset =
    DATE_RANGE_OPTIONS.map((o) => o.value)
      .filter((v): v is Exclude<DateRangePreset, 'custom'> => v !== 'custom')
      .find((v) => {
        const l = resolveDateRange(v).label
        return l.start === props.from && l.end === props.to
      }) ?? 'custom'

  const [localRange, setLocalRange] = useState<DateRangePreset>(urlRange)
  const [prevUrlRange, setPrevUrlRange] = useState<DateRangePreset>(urlRange)
  if (urlRange !== prevUrlRange) {
    setPrevUrlRange(urlRange)
    setLocalRange(urlRange)
  }

  return (
    // ไม่มี .card ห่อ — ตัวกรองเป็นหัวหน้าเดียวกับกริดการ์ด ไม่ใช่การ์ดซ้อนการ์ด
    <div className="mb-base flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangeControl
          range={localRange}
          customDates={[props.from, props.to]}
          pending={pending}
          onRangeChange={(next) => {
            setLocalRange(next)
            if (next === 'custom') return
            const l = resolveDateRange(next).label
            push({ from: l.start, to: l.end })
          }}
          onCustomChange={([from, to]) => {
            setLocalRange('custom')
            push({ from, to })
          }}
        />
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {props.channels.length > 1 && (
            <FilterDropdown
              icon="brand-facebook"
              align="right"
              value={props.shopChannelId ?? ALL}
              resetValue={ALL}
              defaultLabel={t.pageFilter}
              options={[{ value: ALL, label: t.allPages }, ...props.channels.map((c) => ({ value: c.id, label: c.name }))]}
              onChange={(v) => push({ shopChannelId: v })}
            />
          )}
        </div>
      </div>
      {props.clamped && (
        <p className="text-warning-ink bg-warning/15 mb-0 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="alert-triangle" className="shrink-0 text-base" aria-hidden="true" />
          {fmt(t.rangeClamped, { n: props.maxRangeDays })}
        </p>
      )}
      {pending && (
        <p className="text-default-500 mb-0 flex items-center gap-2 text-sm" aria-hidden="true">
          <Icon icon="loader-2" className="animate-spin text-base" aria-hidden="true" />
          {t.calculating}
        </p>
      )}
    </div>
  )
}
