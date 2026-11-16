'use client'

/**
 * CustomersTab — แท็บลูกค้าแบบ analytics dashboard (00091 · ม็อกอัพอนุมัติ 2026-11-16) แทน CustomerMixCard เดิม
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx (KPI → 4/8 → ตาราง)
 *   donut: widgets/charts/components/StorePerformance.tsx · แท่งซ้อน: charts/apex/bar/components/data.ts (getStackedBarChart)
 * KPI: ลูกค้าใหม่ · ลูกค้าเดิม · ไม่ทราบ (นับเป็นใบ) · ต้นทุนได้ลูกค้าใหม่ (ค่าโฆษณา ÷ ลูกค้าใหม่ · Meta ไม่ OK = ซ่อน)
 */
import { adDisplayName } from '@/lib/ad-attribution'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import CustomerTableCard from './CustomerTableCard'
import { DashCard, KpiGrid, kpiBg, type KpiSpec } from './DashBits'
import { DonutChart, StackedBars } from './DashCharts'
import { fmtPct, spendIsOk, type AdRevenueReport } from './data'

const share = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
const short = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export default function CustomersTab({ report, noun }: { report: AdRevenueReport; noun: string }) {
  const tt = useT()
  const t = tt.adRevenue
  const d = t.dash
  const { summary: s, ads, spend } = report
  const ok = spendIsOk(spend)
  const total = s.newSales + s.returningSales + s.unknownSales
  const acq = ok && s.spend !== null && s.newCustomers > 0 ? s.spend / s.newCustomers : null
  const people = (n: number) => fmt(t.peopleCount, { n: formatNumberNoSymbol(n) })

  const kpis: KpiSpec[] = [
    { key: 'new', title: t.custNew, icon: 'user-plus', iconBg: kpiBg(0), value: people(s.newCustomers), sub: fmt(d.shareLine, { v: formatBaht(Math.round(s.newSales)), p: fmtPct(share(s.newSales, total)) }) },
    { key: 'ret', title: t.custReturning, icon: 'users', iconBg: kpiBg(1), value: people(s.returningCustomers), sub: fmt(d.shareLine, { v: formatBaht(Math.round(s.returningSales)), p: fmtPct(share(s.returningSales, total)) }) },
    { key: 'unk', title: t.custUnknown, icon: 'help-circle', iconBg: kpiBg(2), value: fmt(t.ordersCount, { n: formatNumberNoSymbol(s.unknownCustomers) }), sub: fmt(d.shareLine, { v: formatBaht(Math.round(s.unknownSales)), p: fmtPct(share(s.unknownSales, total)) }) },
    ...(acq !== null ? [{ key: 'acq', title: t.colAcqCost, icon: 'coin', iconBg: kpiBg(3), value: formatBaht(Math.round(acq)), sub: d.acqSub } satisfies KpiSpec] : []),
  ]

  const byAd = [...ads].filter((a) => a.orders > 0).sort((a, b) => b.orders - a.orders).slice(0, 8)
  const nameOf = (a: (typeof ads)[number]) => adDisplayName(a.adTitle, a.adId, tt.inbox.contextBar.adIdFallback) ?? a.adId

  return (
    <>
      <KpiGrid items={kpis} />
      <div className="gap-base mb-base grid grid-cols-1 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-4">
          <DashCard title={d.salesShare} tip={fmt(t.customerDefinition, { noun })}>
            <DonutChart
              center={d.salesTotal} centerValue={formatBaht(Math.round(total))}
              ariaLabel={`${d.salesShare}: ${t.custNew} ${fmtPct(share(s.newSales, total))}, ${t.custReturning} ${fmtPct(share(s.returningSales, total))}, ${t.custUnknown} ${fmtPct(share(s.unknownSales, total))}`}
              slices={[
                { label: t.custNew, value: s.newSales, color: 'chart-primary' },
                { label: t.custReturning, value: s.returningSales, color: 'chart-delta' },
                { label: t.custUnknown, value: s.unknownSales, color: 'default-300' },
              ]}
            />
          </DashCard>
        </div>
        <div className="min-w-0 xl:col-span-8">
          <DashCard title={d.custByAd} tip={t.custUnknownTip}>
            <StackedBars
              ariaLabel={d.custByAd}
              categories={byAd.map((a) => short(nameOf(a)))}
              unit={(v) => formatNumberNoSymbol(Math.round(v))}
              series={[
                { name: t.custNew, data: byAd.map((a) => a.newCustomers), color: 'chart-primary' },
                { name: t.custReturning, data: byAd.map((a) => a.returningCustomers), color: 'chart-delta' },
                { name: t.custUnknown, data: byAd.map((a) => a.unknownCustomers), color: 'default-300' },
              ]}
            />
          </DashCard>
        </div>
      </div>
      <CustomerTableCard ads={ads} spendOk={ok} noun={noun} />
    </>
  )
}
