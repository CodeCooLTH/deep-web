/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx
 *
 * Adaptations:
 * - stat cards: ใช้ OrdersStatCard (จาก theme) แทน StatStrip (shared — task S20 จะ handle ทีหลัง)
 * - data fetching: getOrdersByShop (SafePay service) + getShopByUserId
 * - Date boundary: createdAt → .toISOString() ก่อนส่งผ่าน RSC→client boundary
 * - "no shop" guard เก็บไว้ (ไม่มีใน theme แต่จำเป็นสำหรับ seller ที่ยังไม่ตั้งร้าน)
 * - maskContact ใช้ซ่อน buyer contact (PDPA-lite)
 * - productId → productImagesById lookup ถูก stripped: ไม่มีคอลัมน์รูปภาพในหน้า list แล้ว
 * - StatStrip import ลบออก — ไม่แก้ไขไฟล์ _shared/StatStrip.tsx
 */

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrdersByShop } from '@/services/order.service'
import { deriveShippingStage } from '@/lib/order-stage'
import { requireActiveShop } from '@/lib/shop-context'
import { thaiDayKey } from '@/lib/format-date'
import { getConnection } from '@/services/iship.service'
import Icon from '@/components/wrappers/Icon'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import type { Metadata } from 'next'
import { resolveOrderVocab } from '@/lib/seller-menu'
import type { OrderRow, OrderStatCardData, OrderItemRow } from './components/data'
import OrdersList from './components/OrdersList'
import OrdersStatCard from './components/OrdersStatCard'

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

function maskContact(c: string | null | undefined): string {
  if (!c || c.length <= 4) return c ?? '—'
  return '•'.repeat(Math.max(0, c.length - 4)) + c.slice(-4)
}

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

  let rawOrders: any[] = []
  try {
    // ดึงทุก order ของร้าน — client component ทำ status filter เอง
    rawOrders = await getOrdersByShop(shop.id)
  } catch {
    rawOrders = []
  }

  // แปลง rawOrder → OrderRow, Date → ISO string ที่ RSC boundary (ห้ามส่ง Date object ข้าม boundary)
  // กองงานตามสถานะพัสดุ — ต้องมาจาก deriveShippingStage ตัวเดียวกับที่ตัวนับบน Command Center ใช้
  // ไม่งั้นกดไทล์ที่บอก 5 แล้วเข้ามาเจอ 4 ใบ (ดูคอมเมนต์ที่ตัวฟังก์ชันใน lib/order-stage.ts)
  const isOnlineSales = shop.vertical === 'ONLINE_SALES'

  // รูปเพจของร้าน (คอลัมน์ "ที่มา" — user สั่ง 2026-08-06): Order เก็บแค่ salesChannel
  // ไม่ได้เก็บว่ามาจากเพจไหน → ชี้รูปเพจได้เฉพาะร้านที่เชื่อมเพจ MESSENGER ACTIVE เพจเดียว
  // (หลายเพจ = กำกวม ห้ามเดา ใช้โลโก้แพลตฟอร์มแทน)
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
  const custStatRows =
    customerIds.length > 0
      ? await prisma.order.groupBy({
          by: ['customerId', 'status'],
          where: { shopId: shop.id, customerId: { in: customerIds } },
          _count: { _all: true },
        })
      : []
  const statByCustomer = new Map<string, { orders: number; cancelled: number }>()
  for (const r of custStatRows) {
    if (!r.customerId) continue
    const cur = statByCustomer.get(r.customerId) ?? { orders: 0, cancelled: 0 }
    cur.orders += r._count._all
    if (r.status === 'CANCELLED') cur.cancelled += r._count._all
    statByCustomer.set(r.customerId, cur)
  }

  const orders: OrderRow[] = rawOrders.map((o: any) => ({
    sourceLogoUrl: o.salesChannel === 'FACEBOOK' ? fbPageAvatar : null,
    // เลขพัสดุมาได้ 2 ทางและเก็บคนละตาราง — ต้องอ่านทั้งคู่ ไม่งั้นออเดอร์ที่ร้าน "ส่งเอง"
    // (ShipmentTracking: provider = ชื่อขนส่งที่ผู้ขายเลือก, ไม่มีรหัส) จะไม่ขึ้นเลขพัสดุเลย
    // ทั้งที่มีเลขอยู่ — เจอตอน user ส่งภาพหน้าจอ "แจ้งเลขพัสดุ" มาให้ดู 2026-08-04
    // ให้พัสดุ iShip ชนะเมื่อมีทั้งคู่ เพราะเป็นใบที่ระบบติดตามสถานะขนส่งให้จริง
    shipment: o.shipments?.[0]
      ? {
          id: o.shipments[0].id ?? null,
          trackingNo: o.shipments[0].trackingNo ?? null,
          courierCode: o.shipments[0].courierCode ?? null,
          courierName: o.shipments[0].courierName ?? null,
          provider: o.shipments[0].provider ?? 'ISHIP',
        }
      : o.shipmentTracking
        ? {
            trackingNo: o.shipmentTracking.trackingNo ?? null,
            courierCode: null,
            courierName: o.shipmentTracking.provider ?? null,
            // ร้านแจ้งเลขเอง — ไม่มีแถว OrderShipment จึงไม่มี id ให้ถาม traces
            id: null,
            provider: 'MANUAL',
          }
        : null,
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
    buyer: maskContact(o.buyerContact),
    orderType: o.type ?? 'PHYSICAL',
    total: Number(o.totalAmount ?? 0),
    status: o.status,
    // ISO string — client component จะ format เป็นภาษาไทย
    createdAtISO: o.createdAt ? new Date(o.createdAt).toISOString() : '',
    // Phase A Unit A: buyer identity (null = guest ยังไม่ register)
    // buyerContact ยัง mask อยู่ใน field `buyer` ด้านบน — ไม่ลด PII boundary
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
    conversationId:
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
        ? firstImage.startsWith('http')
          ? firstImage
          : `/api/files/${firstImage}`
        : null
      return {
        id: item.id,
        name: item.name,
        qty: item.qty,
        price: Number(item.price),
        imageUrl,
      }
    }),
  }))

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

      <OrdersList orders={orders} activeStatus={activeStatus} ishipEnabled={ishipEnabled} vocab={vocab} />
    </>
  )
}
