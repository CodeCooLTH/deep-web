import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { getOrdersByBuyer } from '@/services/order.service'

import OrderList, { type BuyerOrderRow } from '@views/apps/ecommerce/orders/list'
import PageHeader from '../_components/PageHeader'
import SearchBox from '../_components/SearchBox'
import { sessionUserId } from '@/lib/session-user'
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import { resolveServiceStatusBadge, serviceArrivalOf } from '@/lib/service-status'

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
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const session = await getServerSession(authOptions)

  const userId = sessionUserId(session)
  if (!session?.user || !userId) redirect('/auth/sign-in?callbackUrl=/orders')

  const { status: rawStatus = 'ALL', q = '' } = await searchParams
  const status = VALID_STATUSES.has(rawStatus) ? rawStatus : 'ALL'
  const query = q.trim().toLowerCase()

  const allOrders = await getOrdersByBuyer(userId)
  const byStatus = status === 'ALL' ? allOrders : allOrders.filter(o => o.status === status)
  // ค้นหา (in-memory — buyer มี order ไม่มาก): ชื่อสินค้า หรือ ชื่อร้าน
  const filtered = query
    ? byStatus.filter(
        o =>
          o.items.some(it => it.name.toLowerCase().includes(query)) ||
          o.shop.shopName.toLowerCase().includes(query)
      )
    : byStatus

  // Decimal/Date are not JSON-safe across the server/client boundary — flatten now.
  const orderData: BuyerOrderRow[] = filtered.map(o => ({
    id: o.id,
    publicToken: o.publicToken,
    status: o.status,
    totalAmount: Number(o.totalAmount),
    createdAt: o.createdAt.toISOString(),
    items: o.items.map(it => ({ id: it.id, name: it.name })),
    // feature 00073 — งานของร้านบริการ: ป้ายชุดเดียวคำฝั่งลูกค้า (ตัดสินรายแถวตามร้านเจ้าของใบ)
    serviceStatus: usesServiceFinanceRules(o.shop.vertical)
      ? (({ label, tone, icon }) => ({ label, tone, icon }))(
          resolveServiceStatusBadge(
            {
              status: o.status,
              appointmentStatus: o.appointmentStatus ?? null,
              hasAppointment: Boolean(o.serviceStart),
              // 00086 FR-001 — งานหน้าร้าน (ค่าที่ร้านเลือก → สูตรเดิม) = ป้ายงานหน้าร้าน (ร้าน "รอเริ่มงาน" · ลูกค้า "รับงานแล้ว") แม้มีเวลาเริ่ม
              arrivalMode: serviceArrivalOf(o),
              serviceClosedAt: o.serviceClosedAt ?? null,
              outstanding: null,
            },
            'buyer',
          ),
        )
      : null,
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
      <PageHeader
        title='คำสั่งซื้อของฉัน'
        subtitle={`รวม ${allOrders.length} รายการ`}
        action={<SearchBox placeholder='ค้นหาสินค้า / ร้านค้า' />}
      />

      <OrderList orderData={orderData} status={status} query={q} />
    </>
  )
}
