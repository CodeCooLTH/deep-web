'use client'

/**
 * CampaignsTab — แท็บแคมเปญแบบ analytics dashboard (00091 · ม็อกอัพอนุมัติ 2026-11-16)
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx (KPI → กราฟเต็มแถว → ตาราง)
 * KPI: แคมเปญที่ได้คำสั่งซื้อ n/N · ROAS รวม · กำไรส่วนเกิน · ต้นทุนต่อคำสั่งซื้อ — ไม่มีค่าโฆษณา (Meta ไม่ OK) → ซ่อนใบที่ใช้ค่าโฆษณา
 * 🛑 ไม่มีลำดับชั้นจาก Meta → นับ/กราฟเป็นรายโฆษณา (ชุดเดียวกับตารางที่แบนลง)
 */
import { roas } from '@/lib/ad-report-view'
import { contribution, groupAds } from '@/lib/ad-revenue-view'
import { adDisplayName } from '@/lib/ad-attribution'
import { formatBaht, formatNumberNoSymbol, pctChangeVsPrev } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { fmtRoas } from '../../ads/components/data'
import CampaignTableCard from './CampaignTableCard'
import { DashCard, KpiGrid, kpiBg, type KpiSpec } from './DashBits'
import { Columns } from './DashCharts'
import DeltaBadge from './DeltaBadge'
import { spendIsOk, type AdRevenueReport } from './data'

const short = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export default function CampaignsTab({ report, noun, rangeQuery, rangeLabel }: { report: AdRevenueReport; noun: string; rangeQuery: string; rangeLabel: string }) {
  const tt = useT()
  const t = tt.adRevenue
  const d = t.dash
  const { summary: s, previous: p, ads, spend } = report
  const ok = spendIsOk(spend)
  const hasCampaigns = ok && ads.some((a) => a.campaignId)

  const rows = hasCampaigns
    ? groupAds(ads, 'campaign').map((g) => ({ name: g.id === null ? t.unknownCampaign : g.name ?? g.id, orders: g.orders, sales: g.sales, collected: g.collected, spend: g.spend, profit: g.profitBeforeAds }))
    : ads.map((a) => ({ name: adDisplayName(a.adTitle, a.adId, tt.inbox.contextBar.adIdFallback) ?? a.adId, orders: a.orders, sales: a.sales, collected: a.collected, spend: a.spend, profit: a.profitBeforeAds }))
  const withOrders = rows.filter((r) => r.orders > 0).length
  const idle = rows.filter((r) => r.orders === 0 && (r.spend ?? 0) > 0).length
  const loss = rows.filter((r) => r.spend !== null && contribution(r.profit, r.spend).value < 0).length

  const total = roas(s.sales, s.spend)
  const prevRoas = roas(p.sales, p.spend)
  const profit = contribution(s.profitBeforeAds, s.spend)
  const cpo = s.spend !== null && s.orders > 0 ? s.spend / s.orders : null
  const prevCpo = p.spend !== null && p.orders > 0 ? p.spend / p.orders : null
  const daily = report.daily

  const kpis: KpiSpec[] = [
    {
      key: 'with', title: hasCampaigns ? fmt(d.campaignsWithOrders, { noun }) : t.allAds, icon: 'speakerphone', iconBg: kpiBg(0),
      value: `${formatNumberNoSymbol(withOrders)} / ${formatNumberNoSymbol(rows.length)}`,
      sub: idle > 0 ? fmt(d.campaignsIdle, { n: idle, noun }) : undefined,
    },
    ...(ok && s.spend !== null ? [
      {
        key: 'roas', title: d.roasTotal, icon: 'chart-arrows-vertical', iconBg: kpiBg(1), value: total === null ? '—' : fmtRoas(total),
        badge: <DeltaBadge value={total === null || prevRoas === null ? null : pctChangeVsPrev(total, prevRoas)} />, sub: d.roasSub,
        spark: { data: daily.map((x) => (x.spend ? Math.round((x.sales / x.spend) * 100) / 100 : 0)), kind: 'area', name: `${t.colRoas} · ${d.dailySpark}` },
      } satisfies KpiSpec,
      {
        key: 'profit', title: t.sumProfit, icon: 'trending-up', iconBg: kpiBg(2),
        value: <span className={profit.value < 0 ? 'text-danger-ink' : undefined}>{profit.value < 0 ? '−' : ''}{formatBaht(Math.round(Math.abs(profit.value)))}</span>,
        sub: loss > 0 ? fmt(d.campaignsLoss, { n: loss }) : d.profitSub,
        spark: { data: daily.map((x) => x.profitBeforeAds - (x.spend ?? 0)), kind: 'area', name: `${t.sumProfit} · ${d.dailySpark}` },
      } satisfies KpiSpec,
      {
        key: 'cpo', title: fmt(d.costPerOrder, { noun }), icon: 'receipt-2', iconBg: kpiBg(3), value: cpo === null ? '—' : formatBaht(Math.round(cpo)),
        // ต้นทุนต่อใบขึ้น = แย่
        badge: <DeltaBadge value={cpo === null || prevCpo === null ? null : pctChangeVsPrev(cpo, prevCpo)} tone="lower" />, sub: fmt(d.costPerOrderSub, { noun }),
      } satisfies KpiSpec,
    ] : []),
  ]

  const chartRows = rows.filter((r) => r.sales > 0 || (r.spend ?? 0) > 0).sort((a, b) => b.sales - a.sales).slice(0, 8)

  return (
    <>
      <KpiGrid items={kpis} />
      {chartRows.length > 0 && (
        <div className="mb-base">
          <DashCard title={hasCampaigns ? d.campBarsTitle : d.adBarsTitle}>
            <Columns
              ariaLabel={hasCampaigns ? d.campBarsTitle : d.adBarsTitle}
              categories={chartRows.map((r) => short(r.name))}
              series={[
                ...(ok ? [{ name: t.colSpend, data: chartRows.map((r) => Math.round(r.spend ?? 0)), color: 'dark' }] : []),
                { name: t.colSales, data: chartRows.map((r) => Math.round(r.sales)), color: 'chart-primary' },
                { name: t.collected, data: chartRows.map((r) => Math.round(r.collected)), color: 'chart-delta' },
              ]}
            />
          </DashCard>
        </div>
      )}
      <CampaignTableCard ads={ads} spend={spend} noun={noun} rangeQuery={rangeQuery} rangeLabel={rangeLabel} />
    </>
  )
}
