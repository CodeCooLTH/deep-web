'use client'

/**
 * ProductsTab — แท็บสินค้าแบบ analytics dashboard (00091 · ม็อกอัพอนุมัติ 2026-11-16)
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx (KPI → 5/7 → ตาราง)
 *   สินค้าขายดี: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TopTrafficSources.tsx (รูป + ชื่อ + แถบ) ผ่าน SegBar
 * KPI: สินค้าที่ขาย (top 50 จาก service) · ยอดขายสินค้า (ก่อนหักส่วนลดท้ายบิล) · สินค้าเด่น % · ราคาเฉลี่ยต่อชิ้น
 * 🛑 ผลรวมสินค้า ≠ ยอดขายจากโฆษณา (ก่อนหักส่วนลดท้ายบิล) — จึงแยกชื่อ "ยอดขายสินค้า" + ⓘ
 */
import Icon from '@/components/wrappers/Icon'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import AdProductHeatmap from './AdProductHeatmap'
import { DashCard, KpiGrid, kpiBg, SegBar, type KpiSpec } from './DashBits'
import ProductTableCard from './ProductTableCard'
import { fmtPct, type AdLite, type AdRevenueReport } from './data'

export default function ProductsTab({ report, matrixAds, noun }: { report: AdRevenueReport; matrixAds: AdLite[]; noun: string }) {
  const t = useT().adRevenue
  const d = t.dash
  const products = report.products
  const units = products.reduce((n, p) => n + p.units, 0)
  const sales = products.reduce((n, p) => n + p.sales, 0)
  const top = [...products].sort((a, b) => b.sales - a.sales)
  const lead = top[0]

  const kpis: KpiSpec[] = [
    { key: 'count', title: d.productsSold, icon: 'package', iconBg: kpiBg(0), value: fmt(d.productsCount, { n: formatNumberNoSymbol(products.length) }), sub: fmt(d.unitsCount, { n: formatNumberNoSymbol(units) }) },
    { key: 'sales', title: d.productSales, icon: 'cash', iconBg: kpiBg(1), value: formatBaht(sales), sub: d.productSalesSub },
    { key: 'lead', title: d.topProduct, icon: 'star', iconBg: kpiBg(2), value: lead && sales > 0 ? fmtPct(Math.round((lead.sales / sales) * 1000) / 10) : '—', sub: lead?.name },
    { key: 'avg', title: d.avgUnitPrice, icon: 'tag', iconBg: kpiBg(3), value: units > 0 ? formatBaht(sales / units) : '—' },
  ]
  const top5 = top.slice(0, 5)
  const max = top5[0]?.sales ?? 0

  return (
    <>
      <KpiGrid items={kpis} />
      <div className="gap-base mb-base grid grid-cols-1 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-5">
          <DashCard title={d.topProducts} tip={t.beforeBillDiscount}>
            {top5.length === 0 ? <p className="text-default-500 mb-0 py-6 text-center text-sm">{t.emptyProducts}</p> : (
              <div className="flex flex-col gap-4">
                {top5.map((p) => (
                  <div key={p.key} className="flex items-center gap-3">
                    {p.image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.image} alt="" loading="lazy" className="bg-default-100 size-10 shrink-0 rounded-md object-cover" />
                      : <span className="bg-default-100 text-default-500 flex size-10 shrink-0 items-center justify-center rounded-md" aria-hidden="true"><Icon icon="package" className="text-lg" /></span>}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-default-900 min-w-0 truncate font-medium" title={p.name}>{p.name}</span>
                        <b className="text-default-900 font-bold tabular-nums">{formatBaht(p.sales)}</b>
                      </div>
                      <SegBar pct={max > 0 ? (p.sales / max) * 100 : 0} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DashCard>
        </div>
        <div className="min-w-0 xl:col-span-7">
          <AdProductHeatmap matrix={report.matrix} products={products} ads={matrixAds} />
        </div>
      </div>
      <ProductTableCard products={products} noun={noun} />
    </>
  )
}
