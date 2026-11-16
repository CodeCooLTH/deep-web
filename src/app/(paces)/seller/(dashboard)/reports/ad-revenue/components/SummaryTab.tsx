'use client'

/**
 * SummaryTab — แท็บสรุปแบบ analytics dashboard (00091 · ม็อกอัพอนุมัติ 2026-11-16)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx (KPI แถวบน → กราฟหลัก xl:col-span-8 + การ์ดข้าง → แถวล่าง 7/5)
 * KPI: รับเงินแล้ว · ยอดขาย · ค่าโฆษณา+ROAS · กำไรส่วนเกิน (Meta ไม่ OK → คำสั่งซื้อ · ยกเลิก/ตีกลับ แทนสองใบหลัง)
 * 🛑 user 2026-11-16 อนุมัติม็อกอัพที่มี sparkline ในการ์ด KPI — แทนมติเดิม "ไม่มี sparkline" (2026-11-15)
 * 🛑 ตัวเลขทุกตัวมาจาก report (HR16) — ที่นี่แค่หาร/รวมเพื่อแสดง · กำไรส่วนเกินใช้ contribution() ตัวเดียวกับตาราง
 */
import Link from 'next/link'

import { roas } from '@/lib/ad-report-view'
import { contribution, groupAds } from '@/lib/ad-revenue-view'
import { adDisplayName } from '@/lib/ad-attribution'
import Icon from '@/components/wrappers/Icon'
import { formatBaht, formatNumberNoSymbol, pctChangeVsPrev } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { fmtRoas } from '../../ads/components/data'
import { DashCard, KpiGrid, kpiBg, RoasChip, SegRow, TopBarList, type KpiSpec } from './DashBits'
import { DonutChart } from './DashCharts'
import DeltaBadge from './DeltaBadge'
import SalesTrendCard from './SalesTrendCard'
import { fmtPct, spendIsOk, type AdRevenueReport } from './data'

type Props = { report: AdRevenueReport; noun: string; campaignsHref: string }

const share = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0)

export default function SummaryTab({ report, noun, campaignsHref }: Props) {
  const tt = useT()
  const t = tt.adRevenue
  const d = t.dash
  const { summary: s, previous: p, daily, spend } = report
  const ok = spendIsOk(spend)
  const pending = daily.reduce((n, x) => n + x.pending, 0)
  const profit = contribution(s.profitBeforeAds, s.spend)
  const totalRoas = roas(s.sales, s.spend)

  const kpis: KpiSpec[] = [
    {
      key: 'collected', title: t.collected, icon: 'wallet', iconBg: kpiBg(0), value: formatBaht(s.collected),
      badge: <DeltaBadge value={pctChangeVsPrev(s.collected, p.collected)} />,
      sub: fmt(d.collectedSub, { p: fmtPct(s.sales > 0 ? share(s.collected, s.sales) : null), v: formatBaht(pending) }),
      spark: { data: daily.map((x) => x.collected), kind: 'area', name: `${t.collected} · ${d.dailySpark}` },
    },
    {
      key: 'sales', title: t.sumSales, icon: 'cash', iconBg: kpiBg(1), value: formatBaht(s.sales),
      badge: <DeltaBadge value={pctChangeVsPrev(s.sales, p.sales)} />,
      sub: fmt(d.salesSub, { n: formatNumberNoSymbol(s.orders), noun, v: s.avgPerOrder === null ? '—' : formatBaht(s.avgPerOrder) }),
      spark: { data: daily.map((x) => x.sales), kind: 'bar', name: `${t.sumSales} · ${d.dailySpark}` },
    },
    ...(ok && s.spend !== null ? [
      {
        key: 'spend', title: fmt(d.spendRoas, { r: totalRoas === null ? '—' : fmtRoas(totalRoas) }), icon: 'speakerphone', iconBg: kpiBg(2), value: formatBaht(s.spend),
        // มติ user 2026-11-15: ค่าโฆษณาขึ้น = เขียว
        badge: <DeltaBadge value={pctChangeVsPrev(s.spend, p.spend)} />,
        sub: fmt(d.spendSub, { noun, v: s.orders > 0 ? formatBaht(s.spend / s.orders) : '—' }),
        spark: { data: daily.map((x) => x.spend ?? 0), kind: 'area', name: `${t.colSpend} · ${d.dailySpark}` },
      } satisfies KpiSpec,
      {
        key: 'profit', title: t.sumProfit, icon: 'trending-up', iconBg: kpiBg(3),
        value: <span className={profit.value < 0 ? 'text-danger-ink' : undefined}>{profit.value < 0 ? '−' : ''}{formatBaht(Math.abs(profit.value))}</span>,
        sub: s.incompleteProfitOrders > 0 ? `${d.profitSub} · ${fmt(t.costIncomplete, { n: s.incompleteProfitOrders })}` : d.profitSub,
        spark: { data: daily.map((x) => x.profitBeforeAds - (x.spend ?? 0)), kind: 'area', name: `${t.sumProfit} · ${d.dailySpark}` },
      } satisfies KpiSpec,
    ] : [
      {
        key: 'orders', title: noun, icon: 'shopping-cart', iconBg: kpiBg(2), value: formatNumberNoSymbol(s.orders),
        badge: <DeltaBadge value={pctChangeVsPrev(s.orders, p.orders)} />,
        spark: { data: daily.map((x) => x.orders), kind: 'bar', name: `${noun} · ${d.dailySpark}` },
      } satisfies KpiSpec,
      {
        key: 'lost', title: t.sumLost, icon: 'arrow-back-up', iconBg: kpiBg(3), value: fmt(t.sumLostValue, { n: formatNumberNoSymbol(s.cancelled + s.returned), unit: t.unit }),
        sub: s.lostRatePct === null ? undefined : fmt(t.lostBase, { p: fmtPct(s.lostRatePct), noun }),
      } satisfies KpiSpec,
    ]),
  ]

  // จากยอดสั่งถึงเงินเข้า — ชุดเดียวกับ waterfall (ยอดสั่งรวมยกเลิก = ยกเลิก + ตีกลับ + รอเก็บ + รับแล้ว)
  const w = report.waterfall
  const flow = [
    { key: 'gross', label: d.funnelGross, v: w.gross, tone: 'primary' as const },
    { key: 'cancelled', label: t.wfCancelled, v: w.cancelled, tone: 'default' as const },
    { key: 'returned', label: t.wfReturned, v: w.returned, tone: 'default' as const },
    { key: 'pending', label: d.pending, v: w.unrecorded, tone: 'warning' as const },
    { key: 'collected', label: t.collected, v: w.collected, tone: 'success' as const },
  ]

  // แคมเปญที่ทำเงิน (ไม่มีลำดับชั้นจาก Meta → โฆษณาที่ทำเงิน)
  const hasCampaigns = ok && report.ads.some((a) => a.campaignId)
  const topSource = hasCampaigns
    ? groupAds(report.ads, 'campaign').map((g) => ({ key: g.id ?? 'unknown', name: g.id === null ? t.unknownCampaign : g.name ?? g.id, sales: g.sales, spend: g.spend, profit: g.profitBeforeAds }))
    : report.ads.map((a) => ({ key: a.adId, name: adDisplayName(a.adTitle, a.adId, tt.inbox.contextBar.adIdFallback) ?? a.adId, sales: a.sales, spend: a.spend, profit: a.profitBeforeAds }))
  const top = topSource.filter((r) => r.sales > 0).sort((a, b) => b.sales - a.sales).slice(0, 5)
  const maxSales = top[0]?.sales ?? 0

  const custTotal = s.newSales + s.returningSales + s.unknownSales

  return (
    <>
      <KpiGrid items={kpis} />
      <div className="gap-base mb-base grid grid-cols-1 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <SalesTrendCard summary={s} daily={daily} prevDaily={report.prevDaily} noun={noun} />
        </div>
        <div className="min-w-0 xl:col-span-4">
          <DashCard title={d.funnelTitle} tip={t.includesLostNote}>
            <div className="flex flex-col gap-4">
              {flow.map((f) => <SegRow key={f.key} label={f.label} value={formatBaht(f.v)} pct={share(f.v, w.gross)} tone={f.tone} />)}
            </div>
          </DashCard>
        </div>
      </div>
      <div className="gap-base grid grid-cols-1 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          <DashCard
            title={hasCampaigns ? d.topCampaigns : d.topAds}
            tools={<Link href={campaignsHref} scroll={false} className="btn btn-sm border-default-300 min-h-11 border lg:min-h-0">{d.viewAll}<Icon icon="chevron-right" className="text-sm" aria-hidden="true" /></Link>}>
            <TopBarList
              empty={fmt(t.emptyRange, { noun })}
              rows={top.map((r) => {
                const rs = roas(r.sales, r.spend)
                return {
                  key: r.key, name: r.name, title: r.name, pct: maxSales > 0 ? (r.sales / maxSales) * 100 : 0,
                  value: <span className="text-default-800 font-semibold">{formatBaht(r.sales)}</span>,
                  chip: rs === null ? undefined : <RoasChip roas={`ROAS ${fmtRoas(rs)}`} loss={r.spend === null ? null : contribution(r.profit, r.spend).value < 0} />,
                }
              })}
            />
          </DashCard>
        </div>
        <div className="min-w-0 xl:col-span-5">
          <DashCard title={d.customersFromAds} tip={fmt(t.customerDefinition, { noun })}>
            <DonutChart
              center={d.salesTotal} centerValue={formatBaht(custTotal)}
              ariaLabel={`${d.customersFromAds}: ${t.custNew} ${fmtPct(share(s.newSales, custTotal))}, ${t.custReturning} ${fmtPct(share(s.returningSales, custTotal))}, ${t.custUnknown} ${fmtPct(share(s.unknownSales, custTotal))}`}
              slices={[
                { label: t.custNew, value: s.newSales, color: 'chart-primary' },
                { label: t.custReturning, value: s.returningSales, color: 'chart-delta' },
                { label: t.custUnknown, value: s.unknownSales, color: 'default-300' },
              ]}
            />
          </DashCard>
        </div>
      </div>
    </>
  )
}
