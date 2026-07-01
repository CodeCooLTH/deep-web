'use client'

/**
 * ExpectedPriceGauge — การ์ด KPI ที่ 4 (radial gauge เทียบราคาปัจจุบันกับ "ยอดที่คาดหวัง" ของ seller)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/ProjectStatus.tsx (radialBar)
 * — มติ Controller (Batch E#11): ใช้ไฟล์นี้เป็น Base แทน ProjectPerformance.tsx ที่ SDS §8.3 เขียนไว้เดิม
 *
 * Adaptations จาก ProjectStatus.tsx:
 * - ลดจาก multi-series (4 series/labels) เหลือ single-series (percent เดียว)
 * - semi-circle (startAngle:-90, endAngle:90) แทน full circle เดิม
 * - colors: [getColor('chart-primary')] เดียว แทน 4 สี
 * - ตัด legend/breakdown grid ด้านล่าง (Completed/In Progress/...) ทิ้งทั้งหมด — เหลือแค่ chart + สรุปราคา
 * - ApexChart wrapper เดิม (Hard Rule 10 — ห้าม import react-apexcharts ตรง)
 */

import { useCallback } from 'react'
import ApexChart from '@/components/wrappers/ApexChart'
import { getColor } from '@/utils/helpers'

type Props = {
  currentPrice: number
  expectedPrice: number
}

export default function ExpectedPriceGauge({ currentPrice, expectedPrice }: Props) {
  const percent = expectedPrice > 0 ? Math.min(100, Math.round((currentPrice / expectedPrice) * 100)) : 0

  const getOptions = useCallback(
    () => ({
      chart: { type: 'radialBar' as const, height: 140 },
      plotOptions: {
        radialBar: {
          startAngle: -90,
          endAngle: 90,
          track: { background: 'rgba(170,184,197, 0.2)', margin: 8 },
          hollow: { size: '55%' },
          dataLabels: {
            name: { show: false },
            value: {
              show: true,
              fontSize: '20px',
              fontWeight: 700,
              offsetY: -8,
              formatter: (v: number) => `${v}%`,
            },
          },
        },
      },
      stroke: { lineCap: 'round' as const },
      colors: [getColor('chart-primary')],
      labels: ['ยอดที่คาดหวัง'],
    }),
    [],
  )

  return (
    <div className="card h-full">
      <div className="card-body">
        <p className="text-default-400 mb-1.25 text-xs">เทียบเป้าหมาย</p>
        <ApexChart getOptions={getOptions} series={[percent]} type="radialBar" height={140} />
        <p className="text-default-400 mb-0 -mt-6 text-center text-xs">
          ฿{currentPrice.toLocaleString('th-TH')} / ฿{expectedPrice.toLocaleString('th-TH')}
        </p>
      </div>
    </div>
  )
}
