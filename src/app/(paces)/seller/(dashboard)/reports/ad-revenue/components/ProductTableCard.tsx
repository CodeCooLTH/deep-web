'use client'

/**
 * ProductTableCard — สินค้าขายดีจากแอด: ใบ · ชิ้น · ยอด · ราคาเฉลี่ย · % ยกเลิก (00091 เฟส 3 FR-014)
 *
 * Base: src/app/(paces)/seller/(dashboard)/reports/products/components/ProductSalesTable.tsx (ผ่าน ReportTable.tsx)
 *   (ซึ่ง Base เป็น theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AnalyticsOverview.tsx) · ป้าย: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx
 * 🛑 ป้าย "ก่อนหักส่วนลดท้ายบิล" อยู่ที่หัวการ์ดครั้งเดียว (ไม่ซ้ำทุกแถว) · รายการพิมพ์เอง (ไม่มี productId) ไม่มีรูป → ไทล์ package
 */
import Icon from '@/components/wrappers/Icon'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import ReportTable, { type Col } from './ReportTable'
import { fmtPct, type AdRevenueReport } from './data'

type P = AdRevenueReport['products'][number]

export default function ProductTableCard({ products, noun }: { products: P[]; noun: string }) {
  const t = useT().adRevenue
  const columns: Col<P>[] = [
    {
      id: 'name', header: t.colProduct, sort: (p) => p.name,
      cell: (p) => (
        <>
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt="" className="size-8 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="bg-default-100 text-default-700 flex size-8 shrink-0 items-center justify-center rounded-md"><Icon icon="package" className="text-base" aria-hidden="true" /></span>
          )}
          <span className="min-w-0">
            <span className="text-default-900 block truncate text-sm font-medium" title={p.name}>{p.name}</span>
            {p.sku && <span className="text-default-500 text-2xs block break-all">{p.sku}</span>}
          </span>
        </>
      ),
    },
    { id: 'orders', header: noun, align: 'end', sort: (p) => p.orders, cell: (p) => formatNumberNoSymbol(p.orders) },
    { id: 'units', header: t.colUnits, align: 'end', sort: (p) => p.units, cell: (p) => formatNumberNoSymbol(p.units) },
    { id: 'sales', header: t.colSales, align: 'end', sort: (p) => p.sales, cell: (p) => formatBaht(p.sales) },
    { id: 'avg', header: t.colAvgPrice, align: 'end', sort: (p) => (p.units > 0 ? p.sales / p.units : null), cell: (p) => (p.units > 0 ? formatBaht(p.sales / p.units) : '—') },
    { id: 'lost', header: t.colLostPct, align: 'end', sort: (p) => p.lostRatePct, cell: (p) => fmtPct(p.lostRatePct) },
  ]
  return (
    <ReportTable<P>
      title={t.productsTitle}
      badge={<span className="badge bg-info/15 text-info-ink">{t.beforeBillDiscount}</span>}
      rows={products}
      rowKey={(p) => p.key}
      columns={columns}
      matches={(p, q) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)}
      defaultSort={{ id: 'sales', desc: true }}
      empty={t.emptyProducts}
      itemsName={t.itemsProduct}
    />
  )
}
