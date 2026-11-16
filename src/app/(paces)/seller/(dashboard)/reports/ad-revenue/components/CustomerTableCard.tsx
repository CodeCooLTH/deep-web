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
  const unknownSales = (a: Ad) => Math.round((a.sales - a.newSales - a.returningSales) * 100) / 100
  const acq = (a: Ad) => (a.spend !== null && a.spend > 0 && a.newCustomers > 0 ? a.spend / a.newCustomers : null)
  const people = (n: number, sales: number, orders = false) => (
    // บรรทัดเดียว: จำนวนเด่น · ยอดเป็นข้อมูลรองสีจาง (user 2026-11-16: แถวต้องอ่านได้ในแวบเดียว ไม่กองหลายบรรทัด)
    <span className="whitespace-nowrap"><span className="text-default-900 font-medium">{fmt(orders ? t.ordersCount : t.peopleCount, { n: formatNumberNoSymbol(n) })}</span><span className="text-default-500 text-xs"> · {formatBaht(sales)}</span></span>
  )

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
    { id: 'new', header: t.custNew, align: 'end', sort: (a) => a.newCustomers, cell: (a) => people(a.newCustomers, a.newSales) },
    { id: 'ret', header: t.custReturning, align: 'end', sort: (a) => a.returningCustomers, cell: (a) => people(a.returningCustomers, a.returningSales) },
    { id: 'unk', header: t.custUnknown, align: 'end', sort: (a) => a.unknownCustomers, cell: (a) => people(a.unknownCustomers, unknownSales(a), true) },
    ...(spendOk ? [{ id: 'acq', header: t.colAcqCost, align: 'end' as const, sort: (a: Ad) => acq(a), cell: (a: Ad) => { const v = acq(a); return v === null ? '—' : formatBaht(v) } }] : []),
  ]

  return (
    <ReportTable<Ad>
      title={t.customerTableTitle}
      badge={<InfoTip text={t.custUnknownTip} />}
      rows={rows}
      rowKey={(a) => a.adId}
      columns={columns}
      matches={(a, q) => nameOf(a).toLowerCase().includes(q) || a.adId.toLowerCase().includes(q)}
      defaultSort={{ id: 'new', desc: true }}
      empty={fmt(t.emptyRange, { noun })}
      itemsName={t.itemsName}
    />
  )
}
