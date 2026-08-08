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
 *    เพราะ context ไม่มี field นี้) resolve+fallback ONLINE_SALES ด้วย isShopVertical() ก่อนส่งลง prop
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
import { resolveChatScope } from '@/lib/chat-scope'
import { ThreadShopProvider } from '../../_components/DraftOrderProvider'
import { getWindowState, syncInboundWindowFromMeta, isHumanAgentEnabled } from '@/services/channel-chat.service'
import { BOOKING_ORDER_TYPE } from '@/services/booking.service'
import { isShopVertical, DEFAULT_SHOP_VERTICAL } from '@/lib/lodging'
import { maskPhone } from '@/lib/phone-mask'
import { findConversationShopForUser } from '@/services/chat.service'
import SellerErrorState from '@/app/(paces)/seller/(dashboard)/_shared/SellerErrorState'
import ChatShopAutoSwitch from './components/ChatShopAutoSwitch'
import ChatThread from './components/ChatThread'
import CustomerPanel, { type CustomerPanelData, type CustomerPanelOrder } from './components/CustomerPanel'

export const metadata: Metadata = { title: 'ข้อความ' }

type PageProps = {
  params: Promise<{ conversationId: string }>
  /** `switched=1` = เพิ่งสลับร้านมารอบหนึ่งแล้ว — ตัวกันวนซ้ำ (ดู ChatShopAutoSwitch ด้านล่าง) */
  searchParams: Promise<{ switched?: string }>
}

export default async function SellerInboxThreadPage({ params, searchParams }: PageProps) {
  const { conversationId } = await params
  const { switched } = await searchParams

  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  // bug fix: resolve ร้านที่ active จริง (Personal หรือ Business ตาม session.user.activeShopId,
  // re-verify membership เสมอ) — ห้ามใช้ getShopByUserId (คืน PERSONAL เสมอ, คือบั๊กเดิม)
  // feature 00037 — เธรดถูกหาในขอบเขต "ทุกร้านที่ผู้ใช้ดูอยู่" ไม่ใช่แค่ร้าน active
  const scope = await resolveChatScope({
    user: { id: user.id as string, activeShopId: (user.activeShopId as string | null | undefined) ?? null },
  })
  if (!scope) {
    return (
      <SellerErrorState
        title="ไม่พบร้านที่กำลังใช้งาน"
        message="ร้านนี้อาจถูกลบหรือคุณไม่มีสิทธิ์เข้าถึงแล้ว ลองสลับร้านหรือรีเฟรชหน้าใหม่"
        retryHref="/inbox"
      />
    )
  }
  /**
   * 🛑 หาเธรด "ก่อน" ทุก query อื่นเสมอ — อย่าสลับลำดับ (perf, แก้ 2026-08-07)
   *
   * เดิมหน้านี้ยิง query ร้าน/บอท/คีย์เวิร์ด 5 ตัวก่อน แล้วค่อยเช็คว่ามีเธรดไหม — เคสที่กด
   * notification ของ "อีกร้าน" (เธรดไม่อยู่ในร้านที่ active) จึงเสีย query ทิ้งเปล่าทั้ง 5 ตัว
   * ทุกครั้ง ทั้งที่ผลลัพธ์คือ redirect ออกไปสลับร้านอยู่ดี
   *
   * ย้ายขึ้นมาแล้วยัง "เร็วขึ้นในเคสปกติ" ด้วย: เดิมเป็น 3 รอบ round-trip เรียงกัน
   * (shopRow → Promise.all → Promise.all) ตอนนี้เหลือ 2 (เธรด → Promise.all ก้อนเดียว 5 ตัว)
   *
   * ownership scope อยู่ใน WHERE (compound id+shopId) — ไม่ใช่ post-check
   * feature 00018: buyer เป็น null ได้ (เธรดช่องทางนอก) — include externalContact เพื่อ fallback ชื่อ
   * T4: channel/lastInboundAt/shopChannel.status สำหรับ 24h banner + token-invalid banner
   * T5: externalContact.customer (ผูกผ่านช่องทางนอก) + buyerUserId (lookup Customer.userId ฝั่ง DEEP)
   */
  const conversation = await prisma.conversation.findFirst({
    // feature 00037 — หาเธรดในขอบเขต "ทุกร้านที่ผู้ใช้กำลังดู" (โหมดร้านเดียว = array ความยาว 1
    // ผลลัพธ์เท่าเดิม) ownership ยังอยู่ใน WHERE ตั้งแต่คำสั่งแรกเหมือนเดิม ไม่ใช่ post-check
    where: { id: conversationId, shopId: { in: scope.shopIds } },
    // shopId ต้องเลือกมาด้วย — ทุกอย่างหลังจากนี้ผูกกับ "ร้านของเธรด" ไม่ใช่ร้านที่ active
    select: {
      id: true,
      shopId: true, // feature 00037 — แหล่งความจริงของ "เธรดนี้เป็นของร้านไหน"
      channel: true,
      lastInboundAt: true,
      externalReadAt: true, // feature 00018 read receipt — watermark ลูกค้าอ่านถึงเวลานี้
      // feature 00023 — สถานะบอทของเธรดนี้ (พักเพราะคนเข้ามาตอบ / ส่งต่อคนแล้ว)
      autoReplyPausedUntil: true,
      handoffAt: true,
      handoffReason: true,
      // feature 00018 E5 — ลูกค้าทักจากโฆษณา (แบนเนอร์บนหัวเธรด: รูป + ชื่อโฆษณา)
      // ค่าเหล่านี้เป็น "ครั้งล่าสุด" ที่ลูกค้ากดโฆษณาเข้ามา (ประวัติเต็มอยู่ที่ ConversationAdReferral)
      referralSource: true,
      referralAdTitle: true,
      referralAdBody: true,
      referralAdPermalink: true,
      referralAdId: true,
      referralPhotoFileId: true,
      buyerUserId: true,
      buyer: { select: { id: true, displayName: true, avatar: true } },
      externalContact: {
        select: {
          name: true,
          avatarUrl: true, // IG profile_pic (Messenger=null) — header avatar ลูกค้า
          customer: { select: { id: true, phone: true, createdAt: true } },
        },
      },
      // avatarUrl: รูปเพจ (avatar ฝั่งร้าน mine) + name: ชื่อเพจ (badge แสดงชื่อเพจแทน "Messenger")
      // — user request 2026-07-23: ร้านมีหลายเพจ ต้องรู้ว่าลูกค้าทักมาจากเพจไหน + เห็นรูปเพจในเธรด
      shopChannel: { select: { status: true, avatarUrl: true, name: true } },
    },
  })

  if (!conversation) {
    /**
     * ไม่เจอในร้านที่ active — ก่อนจะโยนหน้า error ให้เช็คก่อนว่าเป็นของ "อีกร้าน" ที่ผู้ใช้
     * มีสิทธิ์อยู่หรือเปล่า (bug จริง หัวหน้ารายงาน 2026-08-06)
     *
     * เคสที่เกิด: ผู้ขายถือ 2 ร้าน ผูก Facebook Page คนละเพจไว้คนละร้าน → push ของทั้งสองร้าน
     * ลงเครื่องเดียวกัน (shopAudience ส่งให้เจ้าของ+สมาชิก ซึ่งเป็นคนเดียวกัน) แต่ payload มี
     * แค่ /inbox/{conversationId} ไม่มี shopId → กด noti ของร้าน B ตอน active ร้าน A แล้ว
     * WHERE ด้านบน (scope ที่ activeShopId) ไม่เจอ → ขึ้น "ไม่พบบทสนทนานี้" ทั้งที่มีสิทธิ์เต็ม
     *
     * แก้ที่นี่แทนการใส่ shopId ลง push payload โดยตั้งใจ: payload เป็นของแอป ซึ่งต้อง build
     * และส่ง App Store ใหม่ทุกครั้งที่แก้ — ทำที่เว็บแล้วแอปที่ติดตั้งไปแล้วได้ผลทันที
     *
     * ยังปลอดภัยเท่าเดิม: findConversationShopForUser scope สิทธิ์ใน WHERE
     * (shopId ∈ ร้านที่ user เข้าถึงได้) และคืน null เหมือนกันทั้ง "ไม่มี" กับ "ไม่มีสิทธิ์"
     *
     * 🛑 กันวนไม่รู้จบ: สลับได้รอบเดียวเท่านั้น
     * ถ้า session.update() ไม่โปรพาเกตทัน รอบถัดไปจะยัง resolve ได้ร้านเดิม แล้ว render ตัวสลับ
     * ซ้ำ → เด้งวนไม่จบ ซึ่งแย่กว่าบั๊กเดิมที่อย่างน้อยยังหยุดที่หน้า error ให้กดกลับได้
     * ChatShopAutoSwitch จึงพากลับมาที่ `?switched=1` เสมอ — เห็นค่านี้แล้วยังไม่เจอเธรด
     * แปลว่าสลับไม่สำเร็จจริง ให้ตกไปหน้า error ตามปกติ
     */
    const ownerShop = switched
      ? null
      : await findConversationShopForUser(conversationId, user.id as string)
    // feature 00037: ในโหมดรวม เส้นนี้แทบไม่ถูกเรียกแล้ว (เธรดของทุกร้านอยู่ในขอบเขตตั้งแต่แรก)
    // แต่ยังต้องมีอยู่สำหรับโหมดร้านเดียว + ทางเข้าจาก push notification ของแอปมือถือ
    if (ownerShop && !scope.shopIds.includes(ownerShop.shopId)) {
      return (
        <ChatShopAutoSwitch
          conversationId={conversationId}
          shopId={ownerShop.shopId}
          shopName={ownerShop.shopName}
          logo={ownerShop.logo}
          kind={ownerShop.kind}
        />
      )
    }

    // feat 00018 งาน 1: ตัด PageBreadcrumb ออก (ดู comment หัวไฟล์ inbox/page.tsx) — desktop chat
    // เต็มจอไม่มี breadcrumb; retryHref="/inbox" ในปุ่ม "ลองใหม่" ของ SellerErrorState ทำหน้าที่
    // ทางกลับแทนอยู่แล้ว
    return (
      <SellerErrorState title="ไม่พบบทสนทนานี้" message="บทสนทนานี้อาจถูกลบ หรือคุณไม่มีสิทธิ์เข้าถึง" retryHref="/inbox" />
    )
  }

  /**
   * เจอเธรดแล้ว — ยิงข้อมูลประกอบทั้งหมดพร้อมกันรอบเดียว (เดิมแยกเป็น 3 รอบเรียงกัน)
   *
   * feature 00018 T5: vertical ต้อง query แยก (resolveActiveShopContext คืนแค่ shopId/kind/role/
   * locked ไม่มี vertical) — defensive: ไม่ควรเป็น null จริง (context เพิ่ง verify แถวบนแล้ว)
   * feature 00023: chatbotCfg/testThread = ห้องนี้ถูกเลือกไว้ทดสอบ DeepAI ไหม (ป้ายบนหัวเธรด)
   */
  // 🛑 feature 00037 — ทุก query ในก้อนนี้ผูกกับ conversation.shopId (ร้านของเธรด) ไม่ใช่ร้านที่
  // active. ในกล่องแชทรวม สองค่านี้ไม่ใช่สิ่งเดียวกันอีกต่อไป — ถ้าใช้ร้านที่ active ผู้ใช้จะเห็น
  // ป้ายบอท/คำเรียกรายการ/โลโก้ ของอีกร้านมาแปะบนเธรดนี้ โดยที่ทุกอย่างดูปกติดี
  const threadShopId = conversation.shopId
  const [shopRow, chatbotCfg, testThread, liveKeywordCount, keywordTestThread] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: threadShopId },
      select: { vertical: true, logo: true, shopName: true },
    }),
    prisma.autoReplyConfig.findUnique({
      where: { shopId: threadShopId },
      select: { aiChatbotStatus: true },
    }),
    prisma.aiChatbotTestThread.findUnique({
      where: { shopId_conversationId: { shopId: threadShopId, conversationId } },
      select: { id: true },
    }),
    prisma.autoReplyKeyword.count({ where: { shopId: threadShopId, status: 'LIVE' } }),
    prisma.autoReplyKeywordTestThread.findFirst({
      where: { conversationId, keyword: { shopId: threadShopId, status: 'TEST' } },
      select: { id: true },
    }),
  ])
  const isChatbotTestThread = chatbotCfg?.aiChatbotStatus === 'TEST' && Boolean(testThread)

  /**
   * ห้องนี้มีบอทตัวไหน "จะตอบ" ไหม ถ้าไม่มีการพัก (feature 00023)
   *
   * WARNING (user report 2026-08-02): แบนเนอร์ "บอทพักตอบห้องนี้อยู่" เคยขึ้นทุกห้องที่มี
   * คนของร้านพิมพ์ตอบ ทั้งที่ห้องนั้นไม่มีบอทตัวไหนทำงานอยู่เลย — ร้านที่ตั้งทุกอย่างเป็น
   * โหมดทดสอบและเลือกไว้แค่ไม่กี่ห้อง จึงเห็นแบนเนอร์ในห้องที่ไม่เกี่ยวข้องเต็มไปหมด
   * การบอกว่า "พัก" สิ่งที่ไม่ได้ทำงานอยู่แล้วคือข้อมูลที่ผิด ไม่ใช่แค่รก
   *
   * เงื่อนไขตรงกับที่ processJob ใช้จริง: LIVE = ทุกห้อง · TEST = เฉพาะห้องในรายการของตัวเอง
   */
  const botCouldReply =
    chatbotCfg?.aiChatbotStatus === 'LIVE' ||
    isChatbotTestThread ||
    liveKeywordCount > 0 ||
    Boolean(keywordTestThread)
  if (!shopRow) {
    return (
      <SellerErrorState
        title="ไม่พบร้านที่กำลังใช้งาน"
        message="ร้านนี้อาจถูกลบหรือคุณไม่มีสิทธิ์เข้าถึงแล้ว ลองสลับร้านหรือรีเฟรชหน้าใหม่"
        retryHref="/inbox"
      />
    )
  }
  const shop = { id: threadShopId!, vertical: shopRow.vertical, name: shopRow.shopName }


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
  // lazy check (user report 2026-07-24): ถ้าหน้าต่างของเรา "ดูปิด" (lastInboundAt ที่เก็บจาก webhook
  // เป็น NULL/หมดอายุ) อาจเป็นเพราะร้านเชื่อมเพจช้ากว่าที่ลูกค้าทัก → ถาม Meta หาเวลาจริง แล้ว persist.
  // เรียกเฉพาะช่องทางนอกที่ดูปิดเท่านั้น (DEEP/หน้าต่างเปิดอยู่ = ไม่แตะ Meta) เพื่อไม่ให้กระทบ latency
  // ของเธรดปกติ. sync คืนค่าเดิมถ้าเรียก Meta ไม่ได้ (fail-safe ไปทางปิดตามเดิม)
  let effectiveLastInbound = conversation.lastInboundAt
  if (conversation.channel !== 'DEEP' && !getWindowState(effectiveLastInbound).open) {
    effectiveLastInbound = await syncInboundWindowFromMeta(conversation.id)
  }

  const windowState = getWindowState(effectiveLastInbound)
  // แยกเคส "ลูกค้ายังไม่เคยทักเข้ามาเลย" (lastInboundAt=NULL) ออกจาก "ทักแล้วแต่เกิน 24 ชม."
  // (user report 2026-07-24) — ทั้งคู่ทำ window ปิดเหมือนกัน แต่ข้อความต่างกัน: เธรดที่ร้าน initiate
  // จาก Facebook เอง (echo เข้ามาเป็น SHOP ล้วน) จะไม่มี inbound เลย → banner ต้องบอกว่า "รอลูกค้า
  // ทักเข้ามาก่อน" ไม่ใช่ "เกิน 24 ชม.นับจากข้อความล่าสุดของลูกค้า" ที่สื่อว่าเคยทักแล้ว
  // (หลัง sync แล้ว: ถ้า Meta ยืนยันว่ายังไม่มีข้อความลูกค้าเลย ก็ยังเป็น neverInbound จริง ๆ)
  const neverInbound = effectiveLastInbound === null
  // เช็ค "ไม่ใช่ ACTIVE" ไม่ใช่เช็คแค่ TOKEN_INVALID — ครอบ DISCONNECTED (ร้านถอดเพจเอง) ด้วย
  // ต้องตรงกับ guard ฝั่ง service (sendOutboundMessage โยน CHANNEL_NOT_ACTIVE เมื่อ status !== 'ACTIVE')
  // ไม่งั้นเธรดของเพจที่ถอดไปแล้วจะเปิดช่องพิมพ์ให้ แล้วไปเด้ง error ตอนกดส่ง
  const tokenInvalid =
    conversation.channel !== 'DEEP' && (conversation.shopChannel?.status ?? 'ACTIVE') !== 'ACTIVE'

  // ชื่อเพจที่เธรดนี้ผูกอยู่ (null = เธรด Deep / ไม่มี ShopChannel) — badge ใช้แทนชื่อช่องทาง
  const channelName = conversation.shopChannel?.name ?? null
  // รูปเพจสำหรับ badge ช่องทางที่หัวเธรด (user สั่ง 2026-07-23) — select avatarUrl มาแล้วข้างบน
  const channelAvatarUrl = conversation.shopChannel?.avatarUrl ?? null

  // T5 — ประเภทกิจการ (fallback ONLINE_SALES เมื่อค่าไม่รู้จัก ห้าม crash/ซ่อน CTA — ภาคผนวก A-1)
  const vertical = isShopVertical(shop.vertical) ? shop.vertical : DEFAULT_SHOP_VERTICAL

  // T5 — หา Customer ที่ผูกไว้: ช่องทางนอกผูกผ่าน ExternalContact.customerId, DEEP ผูกผ่าน
  // Customer.userId (Phase 2 link — ดู schema.prisma Customer model comment)
  let linkedCustomer: { id: string; phone: string; createdAt: Date } | null = null
  if (conversation.channel !== 'DEEP') {
    if (conversation.externalContact?.customer) {
      linkedCustomer = conversation.externalContact.customer
    }
  } else if (conversation.buyerUserId) {
    linkedCustomer = await prisma.customer.findUnique({
      where: { userId: conversation.buyerUserId },
      select: { id: true, phone: true, createdAt: true },
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
          orderNo: true,
          status: true,
          fulfillmentMode: true,
          totalAmount: true,
          createdAt: true,
          updatedAt: true,
          checkIn: true,
          checkOut: true,
          // Order Progress (2026-08-05) — AWAITING_COD ต้องรู้วิธีชำระ + เวลากดรับเงิน
          paymentMethod: true,
          codReceivedAt: true,
          // การ์ด right panel แสดงเหมือนในแชท (user 2026-07-25): ชื่อ/จำนวน/ราคา/รูปสินค้า
          items: { select: { name: true, qty: true, price: true, product: { select: { images: true } } } },
          // feature 00022 — shape เดียวกับ getOrdersByCustomer (lazy-load ต่อจากชุดนี้)
          // status/carrierStatus/courierCode เพิ่ม 2026-08-05: stepper + โลโก้ขนส่งในการ์ด/แถบปัก
          shipments: {
            where: { status: { not: 'CANCELLED' } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { trackingNo: true, courierName: true, courierCode: true, status: true, carrierStatus: true },
          },
        },
      })
    : []

  const panelOrders: CustomerPanelOrder[] = orderRows.map((o) => ({
    id: o.id,
    token: o.publicToken,
    orderNo: o.orderNo,
    status: o.status,
    fulfillmentMode: o.fulfillmentMode,
    totalAmount: o.totalAmount.toFixed(2),
    createdAt: o.createdAt.toISOString(),
    statusAt: o.updatedAt.toISOString(),
    checkIn: o.checkIn ? o.checkIn.toISOString() : null,
    checkOut: o.checkOut ? o.checkOut.toISOString() : null,
    paymentMethod: o.paymentMethod,
    codReceivedAt: o.codReceivedAt ? o.codReceivedAt.toISOString() : null,
    items: o.items.map((it) => ({
      name: it.name,
      qty: it.qty,
      price: it.price.toFixed(2),
      imageFileId: (it.product?.images as string[] | undefined)?.[0] ?? null,
    })),
    shipment: o.shipments[0]
      ? {
          trackingNo: o.shipments[0].trackingNo,
          courierName: o.shipments[0].courierName,
          courierCode: o.shipments[0].courierCode,
          status: o.shipments[0].status,
          carrierStatus: o.shipments[0].carrierStatus,
        }
      : null,
  }))

  // สถิติลูกค้า (user สั่ง 2026-07-24: แถว จำนวนออเดอร์/รวมยอดซื้อ/เป็นลูกค้ามา ในแท็บข้อมูลลูกค้า)
  // — aggregate จริงทั้งหมด ไม่ใช่ 20 แถวที่ list ใช้ (panelOrders cap 20) จึงถูกต้องแม้ลูกค้าซื้อเยอะ
  //   orderCount = ทุกออเดอร์ของลูกค้าในร้านนี้; totalSpent = ผลรวมเฉพาะที่ไม่ยกเลิก (= ยอดซื้อจริง)
  const orderTypeFilter = vertical === 'LODGING' ? { type: BOOKING_ORDER_TYPE } : {}
  let customerStats: { orderCount: number; totalSpent: string; since: string } | null = null
  if (linkedCustomer) {
    const [orderCount, spentAgg] = await Promise.all([
      prisma.order.count({ where: { shopId: shop.id, customerId: linkedCustomer.id, ...orderTypeFilter } }),
      prisma.order.aggregate({
        where: { shopId: shop.id, customerId: linkedCustomer.id, ...orderTypeFilter, status: { not: 'CANCELLED' } },
        _sum: { totalAmount: true },
      }),
    ])
    customerStats = {
      orderCount,
      totalSpent: spentAgg._sum.totalAmount ? spentAgg._sum.totalAmount.toFixed(2) : '0.00',
      since: linkedCustomer.createdAt.toISOString(),
    }
  }

  // RSC PII: เบอร์โทร mask ที่นี่เสมอ ก่อนลง prop ที่ถูก serialize เข้า flight ของ client layout
  const customerPanelData: CustomerPanelData = {
    conversationId: conversation.id,
    contactName: buyerDisplayName,
    avatar: buyerAvatar, // user report 2026-07-24: right panel ไม่มีรูป — ส่งชุดเดียวกับ ChatThread header
    channel: conversation.channel,
    channelName,
    channelAvatarUrl,
    vertical,
    customer: linkedCustomer ? { id: linkedCustomer.id, phoneMasked: maskPhone(linkedCustomer.phone) } : null,
    customerStats,
    // feature 00018 E5 (user request 2026-07-26) — ป้ายกำกับอัตโนมัติแบบ Business Suite
    // (`ad_id.…` / `messenger_ads`) ให้ร้านแมพได้ว่าลูกค้าคนนี้มาจากโฆษณาไหน
    adReferralId: conversation.referralSource === 'ADS' ? conversation.referralAdId : null,
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
    // feature 00037 — ThreadShopProvider ฉีด "ร้านของเธรดนี้" ให้ทุก openDraft ที่อยู่ข้างใน
    // โดยที่ 8 จุดเรียกเดิมไม่ต้องแก้เลย (และจุดที่เพิ่มใหม่ทีหลังก็จะได้ถูกต้องเอง)
    <ThreadShopProvider shopId={shop.id}>
    <div className="flex h-full">
      <ChatThread
        conversationId={conversation.id}
        shopId={shop.id}
        // ป้ายร้านบนหัวเธรด — แสดงเฉพาะโหมดรวม (โหมดร้านเดียวหัวเธรดต้องเหมือนเดิม 100%)
        shopName={scope.mode === 'UNIFIED' ? shop.name : null}
        buyerName={buyerDisplayName}
        buyerAvatar={buyerAvatar}
        shopAvatar={shopAvatar}
        externalReadAt={conversation.externalReadAt ? conversation.externalReadAt.toISOString() : null}
        botPausedUntil={conversation.autoReplyPausedUntil ? conversation.autoReplyPausedUntil.toISOString() : null}
        botHandoffAt={conversation.handoffAt ? conversation.handoffAt.toISOString() : null}
        botHandoffReason={conversation.handoffReason}
        isChatbotTestThread={isChatbotTestThread}
        botCouldReply={botCouldReply}
        channel={conversation.channel}
        channelName={channelName}
        channelAvatarUrl={channelAvatarUrl}
        adReferral={
          // แสดงเฉพาะที่มาจาก "โฆษณา" จริง — SHORTLINK (ลิงก์ m.me) ไม่ใช่โฆษณา จึงไม่ขึ้นแบนเนอร์
          // ต้องมีอย่างน้อยชื่อหรือรหัสโฆษณา ไม่งั้นแบนเนอร์จะว่างเปล่าไม่มีประโยชน์
          conversation.referralSource === 'ADS' &&
          (conversation.referralAdBody || conversation.referralAdTitle || conversation.referralAdId)
            ? {
                adId: conversation.referralAdId,
                adTitle: conversation.referralAdTitle,
                adBody: conversation.referralAdBody,
                permalink: conversation.referralAdPermalink,
                photoFileId: conversation.referralPhotoFileId,
              }
            : null
        }
        windowOpen={windowState.open}
        msRemaining={windowState.msRemaining}
        // ระดับกลาง: เกิน 24 ชม. แต่ยังไม่เกิน 7 วัน — คนตอบเองได้ผ่าน HUMAN_AGENT tag
        // ต้องเช็ค isHumanAgentEnabled() ด้วย ไม่งั้นจะเปิดช่องพิมพ์ให้ทั้งที่ยังไม่ได้ permission
        // แล้วไปเด้ง error ตอนกดส่ง ซึ่งแย่กว่าบอกตั้งแต่แรกว่าส่งไม่ได้
        humanAgentOpen={isHumanAgentEnabled() && windowState.humanAgentOpen}
        humanAgentExpiresAt={windowState.humanAgentExpiresAt?.toISOString() ?? null}
        tokenInvalid={tokenInvalid}
        neverInbound={neverInbound}
        customerPanelData={customerPanelData}
      />
      {/* bug fix 2026-08-01 (user report: iPad Pro เพี้ยน): เดิม `lg:block` = โผล่ที่ 1024px พร้อมกับ
          rail (384px) ทำให้สองข้างกิน 768px เหลือคอลัมน์แชทแค่ 256px — ข้อความตัดบรรทัดทุก 3-4 คำ
          เลื่อนเป็น `xl:block` (1280px) แทน ช่วง 1024-1279 ใช้ CustomerPanelSheet เหมือนจอเล็ก
          (ปุ่มเปิดที่ ChatThread.tsx ต้องเป็น `xl:hidden` คู่กันเสมอ) */}
      <div className="hidden h-full w-96 shrink-0 xl:block">
        <CustomerPanel data={customerPanelData} />
      </div>
    </div>
    </ThreadShopProvider>
  )
}
