'use client'

/**
 * TrendCard — แนวโน้ม: แท็บ รายวัน/รายสัปดาห์/รายเดือน · แถบสรุป 4 ตัวกดเลือก · area ช่วงนี้ + เส้นประช่วงก่อน (00094 FR-005)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx
 *   (card-header + nav tablist · แถบสรุป bg-light/25 เส้นประล่าง · กราฟ area gradient + dashArray [0,8])
 * ท่า a11y/แท็บ: src/app/(paces)/seller/(dashboard)/reports/ads/components/DailyOverviewCard.tsx (roving tabindex ←/→/Home/End)
 * ตัด: CountUp · พื้นที่ข้อความลอยบนกราฟ — หน่วยเดียวเสมอ (BR-AIR-05 ไม่มีแกน y คู่) · สีช่วงนี้ chart-primary / ก่อน default-400
 * อัตราทุกช่องคำนวณ Σ/Σ ใน groupDaily — ห้ามเฉลี่ยค่ารายวัน · Meta ไม่มีรายชั่วโมง → แท็บ Meta ปิดเมื่อช่วง 1 วัน
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback, useId, useMemo, useRef, useState } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { groupDaily, seriesOf } from '@/lib/ad-summary/buckets'
import { TREND_TABS, formatValue, resolveTrendKey, trendDisabled, trendSummaryDeltas, type TrendKey } from '@/lib/ad-summary/view'
import type { AdSummaryReport, Grouping } from '@/lib/ad-summary/types'
import { formatBahtCompact } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn, getColor } from '@/utils/helpers'
import { NoValue } from './Bits'

const GROUPS: Grouping[] = ['day', 'week', 'month']
const GROUP_KEY: Record<Grouping, 'gDay' | 'gWeek' | 'gMonth'> = { day: 'gDay', week: 'gWeek', month: 'gMonth' }

export default function TrendCard({ report }: { report: AdSummaryReport }) {
  const t = useT().adSummary
  const uid = useId()
  const [grouping, setGrouping] = useState<Grouping>('day')
  const [selected, setSelected] = useState<TrendKey>('sales')
  const tabRefs = useRef<Record<Grouping, HTMLButtonElement | null>>({ day: null, week: null, month: null })
  const { kpi, hourly, meta } = report
  // ช่วง 1 วัน = รายชั่วโมง — รวมเป็นสัปดาห์/เดือนไม่มีความหมาย
  const g: Grouping = hourly ? 'day' : grouping
  const key = resolveTrendKey(selected, meta.state, hourly)
  const tab = TREND_TABS.find((x) => x.key === key) ?? TREND_TABS[0]
  const name = (t as Record<string, string>)[tab.label]

  const buckets = useMemo(() => groupDaily(report.daily, g), [report.daily, g])
  const prev = useMemo(() => groupDaily(report.prevDaily, g), [report.prevDaily, g])
  const cur = useMemo(() => seriesOf(buckets, key), [buckets, key])
  // เส้นก่อนจัดตำแหน่งตามลำดับช่อง (BRD AC-4) — ช่องที่ไม่มีคู่ = null (เส้นขาด ไม่ใช่ 0)
  const prv = useMemo(() => seriesOf(prev, key), [prev, key])
  const categories = useMemo(() => buckets.map((b) => (b.partial ? `${b.label}*` : b.label)), [buckets])
  const anyPartial = buckets.some((b) => b.partial)
  const summary = trendSummaryDeltas(kpi)

  const getOptions = useCallback((): ApexOptions => {
    const yFmt = (v: number) => (tab.unit === 'baht' ? formatBahtCompact(v) : tab.unit === 'num' ? formatValue('num', v) : formatValue('pct1', v))
    return {
      chart: { type: 'line', height: 320, toolbar: { show: false }, animations: { enabled: false } },
      series: [
        { name: t.seriesThis, type: 'area', data: cur },
        { name: t.seriesPrev, type: 'line', data: categories.map((_, i) => prv[i] ?? null) },
      ],
      stroke: { width: [3, 2], curve: 'smooth', dashArray: [0, 8] },
      colors: [getColor('chart-primary'), getColor('default-400')],
      fill: { opacity: [1, 0.5], type: ['gradient', 'solid'], gradient: { type: 'vertical', inverseColors: false, opacityFrom: 0.4, opacityTo: 0, stops: [0, 70] } },
      grid: { strokeDashArray: 7 },
      xaxis: { categories, tickAmount: 10, axisBorder: { show: false }, axisTicks: { show: false }, labels: { offsetY: 2, rotate: 0, hideOverlappingLabels: true } },
      yaxis: { tickAmount: 4, min: 0, labels: { offsetX: -10, formatter: yFmt }, axisBorder: { show: false } },
      dataLabels: { enabled: false },
      markers: { size: 0 },
      legend: { show: true, position: 'bottom', markers: { size: 6 } },
      tooltip: { shared: true, intersect: false, y: { formatter: (v: number | null) => (v === null || v === undefined ? '—' : formatValue(tab.unit, v)) } },
    }
  }, [cur, prv, categories, tab.unit, t.seriesThis, t.seriesPrev])

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const to = e.key === 'ArrowRight' ? (i + 1) % GROUPS.length : e.key === 'ArrowLeft' ? (i - 1 + GROUPS.length) % GROUPS.length : e.key === 'Home' ? 0 : e.key === 'End' ? GROUPS.length - 1 : null
    if (to === null) return
    e.preventDefault()
    setGrouping(GROUPS[to])
    tabRefs.current[GROUPS[to]]?.focus()
  }

  const valueOf = (k: TrendKey) => (k === 'sales' ? kpi.sales.cur : k === 'spend' ? kpi.spend.cur : k === 'orders' ? kpi.orders.cur : kpi.ctr.cur)

  return (
    <div className="card">
      <div className="card-header py-0">
        <h4 className="card-title">
          {t.trendTitle}
          <span className="text-default-600 ms-1 text-sm font-normal">({name})</span>
        </h4>
        <nav className="flex gap-x-1" role="tablist" aria-label={t.gAria}>
          {GROUPS.map((x, i) => {
            const off = hourly && x !== 'day'
            return (
              <button
                key={x}
                ref={(el) => {
                  tabRefs.current[x] = el
                }}
                type="button"
                role="tab"
                id={`${uid}-g-${x}`}
                aria-selected={g === x}
                aria-controls={`${uid}-panel`}
                tabIndex={g === x ? 0 : -1}
                disabled={off}
                onClick={() => setGrouping(x)}
                onKeyDown={(e) => onKey(e, i)}
                className={cn('inline-flex min-h-11 items-center border-b px-4 py-4.25 text-sm whitespace-nowrap disabled:opacity-50', g === x ? 'border-primary text-primary-ink font-semibold' : 'text-default-700 hover:text-primary-ink border-transparent')}>
                {(t as Record<string, string>)[GROUP_KEY[x]]}
              </button>
            )
          })}
        </nav>
      </div>
      <div className="bg-light/25 border-default-300 border-b border-dashed">
        <div className="grid grid-cols-4 text-center">
          {TREND_TABS.map((x) => {
            const off = trendDisabled(x.meta, meta.state, hourly)
            const on = key === x.key
            const label = (t as Record<string, string>)[x.label]
            const v = valueOf(x.key)
            return (
              <button
                key={x.key}
                type="button"
                aria-pressed={on}
                disabled={off !== null}
                title={off === 'hourly' ? t.hourlyNote : undefined}
                onClick={() => setSelected(x.key)}
                className={cn('min-h-11 border-b-2 px-2 py-4 disabled:opacity-50', on ? 'border-primary' : 'border-transparent')}>
                <p className={cn('mb-1.25 text-sm', on ? 'text-primary-ink font-medium' : 'text-default-600')}>{label}</p>
                <p className="text-default-900 flex items-center justify-center gap-1.25 text-lg font-semibold tabular-nums">
                  <Icon icon={x.icon} className="text-primary-ink text-lg" aria-hidden="true" />
                  {off === 'none' || v === null ? <NoValue /> : formatValue(x.unit, v)}
                </p>
                {off === 'hourly' && <p className="text-default-600 mt-1 text-xs">{t.hourlyNote}</p>}
              </button>
            )
          })}
        </div>
      </div>
      <div className="card-body">
        <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-g-${g}`}>
          <div role="img" aria-label={fmt(t.trendAria, { name })}>
            <ApexChart getOptions={getOptions} type="line" height={320} />
          </div>
        </div>
        {(summary || anyPartial) && (
          <p className="text-default-700 mt-3 mb-0 flex flex-wrap items-center gap-x-4 text-sm tabular-nums">
            {summary && <span>{fmt(t.trendSummary, summary)}</span>}
            {anyPartial && <span className="text-default-600 text-xs">* {t.partialNote}</span>}
          </p>
        )}
      </div>
    </div>
  )
}
