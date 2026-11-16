'use client'

/**
 * AdsProfitFilters — แถบกรองของรายงานกำไรโฆษณารายวัน (00096 BRD FR-001..FR-003): ช่วงวันที่ · เพจ · โหมดกำไร
 *
 * Base: src/app/(paces)/seller/(dashboard)/reports/ad-revenue/components/AdRevenueFilters.tsx (ซึ่ง Base เป็น theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx)
 *   ต่างจากต้นแบบ: ตัวเลือกช่วงรายวัน (วันนี้ · เมื่อวาน · 7 · 14 · 30 วัน) · ปุ่มโหมดกำไร segmented ท่าเดียวกับปุ่มช่วงวันที่ (outline)
 * ไม่มีบรรทัดช่วงวันที่ใต้ตัวกรอง (มติ user)
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'

import PageFilterDropdown from '@/app/(paces)/seller/(chat)/inbox/components/PageFilterDropdown'
import { DAILY_RANGE_OPTIONS, resolveDateRange, type DateRangePreset } from '@/lib/date-range'
import type { ProfitMode } from '@/services/ads-profit.service'
import { useT } from '@/i18n/LocaleProvider'
import { cn } from '@/utils/helpers'
import DateRangeControl from '../../../_shared/DateRangeControl'
import { useAdReportPending } from '../../ads/components/PendingContext'
import InfoTip from '../../ad-revenue/components/InfoTip'

type Props = { from: string; to: string; shopChannelId: string | null; channels: { id: string; name: string; provider: string; avatarUrl: string | null }[]; mode: ProfitMode }
const MODES: ProfitMode[] = ['expected', 'realized']

export default function AdsProfitFilters(props: Props) {
  const t = useT().adsProfit
  const [pageOpen, setPageOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const { setPending } = useAdReportPending()
  useEffect(() => { setPending(pending) }, [pending, setPending])

  const push = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }))
  }, [params, pathname, router])

  const urlRange: DateRangePreset =
    DAILY_RANGE_OPTIONS.map((o) => o.value)
      .filter((v): v is Exclude<DateRangePreset, 'custom'> => v !== 'custom')
      .find((v) => { const l = resolveDateRange(v).label; return l.start === props.from && l.end === props.to }) ?? 'custom'
  const [localRange, setLocalRange] = useState<DateRangePreset>(urlRange)
  const [prevUrlRange, setPrevUrlRange] = useState<DateRangePreset>(urlRange)
  if (urlRange !== prevUrlRange) { setPrevUrlRange(urlRange); setLocalRange(urlRange) }

  return (
    <div className="mb-base flex flex-wrap items-center gap-2">
      <DateRangeControl
        range={localRange} customDates={[props.from, props.to]} pending={pending} variant="outline" options={DAILY_RANGE_OPTIONS}
        onRangeChange={(next) => { setLocalRange(next); if (next === 'custom') return; const l = resolveDateRange(next).label; push({ from: l.start, to: l.end }) }}
        onCustomChange={([from, to]) => { setLocalRange('custom'); push({ from, to }) }}
      />
      <div className="ms-auto flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex" role="group" aria-label={t.modeLabel}>
            {MODES.map((m, i) => (
              <button
                key={m} type="button" aria-pressed={props.mode === m} onClick={() => push({ mode: m === 'expected' ? null : m })}
                className={cn('btn btn-sm border-default-300 min-h-11 border lg:min-h-0', i === 0 ? 'rounded-e-none' : '-ms-px rounded-s-none',
                  props.mode === m ? 'bg-primary border-primary relative z-10 text-white' : 'bg-card text-default-700 hover:bg-light')}>
                {m === 'expected' ? t.modeExpected : t.modeRealized}
              </button>
            ))}
          </span>
          <InfoTip text={t.modeTip} />
        </span>
        {props.channels.length > 1 && (
          // popover ของ PageFilterDropdown อ้างอิง ancestor ที่ relative — กล่อง w-72 ชิดขวาให้รายการกว้างพอ
          <div className="relative flex w-72 justify-end">
            <PageFilterDropdown value={props.shopChannelId ?? ''} options={props.channels} open={pageOpen} onOpenChange={setPageOpen} onChange={(v) => push({ shopChannelId: v || null })} />
          </div>
        )}
      </div>
    </div>
  )
}
