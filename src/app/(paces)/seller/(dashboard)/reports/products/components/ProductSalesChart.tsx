'use client'

/**
 * ProductSalesChart — กราฟเส้นยอดขายรายวันของสินค้าที่เลือก (feature 00062)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx
 *   (chart type 'line' + `stroke.curve: 'smooth'` + `grid.strokeDashArray: 7` +
 *    `colors: [getColor('chart-*')]` + โครง legend/tooltip ชุดเดียวกัน)
 *   ผ่าน `@/components/wrappers/ApexChart` ตาม Hard Rule 10 — ห้าม import react-apexcharts ตรง
 * Base (annotation แถบเทาของวันที่ยังไม่ถึง):
 *   theme/paces/Admin/TS/src/app/(admin)/charts/apex/line/components/data.ts
 *
 * ต่างจาก AgentTrendChart: ที่นั่นทุกเส้นคนละหน่วยจึงต้องมี 4 แกน — **ที่นี่ทุกเส้นหน่วยเดียวกัน**
 * (จำนวนชิ้น หรือ บาท อย่างใดอย่างหนึ่งทั้งกราฟ) จึงเหลือแกนเดียว
 */
import type { ApexOptions } from 'apexcharts'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { CHART_COLOR_TOKENS } from '@/lib/product-sales-month'
import { getColor } from '@/utils/helpers'
import type { SalesUnit } from './data'

export type ChartSeries = { key: string; name: string; data: number[] }

type Props = {
  series: ChartSeries[]
  unit: SalesUnit
  /** ดัชนีวันแรกที่ยังมาไม่ถึง (0-based) — null = เดือนนี้จบแล้ว ไม่ต้องเทาอะไร */
  futureFrom: number | null
  days: number
  height?: number
  /** true = โหมดเส้นเดียวในชีตมือถือ (ไม่ต้องมี legend) */
  compact?: boolean
}

export default function ProductSalesChart({
  series,
  unit,
  futureFrom,
  days,
  height = 340,
  compact = false,
}: Props) {
  /** ป้ายแกน x = เลขวันที่ล้วน — ทั้งกราฟอยู่ในเดือนเดียว เดือน/ปีจึงไม่ต้องซ้ำ 31 ครั้ง */
  const labels = Array.from({ length: days }, (_, i) => String(i + 1))

  const fmt = (v: number) => (unit === 'baht' ? formatBaht(v) : formatNumberNoSymbol(v))

  const getOptions = (): ApexOptions => ({
    chart: { type: 'line', height, toolbar: { show: false }, offsetX: 0 },
    stroke: { width: 2, curve: 'smooth' },
    colors: CHART_COLOR_TOKENS.map((t) => getColor(t)),
    grid: { strokeDashArray: 7 },
    dataLabels: { enabled: false },
    markers: { size: 0 },
    xaxis: {
      categories: labels,
      axisBorder: { show: false },
      labels: {
        offsetY: 2,
        /**
         * 31 ป้ายชนกันแน่นอนบนความกว้างจริง — โชว์ทุก 5 วัน + วันสุดท้ายเสมอ
         * (แพตเทิร์นเดียวกับ `sales-chart-axis.ts` ที่หน้า dashboard ใช้ด้วยเหตุผลเดียวกัน)
         */
        formatter: (value: string) => {
          const n = Number(value)
          if (!Number.isFinite(n)) return value
          return n === 1 || n === days || n % 5 === 0 ? value : ''
        },
      },
    },
    yaxis: {
      min: 0,
      tickAmount: 4,
      axisBorder: { show: false },
      labels: {
        offsetX: -6,
        formatter: (v: number) => formatNumberNoSymbol(Math.round(v)),
      },
    },
    legend: compact
      ? { show: false }
      : { position: 'bottom', horizontalAlign: 'left', itemMargin: { horizontal: 8, vertical: 4 } },
    annotations:
      futureFrom !== null && futureFrom < days
        ? {
            xaxis: [
              {
                /**
                 * 🛑 แถบเทาคลุมวันที่ยังมาไม่ถึง — ถ้าไม่มี หางกราฟจะแบนติดพื้นถึงสิ้นเดือน
                 * แล้วอ่านเป็น "ยอดร่วง" ทั้งที่แปลว่า "ยังไม่ถึงวันนั้น"
                 * (docs/conventions/partial-data-must-be-labeled-or-filled.md)
                 */
                x: labels[futureFrom],
                x2: labels[days - 1],
                fillColor: getColor('default-200'),
                opacity: 0.45,
                label: {
                  text: 'ยังไม่ถึง',
                  position: 'top',
                  orientation: 'horizontal',
                  style: { fontSize: '10px', color: getColor('default-500'), background: 'transparent' },
                },
              },
            ],
          }
        : undefined,
    tooltip: {
      shared: true,
      intersect: false,
      x: { formatter: (v: number) => `วันที่ ${v}` },
      y: {
        formatter: (v: number) => (v === null || v === undefined ? '—' : fmt(v)),
      },
    },
    series: series.map((s) => ({ name: s.name, type: 'line', data: s.data })),
  })

  if (series.length === 0) {
    return (
      <p className="text-default-500 flex items-center justify-center gap-2 py-16 text-sm">
        <Icon icon="chart-line" className="text-base" aria-hidden="true" />
        เลือกสินค้าจากตารางด้านล่างเพื่อดูแนวโน้ม
      </p>
    )
  }

  return (
    <ApexChart
      type="line"
      height={height}
      // 🛑 ส่ง `key` ให้ React ทิ้ง instance เดิมเมื่อชุดเส้นเปลี่ยน — ApexCharts จำ series เดิมไว้
      // แล้ว animation ของเส้นที่ถูกถอดออกจะค้างเป็นเงา
      key={`${unit}-${series.map((s) => s.key).join('|')}`}
      getOptions={getOptions}
    />
  )
}
