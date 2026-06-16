/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/page.tsx
 *
 * Re-source จาก Paces order-details (redesign 2026-06-15 — action-first/mobile-first):
 * - ใช้ 3-col grid เหมือน theme: col-span-3 (main) + col-span-1 (sidebar)
 * - Main: StatusHero (สถานะ) → OrderSummary (items + totals) → ShippingActivity (timeline)
 * - Sidebar: CustomerDetails → PaymentCard → ShippingAddress → CancelZone → OrderReviewCard
 * - T3: ลบ OrderActionPanel (action ย้ายเข้า StatusHeroV2; cancel ย้ายเข้า CancelZone)
 * - T4: เพิ่ม CancelZone (danger card) ล่าง ShippingAddress ก่อน OrderReviewCard
 * - คง: data fetching (getOrderForShop), auth guard (getServerSession), shop ownership check
 * - PII: mask + neutralize raw contact ที่ server boundary ก่อนส่งข้าม RSC (S-C1) — ห้ามแตะ
 * - paymentMethod/salesChannel/slipFileId/accessUrl ไม่ใช่ PII → ส่งให้ PaymentCard ได้
 * - Date → .toISOString() ก่อนส่งข้ามขอบเขต RSC→client component
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getShopByUserId } from '@/services/shop.service'
import { getOrderForShop } from '@/services/order.service'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import StatusHero from './components/StatusHero'
import OrderSummary from './components/OrderSummary'
import CustomerDetails from './components/CustomerDetails'
import PaymentCard from './components/PaymentCard'
import ShippingAddress from './components/ShippingAddress'
import type { ShippingAddressData } from './components/ShippingAddress'
import ShippingActivity from './components/ShippingActivity'
import CancelZone from './components/CancelZone'
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
  if (!user) redirect('/auth/sign-in')

  let shop: any = null
  try {
    shop = await getShopByUserId(user.id)
  } catch {
    shop = null
  }

  if (!shop) redirect('/orders')

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

  // S-C1 defense-in-depth: คำนวณ masked contact ให้ครบ "ก่อน" แล้ว neutralize raw บน order object
  // เหตุผล: seller page อยู่ใต้ client VerticalLayout → Next serialize ทั้ง order object เข้า RSC
  // flight payload (เห็นใน page source). lib มาส์กที่ปลายทางไม่พอ — raw ยังติด full-order blob.
  // จึงลบ raw contact ทิ้งที่ source หลังดึง masked เสร็จ (downstream ไม่มีใครใช้ raw แล้ว:
  // reviewerLabel + CustomerDetails ใช้ masked, OrderActions/SendSms ไม่รับ contact ตาม RC-8)
  const buyerContactMasked = order.buyerContact ? maskContactLocal(order.buyerContact) : null
  order.buyerContact = null
  // เช่นเดียวกัน: reviewerContact (raw phone/email ใน review) — reviewerLabel mask ไปแล้วด้านบน
  // neutralize ที่ source ให้ consistent กัน กันรั่วถ้าอนาคตมีใคร pass order.review ทั้งก้อน
  if (order.review) order.review.reviewerContact = null

  // Phase B: shippingAddress เป็น Json (Prisma คืน object แล้ว) — render card เฉพาะเมื่อมีค่าจริง
  const rawAddr = order.shippingAddress
  const shippingAddr: ShippingAddressData | null =
    rawAddr && typeof rawAddr === 'object' && Object.values(rawAddr).some((v) => v && String(v).trim())
      ? (rawAddr as ShippingAddressData)
      : null

  return (
    <>
      <PageBreadcrumb
        title="รายละเอียดออเดอร์"
        trail={[{ label: 'คำสั่งซื้อ', href: '/orders' }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-base">
        {/* Main content — col-span-3 */}
        <div className="space-y-base lg:col-span-3">
          {/* StatusHero — สถานะเด่น + primary CTA ต่อ state (T3: action ย้ายเข้า StatusHeroV2 แล้ว) */}
          <StatusHero
            publicToken={order.publicToken}
            status={order.status}
            type={order.type}
            createdAtISO={createdAtISO}
            fulfillmentMode={order.fulfillmentMode}
          />
          <OrderSummary
            order={{
              publicToken: order.publicToken,
              type: order.type,
              totalAmount: order.totalAmount,
              discount: order.discount ?? null,
              vatRate: order.vatRate ?? null,
              vatAmount: order.vatAmount ?? null,
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
              // S-C1: ใช้ masked ที่คำนวณ+ neutralize raw บน order แล้วด้านบน
              buyerContactMasked,
              buyerDisplayName: order.buyer?.displayName ?? null,
              buyerUsername: order.buyer?.username ?? null,
              buyerName: order.buyerName ?? null,
            }}
          />
          {/* PaymentCard — วิธีชำระ/ช่องทาง/สลิป/ลิงก์ดิจิทัล (ไม่ใช่ PII) */}
          <PaymentCard
            paymentMethod={order.paymentMethod ?? null}
            salesChannel={order.salesChannel ?? null}
            slipFileId={order.slipFileId ?? null}
            accessUrl={order.accessUrl ?? null}
            fulfillmentMode={order.fulfillmentMode}
            publicToken={order.publicToken}
          />
          {/* Phase B: ที่อยู่จัดส่ง — render เฉพาะเมื่อ order มี shippingAddress */}
          {shippingAddr && <ShippingAddress address={shippingAddr} />}
          {/* CancelZone — danger card สำหรับยกเลิก order (PENDING/SHIPPED เท่านั้น; terminal state คืน null) */}
          <CancelZone publicToken={order.publicToken} status={order.status} />
          {/* review card: compose กลับตาม retro action #4 + #9 — trust-critical info ที่ seller ต้องเห็น */}
          <OrderReviewCard review={reviewData} />
        </div>
      </div>
    </>
  )
}
