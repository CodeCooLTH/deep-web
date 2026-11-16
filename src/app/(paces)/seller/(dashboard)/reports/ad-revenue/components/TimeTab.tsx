'use client'

/**
 * TimeTab — แท็บช่วงเวลาขายแบบ analytics dashboard (00091 · ม็อกอัพอนุมัติ 2026-11-16)
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx (KPI → 8/4)
 *   แท่งรายช่วงเวลา: theme/paces/Admin/TS/src/app/(admin)/charts/apex/column/components/data.ts (basic column)
 * KPI ทั้งหมดคิดจาก report.heatmap (ชุดเดียวกับ heatmap) · ช่วง/วันขายดีซ่อนเมื่อ{noun} < INSIGHT_RULES.minOrders (มติเดิม Q5)
 */
import { INSIGHT_RULES } from '@/lib/ad-revenue-view'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { DashCard, KpiGrid, kpiBg, type KpiSpec } from './DashBits'
import { Columns } from './DashCharts'
import SalesTimeHeatmap from './SalesTimeHeatmap'
import { bestTwoHours, fmtPct, hh, type AdRevenueReport } from './data'

export default function TimeTab({ report, noun }: { report: AdRevenueReport; noun: string }) {
  const t = useT().adRevenue
  const d = t.dash
  const { heatmap, summary: s, daily } = report
  const enough = s.orders >= INSIGHT_RULES.minOrders

  const byHour = Array.from({ length: 24 }, (_, h) => heatmap.sales.reduce((n, row) => n + row[h], 0))
  const best = bestTwoHours(heatmap)
  const total = best.total
  const byDay = heatmap.sales.map((row) => row.reduce((a, b) => a + b, 0))
  const bestDay = byDay.reduce((bi, v, i) => (v > byDay[bi] ? i : bi), 0)
  const buckets = Array.from({ length: 12 }, (_, i) => byHour[i * 2] + byHour[i * 2 + 1])

  const kpis: KpiSpec[] = [
    {
      key: 'hours', title: d.bestHours, icon: 'clock', iconBg: kpiBg(0),
      value: enough && best.v > 0 ? fmt(d.hourRange, { a: `${hh(best.h)}:00`, b: `${hh(best.h + 2)}:00` }) : '—',
      sub: enough && total > 0 ? fmt(d.bestHoursSub, { p: fmtPct(Math.round((best.v / total) * 1000) / 10) }) : undefined,
    },
    {
      key: 'day', title: d.bestDay, icon: 'calendar-event', iconBg: kpiBg(1),
      value: enough && byDay[bestDay] > 0 ? fmt(d.bestDayValue, { d: t.weekdays[bestDay] }) : '—',
      sub: enough && byDay[bestDay] > 0 ? fmt(d.bestDaySub, { v: formatBaht(byDay[bestDay]) }) : undefined,
    },
    {
      key: 'click', title: d.clickToOrder, icon: 'hourglass', iconBg: kpiBg(2),
      value: s.medianClickToOrderDays === null ? '—' : fmt(t.daysValue, { n: formatNumberNoSymbol(s.medianClickToOrderDays) }), sub: d.medianSub,
    },
    {
      key: 'avg', title: d.avgPerDay, icon: 'cash', iconBg: kpiBg(3), value: daily.length > 0 ? formatBaht(s.sales / daily.length) : '—',
      spark: { data: daily.map((x) => x.sales), kind: 'bar', name: `${t.sumSales} · ${d.dailySpark}` },
    },
  ]

  return (
    <>
      <KpiGrid items={kpis} />
      <div className="gap-base grid grid-cols-1 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8"><SalesTimeHeatmap heatmap={heatmap} totalOrders={s.orders} noun={noun} /></div>
        <div className="min-w-0 xl:col-span-4">
          <DashCard title={d.byHour} tip={t.timeNote}>
            <Columns
              ariaLabel={d.byHour} dimColor
              categories={buckets.map((_, i) => hh(i * 2))}
              series={[{ name: t.colSales, data: buckets.map((v) => Math.round((v) * 100) / 100), color: 'chart-primary' }]}
            />
          </DashCard>
        </div>
      </div>
    </>
  )
}
