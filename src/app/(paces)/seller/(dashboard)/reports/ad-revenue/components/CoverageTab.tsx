'use client'

/**
 * CoverageTab — แท็บความครอบคลุมแบบ analytics dashboard (00091 · ม็อกอัพอนุมัติ 2026-11-16)
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx (KPI → 8/4) · donut: widgets/charts/components/StorePerformance.tsx
 * KPI จาก report.coverage ชุดเดียวกับ CoverageCard (HR16) · สถานะบัญชีโฆษณา Facebook = ใบที่ 4
 */
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import type { NoticeCopy } from '../../ads/components/AdSpendNotice'
import CoverageCard from './CoverageCard'
import { DashCard, KpiGrid, kpiBg, type KpiSpec } from './DashBits'
import { DonutChart } from './DashCharts'
import { fmtPct, type AdRevenueReport } from './data'

const share = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)

export default function CoverageTab({ report, noun, campaignsHref, noticeCopy, adsWithoutCampaign }: { report: AdRevenueReport; noun: string; campaignsHref: string; noticeCopy: NoticeCopy; adsWithoutCampaign: number }) {
  const t = useT().adRevenue
  const d = t.dash
  const c = report.coverage
  const orders = c.adOrders + c.chatOrders + c.otherOrders
  const sales = c.adSales + c.chatSales + c.otherSales
  const st = report.spend.state
  const metaLabel = st === 'OK' ? t.metaOk : st === 'NOT_CONNECTED' ? t.metaNone : st === 'AUTH' ? t.metaAuth : st === 'CURRENCY' ? t.metaCurrency : t.metaError

  const kpis: KpiSpec[] = [
    { key: 'orders', title: fmt(d.covAdOrders, { noun }), icon: 'speakerphone', iconBg: kpiBg(0), value: fmtPct(share(c.adOrders, orders)), sub: fmt(d.covOfTotal, { a: formatNumberNoSymbol(c.adOrders), b: formatNumberNoSymbol(orders) }) },
    { key: 'sales', title: d.covAdSales, icon: 'cash', iconBg: kpiBg(1), value: fmtPct(share(c.adSales, sales)), sub: fmt(d.covOfTotal, { a: formatBaht(c.adSales), b: formatBaht(sales) }) },
    { key: 'chat', title: t.covChat, icon: 'message-question', iconBg: kpiBg(2), value: fmt(t.ordersCount, { n: formatNumberNoSymbol(c.chatOrders) }), sub: fmt(d.covUnknownSub, { p: fmtPct(share(c.chatOrders, orders)), noun }) },
    { key: 'meta', title: t.metaStatusTitle, icon: st === 'OK' ? 'plug-connected' : 'plug-connected-x', iconBg: kpiBg(3), value: metaLabel, sub: report.spend.accountName ?? undefined },
  ]

  return (
    <>
      <KpiGrid items={kpis} />
      <div className="gap-base grid grid-cols-1 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <CoverageCard coverage={c} spend={report.spend} noun={noun} campaignsHref={campaignsHref} noticeCopy={noticeCopy} adsWithoutCampaign={adsWithoutCampaign} />
        </div>
        <div className="min-w-0 xl:col-span-4">
          <DashCard title={fmt(d.covByCount, { noun })}>
            <DonutChart
              isMoney={false} center={noun} centerValue={formatNumberNoSymbol(orders)}
              ariaLabel={`${fmt(d.covByCount, { noun })}: ${t.covAd} ${fmtPct(share(c.adOrders, orders))}, ${t.covChat} ${fmtPct(share(c.chatOrders, orders))}, ${t.covOther} ${fmtPct(share(c.otherOrders, orders))}`}
              slices={[
                { label: t.covAd, value: c.adOrders, color: 'chart-primary' },
                { label: t.covChat, value: c.chatOrders, color: 'default-400' },
                { label: t.covOther, value: c.otherOrders, color: 'default-200' },
              ]}
            />
          </DashCard>
        </div>
      </div>
    </>
  )
}
