/**
 * ProductStats — stat card สำหรับหน้าสินค้า
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/components/ProductStats.tsx
 * เปลี่ยน: ลบ Link "external-link" ออก (ไม่มี destination ที่ชัดเจน); ลบ react-countup dep
 * เหลือ: layout card เดิมทุกอย่าง
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import { CountUp } from '@/components/wrappers/CountUp'
import { cn } from '@/utils/helpers'

export type StatType = {
  title: string
  value: number
  prefix?: string
  suffix?: string
  change: number
  icon: string
  iconClassName: string
  bulletClassName: string
  metric: string
  metricValue: string
}

const ProductStats = ({ stat }: { stat: StatType }) => {
  const { bulletClassName, change, icon, iconClassName, metric, metricValue, title, value, prefix, suffix } = stat
  return (
    <div className="card">
      <div className="card-body">
        <div className="mb-2 flex items-center justify-between">
          <h5 title={title} className="card-title text-sm">
            {title}
          </h5>
        </div>
        <div className="my-5 flex items-center gap-2.5">
          <div className={cn('size-9 flex items-center justify-center rounded-full', iconClassName)}>
            <Icon icon={icon} className="size-5.5 text-2xl" />
          </div>
          <h3 className="text-xl">
            <CountUp start={0} end={value} prefix={prefix ?? ''} duration={1} suffix={suffix ?? ''} decimals={Number.isInteger(value) ? 0 : 2} />
          </h3>
          <span className={cn('ms-auto badge py-0 text-xs font-medium', change > 0 ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
            {change > 0 ? '+' : ''}{change}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className={cn('text-primary flex items-center gap-1', bulletClassName)}>
              <Icon icon="circle-filled" className="align-middle" />
            </span>
            <span className="text-default-400 text-sm">{metric}</span>
          </div>
          <span className="font-semibold">{metricValue}</span>
        </div>
      </div>
    </div>
  )
}

export default ProductStats
