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
 *  - T5 (ภาคผนวก A-1): อ่าน Shop.vertical (bug fix ด้านล่าง: query แยกจาก resolveActiveShopContext
 *    เพราะ context ไม่มี field นี้) resolve+fallback GENERAL ด้วย isShopVertical() ก่อนส่งลง prop
 *    (ห้าม client เดาเอง)
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
 *
 * bug fix (แชทไม่แยกตามร้าน, user report prod): ownership guard เดิม WHERE{id, shopId} ใช้
 * shopId จาก getShopByUserId ซึ่งคืนร้าน PERSONAL เสมอ — สลับไป active ร้าน B แล้วเปิดลิงก์เธรด
 * ของร้าน A (จาก rail/list เก่า) ก็ยัง match เพราะ guard เทียบกับ PERSONAL ไม่ใช่ active จริง
 * เปลี่ยนเป็น resolveActiveShopContext (re-verify membership เสมอ) แล้ว WHERE ยังคง scope ที่
 * shopId ของ active context (ไม่ post-check — feedback_rsc_dal_authz) — resolve ไม่ได้ → error
 * state ตรง ๆ ห้าม fallback เงียบ ๆ ไป PERSONAL
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveActiveShopContext } from '@/lib/shop-context'
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

  // bug fix: resolve ร้านที่ active จริง (Personal หรือ Business ตาม session.user.activeShopId,
  // re-verify membership เสมอ) — ห้ามใช้ getShopByUserId (คืน PERSONAL เสมอ, คือบั๊กเดิม)
  const activeCtx = await resolveActiveShopContext({
    user: { id: user.id as string, activeShopId: (user.activeShopId as string | null | undefined) ?? null },
  })
  if (!activeCtx) {
    return (
      <SellerErrorState
        title="ไม่พบร้านที่กำลังใช้งาน"
        message="ร้านนี้อาจถูกลบหรือคุณไม่มีสิทธิ์เข้าถึงแล้ว ลองสลับร้านหรือรีเฟรชหน้าใหม่"
        retryHref="/inbox"
      />
    )
  }
  // feature 00018 T5: vertical ยังต้อง query แยก (resolveActiveShopContext คืนแค่ shopId/kind/role/
  // locked ไม่มี vertical) — defensive: ไม่ควรเป็น null จริง (context เพิ่ง verify แถวนี้แล้ว)
  const shopRow = await prisma.shop.findUnique({ where: { id: activeCtx.shopId }, select: { vertical: true, logo: true } })
  if (!shopRow) {
    return (
      <SellerErrorState
        title="ไม่พบร้านที่กำลังใช้งาน"
        message="ร้านนี้อาจถูกลบหรือคุณไม่มีสิทธิ์เข้าถึงแล้ว ลองสลับร้านหรือรีเฟรชหน้าใหม่"
        retryHref="/inbox"
      />
    )
  }
  const shop = { id: activeCtx.shopId, vertical: shopRow.vertical }

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
      externalReadAt: true, // feature 00018 read receipt — watermark ลูกค้าอ่านถึงเวลานี้
      buyerUserId: true,
      buyer: { select: { id: true, displayName: true, avatar: true } },
      externalContact: {
        select: {
          name: true,
          avatarUrl: true, // IG profile_pic (Messenger=null) — header avatar ลูกค้า
          customer: { select: { id: true, phone: true } },
        },
      },
      // avatarUrl: รูปเพจ (avatar ฝั่งร้าน mine) + name: ชื่อเพจ (badge แสดงชื่อเพจแทน "Messenger")
      // — user request 2026-07-23: ร้านมีหลายเพจ ต้องรู้ว่าลูกค้าทักมาจากเพจไหน + เห็นรูปเพจในเธรด
      shopChannel: { select: { status: true, avatarUrl: true, name: true } },
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
  const buyerAvatar = conversation.buyer?.avatar ?? conversation.externalContact?.avatarUrl ?? null

  // feature 00018 (user request 2026-07-23): avatar ฝั่งร้าน (ข้อความ mine) แสดง "รูปเพจนั้น ๆ" แทน
  // ไอคอน building-store ทั่วไป — ช่องทางนอกใช้รูป Page ที่เชื่อม (ShopChannel.avatarUrl, เป็น http URL
  // ของ Meta CDN), DEEP ใช้โลโก้ร้าน (Shop.logo = storage fileId). null → ChatThread fallback ไอคอนร้าน
  const shopAvatar =
    conversation.channel !== 'DEEP' ? conversation.shopChannel?.avatarUrl ?? null : shopRow.logo ?? null

  // T4 — 24h messaging window (เฉพาะความหมายสำหรับ channel != DEEP; DEEP ก็คำนวณได้แต่ ChatThread
  // จะไม่ใช้เพราะ isExternal=false) + token invalid ของเพจที่ผูกเธรดนี้
  const windowState = getWindowState(conversation.lastInboundAt)
  // แยกเคส "ลูกค้ายังไม่เคยทักเข้ามาเลย" (lastInboundAt=NULL) ออกจาก "ทักแล้วแต่เกิน 24 ชม."
  // (user report 2026-07-24) — ทั้งคู่ทำ window ปิดเหมือนกัน แต่ข้อความต่างกัน: เธรดที่ร้าน initiate
  // จาก Facebook เอง (echo เข้ามาเป็น SHOP ล้วน) จะไม่มี inbound เลย → banner ต้องบอกว่า "รอลูกค้า
  // ทักเข้ามาก่อน" ไม่ใช่ "เกิน 24 ชม.นับจากข้อความล่าสุดของลูกค้า" ที่สื่อว่าเคยทักแล้ว
  const neverInbound = conversation.lastInboundAt === null
  // เช็ค "ไม่ใช่ ACTIVE" ไม่ใช่เช็คแค่ TOKEN_INVALID — ครอบ DISCONNECTED (ร้านถอดเพจเอง) ด้วย
  // ต้องตรงกับ guard ฝั่ง service (sendOutboundMessage โยน CHANNEL_NOT_ACTIVE เมื่อ status !== 'ACTIVE')
  // ไม่งั้นเธรดของเพจที่ถอดไปแล้วจะเปิดช่องพิมพ์ให้ แล้วไปเด้ง error ตอนกดส่ง
  const tokenInvalid =
    conversation.channel !== 'DEEP' && (conversation.shopChannel?.status ?? 'ACTIVE') !== 'ACTIVE'

  // ชื่อเพจที่เธรดนี้ผูกอยู่ (null = เธรด Deep / ไม่มี ShopChannel) — badge ใช้แทนชื่อช่องทาง
  const channelName = conversation.shopChannel?.name ?? null
  // รูปเพจสำหรับ badge ช่องทางที่หัวเธรด (user สั่ง 2026-07-23) — select avatarUrl มาแล้วข้างบน
  const channelAvatarUrl = conversation.shopChannel?.avatarUrl ?? null

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
    conversationId: conversation.id,
    contactName: buyerDisplayName,
    avatar: buyerAvatar, // user report 2026-07-24: right panel ไม่มีรูป — ส่งชุดเดียวกับ ChatThread header
    channel: conversation.channel,
    channelName,
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
    // gap ระหว่างคอลัมน์: user สั่งตัดออก 2026-07-23 — คอลัมน์เธรดกับแผงข้อมูลลูกค้าชนกันเป็น
    // ผืนเดียวแบบแอปแชทจริง (เส้นแบ่งมาจากขอบการ์ดเอง ไม่ต้องมีช่องว่างคั่น)
    <div className="flex h-full">
      <ChatThread
        conversationId={conversation.id}
        buyerName={buyerDisplayName}
        buyerAvatar={buyerAvatar}
        shopAvatar={shopAvatar}
        externalReadAt={conversation.externalReadAt ? conversation.externalReadAt.toISOString() : null}
        channel={conversation.channel}
        channelName={channelName}
        channelAvatarUrl={channelAvatarUrl}
        windowOpen={windowState.open}
        msRemaining={windowState.msRemaining}
        tokenInvalid={tokenInvalid}
        neverInbound={neverInbound}
        customerPanelData={customerPanelData}
      />
      <div className="hidden h-full w-96 shrink-0 lg:block">
        <CustomerPanel data={customerPanelData} />
      </div>
    </div>
  )
}
