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
import { getOrderForShop } from '@/services/order.service'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import OrderSummary from './components/OrderSummary'
import CustomerDetails from './components/CustomerDetails'
import ShippingActivity from './components/ShippingActivity'
import OrderReviewCard from './components/OrderReviewCard'
import type { OrderReviewData } from './components/OrderReviewCard'

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

  // DAL pattern: bake shopId filter เข้า query — กัน RSC flight-data leak
  // (redirect-after-fetch ไม่ได้ป้องกัน เพราะข้อมูล serialize เข้า flight ก่อน redirect throw)
  const orderRaw = await getOrderForShop(token, shop.id)
  if (!orderRaw) notFound()
  // cast any เพื่อรองรับ field ที่เข้าถึงแบบ dynamic (เช่น order.buyer ที่ไม่มีใน Prisma include)
  // runtime จะ return undefined ตามปกติ — ไม่กระทบ logic
  const order: any = orderRaw

  // แปลง Date → ISO string ก่อนส่งข้ามขอบเขต RSC → component
  // เพื่อหลีกเลี่ยง "Cannot serialize Date" error ของ Next.js
  const createdAtISO = (order.createdAt as Date).toISOString()

  // สร้าง review data — mask PII ที่ RSC boundary ก่อนส่งข้าม (S-C1)
  // ห้ามส่ง raw phone/email ข้ามขอบเขต RSC→client แม้แต่ฟิลด์เดียว
  // เฉพาะ masked string หรือ displayName (public) เท่านั้นที่ข้ามได้
  function maskContactLocal(c: string): string {
    if (!c || c.length <= 4) return c || '—'
    return '•'.repeat(Math.max(0, c.length - 4)) + c.slice(-4)
  }

  const reviewerLabel: string = (() => {
    // buyer ลงทะเบียนแล้ว → displayName เป็น public field — ส่งได้ตรง
    if (order.buyer?.displayName) return order.buyer.displayName
    // guest → mask ที่ server boundary ก่อน — ห้ามส่ง raw ข้าม RSC
    const raw = order.review?.reviewerContact ?? order.buyerContact ?? null
    if (raw) return maskContactLocal(raw)
    return 'ผู้ซื้อนิรนาม'
  })()

  const reviewData: OrderReviewData | null = order.review
    ? {
        rating: order.review.rating,
        comment: order.review.comment ?? null,
        // reviewerLabel คือ safe label ที่ mask แล้วจาก server — ไม่มี raw contact ข้ามมา
        reviewerLabel,
        createdAtISO: (order.review.createdAt as Date).toISOString(),
      }
    : null

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
              fulfillmentMode: order.fulfillmentMode,
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
              fulfillmentMode: order.fulfillmentMode,
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
          {/* review card: compose กลับตาม retro action #4 + #9 — trust-critical info ที่ seller ต้องเห็น */}
          <OrderReviewCard review={reviewData} />
        </div>
      </div>
    </>
  )
}
