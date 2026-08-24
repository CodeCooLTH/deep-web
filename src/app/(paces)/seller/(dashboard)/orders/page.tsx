/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx
 *
 * Adaptations:
 * - stat cards: ใช้ OrdersStatCard (จาก theme) แทน StatStrip (shared — task S20 จะ handle ทีหลัง)
 * - data fetching: getOrdersByShop (SafePay service) + getShopByUserId
 * - Date boundary: createdAt → .toISOString() ก่อนส่งผ่าน RSC→client boundary
 * - "no shop" guard เก็บไว้ (ไม่มีใน theme แต่จำเป็นสำหรับ seller ที่ยังไม่ตั้งร้าน)
 * - buyer contact แสดงเต็ม (D-13) — ปิดบังเหลือเฉพาะจอผู้ซื้อ/แอดมิน
 * - productId → productImagesById lookup ถูก stripped: ไม่มีคอลัมน์รูปภาพในหน้า list แล้ว
 * - StatStrip import ลบออก — ไม่แก้ไขไฟล์ _shared/StatStrip.tsx
 */

import { authOptions } from '@/lib/auth'
import { resolveShopVertical } from '@/lib/lodging'
import { prisma } from '@/lib/prisma'
import { getOrdersByShop } from '@/services/order.service'
import { deriveShippingStage } from '@/lib/order-stage'
import { computeOrderMoneyFromSerialized, hasMoneyStory } from '@/lib/order-payment'
import { deriveAppointmentStage } from '@/lib/appointment-stage'
import { canUseAppointments, isAllDayAppointment } from '@/lib/appointments'
import { requireActiveShop } from '@/lib/shop-context'
import { thaiDayKey } from '@/lib/format-date'
import { getConnection } from '@/services/iship.service'
import Icon from '@/components/wrappers/Icon'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import type { Metadata } from 'next'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { resolveOrderSource } from '@/lib/order-source-channel'
import type { OrderRow, OrderStatCardData, OrderItemRow } from './components/data'
import OrdersList from './components/OrdersList'
import OrdersStatCard from './components/OrdersStatCard'
// นิยาม "พัสดุตีกลับ" อยู่ที่ lib/iship/status.ts ที่เดียว — ห้ามเขียนรายชื่อสถานะซ้ำที่นี่
import { RETURNED_CARRIER_STATUSES } from '@/lib/iship/status'
import { cancelReasonCountsAgainstGuest } from '@/lib/lodging'
import { toFileUrl } from '@/lib/file-url'
import { sellerContactDisplay } from '@/lib/seller-contact-display'

/**
 * feature 00030 — ชื่อหน้าผันตามประเภทกิจการ จึงเป็น generateMetadata ไม่ใช่ constant
 * (constant ถูกอ่านตอน module load ซึ่งยังไม่รู้จัก shop ของ request นั้น)
 * resolve ไม่ได้ (ยังไม่ล็อกอิน/ไม่มีร้าน) → ตกไปชุด ONLINE_SALES ตาม fail-safe ของ SSOT
 */
export async function generateMetadata(): Promise<Metadata> {
  const session = await getServerSession(authOptions)
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  ).catch(() => null)
  return { title: resolveOrderVocab(active?.shop?.vertical ?? '').noun }
}

// D-13 (2026-08-24): ผู้ขายเห็นเบอร์ลูกค้าตัวเองเต็ม — ดูเหตุผลใน lib/seller-contact-display.ts

interface PageProps {
  searchParams: Promise<{ status?: string; stage?: string }>
}

export default async function OrdersPage({ searchParams }: PageProps) {
  const sp = await searchParams

  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) return null

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })

  if (!active) {
    return (
      <div className="card p-10 rounded-xl text-center max-w-2xl mx-auto">
        <Icon icon="building-store" className="size-16 text-warning mx-auto mb-4" />
        <h2 className="text-xl font-bold text-dark mb-2">ยังไม่มีร้านค้า</h2>
        <p className="text-default-400 mb-6">ต้องสร้างร้านก่อนจึงจะดูรายการได้</p>
        <Link
          href="/shop"
          className="btn bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-hover inline-flex items-center gap-2"
        >
          <Icon icon="plus" />
          สร้างร้านค้า
        </Link>
      </div>
    )
  }

  const shop = active.shop

  // feature 00022 — ปุ่มพิมพ์ใบปะหน้าหลายใบใน bulk bar
  // ร้านบ้านพักและร้านที่ยังไม่เชื่อมต่อจะไม่เห็นปุ่มนี้เลย (BR-ISHIP-01)
  const ishipEnabled =
    shop.vertical === 'ONLINE_SALES'
      ? await getConnection(shop.id)
          .then((c) => c.connected && c.status === 'ACTIVE')
          .catch(() => false)
      : false

  /**
   * แกน "สถานะนัดหมาย" ของร้านคิวงาน (feature 00036) — คู่ขนานกับแกนพัสดุด้านล่าง
   * ร้านหนึ่งมีแกนเสริมได้แกนเดียว จึงไม่มีทางที่สองเงื่อนไขนี้จะจริงพร้อมกัน
   *
   * 🛑 ประกาศไว้ **เหนือ** จุดดึงข้อมูล เพราะเป็นตัวเดียวกับที่ตัดสินว่าจะดึงแถวเงินมาไหม —
   * ถ้าปล่อยให้จุดดึงเขียน `shop.vertical === 'SERVICE_QUEUE'` เองอีกครั้ง สองที่จะแยกจากกัน
   * ได้เงียบ ๆ แล้วเกิดเคสที่ "คำนวณเงินโดยไม่มีแถวเงินอยู่ในมือ" = ป้ายบอกว่ายังไม่จ่าย
   * ทั้งที่ลูกค้าจ่ายแล้ว (ค่าที่หายไปตอนดึง อ่านไม่ต่างจากค่าที่เป็นศูนย์จริง)
   */
  const isServiceQueue = canUseAppointments(shop)

  let rawOrders: any[] = []
  try {
    // ดึงทุก order ของร้าน — client component ทำ status filter เอง
    // ด่าน vertical (AC-SQ-07) — เงินรายใบดึงเฉพาะร้านบริการ ไม่ใช่ทุกร้าน
    rawOrders = await getOrdersByShop(shop.id, undefined, { withPayments: isServiceQueue })
  } catch {
    rawOrders = []
  }

  // แปลง rawOrder → OrderRow, Date → ISO string ที่ RSC boundary (ห้ามส่ง Date object ข้าม boundary)
  // กองงานตามสถานะพัสดุ — ต้องมาจาก deriveShippingStage ตัวเดียวกับที่ตัวนับบน Command Center ใช้
  // ไม่งั้นกดไทล์ที่บอก 5 แล้วเข้ามาเจอ 4 ใบ (ดูคอมเมนต์ที่ตัวฟังก์ชันใน lib/order-stage.ts)
  const isOnlineSales = shop.vertical === 'ONLINE_SALES'

  // legacy fallback (ออเดอร์ก่อน 2026-08-10 ไม่มี Order.shopChannelId) — คอลัมน์ "ที่มา" (user สั่ง
  // 2026-08-06): ชี้รูปเพจได้เฉพาะร้านที่เชื่อมเพจ MESSENGER ACTIVE "เพจเดียว" (หลายเพจ = กำกวม
  // ห้ามเดา) — resolveOrderSource() ต่อออเดอร์แต่ละใบด้านล่างใช้ค่านี้เฉพาะใบที่ไม่มี shopChannel
  const fbChannels = await prisma.shopChannel.findMany({
    where: { shopId: shop.id, provider: 'MESSENGER', status: 'ACTIVE' },
    select: { avatarUrl: true },
  })
  const fbPageAvatar = fbChannels.length === 1 ? fbChannels[0].avatarUrl : null

  // ห้องแชทของแต่ละออเดอร์ (ปุ่ม "เปิดแชท" บนแถบหัว — user สั่ง 2026-08-06)
  // Order ไม่มี FK ไปห้องแชท → ต่อผ่านลูกค้า 2 เส้น: ExternalContact (แชทจากเพจ) และ
  // buyerUserId (แชทในระบบ) · ยิงเป็นชุดเดียวด้วย `in` ไม่วนต่อแถว
  const customerIds = [...new Set(rawOrders.map((o: any) => o.customerId).filter(Boolean))] as string[]
  const buyerUserIds = [...new Set(rawOrders.map((o: any) => o.buyerUserId).filter(Boolean))] as string[]
  const convRows =
    customerIds.length > 0 || buyerUserIds.length > 0
      ? await prisma.conversation.findMany({
          where: {
            shopId: shop.id,
            OR: [
              ...(customerIds.length > 0
                ? [{ externalContact: { customerId: { in: customerIds } } }]
                : []),
              ...(buyerUserIds.length > 0 ? [{ buyerUserId: { in: buyerUserIds } }] : []),
            ],
          },
          select: { id: true, buyerUserId: true, externalContactId: true },
          orderBy: { lastMessageAt: 'desc' },
        })
      : []
  // ห้องล่าสุดชนะเมื่อมีหลายห้องต่อลูกค้าหนึ่งคน (orderBy updatedAt desc + ไม่เขียนทับคีย์เดิม)
  const convByCustomer = new Map<string, string>()
  const convByBuyer = new Map<string, string>()
  // ต้องรู้ว่า ExternalContact ใบไหนผูกกับลูกค้าคนไหน — query แยกเพราะ relation filter
  // ข้างบนกรองได้แต่ select ผ่าน relation ไม่ได้ในคำสั่งเดียว
  const contactRows =
    convRows.length > 0
      ? await prisma.externalContact.findMany({
          where: { id: { in: convRows.map((c) => c.externalContactId).filter(Boolean) as string[] } },
          select: { id: true, customerId: true },
        })
      : []
  const customerByContact = new Map(contactRows.map((r) => [r.id, r.customerId]))
  for (const c of convRows) {
    const cid = c.externalContactId ? customerByContact.get(c.externalContactId) : null
    if (cid && !convByCustomer.has(cid)) convByCustomer.set(cid, c.id)
    if (c.buyerUserId && !convByBuyer.has(c.buyerUserId)) convByBuyer.set(c.buyerUserId, c.id)
  }

  // ประวัติลูกค้าต่อร้าน — groupBy ครั้งเดียวสำหรับลูกค้าทุกคนในหน้านี้ ไม่วนต่อแถว
  // (ใช้ index Order_customerId_status_idx ที่มีอยู่แล้ว)
  //
  // 🛑 แก้ 2026-08-11: เดิมนับ `status === 'CANCELLED'` **ทุกใบ ไม่สนว่าใครยกเลิก** แล้วเอาไปขึ้น
  // ป้าย "เคยยกเลิก N ครั้ง" ท้ายชื่อลูกค้า — ข้อมูลจริงบน prod วันนั้น: ใบที่ยกเลิก 8 ใบ
  // `cancelInitiator = 'seller'` **ทั้งหมด ไม่มี 'buyer' สักใบ** แปลว่าป้ายกำลังติดตราลูกค้า
  // ด้วยการยกเลิกของร้านเอง ซึ่งตรงข้ามกับสิ่งที่ป้ายบอก และทำให้ร้านตัดสินใจผิดกับลูกค้าที่ไม่ผิด
  //
  // เกณฑ์ที่ถูกอยู่ที่ `lib/customer-behavior.ts` (ยืมนิยาม "ไม่ใช่ความผิดร้าน" ของ feature 00039
  // มาพลิกด้าน) — ป้ายในแชทกับที่นี่ต้องมาจากตัวเดียวกัน ไม่งั้นลูกค้าคนเดียวกันจะได้ป้ายไม่ตรงกัน
  // สองหน้าจอ (`docs/conventions/sibling-surface-parity.md` + HR16)
  //
  // ยังเป็น query ครั้งเดียวทั้งหน้าเหมือนเดิม — เพิ่ม `cancelInitiator` เป็นมิติที่ 3 ของ groupBy
  // เดิม และนับ "ใบที่ตีกลับ" ด้วย query แยกอีก 1 ตัว (นับเป็นจำนวน **ออเดอร์** ไม่ใช่จำนวนแถว
  // OrderShipment — ใบเดียว retry ได้หลายพัสดุ ดู project_iship_retry_credit_fixes)
  const [custStatRows, returnedRows] = customerIds.length > 0
    ? await Promise.all([
        prisma.order.groupBy({
          // ต้องมี cancelReason ด้วย — บน prod ไม่มีใบไหนเลยที่ cancelInitiator='buyer'
          // (ลูกค้าแจ้งในแชท ร้านกดให้) ต้นเรื่องจริงอยู่ที่เหตุผลที่ร้านบันทึก ดู customer-behavior.ts
          by: ['customerId', 'status', 'cancelInitiator', 'cancelReason'],
          where: { shopId: shop.id, customerId: { in: customerIds } },
          _count: { _all: true },
        }),
        prisma.order.findMany({
          where: {
            shopId: shop.id,
            customerId: { in: customerIds },
            shipments: {
              some: { status: { not: 'CANCELLED' }, carrierStatus: { in: [...RETURNED_CARRIER_STATUSES] } },
            },
          },
          select: { customerId: true },
        }),
      ])
    : [[], []]
  const statByCustomer = new Map<string, { orders: number; cancelled: number; cancelledByBuyer: number; returned: number }>()
  const bump = (cid: string) =>
    statByCustomer.get(cid) ?? { orders: 0, cancelled: 0, cancelledByBuyer: 0, returned: 0 }
  for (const r of custStatRows) {
    if (!r.customerId) continue
    const cur = bump(r.customerId)
    cur.orders += r._count._all
    if (r.status === 'CANCELLED') {
      cur.cancelled += r._count._all
      // เกณฑ์เดียวกับ customer-behavior.ts เป๊ะ — ห้ามเขียนกฎซ้ำที่นี่ (HR16)
      if (
        r.cancelInitiator === 'buyer' ||
        (r.cancelReason !== null && cancelReasonCountsAgainstGuest(r.cancelReason))
      ) {
        cur.cancelledByBuyer += r._count._all
      }
    }
    statByCustomer.set(r.customerId, cur)
  }
  for (const r of returnedRows) {
    if (!r.customerId) continue
    const cur = bump(r.customerId)
    cur.returned += 1
    statByCustomer.set(r.customerId, cur)
  }

  const orders: OrderRow[] = rawOrders.map((o: any) => {
    // ที่มาของออเดอร์ใบนี้ (2026-08-10) — รูป+badge ต้องมาจากแหล่งเดียวกันเสมอ (resolveOrderSource)
    // ห้ามผสม sourceLogoUrl จาก shopChannel กับ badge จาก salesChannel ดิบ — ดูคอมเมนต์เต็มที่
    // lib/order-source-channel.ts
    const orderSource = resolveOrderSource({
      salesChannel: o.salesChannel ?? null,
      shopChannel: o.shopChannel ?? null,
      legacyFacebookPageAvatar: fbPageAvatar,
    })
    return {
    sourceLogoUrl: orderSource.logoUrl,
    // channel ที่ผูกกับรูปข้างบน (สำหรับ OrderSourceLogo/ChannelBadge) — ต่างจาก `salesChannel`
    // ด้านล่างซึ่งเป็นค่าดิบที่ร้านแก้เองได้ ใช้กับ badge อื่น (CustomerDetails/BillingDetails เดิม)
    sourceChannel: orderSource.channel,
    // เลขพัสดุมาได้ 2 ทางและเก็บคนละตาราง — ต้องอ่านทั้งคู่ ไม่งั้นออเดอร์ที่ร้าน "ส่งเอง"
    // (ShipmentTracking: provider = ชื่อขนส่งที่ผู้ขายเลือก, ไม่มีรหัส) จะไม่ขึ้นเลขพัสดุเลย
    // ทั้งที่มีเลขอยู่ — เจอตอน user ส่งภาพหน้าจอ "แจ้งเลขพัสดุ" มาให้ดู 2026-08-04
    // ให้พัสดุ iShip ชนะเมื่อมีทั้งคู่ เพราะเป็นใบที่ระบบติดตามสถานะขนส่งให้จริง
    // feature 00036: ร้านที่ไม่ใช่ ONLINE_SALES ไม่ส่งข้อมูลพัสดุข้าม RSC boundary เลย
    // ไม่ใช่แค่ "ไม่ render" — ออเดอร์เก่าของร้านที่เคยเป็นประเภทอื่นยังมีที่อยู่/เลขพัสดุจริงติดอยู่
    // การส่งมาแล้วซ่อนที่จอเท่ากับ serialize PII ของทุกแถวเข้า flight payload ฟรี ๆ
    // (feedback_rsc_pii_neutralize_at_source) · หน้ารายละเอียดยังเห็นครบตาม BR-SOV-10
    shipment: !isOnlineSales
      ? null
      : o.shipments?.[0]
        ? {
            id: o.shipments[0].id ?? null,
            trackingNo: o.shipments[0].trackingNo ?? null,
            courierCode: o.shipments[0].courierCode ?? null,
            courierName: o.shipments[0].courierName ?? null,
            provider: o.shipments[0].provider ?? 'ISHIP',
            // 🛑 2 ช่องนี้คือ input ของ describeProgress() ซึ่งเป็น SSOT ของ "จุดไหนบนแถบ 4 ขั้น"
            // ที่หน้ารายละเอียดใช้อยู่แล้ว — ไม่ส่งลงมา แถว/hover จะต้องเดาจาก shippingStage
            // ซึ่งหยาบกว่า (6 ค่า) แล้วพูดคนละขั้นกับจอข้างในบนออเดอร์ใบเดียวกัน (HR16)
            carrierStatus: o.shipments[0].carrierStatus ?? null,
            status: o.shipments[0].status ?? 'CREATED',
          }
        : o.shipmentTracking
          ? {
              trackingNo: o.shipmentTracking.trackingNo ?? null,
              courierCode: null,
              courierName: o.shipmentTracking.provider ?? null,
              // ร้านแจ้งเลขเอง — ไม่มีแถว OrderShipment จึงไม่มี id ให้ถาม traces
              id: null,
              provider: 'MANUAL',
              // ไม่มีขนส่งคอยอัปเดต → ไม่มี carrierStatus ให้ describeProgress อ่าน
              // ปลายทางจะถอยไปใช้ SHIPMENT_STAGE_DOT_INDEX (หยาบแต่เป็นข้อมูลเท่าที่มีจริง)
              carrierStatus: null,
              status: 'CREATED',
            }
          : null,
    // นัดหมาย (feature 00036) — undefined = ร้านไม่มีแกนนี้, null = ร้านมีแกนแต่ใบนี้ walk-in
    // stage มาจาก deriveAppointmentStage ตัวเดียวกับที่ตัวนับบนชิปใช้ (BR-SOV-06)
    appointment: !isServiceQueue
      ? undefined
      : (() => {
          const stage = deriveAppointmentStage({
            serviceStart: o.serviceStart,
            appointmentStatus: o.appointmentStatus,
          })
          if (!stage || !o.serviceStart) return null
          const start = new Date(o.serviceStart)
          const end = o.serviceEnd ? new Date(o.serviceEnd) : null
          return {
            startISO: start.toISOString(),
            endISO: end ? end.toISOString() : null,
            // ตัดสินจากช่วงเวลาที่บันทึกไว้จริงของแถวนี้ ไม่ใช่จากโหมดปัจจุบันของร้าน (BR-RSV-57)
            allDay: end ? isAllDayAppointment(start, end) : false,
            resourceName: o.serviceResource?.name ?? null,
            stage,
          }
        })(),
    /**
     * เงินของใบนี้ (feature 00050 · AC-SQ-07) — undefined = ร้านที่ไม่ใช่ SERVICE_QUEUE
     *
     * 🛑 ด่านเดียวกับที่ `withPayments` ใช้ ไม่ใช่ "แถวนี้มี payments ไหม" — ถ้าเช็คจาก
     * ข้อมูล ร้านที่บังเอิญมีแถวค้างจะได้ป้ายของร้านบริการโดยไม่มีอะไรฟ้อง
     *
     * ผ่าน `computeOrderMoney` เท่านั้น ห้ามบวกเองที่นี่ — ตัวตัดยอดที่ถูกยกเลิก (`voidedAt`)
     * อยู่ในนั้น (HR16: ป้ายในรายการกับหน้ารายละเอียดต้องมาจากนิยามเดียวกัน)
     */
    money: !isServiceQueue
      ? undefined
      : (() => {
          const m = computeOrderMoneyFromSerialized({
            totalAmount: o.totalAmount.toFixed(2),
            depositAmount: o.depositAmount ? o.depositAmount.toFixed(2) : null,
            payments: (o.payments ?? []).map(
              (p: { kind: string; amount: { toFixed: (n: number) => string }; voidedAt: Date | null }) => ({
                kind: p.kind,
                amount: p.amount.toFixed(2),
                voidedAt: p.voidedAt ? p.voidedAt.toISOString() : null,
              }),
            ),
          })
          /* 🛑 เกณฑ์ที่สองต้องเป็น `hasMoneyStory` ตัวเดียวกับหน้ารายละเอียด — ถ้าที่นี่ปล่อยผ่าน
             ทุกใบ ใบที่ยังไม่มีเรื่องเงินจะได้ป้าย "รอชำระ" ในรายการ แต่หน้ารายละเอียดยังขึ้น
             ป้ายเดิม = ย้ายอาการ "สองจอพูดคนละคำ" ไปอยู่อีกกลุ่มหนึ่งแทนที่จะแก้ */
          if (!hasMoneyStory(m)) return undefined
          return { totalAmount: m.totalAmount, totalReceived: m.totalReceived, outstanding: m.outstanding }
        })(),
    shippingStage: isOnlineSales
      ? deriveShippingStage({
          status: o.status,
          carrierStatus: o.shipments?.[0]?.carrierStatus ?? null,
          hasShipment: (o.shipments?.length ?? 0) > 0,
          // 2 ช่องนี้ต้องส่งให้ครบเหมือนที่ getShippingStageCounts ส่ง ไม่งั้นตัวเลขบนไทล์กับ
          // รายการที่กรองได้จะไม่ตรงกัน ทั้งที่เรียกฟังก์ชันเดียวกัน
          paymentMethod: o.paymentMethod ?? null,
          codReceivedAt: o.codReceivedAt ?? null,
        })
      : undefined,
    id: (o.publicToken ?? o.id).slice(0, 8),
    publicToken: o.publicToken ?? o.id,
    shortCode: o.shortCode ?? null,
    buyer: sellerContactDisplay(o.buyerContact),
    orderType: o.type ?? 'PHYSICAL',
    total: Number(o.totalAmount ?? 0),
    status: o.status,
    // ISO string — client component จะ format เป็นภาษาไทย
    createdAtISO: o.createdAt ? new Date(o.createdAt).toISOString() : '',
    // Phase A Unit A: buyer identity (null = guest ยังไม่ register)
    // `buyer` ด้านบนเป็นค่าเต็มแล้วตั้งแต่ D-13 (2026-08-24) — ดู lib/seller-contact-display.ts
    // registered → displayName; guest → ชื่อที่ seller กรอกตอนสร้างออเดอร์ (o.buyerName); ไม่มีจริง ๆ → null
    buyerName: o.buyer?.displayName ?? o.buyerName ?? null,
    buyerUsername: o.buyer?.username ?? null,
    buyerAvatar: o.buyer?.avatar ?? null,
    salesChannel: o.salesChannel ?? null,
    isFromAuction: Boolean(o.auctionId),
    // เบอร์จริง (ไม่ mask) สำหรับ tap-to-call — seller โทรลูกค้าตัวเองได้ (user decision 2026-06-15)
    // PII note: เปิดเบอร์จริงเข้า flight ของ seller (เจ้าของออเดอร์) — ต้อง security review ก่อน prod
    buyerPhone: o.buyerContact ?? null,
    // ปลายทางแยกส่วน — ประกอบบรรทัดที่ฝั่งจอ (ดูเหตุผล + หมายเหตุ PII ที่ OrderRow.shipTo)
    shipTo: (() => {
      // ร้านที่ไม่มีการจัดส่งไม่ต้องรู้จักที่อยู่เลยในหน้ารายการ (เหตุผลเดียวกับ shipment ข้างบน)
      if (!isOnlineSales) return null
      const a = o.shippingAddress as Record<string, unknown> | null
      if (!a) return null
      const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
      const locality = [str(a.subdistrict), str(a.district)].filter(Boolean).join(' ') || null
      const shape = {
        line1: str(a.line1),
        locality,
        province: str(a.province),
        postcode: str(a.postcode),
      }
      // ไม่มีอะไรเลยสักช่อง = ถือว่าไม่มีที่อยู่ (อย่าคืนก้อนที่ทุกช่องเป็น null ให้จอไปเช็กเอง)
      return Object.values(shape).some(Boolean) ? shape : null
    })(),
    codReceivedAtISO: o.codReceivedAt ? new Date(o.codReceivedAt).toISOString() : null,
    customerStats: o.customerId ? (statByCustomer.get(o.customerId) ?? null) : null,
    /* 🛑 ค่าที่บันทึกไว้ตอนสร้างออเดอร์ชนะเสมอ — สอง map ด้านล่างเป็น "การเดา" จากเบอร์โทร
       (Order → Customer → Conversation) ซึ่งคืนเธรดไหนก็ได้ของลูกค้าคนนั้น ไม่ใช่เธรดที่สร้าง
       ออเดอร์ใบนี้จริง ⇒ ลูกค้าที่ทัก FB แล้วย้ายไป LINE หรือร้านที่มี ≥2 เพจ ปุ่ม "เปิดแชท"
       พาไปผิดห้องได้ (บั๊กที่มีอยู่บน prod ก่อน 2026-08-12)
       ออเดอร์เก่าไม่ถูก backfill โดยตั้งใจ (ดู schema.prisma) จึงยังต้องมี fallback ไว้
       ไม่งั้นปุ่มจะหายไปจากออเดอร์เก่าทุกใบ = regress หนักกว่าบั๊กเดิม */
    conversationId:
      o.conversationId ??
      (o.customerId ? convByCustomer.get(o.customerId) : undefined) ??
      (o.buyerUserId ? convByBuyer.get(o.buyerUserId) : undefined) ??
      null,
    paymentMethod: o.paymentMethod ?? null,
    // F2: map OrderItem → OrderItemRow; imageUrl = /api/files/{images[0]} ถ้า product มีรูป
    // Decimal.price → Number เพื่อกัน serialization error ที่ RSC boundary
    items: (o.items ?? []).map((item: any): OrderItemRow => {
      const images = item.product?.images
      const firstImage = Array.isArray(images) && images.length > 0 ? images[0] : null
      // images[] เก็บได้ทั้ง file id (อัปโหลดจริง → /api/files/{id}) และ full URL (seed/external)
      // เดิม wrap /api/files/ ทุกกรณี → full URL กลายเป็น /api/files/https://... = 404 (รูปไม่ขึ้น)
      const imageUrl = firstImage
        ? toFileUrl(firstImage)
        : null
      return {
        id: item.id,
        name: item.name,
        qty: item.qty,
        price: Number(item.price),
        imageUrl,
      }
    }),
    }
  })

  // คำนวณ sparkline trend + changePct ต่อ status
  // feature 00033 §5.3 — ตัดวันตามปฏิทินไทย ไม่ใช่ UTC (ออเดอร์ 00:00–07:00 น. เคยตกไปวันก่อนหน้า)
  const toDateStr = (iso: string) => thaiDayKey(iso)

  const now = new Date()
  const DAY_MS = 24 * 60 * 60 * 1000

  // หน้าต่าง trend = 30 วัน (ขยายจาก 7 วัน — ร้านออเดอร์น้อย 7 วันทำให้ sparkline โล่ง + badge แกว่ง)
  const WINDOW = 30

  // สร้าง array ของ 30 วันล่าสุด (index 0 = วันเก่าสุด, index 29 = วันนี้)
  // เดินถอยหลังทีละ 24 ชม.บน UTC instant แล้วตัดวันด้วย thaiDayKey — ห้ามใช้ setUTCDate
  // (นั่นคือ UTC calendar day ไม่ใช่ปฏิทินไทย) ต้องเป็นคีย์รูปแบบเดียวกับ toDateStr() ด้านบน
  const lastDays = Array.from({ length: WINDOW }, (_, i) =>
    thaiDayKey(new Date(now.getTime() - (WINDOW - 1 - i) * DAY_MS)),
  )

  // 30 วันก่อนหน้า (index 0 = วันที่ -59, index 29 = วันที่ -30) สำหรับเทียบ changePct
  const prevStartStr = thaiDayKey(new Date(now.getTime() - (WINDOW * 2 - 1) * DAY_MS))
  const prevEndStr = thaiDayKey(new Date(now.getTime() - WINDOW * DAY_MS))

  type StatusKey = 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'

  const buildStatCard = (
    title: string,
    status: StatusKey,
  ): OrderStatCardData => {
    const forStatus = orders.filter((o) => o.status === status)

    // totalCount = ทุก order ของ status นี้ (ทุกช่วงเวลา)
    const totalCount = forStatus.length

    // current = ยอด 30 วันล่าสุด (เดิมสร้าง trendSeries รายวันไว้ป้อน sparkline ด้วย — การ์ดไม่มี
    // กราฟแล้วจึงนับตรง ๆ ไม่ต้องแตกเป็นรายวัน)
    const lastDaySet = new Set(lastDays)
    const current = forStatus.filter((o) => lastDaySet.has(toDateStr(o.createdAtISO))).length

    // prev: order ที่ createdAt อยู่ระหว่าง prevStartStr ถึง prevEndStr (30 วันก่อนหน้า, inclusive)
    const prev = forStatus.filter((o) => {
      const d = toDateStr(o.createdAtISO)
      return d >= prevStartStr && d <= prevEndStr
    }).length

    const changePct =
      prev === 0
        ? current > 0 ? 100 : 0
        : Math.round(((current - prev) / prev) * 100)

    return { title, status, totalCount, changePct, recentCount: current }
  }

  /**
   * ชื่อการ์ดต้องไม่ชนกับคำของ "กองงานพัสดุ" (SHIPPING_STAGE_LABEL) เพราะอยู่จอเดียวกัน
   *
   * เดิมใบที่สองชื่อ "กำลังจัดส่ง" เท่ากับชิปพัสดุเป๊ะ แต่คนละเลข (การ์ดนับ status=SHIPPED
   * ทั้งหมด = รวมใบที่ส่งถึงแล้ว ส่วนชิปนับเฉพาะที่ยังวิ่งอยู่จริง) — จอเดียวขึ้น 4 กับ 1
   * ด้วยคำเดียวกัน อ่านยังไงก็เหมือนตัวเลขผิด
   *
   * "ส่งแล้ว" = การกระทำของร้านจบแล้ว (ของออกไปแล้ว ไม่ว่าตอนนี้จะถึงหรือยัง) — user เลือก
   * 2026-08-06 จาก 3 ตัวเลือก. สั้นพอที่จะไม่ถูกอ่านสลับกับป้าย "ส่งถึงแล้ว" บนแถวข้างล่าง
   * (คำยาวใกล้กันอย่าง "ส่งของแล้ว" ต่างกันพยางค์เดียว กวาดตาผ่าน ๆ แล้วสลับกันได้)
   *
   * ไม่แตะ ORDER_STATUS_META — ดรอปดาวน์ตัวกรองกับป้ายบนแถวยังคงคำเดิมทุกตัวอักษร
   */
  const orderStatData: OrderStatCardData[] = [
    buildStatCard('รอดำเนินการ', 'PENDING'),
    buildStatCard('ส่งแล้ว',     'SHIPPED'),
    buildStatCard('สำเร็จแล้ว',  'CONFIRMED'),
    buildStatCard('ยกเลิก',      'CANCELLED'),
  ]

  const activeStatus = sp.status ?? 'all'
  const vocab = resolveOrderVocab(shop.vertical)

  return (
    <>
      {/* breadcrumb desktop เท่านั้น — มือถือมีชื่อหน้าใน SellerMobileHeader แล้ว (กันซ้ำ) */}
      <div className="hidden lg:block">
        <PageBreadcrumb title={vocab.noun} trail={[{ label: 'การขาย' }]} />
        {/* ร้านบ้านพักเป็นร้านเดียวที่เห็นทั้ง "บิลเข้าพัก" (/orders) และ "การจอง" (/bookings)
            พร้อมกัน — คนละของจริง จึงต้องมีบรรทัดบอกว่าหน้าไหนคืออะไร (00030 UX-Copy §6) */}
        {shop.vertical === 'LODGING' && (
          <p className="text-default-400 text-xs mt-0.5">
            บิลเข้าพัก — ยอดเงินและการชำระของแต่ละการจอง
          </p>
        )}
      </div>

      {/* Stat cards — desktop ≥lg เท่านั้น (มือถือ: ซ้ำซ้อนกับ status filter tab ที่มี count ใน OrdersList → ซ่อน) */}
      <div className="mb-1.25 hidden gap-base lg:grid lg:grid-cols-4">
        {orderStatData.map((item, idx) => (
          <OrdersStatCard item={item} key={idx} />
        ))}
      </div>

      <OrdersList
        orders={orders}
        activeStatus={activeStatus}
        ishipEnabled={ishipEnabled}
        vocab={vocab}
        vertical={resolveShopVertical(shop.vertical)}
        hasShippingAxis={isOnlineSales}
      />
    </>
  )
}
