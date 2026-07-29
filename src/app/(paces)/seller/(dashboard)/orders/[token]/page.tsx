/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/page.tsx
 *
 * Re-source จาก Paces order-details (layout re-arrange 2026-06-16):
 * - StatusHeroV2 = full-width top bar (title + action bar: primary CTA + ⋮ overflow incl. ยกเลิก)
 * - 70/30 grid (lg:grid-cols-4): LEFT col-span-3 = CustomerDetails → OrderSummary → OrderReviewCard
 *   RIGHT col-span-1 = ShippingAddress → PaymentCard → ShippingActivity
 * - action/cancel ย้ายเข้า StatusHeroV2 (⋮ overflow) ทั้งหมด — ไม่มี OrderActionPanel/CancelZone card
 * - theme-fidelity: CustomerDetails (avatar จริง), OrderSummary (thumbnail สินค้า), ShippingActivity (narrow-fix)
 * - คง: data fetching (getOrderForShop + buyer.avatar + product.images), auth guard, shop ownership check
 * - PII: mask + neutralize raw contact ที่ server boundary ก่อนส่งข้าม RSC (S-C1) — ห้ามแตะ
 *   (avatar/imageUrl = URL ไม่ใช่ PII; product.images resolve เป็น imageUrl ที่ server ก่อนส่ง)
 * - Date → .toISOString() ก่อนส่งข้ามขอบเขต RSC→client component
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { getOrderForShop } from '@/services/order.service'
import { getShipmentPanel } from '@/services/iship.service'
import { toShipmentContextJson } from '@/lib/iship/context'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import StatusHero from './components/StatusHero'
import OrderSummary from './components/OrderSummary'
import CustomerDetails from './components/CustomerDetails'
import PaymentCard from './components/PaymentCard'
import OrderDetails from './components/OrderDetails'
import type { ShippingAddressData } from './components/CustomerDetails'
import ShippingActivity from './components/ShippingActivity'
import OrderReviewCard from './components/OrderReviewCard'
import ShipmentPanel from './components/ShipmentPanel'
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

  // Phase 4: resolve active shop (Personal หรือ Business ตาม context ที่สลับ) — membership guard ได้ฟรี
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
  if (!active) redirect('/orders')
  const shop = active.shop

  // DAL pattern: bake shopId filter เข้า query — กัน RSC flight-data leak
  // (redirect-after-fetch ไม่ได้ป้องกัน เพราะข้อมูล serialize เข้า flight ก่อน redirect throw)
  const orderRaw = await getOrderForShop(token, shop.id)
  if (!orderRaw) notFound()
  // cast any เพื่อรองรับ field ที่เข้าถึงแบบ dynamic (เช่น order.buyer ที่ไม่มีใน Prisma include)
  // runtime จะ return undefined ตามปกติ — ไม่กระทบ logic
  const order: any = orderRaw

  // feature 00022 — ข้อมูลส่วน "การจัดส่ง" (พัสดุ iShip)
  // คืน null เมื่อร้านไม่ได้เชื่อมต่อ หรือออเดอร์นี้ไม่เกี่ยวกับการส่งของ
  // (รับเอง/ดิจิทัล/บริการ/การจอง) → ไม่ render ส่วนนี้เลย ไม่ใช่โชว์กล่องเปล่า
  const shipmentPanel = await getShipmentPanel(shop.id, order.id)

  // แปลง Date → ISO string ก่อนส่งข้ามขอบเขต RSC → component
  // เพื่อหลีกเลี่ยง "Cannot serialize Date" error ของ Next.js
  const createdAtISO = (order.createdAt as Date).toISOString()
  const updatedAtISO = (order.updatedAt as Date).toISOString()

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

      {/* StatusHero — full-width เหนือ grid (T5: ย้ายออกจาก left column) */}
      <StatusHero
        publicToken={order.publicToken}
        shortCode={order.shortCode}
        status={order.status}
        type={order.type}
        createdAtISO={createdAtISO}
        fulfillmentMode={order.fulfillmentMode}
        isFromAuction={Boolean(order.auctionId)}
        ishipTrackingNo={shipmentPanel?.shipment?.trackingNo ?? null}
        ishipCourierName={shipmentPanel?.shipment?.courierName ?? null}
      />

      {/* mt-base คั่นระหว่าง top bar กับ grid — Paces spacing token (--spacing-base=20px) ห้ามใช้ mt-[20px] */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-base mt-base">
        {/* LEFT — col-span-3 (70%): CustomerDetails → OrderSummary → OrderReviewCard */}
        <div className="space-y-base lg:col-span-3">
          <CustomerDetails
            data={{
              // S-C1: ใช้ masked ที่คำนวณ+ neutralize raw บน order แล้วด้านบน
              buyerContactMasked,
              buyerDisplayName: order.buyer?.displayName ?? null,
              buyerUsername: order.buyer?.username ?? null,
              buyerName: order.buyerName ?? null,
              // avatar: Facebook CDN URL หรือ null (ไม่ใช่ PII — URL สาธารณะ) — ส่งได้ตาม spec
              avatar: order.buyer?.avatar ?? null,
              // shippingAddr: render อิสระจาก buyer-confirmed state (seller อาจกรอกก่อน)
              shippingAddr,
            }}
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
              items: (order.items ?? []).map((item: any) => {
                // resolve imageUrl server-side — pattern เดียวกับ products/page.tsx L98-99
                // images เป็น Json array of strings (full URL หรือ storage key)
                const rawImages = Array.isArray(item.product?.images) ? item.product.images : []
                const firstImg: string = rawImages[0] ?? ''
                const imageUrl: string | null = firstImg
                  ? (firstImg.startsWith('http') ? firstImg : `/api/files/${firstImg}`)
                  : null
                return {
                  id: item.id,
                  name: item.name,
                  description: item.description ?? null,
                  qty: item.qty,
                  price: item.price,
                  imageUrl,
                }
              }),
            }}
          />
          {/* review card: compose กลับตาม retro action #4 + #9 — trust-critical info ที่ seller ต้องเห็น */}
          <OrderReviewCard review={reviewData} />
        </div>

        {/* RIGHT — col-span-1 (30%): OrderDetails → PaymentCard → ShippingActivity */}
        <div className="space-y-base">
          {/* OrderDetails: วันที่สร้าง/อัปเดต/ชื่อร้าน — render เสมอ (แทน ShippingAddress slot) */}
          <OrderDetails
            createdAtISO={createdAtISO}
            updatedAtISO={updatedAtISO}
            shopName={order.shop?.shopName ?? '—'}
          />
          {/* PaymentCard — วิธีชำระ/ช่องทาง/สลิป/ลิงก์ดิจิทัล (ไม่ใช่ PII) */}
          <PaymentCard
            paymentMethod={order.paymentMethod ?? null}
            salesChannel={order.salesChannel ?? null}
            slipFileId={order.slipFileId ?? null}
            accessUrl={order.accessUrl ?? null}
            fulfillmentMode={order.fulfillmentMode}
            publicToken={order.publicToken}
            status={order.status}
          />
          {/* ShipmentPanel — พัสดุ iShip (feature 00022). Date → ISO ก่อนข้ามขอบเขต RSC
              (แปลงที่ toShipmentContextJson จุดเดียว ใช้ร่วมกับ API ที่โมดัลในแชทเรียก) */}
          {shipmentPanel && (
            <ShipmentPanel
              orderToken={order.publicToken}
              context={toShipmentContextJson(shipmentPanel)}
            />
          )}
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
      </div>
    </>
  )
}
