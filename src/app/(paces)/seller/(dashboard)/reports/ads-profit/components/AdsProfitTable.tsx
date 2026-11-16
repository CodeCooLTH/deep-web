'use client'

/**
 * AdsProfitTable — ตารางกำไร-ขาดทุนรายโฆษณา ส่วนหลักของหน้า (00096 BRD FR-005..FR-008)
 *
 * Base: src/app/(paces)/seller/(dashboard)/reports/ad-revenue/components/ReportTable.tsx (ซึ่ง Base เป็น
 *   theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx + dashboard/analytics/components/AnalyticsOverview.tsx)
 *   ปุ่มกลุ่มคอลัมน์/กรองกำไร = segmented ท่าเดียวกับปุ่มช่วงวันที่ (outline · aria-pressed) — ไม่ใช้ checkbox native (มติ user)
 * 🛑 แถวรวม = ทุกแถวที่ผ่านตัวกรองกำไร/ขาดทุน (ไม่ใช่เฉพาะหน้า) · ค่าโฆษณา null นับ 0 ในยอดรวมแต่แสดง "—" ในแถว
 * 🛑 สถานะมีทั้งข้อความและไอคอน (ไม่พึ่งสีอย่างเดียว) · กดชื่อโฆษณา = หน้ารายละเอียด
 */
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import AdThumb from '@/components/safepay/AdThumb'
import Icon from '@/components/wrappers/Icon'
import { adDisplayName } from '@/lib/ad-attribution'
import { formatNumberNoSymbol } from '@/lib/format-money'
import { pacesToast } from '@/lib/paces-toast'
import type { ProfitStatus } from '@/lib/ads-profit'
import type { AdProfitRow, AdsProfitReport, ProfitMode } from '@/services/ads-profit.service'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'
import { fmtRoas } from '../../ads/components/data'
import ReportTable, { type Col } from '../../ad-revenue/components/ReportTable'
import InfoTip from '../../ad-revenue/components/InfoTip'
import { money, Signed } from './AdsProfitKpis'

type Group = 'profit' | 'ads' | 'quality'
type Filter = 'all' | 'profit' | 'loss'
const STATUS_UI: Record<ProfitStatus, { icon: string; cls: string }> = {
  PROFIT: { icon: 'trending-up', cls: 'bg-success/15 text-success-ink' },
  LOSS: { icon: 'trending-down', cls: 'bg-danger/15 text-danger-ink' },
  BREAKEVEN: { icon: 'equal', cls: 'bg-light text-default-700' },
  LOW_DATA: { icon: 'hourglass', cls: 'bg-light text-default-700' },
  NO_SPEND: { icon: 'help-circle', cls: 'bg-light text-default-700' },
  INCOMPLETE: { icon: 'alert-triangle', cls: 'bg-warning/15 text-warning-ink' },
}
const csvCell = (v: string | number | null) => {
  if (v === null) return ''
  const s = String(v)
  return `"${(/^[=+\-@]/.test(s) && typeof v === 'string' ? `'${s}` : s).replace(/"/g, '""')}"`
}
const pct = (a: number | null, b: number | null) => (a === null || b === null || b <= 0 ? null : Math.round((a / b) * 1000) / 10)

export default function AdsProfitTable({ report, mode, noun, detailQuery, rangeLabel }: { report: AdsProfitReport; mode: ProfitMode; noun: string; detailQuery: string; rangeLabel: string }) {
  const tt = useT()
  const t = tt.adsProfit
  const router = useRouter()
  const [groups, setGroups] = useState<Set<Group>>(new Set())
  const [filter, setFilter] = useState<Filter>('all')
  const nameOf = (r: AdProfitRow) => adDisplayName(r.adTitle, r.adId, tt.inbox.contextBar.adIdFallback) ?? r.adId

  const rows = useMemo(() => report.rows.filter((r) => {
    const v = r.metrics[mode].profitAfter
    return filter === 'all' || (filter === 'profit' ? v !== null && v > 0 : v !== null && v < 0)
  }), [report.rows, mode, filter])

  const n0 = (v: number | null) => (v === null ? '—' : formatNumberNoSymbol(Math.round(v)))
  const cols: Col<AdProfitRow>[] = [
    {
      id: 'ad', header: t.colAd, sort: (r) => nameOf(r),
      cell: (r) => (
        <>
          <AdThumb photoFileId={r.adPhotoFileId} className="size-8 rounded-md" iconClass="text-base" />
          <span className="min-w-0">
            <span className="text-default-900 block truncate text-sm font-medium" title={nameOf(r)}>{nameOf(r)}</span>
            {(r.campaignName || r.adsetName) && <span className="text-default-500 text-2xs block truncate">{[r.campaignName, r.adsetName].filter(Boolean).join(' › ')}</span>}
          </span>
        </>
      ),
    },
    { id: 'spend', header: t.colSpend, align: 'end', sort: (r) => r.spend, cell: (r) => money(r.spend) },
    { id: 'orders', header: fmt(t.colOrders, { noun }), align: 'end', sort: (r) => r.parts[mode].orders, cell: (r) => formatNumberNoSymbol(r.parts[mode].orders) },
    { id: 'revenue', header: t.colRevenue, align: 'end', sort: (r) => r.parts[mode].revenue, cell: (r) => money(r.parts[mode].revenue) },
    { id: 'cpo', header: fmt(t.colCpo, { noun }), align: 'end', xlOnly: true, sort: (r) => r.metrics[mode].costPerOrder, cell: (r) => money(r.metrics[mode].costPerOrder) },
    { id: 'ppo', header: fmt(t.colPpo, { noun }), align: 'end', xlOnly: true, sort: (r) => r.metrics[mode].profitPerOrder, cell: (r) => <Signed v={r.metrics[mode].profitPerOrder} /> },
    { id: 'profit', header: t.colProfit, align: 'end', sort: (r) => r.metrics[mode].profitAfter, cell: (r) => <b className="font-bold"><Signed v={r.metrics[mode].profitAfter} /></b> },
    { id: 'roas', header: t.colRoas, align: 'end', sort: (r) => r.metrics[mode].roas, cell: (r) => (r.metrics[mode].roas === null ? '—' : fmtRoas(r.metrics[mode].roas!)) },
    ...(groups.has('profit') ? [
      { id: 'cogs', header: t.colCogs, align: 'end' as const, sort: (r: AdProfitRow) => r.parts[mode].cogs, cell: (r: AdProfitRow) => money(r.parts[mode].cogs) },
      { id: 'variable', header: t.colVariable, align: 'end' as const, sort: (r: AdProfitRow) => r.parts[mode].variable, cell: (r: AdProfitRow) => money(r.parts[mode].variable) },
      { id: 'before', header: t.colProfitBefore, align: 'end' as const, sort: (r: AdProfitRow) => r.metrics[mode].profitBefore, cell: (r: AdProfitRow) => <Signed v={r.metrics[mode].profitBefore} /> },
      { id: 'margin', header: t.colMargin, align: 'end' as const, sort: (r: AdProfitRow) => r.metrics[mode].margin, cell: (r: AdProfitRow) => (r.metrics[mode].margin === null ? '—' : `${r.metrics[mode].margin!.toFixed(1)}%`) },
      { id: 'ship', header: t.colShipping, align: 'end' as const, sort: (r: AdProfitRow) => r.shippingInfo, cell: (r: AdProfitRow) => <span className="text-default-500">{money(r.shippingInfo)}</span> },
    ] : []),
    ...(groups.has('ads') ? [
      {
        id: 'adStatus', header: t.colAdStatus, align: 'end' as const, sort: (r: AdProfitRow) => r.adStatus,
        cell: (r: AdProfitRow) => (r.adStatus ? <span className={cn('badge py-0.5 text-xs', r.adStatus === 'ACTIVE' ? 'bg-success/15 text-success-ink' : 'bg-light text-default-700')}>{(t.adStatus as Record<string, string>)[r.adStatus] ?? r.adStatus}</span> : '—'),
      },
      { id: 'reach', header: t.colReach, align: 'end' as const, sort: (r: AdProfitRow) => r.reach, cell: (r: AdProfitRow) => n0(r.reach) },
      { id: 'freq', header: t.colFreq, align: 'end' as const, sort: (r: AdProfitRow) => r.frequency, cell: (r: AdProfitRow) => (r.frequency === null ? '—' : r.frequency.toFixed(2)) },
      { id: 'impr', header: t.colImpr, align: 'end' as const, sort: (r: AdProfitRow) => r.impressions, cell: (r: AdProfitRow) => n0(r.impressions) },
      { id: 'clicks', header: t.colClicks, align: 'end' as const, sort: (r: AdProfitRow) => r.clicks, cell: (r: AdProfitRow) => n0(r.clicks) },
      { id: 'ctr', header: t.colCtr, align: 'end' as const, sort: (r: AdProfitRow) => pct(r.clicks, r.impressions), cell: (r: AdProfitRow) => { const v = pct(r.clicks, r.impressions); return v === null ? '—' : `${v.toFixed(1)}%` } },
      { id: 'cpc', header: t.colCpc, align: 'end' as const, sort: (r: AdProfitRow) => (r.spend !== null && r.clicks ? r.spend / r.clicks : null), cell: (r: AdProfitRow) => (r.spend !== null && r.clicks ? `฿${(r.spend / r.clicks).toFixed(2)}` : '—') },
      { id: 'cpm', header: t.colCpm, align: 'end' as const, sort: (r: AdProfitRow) => (r.spend !== null && r.impressions ? (r.spend / r.impressions) * 1000 : null), cell: (r: AdProfitRow) => (r.spend !== null && r.impressions ? `฿${((r.spend / r.impressions) * 1000).toFixed(2)}` : '—') },
      { id: 'chats', header: t.colChats, align: 'end' as const, sort: (r: AdProfitRow) => r.chatsMeta, cell: (r: AdProfitRow) => n0(r.chatsMeta) },
      { id: 'cpchat', header: t.colCostPerChat, align: 'end' as const, sort: (r: AdProfitRow) => (r.spend !== null && r.chatsMeta ? r.spend / r.chatsMeta : null), cell: (r: AdProfitRow) => (r.spend !== null && r.chatsMeta ? `฿${(r.spend / r.chatsMeta).toFixed(2)}` : '—') },
    ] : []),
    ...(groups.has('quality') ? [
      { id: 'cancel', header: t.colCancelled, align: 'end' as const, sort: (r: AdProfitRow) => r.cancelled, cell: (r: AdProfitRow) => formatNumberNoSymbol(r.cancelled) },
      { id: 'return', header: t.colReturned, align: 'end' as const, sort: (r: AdProfitRow) => r.returned, cell: (r: AdProfitRow) => formatNumberNoSymbol(r.returned) },
      { id: 'collected', header: t.colCollected, align: 'end' as const, sort: (r: AdProfitRow) => r.collected, cell: (r: AdProfitRow) => money(r.collected) },
    ] : []),
    {
      id: 'status', header: t.colStatus, align: 'end', sort: (r) => r.status[mode],
      cell: (r) => { const s = STATUS_UI[r.status[mode]]; return <span className={cn('badge gap-1 py-0.5 text-xs', s.cls)}><Icon icon={s.icon} className="text-sm" aria-hidden="true" />{t.status[r.status[mode]]}</span> },
    },
  ]

  // แถวรวม — ผ่านสูตรเดียวกับรายงาน (ใช้ totals ของ service เมื่อไม่กรอง ไม่งั้นรวมจากแถว)
  const sum = (f: (r: AdProfitRow) => number | null) => rows.reduce((n, r) => n + (f(r) ?? 0), 0)
  const spendAll = rows.some((r) => r.spend !== null) ? sum((r) => r.spend) : null
  const ordersAll = sum((r) => r.parts[mode].orders)
  const revAll = sum((r) => r.parts[mode].revenue)
  const afterAll = sum((r) => r.metrics[mode].profitAfter ?? r.metrics[mode].profitBefore)
  const td = 'text-end tabular-nums whitespace-nowrap'
  const extra = (g: Group, n: number) => (groups.has(g) ? Array.from({ length: n }, (_, i) => <td key={`${g}${i}`} />) : null)
  const footer = (
    <tr className="bg-default-100/70 font-semibold">
      <td className="text-default-900 text-sm">{fmt(t.totalRow, { n: rows.length })}</td>
      <td className={td}>{money(spendAll)}</td>
      <td className={td}>{formatNumberNoSymbol(ordersAll)}</td>
      <td className={td}>{money(revAll)}</td>
      {/* ต้นทุน/กำไรต่อใบซ่อนบนแท็บเล็ต (xlOnly) ให้คอลัมน์หลักพอดีจอ 768 */}
      <td className={`${td} max-xl:hidden`}>{spendAll !== null && ordersAll > 0 ? money(spendAll / ordersAll) : '—'}</td>
      <td className={`${td} max-xl:hidden`}><Signed v={ordersAll > 0 ? afterAll / ordersAll : null} /></td>
      <td className={td}><Signed v={afterAll} /></td>
      <td className={td}>{spendAll ? fmtRoas(revAll / spendAll) : '—'}</td>
      {extra('profit', 5)}{extra('ads', 10)}{extra('quality', 3)}
      <td />
    </tr>
  )

  const toggle = (g: Group) => setGroups((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n })
  const seg = (on: boolean, i: number, last: boolean) => cn('btn btn-sm border-default-300 min-h-11 border lg:min-h-0', i > 0 && '-ms-px', i === 0 && !last && 'rounded-e-none', i > 0 && !last && 'rounded-none', last && i > 0 && 'rounded-s-none',
    on ? 'bg-primary border-primary relative z-10 text-white' : 'bg-card text-default-700 hover:bg-light')

  const exportCsv = () => {
    try {
      const head = [t.colAd, 'Ad ID', t.colSpend, fmt(t.colOrders, { noun }), t.colRevenue, t.colCogs, t.colVariable, t.colProfitBefore, t.colProfit, fmt(t.colPpo, { noun }), fmt(t.colCpo, { noun }), t.colRoas, t.colMargin, t.colStatus]
      const lines = [head.map(csvCell).join(',')]
      for (const r of rows) {
        const m = r.metrics[mode], p = r.parts[mode]
        lines.push([nameOf(r), r.adId, r.spend, p.orders, p.revenue, p.cogs, p.variable, m.profitBefore, m.profitAfter, m.profitPerOrder, m.costPerOrder, m.roas, m.margin, t.status[r.status[mode]]].map((v) => csvCell(v as string | number | null)).join(','))
      }
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }) // BOM ให้ Excel อ่านไทยถูก
      const url = URL.createObjectURL(blob)
      const el = document.createElement('a')
      el.href = url
      el.download = `ads-profit-${rangeLabel}.csv`
      el.click()
      URL.revokeObjectURL(url)
      pacesToast.success(tt.adRevenue.exportDone)
    } catch {
      pacesToast.error(tt.adRevenue.exportFailed)
    }
  }

  const GROUPS: [Group, string][] = [['profit', t.groupProfit], ['ads', t.groupAds], ['quality', fmt(t.groupQuality, { noun })]]
  const FILTERS: [Filter, string][] = [['all', t.filterAll], ['profit', t.filterProfit], ['loss', t.filterLoss]]

  return (
    <ReportTable<AdProfitRow>
      title={t.tableTitle}
      badge={<InfoTip text={t.variableTip} />}
      action={
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex" role="group" aria-label={t.filterAll}>
            {FILTERS.map(([k, l], i) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={seg(filter === k, i, i === FILTERS.length - 1)}>{l}</button>)}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="text-default-700 text-sm">{t.groupsLabel}</span>
            <span className="inline-flex" role="group" aria-label={t.groupsLabel}>
              {GROUPS.map(([k, l], i) => <button key={k} type="button" aria-pressed={groups.has(k)} onClick={() => toggle(k)} className={seg(groups.has(k), i, i === GROUPS.length - 1)}>{l}</button>)}
            </span>
          </span>
          <button type="button" onClick={exportCsv} className="btn bg-primary hover:bg-primary-hover min-h-11 text-white lg:min-h-0">
            <Icon icon="download" className="text-sm" aria-hidden="true" />{tt.adRevenue.exportCsv}
          </button>
        </div>
      }
      rows={rows}
      rowKey={(r) => r.adId}
      columns={cols}
      footer={footer}
      matches={(r, q) => nameOf(r).toLowerCase().includes(q) || r.adId.includes(q) || (r.campaignName ?? '').toLowerCase().includes(q)}
      defaultSort={{ id: 'profit', desc: false }}
      onOpen={(r) => router.push(`/reports/ads-profit/${encodeURIComponent(r.adId)}?${detailQuery}`)}
      empty={fmt(t.emptyRange, { noun })}
      itemsName={tt.adRevenue.itemsName}
    />
  )
}
