'use client'

/**
 * CustomerTableCard — รายแอด: ลูกค้าใหม่/เดิม/ไม่ทราบ + ต้นทุนได้ลูกค้าใหม่ (00091 เฟส 3 FR-015)
 *
 * Base: src/app/(paces)/seller/(dashboard)/reports/ads/components/AdTableCard.tsx (ผ่าน ReportTable.tsx)
 *   (ซึ่ง Base เป็น theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AnalyticsOverview.tsx)
 * 🛑 ต้นทุนได้ลูกค้าใหม่ = ค่าโฆษณา ÷ ลูกค้าใหม่ — ซ่อนทั้งคอลัมน์เมื่อ Meta ไม่ OK · แอดไม่มีค่าโฆษณา/ไม่มีลูกค้าใหม่ = "—"
 */
import AdThumb from '@/components/safepay/AdThumb'
import { adDisplayName } from '@/lib/ad-attribution'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import InfoTip from './InfoTip'
import ReportTable, { type Col } from './ReportTable'
import type { AdMetrics } from './data'

type Ad = Pick<AdMetrics, 'adId' | 'adTitle' | 'adPhotoFileId' | 'orders' | 'newCustomers' | 'returningCustomers' | 'unknownCustomers' | 'newSales' | 'returningSales' | 'sales' | 'spend'>

export default function CustomerTableCard({ ads, spendOk, noun }: { ads: Ad[]; spendOk: boolean; noun: string }) {
  const tt = useT()
  const t = tt.adRevenue
  const rows = ads.filter((a) => a.orders > 0)
  const nameOf = (a: Ad) => adDisplayName(a.adTitle, a.adId, tt.inbox.contextBar.adIdFallback) ?? a.adId
  const acq = (a: Ad) => (a.spend !== null && a.spend > 0 && a.newCustomers > 0 ? a.spend / a.newCustomers : null)
  const d = t.dash
  const n0 = (n: number) => formatNumberNoSymbol(n)
  // จำนวนเด่นเป็นตัวเลขล้วน หน่วยอยู่ที่หัวคอลัมน์ (user 2026-11-16 redesign: "N คน · ฿X" ทุกช่องอ่านเทียบแถวยาก)
  const count = (n: number) => (n > 0 ? <b className="text-default-900 font-semibold">{n0(n)}</b> : <span className="text-default-400">0</span>)
  const showUnknown = rows.some((a) => a.unknownCustomers > 0)
  const total = (a: Ad) => a.newCustomers + a.returningCustomers + a.unknownCustomers

  /** แถบ 100% ใหม่/เดิม/ไม่ทราบ — Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalSubscriber.tsx (แถบ h-1.25 rounded) ต่อเป็นสามช่วง
   *  ความกว้างเป็น style (ค่ารายแถว) ตามท่าธีม · ค่าอ่านจาก title + sr-only ไม่พึ่งสีอย่างเดียว */
  const mix = (a: Ad) => {
    const n = total(a)
    const w = (v: number) => (n > 0 ? `${(v / n) * 100}%` : '0%')
    const label = fmt(d.mixAria, { a: n0(a.newCustomers), b: n0(a.returningCustomers), c: n0(a.unknownCustomers) })
    return (
      <span className="ms-auto flex w-28 items-center gap-2 xl:w-40" title={label}>
        <span className="bg-default-100 flex h-2 flex-1 overflow-hidden rounded" aria-hidden="true">
          <span className="bg-primary h-full" style={{ width: w(a.newCustomers) }} />
          <span className="bg-info h-full" style={{ width: w(a.returningCustomers) }} />
          <span className="bg-default-300 h-full" style={{ width: w(a.unknownCustomers) }} />
        </span>
        <span className="text-default-700 w-11 text-xs">{n > 0 ? `${Math.round((a.newCustomers / n) * 100)}%` : '—'}</span>
        <span className="sr-only">{label}</span>
      </span>
    )
  }

  const columns: Col<Ad>[] = [
    {
      id: 'ad', header: t.colAd, sort: (a) => nameOf(a),
      cell: (a) => (
        <>
          <AdThumb photoFileId={a.adPhotoFileId} className="size-8 rounded-md" iconClass="text-base" />
          <span className="text-default-900 min-w-0 truncate text-sm font-medium" title={nameOf(a)}>{nameOf(a)}</span>
        </>
      ),
    },
    // % ลูกค้าใหม่ของโฆษณานั้น (เรียงได้) — ช่องนี้กินที่ว่างระหว่างชื่อกับตัวเลขแทนช่องโล่ง
    { id: 'mix', header: d.colMix, align: 'end', sort: (a) => (total(a) > 0 ? a.newCustomers / total(a) : null), cell: mix },
    { id: 'new', header: `${t.custNew} (${t.peopleUnit})`, align: 'end', sort: (a) => a.newCustomers, cell: (a) => count(a.newCustomers) },
    { id: 'ret', header: `${t.custReturning} (${t.peopleUnit})`, align: 'end', sort: (a) => a.returningCustomers, cell: (a) => count(a.returningCustomers) },
    ...(showUnknown ? [{ id: 'unk', header: `${t.custUnknown} (${t.unit})`, align: 'end' as const, xlOnly: true, sort: (a: Ad) => a.unknownCustomers, cell: (a: Ad) => count(a.unknownCustomers) }] : []),
    { id: 'newSales', header: d.colNewSales, align: 'end', xlOnly: true, sort: (a) => a.newSales, cell: (a) => formatBaht(Math.round(a.newSales)) },
    { id: 'retSales', header: d.colRetSales, align: 'end', xlOnly: true, sort: (a) => a.returningSales, cell: (a) => formatBaht(Math.round(a.returningSales)) },
    ...(spendOk ? [{ id: 'acq', header: t.colAcqCost, align: 'end' as const, sort: (a: Ad) => acq(a), cell: (a: Ad) => { const v = acq(a); return v === null ? '—' : <b className="text-default-900 font-semibold">{formatBaht(Math.round(v))}</b> } }] : []),
  ]

  const sum = (k: 'newCustomers' | 'returningCustomers' | 'unknownCustomers' | 'newSales' | 'returningSales') => rows.reduce((n, a) => n + a[k], 0)
  const newAll = sum('newCustomers')
  const allN = newAll + sum('returningCustomers') + sum('unknownCustomers')
  const footer = (
    <tr className="bg-default-100/70 font-semibold">
      <td className="text-default-900 text-sm">{fmt(t.totalRow, { n: rows.length })}</td>
      <td className="text-end tabular-nums whitespace-nowrap">{allN > 0 ? `${Math.round((newAll / allN) * 100)}%` : '—'}</td>
      <td className="text-end tabular-nums whitespace-nowrap">{n0(newAll)}</td>
      <td className="text-end tabular-nums whitespace-nowrap">{n0(sum('returningCustomers'))}</td>
      {showUnknown && <td className="text-end tabular-nums whitespace-nowrap max-xl:hidden">{n0(sum('unknownCustomers'))}</td>}
      <td className="text-end tabular-nums whitespace-nowrap max-xl:hidden">{formatBaht(Math.round(sum('newSales')))}</td>
      <td className="text-end tabular-nums whitespace-nowrap max-xl:hidden">{formatBaht(Math.round(sum('returningSales')))}</td>
      {/* ต้นทุนรวมอยู่ที่การ์ด KPI (ค่าโฆษณาทั้งหมด ÷ ลูกค้าใหม่) — แถวรวมตารางนับเฉพาะโฆษณาที่มีใบ จึงไม่คิดซ้ำให้ตัวเลขไม่ตรงกัน */}
      {spendOk && <td />}
    </tr>
  )

  return (
    <ReportTable<Ad>
      title={t.customerTableTitle}
      badge={<InfoTip text={t.custUnknownTip} />}
      rows={rows}
      rowKey={(a) => a.adId}
      columns={columns}
      footer={footer}
      matches={(a, q) => nameOf(a).toLowerCase().includes(q) || a.adId.toLowerCase().includes(q)}
      defaultSort={{ id: 'new', desc: true }}
      empty={fmt(t.emptyRange, { noun })}
      itemsName={t.itemsName}
    />
  )
}
