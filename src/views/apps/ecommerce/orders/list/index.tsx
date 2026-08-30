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
import { ORDER_STATUS_TONE_TO_MUI } from '@/lib/order-display'
import { resolveOrderStatusBadge } from '@/lib/order-stage'

// Utils
import { formatDateTimeTH } from '@/lib/format-date'

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

// label ของชิปกรองต้องมาจาก SSOT เดียวกับป้ายในแถว ไม่งั้นจอเดียวกันอ่านคนละคำ
// (เดิมชิปเขียน 'จัดส่งแล้ว' ส่วนป้ายในแถวเขียนอีกอย่าง — ผู้ใช้เห็นพร้อมกันทั้งคู่)
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'ALL', label: 'ทั้งหมด' },
  ...(['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED'] as const).map(key => ({
    key,
    label: resolveOrderStatusBadge(key).label
  }))
]

// ป้ายสถานะอ่านจาก SSOT เดียวกับฝั่งร้าน (feature 00041 / HR16) — เดิมไฟล์นี้ประกาศเอง
// และเขียน SHIPPED = 'จัดส่งแล้ว' ขณะที่ฝั่งร้านเขียน 'กำลังจัดส่ง' ⇒ ออเดอร์ใบเดียวกัน
// อ่านคนละคำสองหน้าจอ. SHIPPED = ของออกจากร้านแล้วแต่ยังไม่ถึงมือ = "ระหว่างทาง" ไม่ใช่จบ
const statusLabel = (status: string) => resolveOrderStatusBadge(status).label
const statusColor = (status: string): ThemeColor =>
  ORDER_STATUS_TONE_TO_MUI[resolveOrderStatusBadge(status).tone]

const STATUS_ICON: Record<string, string> = {
  PENDING: 'tabler-clock',
  SHIPPED: 'tabler-truck',
  CONFIRMED: 'tabler-circle-check',
  CANCELLED: 'tabler-x'
}

const baht = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })

const OrderList = ({
  orderData,
  status,
  query = ''
}: {
  orderData: BuyerOrderRow[]
  status: string
  query?: string
}) => {
  // คง q ไว้ตอนสลับ chip สถานะ (search + filter ทำงานร่วมกัน)
  const qParam = query.trim() ? `q=${encodeURIComponent(query.trim())}` : ''
  const chipHref = (key: string) => {
    const parts = [key === 'ALL' ? '' : `status=${key}`, qParam].filter(Boolean)
    return parts.length ? `/orders?${parts.join('&')}` : '/orders'
  }

  return (
    <div className='flex flex-col gap-6'>
      {/* ตัวกรองสถานะ */}
      <div className='flex flex-wrap gap-2'>
        {FILTERS.map(f => {
          const active = status === f.key

          return (
            <LinkChip
              key={f.key}
              href={chipHref(f.key)}
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
              <i className={`${query.trim() ? 'tabler-search-off' : 'tabler-package'} text-[30px]`} />
            </CustomAvatar>
            <Typography color='text.secondary'>
              {query.trim() ? `ไม่พบคำสั่งซื้อที่ตรงกับ "${query.trim()}"` : 'ไม่มีคำสั่งซื้อในหมวดนี้'}
            </Typography>
          </div>
        ) : (
          <div className='flex flex-col'>
            {orderData.map(order => {
              const first = order.items[0]
              const extra = order.items.length - 1
              const color = statusColor(order.status)

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
                      {order.shop.shopName} · {formatDateTimeTH(order.createdAt)}
                    </Typography>
                  </div>

                  <div className='flex flex-col items-end gap-1.5 shrink-0'>
                    <Typography className='font-medium' color='text.primary'>
                      {baht.format(Number(order.totalAmount))}
                    </Typography>
                    <Chip
                      size='small'
                      variant='tonal'
                      color={color}
                      label={statusLabel(order.status)}
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
