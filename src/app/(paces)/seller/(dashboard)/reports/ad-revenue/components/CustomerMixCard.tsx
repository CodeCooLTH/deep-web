'use client'

/**
 * CustomerMixCard — ลูกค้าใหม่ vs เดิม: แท่ง 100% เดียวตามยอด + 3 คอลัมน์ (คน · ฿ · %) (00091 เฟส 3 FR-015)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/charts/apex/bar/components/data.ts → getFullStackedBarChart ผ่าน ApexChart wrapper
 *   แถบสรุป 3 ช่อง: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx (`bg-light/25 border-b border-dashed` · ตัวเลขกลาง)
 * สี: ใหม่ = chart-primary · เดิม = chart-delta · ไม่ทราบ = default-300 (เป็นกลาง) · ไม่ใช้เขียว (ไม่ใช่การยืนยัน)
 * ตัวเลขข้างใต้เป็นเจ้าของ "คน/฿/%" — แท่งไม่ใส่ label ซ้ำ
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { getColor } from '@/utils/helpers'
import InfoTip from './InfoTip'
import { fmtPct, type AdRevenueReport } from './data'

export default function CustomerMixCard({ summary: s, noun }: { summary: AdRevenueReport['summary']; noun: string }) {
  const t = useT().adRevenue
  const total = s.newSales + s.returningSales + s.unknownSales
  const groups = [
    { key: 'new', icon: 'user-plus', label: t.custNew, people: s.newCustomers, sales: s.newSales },
    { key: 'ret', icon: 'users', label: t.custReturning, people: s.returningCustomers, sales: s.returningSales },
    { key: 'unk', icon: 'help-circle', label: t.custUnknown, people: s.unknownCustomers, sales: s.unknownSales, unitOrders: true },
  ]
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 1000) / 10 : null)

  const getOptions = useCallback((): ApexOptions => ({
    chart: { type: 'bar', height: 120, stacked: true, stackType: '100%', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '70%' } },
    stroke: { width: 1, colors: ['transparent'] },
    series: groups.map((g) => ({ name: g.label, data: [g.sales] })),
    xaxis: { categories: [''], labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { show: false } },
    grid: { show: false, padding: { top: -20, bottom: -10, left: 0, right: 0 } },
    colors: [getColor('chart-primary'), getColor('chart-delta'), getColor('default-300')],
    dataLabels: { enabled: false },
    legend: { show: true, position: 'bottom' },
    tooltip: { y: { formatter: (v: number) => formatBaht(v) } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [s, t])

  return (
    <div className="card min-w-0">
      <div className="card-header"><h4 className="card-title">{t.customerMixTitle}</h4><InfoTip text={fmt(t.customerDefinition, { noun })} /></div>
      {/* แถบสรุปตามธีม SalesReport: พื้นจาง เส้นประล่าง ตัวเลขกลาง */}
      <div className="bg-light/25 border-default-300 border-b border-dashed">
        <div className="gap-base grid grid-cols-1 text-center sm:grid-cols-3">
          {groups.map((g) => (
            <div key={g.key} className="min-w-0">
              <p className="text-default-600 mt-5 mb-1.25 flex items-center justify-center gap-1 text-sm">{g.label}{g.unitOrders && <InfoTip text={t.custUnknownTip} />}</p>
              <h4 className="mb-1 flex items-center justify-center text-lg font-semibold tabular-nums">
                <Icon icon={g.icon} className="text-primary me-1.25" aria-hidden="true" />
                {fmt(g.unitOrders ? t.ordersCount : t.peopleCount, { n: formatNumberNoSymbol(g.people) })}
              </h4>
              <p className="text-default-600 mb-4 text-xs tabular-nums">{formatBaht(g.sales)} · {fmtPct(share(g.sales))}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="card-body">
        <div role="img" aria-label={groups.map((g) => `${g.label} ${fmtPct(share(g.sales))}`).join(' · ')} className="min-h-28">
          <ApexChart getOptions={getOptions} type="bar" height={120} />
        </div>
      </div>
    </div>
  )
}
