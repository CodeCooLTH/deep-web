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
import { shouldHidePayments } from '@/lib/app-shell-server'
import { resolveChatScope } from '@/lib/chat-scope'
import { ThreadShopProvider } from '../../_components/DraftOrderProvider'
import { getWindowState, syncInboundWindowFromMeta, canUseHumanAgent } from '@/services/channel-chat.service'
// (S-14b, feature 00025) หน้าต่างตอบฟรี + โควตาของ LINE — คำนวณฝั่ง server แล้วส่งเป็นตัวเลข/boolean
// ล้วนลง prop (เหมือน windowState/tokenInvalid เดิม) ไม่ให้ service หลุดเข้า client bundle
import { getLineReplyWindowState } from '@/lib/line/reply-window'
import { getLineQuotaByChannelId } from '@/services/line-quota.service'
import { BOOKING_ORDER_TYPE } from '@/services/booking.service'
import { isShopVertical, DEFAULT_SHOP_VERTICAL } from '@/lib/lodging'
import { maskPhone } from '@/lib/phone-mask'
import { findConversationShopForUser } from '@/services/chat.service'
import { resolvePostThumbnail } from '@/services/page-comment.service'
import SellerErrorState from '@/app/(paces)/seller/(dashboard)/_shared/SellerErrorState'
import ChatShopAutoSwitch from './components/ChatShopAutoSwitch'
import RscTiming from './components/RscTiming'
import { createRscTimer } from '@/lib/rsc-timer'
import ChatThread from './components/ChatThread'
import CustomerPanel, { type CustomerPanelData, type CustomerPanelOrder } from './components/CustomerPanel'
import { resolveLibraryOwner } from '@/lib/customer-file-library'
import { listSavedFileIds } from '@/services/customer-file-library.service'
// SSOT ของ "ลูกค้าคนนี้มีพฤติกรรมอะไรบ้าง" — ใช้ร่วมกับป้ายท้ายชื่อลูกค้าในตาราง /orders (HR16)
import { summarizeCustomerBehavior, type CustomerBehavior } from '@/lib/customer-behavior'

export const metadata: Metadata = { title: 'ข้อความ' }

type PageProps = {
  params: Promise<{ conversationId: string }>
  /** `switched=1` = เพิ่งสลับร้านมารอบหนึ่งแล้ว — ตัวกันวนซ้ำ (ดู ChatShopAutoSwitch ด้านล่าง) */
  searchParams: Promise<{ switched?: string; debug?: string }>
}

export default async function SellerInboxThreadPage({ params, searchParams }: PageProps) {
  const { conversationId } = await params
  const { switched, debug } = await searchParams

  /**
   * ตัวจับเวลารายเฟสของ RSC — ผลไหลออกทาง console เมื่อส่ง `?debug=timing` เท่านั้น
   * (ดู `src/lib/rsc-timer.ts` ว่าทำไมใช้ Server-Timing ไม่ได้กับ page ของ App Router)
   */
  const { mark, marks: timingMarks } = createRscTimer()

  const session = await getServerSession(authOptions)
  mark('auth')
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  // bug fix: resolve ร้านที่ active จริง (Personal หรือ Business ตาม session.user.activeShopId,
  // re-verify membership เสมอ) — ห้ามใช้ getShopByUserId (คืน PERSONAL เสมอ, คือบั๊กเดิม)
  // feature 00037 — เธรดถูกหาในขอบเขต "ทุกร้านที่ผู้ใช้ดูอยู่" ไม่ใช่แค่ร้าน active
  const scope = await resolveChatScope({
    user: { id: user.id as string, activeShopId: (user.activeShopId as string | null | undefined) ?? null },
  })
  mark('resolveChatScope')
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
      // feature 00048 — ตัวตัดสินว่าคลังไฟล์ผูกกับ "คน" (ExternalContact) หรือ "เธรด" (DEEP)
      externalContactId: true,
      buyer: { select: { id: true, displayName: true, avatar: true } },
      externalContact: {
        select: {
          name: true,
          avatarUrl: true, // IG profile_pic (Messenger=null) — header avatar ลูกค้า
          customer: { select: { id: true, phone: true, createdAt: true } },
          // isBlocked (2026-08-10) — LINE เท่านั้นที่เขียนค่านี้ (BR-LINE-15) ใช้ทำแถบสถานะ
          // "ลูกค้าอาจปิดการรับข้อความ" — ดู contactBlocked ด้านล่าง
          isBlocked: true,
          // externalUserId (feature 00043, S-5) — PSID/IGSID ใช้เทียบ allow-list ใน
          // canUseHumanAgent() ที่นี่เท่านั้น (server) — ไม่ส่งค่านี้ลง prop ของ ChatThread ตรง ๆ
          // ผลลัพธ์ที่ไหลลง client คือ boolean (humanAgentOpen) เท่านั้น
          externalUserId: true,
        },
      },
      // avatarUrl: รูปเพจ (avatar ฝั่งร้าน mine) + name: ชื่อเพจ (badge แสดงชื่อเพจแทน "Messenger")
      // — user request 2026-07-23: ร้านมีหลายเพจ ต้องรู้ว่าลูกค้าทักมาจากเพจไหน + เห็นรูปเพจในเธรด
      // id (2026-08-10) — ใช้ถามโควตา LINE ต่อ (getLineQuotaByChannelId) 🛑 ห้าม select
      // accessTokenEnc/channelSecretEnc มาที่นี่เด็ดขาด: หน้านี้เป็น server component ใต้ layout
      // ฝั่ง client ทุกอย่างที่ไหลลง prop จะถูก serialize ลง flight payload
      shopChannel: { select: { id: true, status: true, avatarUrl: true, name: true } },
      // (S-14b) หน้าต่างตอบฟรีของ LINE — reply token อายุ 60 วินาที ใช้ได้ครั้งเดียว
      // 🛑 ทั้ง 3 คอลัมน์นี้ใช้ "คำนวณ" อย่างเดียว **ห้ามส่ง replyToken ลง prop** (ใครถือ token นี้
      // ส่งข้อความในนามร้านได้ทันที — API.md §8 ข้อสอง)
      replyToken: true,
      replyTokenExpiresAt: true,
      replyTokenUsedAt: true,
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
  mark('conversation')
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
  //
  // 🛑 (S-14b, 2026-08-10) LINE ไม่เข้าเส้นทางนี้เลย — หน้าต่างตอบฟรีของ LINE คือ **reply token
  // อายุ 60 วินาที** ไม่ใช่ 24 ชั่วโมงนับจากข้อความล่าสุด. ก่อนหน้านี้เธรด LINE ใช้กติกาของ Meta
  // ทั้งดุ้น ซึ่งผิดสองชั้นซ้อนกันและไม่มีอะไรฟ้อง: (1) แถบสถานะบอกเวลาที่ไม่ใช่ความจริงของ LINE
  // (2) `syncInboundWindowFromMeta` **ยิง Graph API ของ Meta ด้วย channel access token ของ LINE**
  // ทุกครั้งที่เปิดเธรดที่ลูกค้าทักเกิน 24 ชม. — คำขอที่ไม่มีวันสำเร็จ ล้มเงียบ (getLastInboundTime
  // กลืน error คืน null) จึงไม่เคยมีใครเห็น เหลือไว้แค่ latency ที่จ่ายฟรีทุกครั้ง
  const isLineThread = conversation.channel === 'LINE'
  let effectiveLastInbound = conversation.lastInboundAt
  if (!isLineThread && conversation.channel !== 'DEEP' && !getWindowState(effectiveLastInbound).open) {
    effectiveLastInbound = await syncInboundWindowFromMeta(conversation.id)
  }
  // 🛑 เฟสนี้ยิง Graph ของ Meta เมื่อหน้าต่าง 24 ชม. ปิด — บน prod **92.1% ของเธรด Messenger
  // (2,438/2,647) หน้าต่างปิดแล้ว** จึงเป็นเฟสที่คาดว่าจะแพงที่สุดสำหรับเธรดส่วนใหญ่
  mark('syncInboundWindow(Meta)')

  // LINE คืนรูปร่างเดียวกัน (`open`/`msRemaining`) จึงส่งลง prop เดิมได้โดยไม่ต้องแตะสัญญาของ
  // ChatThread — ตัวจับเวลาฝั่ง client ที่มีอยู่แล้วจะพลิก "ส่งฟรี" เป็นสถานะโควตาเองเมื่อครบเวลา
  const windowState = isLineThread
    ? { ...getLineReplyWindowState(conversation, Date.now()), humanAgentOpen: false, humanAgentExpiresAt: null }
    : getWindowState(effectiveLastInbound)
  // แยกเคส "ลูกค้ายังไม่เคยทักเข้ามาเลย" (lastInboundAt=NULL) ออกจาก "ทักแล้วแต่เกิน 24 ชม."
  // (user report 2026-07-24) — ทั้งคู่ทำ window ปิดเหมือนกัน แต่ข้อความต่างกัน: เธรดที่ร้าน initiate
  // จาก Facebook เอง (echo เข้ามาเป็น SHOP ล้วน) จะไม่มี inbound เลย → banner ต้องบอกว่า "รอลูกค้า
  // ทักเข้ามาก่อน" ไม่ใช่ "เกิน 24 ชม.นับจากข้อความล่าสุดของลูกค้า" ที่สื่อว่าเคยทักแล้ว
  // (หลัง sync แล้ว: ถ้า Meta ยืนยันว่ายังไม่มีข้อความลูกค้าเลย ก็ยังเป็น neverInbound จริง ๆ)
  const neverInbound = effectiveLastInbound === null

  // 🛑 "เธรดนี้เกิดจากการตอบคอมเมนต์ไหม" ต้องถามจากข้อมูล ไม่ใช่ดมสตริงในเนื้อข้อความ
  //
  // ของเดิมเช็คด้วย `messages.some((m) => m.body.includes('comment_id='))` ที่ ChatThread ซึ่งค้น
  // ใน **ข้อความอะไรก็ได้ในเธรด รวมข้อความที่ผู้ขายพิมพ์เอง** — ลิงก์คอมเมนต์ของ Facebook หน้าตาคือ
  // `.../posts/...?comment_id=123` ผู้ขายที่แปะลิงก์คอมเมนต์ให้ลูกค้าดูในแชทปกติ จะพลิกเธรดนั้น
  // เป็น comment-origin ทันที แล้วได้ผลข้างเคียง 2 อย่างที่ผิดทั้งคู่: แถบเตือน 24 ชม. ที่ควรมี
  // ถูกลบออกเงียบ ๆ · เวลาส่งไม่ผ่านได้อ่านว่า "Meta ให้ตอบกลับคอมเมนต์ได้ข้อความเดียว" ในเธรดที่
  // ไม่เกี่ยวกับคอมเมนต์เลย (impeccable critique 2026-08-09 รอบ 2 · P2)
  //
  // แหล่งความจริงคือ `CommentReplyLog.conversationId` — แถวนี้ถูกเขียนโดย comment-private-reply
  // service ตอนสร้างห้องแชทจากคอมเมนต์ ไม่มีทางเกิดจากข้อความที่ใครพิมพ์
  //
  // ดึง "คอมเมนต์ต้นเหตุ" มาด้วย (user report ผ่านหัวหน้า 2026-08-09 10:04 "กดจาก Noti ตอนนี้ยัง
  // เจอปัญหาไม่เจอข้อความอยู่นะ" + ภาพหน้าจอ): เธรดที่เกิดจากการทักแชทจากคอมเมนต์ **ไม่มีข้อความ
  // ของลูกค้าอยู่ในเธรดเลยสักใบ** — สิ่งเดียวที่อยู่ก่อนข้อความของร้านคือบรรทัดระบบภาษาอังกฤษที่
  // Meta แทรกให้ ("You are responding to a user comment to a post on your Page.") ซึ่งไม่ได้บอก
  // ว่าลูกค้าพูดอะไร ผู้ขายจึงเปิดเข้ามาแล้วไม่รู้ว่ากำลังตอบเรื่องอะไร ต้องเด้งออกไปเปิด Facebook เอง
  //
  // เคสจริงที่ยืนยันกับฐาน prod: ลูกค้าคอมเมนต์ว่า "เยี่ยม" เวลา 10:25 → ผู้ขายกดทักแชท 10:29
  // → ห้องแชทมี 2 ข้อความ ฝั่งร้านทั้งคู่ ลูกค้า 0 ใบ (conversation d895e648…)
  //
  // ข้อมูลมีอยู่ครบแล้วในฐาน ไม่ต้องยิง Graph ใหม่ — CommentReplyLog ผูก conversationId ↔ commentId
  // ไว้ตั้งแต่ตอนสร้างห้อง และ PageComment เก็บทั้งข้อความ/ชื่อ/เวลา/ไฟล์แนบ
  mark('shop+chatbot+keyword')
  const commentOriginLog = await prisma.commentReplyLog.findFirst({
    where: { conversationId: conversation.id },
    select: {
      id: true,
      comment: {
        select: {
          message: true,
          attachmentUrl: true,
          createdTime: true,
          externalCommentId: true,
          // ดึงโพสต์มาแสดงในการ์ดด้วย (user 2026-08-10 "อยากให้เอา รูป Posts มาแสดงด้วย
          // ว่าเค้า Post จากไหน เหมือน ads พร้อม ชื่อ Posts")
          // 🛑 ต้องเอา mirroredFileId มาด้วยเสมอ ห้ามใช้ thumbnailUrl เดี่ยว ๆ — URL ของ fbcdn
          // หมดอายุ ~4 วัน (ดู resolvePostThumbnail)
          post: { select: { permalink: true, message: true, thumbnailUrl: true, mirroredFileId: true, mediaType: true } },
        },
      },
    },
  })
  const isCommentReplyThread = commentOriginLog !== null

  /**
   * ลิงก์ไปคอมเมนต์จริงบน Facebook
   *
   * `externalCommentId` ของ Meta เป็นรูป `{postId}_{commentId}` — พารามิเตอร์ `comment_id` ของ
   * permalink ต้องการเฉพาะท่อนหลัง จึงตัดที่ `_` ตัวสุดท้าย
   *
   * ไม่มี permalink (โพสต์ที่ sync มาไม่ครบ) → คืน null แล้วการ์ดจะไม่ขึ้นลิงก์เลย ดีกว่าเดา URL
   * แล้วพาผู้ขายไปหน้า error ของ Facebook · ถ้าท่อน comment_id เพี้ยน Facebook จะเปิดโพสต์ให้อยู่ดี
   * (เสียแค่การเลื่อนไปที่คอมเมนต์นั้น ไม่ถึงกับพัง)
   */
  const commentOrigin = commentOriginLog?.comment
    ? {
        message: commentOriginLog.comment.message,
        attachmentUrl: commentOriginLog.comment.attachmentUrl,
        createdTime: commentOriginLog.comment.createdTime.toISOString(),
        postMessage: commentOriginLog.comment.post.message,
        // สำเนาที่เราเก็บเองชนะ URL ของ Meta เสมอ — SSOT ตัวเดียวกับที่รายการคอมเมนต์ใช้
        postThumbnailUrl: resolvePostThumbnail(commentOriginLog.comment.post),
        postMediaType: commentOriginLog.comment.post.mediaType,
        url: (() => {
          const permalink = commentOriginLog.comment.post?.permalink
          if (!permalink) return null
          const id = commentOriginLog.comment.externalCommentId.split('_').pop()
          if (!id) return permalink
          return `${permalink}${permalink.includes('?') ? '&' : '?'}comment_id=${id}`
        })(),
      }
    : null
  // เช็ค "ไม่ใช่ ACTIVE" ไม่ใช่เช็คแค่ TOKEN_INVALID — ครอบ DISCONNECTED (ร้านถอดเพจเอง) ด้วย
  // ต้องตรงกับ guard ฝั่ง service (sendOutboundMessage โยน CHANNEL_NOT_ACTIVE เมื่อ status !== 'ACTIVE')
  // ไม่งั้นเธรดของเพจที่ถอดไปแล้วจะเปิดช่องพิมพ์ให้ แล้วไปเด้ง error ตอนกดส่ง
  const tokenInvalid =
    conversation.channel !== 'DEEP' && (conversation.shopChannel?.status ?? 'ACTIVE') !== 'ACTIVE'

  // LINE เท่านั้นที่มีแนวคิด unfollow/block OA (BR-LINE-15) — Messenger/IG ไม่มีคอลัมน์นี้เขียนจริง
  // (isBlocked default false เสมอ) ค่านี้เป็น "ภาพนิ่ง ณ ครั้งที่ส่งล้มล่าสุด" ไม่ใช่สถานะปัจจุบัน
  // จริง (ลูกค้าปลดบล็อกได้โดยเราไม่รู้จนกว่าจะลองส่งอีกที) — ข้อความในแถบสถานะต้องบอกกรอบเวลา
  // "ครั้งล่าสุด" ไว้ด้วยเหตุนี้ (ดู ThreadStatusBar item 'contactBlocked' ใน ChatThread.tsx)
  const contactBlocked = conversation.channel === 'LINE' && conversation.externalContact?.isBlocked === true

  // (S-14b) โควตาข้อความของ LINE OA ที่เธรดนี้ผูกอยู่ — ค่า cache อายุ ≤5 นาที (อ่านจาก LINE ใหม่
  // เมื่อหมดอายุ) service เป็นคน decrypt token เองภายในตัวมัน ที่นี่ได้แต่ตัวเลขกลับมา
  // อ่านไม่สำเร็จ = ได้ snapshot ที่ `stale: true` ไม่ใช่ throw — หน้าเธรดต้องเปิดได้เสมอแม้ LINE ล่ม
  // ส่งลง prop `lineQuota` ของ ChatThread — null สำหรับทุกช่องทางที่ไม่ใช่ LINE (ไม่มีแนวคิดนี้)
  const lineQuota =
    isLineThread && conversation.shopChannel?.id
      ? await getLineQuotaByChannelId(conversation.shopChannel.id)
      : null
  mark('lineQuota')

  // ชื่อเพจที่เธรดนี้ผูกอยู่ (null = เธรด Deep / ไม่มี ShopChannel) — badge ใช้แทนชื่อช่องทาง
  const channelName = conversation.shopChannel?.name ?? null
  // รูปเพจสำหรับ badge ช่องทางที่หัวเธรด (user สั่ง 2026-07-23) — select avatarUrl มาแล้วข้างบน
  const channelAvatarUrl = conversation.shopChannel?.avatarUrl ?? null

  // T5 — ประเภทกิจการ (fallback ONLINE_SALES เมื่อค่าไม่รู้จัก ห้าม crash/ซ่อน CTA — ภาคผนวก A-1)
  const vertical = isShopVertical(shop.vertical) ? shop.vertical : DEFAULT_SHOP_VERTICAL

  // T5 — หา Customer ที่ผูกไว้: ช่องทางนอกผูกผ่าน ExternalContact.customerId, DEEP ผูกผ่าน
  // Customer.userId (Phase 2 link — ดู schema.prisma Customer model comment)
  /**
   * 🛑 เริ่มยิงทันทีตรงนี้ แต่ await ท้ายสุด — ไม่ขึ้นกับ linkedCustomer/orders เลยสักนิด
   *
   * วัดบน prod 2026-08-16: SQL ของกลุ่มแผงขวา **execute 0.07–0.10ms ต่อ query** (index ครบทุกตัว)
   * แต่เฟสนี้กิน ~150ms ⇒ เวลาไม่ได้อยู่ที่ฐานข้อมูล **มันอยู่ที่จำนวน await ที่เรียงต่อกัน**
   * (Prisma overhead + acquire connection ต่อรอบ) ⇒ ตัวที่ต้องลดคือ "จำนวนรอบ" ไม่ใช่ "ความเร็ว SQL"
   */
  const savedFileIdsPromise = listSavedFileIds(
    threadShopId,
    resolveLibraryOwner({ id: conversation.id, externalContactId: conversation.externalContactId }),
  )

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
          // feature 00024 — แกน "นัดถึงขั้นไหน" ของร้าน SERVICE_QUEUE (2026-08-08)
          // ต้อง sync กับ getOrdersByCustomer ที่ lazy-load ต่อจากชุดนี้ ไม่งั้นออเดอร์ใบที่ 21
          // ขึ้นไปจะขาดข้อมูลนัดแล้วตกไปแสดงเป็น walk-in เงียบ ๆ
          serviceStart: true,
          serviceEnd: true,
          appointmentStatus: true,
          depositAmount: true,
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
    serviceStart: o.serviceStart ? o.serviceStart.toISOString() : null,
    serviceEnd: o.serviceEnd ? o.serviceEnd.toISOString() : null,
    appointmentStatus: o.appointmentStatus,
    depositAmount: o.depositAmount ? o.depositAmount.toFixed(2) : null,
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
  /** ตัวเลขดิบของป้ายพฤติกรรม — ป้ายจริงประกอบที่ client ด้วย `customerBadges` (SSOT เดียวกับ /orders) */
  let customerBehavior: CustomerBehavior | null = null
  if (linkedCustomer) {
    // 🛑 behaviorRows อยู่ในก้อนนี้ด้วย (เดิม await แยกทีหลัง) — ทั้งสามตัวขึ้นกับ linkedCustomer
    // เท่านั้น ไม่ขึ้นกับกันเอง การเรียงต่อกันจึงเป็นการจ่ายค่า round-trip ฟรี ๆ หนึ่งรอบ
    const [orderCount, spentAgg, behaviorRows] = await Promise.all([
      prisma.order.count({ where: { shopId: shop.id, customerId: linkedCustomer.id, ...orderTypeFilter } }),
      prisma.order.aggregate({
        where: { shopId: shop.id, customerId: linkedCustomer.id, ...orderTypeFilter, status: { not: 'CANCELLED' } },
        _sum: { totalAmount: true },
      }),
      prisma.order.findMany({
        where: { shopId: shop.id, customerId: linkedCustomer.id, ...orderTypeFilter },
        select: {
          status: true,
          cancelInitiator: true,
          cancelReason: true,
          shipments: {
            where: { status: { not: 'CANCELLED' } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { carrierStatus: true },
          },
        },
      }),
    ])
    customerStats = {
      orderCount,
      totalSpent: spentAgg._sum.totalAmount ? spentAgg._sum.totalAmount.toFixed(2) : '0.00',
      since: linkedCustomer.createdAt.toISOString(),
    }

    /**
     * ป้ายเตือนพฤติกรรมลูกค้า (user สั่ง 2026-08-11) — นับจาก "หลักฐานรายใบ" ผ่าน SSOT
     * `summarizeCustomerBehavior` ไม่ใช่ groupBy ที่นี่ เพราะกฎ "ใบเดียวนับครั้งเดียว"
     * (ตีกลับ + ผู้ซื้อยกเลิกในใบเดียวกัน) ตัดสินระดับแถวไม่ได้ด้วย aggregate
     *
     * select แค่ 3 ฟิลด์เล็ก ๆ ต่อใบ — ไม่ cap จำนวนโดยตั้งใจ: cap แล้วตัวเลขจะน้อยกว่าจริงเงียบ ๆ
     * ซึ่งเป็นคลาสเดียวกับ `docs/conventions/partial-data-must-be-labeled-or-filled.md`
     * (ป้ายที่บอก "ตีกลับ 2 ครั้ง" ทั้งที่จริง 5 แย่กว่าไม่มีป้าย)
     *
     * `shipments.where` ชุดเดียวกับที่ panelOrders ใช้ด้านบน — นิยาม "พัสดุของใบนี้" ต้องมีชุดเดียว
     */
    customerBehavior = summarizeCustomerBehavior(
      behaviorRows.map((o) => ({
        status: o.status,
        cancelInitiator: o.cancelInitiator ?? null,
        cancelReason: o.cancelReason ?? null,
        activeShipmentCarrierStatus: o.shipments[0]?.carrierStatus ?? null,
      })),
    )
  }

  /**
   * feature 00048 — fileId ที่อยู่ในคลังของลูกค้ารายนี้แล้ว (query เดียว ไม่มี N+1)
   *
   * ทำที่ server เพราะ ChatThread ต้องรู้ตั้งแต่ paint แรกว่าไฟล์ไหนเก็บไปแล้ว — ถ้าให้ client
   * ไปถามเอง ปุ่มจะขึ้น "เก็บเข้าคลัง" ก่อนแล้วค่อยกระพริบเป็น "เอาออกจากคลัง" ซึ่งอ่านเป็นบั๊ก
   */
  mark('customerPanel(orders/stats/behavior)')
  const savedFileIds = await savedFileIdsPromise

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
    customerBehavior,
    // feature 00018 E5 (user request 2026-07-26) — ป้ายกำกับอัตโนมัติแบบ Business Suite
    // (`ad_id.…` / `messenger_ads`) ให้ร้านแมพได้ว่าลูกค้าคนนี้มาจากโฆษณาไหน
    adReferralId: conversation.referralSource === 'ADS' ? conversation.referralAdId : null,
    orders: panelOrders,
  }

  mark('savedFileIds')

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
    {/* วัดเวลาของ RSC — ไม่ render เลยถ้าไม่ได้ส่ง ?debug=timing มา (ดู components/RscTiming.tsx) */}
    {debug === 'timing' && <RscTiming marks={timingMarks} />}
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
        // ต้องเช็ค canUseHumanAgent() ด้วย ไม่งั้นจะเปิดช่องพิมพ์ให้ทั้งที่ยังไม่ได้สิทธิ์ — สิทธิ์นี้
        // ตัดสิน "รายเธรด" ตาม PSID/IGSID ของคู่สนทนา ไม่ใช่สวิตช์เดียวทั้งระบบ: เปิดได้ 2 ทาง คือ
        // (ก) สวิตช์ใหญ่ระดับระบบเปิด (Meta อนุมัติสิทธิ์ human_agent แล้วจริง — ใช้ได้ทุกเธรด) หรือ
        // (ข) PSID ของเธรดนี้อยู่ใน allow-list ทดสอบ (ก่อนผ่าน App Review, จำกัดวงทดสอบ) — เธรด
        // channel==='DEEP' ไม่มี externalContact เลยจึง fallback เป็น null (ไม่มีทางอยู่ใน allow-list)
        // ไม่เช็คแบบนี้ = ช่องพิมพ์เปิดทั้งที่ยังส่งจริงไม่ผ่าน แล้วไปเด้ง error ตอนกดส่ง ซึ่งแย่กว่า
        // บอกตั้งแต่แรกว่าส่งไม่ได้
        humanAgentOpen={canUseHumanAgent(conversation.externalContact?.externalUserId ?? null) && windowState.humanAgentOpen}
        humanAgentExpiresAt={windowState.humanAgentExpiresAt?.toISOString() ?? null}
        tokenInvalid={tokenInvalid}
        contactBlocked={contactBlocked}
        lineQuota={
          lineQuota
            ? {
                type: lineQuota.type,
                level: lineQuota.level,
                remaining: lineQuota.remaining,
                total: lineQuota.total,
                stale: lineQuota.stale,
              }
            : null
        }
        neverInbound={neverInbound}
        isCommentReplyThread={isCommentReplyThread}
        hidePayments={await shouldHidePayments()}
        commentOrigin={commentOrigin}
        customerPanelData={customerPanelData}
        savedFileIds={savedFileIds}
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
