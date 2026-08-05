/**
 * StatisticCard — stat card แสดงตัวเลข orders / revenue / trust score
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 *
 * เปลี่ยน "Since last month" → "เทียบเดือนที่แล้ว" (Thai copy)
 * ปรับ change color ให้รองรับ change === 0 (ไม่แสดง arrow)
 */
import { CountUp } from '@/components/wrappers/CountUp'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'

export type StatType = {
  title: string
  value: number
  prefix?: string
  suffix?: string
  /** ซ่อน indicator ทั้ง block เมื่อ change == null — ป้องกัน "0% เทียบเดือนที่แล้ว" หลอกตา */
  change?: number
  /** ป้ายช่วงเวลาของตัวเลข ("วันนี้"/"เดือนนี้") — ใส่เฉพาะการ์ดที่ตาม filter ระดับหน้า
   *  การ์ดที่ไม่ผูกช่วงเวลา (Trust Score) ไม่ส่ง = ไม่มีป้าย นี่คือตัวแยกให้ผู้ใช้เห็นว่าใบไหนตาม filter */
  periodLabel?: string
  icon: string
}

const StatisticCard = ({ stat }: { stat: StatType }) => {
  const { title, value, prefix, suffix, change, periodLabel, icon } = stat
  return (
    <div className="card h-full">
      <div className="card-body">
        <div className="flex justify-between items-start">
          <div>
            <h5 className="text-default-400 text-sm mb-2 font-medium" title={title}>
              {title}
            </h5>
            <h3 className="my-5 py-1.25 text-xl">
              <CountUp start={0} end={value} prefix={prefix ?? ''} suffix={suffix ?? ''} duration={1} decimals={Number.isInteger(value) ? 0 : 2} />
            </h3>
            {/* badge แบบเดียวกับโดนัท/แผนที่ — ให้ป้ายช่วงเวลาทั้งหน้าเป็นภาษาเดียว และ contrast
                ผ่านเกณฑ์ (default-700) เพราะป้ายนี้ load-bearing: ตัวเดียวที่แยกว่าเลขนี้คือช่วงไหน.
                จงใจไม่ผูกกับ change (ไม่ใช้ slot ร่วม) — วันที่ระบบเริ่มส่ง % เทียบช่วงก่อน
                ป้ายนี้ต้องไม่หายไปเงียบ ๆ */}
            {periodLabel && (
              <span className="badge bg-default-100 text-default-700 text-xs">{periodLabel}</span>
            )}
            {/* ซ่อน indicator ทั้ง block เมื่อ change == null — ไม่โชว์ 0% หลอกตา */}
            {change != null && (
              <p className="text-default-400 text-sm flex items-center gap-3.25">
                <span className={cn('flex items-center gap-1', change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-default-400')}>
                  {change > 0 ? <Icon icon="arrow-up" /> : change < 0 ? <Icon icon="arrow-down" /> : null}
                  {Math.abs(change)}%
                </span>
                <span>เทียบเดือนที่แล้ว</span>
              </p>
            )}
          </div>
          <div>
            <div className="size-9 bg-primary/15 text-primary rounded-full flex justify-center items-center">
              <Icon icon={icon} className="size-5.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StatisticCard
