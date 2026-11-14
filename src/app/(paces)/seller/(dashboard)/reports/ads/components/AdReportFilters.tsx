'use client'

/**
 * AdReportFilters — แถบตัวกรองของรายงานยอดขายตามโฆษณา (feature 00091)
 *
 * Base: src/app/(paces)/seller/(dashboard)/reports/agents/components/ReportFilters.tsx
 *   (ช่วงวันที่ + เพจ + banner หั่นช่วง + "กำลังคำนวณใหม่…" — ตัดตัวกรองช่องทาง/ที่มาทิ้ง เพราะรายงานนี้เป็นแอดล้วน)
 *   ซึ่งมี Base เป็น src/components/safepay/FilterDropdown.tsx → theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx
 * Base (ปุ่มส่งออก): src/app/(paces)/seller/(dashboard)/orders/components/OrdersExport.tsx (markup ปุ่ม)
 *
 * 🛑 ตัวกรองอยู่ใน URL (?from=&to=&shopChannelId=) ไม่ใช่ React state — ส่งลิงก์ช่วงที่ดูอยู่ให้กันได้ ปุ่มย้อนกลับพากลับ
 * ส่งออก = "สิ่งที่เห็นบนจอ" เสมอ ไม่มีโมดัลเลือกขอบเขต (xlsx อย่างเดียว)
 */
import { useCallback, useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import FilterDropdown from '@/components/safepay/FilterDropdown'
import Icon from '@/components/wrappers/Icon'
import { DATE_RANGE_OPTIONS, resolveDateRange, type DateRangePreset } from '@/lib/date-range'
import { formatDate } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import DateRangeControl from '../../../_shared/DateRangeControl'
import { useAdReportPending } from './PendingContext'

type Props = {
  from: string
  to: string
  shopChannelId: string | null
  channels: { id: string; name: string; provider: string }[]
  /** ผู้ใช้ขอช่วงยาวเกินเพดานแล้วถูกหั่น — ต้องบอก ห้ามหั่นเงียบ ๆ */
  clamped: boolean
  maxRangeDays: number
  /** ป้ายช่วงก่อนหน้า (YYYY-MM-DD) จาก service — เลื่อนถอยหลังเท่าความยาวช่วง */
  prevFrom: string
  prevTo: string
}

const ALL = 'ALL'

export default function AdReportFilters(props: Props) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [exporting, setExporting] = useState(false)
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

  // preset ไหนตรงกับ from/to ใน URL — คำนวณจาก resolveDateRange ตัวเดียวกับหน้าการเงิน (ไม่ตรงตัวไหน = กำหนดเอง)
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

  async function onExport() {
    if (exporting) return
    setExporting(true)
    try {
      const qs = new URLSearchParams({ from: props.from, to: props.to })
      if (props.shopChannelId) qs.set('shopChannelId', props.shopChannelId)
      const res = await fetch(`/api/reports/ads/export?${qs.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `deep-ads-${props.from}_${props.to}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      pacesToast.success(t.adReport.exportDone)
    } catch {
      pacesToast.error(t.adReport.exportFailed)
    } finally {
      setExporting(false)
    }
  }

  return (
    // ไม่มี .card ห่อ — ตัวกรองเป็นหัวหน้าเดียวกับกริดการ์ด ไม่ใช่การ์ดซ้อนการ์ด (spec FR-009)
    <div className="mb-base flex flex-col gap-3">
      <div className="flex flex-col gap-3">
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
                defaultLabel={t.adReport.pageFilter}
                options={[{ value: ALL, label: t.adReport.allPages }, ...props.channels.map((c) => ({ value: c.id, label: c.name }))]}
                onChange={(v) => push({ shopChannelId: v })}
              />
            )}
            <button
              type="button"
              onClick={onExport}
              disabled={exporting}
              className="btn border-default-300 text-default-700 hover:bg-default-100 min-h-11 shrink-0 border lg:min-h-0"
            >
              <Icon icon={exporting ? 'loader-2' : 'download'} className={exporting ? 'animate-spin text-sm' : 'text-sm'} aria-hidden="true" />
              {t.adReport.export}
            </button>
          </div>
        </div>

        <p className="text-default-700 mb-0 text-xs">
          {urlRange === 'today'
            ? t.adReport.rangeLineToday
            : fmt(t.adReport.rangeLine, { from: formatDate(props.from), to: formatDate(props.to), prevFrom: formatDate(props.prevFrom), prevTo: formatDate(props.prevTo) })}
        </p>

        {props.clamped && (
          <p className="text-warning-ink bg-warning/15 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
            <Icon icon="alert-triangle" className="shrink-0 text-base" aria-hidden="true" />
            {fmt(t.adReport.rangeClamped, { n: props.maxRangeDays })}
          </p>
        )}

        {pending && (
          <p className="text-default-500 flex items-center gap-2 text-sm" aria-hidden="true">
            <Icon icon="loader-2" className="animate-spin text-base" aria-hidden="true" />
            {t.adReport.calculating}
          </p>
        )}
      </div>
    </div>
  )
}
