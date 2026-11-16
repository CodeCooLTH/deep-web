'use client'

/**
 * AdsProfitCharts — กราฟวิเคราะห์กำไร (00096 P1 BRD FR-011 · PRD §3.5)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/charts/apex/bar/components/data.ts (bar แนวนอน · distributed สีรายแท่ง)
 *   + theme/paces/Admin/TS/src/app/(admin)/charts/apex/scatter/components/data.ts (scatter) + charts/apex/line (line) ผ่าน ApexChart wrapper · getColor (HR10)
 * 🛑 กราฟคนละหน่วยไม่ใช้แกนร่วม (กำไรรายวัน กับ ต้นทุนต่อใบ แยกการ์ด) · กำไร/ขาดทุนบอกด้วยเครื่องหมาย + ตำแหน่งรอบศูนย์ ไม่ใช่สีอย่างเดียว
 * 🛑 ห้ามคีย์ undefined ใน options · โหมดคาดการณ์/รับรู้แล้ว มาจาก prop เดียวกับตาราง
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback, useMemo } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import { adDisplayName } from '@/lib/ad-attribution'
import { formatBaht, formatBahtCompact } from '@/lib/format-money'
import type { AdsProfitReport, ProfitMode } from '@/services/ads-profit.service'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { getColor } from '@/utils/helpers'
import { DashCard } from '../../ad-revenue/components/DashBits'

const short = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const money = (v: number) => `${v < 0 ? '−' : ''}${formatBaht(Math.abs(v))}`

export default function AdsProfitCharts({ report, mode, noun }: { report: AdsProfitReport; mode: ProfitMode; noun: string }) {
  const tt = useT()
  const t = tt.adsProfit
  const named = useMemo(() => report.rows.filter((r) => r.spend !== null).map((r) => ({
    name: adDisplayName(r.adTitle, r.adId, tt.inbox.contextBar.adIdFallback) ?? r.adId,
    profit: r.metrics[mode].profitAfter ?? 0, roas: r.metrics[mode].roas ?? 0, spend: r.spend ?? 0,
  })), [report.rows, mode, tt.inbox.contextBar.adIdFallback])
  const ranked = useMemo(() => [...named].sort((a, b) => b.profit - a.profit).slice(0, 10), [named])
  const daily = report.daily

  const rankOpts = useCallback((): ApexOptions => ({
    chart: { type: 'bar', height: Math.max(220, 40 + ranked.length * 34), toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '60%', borderRadius: 3, distributed: true } },
    series: [{ name: t.colProfit, data: ranked.map((r) => Math.round((r.profit) * 100) / 100) }],
    colors: ranked.map((r) => getColor(r.profit < 0 ? 'chart-beta' : 'chart-alpha')),
    xaxis: { categories: ranked.map((r) => short(r.name)), labels: { formatter: (v: string) => formatBahtCompact(Number(v)) } },
    yaxis: { labels: { maxWidth: 200 } },
    grid: { strokeDashArray: 7 },
    legend: { show: false },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v: number) => money(v) } },
  }), [ranked, t.colProfit])

  const scatterOpts = useCallback((): ApexOptions => ({
    chart: { type: 'bubble', height: 300, toolbar: { show: false } },
    series: [{ name: t.chartScatter, data: named.map((r) => ({ x: Math.round(r.roas * 100) / 100, y: Math.round((r.profit) * 100) / 100, z: Math.max(1, Math.round(r.spend)) })) }],
    colors: [getColor('chart-primary')],
    fill: { opacity: 0.6 },
    plotOptions: { bubble: { minBubbleRadius: 5, maxBubbleRadius: 22 } },
    xaxis: { type: 'numeric', tickAmount: 5, title: { text: 'ROAS' }, labels: { formatter: (v: string) => Number(v).toFixed(1) } },
    yaxis: { tickAmount: 4, labels: { formatter: (v: number) => formatBahtCompact(v) } },
    annotations: { yaxis: [{ y: 0, borderColor: getColor('default-400'), strokeDashArray: 4 }] },
    grid: { strokeDashArray: 7 },
    dataLabels: { enabled: false },
    tooltip: { custom: ({ dataPointIndex }: { dataPointIndex: number }) => { const r = named[dataPointIndex]; return r ? `<div class="px-3 py-2 text-sm"><b>${r.name.replace(/</g, '&lt;')}</b><br/>ROAS ${r.roas.toFixed(2)} · ${money(r.profit)}</div>` : '' } },
  }), [named, t.chartScatter])

  const dailyOpts = useCallback((): ApexOptions => ({
    chart: { type: 'bar', height: 260, toolbar: { show: false } },
    plotOptions: { bar: { columnWidth: '55%', borderRadius: 2, distributed: true } },
    series: [{ name: t.chartDailyProfit, data: daily.map((d) => Math.round((d.profitBefore[mode] - (d.spend ?? 0)) * 100) / 100) }],
    colors: daily.map((d) => getColor(d.profitBefore[mode] - (d.spend ?? 0) < 0 ? 'chart-beta' : 'chart-alpha')),
    xaxis: { categories: daily.map((d) => d.day.slice(8, 10)), labels: { rotate: 0, hideOverlappingLabels: true } },
    yaxis: { tickAmount: 4, labels: { formatter: (v: number) => formatBahtCompact(v) } },
    grid: { strokeDashArray: 7 },
    legend: { show: false },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v: number) => money(v) } },
  }), [daily, mode, t.chartDailyProfit])

  const cpoOpts = useCallback((): ApexOptions => ({
    chart: { type: 'line', height: 260, toolbar: { show: false } },
    series: [{ name: fmt(t.chartCpo, { noun }), data: daily.map((d) => (d.spend !== null && d.orders[mode] > 0 ? Math.round(d.spend / d.orders[mode]) : null)) }],
    colors: [getColor('chart-gamma')],
    stroke: { width: 3, curve: 'smooth' },
    markers: { size: 3 },
    xaxis: { categories: daily.map((d) => d.day.slice(8, 10)), labels: { rotate: 0, hideOverlappingLabels: true } },
    yaxis: { min: 0, tickAmount: 4, labels: { formatter: (v: number) => formatBahtCompact(v) } },
    grid: { strokeDashArray: 7 },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v: number) => formatBaht(v) } },
  }), [daily, mode, noun, t.chartCpo])

  if (named.length === 0) return null
  const multiDay = daily.length > 1
  return (
    <div className="gap-base mb-base grid grid-cols-1 xl:grid-cols-12">
      <div className="min-w-0 xl:col-span-7">
        <DashCard title={t.chartRanking}><div role="img" aria-label={t.chartRanking}><ApexChart getOptions={rankOpts} type="bar" height={Math.max(220, 40 + ranked.length * 34)} /></div></DashCard>
      </div>
      <div className="min-w-0 xl:col-span-5">
        <DashCard title={t.chartScatter} tip={t.chartScatterTip}><div role="img" aria-label={t.chartScatter}><ApexChart getOptions={scatterOpts} type="bubble" height={300} /></div></DashCard>
      </div>
      {multiDay && (
        <>
          <div className="min-w-0 xl:col-span-6">
            <DashCard title={t.chartDailyProfit} tip={t.cohortTip}><div role="img" aria-label={t.chartDailyProfit}><ApexChart getOptions={dailyOpts} type="bar" height={260} /></div></DashCard>
          </div>
          <div className="min-w-0 xl:col-span-6">
            <DashCard title={fmt(t.chartCpo, { noun })}><div role="img" aria-label={fmt(t.chartCpo, { noun })}><ApexChart getOptions={cpoOpts} type="line" height={260} /></div></DashCard>
          </div>
        </>
      )}
    </div>
  )
}
