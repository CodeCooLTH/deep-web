/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(reports)/sales/components/SalesChart.tsx
 *
 * Re-sourced S15 (Phase B): ใช้ ApexChart wrapper (src/components/wrappers/ApexChart.tsx) เหมือน theme.
 * series ทั้งหมดมาจาก real DailyRow[] ที่ RSC คำนวณ — ไม่มี demo [320,402,...] จาก theme data.ts.
 * Currency: ฿ THB. Date label: th-TH (format ที่ RSC boundary ก่อนส่งมา).
 * PDPA: ข้อมูลเป็น aggregate ตามวัน ไม่มี buyer PII ใด ๆ.
 */
'use client'

import ApexChart from '@/components/wrappers/ApexChart'
import { CountUp } from '@/components/wrappers/CountUp'
import { getColor } from '@/utils/helpers'
import { useCallback } from 'react'
import type { DailyRow, SummaryData } from './data'

type Props = {
  daily: DailyRow[]
  summary: SummaryData
}

const thbFormatter = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 })

const SalesChart = ({ daily, summary }: Props) => {
  const categories = daily.map((d) => d.label)
  const revenueSeries = daily.map((d) => d.revenue)
  const ordersSeries = daily.map((d) => d.orders)

  const getOptions = useCallback(
    () => ({
      chart: {
        height: 380,
        type: 'line' as const,
        stacked: false,
        toolbar: { show: false },
        zoom: { enabled: false },
      },
      stroke: {
        width: [0, 2],
        curve: 'smooth' as const,
      },
      plotOptions: {
        bar: { columnWidth: '55%' },
      },
      colors: [getColor('chart-primary'), getColor('chart-secondary')],
      series: [
        {
          name: 'ยอดขาย (฿)',
          type: 'area',
          data: revenueSeries,
        },
        {
          name: 'ออเดอร์',
          type: 'line',
          data: ordersSeries,
        },
      ],
      fill: {
        type: ['gradient', 'solid'],
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.45,
          opacityTo: 0.05,
        },
      },
      xaxis: {
        categories,
        labels: {
          rotate: -45,
          rotateAlways: categories.length > 14,
          style: { fontSize: '11px' },
        },
      },
      yaxis: [
        {
          title: {
            text: 'ยอดขาย (฿)',
            style: { fontSize: '11px', fontWeight: 600 },
          },
          labels: {
            formatter: (val: number) => thbFormatter.format(val),
          },
        },
        {
          opposite: true,
          title: {
            text: 'จำนวนออเดอร์',
            style: { fontSize: '11px', fontWeight: 600 },
          },
          labels: {
            formatter: (val: number) => Math.round(val).toString(),
          },
        },
      ],
      tooltip: {
        shared: true,
        intersect: false,
        y: [
          {
            formatter: (val: number) => thbFormatter.format(val),
          },
          {
            formatter: (val: number) => `${Math.round(val)} ออเดอร์`,
          },
        ],
      },
      legend: {
        show: true,
        position: 'top' as const,
        horizontalAlign: 'right' as const,
      },
      grid: { strokeDashArray: 4 },
      dataLabels: { enabled: false },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daily],
  )

  const series = [
    { name: 'ยอดขาย (฿)', type: 'area', data: revenueSeries },
    { name: 'ออเดอร์', type: 'line', data: ordersSeries },
  ]

  return (
    <div>
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <div className="rounded-lg bg-light/50 p-4 text-center">
          <p className="text-xs text-default-400 mb-1">ยอดขายรวม</p>
          <p className="text-lg font-bold text-dark">
            ฿
            <CountUp end={summary.totalRevenue} decimals={0} separator="," duration={1} />
          </p>
        </div>
        <div className="rounded-lg bg-light/50 p-4 text-center">
          <p className="text-xs text-default-400 mb-1">ออเดอร์ทั้งหมด</p>
          <p className="text-lg font-bold text-dark">
            <CountUp end={summary.totalOrders} decimals={0} separator="," duration={1} />
          </p>
        </div>
        <div className="rounded-lg bg-light/50 p-4 text-center">
          <p className="text-xs text-default-400 mb-1">สำเร็จ</p>
          <p className="text-lg font-bold text-success">
            <CountUp end={summary.totalCompleted} decimals={0} separator="," duration={1} />
          </p>
        </div>
        <div className="rounded-lg bg-light/50 p-4 text-center">
          <p className="text-xs text-default-400 mb-1">เฉลี่ย/ออเดอร์</p>
          <p className="text-lg font-bold text-dark">
            ฿
            <CountUp end={summary.avgOrderValue} decimals={0} separator="," duration={1} />
          </p>
        </div>
      </div>

      {/* Chart */}
      <ApexChart getOptions={getOptions} series={series} type="line" height={380} />
    </div>
  )
}

export default SalesChart
