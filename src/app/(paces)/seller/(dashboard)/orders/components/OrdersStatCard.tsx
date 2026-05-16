/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersStatCard.tsx
 * Stripped: CountUp dependency (ใช้ค่าตัวเลขตรง เพราะ value เป็น integer ง่าย)
 * Adapted: className ตรงกับ SafePay stat (bg-primary, bg-warning, ฯลฯ)
 */

'use client'

import { CountUp } from '@/components/wrappers/CountUp'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import type { OrderStatType } from './data'

const OrdersStatCard = ({ item }: { item: OrderStatType }) => {
  return (
    <div className="card">
      <div className="card-body">
        <div className="mb-5 flex w-full items-center justify-between gap-3">
          <h3 className="text-xl">
            <CountUp
              start={0}
              end={item.value}
              duration={1}
              prefix={item.prefix}
              suffix={item.suffix}
              decimals={Number.isInteger(item.value) ? 0 : 2}
            />
          </h3>
          <div className={cn('size-9 flex items-center justify-center rounded-full!', item.className)}>
            <Icon icon={item.icon} className="size-5.5 text-white" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-xs uppercase font-bold">{item.title}</span>
          </div>
          <span className={cn('badge ms-auto', item.change > 0 ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
            {item.change > 0 ? '+' : ''}
            {item.change}%
          </span>
        </div>
      </div>
    </div>
  )
}

export default OrdersStatCard
