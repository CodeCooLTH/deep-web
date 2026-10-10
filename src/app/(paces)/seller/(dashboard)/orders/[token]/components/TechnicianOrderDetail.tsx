/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/page.tsx
 *
 * หน้ารายละเอียดออเดอร์ของ "ช่าง" (ระดับเงิน NONE) — 00071 P3 · S-15
 *
 * 🛑 ทำไมเป็นหน้าแยก ไม่ใช่ OrderDetailClient + ซ่อนการ์ดเงิน: OrderDetailClient รับยอด/วิธีชำระ/สลิป/ส่วนลด/VAT/มัดจำเป็น prop
 * หน้านี้อยู่ใต้ client layout ทุก prop ที่ส่งข้ามเส้นลง flight payload ครบ แม้การ์ดเลือกไม่ render
 * (docs/conventions/permission-gate-follows-the-row.md) — ที่นี่รับเฉพาะ `toNoMoneyOrder()` (allow-list) แล้วประกอบจอจากมัน
 * ไม่มีทางที่ price/totalAmount/payments จะอยู่ในมือของ component ใดในไฟล์นี้
 *
 * โครง (UX spec §4): มือถือ ลูกค้า → นัดหมาย → สรุป+รายการ+หมายเหตุภายใน → ประวัติ
 *   เดสก์ท็อป ซ้าย 3/4 = สรุป+ประวัติ · ขวา 1/4 = ลูกค้า+นัดหมาย (`order-first lg:order-none`) · ไม่มี OrderActionBar
 * ไม่ render: Cod/PaymentReceived/Profit/Billing/Shipping/ShippingAddress/ShipmentEvidence/รีวิว
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { prisma } from '@/lib/prisma'
import { getOrderEvents } from '@/services/order-event.service'
import { filterOrderEventsForNoMoney } from '@/lib/order-view-by-level'
import { resolveOrderSource } from '@/lib/order-source-channel'
import { resolveOrderBuyerNameForShop, usesTypedBuyerName } from '@/lib/buyer-name'
import { deriveAppointmentStage } from '@/lib/appointment-stage'
import { isAllDayAppointment } from '@/lib/appointments'
import { toFileUrl } from '@/lib/file-url'
import { can, type ShopRole } from '@/lib/shop-permissions'
import { resolveShopVertical } from '@/lib/lodging'
import type { OrderVocab } from '@/lib/seller-menu'
import OrderSummary from './OrderSummary'
import ShippingActivity from './ShippingActivity'
import CustomerDetails from './CustomerDetails'
import AppointmentCard from './AppointmentCard'
import type { ShippingAddressData } from './order-detail-shared'

type Props = {
  /** ผลจาก `toNoMoneyOrder()` เท่านั้น — ห้ามส่งแถวดิบจาก prisma เข้ามา */
  order: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  shop: { vertical: string }
  vocab: OrderVocab
  viewerRoles: readonly ShopRole[]
  fbPageAvatar: string | null
}

export default async function TechnicianOrderDetail({ order, shop, vocab, viewerRoles, fbPageAvatar }: Props) {
  const events = filterOrderEventsForNoMoney(await getOrderEvents(order.id))
  // นับเฉพาะใบที่มีนัดจริง — เหมือนหน้าเต็ม (ownership scope มาแล้วจาก getOrderForShop)
  const rescheduleCount = order.serviceStart
    ? await prisma.appointmentReschedule.count({ where: { orderId: order.id } })
    : 0

  const orderSource = resolveOrderSource({
    salesChannel: order.salesChannel ?? null,
    shopChannel: order.shopChannel ?? null,
    legacyFacebookPageAvatar: fbPageAvatar,
  })

  const rawAddr = order.shippingAddress
  const shippingAddr: ShippingAddressData | null =
    rawAddr && typeof rawAddr === 'object' && Object.values(rawAddr).some((v) => v && String(v).trim())
      ? (rawAddr as ShippingAddressData)
      : null

  const items = (order.items ?? []).map((item: any) => {
    const rawImages = Array.isArray(item.product?.images) ? item.product.images : []
    const first: string = rawImages[0] ?? ''
    return {
      id: item.id,
      name: item.name,
      description: item.description ?? null,
      qty: item.qty,
      imageUrl: first ? toFileUrl(first) : null,
    }
  })

  return (
    <>
      <h1 className="sr-only">รายละเอียด{vocab.noun}</h1>
      <PageBreadcrumb title={`รายละเอียด${vocab.noun}`} trail={[{ label: vocab.noun, href: '/orders' }]} />

      <div className="grid grid-cols-1 gap-base lg:grid-cols-4">
        <div className="space-y-base lg:col-span-3">
          <OrderSummary
            publicToken={order.publicToken}
            status={order.status}
            createdAtISO={(order.createdAt as Date).toISOString()}
            salesChannel={orderSource.channel}
            pageLogoUrl={orderSource.logoUrl}
            internalNote={order.internalNote ?? null}
            isFromAuction={Boolean(order.auctionId)}
            items={items}
            orderNoun={vocab.noun}
            vocab={vocab}
            vertical={resolveShopVertical(shop.vertical)}
          />
          <ShippingActivity
            events={events}
            orderNoun={vocab.noun}
            createLabel={vocab.createLabel}
            serviceVocab={shop.vertical === 'SERVICE_QUEUE' ? vocab : undefined}
          />
        </div>

        <div className="order-first space-y-base lg:order-none">
          {/* ไม่ส่ง summary/profileKey: ลิงก์ไปโปรไฟล์ลูกค้า + "สั่งกับร้านนี้ N ครั้ง/ลูกค้าตั้งแต่" เป็นข้อมูลยอดขายของลูกค้า */}
          <CustomerDetails
            summary={null}
            salesChannel={order.salesChannel ?? null}
            profileKey={null}
            buyerNoun={vocab.buyerNoun}
            buyer={{
              buyerContact: order.buyerContact ?? null,
              buyerDisplayName: order.buyer?.displayName ?? null,
              buyerUsername: order.buyer?.username ?? null,
              buyerName: order.buyerName ?? null,
              typedNameFirst: usesTypedBuyerName(shop.vertical),
              avatar: order.buyer?.avatar ?? null,
              shippingAddr,
            }}
          />
          {order.serviceStart && (
            <AppointmentCard
              // ช่าง: ปิดผลได้ (O4) · เลื่อนนัด (O3) กับส่งสรุปนัด (H1) ไม่ได้ — สิทธิ์อ่านจากบทบาทจริง ไม่ฮาร์ดโค้ด
              canReschedule={can(viewerRoles, 'O3')}
              canOutcome={can(viewerRoles, 'O4')}
              canSendSummary={can(viewerRoles, 'H1')}
              publicToken={order.publicToken}
              startISO={new Date(order.serviceStart).toISOString()}
              createdAtISO={new Date(order.createdAt).toISOString()}
              endISO={order.serviceEnd ? new Date(order.serviceEnd).toISOString() : null}
              allDay={
                order.serviceEnd ? isAllDayAppointment(new Date(order.serviceStart), new Date(order.serviceEnd)) : false
              }
              resourceName={order.serviceResource?.name ?? null}
              resourceId={order.serviceResourceId ?? null}
              rescheduleCount={rescheduleCount}
              rescheduleRequestNote={order.rescheduleRequestNote ?? null}
              stage={
                deriveAppointmentStage({
                  serviceStart: order.serviceStart,
                  appointmentStatus: order.appointmentStatus,
                }) ?? 'SCHEDULED'
              }
              buyerLabel={
                resolveOrderBuyerNameForShop(shop.vertical, {
                  typedName: order.buyerName,
                  accountName: order.buyer?.displayName,
                }).name
              }
            />
          )}
        </div>
      </div>
    </>
  )
}
