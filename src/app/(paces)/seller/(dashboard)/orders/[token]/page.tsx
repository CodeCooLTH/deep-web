/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/page.tsx
 *
 * v5 (T11) — ผสาน component ใหม่ทั้งหมดของ redesign v5 (S-1..S-9, S-12 wiring):
 *   docs/superpowers/specs/2026-07-31-seller-order-detail-v5-design.md
 *   docs/scope/2026-07-31-seller-order-detail-v5-scope-baseline.md
 * - StatusHero (T7) = หัวหน้าเต็มความกว้างเหนือ grid (ปุ่ม inline+stuck ในตัวเอง ผ่าน onAction)
 * - OrderProgressStepper (2026-08-04) = แถบสถานะเต็มความกว้าง คั่นระหว่างหัวการ์ดกับ grid
 *   render จาก OrderDetailClient ไม่ใช่ children เพราะ derive จาก props ที่ shell ถืออยู่แล้ว
 * - grid 75/25 (`grid grid-cols-1 lg:grid-cols-4 gap-base`): ซ้าย col-span-3 = OrderFactsCard
 *   (การ์ด "ใบสั่งซื้อ" รวม 3 section — ผู้ซื้อ+ที่อยู่ / รายการ+เงิน+ชำระเงิน / การจัดส่ง, T6)
 *   ขวา col-span-1 = OrderReviewCard (เฉพาะ CONFIRMED ที่มีรีวิวจริง, T3)
 * - OrderActionBar variant="bottom" (T8, <1024) + ShipmentEntryModal (T9, controlled by
 *   OrderDetailClient) แทนที่ SellerBottomNav ของหน้านี้ (S-7 ตัดไปแล้วที่ SellerBottomNav.tsx)
 * - onAction ต่อ logic จริง (ยิง API/Swal/clipboard/เปิด modal) ใน OrderDetailClient.tsx —
 *   page.tsx (RSC) ส่งฟังก์ชันข้ามขอบเขต server→client ไม่ได้ จึงมี client wrapper เดียวเป็นเจ้าของ
 *   handler ทั้งหมด ส่วน OrderFactsCard/OrderReviewCard ยังส่งผ่าน `children`
 *   จาก RSC ตรง ๆ (ไม่ลากเข้า client bundle)
 * - shipmentSource ('MANUAL'|'ISHIP'|null): ISHIP เมื่อมี OrderShipment ที่ยัง active
 *   (shipmentPanel.shipment, ไม่ CANCELLED) MANUAL เมื่อมี order.shipmentTracking — คุมว่ามีปุ่ม
 *   "แก้ไขเลขพัสดุ" ไหม (ผ่าน getOrderActionSet, S-12)
 * - ลบ (ไม่มีใคร import แล้ว — verified grep): OrderSummary.tsx, CustomerDetails.tsx,
 *   PaymentCard.tsx, ShippingCard.tsx — เนื้อหารวมเข้า OrderFactsCard.tsx หมดแล้ว (T6)
 * - คง: data fetching (getOrderForShop + buyer.avatar + product.images), auth guard, shop
 *   ownership check, PII neutralize ที่ server boundary (S-C1 — ห้ามแตะ; ไม่ใช่ "mask" — โชว์เบอร์เต็ม
 *   ตามมติ user 2026-07-30, ดู comment ที่ reviewerLabel ด้านล่าง), Date→ISO ก่อนส่งข้าม RSC
 *
 * T12 (browser QA fix) — RSC serialization error "Only plain objects can be passed to Client
 * Components": OrderFactsCard เป็น 'use client' รับ items[].price/discount/vatRate/vatAmount/
 * totalAmount เป็น Prisma `Decimal` ดิบ (ไม่ใช่ plain object) ข้ามขอบเขต RSC→client ไม่ได้ — แปลงเป็น
 * `Number()` ที่ server boundary นี้ก่อนส่งทุกจุด (เหมือน Date→ISO ที่ทำอยู่แล้ว)
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
import { resolveOrderVocab } from '@/lib/seller-menu'
import { resolveBuyerDisplayName, isCODPayment } from '@/lib/order-display'
import OrderDetailClient from './components/OrderDetailClient'
import ShippingActivity from './components/ShippingActivity'
import CustomerDetails from './components/CustomerDetails'
import ShippingAddressCard from './components/ShippingAddress'
import BillingDetails from './components/BillingDetails'
import ShippingCard from './components/ShippingCard'
import { getOrderEvents } from '@/services/order-event.service'
import { getCustomerSummary } from '@/services/customer.service'
import type { ShippingAddressData, OrderFactsShipping } from './components/order-detail-shared'
import OrderReviewCard from './components/OrderReviewCard'
import type { OrderReviewData } from './components/OrderReviewCard'
import type { ShipmentSource } from './components/order-action-set'

/**
 * feature 00030 — ชื่อหน้าผันตามประเภทกิจการ (constant ไม่รู้จัก shop ของ request)
 * resolve ไม่ได้ → ตกไปชุด ONLINE_SALES ตาม fail-safe ของ SSOT
 */
export async function generateMetadata(): Promise<Metadata> {
  const session = await getServerSession(authOptions)
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } }
  ).catch(() => null)
  return { title: `รายละเอียด${resolveOrderVocab(active?.shop?.vertical ?? '').noun}` }
}

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
  // feature 00030 — คลังคำผันตามประเภทกิจการ ใช้ทั้ง h1/breadcrumb และส่งลง client components
  const vocab = resolveOrderVocab(shop.vertical)

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

  // ประวัติกิจกรรม (feature 00031) — ownership scope มาแล้วจาก getOrderForShop ด้านบน
  const orderEvents = await getOrderEvents(order.id)

  // ตัวเลขจริงของลูกค้ารายนี้กับร้านนี้ (scope shopId เสมอ) — เติมการ์ด "ผู้ซื้อ" ที่ user บอกว่าข้อมูลน้อย
  const customerSummary = await getCustomerSummary(order.customerId ?? null, shop.id)

  // แปลง Date → ISO string ก่อนส่งข้ามขอบเขต RSC → component
  // เพื่อหลีกเลี่ยง "Cannot serialize Date" error ของ Next.js
  const createdAtISO = (order.createdAt as Date).toISOString()

  /**
   * feature 00030 D-1 — กล่องยืนยันยกเลิกเคยบอกทุกร้านว่า "สินค้าจะถูกคืนเข้าสต็อก" ซึ่งเป็นเท็จ
   * กับร้านส่วนใหญ่: restockFromCancelledOrder คืนเฉพาะ OrderItem ที่ stockDeducted != null
   * (เซ็ตตอนตัดสต็อกผ่าน Inventory Add-on เท่านั้น) ไม่มีเลย → short-circuit return ทันที
   *
   * เงื่อนไขจริงคือ stockDeducted ไม่ใช่ vertical — ร้านขายออนไลน์ที่ไม่ได้ซื้อ add-on ก็ต้องได้
   * ข้อความที่ไม่สัญญาการคืนสต็อกเหมือนกัน จึงคำนวณจากข้อมูลจริงของออเดอร์ ไม่ derive จาก vertical
   */
  const hasDeductedStock = ((order.items ?? []) as Array<{ stockDeducted: number | null }>).some(
    i => i.stockDeducted != null
  )

  // สร้าง review data — ส่งข้าม RSC boundary ที่นี่ (S-C1: neutralize-at-source, ไม่ใช่ "mask")
  // user decision 2026-07-30: โชว์เบอร์/ชื่อผู้ซื้อเต็มทั้งหน้า (ไม่มาส์ก)
  // เดิมมาส์กเหลือ 4 ตัวท้ายตาม S-C1 แต่ทำให้ขัดกันเอง — การ์ดจัดส่ง (iShip) โชว์เบอร์เต็ม
  // อยู่แล้วบนจอเดียวกัน การมาส์กฝั่งซ้ายจึงไม่ได้กันอะไร มีแต่ทำให้ร้านกดโทรหาลูกค้าไม่ได้
  // หน้านี้โหลดได้เฉพาะเจ้าของร้านที่เป็นเจ้าของออเดอร์ (scope shopId ใน WHERE) — flight payload
  // จึงไม่ได้ส่งให้ใครที่ไม่ควรเห็นอยู่แล้ว — reviewerLabel จึงเป็น raw contact/displayName ตรง ๆ
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
        // reviewerLabel คือ raw contact/displayName จาก server (ไม่ mask — ดู comment ด้านบน)
        reviewerLabel,
        createdAtISO: (order.review.createdAt as Date).toISOString()
      }
    : null
  // S-4: การ์ดรีวิวแสดงเฉพาะ CONFIRMED ที่มีรีวิวจริง (ไม่ใช่ empty-state) — status อื่นไม่ render เลย
  const showReviewCard = order.status === 'CONFIRMED' && reviewData !== null

  // เบอร์ผู้ซื้อ — ส่งเต็มไปแสดง (user decision 2026-07-30) พร้อมทำเป็นลิงก์ tel: ให้กดโทรได้
  const buyerContact: string | null = order.buyerContact ?? null

  // resolve ฝั่ง server แล้วส่งเป็นสตริงเดียว — ไม่ส่ง field ผู้ซื้อดิบข้าม client boundary
  // เกินจำเป็น (หน้า (paces) อยู่ใต้ client layout, Next serialize ทุก prop ลง flight payload)
  const buyerLabel = resolveBuyerDisplayName({
    buyerDisplayName: order.buyer?.displayName ?? null,
    buyerUsername: order.buyer?.username ?? null,
    buyerName: order.buyerName ?? null,
    hasContact: Boolean(buyerContact)
  })

  // Phase B: shippingAddress เป็น Json (Prisma คืน object แล้ว) — render card เฉพาะเมื่อมีค่าจริง
  const rawAddr = order.shippingAddress
  const shippingAddr: ShippingAddressData | null =
    rawAddr && typeof rawAddr === 'object' && Object.values(rawAddr).some(v => v && String(v).trim())
      ? (rawAddr as ShippingAddressData)
      : null

  // ที่อยู่จัดส่งรวมเป็นบรรทัดเดียว — payload ของ action "copy-address" (clipboard)
  const addressText: string | null = shippingAddr
    ? [
        shippingAddr.line1,
        [shippingAddr.subdistrict, shippingAddr.district].filter(Boolean).join(' '),
        [shippingAddr.province, shippingAddr.postcode].filter(Boolean).join(' ')
      ]
        .filter(l => l && String(l).trim())
        .join(', ')
    : null

  // shipmentSource — ตัดสินจาก 2 แหล่ง: ISHIP (OrderShipment ที่ยัง active, ไม่ CANCELLED) ก่อน
  // MANUAL (order.shipmentTracking) — ทั้งสองไม่ควรมีพร้อมกันตาม business flow ปกติของระบบ
  // (feat 00022: ห้ามเขียน ShipmentTracking ให้ออเดอร์ที่ใช้ iShip) แต่ถ้าเกิดขึ้นจริง ให้ ISHIP
  // ชนะเพราะเป็น system-generated source of truth
  const shipmentSource: ShipmentSource = shipmentPanel?.shipment ? 'ISHIP' : order.shipmentTracking ? 'MANUAL' : null

  // ข้อมูลการจัดส่งสำหรับ OrderFactsCard (section 3) + prefill ShipmentEntryModal (mode='edit')
  const shippingInfo: OrderFactsShipping | null =
    shipmentSource === 'ISHIP'
      ? {
          courier: shipmentPanel!.shipment!.courierName ?? '—',
          trackingNo: shipmentPanel!.shipment!.trackingNo ?? '—',
          shippedAtISO: shipmentPanel!.shipment!.createdAt.toISOString(),
          isIship: true
        }
      : shipmentSource === 'MANUAL'
        ? {
            courier: order.shipmentTracking.provider,
            trackingNo: order.shipmentTracking.trackingNo,
            shippedAtISO: (order.shipmentTracking.createdAt as Date).toISOString(),
            isIship: false
          }
        : null

  return (
    <>
      {/* P6 (T14): หน้านี้ไม่มี h1 เลย (PageBreadcrumb เป็น shared component ใช้ h4 — แก้เองไม่ได้,
          กระทบทุกหน้า seller/admin ที่ใช้ breadcrumb ร่วมกัน จึงรายงานแทนแก้ตรงนั้น) เพิ่ม h1
          visually-hidden เฉพาะไฟล์ของหน้านี้แทน (sr-only เป็น convention เดิมของโปรเจกต์ — ดู
          seller/(dashboard)/products/components/ProductBasicCardV2.tsx) ให้ screen reader เจอ h1
          จริงโดยไม่กระทบภาพที่ user เห็น (breadcrumb ยังโชว์ title แบบเดิมทุกอย่าง) */}
      <h1 className='sr-only'>รายละเอียด{vocab.noun}</h1>

      <PageBreadcrumb title={`รายละเอียด${vocab.noun}`} trail={[{ label: vocab.noun, href: '/orders' }]} />

      <OrderDetailClient
        vocab={vocab}
        hasDeductedStock={hasDeductedStock}
        publicToken={order.publicToken}
        shortCode={order.shortCode ?? null}
        status={order.status}
        type={order.type}
        createdAtISO={createdAtISO}
        fulfillmentMode={order.fulfillmentMode}
        isFromAuction={Boolean(order.auctionId)}
        salesChannel={order.salesChannel ?? null}
        buyerLabel={buyerLabel}
        totalAmount={Number(order.totalAmount)}
        paymentMethod={order.paymentMethod ?? null}
        slipFileId={order.slipFileId ?? null}
        shipmentSource={shipmentSource}
        ishipContext={shipmentPanel ? toShipmentContextJson(shipmentPanel) : null}
        hasIshipShipment={Boolean(shipmentPanel?.shipment)}
        trackingNo={shippingInfo?.trackingNo ?? null}
        provider={shippingInfo?.courier ?? null}
        addressText={addressText}
        isCodUnpaid={isCODPayment(order.paymentMethod) && !order.codReceivedAt}
        buyerAvatar={order.buyer?.avatar ?? null}
        internalNote={order.internalNote ?? null}
        items={(order.items ?? []).map((item: any) => {
          const rawImages = Array.isArray(item.product?.images) ? item.product.images : []
          const firstImg: string = rawImages[0] ?? ''
          const imageUrl: string | null = firstImg
            ? firstImg.startsWith('http')
              ? firstImg
              : `/api/files/${firstImg}`
            : null
          return {
            id: item.id,
            name: item.name,
            description: item.description ?? null,
            qty: item.qty,
            // Decimal (Prisma) ไม่ใช่ plain object — ข้าม RSC→client boundary ไม่ได้
            price: Number(item.price),
            imageUrl
          }
        })}
        discount={order.discount != null ? Number(order.discount) : null}
        vatRate={order.vatRate != null ? Number(order.vatRate) : null}
        vatAmount={order.vatAmount != null ? Number(order.vatAmount) : null}
        orderNoun={vocab.noun}
        codReceivedAtISO={order.codReceivedAt ? (order.codReceivedAt as Date).toISOString() : null}
        codReceivedByLabel={order.codReceivedBy?.displayName ?? order.codReceivedBy?.username ?? null}
        isCod={isCODPayment(order.paymentMethod)}
        shippingActivity={<ShippingActivity events={orderEvents} orderNoun={vocab.noun} />}
        customerCard={
          <CustomerDetails
            summary={customerSummary}
            salesChannel={order.salesChannel ?? null}
            buyer={{
              buyerContact,
              buyerDisplayName: order.buyer?.displayName ?? null,
              buyerUsername: order.buyer?.username ?? null,
              buyerName: order.buyerName ?? null,
              avatar: order.buyer?.avatar ?? null,
              shippingAddr
            }}
          />
        }
        sideCards={
          <>
            <ShippingAddressCard
              accessUrl={order.accessUrl ?? null}
              fulfillmentMode={order.fulfillmentMode}
              publicToken={order.publicToken}
              shippingAddr={shippingAddr}
            />
            {/* ใต้ "ที่อยู่จัดส่ง" (user 2026-08-05) — ของสองอย่างนี้ตอบคำถามเดียวกันว่า
                "ของไปถึงไหนแล้ว/จะไปที่ไหน" อยู่ติดกันแล้วอ่านต่อเนื่องกว่าแยกคนละคอลัมน์ */}
            <ShippingCard
              iship={
                shipmentPanel?.shipment
                  ? {
                      id: shipmentPanel.shipment.id,
                      status: shipmentPanel.shipment.status,
                      carrierStatus: shipmentPanel.shipment.carrierStatus ?? null,
                      courierName: shipmentPanel.shipment.courierName ?? null,
                      courierCode: shipmentPanel.shipment.courierCode ?? null,
                      trackingNo: shipmentPanel.shipment.trackingNo ?? null,
                      isDryRun: Boolean(shipmentPanel.shipment.isDryRun),
                      lastTracedAtISO: shipmentPanel.shipment.carrierStatusAt
                        ? (shipmentPanel.shipment.carrierStatusAt as Date).toISOString()
                        : null
                    }
                  : null
              }
              manual={
                shipmentSource === 'MANUAL'
                  ? {
                      provider: order.shipmentTracking.provider,
                      trackingNo: order.shipmentTracking.trackingNo,
                      shippedAtISO: (order.shipmentTracking.createdAt as Date).toISOString()
                    }
                  : null
              }
            />

            {/* COD มีการ์ด "เก็บเงินปลายทาง" ของตัวเองแล้ว ซึ่งบอกวิธีชำระ/สถานะ/ยอด ครบทุกบรรทัด
                — แสดงทั้งคู่ = ข้อมูลเดียวกันโผล่ 2 การ์ดในจอเดียว (user ทัก 2026-08-05) */}
            {!isCODPayment(order.paymentMethod) && (
              <BillingDetails
                paymentMethod={order.paymentMethod ?? null}
                salesChannel={order.salesChannel ?? null}
                slipFileId={order.slipFileId ?? null}
                status={order.status}
              />
            )}
            {showReviewCard && <OrderReviewCard orderNoun={vocab.noun} review={reviewData} />}
          </>
        }
      />
    </>
  )
}
