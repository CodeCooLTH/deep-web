/**
 * Seller Thread — /inbox/[conversationId] (feat 00011 Deep Chat, S-12)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ChatPage.tsx:33-110
 * (header + scroll body + composer) — ตัด sidebar offcanvas/ChatToolbar/online-status
 * (UX-Design-Spec.md §S-12; seller thread เป็นหน้าเดี่ยว แยกจาก /inbox ไม่ split-view)
 *
 * Ownership guard: WHERE compound {id, shopId} (scope ใน query — feedback_rsc_dal_authz,
 * ไม่ post-check) คืน null ทั้งกรณี "ไม่พบ" และ "ไม่ใช่เจ้าของ" → SellerErrorState เดียวกันทั้งคู่
 * (กัน enumeration) — ไม่ notFound() เพราะ spec ระบุ "403/404→SellerErrorState 'ไม่พบบทสนทนานี้'"
 * ตรง ๆ ไม่ใช่ Next notFound page
 *
 * header identity (avatar+ชื่อ buyer) fetch ตรงที่นี่ (query เดียวกับ ownership guard) — ไม่มี
 * endpoint ใหม่ (API.md เป็น frozen 5 endpoint), ตัวข้อความจริงให้ ChatThread (client) fetch ผ่าน
 * GET .../messages เอง (SDS §3.3)
 *
 * feature 00018 T4/T5 (เพิ่มบนโครงเดิม — ไม่แตะ ownership guard เดิม):
 *  - T4: อ่าน channel/lastInboundAt/shopChannel.status เพิ่ม → คำนวณ getWindowState() ที่ server
 *    (channel-chat.service.ts มี import prisma/fs — ต้องเรียกที่นี่ ไม่ใช่ client component)
 *    แล้วส่งผลลัพธ์ (boolean/number ล้วน) ลงเป็น prop ให้ ChatThread — เลี่ยง service import
 *    เข้า client bundle (feedback_verify_import_safety)
 *  - T5 (ภาคผนวก A-1): อ่าน Shop.vertical (จาก getShopByUserId ที่มีอยู่แล้ว — คืนทุกคอลัมน์ของ
 *    Shop) resolve+fallback GENERAL ด้วย isShopVertical() ก่อนส่งลง prop (ห้าม client เดาเอง)
 *  - T5: หา Customer ที่ผูกไว้ — channel นอก (ExternalContact.customerId) หรือ DEEP
 *    (Customer.userId === conversation.buyerUserId) แล้ว query ประวัติ Order/Booking (Booking =
 *    Order type='BOOKING' ตาม BR-LODG-08 ไม่ใช่ตารางแยก) เฉพาะเมื่อผูกแล้ว
 *  - RSC PII: เบอร์โทร mask ด้วย maskPhone() (src/lib/phone-mask.ts) ก่อนส่งลง prop เสมอ — หน้านี้
 *    อยู่ใต้ client VerticalLayout ทุก prop ถูก serialize เข้า flight payload ไม่ว่าจะ render จริงไหม
 *  - CTA "สร้างออเดอร์"/"เปิดการจอง" ลิงก์ /orders/new, /bookings/new แบบไม่มี query param —
 *    ทั้งสอง route (อ่านแล้ว) ยังไม่มี searchParams handling เลย จึงไม่ prefill (ดู t45-report.md)
 *
 * rewrite (chat-standalone, .superpowers/sdd/chat-standalone.md): ย้ายมาจาก
 * (dashboard)/inbox/[conversationId]/page.tsx → (chat)/inbox/[conversationId]/page.tsx —
 * ownership guard/data fetch ทั้งหมดไม่เปลี่ยน แก้แค่ import _shared (alias แทน relative เพราะ
 * ย้ายข้าม route group) — หน้านี้ไม่มี Sidenav/TopBar ของ seller อีกต่อไป (ดู (chat)/layout.tsx)
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getShopByUserId } from '@/services/shop.service'
import { getWindowState } from '@/services/channel-chat.service'
import { BOOKING_ORDER_TYPE } from '@/services/booking.service'
import { isShopVertical, DEFAULT_SHOP_VERTICAL } from '@/lib/lodging'
import { maskPhone } from '@/lib/phone-mask'
import SellerErrorState from '@/app/(paces)/seller/(dashboard)/_shared/SellerErrorState'
import ChatThread from './components/ChatThread'
import CustomerPanel, { type CustomerPanelData, type CustomerPanelOrder } from './components/CustomerPanel'

export const metadata: Metadata = { title: 'ข้อความ' }

type PageProps = {
  params: Promise<{ conversationId: string }>
}

export default async function SellerInboxThreadPage({ params }: PageProps) {
  const { conversationId } = await params

  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  // feature 00018 T5: เพิ่ม vertical เข้า type ประกาศ — getShopByUserId คืนทุกคอลัมน์ของ Shop จริง
  // (Prisma ไม่มี select) แต่ตัวแปรนี้เคย narrow ไว้แค่ {id} จึงต้องขยาย type ก่อนอ่าน .vertical ได้
  let shop: { id: string; vertical: string } | null = null
  try {
    shop = await getShopByUserId(user.id)
  } catch {
    shop = null
  }
  if (!shop) redirect('/inbox')

  // ownership scope อยู่ใน WHERE (compound id+shopId) — ไม่ใช่ post-check
  // feature 00018: buyer เป็น null ได้ (เธรดช่องทางนอก) — include externalContact เพื่อ fallback ชื่อ
  // T4: channel/lastInboundAt/shopChannel.status สำหรับ 24h banner + token-invalid banner
  // T5: externalContact.customer (ผูกผ่านช่องทางนอก) + buyerUserId (lookup Customer.userId ฝั่ง DEEP)
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, shopId: shop.id },
    select: {
      id: true,
      channel: true,
      lastInboundAt: true,
      buyerUserId: true,
      buyer: { select: { id: true, displayName: true, avatar: true } },
      externalContact: {
        select: {
          name: true,
          customer: { select: { id: true, phone: true } },
        },
      },
      shopChannel: { select: { status: true } },
    },
  })

  if (!conversation) {
    // feat 00018 งาน 1: ตัด PageBreadcrumb ออก (ดู comment หัวไฟล์ inbox/page.tsx) — desktop chat
    // เต็มจอไม่มี breadcrumb; retryHref="/inbox" ในปุ่ม "ลองใหม่" ของ SellerErrorState ทำหน้าที่
    // ทางกลับแทนอยู่แล้ว
    return (
      <SellerErrorState title="ไม่พบบทสนทนานี้" message="บทสนทนานี้อาจถูกลบ หรือคุณไม่มีสิทธิ์เข้าถึง" retryHref="/inbox" />
    )
  }

  // feature 00018: buyer เป็น null ได้ (เธรดช่องทางนอก) — fallback ชื่อจาก externalContact แล้วค่อย 'ลูกค้า'
  // (null-safe ขั้นต่ำเท่านั้น — ไม่ทำ UI ใหม่สำหรับช่องทางนอก, งานนั้นอยู่แผนอื่น)
  const buyerDisplayName = conversation.buyer?.displayName ?? conversation.externalContact?.name ?? 'ลูกค้า'
  const buyerAvatar = conversation.buyer?.avatar ?? null

  // T4 — 24h messaging window (เฉพาะความหมายสำหรับ channel != DEEP; DEEP ก็คำนวณได้แต่ ChatThread
  // จะไม่ใช้เพราะ isExternal=false) + token invalid ของเพจที่ผูกเธรดนี้
  const windowState = getWindowState(conversation.lastInboundAt)
  // เช็ค "ไม่ใช่ ACTIVE" ไม่ใช่เช็คแค่ TOKEN_INVALID — ครอบ DISCONNECTED (ร้านถอดเพจเอง) ด้วย
  // ต้องตรงกับ guard ฝั่ง service (sendOutboundMessage โยน CHANNEL_NOT_ACTIVE เมื่อ status !== 'ACTIVE')
  // ไม่งั้นเธรดของเพจที่ถอดไปแล้วจะเปิดช่องพิมพ์ให้ แล้วไปเด้ง error ตอนกดส่ง
  const tokenInvalid =
    conversation.channel !== 'DEEP' && (conversation.shopChannel?.status ?? 'ACTIVE') !== 'ACTIVE'

  // T5 — ประเภทกิจการ (fallback GENERAL เมื่อค่าไม่รู้จัก ห้าม crash/ซ่อน CTA — ภาคผนวก A-1)
  const vertical = isShopVertical(shop.vertical) ? shop.vertical : DEFAULT_SHOP_VERTICAL

  // T5 — หา Customer ที่ผูกไว้: ช่องทางนอกผูกผ่าน ExternalContact.customerId, DEEP ผูกผ่าน
  // Customer.userId (Phase 2 link — ดู schema.prisma Customer model comment)
  let linkedCustomer: { id: string; phone: string } | null = null
  if (conversation.channel !== 'DEEP') {
    if (conversation.externalContact?.customer) {
      linkedCustomer = conversation.externalContact.customer
    }
  } else if (conversation.buyerUserId) {
    linkedCustomer = await prisma.customer.findUnique({
      where: { userId: conversation.buyerUserId },
      select: { id: true, phone: true },
    })
  }

  // T5 — ประวัติออเดอร์/การจอง เฉพาะเมื่อผูก Customer แล้ว (Booking = Order type='BOOKING' ตาม
  // BR-LODG-08 ไม่ใช่ตารางแยก — filter เพิ่มเมื่อ vertical=LODGING เท่านั้น)
  const orderRows = linkedCustomer
    ? await prisma.order.findMany({
        where: {
          shopId: shop.id,
          customerId: linkedCustomer.id,
          ...(vertical === 'LODGING' ? { type: BOOKING_ORDER_TYPE } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          publicToken: true,
          status: true,
          fulfillmentMode: true,
          totalAmount: true,
          createdAt: true,
          checkIn: true,
          checkOut: true,
        },
      })
    : []

  const panelOrders: CustomerPanelOrder[] = orderRows.map((o) => ({
    id: o.id,
    token: o.publicToken,
    status: o.status,
    fulfillmentMode: o.fulfillmentMode,
    totalAmount: o.totalAmount.toFixed(2),
    createdAt: o.createdAt.toISOString(),
    checkIn: o.checkIn ? o.checkIn.toISOString() : null,
    checkOut: o.checkOut ? o.checkOut.toISOString() : null,
  }))

  // RSC PII: เบอร์โทร mask ที่นี่เสมอ ก่อนลง prop ที่ถูก serialize เข้า flight ของ client layout
  const customerPanelData: CustomerPanelData = {
    contactName: buyerDisplayName,
    channel: conversation.channel,
    vertical,
    customer: linkedCustomer ? { id: linkedCustomer.id, phoneMasked: maskPhone(linkedCustomer.phone) } : null,
    orders: panelOrders,
  }

  return (
    // rewrite (chat-standalone): ไม่มี PageBreadcrumb (ตัดออกตั้งแต่ก่อนหน้านี้แล้ว — หน้าแชท
    // เต็มจอไม่มี breadcrumb) — buyerName ยังเห็นที่ ChatThread card-header อยู่แล้ว
    // 3 คอลัมน์ desktop (rail อยู่ที่ (chat)/layout.tsx แล้ว ไม่ใช่ที่นี่):
    // thread (flex-1) + Customer Panel persistent (≥1024px)
    // h-full: parent ({'children'} slot ของ layout.tsx) คุมความสูงที่เหลือให้แล้ว (flex h-dvh)
    // w-96 (384px): user feedback บน prod ว่า w-80 เดิมแคบไป — ข้อความอธิบายและปุ่ม CTA
    // ถูกบีบจนอ่านยาก; gap-4 แทน gap-1.25 เดิมที่ชิดกันจนสองคอลัมน์ดูติดกันเป็นก้อนเดียว
    <div className="flex h-full gap-4">
      <ChatThread
        conversationId={conversation.id}
        buyerName={buyerDisplayName}
        buyerAvatar={buyerAvatar}
        channel={conversation.channel}
        windowOpen={windowState.open}
        msRemaining={windowState.msRemaining}
        tokenInvalid={tokenInvalid}
        customerPanelData={customerPanelData}
      />
      <div className="hidden h-full w-96 shrink-0 lg:block">
        <CustomerPanel data={customerPanelData} />
      </div>
    </div>
  )
}
