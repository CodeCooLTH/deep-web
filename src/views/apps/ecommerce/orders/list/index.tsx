// MUI Imports
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'

// Next Imports
import Link from 'next/link'

// Type Imports
import type { ThemeColor } from '@core/types'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'
import { LinkChip } from '@/app/(marketing)/_components/mui-link'

// Utils
import { formatDate } from '@/lib/format-date'

/**
 * Buyer "My Orders" list — server-rendered card list (เชื่อมสไตล์กับ dashboard Orders widget).
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/dashboard/Transactions.tsx (row list)
 * เปลี่ยนจาก TanStack client table เดิม → server component (เบา, ไม่มี client JS หนัก) + filter chips (server).
 * สี/label สถานะ = ชุดเดียวกับ dashboard (verified-means-green สำหรับ "สำเร็จ").
 */

export type BuyerOrderRow = {
  id: string
  publicToken: string
  status: string
  totalAmount: number | string
  createdAt: Date | string
  items: { id: string; name: string }[]
  shop: {
    id: string
    shopName: string
    user: { username: string; displayName: string }
  }
}

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'ALL', label: 'ทั้งหมด' },
  { key: 'PENDING', label: 'รอดำเนินการ' },
  { key: 'SHIPPED', label: 'จัดส่งแล้ว' },
  { key: 'CONFIRMED', label: 'สำเร็จ' },
  { key: 'CANCELLED', label: 'ยกเลิก' }
]

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'รอดำเนินการ',
  SHIPPED: 'จัดส่งแล้ว',
  CONFIRMED: 'สำเร็จ',
  CANCELLED: 'ยกเลิก'
}

const STATUS_COLOR: Record<string, ThemeColor> = {
  PENDING: 'warning',
  SHIPPED: 'info',
  CONFIRMED: 'success',
  CANCELLED: 'error'
}

const STATUS_ICON: Record<string, string> = {
  PENDING: 'tabler-clock',
  SHIPPED: 'tabler-truck',
  CONFIRMED: 'tabler-circle-check',
  CANCELLED: 'tabler-x'
}

const baht = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })

const OrderList = ({ orderData, status }: { orderData: BuyerOrderRow[]; status: string }) => {
  return (
    <div className='flex flex-col gap-6'>
      {/* ตัวกรองสถานะ */}
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

      <Card>
        {orderData.length === 0 ? (
          <div className='flex flex-col items-center justify-center gap-3 plb-16 text-center'>
            <CustomAvatar skin='light' variant='rounded' color='secondary' size={52}>
              <i className='tabler-package text-[30px]' />
            </CustomAvatar>
            <Typography color='text.secondary'>ไม่มีคำสั่งซื้อในหมวดนี้</Typography>
          </div>
        ) : (
          <div className='flex flex-col'>
            {orderData.map(order => {
              const first = order.items[0]
              const extra = order.items.length - 1
              const color = STATUS_COLOR[order.status] ?? 'primary'

              return (
                <Link
                  key={order.id}
                  href={`/o/${order.publicToken}`}
                  className='flex items-center gap-4 pli-5 plb-4 no-underline border-b border-[var(--mui-palette-divider)] last:border-b-0 hover:bg-[var(--mui-palette-action-hover)] transition-colors'
                >
                  <CustomAvatar skin='light' variant='rounded' color={color} size={44}>
                    <i className={`${STATUS_ICON[order.status] ?? 'tabler-package'} text-[24px]`} />
                  </CustomAvatar>

                  <div className='flex flex-col min-w-0 grow'>
                    <Typography className='font-medium truncate' color='text.primary'>
                      {first?.name ?? 'คำสั่งซื้อ'}
                      {extra > 0 && (
                        <Typography component='span' variant='body2' color='text.secondary'>
                          {' '}
                          + อีก {extra} รายการ
                        </Typography>
                      )}
                    </Typography>
                    <Typography variant='body2' color='text.secondary' className='truncate'>
                      {order.shop.shopName} · {formatDate(order.createdAt)}
                    </Typography>
                  </div>

                  <div className='flex flex-col items-end gap-1.5 shrink-0'>
                    <Typography className='font-semibold' color='text.primary'>
                      {baht.format(Number(order.totalAmount))}
                    </Typography>
                    <Chip
                      size='small'
                      variant='tonal'
                      color={color}
                      label={STATUS_LABEL[order.status] ?? order.status}
                    />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

export default OrderList
