'use client'

/**
 * AdRevenueFilters — แถบกรองของรายงานวิเคราะห์ยอดขายจากโฆษณา (00091 เฟส 3): ช่วงวันที่ซ้าย · เพจชิดขวา (ms-auto)
 *
 * Base: src/app/(paces)/seller/(dashboard)/reports/ad-quality/components/AdQualityFilters.tsx
 *   (ซึ่ง Base เป็น reports/ads/components/AdReportFilters.tsx → src/components/safepay/FilterDropdown.tsx → theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx)
 * ต่างจากตัวต้นแบบ: เปลี่ยนช่วง/เพจ = คงแท็บ ทิ้งพารามิเตอร์ drill (campaign/adset) เพราะแคมเปญเดิมอาจไม่อยู่ในชุดใหม่
 * ตัวกรองเพจ: PageFilterDropdown ของกล่องแชท (src/app/(paces)/seller/(chat)/inbox/components/PageFilterDropdown.tsx)
 *   รูปเพจ + ไอคอนช่องทาง + ชื่อ — user 2026-11-16: รายการเพจต้องมีโปรไฟล์ ไม่ใช่ชื่อเปล่า (เดิม FilterDropdown ข้อความล้วน)
 * ไม่มี .card ห่อ — เป็นหัวหน้าเดียวกับเนื้อหาแท็บ ไม่ใช่การ์ดซ้อนการ์ด
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'

import PageFilterDropdown from '@/app/(paces)/seller/(chat)/inbox/components/PageFilterDropdown'
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
  channels: { id: string; name: string; provider: string; avatarUrl: string | null }[]
  clamped: boolean
  maxRangeDays: number
}
const ALL = 'ALL'

export default function AdRevenueFilters(props: Props) {
  const t = useT().adRevenue
  const [pageOpen, setPageOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const { setPending } = useAdReportPending()
  useEffect(() => { setPending(pending) }, [pending, setPending])

  const push = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      next.delete('campaign')
      next.delete('adset')
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '' || v === ALL) next.delete(k)
        else next.set(k, v)
      }
      startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }))
    },
    [params, pathname, router],
  )

  const urlRange: DateRangePreset =
    DATE_RANGE_OPTIONS.map((o) => o.value)
      .filter((v): v is Exclude<DateRangePreset, 'custom'> => v !== 'custom')
      .find((v) => { const l = resolveDateRange(v).label; return l.start === props.from && l.end === props.to }) ?? 'custom'
  const [localRange, setLocalRange] = useState<DateRangePreset>(urlRange)
  const [prevUrlRange, setPrevUrlRange] = useState<DateRangePreset>(urlRange)
  if (urlRange !== prevUrlRange) { setPrevUrlRange(urlRange); setLocalRange(urlRange) }

  return (
    <div className="mb-base flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangeControl
          range={localRange} customDates={[props.from, props.to]} pending={pending} variant="outline"
          onRangeChange={(next) => { setLocalRange(next); if (next === 'custom') return; const l = resolveDateRange(next).label; push({ from: l.start, to: l.end }) }}
          onCustomChange={([from, to]) => { setLocalRange('custom'); push({ from, to }) }}
        />
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {props.channels.length > 1 && (
            // popover ของ PageFilterDropdown อ้างอิง ancestor ที่ relative (inset-x-0) → กล่อง w-72 ชิดขวา = รายการกว้างพอ ไม่ล้นขอบจอ
            <div className="relative flex w-72 justify-end">
              <PageFilterDropdown
                value={props.shopChannelId ?? ''} options={props.channels} open={pageOpen} onOpenChange={setPageOpen}
                onChange={(v) => push({ shopChannelId: v || null })}
              />
            </div>
          )}
        </div>
      </div>

      {/* ผู้ใช้สั่ง: ไม่มีบรรทัดช่วงวันที่/เทียบช่วงก่อนใต้ตัวกรอง · ไม่มีปุ่มข้ามรายงาน (ซ้ำเมนูซ้าย) */}
      {props.clamped && (
        <p className="text-warning-ink bg-warning/15 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="alert-triangle" className="shrink-0 text-base" aria-hidden="true" />
          {fmt(t.rangeClamped, { n: props.maxRangeDays })}
        </p>
      )}
      {pending && (
        <p className="text-default-500 flex items-center gap-2 text-sm" role="status">
          <Icon icon="loader-2" className="animate-spin text-base" aria-hidden="true" />
          {t.calculating}
        </p>
      )}
    </div>
  )
}
