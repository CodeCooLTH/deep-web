/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/page.tsx
 *
 * v5 (T11) — ผสาน component ใหม่ทั้งหมดของ redesign v5 (S-1..S-9, S-12 wiring):
 *   docs/superpowers/specs/2026-07-31-seller-order-detail-v5-design.md
 *   docs/scope/2026-07-31-seller-order-detail-v5-scope-baseline.md
 * - StatusHero (T7) = หัวหน้าเต็มความกว้างเหนือ grid (ปุ่ม inline+stuck ในตัวเอง ผ่าน onAction)
 * - grid 75/25 (`grid grid-cols-1 lg:grid-cols-4 gap-base`): ซ้าย col-span-3 = OrderFactsCard
 *   (การ์ด "ใบสั่งซื้อ" รวม 3 section — ผู้ซื้อ+ที่อยู่ / รายการ+เงิน+ชำระเงิน / การจัดส่ง, T6)
 *   ขวา col-span-1 = OrderReviewCard (เฉพาะ CONFIRMED ที่มีรีวิวจริง, T3) → ShippingActivity (T2)
 * - OrderActionBar variant="bottom" (T8, <1024) + ShipmentEntryModal (T9, controlled by
 *   OrderDetailClient) แทนที่ SellerBottomNav ของหน้านี้ (S-7 ตัดไปแล้วที่ SellerBottomNav.tsx)
 * - onAction ต่อ logic จริง (ยิง API/Swal/clipboard/เปิด modal) ใน OrderDetailClient.tsx —
 *   page.tsx (RSC) ส่งฟังก์ชันข้ามขอบเขต server→client ไม่ได้ จึงมี client wrapper เดียวเป็นเจ้าของ
 *   handler ทั้งหมด ส่วน OrderFactsCard/OrderReviewCard/ShippingActivity ยังส่งผ่าน `children`
 *   จาก RSC ตรง ๆ (ไม่ลากเข้า client bundle)
 * - shipmentSource ('MANUAL'|'ISHIP'|null): ISHIP เมื่อมี OrderShipment ที่ยัง active
 *   (shipmentPanel.shipment, ไม่ CANCELLED) MANUAL เมื่อมี order.shipmentTracking — คุมว่ามีปุ่ม
 *   "แก้ไขเลขพัสดุ" ไหม (ผ่าน getOrderActionSet, S-12)
 * - ลบ (ไม่มีใคร import แล้ว — verified grep): OrderSummary.tsx, CustomerDetails.tsx,
 *   PaymentCard.tsx, ShippingCard.tsx — เนื้อหารวมเข้า OrderFactsCard.tsx หมดแล้ว (T6)
 * - คง: data fetching (getOrderForShop + buyer.avatar + product.images), auth guard, shop
 *   ownership check, PII mask/neutralize ที่ server boundary (S-C1 — ห้ามแตะ), Date→ISO ก่อนส่งข้าม RSC
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
import OrderDetailClient from './components/OrderDetailClient'
import OrderFactsCard from './components/OrderFactsCard'
import type { ShippingAddressData, OrderFactsShipping } from './components/OrderFactsCard'
import ShippingActivity from './components/ShippingActivity'
import OrderReviewCard from './components/OrderReviewCard'
import type { OrderReviewData } from './components/OrderReviewCard'
import type { ShipmentSource } from './components/order-action-set'

export const metadata: Metadata = { title: 'รายละเอียดคำสั่งซื้อ' }

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

  // สร้าง review data — mask PII ที่ RSC boundary ก่อนส่งข้าม (S-C1)
  // ห้ามส่ง raw phone/email ข้ามขอบเขต RSC→client แม้แต่ฟิลด์เดียว
  // เฉพาะ masked string หรือ displayName (public) เท่านั้นที่ข้ามได้
  // user decision 2026-07-30: โชว์เบอร์เต็มทั้งหน้า
  // เดิมมาส์กเหลือ 4 ตัวท้ายตาม S-C1 แต่ทำให้ขัดกันเอง — การ์ดจัดส่ง (iShip) โชว์เบอร์เต็ม
  // อยู่แล้วบนจอเดียวกัน การมาส์กฝั่งซ้ายจึงไม่ได้กันอะไร มีแต่ทำให้ร้านกดโทรหาลูกค้าไม่ได้
  // หน้านี้โหลดได้เฉพาะเจ้าของร้านที่เป็นเจ้าของออเดอร์ (scope shopId ใน WHERE) — flight payload
  // จึงไม่ได้ส่งให้ใครที่ไม่ควรเห็นอยู่แล้ว
  const reviewerLabel: string = (() => {
    if (order.buyer?.displayName) return order.buyer.displayName
    const raw = order.review?.reviewerContact ?? order.buyerContact ?? null
    if (raw) return raw
    return 'ผู้ซื้อ (ไม่ระบุชื่อ)'
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
  // S-4: การ์ดรีวิวแสดงเฉพาะ CONFIRMED ที่มีรีวิวจริง (ไม่ใช่ empty-state) — status อื่นไม่ render เลย
  const showReviewCard = order.status === 'CONFIRMED' && reviewData !== null

  // เบอร์ผู้ซื้อ — ส่งเต็มไปแสดง (user decision 2026-07-30) พร้อมทำเป็นลิงก์ tel: ให้กดโทรได้
  const buyerContact: string | null = order.buyerContact ?? null

  // Phase B: shippingAddress เป็น Json (Prisma คืน object แล้ว) — render card เฉพาะเมื่อมีค่าจริง
  const rawAddr = order.shippingAddress
  const shippingAddr: ShippingAddressData | null =
    rawAddr && typeof rawAddr === 'object' && Object.values(rawAddr).some((v) => v && String(v).trim())
      ? (rawAddr as ShippingAddressData)
      : null

  // ที่อยู่จัดส่งรวมเป็นบรรทัดเดียว — payload ของ action "copy-address" (clipboard)
  const addressText: string | null = shippingAddr
    ? [
        shippingAddr.line1,
        [shippingAddr.subdistrict, shippingAddr.district].filter(Boolean).join(' '),
        [shippingAddr.province, shippingAddr.postcode].filter(Boolean).join(' '),
      ]
        .filter((l) => l && String(l).trim())
        .join(', ')
    : null

  // shipmentSource — ตัดสินจาก 2 แหล่ง: ISHIP (OrderShipment ที่ยัง active, ไม่ CANCELLED) ก่อน
  // MANUAL (order.shipmentTracking) — ทั้งสองไม่ควรมีพร้อมกันตาม business flow ปกติของระบบ
  // (feat 00022: ห้ามเขียน ShipmentTracking ให้ออเดอร์ที่ใช้ iShip) แต่ถ้าเกิดขึ้นจริง ให้ ISHIP
  // ชนะเพราะเป็น system-generated source of truth
  const shipmentSource: ShipmentSource = shipmentPanel?.shipment
    ? 'ISHIP'
    : order.shipmentTracking
      ? 'MANUAL'
      : null

  // ข้อมูลการจัดส่งสำหรับ OrderFactsCard (section 3) + prefill ShipmentEntryModal (mode='edit')
  const shippingInfo: OrderFactsShipping | null =
    shipmentSource === 'ISHIP'
      ? {
          courier: shipmentPanel!.shipment!.courierName ?? '—',
          trackingNo: shipmentPanel!.shipment!.trackingNo ?? '—',
          shippedAtISO: shipmentPanel!.shipment!.createdAt.toISOString(),
          isIship: true,
        }
      : shipmentSource === 'MANUAL'
        ? {
            courier: order.shipmentTracking.provider,
            trackingNo: order.shipmentTracking.trackingNo,
            shippedAtISO: (order.shipmentTracking.createdAt as Date).toISOString(),
            isIship: false,
          }
        : null

  return (
    <>
      <PageBreadcrumb
        title="รายละเอียดคำสั่งซื้อ"
        trail={[{ label: 'คำสั่งซื้อ', href: '/orders' }]}
      />

      <OrderDetailClient
        publicToken={order.publicToken}
        shortCode={order.shortCode ?? null}
        status={order.status}
        type={order.type}
        createdAtISO={createdAtISO}
        fulfillmentMode={order.fulfillmentMode}
        isFromAuction={Boolean(order.auctionId)}
        totalAmount={Number(order.totalAmount)}
        paymentMethod={order.paymentMethod ?? null}
        slipFileId={order.slipFileId ?? null}
        shipmentSource={shipmentSource}
        ishipContext={shipmentPanel ? toShipmentContextJson(shipmentPanel) : null}
        hasIshipShipment={Boolean(shipmentPanel?.shipment)}
        trackingNo={shippingInfo?.trackingNo ?? null}
        provider={shippingInfo?.courier ?? null}
        addressText={addressText}
      >
        {/* grid 75/25 (≥1024) · คอลัมน์เดียว (<1024) — Base: order-details/page.tsx
            `grid grid-cols-1 lg:grid-cols-4 gap-base` + `space-y-base lg:col-span-3` */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-base">
          {/* ซ้าย — col-span-3 (75%): การ์ด "ใบสั่งซื้อ" (ข้อเท็จจริง — เห็นหมดเสมอ ไม่มีกาง/พับ) */}
          <div className="space-y-base lg:col-span-3">
            <OrderFactsCard
              buyer={{
                buyerContact,
                buyerDisplayName: order.buyer?.displayName ?? null,
                buyerUsername: order.buyer?.username ?? null,
                buyerName: order.buyerName ?? null,
                // avatar: Facebook CDN URL หรือ null (ไม่ใช่ PII — URL สาธารณะ) — ส่งได้ตาม spec
                avatar: order.buyer?.avatar ?? null,
                shippingAddr,
              }}
              items={(order.items ?? []).map((item: any) => {
                // resolve imageUrl server-side — pattern เดียวกับ products/page.tsx L98-99
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
              })}
              discount={order.discount ?? null}
              vatRate={order.vatRate ?? null}
              vatAmount={order.vatAmount ?? null}
              totalAmount={order.totalAmount}
              paymentMethod={order.paymentMethod ?? null}
              salesChannel={order.salesChannel ?? null}
              slipFileId={order.slipFileId ?? null}
              accessUrl={order.accessUrl ?? null}
              fulfillmentMode={order.fulfillmentMode}
              publicToken={order.publicToken}
              status={order.status}
              shipping={shippingInfo}
            />
          </div>

          {/* ขวา — col-span-1 (25%): รีวิว (เมื่อมี) → ประวัติคำสั่งซื้อ (เหตุการณ์ อ่านอย่างเดียว) */}
          <div className="space-y-base">
            {showReviewCard && <OrderReviewCard review={reviewData} />}
            <ShippingActivity
              data={{
                status: order.status,
                fulfillmentMode: order.fulfillmentMode,
                createdAtISO,
                updatedAtISO: (order.updatedAt as Date).toISOString(),
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
      </OrderDetailClient>
    </>
  )
}
