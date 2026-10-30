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
 * โครง (UX spec §4 + 00086 P3 ต้นแบบ `screenJob` ช่าง): มือถือ ลูกค้า → งานนี้ → รูปก่อน-หลัง → นัดหมาย → สรุป+รายการ+หมายเหตุภายใน → ประวัติ
 *   เดสก์ท็อป ซ้าย 3/4 = สรุป+ประวัติ · ขวา 1/4 = ลูกค้า+นัดหมาย (`order-first lg:order-none`) · ไม่มี OrderActionBar
 * ไม่ render: Cod/PaymentReceived/Profit/Billing/Shipping/ShippingAddress/ShipmentEvidence/รีวิว
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { prisma } from '@/lib/prisma'
import { getOrderEvents } from '@/services/order-event.service'
import { filterOrderEventsForNoMoney } from '@/lib/order-view-by-level'
import { resolveOrderSource } from '@/lib/order-source-channel'
import { usesTypedBuyerName } from '@/lib/buyer-name'
import { deriveAppointmentStage } from '@/lib/appointment-stage'
import { isAllDayAppointment } from '@/lib/appointments'
import { toFileUrl } from '@/lib/file-url'
import { can, canAssignServiceJob, canClaimServiceJob, isTechnicianOnly, type ShopRole } from '@/lib/shop-permissions'
import { resolveShopVertical } from '@/lib/lodging'
import type { OrderVocab } from '@/lib/seller-menu'
import OrderSummary from './OrderSummary'
import ShippingActivity from './ShippingActivity'
import CustomerDetails from './CustomerDetails'
import AppointmentCard from './AppointmentCard'
import ServiceJobCard from './ServiceJobCard'
import ServiceJobPhotosCard from '@/components/safepay/service-job/ServiceJobPhotosCard'
import { serviceJobFacts } from '@/components/safepay/service-job/service-job-facts'
import type { ServiceJobPhotoMode } from '@/lib/service-job'
import { resolveServiceStatusBadge, serviceArrivalOf } from '@/lib/service-status'
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import type { ShippingAddressData } from './order-detail-shared'

type Props = {
  /** ผลจาก `toNoMoneyOrder()` เท่านั้น — ห้ามส่งแถวดิบจาก prisma เข้ามา */
  order: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  /** 00086 — แถวร้าน (ค่าตั้งค่ารูปก่อน-หลัง) · ไม่ใช่เงิน — ส่งต่อเฉพาะ mode/visible ลงการ์ด ไม่ส่งทั้งแถว */
  shop: { vertical: string; serviceJobPhotoMode?: string | null; serviceJobPhotosBuyerVisible?: boolean | null }
  vocab: OrderVocab
  viewerRoles: readonly ShopRole[]
  /** 00086 — userId ของผู้ดู (ตัดสิน "งานของฉัน") */
  viewerUserId: string
  /** 00086 S-5 — memberCanCloseJob ของผู้ดู (page.tsx คำนวณจากแถวสมาชิก) · ช่างที่ไม่ได้ติ๊ก "ปิดงานได้" = false */
  canCloseJob: boolean
  fbPageAvatar: string | null
}

export default async function TechnicianOrderDetail({ order, shop, vocab, viewerRoles, viewerUserId, canCloseJob, fbPageAvatar }: Props) {
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

  // feature 00073 — สถานะชุดเดียวของงานบริการ (ไม่มียอดเงิน: ช่างไม่เห็นเงิน) · ร้านอื่น = null (ป้ายเดิม)
  const serviceBadge = usesServiceFinanceRules(shop.vertical)
    ? resolveServiceStatusBadge(
        {
          status: order.status,
          appointmentStatus: order.appointmentStatus ?? null,
          hasAppointment: Boolean(order.serviceStart),
          // 00086 FR-001 — งานหน้าร้าน (ค่าที่ร้านเลือก → สูตรเดิม) = ป้ายงานหน้าร้าน (ร้าน "รอเริ่มงาน" · ลูกค้า "รับงานแล้ว") แม้มีเวลาเริ่ม
          arrivalMode: serviceArrivalOf(order),
          serviceClosedAt: order.serviceClosedAt ?? null,
          // 00086 P3 — กำลังให้บริการ / ทำเสร็จ · รอปิดงาน (ทั้งคีย์อยู่ใน allow-list ของ toNoMoneyOrder)
          serviceStartedAt: order.serviceStartedAt ?? null,
          serviceFinishedAt: order.serviceFinishedAt ?? null,
          outstanding: null,
        },
        'seller',
      )
    : null

  // 00086 P3 — ตัวเดียวกับหน้าเจ้าของ (อ่านเฉพาะคีย์ใน allow-list) · ร้านอื่น = null
  const jobFacts = serviceBadge ? serviceJobFacts(order, events) : null
  const photoMode = (shop.serviceJobPhotoMode ?? 'OPTIONAL') as ServiceJobPhotoMode
  const photosBuyerVisible = Boolean(shop.serviceJobPhotosBuyerVisible)

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
            serviceBadge={serviceBadge}
          />
          <ShippingActivity
            events={events}
            orderNoun={vocab.noun}
            createLabel={vocab.createLabel}
            serviceVocab={shop.vertical === 'SERVICE_QUEUE' ? vocab : undefined}
            serviceJobRecords={jobFacts?.records}
          />
        </div>

        <div className="order-first space-y-base lg:order-none">
          {/* ไม่ส่ง summary/profileKey: ลิงก์ไปโปรไฟล์ลูกค้า + "สั่งกับร้านนี้ N ครั้ง/ลูกค้าตั้งแต่" เป็นข้อมูลยอดขายของลูกค้า */}
          <CustomerDetails
            summary={null}
            salesChannel={order.salesChannel ?? null}
            profileKey={null}
            buyerNoun={vocab.buyerNoun}
            repeatCountLabel={vocab.repeatCountLabel}
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
          {/* feature 00073 — ช่างเริ่มงานได้ (O4) · ปิดงานได้เมื่อได้รับสิทธิ์ (00086) แต่ไม่เห็นเงิน: ไม่มีส่วนรับเงิน · คืนมัดจำ/เปิดงานอีกครั้งตามสิทธิ์ O6 */}
          {serviceBadge && jobFacts && (
            <ServiceJobCard
              publicToken={order.publicToken}
              orderLabel={order.orderNo ?? String(order.publicToken).slice(0, 8).toUpperCase()}
              status={order.status}
              closedAtISO={order.serviceClosedAt ? new Date(order.serviceClosedAt).toISOString() : null}
              startedAtISO={order.serviceStartedAt ? new Date(order.serviceStartedAt).toISOString() : null}
              badge={serviceBadge}
              hasAppointment={Boolean(order.serviceStart)}
              startISO={order.serviceStart ? new Date(order.serviceStart).toISOString() : null}
              endISO={order.serviceEnd ? new Date(order.serviceEnd).toISOString() : null}
              allDay={
                order.serviceStart && order.serviceEnd
                  ? isAllDayAppointment(new Date(order.serviceStart), new Date(order.serviceEnd))
                  : false
              }
              canStart={can(viewerRoles, 'O4')}
              canClose={canCloseJob}
              canManage={can(viewerRoles, 'O6')}
              editHref={null}
              finishedAtISO={order.serviceFinishedAt ? new Date(order.serviceFinishedAt).toISOString() : null}
              assignee={jobFacts.assignee}
              viewerUserId={viewerUserId}
              technicianOnly={isTechnicianOnly(viewerRoles)}
              canAssign={canAssignServiceJob(viewerRoles)}
              canClaim={canClaimServiceJob(viewerRoles)}
              photoMode={photoMode}
              photosBuyerVisible={photosBuyerVisible}
              startedByName={jobFacts.startedByName}
              finishedByName={jobFacts.finishedByName}
              jobSummary={jobFacts.jobSummary}
            />
          )}
          {serviceBadge && jobFacts && (
            <ServiceJobPhotosCard
              records={jobFacts.records}
              photoMode={photoMode}
              buyerVisible={photosBuyerVisible}
              assigneeName={jobFacts.assignee?.name ?? null}
              closed={Boolean(order.serviceClosedAt)}
              finished={Boolean(order.serviceFinishedAt)}
            />
          )}
          {order.serviceStart && (
            <AppointmentCard
              // ช่าง: เลื่อนนัด (O3) กับส่งสรุปนัด (H1) ไม่ได้ — สิทธิ์อ่านจากบทบาทจริง ไม่ฮาร์ดโค้ด
              // ปิดงาน (O4) อยู่ที่การ์ด "งานนี้" ข้างบน (feature 00073)
              canReschedule={can(viewerRoles, 'O3') && !order.serviceClosedAt}
              canSendSummary={can(viewerRoles, 'H1')}
              // 00086 critique P0 — การ์ด "งานนี้" ข้างบนเป็นป้ายสถานะเดียวของหน้า
              hideStageBadge={Boolean(serviceBadge && jobFacts)}
              publicToken={order.publicToken}
              startISO={new Date(order.serviceStart).toISOString()}
              createdAtISO={new Date(order.createdAt).toISOString()}
              // 00086 — ค่าที่ร้านเลือกตอนเปิดบิล (null = ใบเก่า ⇒ สูตรเดิม)
              arrivalMode={order.arrivalMode ?? null}
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
            />
          )}
        </div>
      </div>
    </>
  )
}
