'use client'

/**
 * CampaignTableCard — แท็บแคมเปญ: แคมเปญ ⊕ → ชุดโฆษณา ⊕ → โฆษณา (child-rows) + ส่งออก CSV แบบแบน (00091 เฟส 3 FR-012)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/tables/datatables/child-rows/components/Table.tsx
 *   (ไอคอน ⊕/⊖ วงกลม text-primary) — แถวลูกเป็นแถวในตารางเดียวกัน คอลัมน์เดียวกัน เยื้องชื่อตามชั้น (ไม่ใช่ตารางซ้อน · user 2026-11-16 "ดูยาก")
 *   ตัวตาราง: ReportTable → src/components/table/DataTable.tsx (tanstack getSubRows + getExpandedRowModel)
 *   แถบเครื่องมือ/แบ่งหน้า/แถวรวม: ReportTable.tsx (Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx)
 *   ธีมใช้ DataTables.net + HTML string — ที่นี่ทำด้วย React state เพราะแถวลูกต้องกดเปิด AdOrdersSheet ได้และ HTML string ใส่ handler ไม่ได้
 * 🛑 ไม่มี drill ผ่าน URL/crumb แล้ว (มติ user) · กดชื่อแคมเปญ/ชุด = กาง · กดชื่อโฆษณา = AdOrdersSheet · ไม่ทราบแคมเปญ = แถวแม่ท้ายตารางเสมอ กางแล้วเป็นโฆษณาตรง ๆ
 * 🛑 Meta ไม่ OK/ไม่มีลำดับชั้น → ตารางโฆษณาแบน (ไม่มี ⊕) ห้ามมีตารางแถวเดียว "ไม่ทราบแคมเปญ"
 * 🛑 แถวรวม = ผลรวมแถวแม่ทุกแถว (ไม่ใช่เฉพาะหน้า/ผลค้นหา) · CSV = แคมเปญ+ชุด+โฆษณาแบบแบน ไม่ว่ากางอยู่หรือไม่
 */
import { useMemo, useState } from 'react'

import AdThumb from '@/components/safepay/AdThumb'
import Icon from '@/components/wrappers/Icon'
import { adDisplayName } from '@/lib/ad-attribution'
import { roas } from '@/lib/ad-report-view'
import { contribution, groupAds, placedOf, type GroupRow } from '@/lib/ad-revenue-view'
import { formatBaht, formatBahtCompact, formatNumberNoSymbol } from '@/lib/format-money'
import { pacesToast } from '@/lib/paces-toast'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'
import AdOrdersSheet from '../../ads/components/AdOrdersSheet'
import { fmtRoas } from '../../ads/components/data'
import ReportTable, { type Col } from './ReportTable'
import { fmtPct, spendIsOk, UNKNOWN_ID, type AdMetrics, type SpendInfo } from './data'

type Kind = 'campaign' | 'adset' | 'ad'
/** parent = รหัสแคมเปญของแถวชุดโฆษณา (ไว้หาโฆษณาลูก) */
type Row = GroupRow & { kind: Kind; ad: AdMetrics | null; key: string; parent: string | null }

const rowOfAd = (a: AdMetrics): Row => ({
  kind: 'ad', ad: a, key: `ad|${a.adId}`, parent: null, id: a.adId, name: a.adTitle, ads: 1, chats: a.chats, orders: a.orders, sales: a.sales, collected: a.collected,
  lost: a.status.CANCELLED + a.status.RETURNED, placed: placedOf(a.status), spend: a.spend, profitBeforeAds: a.profitBeforeAds, incompleteProfitOrders: a.incompleteProfitOrders,
})
const rowOfGroup = (g: GroupRow, kind: Kind, parent: string | null = null): Row => ({ ...g, kind, ad: null, parent, key: `${kind}|${parent ?? ''}|${g.id ?? UNKNOWN_ID}` })
const sumRows = (rows: Row[]) => rows.reduce((s, r) => ({
  orders: s.orders + r.orders, sales: s.sales + r.sales, collected: s.collected + r.collected, lost: s.lost + r.lost, placed: s.placed + r.placed,
  spend: r.spend === null ? s.spend : (s.spend ?? 0) + r.spend, profit: s.profit + r.profitBeforeAds, incomplete: s.incomplete + r.incompleteProfitOrders,
}), { orders: 0, sales: 0, collected: 0, lost: 0, placed: 0, spend: null as number | null, profit: 0, incomplete: 0 })

// CSV: ค่าที่ขึ้นต้นด้วย = + - @ ถูก Excel ตีเป็นสูตร → นำหน้าด้วย ' (ชื่อแคมเปญมาจากภายนอก)
const csvCell = (v: string | number | null) => {
  if (v === null) return ''
  const s = String(v)
  const safe = /^[=+\-@]/.test(s) && typeof v === 'string' ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

export default function CampaignTableCard({ ads, spend, noun, rangeQuery, rangeLabel }: { ads: AdMetrics[]; spend: SpendInfo; noun: string; rangeQuery: string; rangeLabel: string }) {
  const t = useT()
  const a = t.adRevenue
  const [sheet, setSheet] = useState<AdMetrics | null>(null)
  const showSpend = spendIsOk(spend)
  const hasHierarchy = showSpend && ads.some((x) => x.campaignId)

  const nameOf = (r: Row): string => {
    if (r.kind === 'ad') return adDisplayName(r.ad!.adTitle, r.ad!.adId, t.inbox.contextBar.adIdFallback) ?? r.id ?? ''
    if (r.id === null) return r.kind === 'campaign' ? a.unknownCampaign : a.unknownAdset
    return r.name ?? r.id
  }
  // ในตารางปัดเป็นบาทเต็มให้ความกว้างหลักเท่ากัน (CSV คงทศนิยม 2 ตำแหน่ง)
  const baht = (v: number) => (v >= 1_000_000 ? <span title={formatBaht(v)}>{formatBahtCompact(v)}</span> : formatBaht(Math.round(v)))
  const dash = <>—<span className="sr-only">{a.noSpendSr}</span></>
  const lostPct = (r: { lost: number; placed: number }) => (r.placed > 0 ? Math.round((r.lost / r.placed) * 1000) / 10 : null)
  const roasOf = (r: { sales: number; spend: number | null }) => roas(r.sales, r.spend)
  const profitOf = (r: Row) => (r.spend === null ? null : contribution(r.profitBeforeAds, r.spend).value)

  const { topRows, childRowsOf } = useMemo(() => {
    const bySales = (x: Row, y: Row) => y.sales - x.sales
    const adRows = (list: AdMetrics[]) => list.map(rowOfAd).sort(bySales)
    const childRowsOf = (r: Row): Row[] | null => {
      if (r.kind === 'ad') return null
      if (r.kind === 'campaign') {
        const inCamp = ads.filter((x) => (x.campaignId ?? UNKNOWN_ID) === (r.id ?? UNKNOWN_ID))
        // ไม่ทราบแคมเปญ → ไม่มีชั้นชุดโฆษณา ลงโฆษณาตรง ๆ
        return r.id === null ? adRows(inCamp) : groupAds(inCamp, 'adset').map((g) => rowOfGroup(g, 'adset', r.id))
      }
      return adRows(ads.filter((x) => (x.campaignId ?? UNKNOWN_ID) === (r.parent ?? UNKNOWN_ID) && (x.adsetId ?? UNKNOWN_ID) === (r.id ?? UNKNOWN_ID)))
    }
    const topRows = hasHierarchy ? groupAds(ads, 'campaign').map((g) => rowOfGroup(g, 'campaign')) : ads.map(rowOfAd)
    return { topRows, childRowsOf }
  }, [ads, hasHierarchy])

  const nameCell = (r: Row) => (
    <>
      {r.kind === 'ad' && <AdThumb photoFileId={r.ad!.adPhotoFileId} className="size-8 rounded-md" iconClass="text-base" />}
      {r.id === null && r.kind !== 'ad' && <Icon icon="help-circle" className="text-default-500 shrink-0 text-lg" aria-hidden="true" />}
      {/* รหัสอยู่ใน title (ไม่ขึ้นบรรทัดรอง) */}
      <span className={cn('block min-w-0 max-w-48 truncate text-sm lg:max-w-xs xl:max-w-md', r.id === null ? 'text-default-700' : 'text-default-900 font-medium')} title={r.id && nameOf(r) !== r.id ? `${nameOf(r)} · ${r.id}` : nameOf(r)}>{nameOf(r)}</span>
    </>
  )

  const columns: Col<Row>[] = [
    { id: 'name', header: a.colName, sort: (r) => (r.id === null ? null : nameOf(r)), cell: nameCell },
    ...(showSpend ? [{ id: 'spend', header: a.colSpend, align: 'end' as const, sort: (r: Row) => r.spend, cell: (r: Row) => (r.spend === null ? dash : baht(r.spend)) }] : []),
    { id: 'orders', header: noun, align: 'end', sort: (r) => r.orders, cell: (r) => formatNumberNoSymbol(r.orders) },
    { id: 'sales', header: a.colSales, align: 'end', sort: (r) => r.sales, cell: (r) => baht(r.sales) },
    { id: 'collected', header: a.collected, align: 'end', sort: (r) => r.collected, cell: (r) => baht(r.collected) },
    ...(showSpend ? [
      { id: 'roas', header: a.colRoas, align: 'end' as const, sort: (r: Row) => roasOf(r), cell: (r: Row) => { const v = roasOf(r); return v === null ? dash : fmtRoas(v) } },
      {
        id: 'profit', header: a.sumProfit, align: 'end' as const, sort: (r: Row) => profitOf(r),
        cell: (r: Row) => {
          const v = profitOf(r)
          if (v === null) return dash
          return (
            <span className="block">
              <span className={v < 0 ? 'text-danger-ink' : undefined}>{v < 0 ? '−' : ''}{baht(Math.abs(v))}</span>
              {r.incompleteProfitOrders > 0 && <span className="text-warning-ink text-2xs block">{fmt(a.costIncompleteShort, { n: r.incompleteProfitOrders })}</span>}
            </span>
          )
        },
      },
    ] : []),
    { id: 'avg', header: a.sumAvg, align: 'end', xlOnly: true, sort: (r) => (r.orders > 0 ? r.sales / r.orders : null), cell: (r) => (r.orders > 0 ? baht(r.sales / r.orders) : '—') },
    { id: 'lost', header: a.colLostPct, align: 'end', xlOnly: true, sort: (r) => lostPct(r), cell: (r) => fmtPct(lostPct(r)) },
  ]

  const tot = sumRows(topRows)
  const totRoas = roas(tot.sales, tot.spend)
  const totProfit = tot.spend === null ? null : contribution(tot.profit, tot.spend).value
  const footer = (
    <tr className="bg-default-100/70 font-semibold">
      <td className="text-default-900 text-sm">{fmt(hasHierarchy ? a.totalAllCampaigns : a.totalRow, { n: topRows.length })}</td>
      {showSpend && <td className="text-end tabular-nums whitespace-nowrap">{tot.spend === null ? dash : baht(tot.spend)}</td>}
      <td className="text-end tabular-nums whitespace-nowrap">{formatNumberNoSymbol(tot.orders)}</td>
      <td className="text-end tabular-nums whitespace-nowrap">{baht(tot.sales)}</td>
      <td className="text-end tabular-nums whitespace-nowrap">{baht(tot.collected)}</td>
      {showSpend && <td className="text-end tabular-nums whitespace-nowrap">{totRoas === null ? dash : fmtRoas(totRoas)}</td>}
      {showSpend && <td className="text-end tabular-nums whitespace-nowrap">{totProfit === null ? dash : `${totProfit < 0 ? '−' : ''}${formatBaht(Math.round(Math.abs(totProfit)))}`}</td>}
      <td className="text-end tabular-nums whitespace-nowrap max-xl:hidden">{tot.orders > 0 ? baht(tot.sales / tot.orders) : '—'}</td>
      <td className="text-end tabular-nums whitespace-nowrap max-xl:hidden">{fmtPct(lostPct(tot))}</td>
    </tr>
  )

  const exportCsv = () => {
    try {
      const num = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100)
      const head = [a.campaignsTitle, a.adsetsTitle, a.adsTitle, a.colSpend, noun, a.colSales, a.collected, a.colRoas, a.sumProfit, a.sumAvg, a.colLostPct]
      const lines = [head.map(csvCell).join(',')]
      for (const x of [...ads].sort((p, q) => q.sales - p.sales)) {
        const r = rowOfAd(x)
        const camp = hasHierarchy ? (x.campaignId ? x.campaignName ?? x.campaignId : a.unknownCampaign) : ''
        const set = hasHierarchy ? (x.adsetId ? x.adsetName ?? x.adsetId : a.unknownAdset) : ''
        lines.push([camp, set, nameOf(r), num(r.spend), r.orders, num(r.sales), num(r.collected), num(roasOf(r)), num(profitOf(r)), r.orders > 0 ? num(r.sales / r.orders) : null, lostPct(r)].map((v) => csvCell(v as string | number | null)).join(','))
      }
      // BOM ให้ Excel อ่านภาษาไทยถูก
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const el = document.createElement('a')
      el.href = url
      el.download = `deep-ad-revenue-${rangeLabel}.csv`
      el.click()
      URL.revokeObjectURL(url)
      pacesToast.success(a.exportDone)
    } catch {
      pacesToast.error(a.exportFailed)
    }
  }

  return (
    <>
      <ReportTable<Row>
        title={hasHierarchy ? a.campaignsTitle : a.allAds}
        action={
          <button type="button" onClick={exportCsv} className="btn bg-primary hover:bg-primary-hover min-h-11 text-white lg:min-h-0">
            <Icon icon="download" className="text-sm" aria-hidden="true" />
            {a.exportCsv}
          </button>
        }
        rows={topRows}
        rowKey={(r) => r.key}
        columns={columns}
        footer={footer}
        striped
        matches={(r, q) => nameOf(r).toLowerCase().includes(q) || (r.id ?? '').toLowerCase().includes(q)}
        defaultSort={{ id: 'sales', desc: true }}
        pinnedLast={(r) => r.id === null && r.kind !== 'ad'}
        onOpen={(r) => setSheet(r.ad)}
        subRows={hasHierarchy ? (r) => childRowsOf(r) ?? undefined : undefined}
        empty={fmt(a.emptyRange, { noun })}
        itemsName={a.itemsName}
      />
      {sheet && <AdOrdersSheet row={sheet} noun={noun} rangeQuery={rangeQuery} onClose={() => setSheet(null)} />}
    </>
  )
}

