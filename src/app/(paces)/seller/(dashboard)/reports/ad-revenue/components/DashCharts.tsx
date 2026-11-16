'use client'

/**
 * DashCharts — กราฟของหน้า analytics dashboard (00091 · ม็อกอัพอนุมัติ 2026-11-16) ผ่าน ApexChart wrapper + getColor('chart-*') (HR10)
 *
 * Donut: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/StorePerformance.tsx (size 75% · stroke 0 · total กลางวง) ผ่านท่า reports/ads/components/AdDonutCard.tsx
 * Columns: theme/paces/Admin/TS/src/app/(admin)/charts/apex/column/components/data.ts (basic column · columnWidth 55% · borderRadius)
 * StackedBars: theme/paces/Admin/TS/src/app/(admin)/charts/apex/bar/components/data.ts (getStackedBarChart แนวนอน)
 * 🛑 ห้ามคีย์ค่า undefined ใน options (ApexCharts พัง) · กราฟทุกตัวมี role="img" + aria-label สรุปค่า
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import { formatBaht, formatBahtCompact, formatNumberNoSymbol } from '@/lib/format-money'
import { getColor } from '@/utils/helpers'

const money = (v: number) => formatBaht(v)
const count = (v: number) => formatNumberNoSymbol(Math.round(v))

/** color = ชื่อโทเคน เช่น chart-primary หรือ default-300 (แปลงเป็นสีใน getOptions ฝั่ง client — getColor อ่าน CSS var) · alpha = ความทึบ */
export type Slice = { label: string; value: number; color: string; alpha?: number }

export function DonutChart({ slices, center, centerValue, isMoney = true, height = 260, ariaLabel }: { slices: Slice[]; center: string; centerValue: string; isMoney?: boolean; height?: number; ariaLabel: string }) {
  const getOptions = useCallback((): ApexOptions => ({
    chart: { type: 'donut', height },
    series: slices.map((s) => s.value),
    labels: slices.map((s) => s.label),
    colors: slices.map((s) => getColor(s.color, s.alpha ?? 1)),
    legend: { show: true, position: 'bottom' },
    stroke: { width: 0 },
    dataLabels: { enabled: false },
    plotOptions: { pie: { donut: { size: '72%', labels: { show: true, value: { show: true, formatter: (v: string) => (isMoney ? money(Number(v)) : count(Number(v))) }, total: { show: true, showAlways: true, label: center, formatter: () => centerValue } } } } },
    tooltip: { y: { formatter: (v: number) => (isMoney ? money(v) : count(v)) } },
  }), [slices, center, centerValue, isMoney, height])
  return (
    <div role="img" aria-label={ariaLabel} className="min-h-64">
      <ApexChart getOptions={getOptions} type="donut" height={height} />
    </div>
  )
}

/** color = ชื่อโทเคน (ดู Slice) */
export type Series = { name: string; data: number[]; color: string }

/** คอลัมน์กลุ่ม (ค่าโฆษณา/ยอดขาย/รับเงิน รายแคมเปญ) หรือคอลัมน์เดี่ยว (รายช่วงเวลา) */
export function Columns({ categories, series, height = 300, isMoney = true, ariaLabel, dimColor = false }: { categories: string[]; series: Series[]; height?: number; isMoney?: boolean; ariaLabel: string; /** คอลัมน์เดี่ยว: แท่งสูงสุดทึบ แท่งอื่นจาง */ dimColor?: boolean }) {
  const getOptions = useCallback((): ApexOptions => {
    const single = series.length === 1
    const max = single ? Math.max(...series[0].data) : 0
    return {
      chart: { type: 'bar', height, toolbar: { show: false } },
      plotOptions: { bar: { horizontal: false, columnWidth: single ? '60%' : '55%', borderRadius: 2, distributed: single && dimColor } },
      series: series.map((s) => ({ name: s.name, data: s.data })),
      // คอลัมน์เดี่ยว + dimColor: แท่งสูงสุดสีเข้ม แท่งอื่นจาง (บอกช่วงขายดีด้วยความสูง + สี ไม่ใช่สีอย่างเดียว)
      colors: single && dimColor ? series[0].data.map((v) => (v === max && max > 0 ? getColor(series[0].color) : getColor(series[0].color, 0.45))) : series.map((s) => getColor(s.color)),
      xaxis: { categories, labels: { rotate: 0, hideOverlappingLabels: true, trim: true }, axisBorder: { show: false } },
      yaxis: { min: 0, tickAmount: 4, labels: { formatter: (v: number) => (isMoney ? formatBahtCompact(v) : count(v)) } },
      grid: { strokeDashArray: 7 },
      legend: { show: !single, position: 'bottom' },
      dataLabels: { enabled: false },
      tooltip: { shared: true, intersect: false, y: { formatter: (v: number) => (isMoney ? money(v) : count(v)) } },
    }
  }, [categories, series, height, isMoney, dimColor])
  return (
    <div role="img" aria-label={ariaLabel} className="min-h-72">
      <ApexChart getOptions={getOptions} type="bar" height={height} />
    </div>
  )
}

/** แท่งซ้อนแนวนอน (ลูกค้าใหม่/เดิม/ไม่ทราบ รายโฆษณา) */
export function StackedBars({ categories, series, height = 300, ariaLabel, unit }: { categories: string[]; series: Series[]; height?: number; ariaLabel: string; unit: (v: number) => string }) {
  const getOptions = useCallback((): ApexOptions => ({
    chart: { type: 'bar', height, stacked: true, toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '60%', borderRadius: 2 } },
    series: series.map((s) => ({ name: s.name, data: s.data })),
    colors: series.map((s) => getColor(s.color)),
    xaxis: { categories, labels: { formatter: (v: string) => count(Number(v)) } },
    yaxis: { labels: { maxWidth: 180 } },
    grid: { strokeDashArray: 7 },
    legend: { show: true, position: 'top', horizontalAlign: 'left' },
    dataLabels: { enabled: false },
    tooltip: { shared: true, intersect: false, y: { formatter: unit } },
  }), [categories, series, height, unit])
  return (
    <div role="img" aria-label={ariaLabel} className="min-h-72">
      <ApexChart getOptions={getOptions} type="bar" height={height} />
    </div>
  )
}
