// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'

// Third-party Imports
import classnames from 'classnames'
import Link from 'next/link'

// Type Imports
import type { ThemeColor } from '@core/types'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'
import { LinkButton } from '@/app/(marketing)/_components/mui-link'
import { ORDER_STATUS_TONE_TO_MUI } from '@/lib/order-display'
import { resolveOrderStatusBadge } from '@/lib/order-stage'

/**
 * Recent orders widget for the buyer dashboard.
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/dashboard/Transactions.tsx
 *
 * Why Transactions.tsx and not the theme's Orders.tsx: the theme's Orders is a Tabs + MUI
 * Timeline widget showing per-item shipping progression — that model assumes a seller view
 * with multi-leg logistics. For a buyer's "recent 5 orders" glance, the row-per-item layout
 * from Transactions (CustomAvatar + 2-line text + trailing chip) is the right shape; the file
 * name "Orders" refers to the data it displays, not to the theme source. Each row links to
 * /o/{publicToken}.
 */

// enum จริง (order.service): PENDING → SHIPPED/CONFIRMED/CANCELLED; CONFIRMED = terminal "สำเร็จ"
// (ไม่มี CREATED/COMPLETED). label/สี/ไอคอน = ชุดเดียวกับ /orders card list (OrderList/index.tsx)
// อ่านจาก SSOT เดียวกับฝั่งร้าน (feature 00041 / HR16) — ดูเหตุผลเต็มที่ ORDER_STATUS_META
const orderStatusLabel = (status: string) => resolveOrderStatusBadge(status).label

const orderStatusColor = (status: string): ThemeColor =>
  ORDER_STATUS_TONE_TO_MUI[resolveOrderStatusBadge(status).tone]
const ORDER_STATUS_ICON: Record<string, string> = {
  PENDING: 'tabler-clock',
  SHIPPED: 'tabler-truck',
  CONFIRMED: 'tabler-circle-check',
  CANCELLED: 'tabler-x'
}

const baht = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 0
})

type OrderItem = {
  id: string
  name: string
}

type ShopMini = {
  id: string
  name: string
}

export type DashboardOrder = {
  id: string
  publicToken: string
  status: string
  type: string
  totalAmount: number | string
  shop: ShopMini | null
  items: OrderItem[]
}

type Props = {
  orders: DashboardOrder[]
}

const Orders = ({ orders }: Props) => {
  return (
    <Card className='bs-full flex flex-col'>
      <CardHeader
        title='คำสั่งซื้อล่าสุด'
        subheader={`มีทั้งหมด ${orders.length} รายการ`}
        action={
          <LinkButton
            href='/orders'
            variant='text'
            size='small'
            endIcon={<i className='tabler-chevron-right' />}
          >
            ทั้งหมด
          </LinkButton>
        }
      />
      <CardContent className='flex grow gap-y-[18px] lg:gap-y-5 flex-col justify-between max-sm:gap-5'>
        {orders.length === 0 ? (
          <div className='flex flex-col items-center justify-center gap-2 grow plb-8 text-center'>
            <CustomAvatar skin='light' variant='rounded' color='secondary' size={46}>
              <i className='tabler-shopping-bag text-[26px]' />
            </CustomAvatar>
            <Typography color='text.secondary'>ยังไม่มีคำสั่งซื้อ</Typography>
          </div>
        ) : (
          orders.map((order) => {
            const firstItem = order.items[0]
            const statusColor: ThemeColor = orderStatusColor(order.status)
            const icon = ORDER_STATUS_ICON[order.status] ?? 'tabler-shopping-bag'
            return (
              <Link
                key={order.id}
                href={`/o/${order.publicToken}`}
                className='flex items-center gap-4 no-underline rounded-2xl hover:bg-[var(--mui-palette-action-hover)] -mx-2 px-2 py-1'
              >
                <CustomAvatar skin='light' variant='rounded' color={statusColor} size={34}>
                  <i className={classnames(icon, 'text-[22px]')} />
                </CustomAvatar>
                <div className='flex flex-wrap justify-between items-center gap-x-4 gap-y-1 is-full'>
                  <div className='flex flex-col min-w-0'>
                    <Typography className='font-medium truncate' color='text.primary'>
                      {firstItem?.name ?? 'คำสั่งซื้อ'}
                    </Typography>
                    <Typography variant='body2'>
                      {order.shop?.name ?? '—'} · {baht.format(Number(order.totalAmount))}
                    </Typography>
                  </div>
                  <Chip
                    size='small'
                    variant='tonal'
                    color={statusColor}
                    label={orderStatusLabel(order.status)}
                  />
                </div>
              </Link>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

export default Orders
