'use client'

/**
 * DailyOverviewCard — ④ ภาพรวมรายวัน: แท็บ (ยอดขาย · {noun}) + กราฟ area ช่วงนี้ทึบ/ช่วงก่อนประ (feature 00091 FR-009)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/SessionOverview.tsx
 *   (card-header + nav tablist แถบแท็บไอคอน+ค่า+delta + ApexChart area ใต้แท็บ) · chart: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx
 *   (stroke dashArray [0,5] · gradient vertical .35→0 · grid strokeDashArray)
 * ตัด: ปุ่ม Export/Import · CountUp · random data · วงกลมไอคอนทึบ — เพิ่ม a11y ของ tablist (aria-selected/controls, roving tabindex ←/→)
 * สลับแท็บ = เปลี่ยน series ของกราฟเดิม ไม่ remount
 * เฟส 2 (FR-010): แท็บค่าโฆษณา = ฐาน theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/ProjectPerformance.tsx (area + line ผสม)
 *   แท็บ ROAS = ฐาน theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx (line + เส้นอ้างอิงประ) · สี chart-primary/chart-zeta/default-400
 * สี: ช่วงนี้ chart-primary · ช่วงก่อน default-400 (เทา) — ไม่ใช้ chart-secondary (ม่วง = buyer)
 */
import type { ApexOptions } from 'apexcharts'
import Link from 'next/link'
import { useCallback, useId, useRef, useState } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { roas, slotLabel } from '@/lib/ad-report-view'
import { formatDayMonth } from '@/lib/format-date'
import { formatBaht, formatBahtCompact, formatNumberNoSymbol, pctChangeVsPrev } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn, getColor } from '@/utils/helpers'
import DeltaText from './DeltaText'
import { fmtRoas, type AdReportView } from './data'

type TabId = 'sales' | 'orders' | 'spend' | 'roas'
const TAB_IDS: TabId[] = ['sales', 'orders', 'spend', 'roas']

export default function DailyOverviewCard({ report, noun }: { report: AdReportView; noun: string }) {
  const t = useT().adReport
  const uid = useId()
  const [tab, setTab] = useState<TabId>('sales')
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ sales: null, orders: null, spend: null, roas: null })
  const { summary, previous, daily, prevDaily, ads } = report
  // ช่วงวันเดียว = รายชั่วโมง — Insights ไม่มีรายชั่วโมง จึงมีแต่ค่ารวม ไม่วาดกราฟ
  const hourly = daily[0]?.day.includes('T') ?? false

  const noValue = (
    <>
      —<span className="sr-only">{t.noSpendSr}</span>
    </>
  )
  const tabs: { id: TabId; title: string; icon: string; value: React.ReactNode; valueText: string; delta: React.ReactNode }[] = [
    { id: 'sales', title: t.colSales, icon: 'cash', value: formatBaht(summary.adSales), valueText: formatBaht(summary.adSales), delta: <DeltaText value={pctChangeVsPrev(summary.adSales, previous.adSales)} className="text-sm font-normal" /> },
    { id: 'orders', title: noun, icon: 'shopping-cart', value: formatNumberNoSymbol(summary.adOrders), valueText: formatNumberNoSymbol(summary.adOrders), delta: <DeltaText value={pctChangeVsPrev(summary.adOrders, previous.adOrders)} className="text-sm font-normal" /> },
    {
      id: 'spend', title: t.tabSpend, icon: 'receipt',
      value: ads.summary.spend === null ? noValue : formatBaht(ads.summary.spend),
      valueText: ads.summary.spend === null ? '—' : formatBaht(ads.summary.spend),
      // ค่าโฆษณาเพิ่ม/ลงไม่ใช่ดี/ร้าย → neutral
      delta: ads.summary.spend === null ? null : <DeltaText tone="neutral" value={pctChangeVsPrev(ads.summary.spend, ads.summary.prevSpend)} className="text-sm font-normal" />,
    },
    {
      id: 'roas', title: t.tabRoas, icon: 'chart-arrows-vertical',
      value: ads.summary.roas === null ? noValue : fmtRoas(ads.summary.roas),
      valueText: fmtRoas(ads.summary.roas),
      delta: ads.summary.roas === null ? null : <DeltaText value={ads.summary.prevRoas === null ? null : pctChangeVsPrev(ads.summary.roas, ads.summary.prevRoas)} className="text-sm font-normal" />,
    },
  ]
  const active = tabs.find((x) => x.id === tab) ?? tabs[0]

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const last = TAB_IDS.length - 1
    const to = e.key === 'ArrowRight' ? (i + 1) % TAB_IDS.length : e.key === 'ArrowLeft' ? (i - 1 + TAB_IDS.length) % TAB_IDS.length : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (to === null) return
    e.preventDefault()
    setTab(TAB_IDS[to])
    tabRefs.current[TAB_IDS[to]]?.focus()
  }

  const getOptions = useCallback((): ApexOptions => {
    const xaxis: ApexOptions['xaxis'] = {
      categories: daily.map((d) => slotLabel(d.day, formatDayMonth)),
      tickAmount: typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 4 : 8,
      axisBorder: { show: false },
      labels: { offsetY: 2, rotate: 0, hideOverlappingLabels: true },
    }
    const base = { toolbar: { show: false } }
    const common = { grid: { strokeDashArray: 7 }, legend: { position: 'top', horizontalAlign: 'right' } as const, dataLabels: { enabled: false }, markers: { size: 0 }, xaxis }
    const gradient = { type: 'vertical', inverseColors: false, opacityFrom: 0.35, opacityTo: 0, stops: [0, 95] }

    if (tab === 'spend') {
      // ฐาน ProjectPerformance: area ยอดขายจากโฆษณา + เส้นค่าโฆษณา (chart-zeta เส้นหนา 3 ชดเชยคอนทราสต์)
      return {
        ...common,
        chart: { ...base, type: 'line', height: 300 },
        series: [
          { name: t.seriesAdSales, type: 'area', data: daily.map((d) => d.adSales) },
          { name: t.seriesSpend, type: 'line', data: daily.map((d) => d.spend) },
        ],
        stroke: { width: [2, 3], curve: 'smooth' },
        colors: [getColor('chart-primary'), getColor('chart-zeta')],
        yaxis: { min: 0, tickAmount: 3, labels: { offsetX: -10, formatter: (v: number) => formatBahtCompact(v) }, axisBorder: { show: false } },
        fill: { opacity: [0.5, 1], type: ['gradient', 'solid'], gradient },
        tooltip: { shared: true, y: { formatter: (v: number) => formatBaht(v) } },
      }
    }
    if (tab === 'roas') {
      // ฐาน SalesReport: เส้น ROAS รายวัน + เส้นอ้างอิง 1 ประ · วัน spend=0 → null (เส้นขาด ไม่ใช่ 0)
      return {
        ...common,
        chart: { ...base, type: 'line', height: 300 },
        series: [
          { name: t.seriesRoas, type: 'line', data: daily.map((d) => roas(d.coveredSales, d.spend)) },
          { name: t.seriesRoasRef, type: 'line', data: daily.map(() => 1) },
        ],
        stroke: { width: [3, 2], curve: 'smooth', dashArray: [0, 6] },
        colors: [getColor('chart-primary'), getColor('default-400')],
        yaxis: { min: 0, tickAmount: 3, labels: { offsetX: -10, formatter: (v: number) => v.toFixed(1) }, axisBorder: { show: false } },
        tooltip: { shared: true, y: { formatter: (v: number | null) => (v === null || v === undefined ? '—' : v.toFixed(2)) } },
      }
    }
    const pick = (d: (typeof daily)[number]) => (tab === 'sales' ? d.adSales : d.adOrders)
    const money = tab === 'sales'
    return {
      ...common,
      chart: { ...base, type: 'area', height: 300 },
      series: [
        { name: t.seriesThis, data: daily.map(pick) },
        { name: t.seriesPrev, data: prevDaily.map(pick) },
      ],
      stroke: { width: [2, 2], curve: 'smooth', dashArray: [0, 5] },
      colors: [getColor('chart-primary'), getColor('default-400')],
      yaxis: { min: 0, tickAmount: 3, labels: { offsetX: -10, formatter: (v: number) => (money ? formatBahtCompact(v) : formatNumberNoSymbol(Math.round(v))) }, axisBorder: { show: false } },
      // เส้นแรก (ช่วงนี้) ไล่สี .35→0 · เส้นประช่วงก่อนไม่มีพื้นที่
      fill: { opacity: [0.5, 0], type: ['gradient', 'solid'], gradient },
      tooltip: { shared: true, y: { formatter: (v: number) => (money ? formatBaht(v) : formatNumberNoSymbol(v)) } },
    }
  }, [daily, prevDaily, tab, t.seriesThis, t.seriesPrev, t.seriesAdSales, t.seriesSpend, t.seriesRoas, t.seriesRoasRef])

  const needsSpend = tab === 'spend' || tab === 'roas'
  const spendMessage = !needsSpend
    ? null
    : ads.state === 'NOT_CONNECTED'
      ? t.spendChartNone
      : ads.state === 'AUTH'
        ? fmt(t.spendAuthBody, { noun })
        : ads.state === 'CURRENCY'
          ? t.spendCurrencyBody
          : ads.state === 'ERROR'
            ? fmt(t.spendErrorBody, { noun })
            : hourly
              ? t.spendTodayNote
              : null
  const chartType = tab === 'sales' || tab === 'orders' ? 'area' : 'line'

  return (
    <div className="card h-full min-w-0">
      <div className="card-header">
        <h4 className="card-title">{t.dailyTitle}</h4>
      </div>
      <div className="card-body p-0">
        <div className="border-default-300 border-b">
          <nav className="grid grid-cols-2 md:grid-cols-4" role="tablist" aria-label={t.dailyTitle} aria-orientation="horizontal">
            {tabs.map((x, i) => (
              <button
                key={x.id}
                ref={(el) => {
                  tabRefs.current[x.id] = el
                }}
                id={`${uid}-tab-${x.id}`}
                type="button"
                role="tab"
                aria-selected={tab === x.id}
                aria-controls={`${uid}-panel`}
                tabIndex={tab === x.id ? 0 : -1}
                onClick={() => setTab(x.id)}
                onKeyDown={(e) => onKey(e, i)}
                className={cn('flex min-h-11 items-center justify-center gap-x-2 border-b-2 border-transparent px-3 py-4 text-start md:px-4 md:py-5', tab === x.id && 'border-primary')}>
                <span className="bg-info/15 text-info hidden size-9 shrink-0 items-center justify-center rounded-full 2xl:flex">
                  <Icon icon={x.icon} className="text-xl" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-default-700 text-sm font-medium">{x.title}</span>
                  <span className="text-default-900 flex flex-wrap items-baseline gap-x-2 text-lg font-semibold tabular-nums">
                    {x.value}
                    {x.delta}
                  </span>
                </span>
              </button>
            ))}
          </nav>
        </div>
        <div className="p-5">
          <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${tab}`} className="min-h-72">
            {spendMessage ? (
              <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
                <p className="text-default-700 mb-0 max-w-md text-sm">{spendMessage}</p>
                {ads.state === 'NOT_CONNECTED' && (
                  <Link href="/settings/capis" className="btn bg-primary hover:bg-primary-hover min-h-11 text-white lg:min-h-0">
                    {t.spendConnectCta}
                  </Link>
                )}
              </div>
            ) : (
              <div role="img" aria-label={`${t.dailyTitle}: ${active.title} ${active.valueText}`}>
                <ApexChart getOptions={getOptions} type={chartType} height={300} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
