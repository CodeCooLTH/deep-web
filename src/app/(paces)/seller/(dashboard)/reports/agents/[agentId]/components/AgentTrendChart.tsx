'use client'

/**
 * AgentTrendChart — แนวโน้มรายวันของแอดมินหนึ่งคน (feature 00059)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx
 *   (chart type 'line' + series ผสม area/line + `stroke.dashArray` + `grid.strokeDashArray: 7`
 *    + `colors: [getColor('chart-*')]` + `tooltip`/`legend` ชุดเดียวกัน)
 *   ผ่าน `@/components/wrappers/ApexChart` ตาม Hard Rule 10 — ห้าม import react-apexcharts ตรง
 *
 * ต่างจากธีม: ตัด `yaxis.max: 100` ที่ตายตัวออก (ธีมเป็น demo data ที่รู้เพดานล่วงหน้า
 * ของเรามีทั้งจำนวนแชทและวินาที ซึ่งสเกลต่างกันคนละหลัก) และแยกเป็น 2 แกน
 */
import { useState } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { getColor } from '@/utils/helpers'
import { formatBaht } from '@/lib/format-money'
import { formatResponseDuration } from '@/lib/agent-performance'
import type { ApexOptions } from 'apexcharts'

export type TrendPoint = {
  day: string
  conversations: number
  responseAvgSec: number | null
  orders: number
  conversionRatePct: number | null
  revenue: number
}

/**
 * มุมมองของกราฟ — 1 กราฟ 1 คำถาม ไม่ยัด 5 เส้นลงแกนเดียว
 *
 * 🛑 ตัวเลข 5 ชนิดในโจทย์อยู่คนละหน่วยกันหมด (ใบ · วินาที · เปอร์เซ็นต์ · บาท)
 * วาดรวมแกนเดียวจะได้เส้นแบนติดพื้น 3 เส้นเสมอ ซึ่งอ่านไม่ได้และไม่ได้แปลว่าค่าน้อย
 */
const VIEWS = [
  { key: 'work', label: 'ปริมาณงาน' },
  { key: 'speed', label: 'ความเร็วตอบ' },
  { key: 'sales', label: 'การขาย' },
] as const
type ViewKey = (typeof VIEWS)[number]['key']

export default function AgentTrendChart({
  points,
  canSeeRevenue,
}: {
  points: TrendPoint[]
  canSeeRevenue: boolean
}) {
  const [view, setView] = useState<ViewKey>('work')

  /** ป้ายแกน x — "18 ส.ค." สั้นพอไม่ทับกันเมื่อช่วงยาว (ปีไม่ต้องมี ทั้งกราฟอยู่ในช่วงเดียว) */
  const labels = points.map((p) => {
    const [, m, d] = p.day.split('-')
    return `${Number(d)}/${Number(m)}`
  })

  const hasAny = points.some(
    (p) => p.conversations > 0 || p.orders > 0 || p.revenue > 0 || p.responseAvgSec !== null,
  )

  const getOptions = (): ApexOptions => {
    const base: ApexOptions = {
      chart: { type: 'line', height: 320, toolbar: { show: false }, offsetX: 0 },
      stroke: { width: [3, 2], curve: 'smooth', dashArray: [0, 6] },
      grid: { strokeDashArray: 7 },
      dataLabels: { enabled: false },
      markers: { size: 0 },
      xaxis: { categories: labels, axisBorder: { show: false }, labels: { offsetY: 2 } },
      legend: { position: 'top', horizontalAlign: 'right' },
    }

    if (view === 'speed') {
      return {
        ...base,
        colors: [getColor('chart-delta')],
        stroke: { width: [3], curve: 'smooth' },
        series: [
          {
            name: 'ตอบเฉลี่ย',
            type: 'line',
            // 🛑 null ต้องเป็นช่องว่างบนกราฟ ไม่ใช่ 0 — วันที่ไม่มีใครทักเข้ามาไม่ใช่
            // "วันที่ตอบเร็ว 0 วินาที" (Apex เว้นช่องให้เองเมื่อค่าเป็น null)
            data: points.map((p) => p.responseAvgSec),
          },
        ],
        yaxis: {
          tickAmount: 4,
          min: 0,
          labels: { formatter: (v: number) => formatResponseDuration(v), offsetX: -6 },
          axisBorder: { show: false },
        },
        tooltip: { y: { formatter: (v: number) => formatResponseDuration(v) } },
      }
    }

    if (view === 'sales') {
      return {
        ...base,
        colors: [getColor('chart-alpha'), getColor('chart-gamma')],
        series: [
          ...(canSeeRevenue
            ? [{ name: 'ยอดขาย', type: 'area', data: points.map((p) => p.revenue) }]
            : []),
          { name: 'คำสั่งซื้อ', type: 'line', data: points.map((p) => p.orders) },
        ],
        yaxis: { tickAmount: 4, min: 0, axisBorder: { show: false }, labels: { offsetX: -6 } },
        tooltip: {
          y: {
            formatter: (v: number, opts?: { seriesIndex: number }) =>
              canSeeRevenue && opts?.seriesIndex === 0 ? formatBaht(v) : `${v}`,
          },
        },
      }
    }

    return {
      ...base,
      colors: [getColor('chart-primary'), getColor('chart-beta')],
      series: [
        { name: 'แชทที่ดูแล', type: 'area', data: points.map((p) => p.conversations) },
        {
          name: 'อัตราปิดการขาย (%)',
          type: 'line',
          data: points.map((p) => p.conversionRatePct),
        },
      ],
      yaxis: [
        { tickAmount: 4, min: 0, axisBorder: { show: false }, labels: { offsetX: -6 } },
        { opposite: true, tickAmount: 4, min: 0, max: 100, axisBorder: { show: false } },
      ],
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">แนวโน้มรายวัน</h4>
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="เลือกมุมมองกราฟ">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              className={`btn btn-sm ${
                view === v.key
                  ? 'bg-primary text-white'
                  : 'bg-light text-dark hover:bg-light-hover'
              }`}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div className="card-body">
        {hasAny ? (
          /* key บังคับให้ Apex สร้างกราฟใหม่เมื่อสลับมุมมอง — จำนวน series/แกนเปลี่ยน
             การ update ทับของเดิมทำให้แกนที่สองค้างอยู่จากมุมมองก่อนหน้า */
          <ApexChart key={view} type="line" height={320} getOptions={getOptions} />
        ) : (
          <p className="text-default-500 flex items-center justify-center gap-2 py-16 text-sm">
            <Icon icon="chart-line" className="text-base" aria-hidden="true" />
            ยังไม่มีข้อมูลในช่วงเวลาที่เลือก
          </p>
        )}
      </div>
    </div>
  )
}
