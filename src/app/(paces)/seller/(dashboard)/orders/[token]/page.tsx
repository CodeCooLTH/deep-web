/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/page.tsx
 *
 * Re-source จาก Paces order-details:
 * - ใช้ 3-col grid เหมือน theme: col-span-3 (main) + col-span-1 (sidebar)
 * - Main: OrderSummary (items + token link + actions) + ShippingActivity (status timeline)
 * - Sidebar: CustomerDetails (buyer contact, PDPA masked)
 * - ตัด: BillingDetails + ShippingAddress (ไม่มีใน SafePay schema MVP)
 * - คง: data fetching (getOrderByToken), auth guard (getServerSession), shop ownership check
 * - คง: OrderActions (seller actions) + CopyLinkButton (share link) — ย้ายเข้า OrderSummary card
 * - Date → .toISOString() ก่อนส่งข้ามขอบเขต RSC→client component
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getShopByUserId } from '@/services/shop.service'
import { getOrderByToken } from '@/services/order.service'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import OrderSummary from './components/OrderSummary'
import CustomerDetails from './components/CustomerDetails'
import ShippingActivity from './components/ShippingActivity'

export const metadata: Metadata = { title: 'รายละเอียดออเดอร์' }

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function OrderDetailPage({ params }: PageProps) {
  const { token } = await params

  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/seller/auth/sign-in')

  let shop: any = null
  try {
    shop = await getShopByUserId(user.id)
  } catch {
    shop = null
  }

  if (!shop) redirect('/seller/orders')

  let order: any = null
  try {
    order = await getOrderByToken(token)
  } catch {
    order = null
  }

  // Guard: order ต้องมีอยู่และเป็นของ shop นี้
  if (!order || order.shopId !== shop.id) redirect('/seller/orders')

  // แปลง Date → ISO string ก่อนส่งข้ามขอบเขต RSC → component
  // เพื่อหลีกเลี่ยง "Cannot serialize Date" error ของ Next.js
  const createdAtISO = (order.createdAt as Date).toISOString()

  return (
    <>
      <PageBreadcrumb
        title="รายละเอียดออเดอร์"
        trail={[{ label: 'คำสั่งซื้อ', href: '/seller/orders' }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-base">
        {/* Main content — col-span-3 */}
        <div className="space-y-base lg:col-span-3">
          <OrderSummary
            order={{
              publicToken: order.publicToken,
              status: order.status,
              type: order.type,
              // fulfillmentMode ยังไม่อยู่ใน generated Prisma client (Task 1 pending) — cast ผ่าน unknown
              fulfillmentMode: (order as unknown as { fulfillmentMode?: string }).fulfillmentMode ?? 'SHIPPED',
              totalAmount: order.totalAmount,
              createdAtISO,
              items: (order.items ?? []).map((item: any) => ({
                id: item.id,
                name: item.name,
                description: item.description ?? null,
                qty: item.qty,
                price: item.price,
              })),
            }}
          />
          <ShippingActivity
            data={{
              status: order.status,
              // fulfillmentMode ยังไม่อยู่ใน generated Prisma client (Task 1 pending) — cast ผ่าน unknown
              fulfillmentMode: (order as unknown as { fulfillmentMode?: string }).fulfillmentMode ?? 'SHIPPED',
              createdAtISO,
              shipmentTracking: order.shipmentTracking
                ? {
                    provider: order.shipmentTracking.provider,
                    trackingNo: order.shipmentTracking.trackingNo,
                  }
                : null,
            }}
          />
        </div>

        {/* Sidebar — col-span-1 */}
        <div className="space-y-base">
          <CustomerDetails
            data={{
              buyerContact: order.buyerContact ?? null,
              buyerDisplayName: order.buyer?.displayName ?? null,
              buyerUsername: order.buyer?.username ?? null,
            }}
          />
        </div>
      </div>
    </>
  )
}
