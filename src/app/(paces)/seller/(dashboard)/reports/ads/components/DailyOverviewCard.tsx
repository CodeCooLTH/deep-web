'use client'

/**
 * DailyOverviewCard — ④ ภาพรวมรายวัน: แท็บ (ยอดขาย · {noun}) + กราฟ area ช่วงนี้ทึบ/ช่วงก่อนประ (feature 00091 FR-009)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/SessionOverview.tsx
 *   (card-header + nav tablist แถบแท็บไอคอน+ค่า+delta + ApexChart area ใต้แท็บ) · chart: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx
 *   (stroke dashArray [0,5] · gradient vertical .35→0 · grid strokeDashArray)
 * ตัด: ปุ่ม Export/Import · CountUp · random data · วงกลมไอคอนทึบ — เพิ่ม a11y ของ tablist (aria-selected/controls, roving tabindex ←/→)
 * สลับแท็บ = เปลี่ยน series ของกราฟเดิม ไม่ remount · เฟส 2 เพิ่มแท็บได้ที่ TABS
 * สี: ช่วงนี้ chart-primary · ช่วงก่อน default-400 (เทา) — ไม่ใช้ chart-secondary (ม่วง = buyer)
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback, useId, useRef, useState } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { slotLabel } from '@/lib/ad-report-view'
import { formatDayMonth } from '@/lib/format-date'
import { formatBaht, formatBahtCompact, formatNumberNoSymbol, pctChangeVsPrev } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { cn, getColor } from '@/utils/helpers'
import DeltaText from './DeltaText'
import type { AdReportView } from './data'

type TabId = 'sales' | 'orders'

export default function DailyOverviewCard({ report, noun }: { report: AdReportView; noun: string }) {
  const t = useT().adReport
  const uid = useId()
  const [tab, setTab] = useState<TabId>('sales')
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ sales: null, orders: null })
  const { summary, previous, daily, prevDaily } = report

  const tabs: { id: TabId; title: string; icon: string; value: string; delta: number | null; pick: (d: (typeof daily)[number]) => number }[] = [
    { id: 'sales', title: t.colSales, icon: 'cash', value: formatBaht(summary.adSales), delta: pctChangeVsPrev(summary.adSales, previous.adSales), pick: (d) => d.adSales },
    { id: 'orders', title: noun, icon: 'shopping-cart', value: formatNumberNoSymbol(summary.adOrders), delta: pctChangeVsPrev(summary.adOrders, previous.adOrders), pick: (d) => d.adOrders },
  ]
  const active = tabs.find((x) => x.id === tab) ?? tabs[0]

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
    setTab(next.id)
    tabRefs.current[next.id]?.focus()
  }

  const isSales = tab === 'sales'
  const getOptions = useCallback(
    (): ApexOptions => ({
      chart: { type: 'area', height: 300, toolbar: { show: false } },
      series: [
        { name: t.seriesThis, data: daily.map(active.pick) },
        { name: t.seriesPrev, data: prevDaily.map(active.pick) },
      ],
      stroke: { width: [2, 2], curve: 'smooth', dashArray: [0, 5] },
      colors: [getColor('chart-primary'), getColor('default-400')],
      grid: { strokeDashArray: 7 },
      xaxis: {
        categories: daily.map((d) => slotLabel(d.day, formatDayMonth)),
        tickAmount: typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 4 : 8,
        axisBorder: { show: false },
        labels: { offsetY: 2, rotate: 0, hideOverlappingLabels: true },
      },
      yaxis: {
        min: 0,
        tickAmount: 3,
        labels: { offsetX: -10, formatter: (v: number) => (isSales ? formatBahtCompact(v) : formatNumberNoSymbol(Math.round(v))) },
        axisBorder: { show: false },
      },
      legend: { position: 'top', horizontalAlign: 'right' },
      dataLabels: { enabled: false },
      markers: { size: 0 },
      tooltip: { shared: true, y: { formatter: (v: number) => (isSales ? formatBaht(v) : formatNumberNoSymbol(v)) } },
      // เส้นแรก (ช่วงนี้) ไล่สี .35→0 · เส้นประช่วงก่อนไม่มีพื้นที่
      fill: { opacity: [0.5, 0], type: ['gradient', 'solid'], gradient: { type: 'vertical', inverseColors: false, opacityFrom: 0.35, opacityTo: 0, stops: [0, 95] } },
    }),
    // active.pick สร้างใหม่ทุก render — ผูกกับ tab ที่เปลี่ยนจริงแทน
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daily, prevDaily, tab, t.seriesThis, t.seriesPrev],
  )

  return (
    <div className="card h-full min-w-0">
      <div className="card-header">
        <h4 className="card-title">{t.dailyTitle}</h4>
      </div>
      <div className="card-body p-0">
        <div className="border-default-300 border-b">
          <nav className="grid grid-cols-2" role="tablist" aria-label={t.dailyTitle} aria-orientation="horizontal">
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
                <span className="bg-info/15 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                  <Icon icon={x.icon} className="text-xl" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-default-700 text-sm font-medium">{x.title}</span>
                  <span className="text-default-900 flex flex-wrap items-baseline gap-x-2 text-lg font-semibold tabular-nums">
                    {x.value}
                    <DeltaText value={x.delta} className="text-sm font-normal" />
                  </span>
                </span>
              </button>
            ))}
          </nav>
        </div>
        <div className="p-5">
          <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${tab}`} className="min-h-72">
            <div role="img" aria-label={`${t.dailyTitle}: ${active.title} ${active.value}`}>
              <ApexChart getOptions={getOptions} type="area" height={300} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
