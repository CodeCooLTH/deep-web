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
  // ค่าใช้จ่าย (feature 00016) — undefined ทั้งชุด = ไม่มีสิทธิ์ดูข้อมูลการเงิน ซ่อนทั้ง series และการ์ด
  const showFinance = summary.totalExpense != null
  const expenseSeries = daily.map((d) => d.expense ?? 0)

  /** ยอดขาย (พื้นที่) + ค่าใช้จ่าย (แท่ง, ถ้ามีสิทธิ์ดู) + จำนวนออเดอร์ (เส้น, แกนขวา) */
  const buildSeries = () => [
    { name: 'ยอดขาย (฿)', type: 'area', data: revenueSeries },
    ...(showFinance ? [{ name: 'ค่าใช้จ่าย (฿)', type: 'column', data: expenseSeries }] : []),
    { name: 'ออเดอร์', type: 'line', data: ordersSeries },
  ]

  const getOptions = useCallback(
    () => ({
      chart: {
        height: 380,
        type: 'line' as const,
        stacked: false,
        toolbar: { show: false },
        zoom: { enabled: false },
      },
      // เส้นหนาเฉพาะ series "ออเดอร์" (ตัวสุดท้าย) — area/column ไม่ต้องมีเส้นขอบ
      stroke: {
        width: showFinance ? [0, 0, 2] : [0, 2],
        curve: 'smooth' as const,
      },
      plotOptions: {
        bar: { columnWidth: '55%' },
      },
      // ค่าใช้จ่ายเป็นแท่งแยกต่างหาก ไม่ stack ทับยอดขาย — คนละความหมาย (เงินเข้า vs เงินออก)
      // ซ้อนกันเมื่อไหร่ผู้ใช้จะอ่านความสูงรวมเป็น "ยอดขาย" ทันที
      colors: showFinance
        ? [getColor('chart-primary'), getColor('chart-beta'), getColor('chart-secondary')]
        : [getColor('chart-primary'), getColor('chart-secondary')],
      series: buildSeries(),
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
        // ค่าใช้จ่ายใช้แกนซ้ายร่วมกับยอดขาย (หน่วยบาทเหมือนกัน) — แกนที่ 3 จะทำให้เทียบความสูงกันไม่ได้
        ...(showFinance
          ? [{ show: false, seriesName: 'ยอดขาย (฿)', labels: { formatter: (val: number) => thbFormatter.format(val) } }]
          : []),
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
          { formatter: (val: number) => thbFormatter.format(val) },
          ...(showFinance ? [{ formatter: (val: number) => thbFormatter.format(val) }] : []),
          { formatter: (val: number) => `${Math.round(val)} ออเดอร์` },
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

  const series = buildSeries()

  return (
    <div>
      {/* Summary strip — 6 ใบเมื่อมีสิทธิ์ดูข้อมูลการเงิน (เพิ่มค่าใช้จ่าย/กำไรสุทธิ) */}
      <div className={`grid grid-cols-2 gap-4 mb-5 ${showFinance ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-4'}`}>
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

        {showFinance && (
          <>
            <div className="rounded-lg bg-danger/10 border border-danger/20 p-4 text-center">
              <p className="text-xs text-default-400 mb-1">ค่าใช้จ่าย</p>
              <p className="text-lg font-bold text-danger-ink">
                ฿
                <CountUp end={summary.totalExpense ?? 0} decimals={0} separator="," duration={1} />
              </p>
            </div>
            <div className="rounded-lg bg-success/10 border border-success/20 p-4 text-center">
              <p className="text-xs text-default-400 mb-1">กำไรสุทธิ</p>
              <p
                className={`text-lg font-bold ${(summary.netProfit ?? 0) >= 0 ? 'text-success-ink' : 'text-danger-ink'}`}
              >
                ฿
                <CountUp end={summary.netProfit ?? 0} decimals={0} separator="," duration={1} />
              </p>
            </div>
          </>
        )}
      </div>

      {showFinance && (
        // ยอดขายนับเฉพาะออเดอร์ที่ยืนยันแล้ว ส่วนค่าใช้จ่ายนับทุกรายการที่บันทึกในวันนั้น —
        // เขียนกำกับไว้ ไม่งั้นผู้ใช้บวกลบเองแล้วได้ไม่ตรงกับตัวเลขที่เราแสดง
        <p className="text-xs text-default-400 mb-4 text-center">
          กำไรสุทธิ = ยอดขายที่ยืนยันแล้ว − ต้นทุนสินค้า − ค่าใช้จ่ายที่บันทึกไว้
        </p>
      )}

      {/* Chart */}
      <ApexChart getOptions={getOptions} series={series} type="line" height={380} />
    </div>
  )
}

export default SalesChart
