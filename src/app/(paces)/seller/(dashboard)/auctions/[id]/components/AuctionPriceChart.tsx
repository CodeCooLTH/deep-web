'use client'

/**
 * AuctionPriceChart — แนวโน้มราคาต่อบิด (area chart) + เส้นเป้าหมาย dashed ที่ expectedPrice
 *
 * Base: src/app/(paces)/seller/(dashboard)/sales/components/SalesChart.tsx
 *   (ApexChart wrapper + getColor('chart-*') token pattern, Hard Rule 10)
 * Adaptations: series เดี่ยว (ราคาต่อบิด x=timestamp) แทน dual-axis revenue/orders เดิม;
 * ใช้ `stepline` (ราคาเปลี่ยนแบบขั้นบันไดตามบิดจริง ไม่ใช่ smooth interpolate); เพิ่ม
 * annotation เส้นประ (expectedPrice) — ตัดออกถ้า seller ไม่ได้ตั้งค่า
 *
 * ข้อมูลจาก `bidHistory` ที่มีอยู่แล้ว (SSR top 20, SDS §8.3 — ไม่ต้องสร้าง time-series endpoint ใหม่)
 * bidHistory จาก DTO เรียง createdAt desc (ล่าสุดก่อน) — ต้องกลับเป็น asc (เก่า→ใหม่) ก่อนวาดกราฟ
 */

import { useCallback } from 'react'
import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { getColor } from '@/utils/helpers'
import type { BidDTO } from '@/services/auction.service'

type Props = {
  bidHistory: BidDTO[]
  expectedPrice: number | null
}

export default function AuctionPriceChart({ bidHistory, expectedPrice }: Props) {
  const sorted = [...bidHistory].sort((a, b) => a.atMs - b.atMs)
  const series = [{ name: 'ราคา (฿)', data: sorted.map((b) => ({ x: b.atMs, y: b.amount })) }]

  const getOptions = useCallback(
    () => ({
      chart: { type: 'area' as const, height: 320, toolbar: { show: false }, zoom: { enabled: false } },
      stroke: { width: 2, curve: 'stepline' as const },
      colors: [getColor('chart-primary')],
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05 },
      },
      xaxis: {
        type: 'datetime' as const,
        labels: { datetimeUTC: false, style: { fontSize: '11px' } },
      },
      yaxis: {
        labels: { formatter: (v: number) => `฿${Math.round(v).toLocaleString('th-TH')}` },
      },
      tooltip: {
        x: { format: 'dd MMM HH:mm' },
        y: { formatter: (v: number) => `฿${v.toLocaleString('th-TH')}` },
      },
      annotations:
        expectedPrice != null
          ? {
              yaxis: [
                {
                  y: expectedPrice,
                  borderColor: getColor('chart-secondary'),
                  strokeDashArray: 6,
                  label: {
                    text: `เป้า ฿${expectedPrice.toLocaleString('th-TH')}`,
                    style: { color: getColor('white'), background: getColor('chart-secondary') },
                  },
                },
              ],
            }
          : undefined,
      grid: { strokeDashArray: 4 },
      dataLabels: { enabled: false },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expectedPrice],
  )

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">แนวโน้มราคา</h4>
      </div>
      <div className="card-body">
        {sorted.length === 0 ? (
          <div className="py-10 text-center">
            <Icon icon="chart-bar" className="text-default-300 mx-auto mb-2 text-3xl" />
            <p className="text-default-400 mb-0 text-sm">ยังไม่มีการเสนอราคา</p>
          </div>
        ) : (
          <ApexChart getOptions={getOptions} series={series} type="area" height={320} />
        )}
      </div>
    </div>
  )
}
