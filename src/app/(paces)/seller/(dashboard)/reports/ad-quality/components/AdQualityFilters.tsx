'use client'

/**
 * AdQualityFilters — หัวหน้าของรายงานคุณภาพโฆษณา (00093 FR-001): ช่วงวันที่ + เพจ + ลิงก์ไปยอดขายตามโฆษณา (พกช่วง/เพจ)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (ผ่าน reports/ad-revenue/components/AdRevenueFilters.tsx — DateRangeControl outline + PageFilterDropdown)
 * เดิม: src/app/(paces)/seller/(dashboard)/reports/ads/components/AdReportFilters.tsx
 *   (ซึ่ง Base เป็น reports/agents/components/ReportFilters.tsx → src/components/safepay/FilterDropdown.tsx → theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx)
 * ตัด: ปุ่มส่งออก (หน้านี้ไม่มี export) · ชุดข้อความ spend ของรายงานยอดขาย
 * 🛑 ตัวกรองอยู่ใน URL (?from=&to=&shopChannelId=) · เปลี่ยนช่วง/เพจ = ทิ้ง ?ad (แอดอาจไม่อยู่ในชุดใหม่)
 * ไม่มี .card ห่อ — เป็นหัวหน้าเดียวกับกริดการ์ด ไม่ใช่การ์ดซ้อนการ์ด
 */
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'

import PageFilterDropdown from '@/app/(paces)/seller/(chat)/inbox/components/PageFilterDropdown'
import Icon from '@/components/wrappers/Icon'
import { DATE_RANGE_OPTIONS, resolveDateRange, type DateRangePreset } from '@/lib/date-range'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import DateRangeControl from '../../../_shared/DateRangeControl'
import { useAdReportPending } from '../../ads/components/PendingContext'
import type { AdsConn } from './data'

type Props = {
  from: string
  to: string
  shopChannelId: string | null
  channels: { id: string; name: string; provider: string; avatarUrl: string | null }[]
  clamped: boolean
  maxRangeDays: number
  ads: AdsConn
}
const ALL = 'ALL'

export default function AdQualityFilters(props: Props) {
  const t = useT().adQuality
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
      next.delete('ad')
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '' || v === ALL) next.delete(k)
        else next.set(k, v)
      }
      startTransition(() => router.push(`${pathname}?${next.toString()}`))
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

  const salesQs = new URLSearchParams({ from: props.from, to: props.to })
  if (props.shopChannelId) salesQs.set('shopChannelId', props.shopChannelId)

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
            // popover ของ PageFilterDropdown อ้างอิง ancestor ที่ relative → กล่อง w-72 ชิดขวา = รายการกว้างพอ
            <div className="relative flex w-72 justify-end">
              <PageFilterDropdown
                value={props.shopChannelId ?? ''} options={props.channels} open={pageOpen} onOpenChange={setPageOpen}
                onChange={(v) => push({ shopChannelId: v || null })}
              />
            </div>
          )}
          <Link href={`/reports/ads?${salesQs.toString()}`} className="btn border-default-300 text-default-700 hover:bg-default-100 min-h-11 shrink-0 border lg:min-h-0">
            <Icon icon="speakerphone" className="text-sm" aria-hidden="true" />
            {t.viewSales}
          </Link>
        </div>
      </div>

      {/* ผู้ใช้สั่ง: ไม่มีบรรทัดช่วงวันที่ใต้ตัวกรอง */}
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
