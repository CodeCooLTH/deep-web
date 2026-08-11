import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { resolveOrderStatusBadge } from '@/lib/order-stage'
import { getOrdersByBuyer } from '@/services/order.service'
import { formatDateTimeTH } from '@/lib/format-date'
import SearchBox from '@/app/(marketing)/(buyer-app)/_components/SearchBox'
import { MPageTitle, MEmpty, MChip, type SemColor } from '../_components/ui'
import { sessionUserId } from '@/lib/session-user'

export const metadata: Metadata = { title: 'คำสั่งซื้อของฉัน' }

const baht = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })

// label อ่านจาก SSOT เดียวกับฝั่งร้าน (feature 00041 / HR16) — สี/ไอคอนยังเป็นของหน้านี้เอง
// เพราะเป็น token คนละระบบ แต่ "คำ" ต้องตรงกันทุกหน้าจอ
const STATUS: Record<string, { label: string; color: SemColor; icon: string }> = {
  PENDING: { label: resolveOrderStatusBadge('PENDING').label, color: 'warning', icon: 'tabler-clock' },
  SHIPPED: { label: resolveOrderStatusBadge('SHIPPED').label, color: 'info', icon: 'tabler-truck-delivery' },
  CONFIRMED: { label: resolveOrderStatusBadge('CONFIRMED').label, color: 'success', icon: 'tabler-circle-check' },
  CANCELLED: { label: resolveOrderStatusBadge('CANCELLED').label, color: 'error', icon: 'tabler-x' }
}

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'ALL', label: 'ทั้งหมด' },
  ...(['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED'] as const).map(key => ({
    key,
    label: resolveOrderStatusBadge(key).label
  }))
]
const VALID = new Set(FILTERS.map(f => f.key))

// href chip — คง q ไว้, ตัด status เมื่อ ALL (URL ที่เห็นคือ /orders — proxy rewrite → /m/orders)
const chipHref = (key: string, q: string) => {
  const p = new URLSearchParams()
  if (key !== 'ALL') p.set('status', key)
  if (q) p.set('q', q)
  const qs = p.toString()
  return `/orders${qs ? `?${qs}` : ''}`
}

export default async function MobileOrdersPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!session?.user || !userId) redirect('/auth/sign-in?callbackUrl=/orders')

  const { status: rawStatus = 'ALL', q = '' } = await searchParams
  const status = VALID.has(rawStatus) ? rawStatus : 'ALL'
  const query = q.trim().toLowerCase()

  const allOrders = await getOrdersByBuyer(userId)
  const byStatus = status === 'ALL' ? allOrders : allOrders.filter(o => o.status === status)
  const orders = !query
    ? byStatus
    : byStatus.filter(
        o =>
          o.items.some(it => it.name.toLowerCase().includes(query)) ||
          o.shop.shopName.toLowerCase().includes(query)
      )

  return (
    <div className='flex flex-col gap-4'>
      <MPageTitle title='คำสั่งซื้อของฉัน' />

      <SearchBox placeholder='ค้นหาสินค้า / ร้านค้า' />

      {/* filter chips (เลื่อนแนวนอน) */}
      <div className='flex gap-2 overflow-x-auto -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        {FILTERS.map(f => {
          const active = f.key === status
          return (
            <Link
              key={f.key}
              href={chipHref(f.key, q)}
              className={`shrink-0 h-8 flex items-center pli-3.5 rounded-full text-[13px] no-underline border transition-colors ${
                active
                  ? 'bg-[var(--mui-palette-primary-main)] text-white border-[var(--mui-palette-primary-main)]'
                  : 'bg-[var(--mui-palette-background-paper)] text-[var(--mui-palette-text-secondary)] border-[var(--mui-palette-divider)]'
              }`}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      {orders.length === 0 ? (
        <MEmpty
          icon={query ? 'tabler-search-off' : 'tabler-package'}
          text={query ? `ไม่พบคำสั่งซื้อที่ตรงกับ "${q}"` : 'ยังไม่มีคำสั่งซื้อในหมวดนี้'}
          {...(!query && status === 'ALL' ? { cta: { href: '/m/auctions', label: 'เริ่มประมูล' } } : {})}
        />
      ) : (
        <div className='flex flex-col gap-2.5'>
          {orders.map(o => {
            const st = STATUS[o.status] ?? { label: o.status, color: 'secondary' as SemColor, icon: 'tabler-package' }
            const first = o.items[0]
            const extra = o.items.length - 1
            return (
              <Link
                key={o.id}
                href={`/o/${o.publicToken}`}
                className='no-underline rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] p-3.5 flex flex-col gap-2.5'
              >
                <div className='flex items-center justify-between gap-2'>
                  <div className='flex items-center gap-1.5 min-w-0'>
                    <i className='tabler-building-store text-[16px] text-[var(--mui-palette-text-secondary)] shrink-0' />
                    <span className='text-[13px] font-medium truncate text-[var(--mui-palette-text-primary)]'>{o.shop.shopName}</span>
                  </div>
                  <MChip label={st.label} color={st.color} />
                </div>
                <div className='flex items-center gap-3'>
                  <span
                    className='size-10 rounded-xl flex items-center justify-center shrink-0'
                    style={{ background: `var(--mui-palette-${st.color}-lightOpacity)` }}
                  >
                    <i className={`${st.icon} text-[21px]`} style={{ color: `var(--mui-palette-${st.color}-main)` }} />
                  </span>
                  <div className='flex-1 min-w-0'>
                    <p className='text-[14px] m-0 truncate text-[var(--mui-palette-text-primary)]'>
                      {first?.name ?? 'คำสั่งซื้อ'}
                      {extra > 0 && <span className='text-[var(--mui-palette-text-disabled)]'> +อีก {extra} รายการ</span>}
                    </p>
                    <p className='text-[12px] m-0 text-[var(--mui-palette-text-disabled)]'>{formatDateTimeTH(o.createdAt)}</p>
                  </div>
                  <span className='text-[15px] font-bold text-[var(--mui-palette-primary-main)] shrink-0'>
                    {baht.format(Number(o.totalAmount))}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
