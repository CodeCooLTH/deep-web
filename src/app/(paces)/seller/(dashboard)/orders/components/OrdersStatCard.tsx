/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/RevenueStat.tsx
 *       theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/data.ts (chartOptions pattern บรรทัด 252-277)
 *
 * Adaptations:
 * - แสดงข้อมูล 1 status ต่อ card (แทน revenue/expenses)
 * - sparkline สีตาม status (PENDING=chart-gamma, SHIPPED=chart-primary, CONFIRMED=success, CANCELLED=chart-beta)
 * - badge changePct แสดง 7-day vs prev-7-day
 * - ไม่มี prefix/suffix/isReverse (ไม่ต้องการสำหรับออเดอร์)
 * - Stripped: revenueStatisticData import (ใช้ prop แทน)
 */

'use client'

import ApexChart from '@/components/wrappers/ApexChart'
import { CountUp } from '@/components/wrappers/CountUp'
import { getColor } from '@/utils/helpers'
import type { OrderStatCardData } from './data'
import { getStatChangeTone, STAT_CHANGE_TONE_CLASS } from './stat-change-tone'

// แมป status → chart color token
// --color-success มีจริงใน _root.css (#02bc9c) → ใช้ได้ตรง ๆ
const STATUS_COLOR: Record<OrderStatCardData['status'], string> = {
  PENDING:   'chart-gamma',   // เหลือง — รอดำเนินการ
  SHIPPED:   'chart-primary', // น้ำเงิน Paces — จัดส่งแล้ว
  CONFIRMED: 'success',       // เขียว — สำเร็จ (--color-success ยืนยันแล้วใน _root.css)
  CANCELLED: 'chart-beta',    // ชมพู/แดง — ยกเลิก
}

const OrdersStatCard = ({ item }: { item: OrderStatCardData }) => {
  const colorToken = STATUS_COLOR[item.status]

  // chartOptions pattern copy จาก data.ts บรรทัด 252-277 (RevenueStat "Total Revenue")
  const getChartOptions = () => ({
    chart: {
      type: 'bar' as const,
      height: 60,
      sparkline: { enabled: true },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: '60%',
        borderRadius: 4,
      },
    },
    colors: [getColor(colorToken)],
    series: [
      {
        name: item.title,
        data: item.trendSeries,
      },
    ],
    tooltip: {
      x: { show: false },
      y: { formatter: (v: number): string => String(v) + ' ออเดอร์' },
    },
  })

  // badge tone ตาม changePct — CANCELLED invert (ยอดยกเลิกเพิ่ม = แย่ ไม่ใช่ดี) (S-A1)
  // ดู stat-change-tone.ts สำหรับตรรกะเต็ม + เหตุผลที่แยกเป็น pure function
  const badgeClass = STAT_CHANGE_TONE_CLASS[getStatChangeTone(item.status, item.changePct)]
  const changeLabel = item.changePct > 0 ? `+${item.changePct}%` : `${item.changePct}%`

  return (
    <div className="card">
      <div className="card-header flex py-3.75 px-5 border-0 justify-between items-center">
        <h5 className="card-title mb-0">{item.title}</h5>
        <span className={`badge ${badgeClass}`}>{changeLabel}</span>
      </div>
      <div className="card-body">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="mb-1.25 font-normal text-xl">
              <CountUp start={0} end={item.totalCount} duration={1} decimals={0} />
            </h3>
            <p className="text-default-400">ทั้งหมด</p>
          </div>
          <div className="text-end w-1/2">
            <ApexChart
              type="bar"
              height={60}
              getOptions={getChartOptions}
              series={getChartOptions().series}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default OrdersStatCard
