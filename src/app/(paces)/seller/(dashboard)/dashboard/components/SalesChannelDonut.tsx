'use client'

/**
 * SalesChannelDonut — "ช่องทางการขาย" บนแดชบอร์ดเดสก์ท็อป (โดนัทสัดส่วนออเดอร์ต่อช่องทาง)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StorePerformanceOverview.tsx
 *   — คงโครง .card/.card-header/.card-body + ApexChart type="donut" (size 75%, stroke 0, dataLabels off,
 *     total label กลางวง) ผ่าน @/components/wrappers/ApexChart (Hard Rule 10)
 *   — ตัดออก: ปุ่ม Refresh ที่สุ่มตัวเลขด้วย Math.random (fixture ของธีม) และป้าย "POOR SALES"
 *     ซึ่งเป็นการตัดสินผลประกอบการที่เราไม่มีเกณฑ์รองรับ
 *   — เพิ่ม: legend รายช่องทางพร้อมโลโก้แบรนด์จริง reuse จาก SalesChannelBadge (ไม่ทำสีเอง),
 *     empty state เมื่อเดือนนี้ยังไม่มีออเดอร์
 *
 * ทำไมโลโก้ต้องมาจาก SalesChannelBadge: ช่องทางเดียวกันโผล่ในหน้ารายละเอียดคำสั่งซื้อและกล่องแชท
 * ด้วยโลโก้ชุดนั้นอยู่แล้ว ถ้าการ์ดนี้วาดไอคอนเองผู้ใช้จะเห็น "Facebook" คนละหน้าตาในสองหน้า
 */

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { SalesChannelLogo, getSalesChannelDisplay } from '@/components/safepay/SalesChannelBadge'
import { getColor } from '@/utils/helpers'
import type { ApexOptions } from 'apexcharts'
import type { SalesChannelSlice } from '@/services/dashboard.service'

type Props = {
  slices: SalesChannelSlice[]
}

/**
 * สีต่อช่องทาง — token กราฟของธีมเท่านั้น (Hard Rule 10: ห้าม hardcode hex)
 *
 * ผูกสีกับ "ช่องทาง" ไม่ใช่กับ "ลำดับในอาเรย์" เพื่อให้ Facebook เป็นสีเดิมทุกเดือน
 * ไม่ใช่เปลี่ยนสีเพราะเดือนนี้ตกไปอันดับสาม
 */
const CHANNEL_COLOR_TOKEN: Record<string, string> = {
  FACEBOOK: 'chart-primary',
  LINE: 'chart-alpha',
  TIKTOK: 'chart-gamma',
  INSTAGRAM: 'chart-beta',
  STOREFRONT: 'chart-delta',
  ISHIP_IMPORT: 'chart-zeta',
  OTHER: 'chart-gray',
}

const colorOf = (channel: string) => getColor(CHANNEL_COLOR_TOKEN[channel] ?? 'chart-gray')

const SalesChannelDonut = ({ slices }: Props) => {
  const total = slices.reduce((sum, s) => sum + s.orderCount, 0)

  const getOptions = (): ApexOptions => ({
    chart: { height: 210, type: 'donut' },
    legend: { show: false },
    stroke: { width: 0 },
    plotOptions: {
      pie: {
        donut: {
          size: '75%',
          labels: {
            show: true,
            total: {
              showAlways: true,
              show: true,
              label: 'ออเดอร์',
              formatter: () => String(total),
            },
          },
        },
      },
    },
    series: slices.map((s) => s.orderCount),
    labels: slices.map((s) => getSalesChannelDisplay(s.channel).label),
    colors: slices.map((s) => colorOf(s.channel)),
    dataLabels: { enabled: false },
    tooltip: {
      y: { formatter: (v: number) => `${v.toLocaleString('th-TH')} ออเดอร์` },
    },
    responsive: [{ breakpoint: 480, options: { chart: { width: 180 } } }],
  })

  return (
    <div className="card h-full">
      <div className="card-header">
        <h4 className="card-title">ช่องทางการขาย</h4>
        <span className="badge bg-default-100 text-default-700 text-xs">เดือนนี้</span>
      </div>
      <div className="card-body">
        {total === 0 ? (
          // honest-zero: ร้านที่เดือนนี้ยังไม่มีออเดอร์ต้องเห็นว่า "ยังไม่มี" ไม่ใช่โดนัทว่าง ๆ ที่อ่านไม่ออก
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="flex items-center justify-center rounded-full bg-default-100 text-default-400 size-12">
              <Icon icon="chart-donut" className="text-2xl" />
            </span>
            <p className="text-sm font-semibold">เดือนนี้ยังไม่มีออเดอร์</p>
            <p className="text-xs text-default-500">เมื่อมีคำสั่งซื้อ สัดส่วนช่องทางจะแสดงที่นี่</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="grow min-w-40">
              <ApexChart type="donut" height={210} series={slices.map((s) => s.orderCount)} getOptions={getOptions} />
            </div>
            <div className="flex grow flex-col gap-2.5 min-w-40">
              {slices.map((s) => {
                const display = getSalesChannelDisplay(s.channel)
                const percent = Math.round((s.orderCount / total) * 100)
                return (
                  <div className="flex items-center gap-2.5 text-sm" key={s.channel}>
                    <span
                      className="inline-block rounded-full size-2.5 shrink-0"
                      style={{ backgroundColor: colorOf(s.channel) }}
                      aria-hidden="true"
                    />
                    <SalesChannelLogo channel={s.channel} size={16} />
                    <span className="truncate">{display.label}</span>
                    <span className="ms-auto font-semibold">{s.orderCount.toLocaleString('th-TH')}</span>
                    <span className="text-xs text-default-500 w-9 text-end">{percent}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SalesChannelDonut
