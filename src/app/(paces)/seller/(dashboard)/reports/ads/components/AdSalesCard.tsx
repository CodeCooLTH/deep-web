'use client'

/**
 * AdSalesCard — ① ยอดขายจากโฆษณา (พระเอกของหน้า) · เลขใหญ่ + เทียบช่วงก่อน + แท่งซ้อนรายวัน (feature 00091 FR-009)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalOrder.tsx (card h-full > card-body · เลข + delta · แท่งซ้อน)
 *   chart: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/FinancialOverview.tsx (columnWidth/borderRadius · grid · legend)
 * ตัด: CountUp (เลขนับขึ้นทุกครั้งที่เปลี่ยนช่วง = รบกวน) · select วันที่ (ช่วงอยู่ที่หัวหน้า) · kicker uppercase · ไอคอนวงกลมทึบ — ใช้ card-header ตามธีม
 *
 * สี: chart-primary = จากโฆษณา · chart-delta = ไม่ได้มาจากโฆษณา (HR10 — ไม่ใช้ chart-secondary ม่วง/chart-alpha เขียว เป็นสีหมวด)
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import { slotLabel } from '@/lib/ad-report-view'
import { formatDayMonth } from '@/lib/format-date'
import { formatBaht, formatBahtCompact, formatNumberNoSymbol, pctChangeVsPrev } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { getColor } from '@/utils/helpers'
import DeltaText from './DeltaText'
import type { AdReportView } from './data'

export default function AdSalesCard({ report, noun }: { report: AdReportView; noun: string }) {
  const t = useT().adReport
  const { summary, previous, daily } = report
  const delta = pctChangeVsPrev(summary.adSales, previous.adSales)
  const aria = fmt(t.chartAria, { ad: formatBaht(summary.adSales), non: formatBaht(summary.nonAdSales) })

  const getOptions = useCallback(
    (): ApexOptions => ({
      chart: { type: 'bar', height: 240, stacked: true, toolbar: { show: false } },
      plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 2 } },
      series: [
        { name: t.legendFromAd, data: daily.map((d) => d.adSales) },
        { name: t.legendNotFromAd, data: daily.map((d) => d.nonAdSales) },
      ],
      dataLabels: { enabled: false },
      colors: [getColor('chart-primary'), getColor('chart-delta')],
      grid: { borderColor: getColor('chart-border-color'), strokeDashArray: 4, padding: { top: -10, right: 0, bottom: -10, left: 10 } },
      xaxis: {
        categories: daily.map((d) => slotLabel(d.day, formatDayMonth)),
        tickAmount: typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 4 : 6,
        labels: { rotate: 0, hideOverlappingLabels: true, style: { fontSize: '11px' } },
        axisBorder: { show: false },
        tickPlacement: 'on',
      },
      yaxis: { min: 0, tickAmount: 3, labels: { formatter: (v: number) => formatBahtCompact(v) } },
      tooltip: { shared: true, intersect: false, y: { formatter: (v: number) => formatBaht(v) } },
      legend: { position: 'top', horizontalAlign: 'right' },
    }),
    [daily, t.legendFromAd, t.legendNotFromAd],
  )

  return (
    <div className="card h-full min-w-0">
      <div className="card-header">
        <h4 className="card-title">{t.summaryHeading}</h4>
      </div>
      <div className="card-body">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-default-900 mb-0 text-xl font-bold tabular-nums">{formatBaht(summary.adSales)}</p>
          <DeltaText value={delta} className="text-sm" />
        </div>
        <p className="text-default-700 mt-1 mb-0 text-xs">
          {previous.adSales > 0
            ? fmt(t.prevLine, { amount: formatBaht(previous.adSales), n: formatNumberNoSymbol(previous.adOrders), unit: t.countUnit })
            : t.prevZero}
        </p>
        <div className="mt-3 min-h-60" role="img" aria-label={aria}>
          {summary.adOrders === 0 ? (
            <p className="text-default-500 flex min-h-60 items-center justify-center text-center text-sm">{fmt(t.noAdOrdersChart, { noun })}</p>
          ) : (
            <ApexChart getOptions={getOptions} type="bar" height={240} />
          )}
        </div>
      </div>
    </div>
  )
}
