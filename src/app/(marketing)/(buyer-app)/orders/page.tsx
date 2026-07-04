import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { getOrdersByBuyer } from '@/services/order.service'

import OrderList, { type BuyerOrderRow } from '@views/apps/ecommerce/orders/list'
import PageHeader from '../_components/PageHeader'

/**
 * Buyer "My Orders" list.
 *
 * Base:
 *   theme/vuexy/typescript-version/full-version/src/app/[lang]/(dashboard)/(private)/apps/ecommerce/orders/list/page.tsx
 * Adapted: server-side session + Prisma fetch via getOrdersByBuyer; status filter
 *   via ?status= searchParam; filter chips replace the OrderCard stat strip.
 */

export const metadata: Metadata = { title: 'คำสั่งซื้อของฉัน' }

const VALID_STATUSES = new Set(['ALL', 'PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED'])

export default async function MyOrdersPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user) redirect('/auth/sign-in?callbackUrl=/orders')

  const userId = (session.user as { id: string }).id
  const { status: rawStatus = 'ALL' } = await searchParams
  const status = VALID_STATUSES.has(rawStatus) ? rawStatus : 'ALL'

  const allOrders = await getOrdersByBuyer(userId)
  const filtered = status === 'ALL' ? allOrders : allOrders.filter(o => o.status === status)

  // Decimal/Date are not JSON-safe across the server/client boundary — flatten now.
  const orderData: BuyerOrderRow[] = filtered.map(o => ({
    id: o.id,
    publicToken: o.publicToken,
    status: o.status,
    totalAmount: Number(o.totalAmount),
    createdAt: o.createdAt.toISOString(),
    items: o.items.map(it => ({ id: it.id, name: it.name })),
    shop: {
      id: o.shop.id,
      shopName: o.shop.shopName,
      user: {
        username: o.shop.user.username,
        displayName: o.shop.user.displayName
      }
    }
  }))

  return (
    <>
      <PageHeader title='คำสั่งซื้อของฉัน' subtitle={`รวม ${allOrders.length} รายการ`} />

      <OrderList orderData={orderData} status={status} />
    </>
  )
}
