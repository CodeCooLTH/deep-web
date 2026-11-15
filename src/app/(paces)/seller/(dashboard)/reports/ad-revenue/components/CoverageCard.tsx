'use client'

/**
 * CoverageCard — ความครอบคลุม: ออเดอร์ทั้งร้านมาจากไหน (จากแอด · จากแชทแต่ระบุแอดไม่ได้ · ไม่ได้มาจากแชท) + สถานะข้อมูล Meta (00091 เฟส 3 FR-019)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/charts/apex/bar/components/data.ts → getFullStackedBarChart ผ่าน ApexChart wrapper
 *   ตาราง 3 กลุ่ม: theme/paces/Admin/TS/src/app/(admin)/tables/static/components/BasicTable.tsx (`table-wrapper > table > thead.font-semibold`)
 *   สถานะ Meta: theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx ผ่าน reports/ad-quality/components/CardState.tsx
 * 🛑 รวม 3 กลุ่ม = ยอดขายทั้งร้านตาม salesOrderWhere (เจ้าของตัวเลขคือ service) · บรรทัด "ระบุแอดไม่ได้ จะไม่ถูกนับให้แอดใด" บังคับโดย FR-019
 * สี: จากแอด chart-primary · แชทระบุแอดไม่ได้ default-400 · ไม่ได้มาจากแชท default-200
 */
import type { ApexOptions } from 'apexcharts'
import Link from 'next/link'
import { useCallback } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { getColor } from '@/utils/helpers'
import AdSpendNotice, { type NoticeCopy } from '../../ads/components/AdSpendNotice'
import InfoTip from './InfoTip'
import { fmtPct, type AdRevenueReport } from './data'

type Props = { coverage: AdRevenueReport['coverage']; spend: AdRevenueReport['spend']; adsWithoutCampaign: number; campaignsHref: string; noun: string; noticeCopy: NoticeCopy }

export default function CoverageCard({ coverage: c, spend, adsWithoutCampaign, campaignsHref, noun, noticeCopy }: Props) {
  const t = useT().adRevenue
  const totalOrders = c.adOrders + c.chatOrders + c.otherOrders
  const totalSales = c.adSales + c.chatSales + c.otherSales
  const groups = [
    { label: t.covAd, orders: c.adOrders, sales: c.adSales },
    { label: t.covChat, orders: c.chatOrders, sales: c.chatSales },
    { label: t.covOther, orders: c.otherOrders, sales: c.otherSales },
  ]
  const share = (v: number, whole: number) => (whole > 0 ? Math.round((v / whole) * 1000) / 10 : null)

  const getOptions = useCallback((): ApexOptions => ({
    chart: { type: 'bar', height: 190, stacked: true, stackType: '100%', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '60%' } },
    stroke: { width: 1, colors: ['transparent'] },
    series: [
      { name: t.covAd, data: [c.adOrders, c.adSales] },
      { name: t.covChat, data: [c.chatOrders, c.chatSales] },
      { name: t.covOther, data: [c.otherOrders, c.otherSales] },
    ],
    xaxis: { categories: [t.byCount, t.bySales], labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
    colors: [getColor('chart-primary'), getColor('default-400'), getColor('default-200')],
    dataLabels: { enabled: false },
    legend: { show: true, position: 'bottom' },
    grid: { show: false },
    tooltip: { y: { formatter: (v: number, o?: { dataPointIndex: number }) => (o?.dataPointIndex === 1 ? formatBaht(v) : fmt(t.ordersCount, { n: formatNumberNoSymbol(v) })) } },
  }), [c, t])

  return (
    <div className="gap-base grid grid-cols-1">
      <div className="card min-w-0">
        <div className="card-header"><h4 className="card-title">{fmt(t.coverageTitle, { noun })}</h4><InfoTip text={fmt(t.covNote, { noun })} /></div>
        <div className="card-body">
          <div role="img" aria-label={groups.map((g) => `${g.label} ${fmtPct(share(g.orders, totalOrders))}`).join(' · ')} className="min-h-48">
            <ApexChart getOptions={getOptions} type="bar" height={190} />
          </div>
          <div className="table-wrapper mt-3">
            <table className="table">
              <thead className="font-semibold">
                <tr>
                  <th>{t.covGroup}</th>
                  <th className="text-center">{noun}</th>
                  <th className="text-center">%</th>
                  <th className="text-center">{t.colSales}</th>
                  <th className="text-center">%</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.label}>
                    <td>{g.label}</td>
                    <td className="text-center tabular-nums">{formatNumberNoSymbol(g.orders)}</td>
                    <td className="text-center tabular-nums">{fmtPct(share(g.orders, totalOrders))}</td>
                    <td className="text-center tabular-nums">{formatBaht(g.sales)}</td>
                    <td className="text-center tabular-nums">{fmtPct(share(g.sales, totalSales))}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td>{t.covTotal}</td>
                  <td className="text-center tabular-nums">{formatNumberNoSymbol(totalOrders)}</td>
                  <td />
                  <td className="text-center tabular-nums">{formatBaht(totalSales)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* สถานะ Meta: ไม่ OK = AdSpendNotice ตัวเดียวกับแท็บอื่น (หัวข้อ + ปุ่ม) · OK = แถบ alert สีเขียวท่า ui/alerts */}
      {spend.state === 'OK' ? (
        <div className="bg-success/15 text-success-ink flex flex-wrap items-center gap-x-3 gap-y-1 rounded px-4 py-3" role="status">
          <Icon icon="plug-connected" className="shrink-0 text-xl" aria-hidden="true" />
          <span className="text-sm font-semibold">{t.metaOk}</span>
          {spend.accountName && <span className="min-w-0 truncate text-sm" title={spend.accountName}>{spend.accountName}</span>}
          {adsWithoutCampaign > 0 && (
            <Link href={campaignsHref} className="text-primary ms-auto inline-flex min-h-11 items-center gap-1 text-sm lg:min-h-0">
              {fmt(t.adsNoCampaign, { n: adsWithoutCampaign })}
              <Icon icon="chevron-right" className="text-base" aria-hidden="true" />
            </Link>
          )}
        </div>
      ) : (
        <AdSpendNotice ads={{ state: spend.state, currency: spend.currency }} noun={noun} copy={noticeCopy} />
      )}
    </div>
  )
}
