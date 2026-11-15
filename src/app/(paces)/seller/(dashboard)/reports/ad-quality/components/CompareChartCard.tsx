'use client'

/**
 * CompareChartCard — กราฟแท่งเทียบ แชท (Meta) กับ แชท (Deep) รายแอด (FR-004) แทนแถบคู่ของ ① และ ⑤ เดิม
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/FinancialOverview.tsx (ApexChart wrapper · grid เส้นประ · legend)
 *   โครงการ์ด: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AnalyticsOverview.tsx (card-header + card-title + ขวา)
 * metaOk = false → แท่ง แชท (Deep) ชุดเดียว (Meta ไม่พร้อม — ไม่วาดแท่งว่าง)
 * 🛑 aria-label ของกราฟรวมค่าทุกแอด · สี: Meta = default-500 (ข้อมูลภายนอก) · Deep = chart-primary (ไม่ม่วง)
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback, useMemo } from 'react'

import Icon from '@/components/wrappers/Icon'
import ApexChart from '@/components/wrappers/ApexChart'
import { adDisplayName } from '@/lib/ad-attribution'
import { buildCompareBars, highGapCount } from '@/lib/ad-quality-view'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { getColor } from '@/utils/helpers'
import { fmtInt, type QualityRow } from './data'

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export default function CompareChartCard({ rows, metaOk }: { rows: QualityRow[]; metaOk: boolean }) {
  const t = useT()
  const a = t.adQuality
  const idFallback = t.inbox.contextBar.adIdFallback
  const bars = useMemo(() => buildCompareBars(rows, metaOk), [rows, metaOk])
  const high = metaOk ? highGapCount(rows) : 0
  const names = useMemo(() => bars.map((b) => adDisplayName(b.title, b.adId, idFallback) ?? b.adId), [bars, idFallback])
  const height = Math.max(160, bars.length * (metaOk ? 40 : 28) + 40)

  const getOptions = useCallback(
    (): ApexOptions => ({
      chart: { type: 'bar', height, toolbar: { show: false } },
      plotOptions: { bar: { horizontal: true, barHeight: '70%', borderRadius: 2 } },
      series: [
        ...(metaOk ? [{ name: a.chatMeta, data: bars.map((b) => b.chatsMeta ?? 0) }] : []),
        { name: a.chatDeep, data: bars.map((b) => b.chatsDeep) },
      ],
      colors: metaOk ? [getColor('default-500'), getColor('chart-primary')] : [getColor('chart-primary')],
      dataLabels: { enabled: false },
      legend: { show: false },
      stroke: { width: 1, colors: ['transparent'] },
      grid: { borderColor: getColor('chart-border-color'), strokeDashArray: 4, padding: { left: 4, right: 8 } },
      xaxis: { categories: names.map((n) => short(n, 26)), labels: { formatter: (v: string) => fmtInt(Number(v)), style: { fontSize: '12px' } } },
      yaxis: { labels: { maxWidth: 200, style: { fontSize: '12px' } } },
      tooltip: { shared: true, intersect: false, x: { formatter: (_v: number, o?: { dataPointIndex: number }) => (o ? names[o.dataPointIndex] ?? '' : '') } },
    }),
    [bars, names, metaOk, height, a.chatMeta, a.chatDeep],
  )

  const aria = fmt(a.chartAria, {
    label: metaOk ? a.gTitle : a.deepByAd,
    items: bars.map((b, i) => (metaOk ? `${names[i]} ${a.chatMeta} ${fmtInt(b.chatsMeta)} ${a.chatDeep} ${fmtInt(b.chatsDeep)}` : `${names[i]} ${fmtInt(b.chatsDeep)}`)).join(', '),
  })

  return (
    <div className="card h-full min-w-0">
      <div className="card-header flex-wrap gap-2">
        <h4 className="card-title">{metaOk ? a.gTitle : a.deepByAd}</h4>
        {high > 0 && (
          <span className="badge bg-warning/15 text-warning-ink">
            <Icon icon="alert-triangle" className="text-sm" aria-hidden="true" />
            {fmt(a.highAdsBadge, { n: high })}
          </span>
        )}
        <div className="ms-auto flex items-center gap-3 text-sm">
          {metaOk && <span className="flex items-center gap-1.5"><span className="bg-default-500 size-2.5 rounded-full" aria-hidden="true" />{a.chatMeta}</span>}
          <span className="flex items-center gap-1.5"><span className="bg-primary size-2.5 rounded-full" aria-hidden="true" />{a.chatDeep}</span>
        </div>
      </div>
      <div className="card-body">
        {bars.length === 0 ? (
          <p className="text-default-500 mb-0 text-sm">{a.stNoDataTitle}</p>
        ) : (
          <div role="img" aria-label={aria}>
            <ApexChart getOptions={getOptions} type="bar" height={height} />
          </div>
        )}
      </div>
      <div className="card-footer">
        <a href="#ad-quality-table" className="text-primary inline-flex min-h-11 items-center gap-1 text-sm lg:min-h-0">
          {a.h1TopLink}
          <Icon icon="arrow-down" className="text-sm" aria-hidden="true" />
        </a>
      </div>
    </div>
  )
}
