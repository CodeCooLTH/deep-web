'use client'

/**
 * SalesChartCard — การ์ด mini ยอดขาย (command center) จิ้ม → เปิด SalesChartSheet เต็มจอ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 *   (.card/.card-body shell + chg indicator: arrow-up/arrow-down + text-success/text-danger)
 *
 * Sparkline = div bars ธรรมดา (ไม่ใช่ ApexChart) — เป็น mini indicator ระดับไอคอน ไม่ใช่กราฟที่ต้อง build
 * chart options จริง จึงไม่เข้าเงื่อนไข HR10 (แค่ flex + bg utility, ไม่มี charting library ใด ๆ)
 */
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import type { SalesSeries } from '../_constants/command-center'
import SalesChartSheet from './SalesChartSheet'

type Props = {
  /** null/undefined = fetch เดือนนี้ล้มตอน SSR → ซ่อนการ์ดทั้งหมด (honest-hide) */
  initialSeries: SalesSeries | null | undefined
}

export default function SalesChartCard({ initialSeries }: Props) {
  const [open, setOpen] = useState(false)

  if (!initialSeries) return null

  const { values, confirmedValues, unconfirmedValues, total, prevTotal, futureFromIndex } = initialSeries
  // prevTotal===0 → คำนวณ % ไม่ได้ (หาร 0) → ซ่อน chg indicator
  const chg = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null

  // sparkline = ทั้งเดือน (ทุกวัน) — ไม่ slice ท้าย ไม่งั้นต้นเดือน (วันนี้ยังน้อย) จะโดนตัดออกจนเห็นแต่แท่งอนาคตว่าง
  const sparkValues = values
  const sparkFutureFrom = futureFromIndex
  const max = Math.max(1, ...sparkValues)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card w-full text-start"
        aria-label="ดูรายงานยอดขาย"
      >
        <div className="card-body">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Icon icon="chart-bar" className="size-4 text-primary" />
              <span className="text-sm font-bold text-dark">ยอดขาย</span>
              <span className="text-sm text-default-400">· เดือนนี้</span>
            </div>
            <Icon icon="chevron-right" className="size-4 text-default-400" />
          </div>

          {/* แถวยอดรวม + %chg */}
          <div className="mb-3 flex items-baseline gap-1">
            <span className="text-base text-default-400">฿</span>
            <span className="text-xl font-bold text-dark">{total.toLocaleString('th-TH')}</span>
            {chg != null && (
              <span
                className={`ms-1 flex items-center gap-0.5 text-xs ${
                  chg > 0 ? 'text-success' : chg < 0 ? 'text-danger' : 'text-default-400'
                }`}
              >
                {chg > 0 ? (
                  <Icon icon="arrow-up" className="size-3.5" />
                ) : chg < 0 ? (
                  <Icon icon="arrow-down" className="size-3.5" />
                ) : null}
                {Math.abs(chg)}%
              </span>
            )}
          </div>

          {/* สไปรค์ไลน์ — full-width bars ใต้ยอด (ตรง mockup .mbars); div bars ธรรมดา ไม่ใช่ ApexChart (ดู comment บนไฟล์) */}
          <div className="flex h-12 items-end gap-0.5">
            {sparkValues.map((v, i) => {
              const pct = Math.max(4, Math.round((v / max) * 100))
              const isFuture = i >= sparkFutureFrom
              // อนาคต / ไม่มียอด → แท่งเทาว่าง; มียอด → stacked เหลือง(รอยืนยัน,บน) + ฟ้า(ยืนยันแล้ว,ล่าง)
              // ให้ตรงกับ SalesChartSheet (chart-primary=ยืนยันแล้ว / warning=ยังไม่ยืนยัน)
              if (isFuture || v <= 0) {
                return <div key={i} className="flex-1 rounded-t-sm bg-default-200" style={{ height: `${pct}%` }} />
              }
              const uPct = Math.round(((unconfirmedValues[i] ?? 0) / v) * 100)
              return (
                <div key={i} className="flex flex-1 flex-col overflow-hidden rounded-t-sm" style={{ height: `${pct}%` }}>
                  <div className="bg-warning" style={{ height: `${uPct}%` }} />
                  <div className="flex-1 bg-primary" />
                </div>
              )
            })}
          </div>
        </div>
      </button>

      {open && <SalesChartSheet initialSeries={initialSeries} onClose={() => setOpen(false)} />}
    </>
  )
}
