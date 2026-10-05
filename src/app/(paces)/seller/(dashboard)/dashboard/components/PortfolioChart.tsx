/**
 * PortfolioChart — กราฟเส้น 2 เส้น (ยอดขายรวม + กำไรสุทธิรวม รายวัน) ของส่วน "ภาพรวมทุกธุรกิจ"
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx (getSalesReportChart)
 *   ผ่าน ApexChart wrapper (HR10) · แกน/tooltip ยึด sales/components/SalesChart.tsx
 *   ตัด: area gradient, เส้นประ, สี chart-secondary(ม่วง)/chart-alpha — สียอดขาย = chart-primary, กำไร = default-700
 *
 * 🛑 ไม่แสดงยอดรวมในกราฟ/legend — ผลรวมกราฟอาจไม่เท่ายอดบนการ์ดสำหรับร้านขายของ (SDS TD-003)
 *    ตัวเลขรวมมีที่แถบสรุปที่เดียว
 */
'use client'

import { useCallback } from 'react'
import ApexChart from '@/components/wrappers/ApexChart'
import { getColor } from '@/utils/helpers'
import { formatBaht, formatBahtCompact } from '@/lib/format-money'
import { formatDate, formatDayMonth } from '@/lib/format-date'

type Props = {
  /** ISO "YYYY-MM-DD" ต่อวัน (ยาวเท่า revenue/netProfit) */
  dates: string[]
  revenue: number[]
  netProfit: number[]
  /** ข้อความอ่านแทนกราฟสำหรับ screen reader */
  ariaLabel: string
}

const PortfolioChart = ({ dates, revenue, netProfit, ariaLabel }: Props) => {
  const series = [
    { name: 'ยอดขายรวม', data: revenue },
    { name: 'กำไรสุทธิรวม', data: netProfit },
  ]

  const getOptions = useCallback(
    () => ({
      series,
      chart: {
        type: 'line' as const,
        height: 260,
        toolbar: { show: false },
        zoom: { enabled: false },
        selection: { enabled: false },
        parentHeightOffset: 0,
        fontFamily: 'inherit',
      },
      stroke: { width: [3, 2], curve: 'smooth' as const },
      // เส้นกำไรใช้ default-700 โดยเจตนา — chart-* ชุดถัดไปเป็นม่วง ซึ่งเป็นสีของฝั่ง buyer (HR7)
      colors: [getColor('chart-primary'), getColor('default-700')],
      // legend ของ Apex ซ่อน — ใช้แถบจุดสี+ชื่อเส้นด้านบนแทน
      legend: { show: false },
      dataLabels: { enabled: false },
      markers: { size: 0 },
      grid: {
        strokeDashArray: 4,
        borderColor: getColor('default-200'),
        xaxis: { lines: { show: false } },
        padding: { top: -8, right: 8, bottom: 0, left: 4 },
      },
      xaxis: {
        categories: dates,
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
        labels: {
          rotate: 0,
          hideOverlappingLabels: true,
          trim: false,
          style: { fontSize: '11px', colors: getColor('default-500') },
          formatter: (v: string) => formatDayMonth(v),
        },
      },
      yaxis: {
        tickAmount: 4,
        forceNiceScale: true,
        labels: {
          style: { fontSize: '11px', colors: getColor('default-500') },
          formatter: (val: number) => formatBahtCompact(val),
        },
      },
      tooltip: {
        shared: true,
        intersect: false,
        x: {
          formatter: (_v: unknown, o?: { dataPointIndex?: number }) => {
            const d = dates[o?.dataPointIndex ?? -1]
            return d ? formatDate(d) : ''
          },
        },
        y: { formatter: (val: number) => formatBaht(val) },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dates, revenue, netProfit],
  )

  return (
    <div role="img" aria-label={ariaLabel}>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-default-700">
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-primary size-2 rounded-full" aria-hidden="true" />
          ยอดขายรวม
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-default-700 size-2 rounded-full" aria-hidden="true" />
          กำไรสุทธิรวม
        </span>
      </div>
      <ApexChart getOptions={getOptions} series={series} type="line" height={260} />
    </div>
  )
}

export default PortfolioChart
