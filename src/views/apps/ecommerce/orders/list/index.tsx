// Component Imports
import OrderListTable from './OrderListTable'
import type { BuyerOrderRow } from './OrderListTable'

import { LinkChip } from '@/app/(marketing)/_components/mui-link'

/**
 * Buyer-side OrderList shell — renders the status filter chips on top of the table.
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/orders/list/index.tsx
 * Adapted: dropped <OrderCard> stat strip (no buyer-side aggregate metrics yet),
 * replaced with status filter chips driven by ?status= searchParam.
 */
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'ALL',       label: 'ทั้งหมด' },
  { key: 'PENDING',   label: 'รอดำเนินการ' },
  { key: 'SHIPPED',   label: 'จัดส่งแล้ว' },
  { key: 'CONFIRMED', label: 'สำเร็จ' },
  { key: 'CANCELLED', label: 'ยกเลิก' }
]

const OrderList = ({ orderData, status }: { orderData: BuyerOrderRow[]; status: string }) => {
  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap gap-2'>
        {FILTERS.map(f => {
          const active = status === f.key

          return (
            <LinkChip
              key={f.key}
              href={f.key === 'ALL' ? '/orders' : `/orders?status=${f.key}`}
              label={f.label}
              color={active ? 'primary' : 'default'}
              variant={active ? 'filled' : 'outlined'}
            />
          )
        })}
      </div>

      <OrderListTable orderData={orderData} />
    </div>
  )
}

export default OrderList
