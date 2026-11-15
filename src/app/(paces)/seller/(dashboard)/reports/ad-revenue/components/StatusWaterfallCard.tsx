'use client'

/**
 * StatusWaterfallCard — "จากยอดสั่งถึงเงินที่ได้รับ": ยอดสั่ง → หักยกเลิก → หักตีกลับ/คืน → ยังไม่รับเงิน → รับเงินแล้ว (00091 เฟส 3 FR-013)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/charts/apex/column/components/data.ts → getRangeColumnCharts (rangeBar แท่งลอย)
 *   ผ่าน ApexChart wrapper · โครงการ์ดตาม reports/ads/components/DailyOverviewCard.tsx
 * 🛑 ธีมไม่มี waterfall ตรง ๆ → ใช้ rangeBar (มติ Controller Q2) · plotOptions.bar.distributed สีรายแท่ง
 * สี: ยอดสั่ง chart-primary · ยกเลิก chart-beta จาง · ตีกลับ chart-beta · ยังไม่รับเงิน chart-gamma · รับเงินแล้ว chart-alpha (ไม่ใช้ chart-secondary = ม่วง buyer)
 * 🛑 ห้ามคีย์ค่า undefined ใน options (บทเรียน 00078) · getOptions ห่อ useCallback
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import type { Waterfall } from '@/lib/ad-revenue-view'
import { formatBaht, formatBahtCompact } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { getColor } from '@/utils/helpers'
import InfoTip from './InfoTip'

export default function StatusWaterfallCard({ waterfall: w }: { waterfall: Waterfall }) {
  const t = useT().adRevenue
  const bars = [
    { label: t.wfGross, from: 0, to: w.gross },
    { label: t.wfCancelled, from: w.gross - w.cancelled, to: w.gross },
    { label: t.wfReturned, from: w.open, to: w.gross - w.cancelled },
    { label: t.notCollected, from: w.collected, to: w.open },
    { label: t.collected, from: 0, to: w.collected },
  ].map((b) => ({ ...b, amount: Math.round((b.to - b.from) * 100) / 100 }))

  const getOptions = useCallback((): ApexOptions => ({
    chart: { type: 'rangeBar', height: 300, toolbar: { show: false } },
    plotOptions: { bar: { horizontal: false, distributed: true, columnWidth: '65%', dataLabels: { position: 'top' } } },
    dataLabels: { enabled: true, offsetY: -14, style: { fontSize: '12px', colors: [getColor('default-800')] }, formatter: (_v: unknown, o?: { dataPointIndex: number }) => formatBahtCompact(bars[o?.dataPointIndex ?? 0]?.amount ?? 0) },
    legend: { show: false },
    colors: [getColor('chart-primary'), getColor('chart-beta', 0.55), getColor('chart-beta'), getColor('chart-gamma'), getColor('chart-alpha')],
    series: [{ name: t.wfSeries, data: bars.map((b) => ({ x: b.label, y: [b.from, b.to] })) }],
    xaxis: { axisBorder: { show: false } },
    yaxis: { min: 0, max: Math.max(1, Math.ceil(w.gross * 1.12)), tickAmount: 4, labels: { offsetX: -10, formatter: (v: number) => formatBahtCompact(v) } },
    grid: { strokeDashArray: 7 },
    tooltip: {
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        const b = bars[dataPointIndex]
        return `<div class="px-3 py-2 text-sm">${b.label}: <b>${formatBaht(b.amount)}</b></div>`
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [w, t.wfSeries, t.wfGross, t.wfCancelled, t.wfReturned, t.notCollected, t.collected])

  return (
    <div className="card h-full min-w-0">
      <div className="card-header"><h4 className="card-title">{t.waterfallTitle}</h4><InfoTip text={t.includesLostNote} /></div>
      <div className="card-body">
        <div role="img" aria-label={fmt(t.waterfallAria, { gross: formatBaht(w.gross), collected: formatBaht(w.collected) })} className="min-h-72">
          <ApexChart getOptions={getOptions} type="rangeBar" height={300} />
        </div>
      </div>
    </div>
  )
}
