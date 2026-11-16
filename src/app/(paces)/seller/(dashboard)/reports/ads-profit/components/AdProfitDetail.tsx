'use client'

/**
 * AdProfitDetail — รายละเอียดโฆษณา (00096 BRD FR-009/FR-010 · P0 = แท็บยอดขายและกำไร + แท็บคำสั่งซื้อ)
 *
 * Base: KPI = DashBits KpiGrid (theme dashboard/analytics/TotalOrder) · จากยอดขายถึงกำไร = แถวแท่งลอยแบบ ad-revenue/components/StatusWaterfallCard.tsx
 *   (theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TopTrafficSources.tsx) · รายวัน = DashCharts Columns (charts/apex/column)
 *   ตารางคำสั่งซื้อ = theme/paces/Admin/TS/src/app/(admin)/tables/static/components/HoverableRows.tsx (ตัวเลขชิดขวา)
 * 🛑 ค่าโฆษณาจัดสรร = allocateSpend (ผลรวม = ค่าโฆษณาจริง) · ผลรวมตารางคำสั่งซื้อ = แถวของโฆษณานี้ในตารางหลัก (เทส DB)
 */
import Link from 'next/link'

import AdThumb from '@/components/safepay/AdThumb'
import Icon from '@/components/wrappers/Icon'
import { allocateSpend, type ProductProfit } from '@/lib/ads-profit'
import { adDisplayName } from '@/lib/ad-attribution'
import { formatDate } from '@/lib/format-date'
import { formatNumberNoSymbol } from '@/lib/format-money'
import type { AdProfitRow, ProfitMode } from '@/services/ads-profit.service'
import type { ProfitInsight } from '@/lib/ads-profit-insights'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'
import { fmtRoas } from '../../ads/components/data'
import { DashCard, KpiGrid, kpiBg, type KpiSpec } from '../../ad-revenue/components/DashBits'
import { Columns } from '../../ad-revenue/components/DashCharts'
import InfoTip from '../../ad-revenue/components/InfoTip'
import { money, Signed } from './AdsProfitKpis'

export type DetailOrder = { id: string; token: string; no: string; createdAt: string; customer: string | null; items: string; revenue: number; cogs: number; variable: number; paid: boolean; status: string }
type Props = {
  row: AdProfitRow; mode: ProfitMode; noun: string; tab: DetailTab; baseHref: string; backHref: string; insights: ProfitInsight[]
  orders: DetailOrder[]; products: ProductProfit[]; daily: { day: string; spend: number; revenue: number; profit: number }[]
}

export type DetailTab = 'profit' | 'perf' | 'orders' | 'products' | 'diag'

export default function AdProfitDetail({ row, mode, noun, tab, baseHref, backHref, orders, products, daily, insights }: Props) {
  const tt = useT()
  const t = tt.adsProfit
  const p = row.parts[mode], m = row.metrics[mode]
  const name = adDisplayName(row.adTitle, row.adId, tt.inbox.contextBar.adIdFallback) ?? row.adId
  const alloc = allocateSpend(row.spend ?? 0, orders.length)

  const kpis: KpiSpec[] = [
    { key: 'spend', title: t.kpiSpend, icon: 'speakerphone', iconBg: kpiBg(2), value: money(row.spend) },
    { key: 'orders', title: fmt(t.kpiOrders, { noun }), icon: 'shopping-cart', iconBg: kpiBg(1), value: formatNumberNoSymbol(p.orders), sub: `${t.kpiRevenue} ${money(p.revenue)}` },
    { key: 'after', title: t.kpiProfitAfter, icon: 'trending-up', iconBg: kpiBg(0), value: <Signed v={m.profitAfter} />, sub: p.incomplete > 0 ? fmt(t.costIncomplete, { n: p.incomplete }) : `ROAS ${m.roas === null ? '—' : fmtRoas(m.roas)}` },
    { key: 'ppo', title: fmt(t.kpiProfitPerOrder, { noun }), icon: 'coin', iconBg: kpiBg(3), value: <Signed v={m.profitPerOrder} />, sub: `${fmt(t.kpiCpo, { noun })} ${money(m.costPerOrder)}` },
  ]

  // จากยอดขายถึงกำไร: ยอดสุทธิ → −ต้นทุนสินค้า → −ค่าใช้จ่ายผันแปร → −ค่าโฆษณา → กำไร (แท่งลอยบนรางเดียว)
  const steps = [
    { key: 'rev', label: t.kpiRevenue, from: 0, amount: p.revenue, bar: 'bg-primary', sign: '' },
    { key: 'cogs', label: t.colCogs, from: p.revenue - p.cogs, amount: p.cogs, bar: 'bg-default-400', sign: '−' },
    { key: 'var', label: t.colVariable, from: p.revenue - p.cogs - p.variable, amount: p.variable, bar: 'bg-default-300', sign: '−' },
    { key: 'spend', label: t.kpiSpend, from: m.profitBefore - (row.spend ?? 0), amount: row.spend ?? 0, bar: 'bg-warning', sign: '−' },
  ]
  const scale = Math.max(p.revenue, row.spend ?? 0, 1)
  const after = m.profitAfter ?? m.profitBefore
  const pctOf = (v: number) => (v / scale) * 100

  const tabs: [DetailTab, string][] = [['profit', t.detailTabProfit], ['perf', t.detailTabPerf], ['orders', fmt(t.detailTabOrders, { noun })], ['products', t.detailTabProducts], ['diag', t.detailTabDiag]]
  const ratio = (a: number | null, b: number | null, k = 1) => (a === null || b === null || b <= 0 ? null : (a / b) * k)
  const n2 = (v: number | null, d = 0, pre = '', post = '') => (v === null ? '—' : `${pre}${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}${post}`)

  return (
    <>
      <div className="card mb-base">
        <div className="card-body flex flex-wrap items-center gap-3">
          <Link href={backHref} className="btn btn-sm border-default-300 min-h-11 border lg:min-h-0"><Icon icon="arrow-left" className="text-sm" aria-hidden="true" />{t.detailBack}</Link>
          <AdThumb photoFileId={row.adPhotoFileId} className="size-12 rounded-md" iconClass="text-xl" />
          <div className="min-w-0">
            <h4 className="text-default-900 mb-0 truncate text-lg font-semibold">{name}</h4>
            <p className="text-default-600 mb-0 truncate text-sm">{[row.campaignName, row.adsetName].filter(Boolean).join(' › ') || row.adId}</p>
            {(row.adStatus || row.objective) && (
              <p className="mt-1 mb-0 flex flex-wrap gap-1.5 text-xs">
                {row.adStatus && <span className={cn('badge py-0.5', row.adStatus === 'ACTIVE' ? 'bg-success/15 text-success-ink' : 'bg-light text-default-700')}>{(t.adStatus as Record<string, string>)[row.adStatus] ?? row.adStatus}</span>}
                {row.objective && <span className="badge bg-light text-default-700 py-0.5">{t.objectiveLabel}: {(t.objective as Record<string, string>)[row.objective] ?? row.objective}</span>}
              </p>
            )}
          </div>
        </div>
        <nav className="border-default-300 flex border-t border-dashed px-2" role="tablist" aria-label={name}>
          {tabs.map(([k, l]) => (
            <Link key={k} href={`${baseHref}${k === 'profit' ? '' : `&tab=${k}`}`} role="tab" aria-selected={tab === k} scroll={false}
              className={cn('relative inline-flex min-h-11 items-center px-4 text-sm', tab === k ? 'text-primary font-semibold' : 'text-default-700 hover:text-primary')}>
              {l}{tab === k && <span className="bg-primary absolute inset-x-0 bottom-0 h-0.75" aria-hidden="true" />}
            </Link>
          ))}
        </nav>
      </div>

      {tab === 'profit' ? (
        <>
          <KpiGrid items={kpis} />
          <div className="gap-base grid grid-cols-1 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-5">
              <DashCard title={t.breakdownTitle} tip={t.variableTip}>
                <div className="flex flex-col gap-3" role="img" aria-label={`${t.breakdownTitle}: ${t.kpiRevenue} ${money(p.revenue)} → ${t.kpiProfitAfter} ${money(after)}`}>
                  {[...steps, { key: 'profit', label: t.kpiProfitAfter, from: Math.min(0, after), amount: Math.abs(after), bar: after < 0 ? 'bg-danger' : 'bg-success', sign: after < 0 ? '−' : '' }].map((s) => {
                    const w = s.amount > 0 ? Math.max(1, pctOf(s.amount)) : 0
                    const left = Math.max(0, Math.min(pctOf(Math.max(0, s.from)), 100 - w))
                    return (
                      <div key={s.key} className="grid grid-cols-12 items-center gap-3" aria-hidden="true">
                        <span className={cn('col-span-4 truncate text-sm', s.key === 'rev' || s.key === 'profit' ? 'text-default-900 font-semibold' : 'text-default-700')}>{s.label}</span>
                        <span className="bg-default-100 relative col-span-5 h-7 rounded-md">{w > 0 && <span className={cn('absolute inset-y-0 rounded-md', s.bar)} style={{ insetInlineStart: `${left}%`, width: `${w}%` }} />}</span>
                        <b className={cn('col-span-3 text-end text-sm whitespace-nowrap tabular-nums', s.key === 'profit' && (after < 0 ? 'text-danger-ink' : 'text-success-ink'))}>{s.sign}{money(s.amount)}</b>
                      </div>
                    )
                  })}
                </div>
              </DashCard>
            </div>
            <div className="min-w-0 xl:col-span-7">
              <DashCard title={t.dailyTitle} tip={t.cohortTip}>
                <Columns
                  ariaLabel={t.dailyTitle}
                  categories={daily.map((d) => d.day.slice(8, 10))}
                  series={[
                    { name: t.kpiSpend, data: daily.map((d) => Math.round((d.spend) * 100) / 100), color: 'chart-gamma' },
                    { name: t.kpiRevenue, data: daily.map((d) => Math.round((d.revenue) * 100) / 100), color: 'chart-primary' },
                    { name: t.kpiProfitAfter, data: daily.map((d) => Math.round((d.profit) * 100) / 100), color: 'chart-alpha' },
                  ]}
                />
              </DashCard>
            </div>
          </div>
        </>
      ) : tab === 'perf' ? (
        <div className="gap-base grid grid-cols-1 xl:grid-cols-12">
          <div className="min-w-0 xl:col-span-5 flex flex-col gap-base">
            {[
              { title: t.perfDelivery, items: [[t.colImpr, n2(row.impressions)], [t.colReach, n2(row.reach)], [t.colFreq, n2(row.frequency, 2)], [t.colCpm, n2(ratio(row.spend, row.impressions, 1000), 2, '฿')]] },
              { title: t.perfTraffic, tip: t.perfCtrTip, items: [[t.colClicks, n2(row.clicks)], [t.colCtr, n2(ratio(row.clicks, row.impressions, 100), 2, '', '%')], [t.colCpc, n2(ratio(row.spend, row.clicks), 2, '฿')]] },
              { title: t.perfConversion, items: [[t.colChats, n2(row.chatsMeta)], [t.colCostPerChat, n2(ratio(row.spend, row.chatsMeta), 2, '฿')], [fmt(t.kpiOrders, { noun }), n2(p.orders)], [fmt(t.kpiCpo, { noun }), money(m.costPerOrder)], ['ROAS', m.roas === null ? '—' : fmtRoas(m.roas)]] },
            ].map((g) => (
              <DashCard key={g.title} title={g.title} tip={g.tip}>
                <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
                  {g.items.map(([l, v]) => (<div key={l} className="min-w-0"><dt className="text-default-600 text-xs">{l}</dt><dd className="text-default-900 mb-0 text-lg font-bold tabular-nums">{v}</dd></div>))}
                </dl>
              </DashCard>
            ))}
          </div>
          <div className="min-w-0 xl:col-span-7">
            <DashCard title={t.perfDailySpend}>
              <Columns ariaLabel={t.perfDailySpend} categories={daily.map((d) => d.day.slice(8, 10))} series={[{ name: t.kpiSpend, data: daily.map((d) => Math.round((d.spend) * 100) / 100), color: 'chart-gamma' }]} />
            </DashCard>
          </div>
        </div>
      ) : tab === 'products' ? (
        <div className="card">
          <div className="card-header"><h4 className="card-title">{t.detailTabProducts}</h4><InfoTip text={t.productsTip} /></div>
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead className="bg-light/25 text-2xs uppercase">
                <tr>
                  <th className="w-full">{t.colProduct}</th><th className="text-end whitespace-nowrap">{t.colQty}</th><th className="text-end whitespace-nowrap">{fmt(t.colOrders, { noun })}</th>
                  <th className="text-end whitespace-nowrap">{t.colRevenue}</th><th className="text-end whitespace-nowrap">{t.colCogs}</th><th className="text-end whitespace-nowrap">{t.colProfitBefore}</th>
                  <th className="text-end whitespace-nowrap">{t.colAlloc}</th><th className="text-end whitespace-nowrap">{t.colOrderProfit}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((pp) => (
                  <tr key={pp.key}>
                    <td className="max-w-xs truncate" title={pp.name}>{pp.name}{pp.missingCost && <span className="badge bg-warning/15 text-warning-ink ms-2 py-0 text-xs">{t.status.INCOMPLETE}</span>}</td>
                    <td className="text-end tabular-nums whitespace-nowrap">{formatNumberNoSymbol(pp.qty)}</td>
                    <td className="text-end tabular-nums whitespace-nowrap">{formatNumberNoSymbol(pp.orders)}</td>
                    <td className="text-end tabular-nums whitespace-nowrap">{money(pp.revenue)}</td>
                    <td className="text-end tabular-nums whitespace-nowrap">{money(pp.cogs)}</td>
                    <td className="text-end tabular-nums whitespace-nowrap"><Signed v={pp.profitBefore} /></td>
                    <td className="text-end tabular-nums whitespace-nowrap">{money(pp.allocated)}</td>
                    <td className="text-end tabular-nums whitespace-nowrap"><b className="font-bold"><Signed v={pp.profitAfter} /></b></td>
                  </tr>
                ))}
                {products.length === 0 && <tr><td colSpan={8} className="text-default-500 py-6 text-center">{fmt(t.emptyRange, { noun })}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'diag' ? (
        <DashCard title={t.detailTabDiag}>
          <p className="text-default-600 mb-3 text-sm">{t.diagNote}</p>
          {insights.length === 0 ? <p className="text-default-500 mb-0 text-sm">{t.diagEmpty}</p> : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {insights.map((i) => {
                const c = t.insight[i.kind]
                const v = i.kind === 'ROAS_BUT_LOSS' ? { value: fmtRoas(i.value), baseline: fmtRoas(i.baseline) } : i.kind === 'LOSS' || i.kind === 'HIGH_CPO' ? { value: money(i.value), baseline: money(i.baseline) } : { value: i.value.toFixed(1), baseline: i.baseline.toFixed(1) }
                return (
                  <li key={i.kind} className="border-default-300 rounded-lg border border-dashed p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2"><b className="text-default-900 text-sm">{fmt(c.title, { noun })}</b><span className="badge bg-light text-default-700 py-0.5 text-xs">{t.priority[i.priority]}</span><span className="text-default-500 ms-auto text-xs">{t.confidence[i.confidence]}</span></div>
                    <p className="text-default-800 mb-1 text-sm tabular-nums">{fmt(c.detail, v)}</p>
                    <p className="text-default-600 mb-0 text-xs">{t.causeLabel}: {c.cause} · <b className="font-semibold">{t.tryLabel}:</b> {c.tryIt}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </DashCard>
      ) : (
        <div className="card">
          <div className="card-header"><h4 className="card-title">{fmt(t.detailTabOrders, { noun })}</h4><InfoTip text={fmt(t.allocTip, { noun })} /></div>
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead className="bg-light/25 text-2xs uppercase">
                <tr>
                  <th>{t.colOrderNo}</th><th>{t.colDate}</th><th>{t.colCustomer}</th><th className="w-full">{t.colItems}</th>
                  <th className="text-end whitespace-nowrap">{t.colRevenue}</th><th className="text-end whitespace-nowrap">{t.colCogs}</th><th className="text-end whitespace-nowrap">{t.colVariable}</th>
                  <th className="text-end whitespace-nowrap">{t.colAlloc}</th><th className="text-end whitespace-nowrap">{t.colOrderProfit}</th><th className="text-end">{t.colPayStatus}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => {
                  const a = row.spend === null ? null : alloc[i]
                  const prof = o.revenue - o.cogs - o.variable - (a ?? 0)
                  return (
                    <tr key={o.id}>
                      <td className="whitespace-nowrap"><Link href={`/orders/${o.token}`} className="text-primary font-medium">{o.no}</Link></td>
                      <td className="whitespace-nowrap tabular-nums">{formatDate(o.createdAt)}</td>
                      <td className="max-w-40 truncate">{o.customer ?? '—'}</td>
                      <td className="text-default-700 max-w-xs truncate" title={o.items}>{o.items}</td>
                      <td className="text-end tabular-nums whitespace-nowrap">{money(o.revenue)}</td>
                      <td className="text-end tabular-nums whitespace-nowrap">{money(o.cogs)}</td>
                      <td className="text-end tabular-nums whitespace-nowrap">{money(o.variable)}</td>
                      <td className="text-end tabular-nums whitespace-nowrap">{money(a)}</td>
                      <td className="text-end tabular-nums whitespace-nowrap"><b className="font-bold"><Signed v={prof} /></b></td>
                      <td className="text-end whitespace-nowrap"><span className={cn('badge py-0.5 text-xs', o.paid ? 'bg-success/15 text-success-ink' : 'bg-warning/15 text-warning-ink')}>{o.paid ? t.paid : t.unpaid}</span></td>
                    </tr>
                  )
                })}
                {orders.length === 0 && <tr><td colSpan={10} className="text-default-500 py-6 text-center">{fmt(t.emptyRange, { noun })}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
