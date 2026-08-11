'use client'

/**
 * ChatThread — client thread component ของ /inbox/[conversationId] (feat 00011 Deep Chat, S-12)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ChatPage.tsx:33-110
 * (card > card-header > scroll body > composer) — ตัด sidebar offcanvas/ChatToolbar/online-status
 * (UX-Design-Spec.md §S-12) + แก้ scroll body จาก SimpleBar → plain `<div overflow-y-auto>` + ref
 * (ต้อง programmatic scroll สำหรับ preserve-scroll ตอน load-older + scroll-to-bottom ตอนส่ง)
 * bubble สี: ซ้าย=BUYER `bg-light`, ขวา=SHOP `bg-primary/15` (Base ใช้ bg-warning/15/bg-info/15 —
 * แก้ตาม spec ให้ตรง semantic ผู้ส่งจริง; class อื่นทั้งหมดของ bubble copy ตรงจาก Base
 * ChatPage.tsx:64-90 — `my-5 flex items-start gap-2.5`, avatar ทั้งสองฝั่ง, `rounded px-6 py-3`,
 * เวลา `mt-1.5 ... text-xs` — REWORK 2026-07-03: เดิม simplify เป็น items-end/my-3/px-4 py-2.5/
 * ตัด avatar ฝั่ง SHOP/ใช้ max-w แบบ percent bracket ซึ่งเป็น arbitrary value (ผิด HR7) ไม่ faithful ตาม demo จริง)
 *
 * Avatar ฝั่ง SHOP (ข้อความตัวเอง): Base ใช้ initials-fallback div `bg-primary ... size-8` จาก
 * currentUser.name — เราไม่มีชื่อ/รูป shop ส่งเข้ามาใน component นี้ (Props มีแค่ buyer) จึงใช้ icon
 * ร้านค้า (`tabler:building-store`) แทน initials บน div ทรงเดียวกัน (verbatim size-8/bg-primary/
 * rounded-full — สลับแค่เนื้อหาใน div จาก initials เป็น icon)
 *
 * Avatar ฝั่ง BUYER: reuse pattern BidderAvatar จาก AuctionBidFeed.tsx (ดู InboxList.tsx comment เดียวกัน)
 * Upload: pattern ProductImagesCardV2.tsx:54-90 (auto-upload ทันทีที่เลือกไฟล์ → preview chip)
 * Realtime: pattern AuctionDetailClient.tsx:144-179 (Supabase broadcast, signal-only ไม่เชื่อ payload)
 * Date divider group: pattern NotificationFeed.tsx (formatDate เทียบ today/yesterday, ห้าม Intl ตรง)
 *
 * arbitrary value (การ์ดสูงเต็ม viewport ลบความสูง header): copy ตรงจาก Base ChatPage.tsx L22 — เป็น convention ของ
 * Paces "full-viewport app" (chat/kanban/email/file-manager ใน theme ใช้ pattern เดียวกันหมด)
 * ไม่ใช่ค่าที่เดาเอง — Paces ไม่มี token สำหรับ viewport-locked height
 *
 * (ChatWidget task) fetch/realtime/send/upload/mark-read logic ทั้งหมด extract ไปที่
 * (dashboard)/_shared/useSellerChatThread.ts เพื่อให้ ChatWidgetThreadPanel.tsx (bubble panel,
 * ยังอยู่ (dashboard) เดิม) เรียกใช้ชุดเดียวกัน — ไฟล์นี้เหลือแค่ render (UX ไม่เปลี่ยนแม้แต่บรรทัดเดียว)
 *
 * feature 00018 T4 (เพิ่มบนโครงเดิมทั้งหมด — ไม่แตะ layout/fetch logic เดิม):
 *  - ตราช่องทาง/เพจ ที่มุมรูปลูกค้าบนหัวเธรด (ChannelBadgeOverlay จาก ChannelBadge.tsx)
 *  - แบนเนอร์ 24h window (เฉพาะ channel != DEEP) 3 ระดับสี + banner แทนที่เมื่อ ShopChannel
 *    TOKEN_INVALID — windowOpen/msRemaining/tokenInvalid คำนวณที่ server (page.tsx, getWindowState
 *    จาก channel-chat.service.ts) ส่งลงมาเป็น prop เพื่อเลี่ยง import service (มี prisma/fs) เข้า
 *    client bundle (feedback_verify_import_safety)
 *  - composer disabled ทั้งชุดเมื่อ window ปิดหรือ token invalid; ปุ่มแนบรูป disabled ถาวรเมื่อ
 *    channel != DEEP (back end คืน 400 ถ้าส่งรูปช่องทางนอก — กันที่ UI ก่อนถึง error นั้น)
 *  - badge "ส่งไม่สำเร็จ" ใต้ bubble เมื่อ deliveryStatus='FAILED' — ChatMessageView (hook) ไม่ประกาศ
 *    field นี้ในชนิดข้อมูล แต่ getMessages() (chat.service.ts) query แบบไม่มี select เลย คืนทุกคอลัมน์
 *    ของ ChatMessage จริงตอน runtime (ยืนยันแล้วจาก services/chat.service.ts:135-146) จึง extend
 *    ชนิดข้อมูลในนี้เอง (ChatMessageWithDelivery) แทนแก้ไฟล์ hook ที่นอกขอบเขต T4
 *  - max-w บน bubble column (บั๊ก prod ภาคผนวก A-3: ข้อความยาวดันเต็มบรรทัด)
 *  - ปุ่ม "ข้อมูลลูกค้า" + CustomerPanelSheet (<1024px) — desktop ใช้ CustomerPanel.tsx แบบ
 *    persistent column แทน (page.tsx เป็นคนตัดสินด้วย CSS breakpoint ไม่ใช่ component นี้)
 *
 * rewrite (chat-standalone, .superpowers/sdd/chat-standalone.md): ย้ายมาจาก
 * (dashboard)/inbox/[conversationId]/components/ChatThread.tsx → (chat)/... เดิม — _shared/*
 * imports เปลี่ยนเป็น alias (ย้ายข้าม route group แล้ว _shared ยังอยู่ที่ (dashboard)/_shared/
 * เดิม ใช้ร่วมกับ ChatWidget); root card เปลี่ยนจากสูตร dvh-minus-topbar เดิมเป็น h-full
 * เพราะ parent ((chat)/inbox/[conversationId]/page.tsx) คุมความสูงที่เหลือให้แล้ว (parent
 * ของมันคือ (chat)/layout.tsx flex h-dvh) ไม่ต้องคำนวณ viewport เองอีกต่อไป (HR7 carve-out
 * เดิมของบรรทัดนี้จึงหมดไปด้วย — h-full เป็น Tailwind scale ปกติ)
 *
 * ดูรูปเต็มจอ (user request 2026-07-23 "คลิกที่รูป เพื่อดูรูปแบบ Full-screen"): คลิกรูปในบับเบิล
 * → เปิด Lightbox เต็มจอ เลื่อนดูรูปอื่นในเธรดเดียวกันได้ (ซ้าย/ขวา, ปัดบนมือถือ)
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/gallery/components/Gallery.tsx:100 —
 * `<Lightbox slides open index close controller={{closeOnBackdropClick:true}} />` verbatim
 * (slides เปลี่ยนจาก photo album ของ demo เป็นรูปในเธรด); เพิ่ม plugin Zoom ของไลบรารีเดียวกัน
 * เพราะรูปในแชทส่วนใหญ่เป็นสลิปโอนเงิน/ใบเสร็จที่ต้องซูมอ่านตัวเลข (plugin นี้ไม่มี css แยก
 * — styles.css ที่ src/assets/css/app.css:36 import อยู่แล้วครอบให้ทั้งหมด)
 *
 * เพิ่มปุ่ม "กลับรายการ" (มือถือ/แท็บเล็ต <1024px) ที่ card-header — เดิมพึ่ง SellerMobileHeader
 * ของ (dashboard) layout (back button + bottom nav) เป็นทางออกจากหน้าเธรด แต่ (chat) route group
 * ไม่มีทั้งสองอย่างแล้ว (ดู (chat)/layout.tsx) ต้องมีปุ่มกลับรายการของตัวเอง (แยกจากปุ่ม
 * "กลับหน้าหลัก" ที่ ChatHeader.tsx — คนละปลายทาง: ปุ่มนี้ไป /inbox ไม่ใช่ /dashboard)
 */
import Icon from '@/components/wrappers/Icon'
import AutoReplyTag from './AutoReplyTag'
import NotificationSoundMenu from './NotificationSoundMenu'
import BotPausedBanner, { getBotPausedSummary } from './BotPausedBanner'
import ThreadStatusBar, { type ThreadStatusItem } from './ThreadStatusBar'
import OrderProgressBar from './OrderProgressBar'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { parseMetaOrderCard } from '@/lib/meta-order-card'
import Link from 'next/link'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import LightboxDownload from 'yet-another-react-lightbox/plugins/download'
import { generateInitials } from '@/utils/helpers'
// user 2026-07-31: แถวเวลาแสดงแค่ ชม.:นาที — วินาทีไม่ใช่ข้อมูลที่ใช้ตัดสินใจอะไรในแชท
// แต่ยังเก็บเวลาเต็มไว้ใน title ให้ชี้ดูได้ (formatTimeHM มีอยู่แล้ว ไม่ต้องเขียน formatter ใหม่)
import { formatTime, formatTimeHM, formatDateTime } from '@/lib/format-date'
import { burstIdentity, computeBurstEndIds } from '@/lib/chat-message-burst'
import { useComposerHeight } from '@/hooks/useComposerHeight'
import { parseMetaSystemNotice, parseMetaAiHandoffNotice, readMetaAiControlMarker } from '@/lib/meta-system-notice'
import { withEmojiPresentation } from '@/lib/emoji-presentation'
import { describeSendFailure, stripSendFailurePrefix } from '@/lib/chat-send-failure'
// นิยาม "โพสต์นี้เป็นวิดีโอไหม" ตัวเดียวกับที่รายการคอมเมนต์ใช้ — ห้ามก็อปมาเขียนซ้ำ (HR16)
import { isVideoPost } from '@/lib/facebook-post'
import { canRetryFailedMessage } from '@/lib/chat-retry-eligibility'
// (S-14b, feature 00025) มาตรวัดโควตา LINE — ตรรกะทั้งหมด (รวม boolean ที่ปิดช่องพิมพ์) อยู่ใน
// ฟังก์ชันบริสุทธิ์ที่มีเทสจับ ไม่ใช่เทอร์นารีกลาง JSX (ui-boolean-needs-a-testable-home.md)
import { deriveLineQuotaCaption } from '@/lib/line/quota-caption'
import type { LineQuotaLevel } from '@/lib/line/quota'
import { formatBaht } from '@/lib/format-money'
import Swal from 'sweetalert2'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  useSellerChatThread,
  groupByDate,
  pendingKind,
  type ChatProductCard,
  type ChatOrderCard,
  type ChatMessageView,
} from '@/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread'
import { attachmentDisplayName, formatAttachmentSize } from '@/lib/chat-attachment'
import { shouldWarnQuoteUnavailable } from '@/lib/chat-quote-availability'
import { useLongPress } from '@/hooks/useLongPress'
import MessageActionBubble, { type MessageAction, type MessageReactionOption } from './MessageActionBubble'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import SellerErrorState from '@/app/(paces)/seller/(dashboard)/_shared/SellerErrorState'
import { SellerThreadSkeleton } from '@/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton'
import { ChannelBadgeOverlay } from '../../components/ChannelBadge'
import OrderCardView from '../../../_components/OrderCardView'
import { useDraftOrders, useOrderVocab } from '../../../_components/DraftOrderProvider'
import CustomerPanelSheet from './CustomerPanelSheet'
import EmojiPicker, { rememberRecentSticker } from './EmojiPicker'

/**
 * ที่มาของรูปในบับเบิล — ปกติ `imageUrl` คือ fileId ใน storage ของเรา (`/api/files/{id}`) แต่บับเบิล
 * optimistic ของสติกเกอร์ถือ URL ของ CDN Meta มาตรง ๆ (server ยัง mirror ไม่เสร็จ) — user สั่ง
 * 2026-08-04 ให้เห็นรูปสติกเกอร์ทันทีพร้อม spinner เหมือนส่งข้อความ ไม่ใช่รอเงียบ ๆ แล้วคิดว่าหาย
 */
function mediaSrc(key: string): string {
  return key.startsWith('http') ? key : `/api/files/${key}`
}
import AiSuggestPanel from './AiSuggestPanel'
import AppointmentDateSheet from '@/app/(paces)/seller/(dashboard)/orders/new/components/AppointmentDateSheet'
import QuickMessageBar from './QuickMessageBar'
import ProductPickerPanel, { type ProductPickPayload } from './ProductPickerPanel'
import ProductMultiSelectSheet from './ProductMultiSelectSheet'
import type { QuickMessage } from './QuickMessageManager'
import PhotoAlbum from './PhotoAlbum'

/**
 * แถวรีแอ็กชันลัด 6 ตัว — ชุดเดียวกับแถวที่ Messenger โชว์ตอนกดค้าง (user ส่งภาพจริงมาเทียบ
 * 2026-08-03: หัวใจ/ฮา/ว้าว/เศร้า/โกรธ/ถูกใจ แล้วปิดท้ายด้วยปุ่ม + เปิดแผงอิโมจิทั้งชุด)
 *
 * เอกสาร message_reactions ระบุค่า `reaction` ที่ Meta รู้จัก: "smile, angry, sad, wow, love,
 * like, dislike" (+ `other` เมื่ออิโมจิไม่ตรง 7 ตัวนี้) ส่วน Send API ฝั่งส่งรับ "any emoji" —
 * แถวลัดจึงเป็น 6 ตัวที่คนกดบ่อยจริง ส่วนที่เหลือ (รวม dislike) อยู่ในแผงเต็มหลังปุ่ม +
 *
 * `raw` = สิ่งที่ยิงให้ Meta และเก็บลงฐาน — ตรงกับรูปแบบที่ Meta ส่งมาให้เราตอนลูกค้ากด
 * (ตรวจของจริงบน prod: หัวใจมาเป็น U+2764 เปล่า ไม่มี variation selector)
 * `emoji` = ตัวที่เอาไปแสดงผล ต่อ VS-16 แล้วให้เป็นอิโมจิสี ไม่ใช่สัญลักษณ์ขาวดำ
 *
 * ประกอบด้วย String.fromCodePoint ไม่ใช่อักขระตรง ๆ — HR12 ห้าม emoji ในซอร์ส UI และค่าพวกนี้
 * คือ "ข้อมูลรีแอ็กชัน" ที่ต้องตรงกับของ Meta ไม่ใช่ไอคอนตกแต่งที่แทนด้วย tabler icon ได้
 */
const REACTION_CHOICES: { raw: string; emoji: string; label: string }[] = [
  { cp: 0x2764, label: 'หัวใจ' },
  { cp: 0x1f606, label: 'ฮา' },
  { cp: 0x1f62e, label: 'ว้าว' },
  { cp: 0x1f622, label: 'เศร้า' },
  { cp: 0x1f620, label: 'โกรธ' },
  { cp: 0x1f44d, label: 'ถูกใจ' },
].map(({ cp, label }) => {
  const raw = String.fromCodePoint(cp)
  return { raw, emoji: withEmojiPresentation(raw), label }
})
/**
 * CopyMessageButton — ปุ่มคัดลอกข้อความข้างบับเบิล (feature 00018)
 * user request 2026-07-24: ไม่ต้องขึ้น toast — เปลี่ยน icon copy เป็นเช็คถูก (พร้อม animation) ตรงปุ่มเลย
 * แล้วคืนสภาพเป็น copy หลัง ~1.5 วิ. state คัดลอกอยู่ในตัวปุ่มเอง (แต่ละข้อความมีปุ่มของตัวเอง)
 */
function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // เงียบ — ไม่มี toast ตามคำสั่ง user (ปุ่มยังคง icon copy เดิม)
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}
      title={copied ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}
      className={`mt-1.5 hidden size-7 shrink-0 items-center justify-center rounded-full transition-colors lg:group-hover:flex ${
        copied ? 'text-success' : 'text-default-700 hover:bg-default-100 hover:text-default-700'
      }`}
    >
      {/* icon สลับ copy → check พร้อม pop (scale) — key เปลี่ยนเพื่อ retrigger transition ทุกครั้งที่คัดลอก */}
      <Icon
        key={copied ? 'check' : 'copy'}
        icon={copied ? 'check' : 'copy'}
        className={`size-4 transition-transform duration-200 ${copied ? 'scale-125' : 'scale-100'}`}
      />
    </button>
  )
}

/**
 * การ์ด "คำขอชำระเงิน" ของ Meta (user สั่ง 2026-07-31 ให้แสดงแบบ Business Suite)
 *
 * Meta ส่งมาเป็นข้อความล้วน "฿400.00 order" เท่านั้น — ไม่มี payload ของการ์ด ไม่มีสถานะ
 * การชำระเงิน และไม่มี API ให้กด "Mark as paid"/"View order" (ดูเหตุผลเต็มใน lib/meta-order-card.ts)
 * จึงยกเฉพาะยอดเงินขึ้นมาให้เด่น ไม่ใส่สถานะที่ยืนยันไม่ได้ และไม่ทำปุ่มที่กดแล้วไม่เกิดอะไร
 */
function MetaOrderCardBubble({ amount, status }: { amount: string; status: string | null }) {
  return (
    <div className="bg-light w-52 rounded-lg p-3">
      <div className="flex items-center gap-3">
        <span className="bg-card text-default-900 flex size-10 shrink-0 items-center justify-center rounded-full">
          <Icon icon="currency-baht" width={20} height={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-default-900 block text-base font-bold">{amount}</span>
          {/* ไอคอน Facebook เล็ก ๆ = สัญญาณว่าการ์ดนี้เป็นของ Meta ไม่ใช่ออเดอร์ในระบบ Deep
              (Deep มีการ์ดออเดอร์ของตัวเองในเธรดเดียวกัน ถ้าแยกไม่ออกผู้ขายจะไปหาเลขที่
              คำสั่งซื้อในระบบเราแล้วไม่เจอ) */}
          <span className="text-default-700 flex items-center gap-1 text-xs">
            <Icon icon="brand-facebook" width={11} height={11} className="shrink-0" aria-hidden="true" />
            <span className="truncate">คำขอชำระเงินผ่าน Messenger</span>
          </span>
        </span>
      </div>
      {/* สถานะดิบของ Meta — ทุกค่าใช้โทน warning เหมือนกันหมด **ห้ามจำแนกสีตามความหมายของคำ**
          เรายังไม่มีหลักฐานว่า Meta ใช้คำอะไรได้บ้าง ถ้าเดาว่าคำไหนแปลว่า "จ่ายแล้ว" แล้วให้
          เขียวไป จะกลายเป็นการยืนยันสิ่งที่เราไม่รู้ (Verified-Means-Green) — เขียวสงวนไว้
          กับสิ่งที่ยืนยันแล้วเท่านั้น */}
      {status && (
        <div className="border-default-200 mt-2.5 border-t border-dashed pt-2.5">
          <span className="badge bg-warning/15 text-warning-ink">{status}</span>
        </div>
      )}
    </div>
  )
}

/**
 * MetaGenericCardCarousel — การ์ดสินค้าแบบ carousel จาก Facebook (generic template elements[],
 * ChatMessage.cards, 2026-08-09)
 *
 * เดิม elements[] ถูกยุบเหลือข้อความสรุปบรรทัดเดียวลง body เท่านั้น (ดู CARD_PREFIX/
 * composeStructuredText ใน channel-chat.service.ts) — ตอนนี้เก็บ title/subtitle/imageFileId ของ
 * ทุกใบไว้แล้ว (mirror รูปแล้วนอก transaction ตอน ingest) จึงแสดงเป็นแถวเลื่อนได้จริง
 *
 * plain Tailwind scroll แทน hs-carousel ของ Preline ตั้งใจ — Preline JS-init พังกับเธรดที่
 * re-render ถี่ (คลาสเดียวกับ hs-dropdown) และ hs-carousel ออกแบบมาสำหรับ hero banner ทีละสไลด์
 * ไม่ใช่แถวการ์ดแบบนี้
 *
 * ห้าม render buttons[] — เป็น postback ที่ออกแบบให้ "ลูกค้า" กด เรากดแทนไม่ได้ (มติเดิม ดู
 * meta-template-card.test.ts) และห้าม bg-primary/text-primary ในการ์ดนี้ (One Voice) — ต่างจาก
 * ProductCardBubble ของเราเองที่มี "ดูสินค้า" สีน้ำเงินเพราะกดได้จริง ความต่างนี้คือสิ่งที่บอก
 * ผู้ขายว่าการ์ดไหนกดได้/ไม่ได้
 */
function MetaGenericCardCarousel({
  cards,
  messageId,
  onOpenImage,
}: {
  cards: { title: string | null; subtitle: string | null; imageFileId: string | null }[]
  messageId: string
  onOpenImage: (elementIndex: number) => void
}) {
  return (
    <div>
      {/* ป้ายที่มา — ยกตำแหน่ง/ขนาดจาก reply-quote caption ที่มีอยู่แล้วในไฟล์นี้ (mb-1 flex justify-end + text-2xs) */}
      <div className="mb-1 flex justify-end">
        <span className="text-default-700 flex items-center gap-1 text-2xs">
          <Icon icon="brand-facebook" className="text-xs" />
          {`การ์ดจาก Facebook${cards.length > 1 ? ` · ${cards.length} รายการ` : ''}`}
        </span>
      </div>
      {/* items-stretch ประกาศชัด (แม้จะเป็นค่า default ของ flex) — ทุกใบต้องสูงเท่ากันแม้ชื่อ
          จะ 1 หรือ 2 บรรทัด ถ้ามีใครมาเปลี่ยน align ทีหลังการ์ดจะเตี้ยไม่เท่ากันทันที */}
      <div className="flex snap-x snap-mandatory items-stretch gap-2 overflow-x-auto pb-1">
        {cards.map((c, i) => (
          <div key={`${messageId}-${i}`} className="bg-light w-44 shrink-0 snap-start overflow-hidden rounded-lg">
            {/**
             * 🛑 กล่องรูปต้อง "เท่ากันทุกใบเสมอ" (user report 2026-08-09) — `relative` + ลูกเป็น
             * `absolute inset-0` ไม่ใช่ `size-full` เฉย ๆ
             *
             * `aspect-video` กำหนดความสูงจากความกว้างก็จริง แต่ลูกที่อยู่ใน flow ปกติยัง "ดัน"
             * กล่องให้สูงเกินได้ (min-content) — เช่นจังหวะที่ `<img>` ยังไม่รู้ขนาดจริง หรือรูป
             * โหลดไม่ขึ้นแล้วเบราว์เซอร์แทนด้วย alt text หลายบรรทัด ผลคือการ์ดในแถวเดียวกันกล่องรูป
             * สูงไม่เท่ากันเป็นบางจังหวะ ซึ่งจับได้ยากเพราะขึ้นกับความเร็วเน็ตของแต่ละคน
             * ลูกที่ absolute ถูกถอดออกจาก flow จึงไม่มีทางมีผลกับความสูงของกล่องได้เลย
             */}
            <div className="bg-default-100 relative aspect-video w-full overflow-hidden">
              {c.imageFileId ? (
                // ปุ่มเปิด Lightbox (pattern เดียวกับ ChatImageMessage) — object-contain ไม่ใช่
                // object-cover เพราะรูปมีตัวหนังสือ (สเปก/ราคา) ฝังอยู่ในรูป cover จะครอปทิ้ง
                <button
                  type="button"
                  onClick={() => onOpenImage(i)}
                  aria-label="ดูรูปเต็มจอ"
                  className="absolute inset-0 block cursor-zoom-in"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaSrc(c.imageFileId)}
                    // alt สั้น ๆ ไม่ใช่ชื่อสินค้าเต็ม: ตอนรูปโหลดไม่ขึ้น เบราว์เซอร์จะวาด alt text
                    // ลงในกล่อง ชื่อยาว ๆ จะตัดคำหลายบรรทัดจนล้นกรอบ (กล่องล็อกความสูงแล้วก็จริง
                    // แต่ตัวอักษรจะทะลุออกมาดูรก) — ชื่อสินค้าอยู่ใต้รูปให้อ่านอยู่แล้ว
                    alt="รูปสินค้า"
                    className="size-full object-contain"
                  />
                </button>
              ) : (
                // ไม่มีรูป (mirror ล้มเหลว/ไม่มี image_url มา) — placeholder เฉย ๆ ห้ามมี
                // onClick/cursor-zoom-in (ไม่สร้าง affordance ปลอมว่ากดแล้วมีอะไรให้ดู)
                <div className="text-default-700 absolute inset-0 flex items-center justify-center">
                  <Icon icon="photo-off" className="text-xl" />
                </div>
              )}
            </div>
            <div className="p-2.5">
              <p className="text-default-800 mb-0.5 line-clamp-2 text-xs font-semibold">{c.title}</p>
              {/* subtitle ว่าง = ไม่ render บรรทัดนี้เลย ไม่ใช่เว้นที่ว่าง */}
              {c.subtitle && <p className="text-default-600 mb-0 line-clamp-2 text-2xs">{c.subtitle}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * สติกเกอร์/อีโมจิเข้ามาเป็นข้อความชนิด IMAGE เหมือนรูปทั่วไป (ingest จัด attachment type
 * 'sticker' เป็น 'IMAGE') และเราไม่ได้เก็บตัวแยกไว้ใน DB เลย — ปุ่มบันทึกจึงไปโผล่บนสติกเกอร์
 * ด้วย ซึ่งไม่มีใครอยากบันทึก (user report 2026-07-31)
 *
 * แยกด้วยขนาดจริงของรูป: วัดจากเธรดจริงบน prod สติกเกอร์ = 100x100 ส่วนรูปที่ลูกค้าส่ง =
 * 918–1254 px ช่องว่างกว้างพอให้ตัดที่ 240 ได้อย่างปลอดภัย
 *
 * เลือกวิธีนี้แทนการเพิ่มคอลัมน์ isSticker เพราะ (1) ใช้ได้กับข้อความเก่าที่มีอยู่แล้วทันที
 * — คอลัมน์ใหม่ backfill ไม่ได้ เพราะไม่ได้เก็บ sticker_id ไว้ (2) ไม่ต้องแตะ schema ของ DB
 * ที่ dev/prod ใช้ร่วมกัน. ถ้าวันหนึ่งอยากได้แม่นจริง ต้องเก็บ sticker_id ตั้งแต่ ingest
 *
 * สำคัญ 2026-08-10: เกณฑ์นี้ไม่ใช่ทางหลักอีกแล้ว — สติกเกอร์ LINE (S-7b) ขนาดจริง 320–370px จึง
 * **หลุดเกณฑ์ 240 ทุกใบ** (ได้ทั้งขนาดใหญ่เท่ารูปและปุ่มบันทึกรูปที่ไม่ควรมี) ตอนนี้ทางหลักคือธง
 * `isSticker` ที่ API derive จาก `rawMessage.payload.kind` (ดู messages/route.ts) และเกณฑ์ขนาด
 * เหลือไว้เป็นตัวสำรองสำหรับ **สติกเกอร์ Meta ของข้อความเก่า** ที่ rawMessage ไม่มี marker นั้น
 */
const STICKER_MAX_PX = 240

/**
 * ปุ่มบันทึกไฟล์ใต้สื่อ (user สั่ง 2026-07-31: "อยากให้อยู่ใต้รูป หรือไฟล์นั้นๆ")
 *
 * วางใต้สื่อ ไม่ใช่ในกลุ่มปุ่ม hover ข้างบับเบิล เพราะกลุ่มนั้นเป็น desktop-only (lg:group-hover)
 * — บนมือถือจะกดไม่ได้เลย ทั้งที่การบันทึกรูปจากมือถือคือเคสหลัก
 *
 * **มือถือใช้ Web Share API ไม่ใช่ `download`** (user สั่ง 2026-07-31: "กดบนมือถือให้บันทึก
 * เข้า photos ตอนนี้มันเข้า download เอาไปใช้ต่อยาก") — `<a download>` บนมือถือลงโฟลเดอร์
 * Files/Downloads เสมอ เว็บเขียนลงคลังรูปโดยตรงไม่ได้ ทางเดียวที่เข้า Photos/แกลเลอรีได้จริง
 * คือเปิดชีตแชร์ของ OS ซึ่งมีเมนู "บันทึกรูปภาพ" อยู่
 *
 * desktop ยังใช้ `<a download>` ตามเดิม — เดสก์ท็อปบางตัวรองรับ share files ด้วย ถ้าปล่อยให้
 * ใช้ share จะกลายเป็นเปิดหน้าต่างแชร์แทนที่จะบันทึกลงเครื่อง ซึ่งแย่กว่าเดิม จึงเช็ค
 * pointer แบบ coarse (นิ้ว) ไม่ใช่แค่ว่ารองรับ API ไหม
 */
/**
 * บันทึกไฟล์ลงเครื่อง — คืน true ถ้าจัดการเองแล้ว (แชร์สำเร็จ/ผู้ใช้ยกเลิก), false ถ้าให้ผู้เรียก
 * ถอยไปใช้วิธีดาวน์โหลดปกติ ใช้ร่วมกันระหว่างปุ่มใต้สื่อกับปุ่มในหน้าดูรูปเต็มจอ
 */
async function shareToDevice(url: string, filename: string): Promise<boolean> {
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  if (!isTouch || typeof navigator === 'undefined' || !navigator.canShare) return false
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const blob = await res.blob()
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })
    if (!navigator.canShare({ files: [file] })) return false
    await navigator.share({ files: [file] })
    return true
  } catch (err) {
    // ผู้ใช้กดยกเลิกชีตแชร์เอง = จบงานแล้ว ห้ามถอยไปดาวน์โหลดซ้ำให้งง
    return (err as Error)?.name === 'AbortError'
  }
}

/** ไอคอน+สีประจำชนิดไฟล์แนบ (2026-08-02) — ใช้ทั้งชิปในคิวและบับเบิลในเธรด ให้ร้านจำสีได้
 *  ทุกตัวเป็น tabler icon จริง ไม่ใช่ emoji (Hard Rule 12) */
const ATTACHMENT_ICON: Record<string, { icon: string; cls: string }> = {
  IMAGE: { icon: 'photo', cls: 'bg-info/15 text-info' },
  VIDEO: { icon: 'video', cls: 'bg-primary/15 text-primary' },
  AUDIO: { icon: 'volume', cls: 'bg-success/15 text-success' },
  FILE: { icon: 'file-text', cls: 'bg-warning/15 text-warning' },
}

function MediaDownloadLink({
  storageKey,
  label = 'บันทึกไฟล์',
  attachmentName,
}: {
  storageKey: string
  label?: string
  /** ชื่อไฟล์เดิมที่ผู้ส่งเลือก (2026-08-02) — ไม่มี = ข้อความเก่า/ไฟล์ mirror จาก Meta */
  attachmentName?: string | null
}) {
  const [busy, setBusy] = useState(false)
  // เช็คใน effect ไม่ใช่ตอน render — ฝั่ง SSR ไม่มี window ถ้าอ่านตอน render จะ hydration mismatch
  const [canSaveAs, setCanSaveAs] = useState(false)
  useEffect(() => {
    setCanSaveAs('showSaveFilePicker' in window)
  }, [])
  const url = mediaSrc(storageKey)
  // ชื่อตอนบันทึก = ชื่อเดิมที่ผู้ส่งเลือก; ไม่มีก็ fallback "ไฟล์แนบ.<ext>" แทน uuid ที่อ่านไม่รู้เรื่อง
  const filename = attachmentDisplayName(storageKey, attachmentName)

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    if (!isTouch || typeof navigator === 'undefined' || !navigator.canShare) return // desktop → ปล่อย <a download> ทำงานตามปกติ
    e.preventDefault()
    setBusy(true)
    try {
      if (await shareToDevice(url, filename)) return
      // แชร์ไม่ได้/โหลดไม่สำเร็จ → ถอยไปดาวน์โหลดแบบเดิม ดีกว่าเงียบไปเฉย ๆ
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
    } finally {
      setBusy(false)
    }
  }

  /**
   * "บันทึกเป็น…" — กล่องเลือกที่เก็บ/ตั้งชื่อไฟล์ของ OS ผ่าน File System Access API
   * (Chrome/Edge เดสก์ท็อปเท่านั้น; Safari/Firefox/มือถือไม่มี จึงไม่ render ปุ่มนี้)
   *
   * ต้องเรียก showSaveFilePicker ก่อน fetch — API ตระกูลนี้ต้องการ transient activation
   * ถ้า await fetch ก่อนจะโดนปฏิเสธเพราะถือว่าไม่ได้มาจากการกดของผู้ใช้แล้ว
   */
  const handleSaveAs = async () => {
    const picker = (window as unknown as { showSaveFilePicker?: (o: { suggestedName?: string }) => Promise<FileSystemFileHandle> })
      .showSaveFilePicker
    if (!picker) return
    try {
      const handle = await picker({ suggestedName: filename })
      setBusy(true)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      const blob = await res.blob()
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
    } catch (err) {
      // ผู้ใช้กดยกเลิกกล่องเลือกที่เก็บ = ไม่ใช่ error
      if ((err as Error)?.name === 'AbortError') return
      pacesToast.chat.error('บันทึกไฟล์ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="mt-1 flex items-center gap-2">
      <a
        href={url}
        download={filename}
        onClick={handleClick}
        aria-busy={busy}
        className="text-default-700 hover:text-primary inline-flex items-center gap-1 text-2xs font-medium"
      >
        <Icon icon={busy ? 'loader-2' : 'download'} width={13} height={13} className={`shrink-0 ${busy ? 'animate-spin' : ''}`} />
        {label}
      </a>
      {canSaveAs && (
        <>
          <span className="bg-default-300 h-3 w-px" aria-hidden="true" />
          <button type="button" onClick={handleSaveAs} className="text-default-700 hover:text-primary text-2xs font-medium">
            บันทึกเป็น…
          </button>
        </>
      )}
    </span>
  )
}

/**
 * รูปในเธรด — คลิกเปิดเต็มจอ + ปุ่มบันทึกใต้รูป (ซ่อนปุ่มถ้าเป็นสติกเกอร์ ดู STICKER_MAX_PX)
 * วัดขนาดตอน onLoad เพราะขนาดจริงไม่ได้เก็บใน DB
 */
function ChatImageMessage({
  storageKey,
  onOpen,
  isStickerHint = false,
}: {
  storageKey: string
  onOpen: () => void
  /** ธงจาก server (rawMessage) — แม่นกว่าการวัดขนาดรูป และรู้ได้ก่อนรูปโหลดเสร็จ จึงไม่มีจังหวะ
   *  ที่สติกเกอร์ถูกวาดใหญ่แล้วหุบลง (สติกเกอร์ LINE ขนาดจริง 320–370px หลุดเกณฑ์ 240px) */
  isStickerHint?: boolean
}) {
  const [isSticker, setIsSticker] = useState(isStickerHint)
  return (
    <>
      {/* คลิก/กด Enter ที่รูป → เปิดเต็มจอ (user request 2026-07-23). ใช้ <button>
          ครอบแทนใส่ onClick บน <img> เพื่อให้โฟกัส/คีย์บอร์ด/screen reader ใช้ได้จริง
          (block + w-fit กันปุ่มยืดเต็มความกว้างบับเบิลจนกดโดนที่ว่างข้างรูป) */}
      <button type="button" onClick={onOpen} aria-label="ดูรูปเต็มจอ" className="block w-fit cursor-zoom-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaSrc(storageKey)}
          alt="รูปภาพที่ส่ง"
          // chat-media = ปิดเมนู long-press ของ iOS ให้ gesture เป็นของ useLongPress (react/ตอบกลับ)
          // สติกเกอร์แคบกว่ารูป: max-w-36 (144px) — เทียบกับแอป LINE เองที่วาดสติกเกอร์ราว 104–164px
          // ส่วน max-w-60 (240px) ทำให้สติกเกอร์ LINE (ขนาดจริง 320–370px) เต็มบับเบิลจนอ่านเหมือน
          // รูปที่ลูกค้าส่ง (user เจอเองบน prod 2026-08-10) — สติกเกอร์ Meta 100×100 ไม่กระทบเพราะ
          // max-w ไม่ขยายรูปที่เล็กกว่าเพดานอยู่แล้ว
          className={`chat-media rounded ${isSticker ? 'max-w-36' : 'max-w-60'}`}
          onLoad={(e) => {
            const el = e.currentTarget
            if (el.naturalWidth <= STICKER_MAX_PX && el.naturalHeight <= STICKER_MAX_PX) setIsSticker(true)
          }}
        />
      </button>
      {!isSticker && <MediaDownloadLink storageKey={storageKey} label="บันทึกรูป" />}
    </>
  )
}

/**
 * ปุ่ม "ตอบกลับ" (reply/quote, user 2026-07-25) — โผล่ตอน hover เฉพาะ desktop (lg:group-hover)
 * เหมือน CopyMessageButton; ใช้กับข้อความทุกชนิด (text/รูป/การ์ด — ตอบทับได้หมด)
 */
/**
 * ReactMessageButton — ปุ่มหน้ายิ้มข้างบับเบิลตอน hover (เดสก์ท็อป, user สั่ง 2026-08-03
 * "ใน web เวลา hover จะเป็น icon emoji ข้างๆ reply, copy กดแล้วขึ้น panel emoji")
 *
 * มือถือไม่มี hover จึงใช้ "กดค้าง" เปิดเมนูเดียวกันแทน (ดู useLongPress) — เหมือนที่ Messenger ทำ
 * ส่งตำแหน่งปุ่มกลับไปให้ ChatThread วาง popover ให้เกาะปุ่ม ไม่ใช่เกาะกลางจอ
 */
function ReactMessageButton({ onOpen }: { onOpen: (rect: DOMRect) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget.getBoundingClientRect())}
      aria-label="กดรีแอ็กชันข้อความนี้"
      title="รีแอ็กชัน"
      className="text-default-700 hover:bg-default-100 hover:text-default-700 mt-1.5 hidden size-7 shrink-0 items-center justify-center rounded-full transition-colors lg:group-hover:flex"
    >
      <Icon icon="mood-smile" className="size-4" />
    </button>
  )
}

/**
 * ปุ่ม "สร้างคำสั่งซื้อจากข้อความนี้" ข้างบับเบิลตอน hover (user สั่ง 2026-08-04 "อยากให้เพิ่มปุ่ม
 * สร้างคำสั่งซื้อเวลา hover ใน web ด้วย มันสะดวกดี")
 *
 * ทำงานเหมือนปุ่มในเมนูกดค้างของมือถือเป๊ะ ๆ (เปิดหน้าต่างคำสั่งซื้อ + กระจายที่อยู่จากข้อความนั้น)
 * — เดสก์ท็อปไม่มี "กดค้าง" จึงต้องมีทางเข้าคู่ขนานที่ hover เหมือน ตอบกลับ/คัดลอก/รีแอ็กชัน
 */
function CreateOrderFromMessageButton({ onCreate }: { onCreate: () => void }) {
  // createLabel ตรง ๆ ห้ามประกอบ "สร้าง"+noun เอง — LODGING คำล็อกคือ "เปิดบิลเข้าพัก"
  const vocab = useOrderVocab()
  return (
    <button
      type="button"
      onClick={onCreate}
      aria-label={`${vocab.createLabel}จากข้อความนี้`}
      title={`${vocab.createLabel}จากข้อความนี้`}
      className="text-default-700 hover:bg-default-100 hover:text-default-700 mt-1.5 hidden size-7 shrink-0 items-center justify-center rounded-full transition-colors lg:group-hover:flex"
    >
      <Icon icon="receipt" className="size-4" />
    </button>
  )
}

function ReplyMessageButton({ onReply }: { onReply: () => void }) {
  return (
    <button
      type="button"
      onClick={onReply}
      aria-label="ตอบกลับข้อความนี้"
      title="ตอบกลับ"
      className="text-default-700 hover:bg-default-100 hover:text-default-700 mt-1.5 hidden size-7 shrink-0 items-center justify-center rounded-full transition-colors lg:group-hover:flex"
    >
      <Icon icon="arrow-back-up" className="size-4" />
    </button>
  )
}

// จัดกลุ่มรูปที่ส่งติดกัน "ชุดเดียวกัน" เป็นอัลบั้ม (feat 00018, user request 2026-07-23 อ้าง FB):
// contiguous same-sender bare IMAGE (ไม่มี caption) ที่ห่างกันไม่เกิน ALBUM_GAP_MS → รวมเป็น 1 album
// (FB Messenger ส่งรูปหลายใบเป็นหลาย event ห่างกันไม่กี่วินาที). กลุ่มขนาด 1 = พฤติกรรมเดิม (bubble เดี่ยว)
/**
 * ระยะห่างสูงสุดที่ยอมรวมรูป "ต่าง mid" เป็นก้อนเดียว — 5 วินาที มาจากข้อมูลจริงบน prod 2026-08-04:
 *   ส่ง 2 รูปจาก Business Suite → Meta ส่งมา 2 mid ห่างกัน **2 วินาที** แต่ Messenger แสดงเป็นกลุ่มเดียว
 *   ส่ง 2 รูปแล้วต่อด้วย 6 รูป → ห่างกัน **21 วินาที** ต้องเป็นคนละกลุ่ม (ไม่ใช่กอง 8)
 * เดิมตั้งไว้ 2 นาที ซึ่งกว้างเกินจนเหมาก้อนถัดไปเข้ามารวม
 * (รูปที่ mid ฐานเดียวกัน = ข้อความเดียวของ Meta → รวมเสมอ ไม่สนเวลา)
 */
const ALBUM_GAP_MS = 5 * 1000
type AlbumRow = { kind: 'single'; m: ChatMessageView } | { kind: 'album'; ms: ChatMessageView[] }
function buildAlbumRows(items: ChatMessageView[]): AlbumRow[] {
  const rows: AlbumRow[] = []
  let buf: ChatMessageView[] = []
  const flush = () => {
    if (buf.length === 1) rows.push({ kind: 'single', m: buf[0] })
    else if (buf.length > 1) rows.push({ kind: 'album', ms: buf })
    buf = []
  }
  for (const m of items) {
    // รูปที่เป็นการ "ตอบกลับ" ข้อความอื่นต้องไม่ถูกยุบเข้าอัลบั้ม — แถวอัลบั้มไม่ได้ render
    // กล่อง quote ทำให้ดูเหมือนลูกค้าส่งรูปมาเฉย ๆ ทั้งที่กำลังตอบกลับอยู่ (user report 2026-07-31)
    // ปล่อยให้ไปทางแถวเดี่ยวซึ่งมีป้าย "ตอบกลับ…" อยู่แล้ว
    const bare = m.type === 'IMAGE' && !!m.imageUrl && !m.body && !m.replyTo
    const prev = buf[buf.length - 1]
    /**
     * ก้อนเดียวกันหรือไม่ ตัดสินด้วย **mid ฐานเดียวกัน** ก่อนเรื่องเวลา (user report prod 2026-08-04:
     * ส่ง 2 รูปแล้วส่ง 6 รูปห่างกัน 21 วินาที → ฝั่งเรารวมเป็นกองเดียว "8 รูป")
     *
     * ingest ตั้ง externalMessageId ของรูปในข้อความเดียวกันเป็น `mid`, `mid#1`, `mid#2`… อยู่แล้ว
     * (convention เดิมของ mirror หลาย attachment) จึงมีข้อมูลพอบอกขอบเขตก้อนอยู่แล้ว ไม่ต้องแก้ฐาน
     * ต่าง mid = ต่างข้อความจริงของ Meta → ต้องเป็นคนละอัลบั้มแม้ส่งติดกันแค่ไหน
     * ยังคงเงื่อนไขเวลา (ALBUM_GAP_MS) ไว้เป็นตัวช่วยสำหรับแถวที่ยังไม่มี mid (optimistic/DEEP)
     */
    const baseMid = (x: ChatMessageView) => (x.externalMessageId ?? '').split('#')[0]
    const sameMidGroup = !!prev && !!baseMid(m) && baseMid(m) === baseMid(prev)
    const sameGroup =
      bare &&
      prev &&
      burstIdentity(prev) === burstIdentity(m) &&
      new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() <= ALBUM_GAP_MS
    // mid เดียวกัน = ข้อความเดียวของ Meta → รวมเสมอ · ต่าง mid = ต้องผ่านเงื่อนไขเวลา/ผู้ส่ง
    if (bare && (buf.length === 0 || sameMidGroup || sameGroup)) {
      buf.push(m)
    } else {
      flush()
      if (bare) buf.push(m)
      else rows.push({ kind: 'single', m })
    }
  }
  flush()
  return rows
}
import { VERTICAL_CTA, type CustomerPanelData } from './CustomerPanel'

type Props = {
  conversationId: string
  /** ร้านของเธรดนี้ — key throttle เสียงแจ้งเตือนรายร้าน (ต่างร้านไม่แข่งกันดัง, user 2026-07-24)
   *  feature 00037: ตอนนี้คือ "ร้านเจ้าของเธรด" ไม่ใช่ "ร้านที่ active" อีกต่อไป (ในโหมดรวมสองอย่างนี้
   *  ไม่ใช่สิ่งเดียวกัน) — ซึ่งเป็นสิ่งที่ throttle เสียงต้องการอยู่แล้วพอดี */
  shopId: string | null
  /** ชื่อร้านของเธรด — มีค่า = โหมดรวมหลายร้าน ให้ขึ้นแถบ "กำลังตอบในนามร้าน X"
   *  null = โหมดร้านเดียว: หัวเธรดต้องเหมือนเดิมทุกพิกเซล ไม่มีแถบ ไม่มี badge (feature 00037) */
  shopName?: string | null
  buyerName: string
  buyerAvatar: string | null
  /** feature 00018 (user request 2026-07-23) — รูปฝั่งร้าน (ข้อความ mine): รูปเพจสำหรับช่องทางนอก
   *  (http URL) หรือโลโก้ร้านสำหรับ DEEP (storage fileId); null → fallback ไอคอน building-store */
  shopAvatar: string | null
  /** feature 00018 read receipt — watermark ลูกค้าอ่านถึงเวลานี้ (ISO); ข้อความ SHOP ที่ createdAt <= ค่านี้ = อ่านแล้ว */
  externalReadAt: string | null
  /** feature 00023 — สถานะบอทของเธรดนี้ (ดู BotPausedBanner) */
  botPausedUntil?: string | null
  botHandoffAt?: string | null
  botHandoffReason?: string | null
  /** ห้องนี้ถูกเลือกไว้ทดสอบ DeepAI (ChatBot อยู่โหมดทดสอบ) */
  isChatbotTestThread?: boolean
  /** มีบอทตัวไหนจะตอบห้องนี้ไหม — false = ไม่ต้องบอกว่า "พัก" เพราะไม่มีอะไรถูกพัก */
  botCouldReply?: boolean
  /** feature 00018 — 'DEEP' | 'MESSENGER' | 'INSTAGRAM' (resolve/fallback ทำที่ server แล้ว) */
  channel: string
  /** ชื่อเพจ (ShopChannel.name) ที่เธรดนี้ผูกอยู่ — แสดงบน badge แทนคำว่า "Messenger"/"Instagram"
   *  (user request 2026-07-23) null = เธรด Deep หรือหาเพจไม่เจอ → badge กลับไปใช้ชื่อช่องทาง */
  channelName: string | null
  /** รูปเพจ (ShopChannel.avatarUrl) — badge ช่องทางใช้รูปเพจแทนโลโก้ Facebook ถ้ามี (user 2026-07-23) */
  channelAvatarUrl: string | null
  /** feature 00018 E5 — โฆษณาที่ลูกค้ากดเข้ามา "ครั้งล่าสุด" (null = ไม่ได้มาจากโฆษณา)
   *  server กรอง source='ADS' + "ต้องมีอย่างน้อย adBody/adTitle/adId" มาให้แล้ว
   *  adBody = ข้อความโฆษณาจริง (ตัวที่ควรแสดง), adTitle = ชื่อ ad ใน Ads Manager (fallback) */
  adReferral: {
    adId: string | null
    adTitle: string | null
    adBody: string | null
    permalink: string | null
    photoFileId: string | null
  } | null
  /** feature 00018 — ผลลัพธ์ getWindowState() คำนวณที่ server ณ เวลา render หน้า (ไม่ live-tick) */
  windowOpen: boolean
  msRemaining: number
  /** feature 00018 — ShopChannel.status === 'TOKEN_INVALID' (เฉพาะ channel != DEEP) */
  tokenInvalid: boolean
  /** feature 00025 (2026-08-10) — ExternalContact.isBlocked ของ LINE (ครั้งล่าสุดที่ส่งล้มเหลว
   *  เพราะลูกค้าปิดรับ/เลิกติดตาม OA — ภาพนิ่ง ไม่ใช่สถานะปัจจุบันจริง) false เสมอสำหรับ Messenger/IG/DEEP */
  contactBlocked: boolean
  /**
   * feature 00025 S-14b (2026-08-10) — โควตาข้อความรายเดือนของ LINE OA ที่เธรดนี้ผูกอยู่
   *
   * `null` = ไม่ใช่เธรด LINE (Messenger/IG/DEEP ไม่มีแนวคิดโควตารายเดือน — ของ Meta เป็นหน้าต่างเวลา)
   * ค่าคำนวณที่ server ตอน render (cache ≤5 นาที) และรีเฟรชเองหลังกดส่งสำเร็จ
   * 🛑 `level` คำนวณมาจาก server แล้ว — ห้ามเอา remaining/total มาคิด % เกณฑ์ "ใกล้หมด" เองที่นี่ (HR16)
   */
  lineQuota: {
    type: 'limited' | 'unlimited' | 'unknown'
    level: LineQuotaLevel
    remaining: number | null
    total: number | null
    stale: boolean
  } | null
  /** ลูกค้ายังไม่เคยทักเข้ามาเลย (lastInboundAt=NULL) — เธรดที่ร้าน initiate จาก Facebook เอง
   *  (user report 2026-07-24). แยก banner จาก "เกิน 24 ชม." ที่สื่อว่าลูกค้าเคยทักแล้ว */
  neverInbound: boolean
  /**
   * เธรดนี้เกิดจากการตอบกลับความคิดเห็น (private reply) — มาจาก `CommentReplyLog.conversationId`
   * ฝั่ง server ไม่ใช่การดมสตริงในเนื้อข้อความ (ดูเหตุผลที่ page.tsx)
   */
  isCommentReplyThread: boolean
  /** เปิดจากในแอป iOS → ห้ามมีลิงก์ไปหน้าเติมเงิน/แพ็กเกจ (App Store Guideline 3.1.1) */
  hidePayments: boolean
  /**
   * คอมเมนต์ที่เป็นต้นเหตุของเธรดนี้ — null เมื่อไม่ได้มาจากคอมเมนต์ (เธรดปกติ)
   *
   * ทำไมต้องส่งมาแยก ไม่ดึงจากข้อความในเธรด: คอมเมนต์ **ไม่ใช่ข้อความในเธรด** และไม่มีทางเป็นได้
   * — Meta ไม่ได้ย้ายคอมเมนต์เข้ากล่องข้อความ สิ่งเดียวที่โผล่คือบรรทัดระบบภาษาอังกฤษที่บอกว่า
   * "คุณกำลังตอบคอมเมนต์" โดยไม่บอกว่าคอมเมนต์นั้นเขียนว่าอะไร (ดูที่มาเต็มใน page.tsx)
   */
  commentOrigin: {
    message: string | null
    attachmentUrl: string | null
    /** ISO string — server component ส่ง Date ตรง ๆ ข้าม RSC boundary ไม่ได้ */
    createdTime: string
    url: string | null
    /** ข้อความของ "โพสต์" ที่คอมเมนต์นี้อยู่ใต้ — คนละอันกับ `message` ซึ่งเป็นของลูกค้า */
    postMessage: string | null
    /** resolve มาแล้วที่ server (`resolvePostThumbnail`) — สำเนาที่เราเก็บเองชนะ URL ของ Meta เสมอ */
    postThumbnailUrl: string | null
    postMediaType: string | null
  } | null
  /** เกิน 24 ชม. แต่ยังไม่เกิน 7 วัน และร้านได้ permission human_agent แล้ว → คนตอบเองได้อยู่ */
  humanAgentOpen?: boolean
  humanAgentExpiresAt?: string | null
  /** feature 00018 T5 — ข้อมูล Customer Panel เดียวกับที่ desktop column ใช้ (สำหรับ sheet มือถือ) */
  customerPanelData: CustomerPanelData
}

// feature 00018 — ดู comment หัวไฟล์ (badge "ส่งไม่สำเร็จ")
//
// reply/quote quotable (bugfix 2026-08-10): GET .../messages enrich ฟิลด์นี้มาแล้วทั้งข้อความหลัก
// (ตัดสินก่อนกดส่งผ่าน replyingTo.quotable) และ snapshot replyTo (ตัดสินหลังส่งว่า quote ติดจริงไหม)
// — ChatMessageView (hook) ไม่ประกาศฟิลด์นี้ในชนิดข้อมูล (นอกขอบเขต T4/แก้ไม่ได้รอบนี้ — งานอื่นค้าง
// อยู่ในไฟล์นั้น) จึง extend ชนิดข้อมูลในนี้เองแบบเดียวกับ deliveryStatus/failureReason ข้างบน
type ChatMessageWithDelivery = ChatMessageView & {
  deliveryStatus?: string | null
  failureReason?: string | null
  quotable?: boolean
  replyTo?: (NonNullable<ChatMessageView['replyTo']> & { quotable?: boolean }) | null
}

/** (S-14b · ย้ายเข้าปุ่มส่ง 2026-08-10) tone ของสถานะโควตา LINE → คลาสของธีม — ฟังก์ชันตรรกะ
 *  (`deriveLineQuotaCaption`) ไม่รู้จัก Tailwind เลย การแปลงเกิดที่นี่ที่เดียว
 *
 *  ตอนแคปชันยังเป็นข้อความใต้ช่องพิมพ์ tone ถูกแปลงเป็น "สีตัวอักษร" ได้ตรง ๆ — พอย้ายมาอยู่บนปุ่ม
 *  พื้น `bg-primary` ตัวอักษรเป็นสีขาวเสมอ จะเปลี่ยนสีคำเพื่อสื่อความหมายไม่ได้อีก (คอนทราสต์ตก
 *  และผิด One Voice) จึงย้ายช่องสื่อสารไปที่ **ขอบ** แทน
 *  🛑 quiet/neutral ต้องเป็นค่าว่าง ไม่ใช่ขอบจาง ๆ — ปุ่มที่มีขอบตลอดเวลาแปลว่าขอบไม่ได้บอกอะไรเลย
 *  danger ก็ว่าง เพราะสถานะนั้นปุ่มถูกปิดไปแล้วและมีแถบแดงบอกวิธีแก้อยู่เหนือช่องพิมพ์ */
const QUOTA_BUTTON_RING_CLASS: Record<'quiet' | 'neutral' | 'warning' | 'danger', string> = {
  quiet: '',
  neutral: '',
  warning: 'ring-2 ring-warning',
  danger: '',
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

/** ข้อความ + สี banner 24h ตาม Content outline ของสเปก (ตัดสินเฉพาะ 2 tier ที่ "ยังไม่หมด" —
 * tier "หมดแล้ว"/TOKEN_INVALID ตัดสินที่ caller เพราะข้อความคงที่ ไม่ต้องคำนวณเวลา) */
const SECOND_MS = 1000

/** ถอยหลังละเอียดถึงวินาที "X ชั่วโมง Y นาที Z วินาที" (ตัดชั่วโมงทิ้งเมื่อ 0 ให้อ่านง่าย) */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SECOND_MS))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h} ชั่วโมง ${m} นาที ${s} วินาที` : `${m} นาที ${s} วินาที`
}

/** ถอยหลังแบบสั้น "H:MM:SS"/"MM:SS" — ใช้บนจอแคบที่หัวเธรดมีที่ไม่พอสำหรับรูปแบบเต็ม
 *  (ตัวเต็มยังอยู่ใน title ของ element เสมอ ไม่ได้หายไปไหน) */
function formatCountdownShort(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SECOND_MS))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** avatar เล็ก — รูปจริง (http URL หรือ storage fileId) + fallback (default = initials; ส่ง fallback
 *  node เองได้ เช่น ฝั่งร้านใช้ไอคอน building-store แทน initials ของชื่อลูกค้าที่ไม่เกี่ยวข้อง) */
function ChatAvatar({
  avatar,
  name,
  size = 'size-9',
  fallback,
}: {
  avatar: string | null
  name: string
  size?: string
  fallback?: React.ReactNode
}) {
  const [failed, setFailed] = useState(false)
  const src = avatar ? (avatar.startsWith('http') ? avatar : `/api/files/${avatar}`) : null
  if (!src || failed) {
    if (fallback !== undefined) return <>{fallback}</>
    return (
      <span className={`bg-primary/10 text-primary flex ${size} shrink-0 items-center justify-center rounded-full text-sm font-semibold`}>
        {generateInitials(name) || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${size} shrink-0 rounded-full bg-default-100 object-cover`}
    />
  )
}

/**
 * ProductCardBubble — เนื้อหาข้อความ type='PRODUCT' (extension #1 Chat Product Context Card, S-21)
 * ทดแทน IMAGE/text branch เดิม; อยู่ในกรอบ bubble `bg-light` เดียวกัน (PRODUCT = buyer-only เสมอ
 * ตาม BR-CTX-05 — seller ไม่ initiate จึงไม่ต้อง handle mine=true)
 *
 * username สำหรับลิงก์ /u/[username]: อ่านจาก session ผู้ใช้ที่ล็อกอิน (seller เจ้าของร้านนี้เอง
 * เพราะ PRODUCT card อ้างสินค้าในร้านตัวเอง) — component ไม่มี prop username ส่งเข้ามา (page.tsx
 * ยังไม่ plumb เพิ่ม) จึงอ่านผ่าน useSession ตรง ๆ (pattern เดียวกับหน้าอื่นใน (paces)/** ที่ใช้
 * useSession เช่น onboarding/page.tsx) แทนการ prop-drill ใหม่
 */
function ProductCardBubble({ card, username }: { card: ChatProductCard | null; username?: string }) {
  if (!card) {
    // FR-CTX-08 — สินค้าถูกลบจริง (ไม่พบใน productMap) แทนทั้งการ์ดด้วย empty state ไม่มีลิงก์/รูป
    return (
      <div className="text-default-700 flex items-center gap-2">
        <Icon icon="package-off" className="text-xl" />
        <span className="text-sm">ไม่พบสินค้านี้แล้ว</span>
      </div>
    )
  }

  // (2026-08-11) เปลี่ยนมาใช้ `formatBaht` ตัวเดียวกับที่การ์ดสินค้าบน LINE/Meta ใช้ — สูตรเดิมที่เขียน
  // ไว้ตรงนี้ให้ผลต่างกันตอนมีสตางค์ (`฿1,290.5` vs `฿1,290.50`) ราคาชิ้นเดียวกันจึงอ่านคนละแบบระหว่าง
  // จอร้านกับที่ลูกค้าเห็นในแอปแชท โดยไม่มี tsc/เทสตัวไหนฟ้อง เพราะทั้งคู่ "ถูก" ในตัวเอง (HR16)
  const priceLabel = formatBaht(card.price)
  const href = username ? `/u/${username}` : undefined

  /**
   * (2026-08-11 รอบสอง, user เจอเองบน prod: "UI ไม่ได้เลย ผมอยากให้เหมือนนี้")
   *
   * เดิมเป็นแถวนอน: รูปจิ๋ว 56px ซ้าย + ตัวหนังสือขวา — เล็กจนรูปสินค้าดูไม่ออกว่าเป็นอะไร ขณะที่
   * ลูกค้าปลายทาง (Messenger/LINE) เห็นการ์ดรูปใหญ่ ผู้ขายจึงเห็นคนละอย่างกับสิ่งที่ตัวเองเพิ่งส่ง
   *
   * 🛑 ภาษาการออกแบบยกมาจาก `MetaGenericCardCarousel` ในไฟล์เดียวกัน (การ์ดขาเข้าจาก Facebook)
   * ไม่ได้ประดิษฐ์ใหม่ — รูปบน/ตัวหนังสือล่าง, กล่องรูป `relative` + ลูก `absolute inset-0`,
   * บล็อกข้อความ `p-2.5` เท่ากัน. การ์ดขาเข้ากับขาออกในเธรดเดียวกันต้องอ่านเป็นภาษาเดียวกัน
   * (docs/conventions/sibling-surface-parity.md)
   *
   * ต่างจากตัวขาเข้า 2 จุดที่มีเหตุผล:
   *   - `aspect-square` ไม่ใช่ `aspect-video` — รูปสินค้าที่ร้านถ่ายเองส่วนใหญ่เป็นจัตุรัส ใช้ 16:9
   *     จะได้แถบว่างบน-ล่างหนาทุกใบ
   *   - `w-56` ไม่ใช่ `w-44` — ใบเดียวไม่ต้องเบียดกันในแถวเลื่อน จึงให้พื้นที่รูปเต็มที่
   */
  const inner = (
    <div className="bg-light w-56 overflow-hidden rounded-lg">
      {/* 🛑 กล่องรูปต้องล็อกความสูงจริง: `relative` + ลูก `absolute inset-0` — `aspect-*` อย่างเดียว
          ไม่พอ ลูกที่ยังอยู่ใน flow (img ที่ยังไม่รู้ขนาด / alt text ตอนโหลดไม่ขึ้น) ดันกล่องให้สูง
          เกินได้ (บทเรียนเดียวกับการ์ดขาเข้า — user เจอเองบน prod 2026-08-09) */}
      <div className="bg-default-100 relative aspect-square w-full overflow-hidden">
        {card.imageFileId ? (
          // object-contain ไม่ใช่ cover — รูปสินค้าที่ร้านอัปเองมักมีข้อความ/สเปกอยู่ในรูป และ cover
          // จะครอปทิ้ง (docs/conventions/user-supplied-image-assets.md)
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaSrc(card.imageFileId)} alt="รูปสินค้า" className="absolute inset-0 size-full object-contain" />
        ) : (
          <div className="text-default-700 absolute inset-0 flex items-center justify-center">
            <Icon icon="photo-off" className="text-xl" />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-default-800 mb-0.5 line-clamp-2 text-sm font-semibold">{card.name}</p>
        <p className="text-default-600 mb-0 text-sm">{priceLabel}</p>
        {!card.isActive && (
          <span className="text-default-700 mt-1 flex items-center gap-1 text-2xs">
            <Icon icon="ban" />
            หยุดขายแล้ว
          </span>
        )}
        {href && (
          <span className="text-primary mt-1.5 flex items-center gap-1 text-2xs font-semibold">
            ดูสินค้า <Icon icon="external-link" className="text-2xs" />
          </span>
        )}
      </div>
    </div>
  )

  // คลิกทั้งก้อนได้ — ถ้าไม่มี username (edge case ไม่ล็อกอิน/session ยังโหลด) แสดงเนื้อหาเฉย ๆ
  // ไม่มีลิงก์ แทนที่จะ crash (และไม่โชว์ "ดูสินค้า" ที่กดไม่ได้ — ดู href guard ข้างบน)
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  )
}

/**
 * OwnProductCardCarousel — การ์ดสินค้าหลายชิ้นที่ "ร้านส่งเอง" ในข้อความเดียว (ส่วนขยาย 2026-08-11)
 *
 * Base: MegaGenericCardCarousel ในไฟล์นี้ (w-44 / relative aspect-video + ลูก absolute inset-0 /
 * snap-x gap-2) — ค่าพวกนี้ผ่านการวัด peek บนรางแชท 384px มาแล้วจริง อย่าตั้งใหม่
 * เนื้อหาแต่ละใบยึด `ProductCardBubble` (ชื่อ/ราคา/"หยุดขายแล้ว"/"ไม่พบสินค้านี้แล้ว"/ลิงก์ดูสินค้า)
 *
 * ต่างจากการ์ดของ Meta ตรงที่ **ใบนี้กดได้จริง** จึงใช้ `text-primary` + "ดูสินค้า ↗" ได้
 * (ของ Meta ห้าม เพราะไม่มีปลายทางให้กด — ดู project_fb_generic_card_carousel)
 *
 * `null` ในลิสต์ = สินค้าถูกลบหลังส่ง — ต้องวาดเป็นใบหนึ่งในแถวตามตำแหน่งเดิม ไม่ใช่ตัดทิ้ง
 * ไม่งั้นผู้ขายเปิดดูย้อนหลังแล้วนับการ์ดได้ไม่ครบ แล้วนึกว่าระบบส่งไม่ครบตั้งแต่แรก
 */
function OwnProductCardCarousel({
  cards,
  username,
  messageId,
}: {
  cards: (ChatProductCard | null)[]
  username?: string
  messageId: string
}) {
  return (
    <div>
      {/* caption — ตำแหน่ง/ขนาดชุดเดียวกับ caption ของการ์ด Meta ในไฟล์นี้ ต่างที่ไม่มีไอคอนแบรนด์
          (การ์ดนี้เป็นของร้านเอง ไม่ได้มาจากที่ไหน) */}
      <div className="mb-1 flex justify-end">
        <span className="text-default-700 text-2xs">{`สินค้า ${cards.length} รายการ`}</span>
      </div>
      <div className="flex snap-x snap-mandatory items-stretch gap-2 overflow-x-auto pb-1">
        {cards.map((card, i) => {
          const href = card && username ? `/u/${username}` : undefined
          const inner = (
            <div className="bg-light flex h-full w-44 shrink-0 snap-start flex-col overflow-hidden rounded-lg">
              {/* กล่องรูปสูงเท่ากันทุกใบเสมอ — เหตุผลเต็มอยู่ที่ MetaGenericCardCarousel ในไฟล์นี้
                  (ลูกต้อง absolute ไม่งั้น alt text/รูปที่ยังไม่รู้ขนาดดันกล่องให้สูงไม่เท่ากัน) */}
              {/* 🛑 ยกภาษาการออกแบบจาก `ProductCardBubble` (การ์ดใบเดียว) ที่ถูก re-design ไปเมื่อ
                  `617bb496` — **ไม่ใช่จาก MetaGenericCardCarousel** ทั้งที่ยก geometry มาจากตัวนั้น:
                  `aspect-square` (รูปสินค้าที่ร้านถ่ายเองส่วนใหญ่จัตุรัส 16:9 จะได้แถบว่างหนา) +
                  `object-contain` (รูปสินค้ามักมีข้อความ/สเปกฝังอยู่ cover จะครอปทิ้ง) + `mediaSrc`
                  ถ้าใช้ของเดิม การ์ด 1 ใบกับหลายใบในเธรดเดียวกันจะอ่านเป็นคนละภาษา ทั้งที่เป็นของ
                  ชนิดเดียวกัน (HR17: rebase ผ่านสะอาดไม่ได้แปลว่าแพตเทิร์นยังตรงกัน) */}
              <div className="bg-default-100 relative aspect-square w-full overflow-hidden">
                {card?.imageFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(card.imageFileId)} alt="รูปสินค้า" className="absolute inset-0 size-full object-contain" />
                ) : (
                  <span className="text-default-700 absolute inset-0 flex items-center justify-center">
                    {/* ไม่มีรูป = `photo-off` (ชุดเดียวกับการ์ดใบเดียว); ถูกลบไปแล้ว = `package-off`
                        คนละความหมาย ห้ามใช้ไอคอนเดียวกัน */}
                    <Icon icon={card ? 'photo-off' : 'package-off'} className="text-xl" />
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col p-2">
                {card ? (
                  <>
                    <p className="text-default-800 mb-0 line-clamp-2 min-h-8 text-xs font-medium">{card.name}</p>
                    <p className="text-default-600 mt-0.5 mb-0 truncate text-sm">{formatBaht(card.price)}</p>
                    {!card.isActive && (
                      <span className="text-default-700 mt-0.5 flex items-center gap-1 text-2xs">
                        <Icon icon="ban" />
                        หยุดขายแล้ว
                      </span>
                    )}
                    <span className="text-primary mt-auto flex items-center gap-1 pt-1 text-2xs font-semibold">
                      ดูสินค้า <Icon icon="external-link" className="text-xs" />
                    </span>
                  </>
                ) : (
                  <p className="text-default-700 mb-0 text-xs">ไม่พบสินค้านี้แล้ว</p>
                )}
              </div>
            </div>
          )
          return href ? (
            <Link key={`${messageId}-${i}`} href={href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={`${messageId}-${i}`}>{inner}</div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * OrderCardBubble — เนื้อหาข้อความ type='ORDER' (การ์ดคำสั่งซื้อในแชท ฝั่ง seller)
 * user request 2026-07-25: ใช้ OrderCardView shared (การ์ดเดียวกับแท็บคำสั่งซื้อ) — แตะการ์ด → เปิด
 * โมดัลแก้ไข (onEdit); footer "ดูคำสั่งซื้อ" → /orders/{token}. buyer มี component แยก (Vuexy)
 */
function OrderCardBubble({ card, onEdit }: { card: ChatOrderCard | null; onEdit: (token: string) => void }) {
  // ชื่อรายการต้องตรงกับประเภทกิจการ — ใช้ hook ที่ไม่บังคับ Provider (การ์ดใบนี้ไม่ได้จะเปิดโมดัล)
  const vocab = useOrderVocab()
  if (!card) {
    return (
      <div className="text-default-700 flex items-center gap-2">
        <Icon icon="receipt-off" className="text-xl" />
        <span className="text-sm">ไม่พบ{vocab.noun}นี้แล้ว</span>
      </div>
    )
  }
  return (
    <OrderCardView
      orderNoun={vocab.noun}
      data={card}
      onEdit={() => onEdit(card.token)}
      className="w-64"
      footer={
        <Link
          href={`/orders/${card.token}`}
          className="bg-primary/5 text-primary hover:bg-primary/10 flex items-center justify-center gap-1.5 border-default-200 border-t px-4 py-2.5 text-sm font-semibold"
        >
          <Icon icon="external-link" className="text-base" />
          ดูคำสั่งซื้อ
        </Link>
      }
    />
  )
}

export default function ChatThread({
  conversationId,
  shopId,
  shopName = null,
  buyerName,
  buyerAvatar,
  shopAvatar,
  externalReadAt: externalReadAtInitial,
  botPausedUntil = null,
  botHandoffAt = null,
  botHandoffReason = null,
  isChatbotTestThread = false,
  botCouldReply = false,
  channel,
  channelName,
  channelAvatarUrl,
  adReferral,
  windowOpen,
  msRemaining,
  tokenInvalid,
  contactBlocked,
  lineQuota,
  neverInbound,
  isCommentReplyThread,
  hidePayments,
  commentOrigin,
  humanAgentOpen = false,
  humanAgentExpiresAt = null,
  customerPanelData,
}: Props) {
  const { data: session } = useSession()
  const shopUsername = (session?.user as { username?: string } | undefined)?.username
  // แตะการ์ดคำสั่งซื้อในแชท → เปิดโมดัลแก้ไข (user 2026-07-25: เหมือนแตะการ์ดใน right panel)
  const { openDraft, vocab, appointmentCtx } = useDraftOrders()
  const openEditOrder = (token: string) =>
    openDraft({
      conversationId,
      customerName: buyerName,
      channel,
      customerAvatar: buyerAvatar,
      pageAvatarUrl: channelAvatarUrl,
      editOrderToken: token,
    })
  /**
   * สร้างออเดอร์จากในแชทได้ในแตะเดียว (user สั่ง 2026-08-04 "อยากให้กดสร้าง order ใน chat ไว ๆ")
   *
   * เดิมบนมือถือต้อง: แตะไอคอนคนมุมขวาของแถวเครื่องมือ → sheet ข้อมูลลูกค้าเด้ง → หา CTA ในนั้น
   * = 2–3 แตะ และแตะแรกเป็นไอคอนเปล่าที่เคยมีคนหาไม่เจอมาแล้ว (user report 2026-08-01 iPad Pro)
   * payload เดียวกับ CTA ในแผงลูกค้าเป๊ะ — เปิดโมดัลพับได้ ไม่ navigate ออกจากแชท
   */
  const startCreateOrder = () =>
    openDraft({ conversationId, customerName: buyerName, channel, customerAvatar: buyerAvatar, pageAvatarUrl: channelAvatarUrl })
  /**
   * ปฏิทินตารางว่างในแถบเครื่องมือ (user สั่ง 2026-08-10 "อยากให้หน้า chat มี icon ดูตารางนัดได้
   * ข้าง ๆ AI Suggestion ... พร้อมปุ่มเลือกวันได้เลย จากนั้นค่อยส่งต่อให้ Modal สร้างการบริการ
   * จะได้ลดขั้นตอน")
   *
   * เปิดชีตตัวเดียวกับที่ฟอร์มใช้ แต่โหมด "ภาพรวมทุกคิว" — ตอนกดยังไม่มีการเลือกคิว ผู้ขายแค่
   * อยากรู้ว่าวันไหนพอรับได้
   */
  const [apptSheetOpen, setApptSheetOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  // user request 2026-07-25 — กดไอคอนตะกร้าใน inbox (?panel=orders) บนจอเล็ก (<1024px) → เด้ง sheet
  // ข้อมูลลูกค้า (แท็บออเดอร์เปิดเองใน CustomerPanelBody). เดสก์ท็อปมี panel persistent ไม่ต้องเปิด sheet
  const searchParams = useSearchParams()
  useEffect(() => {
    if (searchParams.get('panel') === 'orders' && window.matchMedia('(max-width: 1023px)').matches) {
      setSheetOpen(true)
    }
  }, [searchParams])
  // ดูรูปเต็มจอ — index ของรูปที่เปิดอยู่ใน imageSlides (-1 = ปิด) ตาม Base Gallery.tsx:58
  // (ต้องประกาศตรงนี้กับ hook ตัวอื่น ห้ามย้ายลงไปหลัง early return ของ errorState/loadingInitial)
  const [lightboxIndex, setLightboxIndex] = useState(-1)
  // composer improvement #1 (feature 00018) — emoji picker; append ต่อท้ายข้อความ ไม่ปิด picker
  // (ผู้ใช้เลือกหลายตัวต่อกันได้ ปิดเองด้วยคลิกนอก/Escape)
  const [emojiOpen, setEmojiOpen] = useState(false)
  /** แผงสติกเกอร์เป็นปุ่มของตัวเอง (user สั่ง 2026-08-04 "อยากให้แยก emoji / sticker เป็น 2 icon") */
  const [stickerOpen, setStickerOpen] = useState(false)
  // S-18b: เปิดให้ LINE ด้วย — ปุ่มเดิม/เงื่อนไขเดิมของ Meta ไม่เปลี่ยน แค่เพิ่มช่องทางที่ผ่าน
  const canSendSticker = channel === 'MESSENGER' || channel === 'INSTAGRAM' || channel === 'LINE'
  /** แหล่งสติกเกอร์ผัน — LINE มีชุดปิดตายตัวจาก SSOT (ไม่ใช่ Sticker Catalog API ของ Meta) */
  const stickerProvider: 'META' | 'LINE' = channel === 'LINE' ? 'LINE' : 'META'
  // composer improvement #2/#3 — แผงเหนือช่องพิมพ์ (ข้อความสำเร็จรูป / AI ช่วยร่างคำตอบ)
  // state เดียวคุมทั้งคู่ (user สั่ง 2026-07-23: "ต้องไม่ขึ้นซ้อนกัน เปิดได้ทีละอัน") — เดิมแยก
  // boolean คนละตัว กดสองปุ่มแล้วกางพร้อมกันทับกัน (ทั้งคู่เป็นแถบ full-bleed -mt ติดลบ)
  const [activePanel, setActivePanel] = useState<'quick' | 'ai' | 'product' | null>(null)
  const aiOpen = activePanel === 'ai'
  const quickOpen = activePanel === 'quick'
  const productOpen = activePanel === 'product'
  // (ส่วนขยาย 2026-08-11) ชีตเลือกหลายชิ้น — ซ้อนบนแผงเลือกสินค้า ปิดแล้วกลับไปแผงเดิม
  // ไม่รวมเข้า activePanel เพราะไม่ใช่ "แผงที่ 4" ที่แข่งพื้นที่กับอีก 3 แผง แต่เป็นชั้นที่สองของแผงเดิม
  const [multiSelectOpen, setMultiSelectOpen] = useState(false)
  const togglePanel = (panel: 'quick' | 'ai' | 'product') =>
    setActivePanel((cur) => (cur === panel ? null : panel))
  // feature 00018 — composer/attach ปิดเมื่อช่องทางนอก (Messenger/IG) ยังไม่รองรับส่งรูป, หรือ
  // ส่งข้อความไม่ได้ (window ปิด/token ตาย) — ดู comment หัวไฟล์
  const isExternal = channel !== 'DEEP'
  // live 24h countdown — capture เวลาหมดอายุครั้งเดียวตอน mount (msRemaining จาก server + เวลาโหลด)
  // แล้ว tick ทุกวินาที ให้ banner ถอยหลังจริง และ composer ปิดเองเมื่อถึง 0 ไม่ต้อง reload หน้า
  //
  // (S-14b, 2026-08-10) LINE ใช้กลไกเดียวกันนี้ แต่ค่าที่ป้อนเข้ามาคือหน้าต่าง reply 60 วินาที
  // (page.tsx เป็นคนเลือกกติกาตาม channel) — ที่นี่ไม่ต้องรู้ว่ามาจาก provider ไหน
  // 🔄 (2026-08-10 รอบเย็น, user สั่ง) เดิมห้าม render `liveRemaining` เป็นตัวเลขสำหรับ LINE โดยอ้าง
  // BRD FR-LINE-05 ข้อ "เป็นข้อมูล ไม่ใช่การนับถอยหลัง" — อ่านเกณฑ์ทั้งชุดแล้วพบว่าตีความเกินไป
  // เพราะข้อที่อยู่ติดกันเขียนว่า "เธรดแสดงให้ร้านเห็นว่า...**เหลือเวลาเท่าไร**" ซึ่งไม่เคยถูกทำเลย
  // ตอนนี้ปุ่มส่งนับถอยหลังจริง (`ส่ง · ฟรี 45 วิ`) โดยข้อห้ามที่ยังอยู่คือ **ห้ามมีตัวเร่งความเครียด**
  // (ห้ามแดง/กะพริบ/ขยายเมื่อใกล้ 0) — ดู comment เหนือ `freeSuffix` ใน lib/line/quota-caption.ts
  const [expiryTs, setExpiryTs] = useState(() => Date.now() + msRemaining)
  // 🛑 ต้อง reset เมื่อ prop เปลี่ยน ไม่ใช่ lazy-init ครั้งเดียวตอน mount: เธรด LINE เรียก
  // router.refresh() หลังส่งสำเร็จ (โควตา/หน้าต่างเปลี่ยนทันทีที่ส่ง) ถ้าไม่ reset ตัวจับเวลาจะยัง
  // นับของรอบก่อนต่อไป แล้วแคปชันจะบอกว่า "ส่งฟรี" ทั้งที่ reply token ถูกใช้ไปแล้วตั้งแต่ใบที่แล้ว
  useEffect(() => {
    setExpiryTs(Date.now() + msRemaining)
  }, [msRemaining, windowOpen])
  const [nowTs, setNowTs] = useState(() => Date.now())
  useEffect(() => {
    if (!isExternal || !windowOpen) return // นับเฉพาะช่องทางนอกที่ window ยังเปิดตอนโหลด
    const t = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [isExternal, windowOpen])
  const liveRemaining = Math.max(0, expiryTs - nowTs)
  const liveWindowOpen = windowOpen && liveRemaining > 0
  // tick หยาบ ๆ (ทุก 15 วิ) ให้เวลาข้อความล่าสุด "หายไปเอง" หลังส่งเกิน 1 นาที (user request 2026-07-23)
  const [, setMetaTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setMetaTick((x) => x + 1), 15000)
    return () => clearInterval(t)
  }, [])

  // E5 — แบนเนอร์ "ตอบกลับจากโฆษณา" ปิดได้แบบ Messenger. เก็บสถานะที่ localStorage ต่อเธรด
  // (ความชอบระดับอุปกรณ์เหมือน mute รายเธรด ไม่ใช่ข้อมูลร้าน — พนักงานคนอื่นยังเห็นแบนเนอร์อยู่)
  // เก็บ "รหัสโฆษณาที่ปิดไป" ไม่ใช่ boolean เพื่อให้โฆษณา *ตัวใหม่* เด้งกลับมาเองโดยไม่ต้องเคลียร์ค่า
  /** รูปปกโพสต์ในการ์ดคอมเมนต์ต้นเหตุโหลดไม่ขึ้น — การ์ดนี้มีรูปเดียว ใช้ boolean ตัวเดียวพอ
      (รายการคอมเมนต์ใช้ Set เพราะมีหลายแถว) */
  const [postThumbBroken, setPostThumbBroken] = useState(false)

  const adKey = adReferral?.adId ?? adReferral?.adTitle ?? null
  // อ่านหลัง mount เท่านั้น (localStorage ไม่มีฝั่ง server) และเริ่มที่ "ยังไม่รู้" แทน "ยังไม่ได้ปิด"
  // เพื่อไม่ให้แบนเนอร์ที่ผู้ขายปิดไปแล้วแวบขึ้นมาก่อนแล้วค่อยหาย
  const [adDismissChecked, setAdDismissChecked] = useState(false)
  const [adDismissedKey, setAdDismissedKey] = useState<string | null>(null)
  useEffect(() => {
    try {
      setAdDismissedKey(localStorage.getItem(`deep:ad-referral-dismissed:${conversationId}`))
    } catch {
      // localStorage ปิด (โหมดส่วนตัวบางเบราว์เซอร์) — ถือว่ายังไม่เคยปิด แบนเนอร์แสดงตามปกติ
    }
    setAdDismissChecked(true)
  }, [conversationId])
  const dismissAdBanner = () => {
    if (!adKey) return
    setAdDismissedKey(adKey)
    try {
      localStorage.setItem(`deep:ad-referral-dismissed:${conversationId}`, adKey)
    } catch {
      // เขียนไม่ได้ = ปิดได้แค่รอบนี้ (เปิดเธรดใหม่จะกลับมา) ดีกว่าปุ่มกดแล้วไม่มีอะไรเกิดขึ้น
    }
  }
  const showAdBanner = !!adReferral && !!adKey && adDismissChecked && adDismissedKey !== adKey

  // เหลือเงื่อนไขล็อกเดียว: เพจหลุดการเชื่อมต่อ (2026-08-03 — user: "การไป lock ui มันทำให้เกิดปัญหา")
  //
  // ต่างกันตรง "รู้แน่" กับ "เดา": tokenInvalid คือข้อเท็จจริงที่ยืนยันแล้ว (ยิงไปก็ 190 ทุกครั้ง)
  // และร้านแก้ที่หน้านี้ไม่ได้ ต้องไปเชื่อมเพจใหม่ก่อน — ล็อกไว้ถูกแล้ว. ส่วนหน้าต่าง 24 ชม./7 วัน
  // เป็นค่าที่ "เราคำนวณเอง" จาก lastInboundAt ที่คลาดได้ทั้งสองทาง การล็อกจากค่านั้น = ห้ามร้าน
  // ส่งข้อความที่ Meta จะรับจริง. ปล่อยให้ส่งแล้วโชว์เหตุผลบนบับเบิลถ้าไม่ผ่าน ตรงความจริงกว่า
  // (ฝั่ง service เลิกบล็อกล่วงหน้าให้ข้อความที่คนพิมพ์เองแล้ว — channel-chat.service.ts)
  //
  // (S-14b) แคปชันข้างปุ่มส่งของเธรด LINE — รวม "ใบนี้ส่งฟรีไหม" กับ "โควตาเหลือเท่าไหร่" ไว้
  // คำตอบเดียว เพราะเป็นคำถามเดียวที่ผู้ขายถามก่อนกดส่ง. ตรรกะทั้งหมดอยู่ในฟังก์ชันบริสุทธิ์
  // (มีเทส + พิสูจน์ด้วย mutation) — ที่นี่มีหน้าที่แค่ป้อนค่าเข้าและแปลง tone เป็นคลาสสี
  //
  // 🛑 ใช้ `liveWindowOpen` ไม่ใช่ `windowOpen` ดิบ: หน้าต่างของ LINE ยาว 60 วินาที ผู้ขายพิมพ์
  // ข้อความเดียวก็เลยเวลาได้ ค่า ณ ตอน render จึงเก่าเกือบทันทีที่แสดง
  const lineQuotaCaption =
    channel === 'LINE' && lineQuota
      ? deriveLineQuotaCaption({
          windowOpen: liveWindowOpen,
          type: lineQuota.type,
          level: lineQuota.level,
          remaining: lineQuota.remaining,
          total: lineQuota.total,
          stale: lineQuota.stale,
          // ปัดขึ้น + clamp ขั้นต่ำ 1: เหลือ 0.4 วินาทีต้องอ่านว่า "1 วิ" ไม่ใช่ "0 วิ" — ตัวเลข 0
          // ที่ค้างอยู่เต็มวินาทีขัดกับคำว่า "ฟรี" ที่อยู่ข้าง ๆ มันเอง (พอถึง 0 จริง `liveWindowOpen`
          // พลิกเป็น false แล้วปุ่มเปลี่ยนไปโหมดโควตาเอง จึงไม่มีทางค้างที่ "ฟรี 1 วิ")
          secondsLeft: liveWindowOpen ? Math.max(1, Math.ceil(liveRemaining / 1000)) : null,
        })
      : null

  //
  // (S-14b) รีเฟรชค่าจาก server หลังส่งสำเร็จ — เฉพาะเธรด LINE
  //
  // ทำไมต้องมี: การส่ง 1 ครั้งเปลี่ยน "ความจริง" สองอย่างพร้อมกันทันทีในฐานข้อมูล — reply token
  // ถูกใช้ไป (หน้าต่างฟรีปิดทันที ไม่ใช่รอครบ 60 วิ) และโควตาถูกหักไป 1 ถ้าเป็น push. ถ้าไม่รีเฟรช
  // แคปชันจะยังบอกว่า "ส่งฟรี"/เลขเดิม ในนาทีที่ผู้ขายกำลังจะพิมพ์ใบถัดไป ซึ่งเป็นนาทีที่มันสำคัญที่สุด
  //
  // ทำไมไม่แก้ที่ hook / ไม่ให้ POST คืนโควตากลับมา: เส้นทางส่งข้อความใช้ร่วมกับ Messenger/IG/แอปผู้ซื้อ
  // การเปลี่ยนสัญญาของมันเพื่อ LINE อย่างเดียวเสี่ยงเกินความจำเป็น — ค่าที่ถูกต้องอยู่ใน DB แล้วตั้งแต่
  // ก่อน response กลับมาด้วยซ้ำ (noteLinePushConsumed/replyTokenUsedAt เขียนใน transaction ของการส่ง)
  //
  // 🛑 กันลูป: เทียบ id ของข้อความที่ "ส่งสำเร็จล่าสุด" กับตัวที่จำไว้ — refresh ทำให้ prop เปลี่ยน
  // แต่ไม่ได้สร้างข้อความใหม่ รอบถัดไป id จึงเท่าเดิมและไม่ยิงซ้ำ (ครั้งแรกหลัง mount ก็ไม่ยิง
  // เพราะเป็นการ "รับรู้สถานะเริ่มต้น" ไม่ใช่การส่งใหม่) — บทเรียน hook-return-identity-in-deps.md
  const router = useRouter()

  // ล็อกช่องพิมพ์ 2 เหตุเท่านั้น — ทั้งคู่เป็นเรื่องที่ "ยิงไปก็ถูกปฏิเสธทุกครั้ง" ไม่ใช่การเดาแทนผู้ใช้:
  //   - tokenInvalid: ยิงไปก็ 190 ทุกครั้ง และร้านแก้ที่หน้านี้ไม่ได้ ต้องไปเชื่อมช่องทางใหม่ก่อน
  //   - lineQuotaCaption.blocking: โควตาหมดจริง + พ้นหน้าต่างฟรี = ฝั่ง server ปฏิเสธ 409 แน่นอน
  //     (TFR-LINE-06 ข้อ 5) เปิดปุ่มไว้ให้กดแล้วล้มเหลว 100% แย่กว่าปิดพร้อมบอกทางออก
  //     🛑 เงื่อนไข "รู้แน่" อยู่ในฟังก์ชันบริสุทธิ์แล้ว (ค่า stale ไม่มีวันทำให้ blocking เป็น true)
  const composerDisabled = isExternal && (tokenInvalid || lineQuotaCaption?.blocking === true)
  //
  // เคยมี `sendAtRisk` ตรงนี้สำหรับบรรทัดเตือน "อาจส่งไม่สำเร็จ" เหนือช่องพิมพ์ — ตัวบรรทัดถูกตัด
  // ตอน merge (ไม่อยากทับงานยุบแถบสถานะเหลือบรรทัดเดียวของอีก session) แต่ตัวแปรตกค้างไว้
  // จน impeccable critique จับได้ว่าประกาศแล้วไม่ถูกใช้ที่ไหนเลย — ลบทิ้ง 2026-08-03
  // คำเตือนความเสี่ยงตอนนี้อยู่ที่แถบสถานะหัวแชท (`threadStatuses` key 'window') ที่เดียว
  // feature 00018: ช่องทางนอก (Messenger/IG) ส่งรูปได้แล้ว (ผ่าน presigned URL) — แนบรูปปิดเฉพาะ
  // ตอนส่งไม่ได้ (window ปิด/token ตาย) เท่านั้น ไม่ปิดเพราะเป็นช่องทางนอกอีกต่อไป
  const attachDisabled = false
  const {
    messages,
    oldestCursor,
    loadingInitial,
    loadingOlder,
    sending,
    uploading,
    uploadProgress,
    errorState,
    text,
    setText,
    pendingImages,
    setPendingImage,
    setPendingImages,
    scrollRef,
    topSentinelRef,
    handleFileChange,
    handlePaste,
    handleDropFiles,
    handleRemoveImage,
    handleSend,
    replyingTo,
    setReplyingTo,
    retryMessage,
    resendMessage,
    cancelMessage,
    reactToMessage,
    sendSticker,
    sendProductCard,
    sendProductCards,
    externalReadAt: externalReadAtLive,
    externalDeliveredAt,
    // LINE โควตาข้อความรายเดือนหมด (2026-08-10) — session-scoped, ดู comment ที่ useSellerChatThread
    quotaExceeded,
    // beepEnabled=false — หน้า inbox มี InboxList เป็นเจ้าของเสียงเตือนแล้ว (กันเสียงเบิ้ล 2 ครั้ง)
  } = useSellerChatThread(conversationId, shopId, false)

  //
  // (S-14b) รีเฟรชค่าจาก server หลังส่งสำเร็จ — เฉพาะเธรด LINE
  //
  // ทำไมต้องมี: การส่ง 1 ครั้งเปลี่ยน "ความจริง" สองอย่างพร้อมกันทันทีในฐานข้อมูล — reply token
  // ถูกใช้ไป (หน้าต่างฟรีปิดทันที ไม่ใช่รอครบ 60 วิ) และโควตาถูกหักไป 1 ถ้าส่งด้วย push. ถ้าไม่รีเฟรช
  // แคปชันจะยังบอกว่า "ส่งฟรี"/เลขเดิม ในนาทีที่ผู้ขายกำลังจะพิมพ์ใบถัดไป ซึ่งเป็นนาทีที่มันสำคัญที่สุด
  //
  // ทำไมไม่แก้ที่ hook / ไม่ให้ POST คืนโควตากลับมา: เส้นทางส่งข้อความใช้ร่วมกับ Messenger/IG/แอปผู้ซื้อ
  // การเปลี่ยนสัญญาของมันเพื่อ LINE อย่างเดียวเสี่ยงเกินความจำเป็น — ค่าที่ถูกต้องอยู่ใน DB แล้วตั้งแต่
  // ก่อน response กลับมาด้วยซ้ำ (noteLinePushConsumed / replyTokenUsedAt เขียนในทรานแซกชันของการส่ง)
  //
  // 🛑 กันลูป: เทียบ id ของข้อความที่ "ส่งสำเร็จล่าสุด" กับตัวที่จำไว้ — refresh ทำให้ prop เปลี่ยน
  // แต่ไม่ได้สร้างข้อความใหม่ รอบถัดไป id จึงเท่าเดิมและไม่ยิงซ้ำ · ครั้งแรกหลัง mount ไม่ยิงเลย
  // (เป็นการ "รับรู้สถานะเริ่มต้น" ไม่ใช่การส่งใหม่) — บทเรียน hook-return-identity-in-deps.md
  const lastSentIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (channel !== 'LINE') return
    let lastSentId: string | null = null
    for (const m of messages) if (m._status === 'sent') lastSentId = m.id
    if (!lastSentId) return
    const known = lastSentIdRef.current
    lastSentIdRef.current = lastSentId
    if (known !== null && known !== lastSentId) router.refresh()
  }, [messages, channel, router])

  // ── "เธรดที่ Meta AI ถือสิทธิ์คุมอยู่" (2026-08-08 · แก้สัญญาณ 2026-08-09) ────────────
  //
  // 🛑 เดิม derive จาก `messages[last].viaStandby === true` ซึ่ง **ผิด** และบล็อกช่องพิมพ์ค้าง
  // 18 เธรดพร้อมกันบน prod: `viaStandby` แปลว่า "เราไม่ใช่เจ้าของเธรด" ซึ่งจริง *ตลอดเวลา*
  // (เจ้าของคือ Page Inbox เสมอ) พอ AI คืนสิทธิ์แล้วคนตอบจาก Business Suite echo ก็ยังมาทาง
  // standby ธงจึงค้าง true — ดูเหตุผลเต็มที่ readMetaAiControlMarker()
  //
  // ตัวที่เชื่อได้คือ **marker ที่ Meta ประกาศเอง** (4 สตริง) เพราะเป็นการบอกสถานะตรง ๆ ไม่ใช่
  // ผลข้างเคียงของ routing — ไล่จากล่างขึ้นบน เจอตัวแรกคือสถานะปัจจุบัน
  //
  // 🛑 ไม่มี marker เลย = ถือว่า "คนคุม" (ไม่บล็อก) โดยตั้งใจ — ผิดทางนี้ผู้ขายแค่พิมพ์ตอบแล้ว
  // อาจแย่งสิทธิ์จาก AI โดยไม่ตั้งใจ ส่วนผิดอีกทางคือ **พิมพ์ไม่ได้เลยทั้งที่กำลังคุยกับลูกค้าอยู่**
  // ซึ่งคือบั๊กที่เพิ่งเกิด เสียหายกว่ากันมาก
  //
  // เฉพาะช่องทางนอก (channel != DEEP) เพราะ Deep ไม่มี Meta AI
  const aiAgentActive = useMemo(() => {
    if (!isExternal) return false
    for (let i = messages.length - 1; i >= 0; i--) {
      const control = readMetaAiControlMarker(messages[i].body)
      if (control) return control === 'AI'
    }
    return false
  }, [isExternal, messages])

  // client gate ล้วน ๆ (ไม่ยิง API) — ผู้ขายกด "ตอบเอง" แล้วยืนยันผ่าน pacesConfirm จึงปลดล็อก
  // composer ให้พิมพ์ได้ตามปกติ. ต้อง reset กลับ false เมื่อ aiAgentActive ไล่จาก false→true อีกครั้ง
  // (ลูกค้าทักใหม่แล้ว AI กลับมาคุมระหว่างเปิดหน้าค้าง) ไม่งั้น composer จะปลดล็อกค้างทั้งที่ AI
  // คุมจริงแล้ว — ใช้ ref เก็บค่ารอบก่อนหน้าเทียบเอง (ไม่ใช่แค่ if (aiAgentActive) เพราะนั่นจะ
  // reset ทุกครั้งที่ยัง true อยู่ ทำให้กด "ตอบเอง" แล้วปลดล็อกไม่ได้เลยสักครั้ง)
  const [respondingManually, setRespondingManually] = useState(false)
  const prevAiAgentActiveRef = useRef(aiAgentActive)
  useEffect(() => {
    if (!prevAiAgentActiveRef.current && aiAgentActive) setRespondingManually(false)
    prevAiAgentActiveRef.current = aiAgentActive
  }, [aiAgentActive])

  // แสดง "composer replacement block" (แทนที่ทั้งแถบเครื่องมือ+textarea) เฉพาะตอน AI คุมอยู่จริง
  // ยังไม่ยืนยันตอบเอง และ token ยังไม่ตาย — tokenInvalid ชนะเสมอ (คงพฤติกรรม dim เดิม เพราะ
  // "เชื่อมต่อเพจขาด" กับ "มี AI ทำงานแทนอยู่" คนละความหมาย จะปนกันไม่ได้)
  const showAiTakeoverComposer = !composerDisabled && aiAgentActive && !respondingManually
  // แถบ "กำลังตอบเองแทน AI" หลังยืนยันแล้ว — หายเองเมื่อ aiAgentActive กลับเป็น false (ไม่มีปุ่มปิด)
  const showManualOverrideStrip = !composerDisabled && aiAgentActive && respondingManually

  const confirmTakeOverFromAi = async () => {
    const ok = await pacesConfirm.question(
      'ตอบเองแทน AI ของ Meta?',
      'หลังจากนี้คุณพิมพ์ข้อความส่งหาลูกค้าได้ตามปกติ — แต่การหยุด AI ให้แน่ใจ 100% ต้องกดที่ Business Suite ของเพจนี้โดยตรง',
      { confirmButtonText: 'ตอบเอง', cancelButtonText: 'ให้ AI ตอบต่อไป' },
    )
    if (ok) setRespondingManually(true)
  }

  // ── กดค้างบนข้อความ → เมนูลอย (user สั่ง 2026-08-02) ────────────────
  //
  // ทำไมต้องมี: ปุ่มตอบกลับ/คัดลอกข้างบับเบิลเป็น `lg:group-hover:flex` = ผูกกับ hover ซึ่งมือถือ
  // ไม่มี — ปุ่มจึงไม่เคยโผล่บนมือถือเลยสักครั้ง ไม่ใช่แค่ "กดยาก"
  //
  // hook เรียกในลูปไม่ได้ จึงมี useLongPress ตัวเดียวที่ container แล้ว resolve ย้อนกลับว่านิ้ว
  // อยู่บนข้อความไหนผ่าน data-message-id — วิธีนี้ยังทำให้ทุกชนิดบับเบิล (รูป/ไฟล์/การ์ด) ใช้ได้หมด
  // โดยไม่ต้องไปแตะ render ของแต่ละชนิด
  // mode: 'menu' = กดค้างบนมือถือ (แถวรีแอ็กชัน + ตอบกลับ/คัดลอก)
  //       'reactions' = กดปุ่มหน้ายิ้มตอน hover บนเดสก์ท็อป (มีปุ่มตอบกลับ/คัดลอกข้างบับเบิลอยู่แล้ว)
  // โหมด 'menu' เก็บ "ตัว element ของบับเบิล" ไม่ใช่พิกัดนิ้ว เพราะ overlay ต้องโคลนบับเบิลนั้นมา
  // ลอยเหนือฉากเบลอ (user สั่ง 2026-08-03 อ้าง Messenger) — พิกัดนิ้วบอกไม่ได้ว่าก้อนไหนกว้างแค่ไหน
  const [actionTarget, setActionTarget] = useState<
    | { mode: 'menu'; message: ChatMessageView; bubble: HTMLElement }
    | { mode: 'reactions'; message: ChatMessageView; x: number; y: number }
    | null
  >(null)
  const messagesRef = useRef<ChatMessageView[]>([])
  messagesRef.current = messages
  const longPress = useLongPress((point) => {
    const row = document.elementFromPoint(point.x, point.y)?.closest('[data-message-id]')
    const id = row?.getAttribute('data-message-id')
    const message = id ? messagesRef.current.find((x) => x.id === id) : undefined
    // แถว (`[data-message-id]`) กว้างเต็มบรรทัดเพราะมี avatar + ปุ่ม hover ด้วย — ที่ต้องยกขึ้นมา
    // คือคอลัมน์บับเบิลข้างใน (`[data-message-bubble]`) ซึ่งกว้างเท่าเนื้อข้อความจริง
    const bubble = row?.querySelector<HTMLElement>('[data-message-bubble]')
    if (message && bubble) setActionTarget({ mode: 'menu', message, bubble })
  })

  const actionTargetActions: MessageAction[] = (() => {
    const m = actionTarget?.message
    if (!m || actionTarget?.mode === 'reactions') return []
    const list: MessageAction[] = []
    // เงื่อนไขเดียวกับปุ่ม hover ฝั่ง desktop (ดู canReply ตอน render) — ตอบทับข้อความ optimistic
    // ไม่ได้เพราะ route ต้องการ uuid จริง
    if (!m.isDeleted && !m._status && !m.id.startsWith('local-')) {
      list.push({ key: 'reply', icon: 'arrow-back-up', label: 'ตอบกลับ', onSelect: () => setReplyingTo(m) })
    }
    /**
     * สร้างคำสั่งซื้อจากข้อความนี้ (user สั่ง 2026-08-04: "ใน mobile กดสร้างคำสั่งซื้อยาก และอยากให้
     * มัน auto เอาข้อความที่ long press ไว้ ไปเข้ากระจายที่อยู่อัตโนมัติ")
     *
     * ทางเดิมบนมือถือคือ เปิดแผงลูกค้า (sheet) → หาปุ่มสร้างคำสั่งซื้อ → กดปุ่มกระจาย → ก๊อปข้อความ
     * จากเธรดมาวาง = 4 จังหวะ และต้องออกจากเธรดไปก๊อปข้อความกลับมา. ตรงนี้คือ 1 จังหวะ
     *
     * เฉพาะข้อความที่มีตัวอักษร: ข้อความรูป/ไฟล์/การ์ดไม่มีอะไรให้กระจาย (ปุ่มที่กดแล้วไม่เกิดอะไร
     * แย่กว่าปุ่มที่ไม่มี) ส่วนข้อความ optimistic/ลบแล้วไม่ต้องกันเพิ่ม เพราะ body ยังอ่านได้และ
     * การสร้างออเดอร์ไม่ได้อ้างอิง id ของข้อความเลย
     */
    /**
     * ส่งสติกเกอร์ตอบข้อความนี้ (user สั่ง 2026-08-04: "อยากให้มี sticker บน long press ... ถ้ากด
     * sticker จะถือว่าเป็น reply อัตโนมัติ")
     *
     * ไม่ใช่รีแอ็กชัน: Meta รับรีแอ็กชันเป็น "อักขระอิโมจิ" เท่านั้น ไม่มีช่องให้ใส่ sticker_id
     * (ดู sendMessageReaction) — สติกเกอร์คือ "ข้อความชนิดหนึ่ง" จึงส่งเป็นข้อความใหม่ที่ผูก reply_to
     * ตั้ง replyingTo ให้ก่อนแล้วเปิดแผงเดียวกับปุ่มในแถบพิมพ์ — ไม่มี state/เส้นทางส่งใหม่
     */
    if (canSendSticker && !m.isDeleted && !m._status && !m.id.startsWith('local-')) {
      list.push({
        key: 'sticker',
        icon: 'sticker',
        label: 'สติกเกอร์',
        onSelect: () => {
          setReplyingTo(m)
          setStickerOpen(true)
        },
      })
    }
    if (m.body?.trim()) {
      list.push({
        key: 'order',
        icon: 'receipt',
        label: vocab.createLabelShort,
        onSelect: () =>
          openDraft({
            conversationId,
            customerName: buyerName,
            channel,
            customerAvatar: buyerAvatar,
            pageAvatarUrl: channelAvatarUrl,
            prefillText: m.body!,
            // feature 00033 — เวลาของข้อความนี้ ใช้เป็นวันที่สั่งซื้อ (ตัดสินอยู่ในหน้าต่าง/เก่าเกินที่ DraftOrderProvider)
            messageCreatedAt: new Date(m.createdAt).toISOString(),
          }),
      })
    }
    if (m.body) {
      list.push({
        key: 'copy',
        icon: 'copy',
        label: 'คัดลอก',
        onSelect: () => {
          navigator.clipboard.writeText(m.body!).catch(() => {})
          // เมนูปิดทันทีที่เลือก จึงไม่มีปุ่มให้เปลี่ยนไอคอนเป็นเช็คถูกแบบฝั่ง desktop — ใช้ toast แทน
          pacesToast.success('คัดลอกข้อความแล้ว')
        },
      })
    }
    return list
  })()

  /**
   * รีแอ็กชันที่ร้านกดใส่ข้อความได้ (user สั่ง 2026-08-03 "reaction ข้อความด้วย")
   *
   * ชุดเดียวกับ 6 ตัวมาตรฐานของ Messenger เพื่อให้สิ่งที่ลูกค้าเห็นฝั่งโน้นตรงกับที่ร้านกดฝั่งนี้
   * ประกอบจาก code point (ไม่มีอักขระอิโมจิในซอร์ส — HR12 grep gate) แล้วผ่าน
   * withEmojiPresentation ให้ออกมาเป็นอิโมจิสีเหมือนกับที่ใช้ในชิปใต้บับเบิล
   *
   * เงื่อนไขที่กดไม่ได้: ข้อความถูกลบ, ข้อความ optimistic/ยังส่งไม่สำเร็จ (ยังไม่มี mid ให้ Meta ผูก)
   */
  const actionTargetReactions: MessageReactionOption[] = (() => {
    const m = actionTarget?.message
    if (!m || m.isDeleted || m._status || m.id.startsWith('local-')) return []
    return REACTION_CHOICES.map((c) => ({
      emoji: c.emoji,
      label: c.label,
      active: m.reactionEmoji === c.raw || m.reactionEmoji === c.emoji,
      // ส่งค่าดิบ (ไม่มี variation selector) ให้ Meta — ตรงกับที่ Meta ส่งมาให้เราเวลาลูกค้ากด
      // จึงเทียบ active ได้ตรงและไม่มีสองรูปแบบปนกันในฐาน
      onSelect: () => void reactToMessage(m.id, c.raw),
    }))
  })()

  // ── ลากไฟล์มาวางในเธรด (user สั่ง 2026-08-02) ──────────────────────
  //
  // ครอบเฉพาะการ์ดเธรด ไม่ใช่ทั้งหน้า — ครอบทั้งหน้าจะชนกับ SwipeableRow (ปัดแถวในกล่องขาเข้า)
  // และแผงร่างพัสดุที่อยู่คนละคอลัมน์
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0) // dragenter/leave ยิงซ้ำตอนลากผ่าน element ลูก — นับชั้นแทนการ toggle

  // ความสูงช่องพิมพ์: ลากปรับเอง + จำค่าล่าสุด + ขยายตามเนื้อหาเอง (user request 2026-07-30)
  // ส่ง text เข้าไปเป็น trigger ให้วัดใหม่ทุกครั้งที่เนื้อหาเปลี่ยน รวมถึงตอนถูกเติมจาก
  // ข้อความสำเร็จรูป/AI/สินค้า ซึ่งไม่ได้ผ่าน onChange ของผู้ใช้
  const {
    textareaRef: composerRef,
    dragging: composerDragging,
    handleProps: composerHandleProps,
  } = useComposerHeight(text)

  // composer improvement #2 — เลือกข้อความสำเร็จรูป: แนบรูปถ้ามี (ทุกช่องทางรวม Messenger/IG) +
  // เติมข้อความ/caption ลง composer
  //
  // user request 2026-07-30: ต้อง **แทนที่ข้อความเดิมทั้งหมด** ไม่ใช่ต่อท้าย — เดิมกดข้อความสำเร็จรูป
  // 2 ครั้ง (หรือกดตอนพิมพ์ค้างไว้) ได้ข้อความต่อกันเป็นพืด ต้องมาลบเองทุกครั้ง
  // มีข้อความเดิมอยู่ → ถามก่อนเสมอ เพราะการทับเป็นการทำลายสิ่งที่ผู้ใช้พิมพ์ไปแล้ว (ย้อนไม่ได้)
  // ใช้ Sweet Alerts ตาม convention ของ (paces): ต้องคลิกตอบ = Swal, เด้งหายเอง = pacesToast
  async function handleQuickPick(qm: QuickMessage) {
    // รูปหลายใบ (user สั่ง 2026-07-23) — แนบทั้งหมดลงคิว กดส่งครั้งเดียว ระบบทยอยส่งให้เอง
    // fallback imageFileId เดี่ยว: payload จาก API เวอร์ชันเก่าระหว่าง deploy
    const imgs = qm.imageFileIds?.length ? qm.imageFileIds : qm.imageFileId ? [qm.imageFileId] : []

    // ถามเฉพาะตอนมีอะไรจะเสียจริง ๆ — ช่องว่างอยู่แล้วก็ทับได้เลยไม่ต้องกวนใจ
    if (text.trim()) {
      const result = await Swal.fire({
        buttonsStyling: false,
        icon: 'question',
        title: 'แทนที่ข้อความที่พิมพ์ไว้?',
        text: 'ข้อความสำเร็จรูปจะเขียนทับสิ่งที่อยู่ในช่องพิมพ์ตอนนี้ทั้งหมด',
        showCancelButton: true,
        confirmButtonText: 'แทนที่',
        cancelButtonText: 'เก็บข้อความเดิมไว้',
        customClass: {
          confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
          cancelButton: 'btn bg-light hover:text-default-800 mt-2',
        },
      })
      if (!result.isConfirmed) return // ยกเลิก = ไม่แตะอะไรเลย แผงยังกางอยู่ให้เลือกอันอื่นต่อได้
    }

    // แทนที่ทั้งชุด: รูปที่แนบค้างไว้ก่อนหน้าก็ถูกแทนด้วยของชุดใหม่ (ไม่มีรูป = ล้างของเดิมทิ้ง)
    // ไม่งั้น "แทนที่" จะจริงแค่ครึ่งเดียว — ข้อความเปลี่ยนแต่รูปเก่ายังติดไปกับข้อความใหม่
    setPendingImages(imgs.map((fileId) => ({ fileId, previewUrl: `/api/files/${fileId}` })))
    setText(qm.body ?? '')

    // เลือกแล้วหุบแผงเอง — เนื้อหาถูกเติมลงช่องพิมพ์แล้ว ไม่มีเหตุให้กางค้างดันช่องพิมพ์ต่อ
    setActivePanel(null)
  }

  // composer improvement #4 — เลือกสินค้า: ทุกโหมดเติมลงช่องพิมพ์ (คนตรวจก่อนกดส่งเสมอ) ไม่ส่งเอง
  // รูปสินค้าที่เป็น URL เต็ม (seed เก่า) แนบไม่ได้ — pendingImage รับเฉพาะ storage fileId ที่ backend
  // ตรวจนามสกุลได้ (route คืน 400 ถ้าไม่ใช่ไฟล์รูป) จึงข้ามรูปแล้วเติมเฉพาะข้อความแทนการส่งค่าที่พัง
  function handleProductPick(payload: ProductPickPayload) {
    // (2026-08-11) โหมดที่ 4 — ส่งการ์ดออกทันที ไม่ผ่านช่องพิมพ์
    // 🛑 ไม่มี optimistic bubble: การ์ดถูกประกอบที่ server (ต้องอ่านสินค้า + แปลงรูปตามช่องทาง)
    // client จึงเดารูปร่างล่วงหน้าไม่ได้ — รอผลจริงแล้ว refetch ดีกว่าโชว์บับเบิลที่อาจไม่ตรงของจริง
    if (payload.sendCardProductId) {
      void sendProductCard(payload.sendCardProductId)
      setActivePanel(null)
      return
    }
    if (payload.imageFileId && !payload.imageFileId.startsWith('http')) {
      setPendingImage({ fileId: payload.imageFileId, previewUrl: `/api/files/${payload.imageFileId}` })
    }
    if (payload.text) setText((prev) => (prev.trim() ? `${prev}\n${payload.text}` : payload.text!))
    setActivePanel(null)
  }

  // ── render ───────────────────────────────────────────────────────────
  if (errorState) {
    // reuse SellerErrorState แทนเขียนการ์ด error ใหม่ (Link ใช้ next/link ได้ปกติในนี้ — ไฟล์นี้เป็น
    // client component 'use client' อยู่แล้ว ไม่ใช่ RSC จึงไม่ชน Hard Rule 2)
    return (
      <SellerErrorState
        title="ไม่พบบทสนทนานี้"
        message="บทสนทนานี้อาจถูกลบ หรือคุณไม่มีสิทธิ์เข้าถึง"
        retryHref="/inbox"
      />
    )
  }

  if (loadingInitial) {
    // เรขาคณิตต้องตรงกับการ์ดเธรดจริงข้างล่าง (min-w-0 h-full flex-1) และตรงกับ loading.tsx ของ
    // route ด้วย — ไม่งั้นผู้ใช้เห็น skeleton 2 ก้อนคนละขนาดต่อกัน (bug user report 2026-07-23:
    // "preload ซ้อนกัน 2 อัน") ดู comment เต็มที่ loading.tsx
    return <SellerThreadSkeleton className="min-w-0 h-full flex-1" />
  }

  const groups = groupByDate(messages)

  // จัดเวลาเป็นกลุ่ม (user request 2026-07-23) — แสดงเวลาเฉพาะ "ท้าย burst" (ก่อนเว้นช่วง > 5 นาที
  // หรือสลับผู้ส่ง หรือข้อความสุดท้าย) ไม่ใช่ทุกข้อความ; ข้อความล่าสุดซ่อนเวลาหลังส่งเกิน 1 นาที
  const GROUP_GAP_MS = 5 * 60 * 1000
  const RECENT_MS = 60 * 1000
  const nowMs = Date.now()
  const lastMsgId = messages[messages.length - 1]?.id ?? null
  // ตัดกลุ่มด้วย burstIdentity (ผู้ส่งรายคน ไม่ใช่แค่ role) — กฎ+เทสอยู่ที่ src/lib/chat-message-burst.ts
  const burstEndIds = computeBurstEndIds(messages, GROUP_GAP_MS)

  // read receipt (feature 00018) — ป้าย "อ่านแล้ว/ส่งแล้ว" โชว์เฉพาะข้อความ SHOP ตัวสุดท้าย (ช่องทางนอก)
  const lastShopMsgId = isExternal
    ? ([...messages].reverse().find((m) => m.senderRole === 'SHOP')?.id ?? null)
    : null
  // ค่าจาก hook (สดจาก GET ล่าสุด) มาก่อน prop ของ server (อ่านครั้งเดียวตอน render หน้า) — read
  // event ของ Meta มาทีหลังและไม่ทริกเกอร์ realtime จึงต้องพึ่ง refetch รอบถัดไป (bug fix 2026-07-23)
  const readAt = externalReadAtLive ?? externalReadAtInitial
  const readAtMs = readAt ? new Date(readAt).getTime() : 0

  /**
   * delivery receipt (2026-08-05) — ป้ายขั้นกลาง "ได้รับแล้ว" ระหว่าง "ส่งแล้ว" กับ "อ่านแล้ว"
   *
   * ทำไมต้องมี (user report prod 2026-08-05): "ส่งแล้ว" ของเราแปลว่า "Meta ตอบ mid กลับมา" ซึ่ง
   * เกิดขึ้นก่อนที่ข้อความจะเข้าเธรดลูกค้าจริง ส่งรูปหลายใบทีเดียวจะเห็นช่องว่างนี้ชัด — ผู้ขาย
   * เห็นว่าส่งสำเร็จแล้วทั้งที่ฝั่ง Messenger ยังไม่มีรูป. watermark นี้คือหลักฐานจาก Meta ว่าถึงจริง
   *
   * gate ด้วยช่องทาง ไม่ใช่ด้วยค่า null: Instagram ไม่มี message_deliveries ในโปรโตคอลเลย ถ้าเช็ค
   * แค่ "ยังไม่มี watermark" เธรด IG จะไม่มีวันขึ้น "ได้รับแล้ว" แล้วถ้าเผลอเอาไปผูกกับการซ่อน
   * "ส่งแล้ว" ก็จะค้างสถานะกำกวมตลอดกาล — ที่ถูกคือ IG ข้ามขั้นนี้ไปที่ "อ่านแล้ว" เลย
   */
  const supportsDeliveryReceipt = channel === 'MESSENGER'
  const deliveredAtMs =
    supportsDeliveryReceipt && externalDeliveredAt ? new Date(externalDeliveredAt).getTime() : 0


  // ดูรูปเต็มจอ — รวมรูปทุกใบในเธรด (เรียงตามเวลาเหมือนที่แสดง) เป็น slides ชุดเดียว แล้วจำ index
  // ของแต่ละข้อความไว้ เพื่อให้คลิกรูปไหนก็เปิดที่รูปนั้นแล้วเลื่อนดูใบอื่นต่อได้ (ไม่ใช่เปิดทีละใบ
  // แยกกัน) — เฉพาะ type='IMAGE'; VIDEO/AUDIO มี control ของตัวเอง, FILE เปิดแท็บใหม่อยู่แล้ว
  // download: ตั้งชื่อไฟล์ตอนบันทึกจาก storage key (ไม่งั้นได้ชื่อเป็น path ของ /api/files)
  const imageSlides: { src: string; download: { url: string; filename: string } }[] = []
  const slideIndexByMessageId = new Map<string, number>()
  for (const m of messages) {
    if (m.type === 'IMAGE' && m.imageUrl) {
      slideIndexByMessageId.set(m.id, imageSlides.length)
      const url = mediaSrc(m.imageUrl)
      imageSlides.push({
        src: url,
        download: { url, filename: m.imageUrl.split('/').filter(Boolean).pop() || 'image' },
      })
    }
    // การ์ดสินค้าแบบ carousel จาก Facebook (2026-08-09) — หลายรูปต่อ 1 ข้อความ คีย์ด้วย
    // `${messageId}:${elementIndex}` ไม่ใช่ messageId เดียว (สมมติเดิมของ map นี้คือ 1 ข้อความ = 1
    // รูป) ไม่งั้นคลิกใบที่ 2 เป็นต้นไปแล้วเปิด Lightbox ผิดใบ/ทับใบแรก
    if (m.cards && m.cards.length > 0) {
      m.cards.forEach((c, i) => {
        const fileId = c.imageFileId
        if (!fileId) return
        slideIndexByMessageId.set(`${m.id}:${i}`, imageSlides.length)
        const url = mediaSrc(fileId)
        imageSlides.push({
          src: url,
          download: { url, filename: fileId.split('/').filter(Boolean).pop() || 'image' },
        })
      })
    }
  }

  // ── สถานะห้อง (user report 2026-08-02: alert box ซ้อนกันรกจอ) ───────────────────────
  // ประกอบเป็นรายการเดียวเรียงตามความสำคัญ แล้วให้ ThreadStatusBar ตัดสินใจเรื่องการแสดงผล
  // (ยุบ/กาง) ที่เดียว — ก่อนหน้านี้แต่ละสถานะเป็น JSX แยกกันในหน้า จึงไม่มีใครรู้ว่ารวมแล้ว
  // มีกี่อัน และไม่มีทางจัดลำดับความสำคัญได้เลย
  const threadStatuses: ThreadStatusItem[] = []
  if (isExternal && tokenInvalid) {
    threadStatuses.push({
      key: 'token',
      tone: 'danger',
      icon: 'alert-circle',
      short: 'การเชื่อมต่อกับเพจนี้มีปัญหา — ต้องเชื่อมต่อใหม่',
      action: (
        <Link href="/settings/channels" className="shrink-0 text-xs font-semibold underline">
          ตั้งค่าช่องทาง
        </Link>
      ),
      detail: (
        <div className="bg-danger/15 text-danger-ink flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="alert-circle" className="mt-0.5 shrink-0 text-lg" />
          <span>
            การเชื่อมต่อกับเพจนี้มีปัญหา — ไปที่ตั้งค่าช่องทางเพื่อเชื่อมต่อใหม่{' '}
            <Link href="/settings/channels" className="font-semibold underline">
              ตั้งค่าช่องทาง
            </Link>
          </span>
        </div>
      ),
    })
  }
  // (S-14b, 2026-08-10) โควตาหมด "แบบรู้ล่วงหน้า" — ต่างจากตัวถัดไปตรงที่มาของความรู้:
  // ตัวนี้มาจากค่าที่อ่านจาก LINE โดยตรง (อายุ ≤5 นาที) และผ่านด่านเดียวกับที่ฝั่ง server ใช้ปฏิเสธ
  // จึงกล้าปิดช่องพิมพ์ (composerDisabled) — ไม่ใช่การเดาแทนผู้ใช้ แต่คือการไม่เชิญให้กดสิ่งที่ถูก
  // ปฏิเสธแน่นอน 100% (TFR-LINE-06 ข้อ 5)
  if (isExternal && lineQuotaCaption?.blocking) {
    threadStatuses.push({
      key: 'quotaBlocked',
      tone: 'danger',
      icon: 'lock',
      short: 'โควตาข้อความหมดแล้ว — ส่งไม่ได้ตอนนี้',
      action: (
        <a
          href="https://manager.line.biz/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold underline"
        >
          เปิด LINE OA Manager
          <Icon icon="external-link" className="text-sm" />
        </a>
      ),
      detail: (
        <div className="bg-danger/15 text-danger-ink flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="lock" className="mt-0.5 shrink-0 text-lg" />
          <span>
            โควตาข้อความ LINE ของเดือนนี้หมดแล้ว ส่งผลกับข้อความทุกห้องของช่องทางนี้ — ยังตอบได้ฟรีถ้าลูกค้าเพิ่งทักมาไม่เกิน
            1 นาที นอกเหนือจากนั้นมี 3 ทาง: รอรอบเดือนถัดไปเริ่ม · อัปเกรดแพ็กเกจกับ LINE · หรือตอบผ่านแอป{' '}
            <a
              href="https://manager.line.biz/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline"
            >
              LINE Official Account Manager
            </a>{' '}
            ได้ทันทีโดยไม่นับโควตานี้
          </span>
        </div>
      ),
    })
  }
  // (2026-08-10) LINE โควตาข้อความรายเดือนหมด — session-scoped (ดู comment ที่ useSellerChatThread
  // ::quotaExceeded) เป็นตาข่ายชั้นในสุด: รู้จากการ "ยิงจริงแล้วโดนปฏิเสธ" ซึ่งยังเกิดได้แม้ค่าที่
  // อ่านล่วงหน้าบอกว่ายังเหลือ (cache อายุได้ถึง 5 นาที) ช่องพิมพ์ไม่ถูก dim ด้วยตัวนี้ (ต่างจาก
  // ตัวข้างบน) เพราะค่านี้ค้างทั้ง session ข้ามวันข้ามเดือนได้ — โควตาอาจรีเซ็ตแล้วโดยเราไม่รู้
  //
  // 🛑 ไม่ขึ้นพร้อมกับ 'quotaBlocked' ข้างบน — สองแถบพูดเรื่องเดียวกันคนละน้ำเสียงบนจอเดียว
  // ทำให้ผู้ขายไม่รู้ว่าอันไหนจริง (ตัวข้างบนแม่นกว่าเพราะมีตัวเลขจาก LINE ประกอบ)
  if (isExternal && channel === 'LINE' && quotaExceeded && !lineQuotaCaption?.blocking) {
    threadStatuses.push({
      key: 'quota',
      tone: 'warning',
      icon: 'clock-exclamation',
      short: 'จำนวนข้อความที่ส่งได้เดือนนี้เต็มแล้ว — ตอบผ่าน LINE OA Manager แทนได้',
      action: (
        <a
          href="https://manager.line.biz/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold underline"
        >
          เปิด LINE OA Manager
          <Icon icon="external-link" className="text-sm" />
        </a>
      ),
      detail: (
        <div className="bg-warning/15 text-warning-ink flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="clock-exclamation" className="mt-0.5 shrink-0 text-lg" />
          <span>
            จำนวนข้อความที่ส่งได้ในเดือนนี้เต็มแล้ว ส่งผลกับข้อความทุกห้องของช่องทางนี้ — จะกลับมาส่งได้เองเมื่อรอบเดือนถัดไปเริ่ม
            หรือตอบผ่านแอป{' '}
            <a
              href="https://manager.line.biz/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline"
            >
              LINE Official Account Manager
            </a>{' '}
            ได้ทันทีโดยไม่นับจำนวนนี้
          </span>
        </div>
      ),
    })
  }
  // (2026-08-10) ลูกค้าปิดรับ/เลิกติดตาม LINE OA — isBlocked เป็น "ภาพนิ่ง ณ ครั้งที่ส่งล้มล่าสุด"
  // ไม่ใช่สถานะปัจจุบันจริง (ลูกค้าปลดบล็อกได้โดยเราไม่รู้จนกว่าจะลองส่งอีกที) ไม่มี action ให้กด —
  // ไม่มีอะไรที่ร้านทำได้ต่อจากนี้ รอฝั่งลูกค้าเปิดรับเองเท่านั้น และไม่ dim ช่องพิมพ์ด้วยเหตุผล
  // เดียวกับ quota ข้างบน (docs/conventions/stored-flag-vs-owner-truth.md)
  if (isExternal && channel === 'LINE' && contactBlocked) {
    threadStatuses.push({
      key: 'contactBlocked',
      tone: 'warning',
      icon: 'ban',
      short: 'ลูกค้าอาจปิดการรับข้อความจากบัญชีนี้ไว้ — พิมพ์ได้ตามปกติ',
      detail: (
        <div className="bg-warning/15 text-warning-ink flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="ban" className="mt-0.5 shrink-0 text-lg" />
          <span>
            ครั้งล่าสุดที่ส่งข้อความหาลูกค้ารายนี้ไม่สำเร็จ เพราะลูกค้าปิดการรับข้อความจากบัญชีนี้ไว้ (บล็อกหรือเลิกติดตาม
            LINE OA) — จะส่งได้เองเมื่อลูกค้าเปิดรับอีกครั้ง
          </span>
        </div>
      ),
    })
  }
  // 🛑 เธรดที่เกิดจากการตอบคอมเมนต์ **ไม่ขึ้นแถบสถานะเลย** (user สั่ง 2026-08-09: "ข้อความนี้
  // ในห้องแชท ไม่จำเป็นต้องมีครับ เอาออก") — เดิมขึ้นแถบ info อธิบายเพดาน 1 ข้อความของ Meta
  // ซึ่งเป็นข้อมูลที่ถูกต้องแต่ผู้ขายไม่ได้ต้องรู้ "ก่อน" ทำอะไร: ตอนอ่านยังกดส่งได้ตามปกติ และ
  // ถ้าส่งไม่ผ่านจริงจะมีเหตุผลขึ้นใต้บับเบิลนั้นอยู่แล้ว (chat-send-failure.ts) — คำเตือนที่มา
  // ก่อนโดยที่ยังไม่มีอะไรให้ทำ คือ noise ที่กินพื้นที่หัวเธรดทุกครั้งที่เปิด
  //
  // 🛑 (S-14b) เธรด LINE ไม่เข้าแถบนี้เลย — ข้อความข้างในพูดถึงหน้าต่าง 24 ชั่วโมงของ Meta (มีคำว่า
  // "Meta" อยู่ในนั้นตรง ๆ) ซึ่งไม่ใช่กติกาของ LINE. หน้าต่างฟรีของ LINE ยาว 60 วินาที = ปิดเกือบ
  // ตลอดเวลา แบนเนอร์ถาวรที่บอกเรื่องนั้นจึงเป็นเสียงรบกวนที่ไม่มีอะไรให้ทำต่อ — สถานะฟรี/เสียโควตา
  // ของ LINE สื่อผ่านแคปชันข้างปุ่มส่งที่เดียว (ติดกับปุ่มที่กำลังจะกด)
  const suppressWindowStatus = (isCommentReplyThread && neverInbound) || channel === 'LINE'
  if (isExternal && !tokenInvalid && !liveWindowOpen && !suppressWindowStatus) {
    // แยก 2 เคสที่เหลือ (user report 2026-07-24 / 2026-07-31):
    //   1. ลูกค้ายังไม่เคยทักเลย (เธรดมาจากทางอื่น)
    //   2. ทักแล้วแต่เกิน 24 ชม. — เสียโอกาสจริง แต่ตั้งแต่ 2026-08-03 ไม่บล็อกแล้ว (ดู composerDisabled)
    //      สีจึงลงจาก danger → warning: danger สงวนไว้ให้สิ่งที่ยืนยันแล้วว่าล้มเหลว/บล็อกจริง
    //      (token ตาย, แถบใต้บับเบิลที่ส่งไม่ผ่าน) ไม่ใช่สิ่งที่ยังกดส่งได้และอาจผ่าน
    // isCommentReplyThread ยังคงมีผลกับเคสที่ "ลูกค้าเคยทักแล้วแต่เกิน 24 ชม." (โทน info ไม่ใช่ warning)
    const soft = isCommentReplyThread || humanAgentOpen
    threadStatuses.push({
      key: 'window',
      tone: soft ? 'info' : 'warning',
      icon: soft ? 'info-circle' : 'alert-triangle',
      short: neverInbound
        ? isCommentReplyThread
          ? 'ตอบคอมเมนต์ได้ 1 ข้อความ — รอลูกค้าตอบกลับ'
          : 'ลูกค้ายังไม่เคยทักเข้ามา — อาจส่งไม่สำเร็จ'
        : humanAgentOpen
          ? 'เกิน 24 ชั่วโมงแล้ว — ตอบเองได้ ห้ามส่งโปรโมชัน'
          : 'เกินเวลาที่ Meta ให้ตอบ — อาจส่งไม่สำเร็จ',
      detail: (
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${soft ? 'bg-info/15 text-info-ink' : 'bg-warning/15 text-warning-ink'}`}>
          <Icon icon={soft ? 'info-circle' : 'alert-triangle'} className="mt-0.5 shrink-0 text-lg" />
          <span>
            {neverInbound ? (
              isCommentReplyThread ? (
                // "แชทนี้" ไม่ใช่ "เธรดนี้" — PRODUCT.md ผูกกลุ่มผู้ใช้ digital-literacy ต่ำไว้
                // คำทับศัพท์แบบนี้คือ jargon ที่ต้องตัด (impeccable clarify 2026-08-03)
                'แชทนี้เริ่มจากการตอบกลับความคิดเห็นบนโพสต์ — Meta ให้ส่งได้ครั้งเดียวหลังตอบกลับ ข้อความถัดไปอาจส่งไม่สำเร็จจนกว่าลูกค้าจะทักกลับมา'
              ) : (
                'ลูกค้ายังไม่เคยทักเข้ามา — ตามนโยบาย Messenger/Instagram ข้อความที่ร้านทักไปก่อนมักส่งไม่สำเร็จ ลองส่งได้ ถ้าไม่ผ่านจะขึ้นเหตุผลใต้ข้อความ'
              )
            ) : humanAgentOpen ? (
              // ระดับกลาง: เกิน 24 ชม. แต่ยังตอบได้ด้วย HUMAN_AGENT — ต้องบอกข้อจำกัดให้ครบ
              // เพราะผู้ขายอาจเผลอส่งโปรโมชันซึ่งผิดนโยบายและทำให้แอปโดนระงับได้
              <>
                เกิน 24 ชั่วโมงแล้ว แต่ยังตอบเองได้ถึง{' '}
                <span className="font-semibold">{humanAgentExpiresAt ? formatDateTime(humanAgentExpiresAt) : '7 วันนับจากข้อความล่าสุดของลูกค้า'}</span>{' '}
                — ต้องเป็นข้อความที่พิมพ์เอง ห้ามส่งโปรโมชัน (นโยบาย Meta)
              </>
            ) : (
              // ห้ามเขียนว่า "เกิน 7 วัน" ตรงนี้ (impeccable clarify 2026-08-03) — สาขานี้เข้าเมื่อ
              // humanAgentOpen เป็นเท็จ ซึ่งเกิดได้จาก 2 เหตุ: (ก) เกิน 7 วันจริง หรือ (ข) canUseHumanAgent()
              // ที่ server ตอบ false — คือสวิตช์ใหญ่ระดับระบบปิดอยู่ (ยังไม่ผ่าน App Review) และ PSID/IGSID
              // ของเธรดนี้ไม่อยู่ใน allow-list ทดสอบด้วย (feature 00043 — เดิมเช็คแค่สวิตช์เดียว
              // ไม่มี allow-list รายเธรด)
              // → ร้านที่ลูกค้าเพิ่งเงียบไป 25 ชม. เห็นข้อความ "เกิน 7 วัน" ที่ไม่จริง
              // เขียนเป็น 24 ชม. แทน — จริงทั้งสองเหตุ (7 วันก็เกิน 24 ชม. อยู่แล้ว)
              'เกินเวลาที่ Meta ให้ตอบ (24 ชม. นับจากลูกค้าทักล่าสุด) — ลองส่งได้ แต่ Meta มักปฏิเสธ ถ้าไม่ผ่านจะขึ้นเหตุผลใต้ข้อความ'
            )}
          </span>
        </div>
      ),
    })
  }
  // botCouldReply = คำถามที่ BotPausedBanner ไม่มีทางรู้ ("ห้องนี้บอทตอบได้ไหมตั้งแต่แรก")
  // ส่วน "พักอยู่จริงไหม" ตัดสินที่ getBotPausedSummary ที่เดียว ทั้งแถบยุบและตัวแบนเนอร์เต็ม
  const botPaused = getBotPausedSummary(botPausedUntil, botHandoffAt)
  if (botCouldReply && botPaused.show) {
    threadStatuses.push({
      key: 'bot',
      tone: 'warning',
      icon: 'robot-off',
      short: botPaused.short,
      detail: (
        <BotPausedBanner
          conversationId={conversationId}
          pausedUntil={botPausedUntil}
          handoffAt={botHandoffAt}
          handoffReason={botHandoffReason}
        />
      ),
    })
  }
  if (isChatbotTestThread) {
    // feature 00023 (user สั่ง 2026-08-01) — ต้องเห็นตั้งแต่เปิดห้อง เพราะข้อความที่บอทส่ง
    // ในโหมดนี้ถึงลูกค้าจริง ไม่ใช่การจำลอง คนที่ไม่รู้จะนึกว่าปลอดภัยแล้วลองพิมพ์เล่น
    threadStatuses.push({
      key: 'chatbot-test',
      tone: 'info',
      icon: 'flask',
      short: 'ห้องนี้กำลังใช้ทดสอบ DeepAI — บอทตอบถึงลูกค้าจริง',
      action: (
        <Link href="/settings/chatbot" className="shrink-0 text-xs font-semibold underline">
          ตั้งค่า
        </Link>
      ),
      detail: (
        <div className="bg-info/15 text-info-ink flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="flask" className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            ห้องนี้กำลังใช้ทดสอบ DeepAI
            <span className="block text-xs">ข้อความที่บอทตอบถูกส่งถึงลูกค้าจริง ไม่ใช่การจำลอง</span>
          </span>
          <Link href="/settings/chatbot" className="shrink-0 text-xs font-semibold underline">
            ตั้งค่า
          </Link>
        </div>
      ),
    })
  }

  return (
    <>
    <div className="card min-w-0 h-full flex-1 flex flex-col"> {/* h-full: parent คุมความสูงที่เหลือให้แล้ว (ดู comment หัวไฟล์) */}
      {/* card-header — Base ChatPage.tsx:34-56 (deviate: เพิ่ม avatar ระบุตัวตน, ตัด mobile-toggle/
          online-status/ChatToolbar — ไม่มี call/video/presence backend ตาม omissions; feature 00018
          T4: เพิ่ม ChannelBadge ข้างชื่อ)
          rewrite (chat-standalone): เพิ่มปุ่ม "กลับรายการ" มือถือ/แท็บเล็ต (lg:hidden) — (chat)
          route group ไม่มี bottom nav/back header ของ (dashboard) แล้ว ต้องมีทางออกจากหน้าเธรด
          กลับไป /inbox ของตัวเอง (คนละปุ่มกับ "กลับหน้าหลัก" ที่ ChatHeader.tsx ซึ่งไป /dashboard) */}
      {/* flex-nowrap ทับ .card-header ของ Paces ที่เป็น flex-wrap (user report 2026-08-07: ชื่อลูกค้า/
          ชื่อเพจยาวแล้วปุ่มขวาตกไปบรรทัดสอง หัวเธรดสูงผิดรูป) — เติม truncate อย่างเดียวไม่พอ เพราะ
          flexbox ตัดสินว่า "จะ wrap ไหม" จากขนาดเนื้อหาเต็ม **ก่อน** ให้ item หด ชิปชื่อเพจที่ถูก
          ล็อก max-w-56 (224px) จึงดันแถวให้ตัดบรรทัดตั้งแต่ยังไม่ทันได้ย่อ */}
      {/* py-3 แทน py-3.75 ของ .card-header — user เลือกแบบ C จาก mockup 2026-08-07
          (docs/superpowers/specs/2026-08-07-chat-thread-header-redesign-mockup.html)
          ค่าที่ใช้มี precedent ในโปรเจกต์แล้ว (public-profile/builder/LibraryPanel.tsx) */}
      <div className="card-header flex-nowrap py-3">
        {/* min-w-0: ให้กลุ่มชื่อยุบได้เมื่อจอแคบ ไม่งั้นชื่อลูกค้ายาว ๆ จะดันตัวนับถอยหลังชิดขวาตกขอบ */}
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/inbox"
            title="กลับรายการ"
            aria-label="กลับรายการ"
            className="btn btn-icon border-default-300 shrink-0 lg:hidden"
          >
            <Icon icon="arrow-left" className="text-lg" />
          </Link>
          {/**
           * ตราเพจเกาะมุมรูปลูกค้า แทนชิปข้อความใต้ชื่อ (user เลือกแบบ C 2026-08-07)
           *
           * ที่มา: หัวเธรดสูง 79px โดยที่ปุ่ม (37px) กับรูป (36px) ไม่ใช่ตัวการ — ตัวการคือชื่อ
           * กับชิปที่ถูกวางซ้อนกัน 2 บรรทัด (24 + 5 + 20 = 49px) พอเหลือบรรทัดเดียวความสูง
           * ตกไปอยู่ที่ปุ่มทันที = 61px โดยไม่ต้องย่อขนาดอะไรเลย
           *
           * IMPORTANT: คอมเมนต์เดิมตรงนี้ห้าม "เติมตราช่องทางซ้อนบน avatar" ไว้ เพราะ 2026-08-02
           * เคยทำแล้วได้ไอคอนเพจโผล่ 2 ที่ติดกัน — เงื่อนไขนั้นคือ **มีทั้งตราบนรูปและชิปพร้อมกัน**
           * รอบนี้ชิปถูกถอดออกทั้งตัว จึงเหลือที่บอกช่องทางที่เดียวเหมือนเดิม (ไม่ใช่การย้อนกฎ)
           *
           * ใช้ `imageUrl={channelAvatarUrl}` = รูปเพจจริง (ไม่ใช่โลโก้แบรนด์เปล่า) เพราะร้านที่มี
           * หลายเพจต้องแยกออกว่าลูกค้าทักมาจากเพจไหน ซึ่งเป็นหน้าที่ที่ชิปเคยทำด้วยข้อความ —
           * pattern เดียวกับรายการแชท (InboxList) ที่ทำแบบนี้อยู่แล้ว. รูปโหลดไม่ขึ้น →
           * ChannelBadgeOverlay ถอยไปโลโก้ช่องทางเองอัตโนมัติ
           *
           * ชื่อเพจแบบข้อความยังหาอ่านได้ 2 ทาง: ชี้/แตะค้างที่รูป (title) และแผงข้อมูลลูกค้า
           */}
          <span
            className="relative shrink-0"
            title={channelName ? `ทักมาจากเพจ ${channelName}` : undefined}
          >
            <ChatAvatar avatar={buyerAvatar} name={buyerName} />
            <ChannelBadgeOverlay channel={channel} imageUrl={channelAvatarUrl} />
          </span>
          {/* ชื่อบรรทัดเดียว — title กันกรณีชื่อยาวถูกตัดจนอ่านไม่ออก (เดิมไม่มีเพราะชื่อมีทั้งบรรทัด) */}
          <h5 className="text-base min-w-0 truncate" title={buyerName}>
            {buyerName}
          </h5>
        </div>

        {/* นับถอยหลังหน้าต่าง 24 ชม. — อยู่ในแถบเดียวกับชื่อลูกค้า ชิดขวา (user สั่ง 2026-08-02)
            เดิมเป็นแถบเหลืองเต็มความกว้างใต้หัวเธรด ซึ่งกินความสูงของพื้นที่อ่านข้อความตลอด 4 ชม.
            สุดท้ายทั้งที่เป็นข้อมูล "เฝ้าดู" ไม่ใช่สิ่งที่ต้องอ่านเป็นย่อหน้า
            เฉพาะ tier นี้เท่านั้นที่ย้ายขึ้นมา — tier "ส่งไม่ได้แล้ว"/token เสีย ยังเป็นแถบเต็ม
            ด้านล่างเหมือนเดิม เพราะข้อความยาวและมีลิงก์ให้กด ย่อลงมาบรรทัดเดียวไม่ได้
            ms-auto ตัวแรกกินที่ว่างทั้งหมด → ปุ่มถัดไปที่มี ms-auto อยู่แล้วไม่ขยับตำแหน่ง */}
        {/* 🛑 (S-14b) กัน LINE ออกจากป้ายนี้: หน้าต่างฟรีของ LINE ยาว 60 วินาที ซึ่งน้อยกว่า 4 ชม.
            เสมอ ป้ายนี้จึงจะติดค้างนับถอยหลังทุกวินาทีในทุกเธรด LINE ที่หน้าต่างเปิด — ขัด
            BRD AC-005-05 ที่สั่งว่าสถานะหน้าต่างฟรีเป็น "ข้อมูล ไม่ใช่การนับถอยหลัง" ตรง ๆ */}
        {isExternal && channel !== 'LINE' && !tokenInvalid && liveWindowOpen && liveRemaining <= FOUR_HOURS_MS && (
          <span
            className="text-warning ms-auto flex shrink-0 items-center gap-1.5 text-sm"
            title={`ใกล้หมดเวลาตอบ — เหลือ ${formatCountdown(liveRemaining)}`}
          >
            <Icon icon="alert-triangle" className="shrink-0 text-base" />
            {/* จอแคบเหลือ "เหลือ M:SS" — ยังเป็นคำ ไม่ใช่ไอคอนลอย ๆ ให้เดาความหมาย */}
            <span className="lg:hidden">เหลือ {formatCountdownShort(liveRemaining)}</span>
            <span className="hidden lg:inline">ใกล้หมดเวลาตอบ — เหลือ {formatCountdown(liveRemaining)}</span>
          </span>
        )}

        {/* ข้อมูลลูกค้า — ปุ่มที่หัวเธรด สำหรับช่วงที่คอลัมน์ขวายังไม่โผล่ (<1280px)
            user report 2026-08-01 (iPad Pro): "เปิดข้อมูลลูกค้าไม่ได้" ทั้งที่ปุ่มมีอยู่แล้ว —
            ของเดิมเป็นไอคอนเปล่าไม่มีข้อความ อยู่มุมขวาสุดของแถบเครื่องมือเหนือช่องพิมพ์ ซึ่งล่างสุด
            ของจอและไม่มีใครมองหาข้อมูลลูกค้าตรงนั้น. ที่ ≥1280px ไม่ต้องมี เพราะแผงอยู่ข้าง ๆ แล้ว
            (breakpoint ต้องตรงกับ xl:block ของคอลัมน์ขวาใน page.tsx เสมอ)

            2026-08-06 user สั่ง "ใน Mobile ย้ายปุ่มเปิดข้อมูลลูกค้า จาก mini bar ด้านล่าง ไปไว้ด้านบนขวา"
            → ปุ่มตัวเดียวกันนี้โผล่ตั้งแต่จอเล็กสุดแล้ว (ของเดิม md:inline-flex) และไอคอนเปล่าใน
            แถบเครื่องมือถูกถอดทิ้ง — ไม่ให้มีปุ่มเดียวกัน 2 ที่บนจอเดียว
            <768px ยุบเหลือไอคอน: หัวเธรดมีชื่อลูกค้า+ชิปช่องทาง+นับถอยหลังอยู่แล้ว ป้ายเต็มจะดันชื่อ
            จนถูกตัด. มุมขวาบนเป็นตำแหน่งที่คนมองหาข้อมูลคู่สนทนาอยู่แล้ว (ต่างจากแถบล่างที่เคยหาไม่เจอ) */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          title="ข้อมูลลูกค้า"
          aria-label="ข้อมูลลูกค้า"
          className="btn btn-sm border-default-300 text-default-700 hover:bg-default-100 ms-auto inline-flex shrink-0 items-center gap-1 xl:hidden"
        >
          <Icon icon="user-circle" className="text-base" />
          <span className="hidden md:inline">ข้อมูลลูกค้า</span>
        </button>

        {/* เสียงแจ้งเตือน — เมนูเดียวคุมทั้ง "ทั้งแอป" และ "เฉพาะแชทนี้" (user report 2026-08-10)
            เดิมที่นี่เป็นปุ่มกระดิ่งรายเธรดที่ถูกซ่อนเมื่อปิดเสียงระดับแอป และสวิตช์ระดับแอปอยู่ใน
            ChatHeader ซึ่ง hidden lg:flex ในหน้าเธรด ⇒ **บนมือถือในห้องแชทไม่มีสวิตช์เสียงให้แตะเลย**
            แทนที่ 1:1 ไม่เพิ่มปุ่มใหม่ (งบพื้นที่หัวเธรดที่ 320px ตึงอยู่แล้ว — flex-header-truncation) */}
        <NotificationSoundMenu conversationId={conversationId} />
      </div>

      {/**
        * feature 00037 — แถบ "กำลังตอบในนามร้าน X" (โหมดรวมหลายร้านเท่านั้น)
        *
        * ทำไมเป็นแถวของตัวเองไม่ใช่ชิปในหัวเธรด: หัวเธรดเพิ่งถูกลดความสูง 79px→61px และเปลี่ยนเป็น
        * flex-nowrap เมื่อ 2026-08-07 เพราะชื่อลูกค้า/ชื่อเพจยาวแล้วตกบรรทัด — ที่ 320px เหลือที่ให้
        * ชื่อลูกค้าราว 90px การเติมชิปข้อความ 60-80px กลับเข้าไปคือการย้อนงานนั้นทันที
        *
        * วางไว้ "เหนือ" แบนเนอร์โฆษณาและแถบสถานะบอท เพราะนี่คือข้อมูลที่ต้องรู้ **ก่อนพิมพ์**
        * (ตอบในนามใคร) ส่วนอีกสองอันเป็นข้อมูล "เฝ้าดู" ระหว่างคุย
        *
        * display-only โดยตั้งใจ (มติ Q-3): กดไม่ได้ — บนมือถือ ChatHeader ถูกซ่อนในหน้าเธรดอยู่แล้ว
        * การทำให้ดูกดได้แล้วพาไปที่ที่เข้าไม่ถึงแย่กว่าไม่ให้กด
        */}
      {shopName && (
        <div
          className="border-default-200 text-primary bg-primary/5 flex items-center gap-1.5 border-b px-4 py-1.5 text-xs"
          role="note"
        >
          <Icon icon="building-store" className="shrink-0 text-sm" />
          <span className="min-w-0 truncate">
            กำลังตอบในนามร้าน <span className="font-semibold">{shopName}</span>
          </span>
        </div>
      )}

      {/* feature 00018 E5 — ที่มาจากโฆษณา: รูปโฆษณา + "ตอบกลับจากโฆษณา" + ชื่อโฆษณา (เลิกใช้ badge
          เล็กบนหัวเธรดแบบเดิม ซึ่งชื่อโฆษณายาว ๆ ถูกตัดจนอ่านไม่ออกและไม่เห็นว่าเป็นโฆษณาชิ้นไหน)
          เป็น *ข้อมูลบริบท* ไม่ใช่คำเตือน → โทน default-100 กลาง ๆ ไม่ใช่ warning/danger ของแบนเนอร์
          24 ชม.ด้านล่าง เพื่อไม่ให้ผู้ขายอ่านผิดว่าเป็นสิ่งที่ต้องรีบจัดการ
          Base: theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx (DismissingAlert) */}
      {showAdBanner && adReferral && (
        // แถวเต็มความกว้าง "ติด" กับหัวแชท (border-b คั่น) ไม่ใช่การ์ดลอยมี padding รอบ —
        // user report 2026-07-26: การ์ดลอยทำให้มีช่องว่างคั่นระหว่างหัวแชทกับแบนเนอร์ ผิดจาก ref
        <div className="border-default-200 flex items-center gap-3 border-b px-4 py-2.5" role="note">
          {adReferral.photoFileId ? (
            // mirror เข้า storage เราแล้วตอนรับ webhook — ไม่ hotlink CDN Meta ที่ URL หมดอายุ
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/files/${adReferral.photoFileId}`}
              alt=""
              className="size-10 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span className="bg-default-100 text-default-700 flex size-10 shrink-0 items-center justify-center rounded-md">
              <Icon icon="speakerphone" className="text-lg" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-default-800 text-sm font-semibold">แชทนี้ตอบกลับจากโฆษณาของคุณ</p>
            <div className="flex min-w-0 items-center gap-2">
              {/* ลำดับ: ข้อความโฆษณาจริง > ชื่อ ad ใน Ads Manager > รหัสโฆษณา
                  (adBody คือตัวที่ผู้ขายอ่านแล้วรู้ทันทีว่าโฆษณาชิ้นไหน — ad_title เป็นชื่อภายใน) */}
              <span
                className="text-default-700 truncate text-sm"
                title={adReferral.adBody ?? adReferral.adTitle ?? undefined}
              >
                {adReferral.adBody ?? adReferral.adTitle ?? `รหัสโฆษณา ${adReferral.adId}`}
              </span>
              {adReferral.permalink && (
                <a
                  href={adReferral.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary shrink-0 text-sm font-medium hover:underline"
                >
                  ดูโฆษณา
                </a>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={dismissAdBanner}
            title="ปิดป้ายที่มาของโฆษณา"
            aria-label="ปิดป้ายที่มาของโฆษณา"
            className="btn btn-icon text-default-700 hover:bg-default-100 shrink-0"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>
      )}

      {/**
       * ที่มาของเธรด: คอมเมนต์ใต้โพสต์ — แถวเดียวติดหัวแชท ที่เดียวกับแบนเนอร์โฆษณา
       *
       * user สั่ง 2026-08-10 หลังเห็นรุ่นแรก: *"ต้อง merge เป็นด้านบนที่เดียว"* + *"ด้านล่าง …
       * เอาออกเลย"* + *"มันกินพื้นที่เวลาอยู่บน mobile"* — เดิมเป็นการ์ดในสตรีมข้อความสูง ~5 บรรทัด
       * ซึ่งบนมือถือกินพื้นที่จอไปมากทุกครั้งที่เปิดห้อง ตอนนี้ยุบเหลือแถวเดียวสูงเท่าแบนเนอร์โฆษณา
       *
       * ยุบแล้วยัง **ไม่ทิ้งข้อมูล** — ทั้ง "โพสต์ไหน" และ "ลูกค้าคอมเมนต์ว่าอะไร" อยู่ครบใน 2 บรรทัด
       * เพราะข้อความคอมเมนต์คือเหตุผลที่การ์ดนี้ถูกสร้างขึ้นแต่แรก (user report ผ่านหัวหน้า
       * 2026-08-09: เปิดห้องมาแล้วไม่รู้ว่าตอบเรื่องอะไร) ถ้าตัดทิ้งคือย้อนงานนั้นกลับ
       *
       * ไม่มี `!oldestCursor` แล้ว — เงื่อนไขนั้นมีไว้ตอนการ์ดวางเป็น "รายการแรกในลิสต์" (ถ้ายังมี
       * ข้อความเก่ากว่าให้โหลด มันจะไปแทรกกลางบทสนทนา) แถวที่ติดหัวแชทไม่ขึ้นกับตำแหน่ง scroll
       *
       * ไม่มีปุ่มปิดแบบแบนเนอร์โฆษณา — โฆษณาเป็นข้อมูลครั้งเดียวจบ ส่วนคอมเมนต์ต้นเหตุคือบริบทของ
       * ทั้งห้องที่ผู้ขายอ้างถึงได้ตลอดบทสนทนา
       */}
      {commentOrigin && (
        <div className="border-default-200 flex items-center gap-3 border-b px-4 py-2.5" role="note">
          <span className="relative shrink-0">
            {commentOrigin.postThumbnailUrl && !postThumbBroken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={commentOrigin.postThumbnailUrl}
                alt=""
                className="size-10 rounded-md object-cover"
                // โหลดไม่ขึ้น → กิ่งเดียวกับ "ไม่มีรูป" (กล่องเทา) ไม่ใช่กล่องขาวเปล่า
                onError={() => setPostThumbBroken(true)}
              />
            ) : (
              <span className="bg-default-100 text-default-700 flex size-10 items-center justify-center rounded-md">
                <Icon icon="photo" className="text-lg" aria-hidden="true" />
              </span>
            )}
            {isVideoPost(commentOrigin.postMediaType) && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex size-5 items-center justify-center rounded-full bg-black/50 text-white">
                  <Icon icon="player-play-filled" className="text-2xs" aria-hidden="true" />
                </span>
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            {/* บรรทัดบน = โพสต์ไหน (ตอบ "เค้า Post จากไหน") · ไม่มีบรรทัด label เปล่า ๆ คั่น
                เพราะรูปกับไอคอนสื่อความหมายอยู่แล้ว และทุกบรรทัดที่เพิ่มคือพื้นที่จอมือถือ */}
            <p
              className="text-default-800 truncate text-sm font-semibold"
              title={commentOrigin.postMessage ?? undefined}
            >
              {commentOrigin.postMessage?.trim() || 'โพสต์ไม่มีข้อความ'}
            </p>
            <div className="flex min-w-0 items-center gap-2">
              {/* ไอคอนนำหน้าทำให้แยกออกทันทีว่าบรรทัดนี้คือ "คำพูดของลูกค้า" ไม่ใช่ส่วนต่อของ
                  ข้อความโพสต์ด้านบน — สองก้อนเป็นข้อความยาวคล้ายกันวางติดกัน (ux ทักไว้) */}
              <Icon icon="message-2" className="text-default-500 size-3.5 shrink-0" aria-hidden="true" />
              <span className="text-default-700 truncate text-sm" title={commentOrigin.message ?? undefined}>
                {commentOrigin.message?.trim() ||
                  (commentOrigin.attachmentUrl ? 'ส่งรูปมาในคอมเมนต์' : 'คอมเมนต์ไม่มีข้อความ')}
              </span>
              {commentOrigin.url && (
                <a
                  href={commentOrigin.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary shrink-0 text-sm font-medium hover:underline"
                >
                  ดูคอมเมนต์
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* แถบสถานะห้อง — ยุบเป็นบรรทัดเดียว กดกางดูรายละเอียด (user report 2026-08-02:
          "alert box เยอะ ๆ ไม่ work มันรกหน้าจอมาก") ลำดับใน array = ลำดับความสำคัญ:
          ส่งไม่ได้เลย > ส่งได้แบบมีเงื่อนไข > บอทเงียบ > โหมดทดสอบ
          ตัวแรกคือตัวที่โชว์ตอนยุบ ที่เหลือนับเป็น +N */}
      <ThreadStatusBar items={threadStatuses} />

      {/* แถบสถานะออเดอร์ (Order Progress 2026-08-05) — อยู่ใต้แถบสถานะห้องเสมอ (alert ชนะ
          progress) · เฉพาะ <1280px เพราะจอ xl มี CustomerPanel เห็นการ์ด+timeline อยู่แล้ว */}
      {customerPanelData && (
        <OrderProgressBar
          orders={customerPanelData.orders}
          // ร้านคิวงานไล่แกน "นัดถึงขั้นไหน" ไม่ใช่ "ของอยู่ไหน" (user report 2026-08-08)
          vertical={customerPanelData.vertical}
          conversationId={conversationId}
          customerName={buyerName}
          channel={channel}
          customerAvatar={buyerAvatar}
          pageAvatarUrl={channelAvatarUrl}
        />
      )}

      {/* scroll body — plain div + ref (ไม่ SimpleBar ตาม spec, ต้อง programmatic scroll) */}
      {/* overscroll-contain (user report prod 2026-07-23: "เวลา scroll มันไปถึง fixed ด้านบนเลย
          ทำให้ด้านบนขยับตลอด"): เมื่อเลื่อนถึงหัว/ท้ายรายการข้อความ เบราว์เซอร์จะส่ง scroll ต่อไปให้
          ancestor ที่เลื่อนได้ (scroll chaining) → คอลัมน์กลางของ (chat)/layout.tsx และหน้าเว็บ
          ขยับตาม หัวแชทเลื่อนหนีทั้งที่ควรค้าง. overscroll-contain ตัด chain ที่ container นี้ */}
      {/* ระยะห่าง "ข้อความสุดท้าย ↔ เส้นประเหนือช่องพิมพ์" — ปรับมาแล้ว 2 รอบ บันทึกไว้กันปรับวน:
          เดิมเป็นผลรวม 3 ชั้น (my-5 ของแถวสุดท้าย 20px + py-4 ของกล่อง scroll 16px +
          py-3.75 ของ composer 15px ≈ 51px) → 2026-07-23 user ว่า "ห่างเกินไป เปลืองพื้นที่"
          จึงตัดชั้นกลาง (pb-0) + หุบ margin แถวสุดท้ายเหลือ 4px = ~19px
          → 2026-08-02 user ว่ากลับกัน "ชิดเส้นประเกินไป" (เห็นชัดสุดกับสติกเกอร์/รูปที่ขอบล่าง
          เป็นเนื้อภาพเต็ม ไม่มี padding ในตัวแบบบับเบิลข้อความ) จึงขยับเป็น mb-3 (12px) = ~27px
          ครึ่งทางของสองรอบ — ไม่แตะ my-5 ระหว่างบับเบิล จังหวะการอ่านในเธรดจึงไม่เปลี่ยน */}
      {/* relative: ให้แผงข้อความสำเร็จรูปวางทับ "พื้นที่ข้อความ" ได้พอดี (user สั่ง 2026-07-31
          "อยากปรับให้ panel นี้เต็มช่องแชทไปเลย") — วางทับแทนที่จะดันเลย์เอาต์ เพราะลิสต์ข้อความ
          ยัง mount อยู่ ตำแหน่ง scroll จึงไม่รีเซ็ตตอนปิดแผง */}
      <div
        className="relative flex min-h-0 grow flex-col"
        onDragEnter={(e) => {
          // เฉพาะการลาก "ไฟล์" — ลากข้อความ/ลิงก์ในหน้าไม่ควรเด้ง overlay
          if (!e.dataTransfer.types.includes('Files')) return
          dragDepth.current += 1
          setDragOver(true)
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault() // ไม่ preventDefault = เบราว์เซอร์เปิดไฟล์แทนที่จะให้เรารับ
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragOver(false)
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          dragDepth.current = 0
          setDragOver(false)
          if (attachDisabled || composerDisabled) return
          void handleDropFiles(e.dataTransfer.files)
        }}
      >
      {/* overlay ตอนลากไฟล์ผ่าน — inset-2 ให้เห็นขอบการ์ดเดิมด้วย จะได้รู้ว่า "วางได้ตรงนี้"
          ไม่ใช่ทั้งหน้า; pointer-events-none เพื่อไม่ให้ overlay เองไปกิน dragleave/drop */}
      {dragOver && !attachDisabled && !composerDisabled && (
        <div className="bg-primary/5 pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <div className="border-primary bg-card rounded-lg border-2 border-dashed px-8 py-6 text-center shadow-lg">
            <Icon icon="upload" className="text-primary text-3xl" />
            <p className="text-default-800 mb-0 mt-2 text-sm font-semibold">วางไฟล์ที่นี่เพื่อแนบ</p>
            <p className="text-default-700 mb-0 text-xs">แนบได้หลายไฟล์พร้อมกัน · สูงสุด 25MB ต่อไฟล์</p>
          </div>
        </div>
      )}
      {quickOpen && (
        <QuickMessageBar
          onPick={handleQuickPick}
          disabled={composerDisabled}
          onClose={() => setActivePanel(null)}
        />
      )}
      <div
        ref={scrollRef}
        {...longPress.handlers}
        className="card-body min-h-0 grow overflow-y-auto overscroll-contain pt-4 pb-0 [&>*:last-child>*:last-child]:mb-3"
      >
        {oldestCursor && (
          <div ref={topSentinelRef} className="flex justify-center py-2">
            {loadingOlder && (
              <div
                className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent"
                role="status"
                aria-label="กำลังโหลด"
              />
            )}
          </div>
        )}


        {messages.length === 0 ? (
          <SellerEmptyState
            compact
            icon="message-circle-2"
            title="เริ่มต้นการสนทนา"
            description="พิมพ์ข้อความทักทายลูกค้าได้เลย"
          />
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              {/* date divider — badge chip กึ่งกลาง */}
              <div className="my-4 flex justify-center">
                <span className="badge bg-default-100 text-default-700 text-2xs">{g.label}</span>
              </div>

              {buildAlbumRows(g.items).map((row) => {
                // อัลบั้มรูป (ชุดรูปที่ส่งติดกัน) — render grid + meta ของข้อความตัวสุดท้ายในชุด
                if (row.kind === 'album') {
                  const ms = row.ms
                  const last = ms[ms.length - 1]
                  const mine = last.senderRole === 'SHOP'
                  const atBurstEnd = burstEndIds.has(last.id)
                  const isLastOld = last.id === lastMsgId && nowMs - new Date(last.createdAt).getTime() >= RECENT_MS
                  const showTime = atBurstEnd && !isLastOld
                  return (
                    /**
                     * data-message-id / data-message-bubble / group — อัลบั้มต้องมีของชุดเดียวกับบับเบิล
                     * ปกติ (user report prod 2026-08-04 "ผม react ไม่ได้ พวก reply, emoji ยังทำไม่ได้"):
                     * เดิมสาขานี้เป็น <div> เปล่า ๆ ไม่มี data attribute เลย → useLongPress หา
                     * closest('[data-message-id]') ไม่เจอ และไม่มีชุดปุ่ม hover ให้กดบนเดสก์ท็อป
                     * รีแอ็กชัน/ตอบกลับผูกกับ **ก้อน** ด้วย mid จริงของรูปใบแรก (ms[0]) เพราะ Meta เก็บ
                     * รีแอ็กชันที่ระดับข้อความ และ mid#1..n เป็นค่าที่เราสร้างเอง ไม่มีอยู่บน Meta
                     */
                    <div
                      key={ms[0].id}
                      data-message-id={ms[0].id}
                      className={`group relative my-5 flex items-start gap-2.5 ${mine ? 'justify-end' : ''}`}
                    >
                      {!mine && <ChatAvatar avatar={buyerAvatar} name={buyerName} />}
                      {mine && (
                        <div className="flex items-start gap-0.5">
                          <ReplyMessageButton onReply={() => setReplyingTo(ms[0])} />
                          <ReactMessageButton
                            onOpen={(rect) =>
                              setActionTarget({
                                mode: 'reactions',
                                message: ms[0],
                                x: rect.left + rect.width / 2,
                                y: rect.top,
                              })
                            }
                          />
                        </div>
                      )}
                      <div data-message-bubble className="min-w-0">
                        <PhotoAlbum ms={ms} onOpen={(id) => setLightboxIndex(slideIndexByMessageId.get(id) ?? -1)} />
                        {/* ชิปรีแอ็กชันของก้อน (ผูกกับ ms[0] ตามที่ Meta เก็บ) */}
                        {ms[0].reactionEmoji && (
                          <span className={`mt-1 flex ${mine ? 'justify-end' : ''}`}>
                            <span className="bg-card border-default-200 rounded-full border px-1.5 py-0.5 text-sm leading-none shadow-sm">
                              {withEmojiPresentation(ms[0].reactionEmoji)}
                            </span>
                          </span>
                        )}
                        {(showTime || (mine && (atBurstEnd || last.id === lastShopMsgId))) && (
                          <div className={`text-default-700 mt-1 flex items-center gap-1.5 text-xs ${mine ? 'justify-end' : ''}`}>
                            {showTime && (
                              <span className="flex items-center gap-1" title={formatTime(last.createdAt)}>
                                <Icon icon="clock" />
                                {formatTimeHM(last.createdAt)}
                              </span>
                            )}
                            {mine && last.id === lastShopMsgId ? (
                              readAtMs > 0 && new Date(last.createdAt).getTime() <= readAtMs ? (
                                <span className="text-success flex items-center gap-0.5">
                                  <Icon icon="checks" /> อ่านแล้ว
                                </span>
                              ) : (
                                <span className="flex items-center gap-0.5">
                                  <Icon icon="check" /> ส่งแล้ว
                                </span>
                              )
                            ) : null}
                            {mine && atBurstEnd && (
                              <ChatAvatar
                                avatar={shopAvatar}
                                name={buyerName}
                                size="size-5"
                                fallback={
                                  <span className="bg-primary flex size-5 shrink-0 items-center justify-center rounded-full text-white">
                                    <Icon icon="building-store" className="size-3" />
                                  </span>
                                }
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }
                const m = row.m
                // เหตุการณ์การโทร — การ์ดชิดขวา (user สั่ง 2026-08-06 "ต้องชิดขวา")
                //
                // เดิมวางกึ่งกลางแบบ date divider ด้วยเหตุผลว่า Meta ส่ง senderRole='SHOP' มาทุกสาย
                // **แม้เป็นสายที่ลูกค้าโทรเข้า** การชิดขวาจึงอาจสื่อผิดว่าร้านเป็นคนโทร. user ตัดสินใจ
                // เอาชิดขวา (ตรงกับที่ Messenger วางเอง) — จึงคง "หน้าตาการ์ดระบบ" ไว้เหมือนเดิม
                // (พื้น default-100 ไม่ใช่ bg-primary ของบับเบิลร้าน, ไม่มี avatar/สถานะส่ง) เพื่อไม่ให้
                // อ่านเป็นข้อความที่ร้านพิมพ์เอง ย้ายแค่ตำแหน่ง ไม่เปลี่ยนความหมาย
                // ยังไม่มีปุ่ม "โทรกลับ" เพราะเรายังโทรกลับไม่ได้จริง (Calling API ต้อง subscribe
                // webhook `calls` + รัน WebRTC เอง) ปุ่มที่กดไม่ได้ = UI โกหก
                if (m.type === 'CALL') {
                  const missed = m.body === 'Missed call'
                  return (
                    // my-5 + justify-end = แนวเดียวกับแถวบับเบิลฝั่งร้าน (บรรทัด ~1848) ให้ขอบขวาตรงกัน
                    <div key={m.id} className="my-5 flex justify-end">
                      <div className="bg-default-100 flex max-w-xs items-center gap-2.5 rounded-lg px-3.5 py-2.5">
                        <span className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                          <Icon icon="phone-off" className="text-lg" />
                        </span>
                        <span className="min-w-0">
                          <span className="text-default-900 block text-sm font-semibold">
                            {missed ? 'สายที่ไม่ได้รับ' : 'มีการโทรด้วยเสียง'}
                          </span>
                          <span className="text-default-700 block text-xs">
                            {missed ? 'ไม่มีใครรับสายนี้' : 'การโทรผ่านแชทนี้'} · {formatTimeHM(m.createdAt)}
                          </span>
                        </span>
                      </div>
                    </div>
                  )
                }
                const mine = m.senderRole === 'SHOP'
                // จัดเวลาเป็นกลุ่ม — แสดงเวลาเฉพาะท้าย burst, ไม่ขณะกำลังส่ง, และข้อความล่าสุดซ่อนหลัง 1 นาที
                const atBurstEnd = burstEndIds.has(m.id)
                const isLastOld = m.id === lastMsgId && nowMs - new Date(m.createdAt).getTime() >= RECENT_MS
                const showTime = atBurstEnd && m._status !== 'sending' && !isLastOld
                // feature 00018 T4 (ภาคผนวก A-3): deliveryStatus/failureReason มีจริงตอน runtime
                // (getMessages ไม่ select เลย คืนทุกคอลัมน์ของ ChatMessage — ดู comment หัวไฟล์)
                const mExt = m as ChatMessageWithDelivery
                // ── ส่งไม่สำเร็จ (user สั่ง 2026-08-02) ─────────────────────────────────
                // รวม 2 เส้นทางให้เป็นสถานะเดียวกันในสายตาผู้ขาย เพราะสำหรับเขามันคือเรื่อง
                // เดียวกัน ("ข้อความนี้ไม่ถึงลูกค้า") ต่างกันแค่ว่าพลาดตรงไหน:
                //   - deliveryStatus='FAILED' = บันทึกลง DB แล้ว แต่ Meta ปฏิเสธ (มีเหตุผลให้ดู)
                //   - _status='failed'        = บับเบิล optimistic ที่ยังไม่เคยถึง server ของเรา
                const failedPersisted = mExt.deliveryStatus === 'FAILED'
                const failed = mine && (failedPersisted || m._status === 'failed')
                // 🛑 ส่ง commentOriginNoInbound เข้าไปด้วยเสมอ — เธรดที่มาจากการตอบคอมเมนต์และ
                // ลูกค้ายังไม่เคยพิมพ์กลับ ติดเพดาน "ตอบได้ข้อความเดียว" ของ Meta ไม่ใช่หน้าต่าง
                // 24 ชม. ถ้าไม่ส่งบริบทนี้ไป ผู้ขายจะได้อ่านว่า "เกินเวลา… นับจากลูกค้าทักล่าสุด"
                // ในเธรดที่ไม่มี "ข้อความล่าสุดของลูกค้า" อยู่เลย (impeccable critique 2026-08-09 P0)
                const failDetail = failedPersisted
                  ? describeSendFailure(mExt.failureReason, {
                      commentOriginNoInbound: isCommentReplyThread && neverInbound,
                    })
                  : null
                // ฝั่ง optimistic เคยไม่มีเหตุผลให้ดู (เห็นแต่ toast ตอนกดส่ง) — แต่ toast หายเองใน
                // ไม่กี่วินาที เหลือบับเบิลแดงที่ไม่บอกว่าทำไม. ตั้งแต่เลิกล็อกช่องพิมพ์ตามหน้าต่าง
                // 24 ชม. (2026-08-03) บับเบิลล้มเหลวเกิดถี่ขึ้นมาก เหตุผลจึงต้องอยู่ติดข้อความถาวร
                // เท่ากันทั้งสองเส้นทาง — hook เก็บไว้ที่ `_failReason` ให้แล้ว
                const baseFailReason = failDetail
                  ? failDetail.known && failDetail.metaCode !== null
                    ? `${failDetail.text} (Meta #${failDetail.metaCode})`
                    : failDetail.text
                  : stripSendFailurePrefix(m._failReason)
                // หมายเหตุประจำชุด (ux 2026-08-05): ใบนี้พังแต่ใบอื่นในชุดเดียวกันถึงลูกค้าแล้ว —
                // ต่อท้ายเหตุผลเสมอไม่ว่าเหตุผลจะมาจาก server (failDetail) หรือ client (_failReason)
                // เพราะสิ่งที่กันคือผู้ขายไปเลือกรูปส่งใหม่ทั้งชุดเองที่ composer = ลูกค้าได้รูปซ้ำ
                const failReason = m._batchNote
                  ? baseFailReason
                    ? `${baseFailReason} — ${m._batchNote}`
                    : m._batchNote
                  : baseFailReason
                // ส่งซ้ำได้เฉพาะชนิดที่ประกอบ payload กลับได้ครบจากแถวที่เก็บไว้: TEXT ใช้ body,
                // ไฟล์แนบทุกชนิดใช้ imageUrl (=fileId ที่ยังอยู่ใน storage — คอลัมน์เดียวกันหมดทั้ง
                // IMAGE/VIDEO/AUDIO/FILE). ORDER เก็บแต่ orderRefToken ส่วนข้อความลิงก์ที่ยิงจริง
                // ประกอบขึ้นตอนส่งและไม่ได้เก็บไว้ → ต้องส่งการ์ดใหม่จากออเดอร์
                //
                // 2026-08-03: เดิมเช็คแค่ TEXT/IMAGE ทำให้ VIDEO/AUDIO/FILE ที่ล้มเหลวไม่มีปุ่มส่งใหม่
                // เลย ทั้งที่ resendMessage/OutgoingRetry รองรับครบ 4 ชนิดอยู่แล้ว — ร้านต้องแนบไฟล์
                // ใหม่จากศูนย์ทุกครั้ง ซึ่งเจ็บขึ้นมากหลังเลิกล็อกช่องพิมพ์ (ล้มเหลวบ่อยขึ้น)
                const retryAttachment =
                  (m.type === 'IMAGE' || m.type === 'VIDEO' || m.type === 'AUDIO' || m.type === 'FILE') &&
                  !!m.imageUrl
                // (2026-08-10) "กดซ้ำมีผลไหม" เป็นความจริงของ *เหตุผล* ไม่ใช่ของ *ชนิดข้อความ* —
                // resolve จากแหล่งที่ถูกต้องตามเส้นทาง: persisted อ่านจาก describeSendFailure ตัวเดียวกับ
                // ที่คำนวณ failDetail ข้างบน (Meta ทุก rule ยัง retryable=true เหมือนเดิม — ไม่แตะพฤติกรรม
                // Meta), optimistic อ่านจาก `_retryable` ที่ hook เซ็ตจาก JSON ของ POST (ไม่รู้ = true
                // ค่าเดิมของทุกเหตุก่อน 2026-08-10). ตัวตัดสินจริงอยู่ใน canRetryFailedMessage (pure fn)
                const retryable = failDetail ? failDetail.retryable : (m._retryable ?? true)
                const canRetryFailed = canRetryFailedMessage({
                  failedPersisted,
                  messageType: m.type,
                  hasTextBody: !!m.body?.trim(),
                  hasRetryableAttachment: retryAttachment,
                  hasOptimisticRetryPayload: !!m._retry,
                  retryable,
                })
                const retryFailed = () => {
                  if (failedPersisted) {
                    resendMessage({
                      type: retryAttachment ? (m.type as 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE') : 'TEXT',
                      body: m.body,
                      ...(retryAttachment ? { imageUrl: m.imageUrl! } : {}),
                    })
                    // เอาแถวเดิมออกด้วย (user report 2026-08-03: "กดลองใหม่แล้วทำไมอันบนไม่หายไป")
                    //
                    // เดิมตั้งใจให้ append-only — แถวที่ยิงไม่ออกคือเหตุการณ์จริงที่ควรเห็น แต่ผลคือ
                    // ข้อความเดียวกันค้างเป็นบับเบิลแดง 2 อันซ้อน (และเป็น N อันถ้ากดหลายรอบ) ซึ่ง
                    // ไม่ตรงกับสิ่งที่คำว่า "ลองใหม่" สื่อ และไม่ตรงกับอีกเส้นทางของปุ่มเดียวกัน
                    // (`retryMessage` ของบับเบิล optimistic แทนที่ในตัวมาตลอด)
                    //
                    // เหตุผล "append-only" ที่เคยเขียนไว้หมดอายุไปแล้วตั้งแต่มีปุ่ม "ยกเลิก" ซึ่งลบแถว
                    // FAILED ทิ้งจริงผ่าน DELETE endpoint เดียวกันนี้ — ลบตอนยกเลิกได้ ก็ลบตอนลองใหม่ได้
                    void cancelMessage(m.id)
                  } else if (m._retry) {
                    retryMessage(m.id, m._retry)
                  }
                }
                // ถามยืนยันก่อน: เนื้อความหายถาวร กู้ไม่ได้ (undo ทำไม่ได้เพราะแถวถูกลบจริง)
                //
                // ข้อความยืนยันแยก 2 กรณี (ux 2026-08-05): ประโยค "ลูกค้าไม่เคยได้รับข้อความนี้อยู่แล้ว"
                // เขียนไว้สมัยที่ failed = "ยังไม่ถึง server" เสมอ — พอมีเคสเน็ตหลุดหลังกดส่ง (_ambiguous)
                // ประโยคนี้อาจเป็นเท็จ (บางใบอาจถึงลูกค้าไปแล้วจริง) ห้ามยืนยันสิ่งที่ระบบไม่รู้
                const cancelFailed = async () => {
                  const r = await Swal.fire({
                    buttonsStyling: false,
                    icon: 'warning',
                    title: 'ยกเลิกการส่งข้อความนี้?',
                    text: m._ambiguous
                      ? 'ยังไม่แน่ใจว่าข้อความนี้ถึงลูกค้าแล้วหรือยัง — ถ้ายกเลิกตอนนี้ ระบบจะไม่ลองส่งซ้ำให้อีก'
                      : 'ข้อความจะหายไปจากห้องแชทและกู้คืนไม่ได้ — ลูกค้าไม่เคยได้รับข้อความนี้อยู่แล้ว',
                    showCancelButton: true,
                    confirmButtonText: 'ยกเลิกการส่ง',
                    cancelButtonText: 'เก็บไว้ก่อน',
                    customClass: {
                      confirmButton: 'btn bg-danger text-white hover:bg-danger-hover mt-2 me-2',
                      cancelButton: 'btn bg-light hover:text-default-800 mt-2',
                    },
                  })
                  if (r.isConfirmed) await cancelMessage(m.id)
                }
                // ปุ่มคัดลอกข้อความ — โผล่ตอน hover เฉพาะ desktop (lg:group-hover) และเฉพาะข้อความที่มี text
                // (user request 2026-07-24) วางข้างบับเบิล: ฝั่งเรา=ซ้าย, ฝั่งลูกค้า=ขวา
                const copyBtn = m.body ? <CopyMessageButton text={m.body} /> : null
                // action cluster (hover) — ตอบกลับ (ทุกชนิด) + คัดลอก (เฉพาะข้อความมี text). ตอบกลับไม่ได้ถ้า:
                // ข้อความถูกลบ, หรือยังเป็น optimistic (id ยังไม่ใช่ uuid จริง — route.replyToMessageId ต้องเป็น uuid)
                const canReply = !m.isDeleted && !m._status && !m.id.startsWith('local-')
                const actionCluster =
                  canReply || copyBtn ? (
                    // ปุ่มตอบกลับ + คัดลอก เรียง "ข้างกัน" (user 2026-07-25) ไม่ใช่บน-ล่าง
                    <div className="flex items-start gap-0.5">
                      {canReply && <ReplyMessageButton onReply={() => setReplyingTo(m)} />}
                      {copyBtn}
                      {/* รีแอ็กชัน (user 2026-08-03) — เงื่อนไขเดียวกับ canReply: ต้องเป็นข้อความจริง
                          ที่ถึง Meta แล้ว ไม่งั้นไม่มี mid ให้ผูก. y = ขอบบนของปุ่ม ให้แผงเด้งเหนือปุ่ม */}
                      {canReply && (
                        <ReactMessageButton
                          onOpen={(rect) =>
                            setActionTarget({
                              mode: 'reactions',
                              message: m,
                              x: rect.left + rect.width / 2,
                              y: rect.top,
                            })
                          }
                        />
                      )}
                      {/* สร้างคำสั่งซื้อจากข้อความนี้ (user 2026-08-04) — เงื่อนไขเดียวกับปุ่มในเมนู
                          กดค้างของมือถือ: เฉพาะข้อความที่มีตัวอักษร (รูป/การ์ดไม่มีอะไรให้กระจาย) */}
                      {m.body?.trim() && (
                        <CreateOrderFromMessageButton
                          onCreate={() =>
                            openDraft({
                              conversationId,
                              customerName: buyerName,
                              channel,
                              customerAvatar: buyerAvatar,
                              pageAvatarUrl: channelAvatarUrl,
                              prefillText: m.body!,
                              // feature 00033 — เวลาของข้อความนี้ ใช้เป็นวันที่สั่งซื้อ
                              messageCreatedAt: new Date(m.createdAt).toISOString(),
                            })
                          }
                        />
                      )}
                    </div>
                  ) : null
                // ข้อความ "ระบบ" ที่ Facebook แทรกเองในเธรด (user report 2026-07-30) — เช่น
                // "คุณกำลังตอบกลับความคิดเห็น...ดูความคิดเห็น(url)" หรือ "<ชื่อ> replied to an ad."
                // Meta ส่งมาในนามเพจ ถ้า render เป็นบับเบิลปกติจะเข้าใจผิดว่าแอดมินพิมพ์เอง
                // (user: "ทำให้เข้าใจผิดว่าคนพิมพ์") + URL ดิบยาวเต็มจอ
                // → บรรทัดกลางจอสีจางแบบ Messenger ตามรูปที่ user ส่งมา ไม่ใช่บับเบิล
                // เพิ่ม parseMetaAiHandoffNotice (feature "Meta AI ถือสิทธิ์คุมเธรด" 2026-08-08) —
                // ข้อความสลับสิทธิ์คุมเธรด AI↔คน คนละชุดสตริงกับ parseMetaSystemNotice เดิม แต่
                // shape MetaSystemNotice เดียวกัน JSX ด้านล่างจึง render ได้โดยไม่ต้องแก้
                // การ์ดสินค้าแบบ carousel (m.cards) ก็ขึ้นต้น body ด้วย CARD_PREFIX เหมือนกัน (คงไว้
                // ตามสเปก — ปุ่มคัดลอก/ตอบกลับผูกกับ body) แต่ต้อง**ไม่**ตกไปเป็นบรรทัดระบบกลางจอ
                // แบบเดิมอีกต่อไป — ต้องแสดงเป็นการ์ดเลื่อนในบับเบิลปกติ (ชิดขวา/ซ้ายตามผู้ส่งจริง)
                // เธรดเก่าที่ไม่มี cards ยังตกไปทางเดิมทุกประการ (ไม่มีอะไรเปลี่ยนสำหรับแถวเก่า)
                const hasGenericCards = !!m.cards && m.cards.length > 0
                // 🛑 การ์ดคำขอชำระเงินก็ต้องชนะบรรทัดระบบเช่นกัน (user report 2026-08-09) —
                // อาการเดียวกับ carousel ข้างบนเป๊ะ แค่คนละชนิดการ์ด: parseMetaSystemNotice
                // จับคำนำหน้า "[การ์ดจาก Facebook]" ของการ์ด **ทุกชนิด** แล้ว early-return ตรงนี้
                // ก่อนโค้ดจะไปถึง metaOrder ด้านล่าง → การ์ดยอดเงินที่เข้ามาทางเส้น Graph sync
                // (ซึ่งเติมคำนำหน้าเสมอ) จึงขึ้นเป็นข้อความดิบ "[การ์ดจาก Facebook] ฿360.00
                // order — Waiting for payment" กลางจอ
                // การ์ดชนิดอื่น (โทร/ปุ่ม) ยังตกไปเป็นบรรทัดระบบตามเดิม เพราะ parseMetaOrderCard
                // แคบเฉพาะรูป "฿N order" เท่านั้น
                const isMetaOrderCard = m.type === 'TEXT' && !!parseMetaOrderCard(m.body)
                const systemNotice =
                  m.type === 'TEXT' && !hasGenericCards && !isMetaOrderCard
                    ? (parseMetaSystemNotice(m.body) ?? parseMetaAiHandoffNotice(m.body))
                    : null
                if (systemNotice) {
                  return (
                    <div key={m.id} className="my-5 px-4 text-center">
                      <p className="text-default-600 mb-0 text-xs">
                        {systemNotice.text}
                        {systemNotice.url && (
                          <>
                            {' '}
                            <a
                              href={systemNotice.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary font-medium hover:underline"
                            >
                              {systemNotice.linkLabel}
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                  )
                }
                return (
                  // Base ChatPage.tsx:64/79 — `my-5 flex items-start gap-2.5` (+ justify-end ฝั่งตัวเอง)
                  // data-message-id: ให้ตัวจับ "กดค้าง" ที่ระดับ container หาได้ว่านิ้วอยู่บนข้อความไหน
                  // (hook เรียกในลูปไม่ได้ จึงมี useLongPress ตัวเดียวแล้ว resolve ย้อนกลับจาก DOM)
                  <div
                    key={m.id}
                    data-message-id={m.id}
                    className={`group my-5 flex items-start gap-2.5 ${mine ? 'justify-end' : ''}`}
                  >
                    {!mine && <ChatAvatar avatar={buyerAvatar} name={buyerName} />}
                    {mine && actionCluster}
                    {/* feature 00018 T4 (ภาคผนวก A-3): เดิม Base ไม่ใส่ max-w บนคอลัมน์นี้เลย ทำให้
                        ข้อความยาว (auto-reply) ดันเต็มบรรทัด — ห้ามใส่ percent bracket (ผิด HR7 ตาม
                        comment เดิมของไฟล์นี้) จึงใช้ Tailwind scale class มาตรฐาน (ไม่ใช่ bracket)
                        max-w-96 (24rem) — precedent scale class เดียวกับ InboxList.tsx max-w-52 และ
                        max-w-60 ที่บรรทัด IMAGE ด้านล่างในไฟล์นี้เอง; min-w-0 กัน flex item ไม่ยอม shrink,
                        break-words กันคำ/ลิงก์ยาวล้นกรอบ */}
                    {/* relative: จุดยึดของป้าย "ระบบตอบ" ที่เกยขอบบนบับเบิล (feature 00023 S-23) */}
                    {/* data-message-bubble: จุดที่ MessageActionBubble โคลนไปลอยเหนือฉากเบลอตอน
                        กดค้าง — ต้องอยู่ที่คอลัมน์นี้ (ไม่ใช่แถวด้านนอกที่กว้างเต็มบรรทัด) เพราะ
                        ที่ผู้ใช้ "เพ่ง" คือเนื้อข้อความ + quote + ป้ายระบบตอบ ไม่ใช่ avatar/ปุ่ม hover */}
                    <div data-message-bubble className="relative min-w-0 max-w-96 break-words">
                      {mExt.autoReplyKind && (
                        <AutoReplyTag isTest={mExt.autoReplyKind === 'AUTO_TEST'} trace={m.autoReply ?? null} />
                      )}
                      {/* reply quote (feature 00018 Phase 3) — กล่องจาง ๆ เยื้องเหนือบับเบิล ให้เห็นชัดว่าเป็น
                          quote คนละก้อนกับข้อความตอบ (user report 2026-07-25: ดูยาก) */}
                      {mExt.replyTo && (
                        <div className={`mb-1 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className="border-default-300 bg-default-100/70 max-w-full rounded-lg border-s-2 px-2.5 py-1">
                            <p className="text-default-700 mb-0 text-2xs font-medium">
                              ตอบกลับ{mExt.replyTo.senderRole === 'SHOP' ? 'ข้อความของร้าน' : buyerName}
                            </p>
                            <p className="text-default-700 mb-0 line-clamp-2 text-xs opacity-90">
                              {mExt.replyTo.body ?? '[สื่อ/ไฟล์แนบ]'}
                            </p>
                            {/* bugfix 2026-08-10 — quotable=false: ข้อความเป้าหมายไม่มี quoteToken (ข้อความ
                                เก่าก่อนระบบเก็บ token/สื่อที่ LINE ไม่คืน token ให้) จึงถอยไปส่งแบบไม่อ้างอิง
                                (ส่งได้ตามปกติ ไม่ใช่ error) — เดิมถอยเงียบสนิท ผู้ขายเห็นกล่อง quote นี้แล้ว
                                เข้าใจว่าลูกค้าเห็นแบบเดียวกัน ทั้งที่ในแอป LINE มาเป็นข้อความธรรมดา
                                Base: theme/paces .../ChatPage.tsx:72-74 (icon+text meta line, text-xs) —
                                ตัดสินด้วย shouldWarnQuoteUnavailable (lib/chat-quote-availability.ts) ไม่ใช่
                                เทอร์นารีตรงนี้ (docs/conventions/ui-boolean-needs-a-testable-home.md) */}
                            {shouldWarnQuoteUnavailable({ channel, quotable: mExt.replyTo.quotable, carrierIsShop: mine }) && (
                              <p className="text-default-500 mb-0 mt-1 flex items-center gap-1 text-xs">
                                <Icon icon="info-circle" className="text-xs" aria-hidden="true" />
                                ลูกค้าไม่เห็นว่าข้อความนี้ตอบข้อความไหน
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {/* รูปล้วน (IMAGE ไม่มี caption เช่น sticker/thumbs-up) → ไม่มีกรอบ bubble/bg/padding
                          user: "ทำไมถึงมี border อยากให้เป็น icon ไม่ต้องมี background" — รูป/สติกเกอร์
                          มีสี+รูปทรงในตัวอยู่แล้ว กรอบทำให้ดูเป็นกล่องรูป; รูปที่มี caption หรือ text/
                          PRODUCT ยังคงกรอบ bubble ไว้ (bg-light คงที่สำหรับ PRODUCT ตาม BR-CTX-05) */}
                      {(() => {
                        // unsend (Phase 3): ผู้ส่งลบข้อความ → แสดง "ข้อความถูกลบ" จาง ๆ แทนเนื้อหา (ที่ถูกล้างแล้ว)
                        if (m.isDeleted) {
                          return (
                            <div className={`rounded px-6 py-3 ${mine ? 'bg-primary/15' : 'bg-light'}`}>
                              <p className="text-default-700 mb-0 flex items-center gap-1 text-sm italic">
                                <Icon icon="ban" className="text-sm" />
                                ข้อความถูกลบ
                              </p>
                            </div>
                          )
                        }
                        // รูป/วิดีโอล้วน (ไม่มี caption) → ไม่มีกรอบ bubble (มีสี+รูปทรงในตัว); เสียง/ไฟล์คงกรอบ
                        // ORDER = การ์ด self-contained เช่นกัน (มีกรอบ/สีในตัว) → ไม่ต้องกรอบ bubble ครอบ
                        // การ์ดคำขอชำระเงินของ Meta มาเป็น TEXT "฿400.00 order" — self-contained เหมือน ORDER
                        const metaOrder = m.type === 'TEXT' ? parseMetaOrderCard(m.body) : null
                        // การ์ดสินค้าแบบ carousel จาก Facebook (2026-08-09) — self-contained เหมือน
                        // ORDER/metaOrder (มีกรอบ/สีในตัวการ์ดแต่ละใบแล้ว) ไม่ต้องกรอบ bubble ครอบซ้ำ
                        const genericCards = hasGenericCards ? m.cards! : null
                        // การ์ดสินค้าหลายชิ้น (ส่วนขยาย 2026-08-11) — มีตั้งแต่ 2 ใบขึ้นไปเท่านั้น
                        // ใบเดียวยังเป็น ProductCardBubble เดิมทุกประการ (ไม่มี "carousel ใบเดียว"
                        // ให้ผู้ขายงงว่าทำไมบางทีมีลูกศรเลื่อนบางทีไม่มี)
                        const ownProductCards =
                          m.type === 'PRODUCT' && (m.productCards?.length ?? 0) > 1 ? m.productCards! : null
                        const bareImage =
                          m.type === 'ORDER' ||
                          !!metaOrder ||
                          !!genericCards ||
                          !!ownProductCards ||
                          ((m.type === 'IMAGE' || m.type === 'VIDEO') && m.imageUrl && !m.body)
                        return (
                          <div className={bareImage ? '' : `rounded px-6 py-3 ${m.type === 'PRODUCT' ? 'bg-light' : mine ? 'bg-primary text-white' : 'bg-light'}`}>
                        {m.type === 'ORDER' ? (
                          <OrderCardBubble card={m.orderCard ?? null} onEdit={openEditOrder} />
                        ) : metaOrder ? (
                          <MetaOrderCardBubble amount={metaOrder.amount} status={metaOrder.status} />
                        ) : genericCards ? (
                          <MetaGenericCardCarousel
                            cards={genericCards}
                            messageId={m.id}
                            onOpenImage={(i) => setLightboxIndex(slideIndexByMessageId.get(`${m.id}:${i}`) ?? -1)}
                          />
                        ) : ownProductCards ? (
                          <OwnProductCardCarousel cards={ownProductCards} username={shopUsername} messageId={m.id} />
                        ) : m.type === 'PRODUCT' ? (
                          <ProductCardBubble card={m.productCard ?? null} username={shopUsername} />
                        ) : (
                          <>
                            {m.type === 'IMAGE' && m.imageUrl && (
                              <ChatImageMessage
                                storageKey={m.imageUrl}
                                isStickerHint={m.isSticker}
                                onOpen={() => setLightboxIndex(slideIndexByMessageId.get(m.id) ?? -1)}
                              />
                            )}
                            {/* feature 00018 — ไฟล์แนบช่องทางนอก (วิดีโอ/เสียง/ไฟล์) mirror มาแล้ว serve ผ่าน /api/files */}
                            {m.type === 'VIDEO' && m.imageUrl && (
                              <>
                                <video src={mediaSrc(m.imageUrl)} controls className="chat-media max-w-60 rounded" />
                                <MediaDownloadLink storageKey={m.imageUrl} label="บันทึกวิดีโอ" attachmentName={m.attachmentName} />
                              </>
                            )}
                            {m.type === 'AUDIO' && m.imageUrl && (
                              <>
                                <audio src={mediaSrc(m.imageUrl)} controls className="max-w-60" />
                                <MediaDownloadLink storageKey={m.imageUrl} label="บันทึกไฟล์เสียง" attachmentName={m.attachmentName} />
                              </>
                            )}
                            {/* บับเบิลไฟล์ — เดิมเป็นลิงก์ "เปิดไฟล์แนบ" ตายตัว ซึ่งบอกไม่ได้เลยว่าเป็นไฟล์อะไร
                                ตอนที่ไฟล์แนบมีแต่ของที่ mirror มาจาก Meta (ไม่มีชื่อ) ยังพอรับได้ แต่พอร้าน
                                ส่งเอกสารเองได้แล้ว "ใบเสนอราคา-สมชาย.pdf · 1.2 MB" คือข้อมูลที่ต้องเห็น */}
                            {m.type === 'FILE' && m.imageUrl && (
                              <a
                                href={`/api/files/${m.imageUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex max-w-60 items-center gap-2.5 rounded-lg border p-2.5 ${
                                  mine ? 'border-white/30 bg-white/10' : 'border-default-300 bg-default-50'
                                }`}
                              >
                                <span
                                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                                    mine ? 'bg-white/20 text-white' : ATTACHMENT_ICON.FILE.cls
                                  }`}
                                >
                                  <Icon icon={ATTACHMENT_ICON.FILE.icon} className="text-lg" />
                                </span>
                                <span className="min-w-0">
                                  <span className={`block truncate text-sm font-medium ${mine ? 'text-white' : 'text-default-800'}`}>
                                    {attachmentDisplayName(m.imageUrl, m.attachmentName)}
                                  </span>
                                  <span className={`mt-0.5 block text-xs ${mine ? 'text-white/75' : 'text-default-700'}`}>
                                    {[formatAttachmentSize(m.attachmentSize), 'เปิดไฟล์'].filter(Boolean).join(' · ')}
                                  </span>
                                </span>
                              </a>
                            )}
                            {m.type === 'FILE' && m.imageUrl && (
                              <MediaDownloadLink storageKey={m.imageUrl} attachmentName={m.attachmentName} />
                            )}
                            {m.body && (
                              // whitespace-pre-wrap: คงการเว้นบรรทัด (\n) ที่ลูกค้า/เพจพิมพ์มา — ไม่งั้น
                              // เบราว์เซอร์ยุบเป็นช่องว่างเดียว เลข list/ย่อหน้าติดกันเป็นพรืดอ่านยาก
                              // (เดียวกับ note ใน CustomerCrmSection ที่ใช้ pattern นี้อยู่แล้ว)
                              <p className={`text-sm whitespace-pre-wrap ${mine ? 'text-white' : 'text-default-800'} ${m.type === 'IMAGE' ? 'mt-2' : ''} mb-0`}>
                                {m.body}
                              </p>
                            )}
                            {/* กันบับเบิลว่าง (ข้อมูลเก่า/ข้อความไม่รองรับที่ body ว่าง) — แสดง placeholder จาง ๆ
                                (อยู่ใน branch non-PRODUCT แล้ว จึงเช็คแค่ body/imageUrl ว่าง) */}
                            {!m.body && !m.imageUrl && (
                              <p className="text-default-700 mb-0 text-sm italic">ข้อความไม่รองรับ — เปิดดูใน Messenger</p>
                            )}
                            {/* extension #3 Scam-link Detection (FR-SCAM-04/06) — warning banner เฉพาะ
                                TEXT ที่ flaggedScam=true (BR-SCAM-04 scan เฉพาะ TEXT); WARN เท่านั้น
                                ไม่ block ส่ง (FR-SCAM-05); token bg-warning/15 text-warning (HR7 ไม่ arbitrary) */}
                            {m.type === 'TEXT' && m.flaggedScam && (
                              <div className="bg-warning/15 text-warning mt-2 flex items-start gap-1.5 rounded px-2 py-1 text-2xs">
                                <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-sm" />
                                <span>ข้อความนี้มีลิงก์ที่ควรระวัง — อย่าโอนเงินหรือให้รหัส OTP กับคนที่ไม่รู้จัก</span>
                              </div>
                            )}
                            {/* feature 00023 — ป้าย "ระบบตอบ" ย้ายออกจากบับเบิลไปเกยขอบบนแล้ว
                                (user 2026-07-31) ดู AutoReplyTag ที่ต้นคอลัมน์ข้อความ */}
                          </>
                        )}
                          </div>
                        )
                      })()}
                      {/* reaction (feature 00018 Phase 2, message_reactions) — emoji ที่ react บนข้อความนี้
                          ชิปเล็ก ๆ เกยขอบล่างบับเบิล (FB-style); ฝั่งเรา justify-end, ฝั่งลูกค้า justify-start

                          withEmojiPresentation: Meta ส่งหัวใจมาเป็น U+2764 เปล่า ๆ ซึ่ง default เป็น
                          "ตัวหนังสือ" เบราว์เซอร์เลยวาดเป็นหัวใจดำเล็ก ๆ ไม่ใช่หัวใจแดงแบบใน Facebook
                          (user report 2026-08-03) — ต้องต่อ VS-16 ให้ก่อน ดู lib/emoji-presentation
                          text-sm + leading-none: ขนาดใกล้ชิปรีแอ็กชันของ Messenger จริง (12px เล็กไป) */}
                      {m.reactionEmoji && (
                        <div className={`-mt-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <span className="bg-card border-default-200 rounded-full border px-1.5 py-1 text-sm leading-none shadow-sm">
                            {withEmojiPresentation(m.reactionEmoji)}
                          </span>
                        </div>
                      )}
                      {/* meta row (user request 2026-07-23): เวลาเป็นกลุ่ม (ท้าย burst, ไม่ทุกข้อความ) +
                          avatar เพจ/ร้าน ย้ายมาอยู่ใต้ข้อความ ขนาดเล็ก (size-5) + สถานะส่ง/อ่าน.
                          กำลังส่ง = ไม่มีเวลา; ข้อความล่าสุดซ่อนเวลาหลังส่งเกิน 1 นาที */}
                      {(showTime ||
                        m.edited || // ป้าย "แก้ไขแล้ว" ต้องโผล่แม้ข้อความนั้นไม่ได้อยู่ท้าย burst (ไม่มีแถวเวลา)
                        (mine &&
                          (atBurstEnd ||
                            m._status === 'sending' ||
                            failed ||
                            m.id === lastShopMsgId ||
                            m._status === 'sent'))) && (
                        <div className={`text-default-700 mt-1 flex flex-wrap items-center gap-1.5 text-xs ${mine ? 'justify-end' : ''}`}>
                          {/* ส่งไม่สำเร็จ — อยู่ "หน้าเวลา" (user สั่ง 2026-08-02) แทนกล่องแดงเต็มบรรทัด
                              ใต้บับเบิลแบบเดิม ซึ่งกินพื้นที่เท่าข้อความอีกอันทั้งที่เป็นสถานะของ
                              ข้อความที่อยู่ข้างบนมันเอง. รูปแบบ: [ส่งใหม่] ส่งไม่สำเร็จ (i) | ยกเลิก
                              เหตุผลเต็มย้ายไปอยู่ใน (i) — hover เห็น, แตะได้บนมือถือที่ไม่มี hover */}
                          {failed && (
                            <span className="text-danger flex items-center gap-1">
                              {/* user สั่ง 2026-08-03: ป้าย "ส่งไม่สำเร็จ" → "ลองใหม่" ให้เป็นคำสั่งที่กดได้
                                  รวมเข้ากับปุ่ม ↻ เป็นชิ้นเดียว (เดิมไอคอนกับคำแยกกัน กดได้แค่ไอคอนเล็ก ๆ)
                                  ยังคง "ส่งไม่สำเร็จ" ไว้เมื่อส่งซ้ำไม่ได้ — เขียน "ลองใหม่" ทั้งที่กดไม่ได้
                                  คือ UI โกหก (เช่น การ์ดออเดอร์ที่ประกอบ payload กลับไม่ได้) */}
                              {canRetryFailed ? (
                                <button
                                  type="button"
                                  onClick={retryFailed}
                                  title="ส่งข้อความนี้ใหม่"
                                  aria-label="ส่งข้อความนี้ใหม่"
                                  className="hover:bg-danger/10 -m-1 flex items-center gap-1 rounded p-1"
                                >
                                  <Icon icon="refresh" className="text-sm" />
                                  ลองใหม่
                                </button>
                              ) : (
                                <span>ส่งไม่สำเร็จ</span>
                              )}
                              {failReason && (
                                <button
                                  type="button"
                                  title={failReason}
                                  aria-label={`สาเหตุ: ${failReason}`}
                                  onClick={() =>
                                    Swal.fire({
                                      buttonsStyling: false,
                                      icon: 'info',
                                      title: 'ส่งข้อความไม่สำเร็จ',
                                      text: failReason,
                                      confirmButtonText: 'เข้าใจแล้ว',
                                      customClass: {
                                        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2',
                                      },
                                    })
                                  }
                                  className="hover:bg-danger/10 -m-1 flex items-center rounded p-1"
                                >
                                  <Icon icon="info-circle" className="text-sm" />
                                </button>
                              )}
                              <span className="text-default-300" aria-hidden="true">
                                |
                              </span>
                              <button
                                type="button"
                                onClick={cancelFailed}
                                // คำสั้น (user สั่ง 2026-08-03) — บริบทอยู่ครบแล้วจากบับเบิลที่มันเกาะอยู่
                                // ส่วนคำเต็มยังอยู่ใน aria-label + หัวข้อ Swal ตอนยืนยัน
                                aria-label="ยกเลิกการส่งข้อความนี้"
                                className="hover:underline"
                              >
                                ยกเลิก
                              </button>
                            </span>
                          )}
                          {/* ลูกค้าแก้ข้อความนี้ทีหลัง (message_edits, 2026-08-03) — ต้องบอกให้รู้
                              เพราะร้านอาจอ่าน/คุยกับเวอร์ชันก่อนแก้ไปแล้ว (ที่อยู่/จำนวน/เบอร์
                              เปลี่ยนได้ทั้งนั้น) เนื้อความที่แสดงคือของใหม่เสมอ */}
                          {m.edited && <span className="text-default-600">แก้ไขแล้ว</span>}
                          {showTime && (
                            <span className="flex items-center gap-1" title={formatTime(m.createdAt)}>
                              <Icon icon="clock" />
                              {formatTimeHM(m.createdAt)}
                            </span>
                          )}
                          {mine && m._status === 'sending' && (
                            <span className="flex items-center gap-1">
                              <Icon icon="loader-2" className="animate-spin" />
                              กำลังส่ง
                            </span>
                          )}
                          {/* !failed: บับเบิลที่ยิงไม่ออกเคยขึ้น "ส่งแล้ว" ควบคู่กับแถบแดง เพราะเงื่อนไข
                              เดิมดูแค่ _status (undefined สำหรับแถวที่บันทึกแล้ว) ไม่ได้ดู deliveryStatus */}
                          {/* บันได 3 ขั้นของข้อความที่ส่งสำเร็จ (2026-08-05):
                                อ่านแล้ว   — ลูกค้าเปิดอ่านจริง (message_reads) เขียวขั้นเดียวในบันไดนี้
                                ได้รับแล้ว — Meta ยืนยันว่าถึงเครื่องลูกค้า (message_deliveries) สีปกติ
                                ส่งแล้ว    — Meta รับคำสั่งแล้ว (ตอบ mid) แต่ยังไม่มีหลักฐานว่าถึง
                              เขียวสงวนไว้ให้ "อ่านแล้ว" ตัวเดียวตาม Verified-Means-Green — "ได้รับแล้ว"
                              เป็นสถานะระหว่างทาง ไม่ใช่สัญญาณความน่าเชื่อถือระดับเดียวกัน (ux 2026-08-05)
                              เธรด Instagram ไม่มีขั้นกลาง (deliveredAtMs=0 เสมอ) ข้ามไปที่อ่านแล้วเลย */}
                          {mine && m._status !== 'sending' && !failed && m.id === lastShopMsgId ? (
                            readAtMs > 0 && new Date(m.createdAt).getTime() <= readAtMs ? (
                              <span className="text-success flex items-center gap-0.5">
                                <Icon icon="checks" /> อ่านแล้ว
                              </span>
                            ) : deliveredAtMs > 0 && new Date(m.createdAt).getTime() <= deliveredAtMs ? (
                              <span className="flex items-center gap-0.5">
                                <Icon icon="checks" /> ได้รับแล้ว
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5">
                                <Icon icon="check" /> ส่งแล้ว
                              </span>
                            )
                          ) : (
                            mine && m._status === 'sent' && <Icon icon="check" className="text-success" />
                          )}
                          {/* avatar เพจ/ร้าน = ตัวสุดท้ายของแถวเสมอ (user สั่ง 2026-07-23: "เวลาต้อง
                              อยู่ด้านซ้าย และ icon page อยู่ชิดขวาเสมอ") — แถวนี้ justify-end อยู่แล้ว
                              พอ avatar เป็น child สุดท้ายจึงชิดขอบขวาของคอลัมน์ข้อความ ส่วนเวลา/สถานะ
                              ไหลไปทางซ้ายของมัน (เดิม avatar เป็น child ตัวแรก = ไปอยู่ซ้ายสุดของกลุ่ม) */}
                          {/* ใครเป็นคนตอบ (user สั่ง 2026-08-02) — ร้านที่มีพนักงานหลายคนย้อนดู
                              ไม่ได้เลยว่าใครตอบข้อความไหน เพราะทุกบับเบิลใช้โลโก้เพจเหมือนกันหมด
                                m.sender มีค่า  → รูปคนนั้น (ไม่มีรูป = ไอคอนคน placeholder) + ชื่อตอน hover
                                m.sender = null → ข้อความมาทาง webhook/บอท ไม่มี "คน" ให้แสดง → รูปเพจตามเดิม */}
                          {mine &&
                            atBurstEnd &&
                            (m.sender ? (
                              <span title={m.sender.name}>
                                <ChatAvatar
                                  avatar={m.sender.avatar}
                                  name={m.sender.name}
                                  size="size-5"
                                  fallback={
                                    <span className="bg-default-200 text-default-600 flex size-5 shrink-0 items-center justify-center rounded-full">
                                      <Icon icon="user" className="size-3" />
                                    </span>
                                  }
                                />
                                <span className="sr-only">ส่งโดย {m.sender.name}</span>
                              </span>
                            ) : (
                              <ChatAvatar
                                avatar={shopAvatar}
                                name={buyerName}
                                size="size-5"
                                fallback={
                                  <span className="bg-primary flex size-5 shrink-0 items-center justify-center rounded-full text-white">
                                    <Icon icon="building-store" className="size-3" />
                                  </span>
                                }
                              />
                            ))}
                        </div>
                      )}
                    </div>
                    {!mine && actionCluster}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
      </div>

      {/* composer — pattern ChatPage.tsx:99-109 + auto-upload preview chip
          relative: ยึดตำแหน่งแผง AI (absolute bottom-full) ให้ลอยเหนือ composer */}
      <div className="border-t border-default-300 border-dashed relative px-4 py-3 sm:px-6 sm:py-3.75">
        {showAiTakeoverComposer ? (
          /**
           * composer replacement block (feature "เธรดที่ Meta AI ถือสิทธิ์คุมอยู่" 2026-08-08)
           * แทนที่ "ทั้งแถบเครื่องมือ + textarea" ไม่ใช่ dim/disable — ต่างจาก tokenInvalid
           * (composerDisabled): เคสนั้นคือ "ระบบพัง รอแก้" ส่วนเคสนี้คือ "มีคนอื่น (AI ของ Meta)
           * กำลังทำงานแทนอยู่" ถ้าโชว์ปุ่ม 6 ปุ่มที่กดไม่ได้ ผู้ใช้จะอ่านเป็น "ระบบพัง" ผิดความหมาย
           *
           * Base: BotPausedBanner.tsx บรรทัด ~100-126 (กล่อง bg-{tone}/15 + ปุ่ม bg-card min-h-11
           * shrink-0 sm:min-h-0) — เปลี่ยน tone warning→info (สถานะนี้ไม่ใช่ "พัง"), ไอคอน
           * robot-off→robot (ห้าม sparkles — ผูกกับ DeepAI ของเราเองไปแล้ว)
           *
           * flex-col items-center text-center sm:flex-row sm:text-start: rail แชทเดสก์ท็อป
           * (แคบกว่า 640px) ต้องได้ผังแนวตั้งเหมือนมือถือ ไม่ใช่บีบทุกอย่างอยู่แถวเดียว
           */
          /* min-h-24 + justify-center: กล่องนี้แทนที่ "แถบเครื่องมือ + textarea" ซึ่งสูงราว 92px
             (ปุ่ม btn-icon ~40 + gap + textarea min-h-11) ถ้าปล่อยให้สูงตามเนื้อหา (~48px)
             พื้นที่ท้ายเธรดจะยุบลงครึ่งหนึ่งแล้วเลย์เอาต์กระโดดทุกครั้งที่สลับสถานะ
             (user report prod 2026-08-09: "พื้นที่มันไม่เท่า panel เดิม มันเล็กลงมาก")
             24 = 6rem เป็นค่าใน scale ปกติของ Tailwind ไม่ใช่ arbitrary value (HR7) */
          <div className="bg-info/15 text-info flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg px-3 py-2 text-center text-sm sm:flex-row sm:items-center sm:text-start">
            <Icon icon="robot" className="shrink-0 text-lg" aria-hidden="true" />
            <span className="min-w-0 flex-1">ตอนนี้ Meta AI กำลังตอบลูกค้าในแชทนี้อยู่</span>
            <button
              type="button"
              onClick={confirmTakeOverFromAi}
              className="btn btn-sm bg-card text-default-700 min-h-11 shrink-0 sm:min-h-0"
            >
              ตอบเอง
            </button>
          </div>
        ) : (
          <>
        {/* แผงเหนือช่องพิมพ์ — เปิดได้ทีละแผงเท่านั้น (activePanel) จึงไม่มีทางกางซ้อนกัน
            ทั้งสามใช้โครง/สไตล์เดียวกัน ต่างแค่ accent (AI = success, สำเร็จรูป = primary,
            เลือกสินค้า = info) */}
        {aiOpen && (
          <AiSuggestPanel
            conversationId={conversationId}
            hidePayments={hidePayments}
            onPick={(t) => {
              setText(t)
              setActivePanel(null)
            }}
            onClose={() => setActivePanel(null)}
          />
        )}

        {/* แผงข้อความสำเร็จรูปย้ายไปวางทับพื้นที่ข้อความด้านบนแล้ว (ดู relative wrapper) —
            ไม่ได้อยู่เหนือ composer เหมือนแผง AI/สินค้าอีกต่อไป */}

        {productOpen && (
          <ProductPickerPanel
            onPick={handleProductPick}
            disabled={composerDisabled}
            onClose={() => setActivePanel(null)}
            onOpenMultiSelect={() => setMultiSelectOpen(true)}
          />
        )}

        {/* ชีตเลือกหลายชิ้น — ส่งสำเร็จแล้วปิดทั้งชีตและแผงเลือกสินค้า (เหมือนโหมด "ส่งการ์ดสินค้า"
            ใบเดียวที่ปิดแผงหลังส่ง) · ส่งไม่สำเร็จ = ชีตเปิดค้าง ของที่เลือกยังอยู่ครบ กดใหม่ได้ทันที */}
        {productOpen && multiSelectOpen && (
          <ProductMultiSelectSheet
            channel={channel}
            disabled={composerDisabled}
            onSend={async (ids) => {
              const ok = await sendProductCards(ids)
              if (ok) setActivePanel(null)
              return ok
            }}
            onClose={() => setMultiSelectOpen(false)}
          />
        )}

        {/* layout ตามที่ user สั่ง 2026-07-23 (ref 12Tees — HR6: เอาโครงจาก ref, skin เป็น Paces):
              [ แผง AI ]
              [ แถวปุ่มเครื่องมือ ]
              [ ช่องพิมพ์ ][ ปุ่มส่ง ]
            เดิมทุกอย่างอยู่แถวเดียวกันหมด (ปุ่ม 4 ตัว + input + ส่ง) — บนมือถือ/rail แคบ ๆ ช่องพิมพ์
            ถูกบีบจนพิมพ์ยาว ๆ ไม่เห็นข้อความตัวเอง แยกแถวแล้วช่องพิมพ์ได้ความกว้างเต็ม

            งบพื้นที่ที่ 320px: container หลัง px-4 = 288px, ปุ่มไอคอน 6 ตัว (37px) + gap = 242px
            เหลือ 46px — ไม่พอสำหรับปุ่มสร้างออเดอร์ที่มีข้อความกำกับ. รอบแรก (2026-08-07 บ่าย) แก้
            ด้วยเมนู "เครื่องมือเพิ่มเติม" ⋯ ที่เก็บ เลือกสินค้า/อิโมจิ/สติกเกอร์/AI ไว้ข้างใน แต่ user
            ปฏิเสธทันทีที่เห็น ("ไม่ชอบการที่เอา shortcut ไปซ่อนไว้ อยากให้เอาคำว่า สร้างคำสั่งซื้อออกแทน")
            → เมนูนั้นถูกถอดทิ้งทั้งก้อน เครื่องมือทุกตัวกลับมาเห็นครบทุก breakpoint และปุ่มสร้างออเดอร์
            ยุบเหลือไอคอน (ตัวสุดท้ายของแถว) — ทางลัดที่หาไม่เจอ แพงกว่าป้ายที่หายไป */}
        {/* flex-wrap: worst case (ร้านคิวงาน + ช่องทางที่ส่งสติกเกอร์ได้) = 8 ปุ่ม ≈ 324px ซึ่งเกิน
            288px ที่เหลือหลัง px-4 บนจอ 320px → ปุ่มสร้างออเดอร์ (ms-auto) ตกลงบรรทัดสองแล้วชิดขวา
            ในบรรทัดตัวเอง กรณีอื่นยังเป็นแถวเดียวเหมือนเดิมทุกประการ

            ไม่ใช้เมนู "⋯" เก็บปุ่มที่เกิน — user ปฏิเสธไปแล้ว 2026-08-07 ("ไม่ชอบการที่เอา
            shortcut ไปซ่อนไว้") · precedent ของ flex-wrap อยู่ที่ OrdersTable.tsx toolbar
            ซึ่งแก้ปัญหาคลาสเดียวกันเป๊ะ

            wrap ไม่ย้ายจุดยึดของแผงอิโมจิ/สติกเกอร์ — แผงพวกนั้นเป็น absolute ที่ยึดกับ
            `div.relative` ของ *ปุ่มตัวเอง* ไม่ใช่ยึดกับแถว (เหตุผลเต็มอยู่ที่ปุ่มสติกเกอร์) */}
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {/* ข้อความสำเร็จรูป — ปุ่มสายฟ้าซ้ายสุดตาม ref; กดแล้วแถบ pill ค่อยกางออกด้านบน */}
          <button
            type="button"
            onClick={() => togglePanel('quick')}
            disabled={composerDisabled}
            aria-label="ข้อความสำเร็จรูป"
            aria-expanded={quickOpen}
            title="ข้อความสำเร็จรูป"
            className={`btn btn-icon hover:bg-primary/10 shrink-0 ${quickOpen ? 'bg-primary/10 text-primary' : 'text-default-600'} ${composerDisabled ? 'pointer-events-none opacity-50' : ''}`}
          >
            <Icon icon="bolt" className="text-lg" />
          </button>

          {/* เลือกสินค้า (composer improvement #4, user สั่ง 2026-07-23) — ไอคอน package ที่ user
              เลือกเอง (ไม่ซ้ำกับ shopping-cart ที่เป็นแท็บ "คำสั่งซื้อ" ในแผงขวา) */}
          <button
            type="button"
            onClick={() => togglePanel('product')}
            disabled={composerDisabled}
            aria-label="เลือกสินค้า"
            aria-expanded={productOpen}
            title="เลือกสินค้า"
            // เห็นทุก breakpoint (user สั่ง 2026-08-07 "ไม่ชอบการที่เอา shortcut ไปซ่อนไว้") — เมนู
            // "เพิ่มเติม" ที่เคยเก็บปุ่มพวกนี้ไว้ <768px ถูกถอดทิ้งแล้ว. ที่ว่างมาจากปุ่มสร้างออเดอร์
            // ที่ยุบเหลือไอคอนแทน (ดูปุ่มท้ายแถว) ไม่ใช่จากการซ่อนเครื่องมือ
            className={`btn btn-icon hover:bg-info/10 shrink-0 ${productOpen ? 'bg-info/10 text-info' : 'text-default-600'} ${composerDisabled ? 'pointer-events-none opacity-50' : ''}`}
          >
            <Icon icon="package" className="text-lg" />
          </button>

          {/* แนบไฟล์ — multiple + ทุกชนิด (user สั่ง 2026-08-02) เดิมทีละ 1 ไฟล์ เฉพาะ jpg/png/webp
              ไม่ใส่ accept เลยโดยตั้งใจ (ไม่ใช่ accept แบบ wildcard) — Safari บางเวอร์ชันตีความ
              wildcard แล้วซ่อนไฟล์บางชนิดในกล่องเลือก. กฎว่าอะไรส่งได้อยู่ที่ lib/chat-attachment.ts
              ซึ่งบังคับทั้งฝั่ง client (ก่อนอัปโหลด) และ /api/chat/upload (ตัวจริง) */}
          {/* 🛑 ชื่อสำหรับ AT ต้องอยู่บน `<input>` ไม่ใช่บน `<label>` — `<label>` ไม่มี role ของ
              ตัวเอง กลไกปกติของมันคือ "ตั้งชื่อให้ control ที่มันครอบ" ไม่ใช่ตั้งชื่อตัวเอง และ
              label ใบนี้ไม่มีข้อความข้างในเลย (มีแต่ไอคอน) ตัว input จึงเคยไม่มีชื่อ
              — docs/conventions/aria-name-requires-supporting-role.md */}
          <label
            className={`btn btn-icon text-default-600 hover:bg-default-100 shrink-0 ${attachDisabled || composerDisabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
            title="แนบไฟล์ (เลือกหลายไฟล์พร้อมกันได้)"
          >
            <input
              type="file"
              multiple
              aria-label={attachDisabled ? 'ยังไม่รองรับการแนบไฟล์ในช่องทางนี้' : 'แนบไฟล์'}
              className="hidden"
              onChange={handleFileChange}
              disabled={attachDisabled || composerDisabled || uploading || sending}
            />
            <Icon icon={uploading ? 'loader-2' : 'paperclip'} className={`text-lg ${uploading ? 'animate-spin' : ''}`} />
          </label>

          {/* ความคืบหน้าตอนแนบหลายไฟล์ — spinner เปล่าบอกได้แค่ "กำลังทำอะไรอยู่" ซึ่งไม่พอเมื่อคิว
              มี 8 ไฟล์และแต่ละไฟล์ใช้เวลาไม่เท่ากัน (ร้านจะไม่รู้ว่าค้างหรือกำลังไป) */}
          {uploadProgress && uploadProgress.total > 1 && (
            <span className="text-default-700 shrink-0 text-xs" aria-live="polite">
              กำลังอัปโหลด {uploadProgress.done + 1}/{uploadProgress.total}
            </span>
          )}

          {/* composer improvement #1 — ปุ่ม emoji + popover (emoji เป็น Unicode text ธรรมดา ส่งได้ทุก
              ช่องทางรวม Messenger/IG); disabled เฉพาะเมื่อส่งไม่ได้ (window ปิด/token ตาย) */}
          {/* กล่องนี้เป็น "จุดยึด" ของแผงอิโมจิ/สติกเกอร์ทั้งคู่ — ตัวกล่องต้องไม่ถูกซ่อนที่
              breakpoint ไหนเลย ไม่งั้นแผงที่ยึดกับมันจะหายไปด้วยตอนกดเปิด (แผงเป็น absolute ที่ยึด
              parent ตัวนี้ ไม่ใช่ portal)
              แผงอยู่ที่เดียว ไม่ทำ 2 ชุดตาม breakpoint — state เดียวกัน DOM เดียวกัน */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setEmojiOpen((v) => !v)}
              disabled={composerDisabled}
              aria-label="เลือกอิโมจิ"
              aria-expanded={emojiOpen}
              title="เลือกอิโมจิ"
              className={`btn btn-icon text-default-600 hover:bg-default-100 ${emojiOpen ? 'bg-default-100' : ''} ${composerDisabled ? 'pointer-events-none opacity-50' : ''}`}
            >
              <Icon icon="mood-smile" className="text-lg" />
            </button>

            {emojiOpen && (
              <EmojiPicker onSelect={(emoji) => setText((prev) => prev + emoji)} onClose={() => setEmojiOpen(false)} />
            )}
            {canSendSticker && stickerOpen && (
              <EmojiPicker
                mode="STICKER"
                stickerProvider={stickerProvider}
                onSelect={() => {}}
                onClose={() => setStickerOpen(false)}
                onSelectSticker={(sticker) => {
                  rememberRecentSticker(sticker, stickerProvider)
                  setStickerOpen(false)
                  void sendSticker(sticker)
                }}
              />
            )}
          </div>

          {/* ปุ่มสติกเกอร์แยกจากอิโมจิ (user สั่ง 2026-08-04) — เฉพาะ Messenger/Instagram/LINE (S-18b)
              เพราะ Graph ของแชทเราเอง (DEEP) ไม่มี sticker_id ให้ส่ง. relative ของตัวเอง = แผงยึดกับ
              ปุ่มนี้ ไม่ใช่ยึดกับแถวทั้งแถว (สาเหตุที่แผงเคย "เพี้ยน") */}
          {canSendSticker && (
            <button
              type="button"
              onClick={() => setStickerOpen((v) => !v)}
              disabled={composerDisabled}
              aria-label="ส่งสติกเกอร์"
              aria-expanded={stickerOpen}
              title="ส่งสติกเกอร์"
              className={`btn btn-icon text-default-600 hover:bg-default-100 shrink-0 ${stickerOpen ? 'bg-default-100' : ''} ${composerDisabled ? 'pointer-events-none opacity-50' : ''}`}
            >
              <Icon icon="sticker" className="text-lg" />
            </button>
          )}

          {/* composer improvement #3 — ปุ่ม AI ช่วยร่างคำตอบ (accent เขียว success ตาม ref) */}
          <button
            type="button"
            onClick={() => togglePanel('ai')}
            disabled={composerDisabled}
            aria-label="AI ช่วยร่างคำตอบ"
            aria-expanded={aiOpen}
            title="AI ช่วยร่างคำตอบ"
            className={`btn btn-icon hover:bg-success/10 shrink-0 ${aiOpen ? 'bg-success/10 text-success' : 'text-success'} ${composerDisabled ? 'pointer-events-none opacity-50' : ''}`}
          >
            <Icon icon="sparkles" className="text-lg" />
          </button>

          {/* ดูตารางว่างคิวงาน (user สั่ง 2026-08-10) — เห็นทุก breakpoint เพราะไม่มีทางเข้าอื่น
              (ต่างจากปุ่มสร้างออเดอร์ที่ md:hidden เพราะ ≥768 มีปุ่มมีป้ายที่หัวเธรดอยู่แล้ว)

              ไม่ tint ค้าง (`text-default-600` เหมือนปุ่มข้อความสำเร็จรูป/เลือกสินค้า) — แถวนี้มี
              accent อยู่แล้ว 2 ตัวคือ AI (success) กับสร้างออเดอร์ (primary) การเพิ่มตัวที่สาม
              กระจายสีจนไม่มีอะไรเด่นจริง (One Voice) และปุ่มนี้เป็นทางลัด "ไปดู" ไม่ใช่การตัดสินใจ

              ไอคอน `calendar-plus` (user เคาะ 2026-08-10) — ไม่ใช้ calendar-event/calendar-check/
              calendar-mark เพราะทั้งสามถูกผูกความหมายไปแล้ว (สถานะนัด SCHEDULED/COMPLETED และ
              ไทล์ "นัดวันนี้" บนหน้าแรก)

              ขึ้นเฉพาะร้านที่ใช้ระบบคิวงานได้ **และมีคิวงานที่เปิดใช้อย่างน้อย 1 ใบ** —
              appointmentCtx เป็น null ทั้งกรณี "ใช้ไม่ได้" และ "ยังโหลดไม่เสร็จ" ซึ่งถูกทั้งคู่:
              ปุ่มที่กดแล้วเจอปฏิทินเปล่ายังไงก็ไม่มีประโยชน์ */}
          {appointmentCtx && (
            <button
              type="button"
              onClick={() => setApptSheetOpen(true)}
              aria-label="ดูตารางว่างคิวงาน"
              title="ดูตารางว่างคิวงาน"
              /* ปุ่มอื่นในแถวนี้เปิด "แผง" จึงใช้ aria-expanded — ตัวนี้เปิด dialog เต็มจอ
                 ซึ่งเป็นคนละสัญญาณ (ผู้ใช้ screen reader ต้องรู้ว่ากำลังจะออกจากบริบทนี้) */
              aria-haspopup="dialog"
              /* ไม่ผูกกับ composerDisabled ต่างจากปุ่มอื่นในแถว — ตัวนั้นแปลว่า "ส่งข้อความออกไป
                 ไม่ได้" (หน้าต่าง 24 ชม.ปิด / token ตาย) ซึ่งไม่เกี่ยวกับการเปิดดูตารางคิวหรือ
                 สร้างงานใหม่เลย · ปุ่มสร้างออเดอร์ท้ายแถวก็ไม่ได้ผูกด้วยเหตุผลเดียวกัน */
              className="btn btn-icon text-default-600 hover:bg-primary/10 shrink-0"
            >
              <Icon icon="calendar-plus" className="text-lg" />
            </button>
          )}

          {/* feature 00018 T5 — ทางเข้า Customer Panel ของมือถือ **ย้ายขึ้นหัวเธรดแล้ว** (user สั่ง
              2026-08-06) ไอคอนคนที่เคยอยู่ท้ายแถวนี้จึงถูกถอดออก ไม่ใช่ซ่อนด้วย breakpoint —
              ปุ่มเดียวกัน 2 ที่บนจอเดียวคือสิ่งที่ทำให้แถบนี้แน่นโดยไม่ได้อะไรเพิ่ม
              ms-auto ย้ายไปอยู่ที่ปุ่มสร้างออเดอร์ (ตัวสุดท้ายของแถวแล้ว) */}
          {/* สร้างออเดอร์ — มือถือเท่านั้น (user สั่ง 2026-08-04 "อยากให้กดสร้าง order ใน chat ไว ๆ")
              ตั้งแต่ 768px ขึ้นไปมีปุ่มมีป้าย "ข้อมูลลูกค้า" ที่หัวเธรด และ ≥1280px มีแผงขวาที่มี CTA
              อยู่แล้ว — ใส่ที่นี่ด้วยจะกลายเป็นปุ่มซ้ำ 2 ที่บนจอเดียว
              ms-auto ย้ายมาที่ปุ่มนี้ (เดิมอยู่ที่ไอคอนคน) ให้ทั้งคู่เกาะกลุ่มกันชิดขวา
              label/icon อ่านจาก VERTICAL_CTA ตัวเดียวกับแผงลูกค้า — ร้านบ้านพักจะได้ "เปิดการจอง"
              ทั้งสองที่ ไม่ใช่คำคนละคำ */}
          <button
            type="button"
            onClick={startCreateOrder}
            // ไอคอนเปล่า + tooltip/aria คำเต็ม (user สั่ง 2026-08-07): ที่ 320px แถวนี้มีที่พอสำหรับ
            // "เครื่องมือทุกตัวเห็นครบ" หรือ "ป้ายบนปุ่มนี้" อย่างใดอย่างหนึ่งเท่านั้น — user เลือก
            // เอาป้ายออกแทนการซ่อน shortcut ไว้ในเมนู ⋯ (ของที่ซ่อนไว้หาไม่เจอเหมือนกัน แต่แพงกว่า
            // เพราะกดเพิ่มอีกครั้งทุกครั้ง). ไอคอน cart-plus ยังต่างจากทุกตัวในแถวและติดสี primary
            aria-label={vocab.createLabel}
            title={vocab.createLabel}
            // สไตล์ต้องเป็นภาษาเดียวกับปุ่มอื่นในแถวนี้ (user report 2026-08-04 "ไม่เข้าพวกเลย"):
            // ทุกตัวคือ `btn btn-icon` พื้นใส สีบอกบทบาท แล้วค่อยติดสีตอน hover/active — AI ใช้
            // text-success, เลือกสินค้าใช้ text-info. ของเดิมเป็นพิลล์ทึบ bg-primary/15 ซึ่งเป็น
            // ภาษาของ "ปุ่มหลักในการ์ด" ไม่ใช่ของแถบเครื่องมือ จึงเด่นผิดที่และดูเป็นของแปลกปลอม
            className="btn btn-icon text-primary hover:bg-primary/10 ms-auto shrink-0 md:hidden"
          >
            <Icon icon={VERTICAL_CTA[customerPanelData.vertical].icon} className="text-lg" />
          </button>
        </div>

        {/* แถวช่องพิมพ์ + ปุ่มส่ง — textarea (ไม่ใช่ input) เพราะต้อง "สูงขึ้นตอนโฟกัส" ตามที่สั่ง
            Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx:93
            (`<textarea rows className="form-textarea">`) — ต้องใช้ .form-textarea ไม่ใช่ .form-input
            เพราะ .form-input ล็อก h-9.25 + py-0 ไว้สำหรับบรรทัดเดียว ส่วน .form-textarea เป็น h-auto!
            (custom/_forms.css:56) จึงยืดได้จริง
            min-h-11 ปกติ (tap target 44px) → focus:min-h-20 (Tailwind scale ปกติ ไม่ใช่ arbitrary — HR7)
            resize-none: ห้ามลากขยายเอง (จะพัง layout การ์ด)
            เดสก์ท็อป: Enter = ส่ง, Shift+Enter = ขึ้นบรรทัดใหม่ (พฤติกรรมเดิมของ input ที่ต้องคงไว้)
            มือถือ/จอสัมผัส: Enter = ขึ้นบรรทัดใหม่เสมอ ส่งด้วยปุ่ม "ส่ง" (ไม่มี Shift ให้กดคู่)
            ปุ่มส่งอยู่ "ในกล่อง" มุมขวาล่าง (user request 2026-08-06) — เดิมอยู่นอกกล่องข้าง ๆ
            ซึ่งกินความกว้างของช่องพิมพ์ไปตลอด บนมือถือจึงเหลือที่พิมพ์แคบ */}
        {/* manual-override strip (feature "เธรดที่ Meta AI ถือสิทธิ์คุมอยู่" 2026-08-08) —
            โผล่หลังผู้ขายกดยืนยัน "ตอบเอง" แล้ว ไม่มีปุ่มปิด (หายเองเมื่อ aiAgentActive===false)
            Base: replyingTo preview bar ด้านล่าง (`border-{semantic} bg-{semantic}/5 border-s-2
            rounded-lg px-3 py-2`) — เปลี่ยน semantic primary→info, ไอคอน arrow-back-up→robot,
            เปลี่ยนปุ่ม x (ยกเลิก) เป็นลิงก์ออกไป Business Suite (เราสั่งให้ AI หยุดจริงไม่ได้ —
            เปิด AI กลับต้องทำที่ Business Suite ของเพจนั้นเอง) */}
        {showManualOverrideStrip && (
          <div className="border-info bg-info/5 mb-2 flex items-start gap-2 rounded-lg border-s-2 px-3 py-2">
            <Icon icon="robot" className="text-info mt-0.5 shrink-0 text-base" />
            <p className="text-info mb-0 min-w-0 grow text-xs font-semibold">กำลังตอบเองแทน AI ของ Meta</p>
            <a
              href="https://business.facebook.com/latest/inbox/all"
              target="_blank"
              rel="noopener noreferrer"
              className="text-info flex shrink-0 items-center gap-1 text-xs font-semibold hover:underline"
            >
              Business Suite
              <Icon icon="external-link" className="text-sm" />
            </a>
          </div>
        )}

        {/* reply/quote (user 2026-07-25) — แถบ preview ข้อความที่กำลังตอบทับ เหนือช่องพิมพ์ (เหมือน Messenger);
            แถบสี primary ด้านซ้าย + ปุ่มกากบาทยกเลิก */}
        {replyingTo && (
          <div className="border-primary bg-primary/5 mb-2 flex items-start gap-2 rounded-lg border-s-2 px-3 py-2">
            <Icon icon="arrow-back-up" className="text-primary mt-0.5 shrink-0 text-base" />
            <div className="min-w-0 grow">
              <p className="text-primary mb-0 text-2xs font-semibold">
                ตอบกลับ{replyingTo.senderRole === 'SHOP' ? 'ข้อความของร้าน' : buyerName}
              </p>
              <p className="text-default-600 mb-0 line-clamp-2 text-xs">
                {replyingTo.body ??
                  (replyingTo.type === 'IMAGE'
                    ? '[รูปภาพ]'
                    : replyingTo.type === 'ORDER'
                      ? `[${vocab.nounShort}]`
                      : replyingTo.type === 'PRODUCT'
                        ? '[สินค้า]'
                        : '[สื่อ/ไฟล์แนบ]')}
              </p>
              {/* bugfix 2026-08-10 — บอกก่อนกดส่ง ไม่ใช่แค่ตอนดูประวัติย้อนหลัง (safepay-ux: ข้อความ
                  ก่อนส่งไม่ใช่สิ่งที่คนกลับมาอ่าน แต่กันผู้ขายหลุดบริบทตอนพิมพ์ได้ทันที) — ข้อความนี้
                  (ที่กำลังจะตอบทับ) ไม่มี quoteToken จึงยังส่งได้ตามปกติ (ถอยไปแบบไม่อ้างอิงให้เอง)
                  แค่ลูกค้าจะไม่เห็นลิงก์อ้างอิง. Base: theme/paces .../ChatPage.tsx:72-74 (icon+text
                  meta line) — ตัดสินด้วย shouldWarnQuoteUnavailable ตัวเดียวกับกล่อง quote ในเธรด */}
              {shouldWarnQuoteUnavailable({
                channel,
                quotable: (replyingTo as ChatMessageWithDelivery).quotable,
                carrierIsShop: true,
              }) && (
                <p className="text-default-500 mb-0 mt-1 flex items-center gap-1 text-xs">
                  <Icon icon="info-circle" className="text-xs" aria-hidden="true" />
                  ส่งได้ตามปกติ แต่ลูกค้าจะไม่เห็นว่ากำลังตอบข้อความไหน
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              aria-label="ยกเลิกการตอบกลับ"
              className="text-default-700 hover:bg-default-100 hover:text-default-700 flex size-6 shrink-0 items-center justify-center rounded-full"
            >
              <Icon icon="x" className="text-sm" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          {/* ช่องพิมพ์แบบกล่องเดียว — รูปที่แนบแสดง "ในช่องพิมพ์" (user request 2026-07-23) ให้รู้สึกว่า
              รูปติดกับข้อความนี้ (เหมือน Messenger); textarea ข้างในไร้ขอบ (กล่องนอกเป็นคนวาดขอบ) แต่ยัง
              ยืดตอนโฟกัสได้เหมือนเดิม (min-h-11 → focus:min-h-20). border ของกล่อง = focus-within:border-primary */}
          <div
            className={`grow overflow-hidden rounded-lg border bg-light/20 ${
              composerDisabled ? 'border-default-300 opacity-60' : 'border-default-300 focus-within:border-primary'
            }`}
          >
            {/* แถบลากปรับความสูง (user request 2026-07-30) — อยู่บนสุดของกล่องเสมอ (เหนือคิวรูป)
                เพราะช่องพิมพ์อยู่ล่างจอ การขยายคือลากขึ้น. ไม่ใช้ resize-y ของเบราว์เซอร์: กล่องนี้
                overflow-hidden มุมลาก native (ขวาล่าง) จะโดนตัดหาย + native ทับ height ที่เราตั้ง
                ตามเนื้อหา ทำให้ auto-grow พังทันทีที่ลากครั้งแรก — ดู comment เต็มที่ useComposerHeight */}
            {!composerDisabled && (
              <div
                {...composerHandleProps}
                className={`group flex h-3 w-full cursor-row-resize touch-none items-center justify-center ${
                  composerDragging ? 'bg-default-200' : 'hover:bg-default-100'
                } focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-1`}
              >
                <span
                  className={`block h-0.5 w-8 rounded-full ${
                    composerDragging ? 'bg-primary' : 'bg-default-300 group-hover:bg-default-400'
                  }`}
                />
              </div>
            )}
            {/* คิวไฟล์ที่รอส่ง — หลายไฟล์ได้ (ข้อความสำเร็จรูปที่มีหลายรูป user 2026-07-23;
                ขยายเป็นทุกชนิดไฟล์ 2026-08-02) เลื่อนแนวนอนเมื่อเกินความกว้าง; ลบได้ทีละใบ
                แยก 2 หน้าตาตามชนิด: สื่อที่พรีวิวได้ = thumbnail, ไฟล์อื่น = ชิปชื่อ+ขนาด
                (เอกสารไม่มีอะไรให้ดู การโชว์กรอบเปล่าจึงบอกอะไรไม่ได้เลยว่าแนบอะไรไป) */}
            {pendingImages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto p-2 pb-0">
                {pendingImages.map((att, i) => {
                  const kind = pendingKind(att)
                  const label = att.name ?? `ไฟล์ที่ ${i + 1}`
                  return (
                    <div key={att.fileId} className="relative shrink-0">
                      {kind === 'IMAGE' && att.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={att.previewUrl} alt={label} className="max-h-28 rounded-lg object-contain" />
                      ) : kind === 'VIDEO' && att.previewUrl ? (
                        <video src={att.previewUrl} className="max-h-28 rounded-lg" muted playsInline />
                      ) : (
                        <div className="border-default-300 bg-default-50 flex h-28 w-52 items-center gap-2.5 rounded-lg border p-2.5 pe-8">
                          <span
                            className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${ATTACHMENT_ICON[kind].cls}`}
                          >
                            <Icon icon={ATTACHMENT_ICON[kind].icon} className="text-lg" />
                          </span>
                          <span className="min-w-0">
                            <span className="text-default-800 block truncate text-xs font-medium">{label}</span>
                            {formatAttachmentSize(att.size) && (
                              <span className="text-default-700 mt-0.5 block text-xs">
                                {formatAttachmentSize(att.size)}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(att.fileId)}
                        aria-label={`เอา ${label} ออก`}
                        className="absolute end-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                      >
                        <Icon icon="x" className="text-sm" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <textarea
              rows={1}
              // ความสูงถูกตั้งผ่าน ref ใน useComposerHeight (ต้อง "ยุบเป็น auto ก่อนวัด" ทุกครั้ง
              // ไม่งั้นช่องไม่หดกลับตอนลบข้อความ) — จึงไม่มี style prop / ไม่มี min-h ที่นี่
              ref={composerRef}
              className="block w-full resize-none border-0 bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-0"
              // (S-14b) ปิดเพราะโควตา ≠ ปิดเพราะการเชื่อมต่อพัง — ทางแก้คนละเรื่องกันคนละคน
              // ทำ ("รอรอบเดือน/ตอบในแอป LINE" vs "ไปเชื่อมช่องทางใหม่") ข้อความเดียวจึงบอกไม่ได้
              placeholder={
                composerDisabled
                  ? lineQuotaCaption?.blocking && !tokenInvalid
                    ? 'โควตาข้อความหมดแล้ว ส่งไม่ได้ตอนนี้'
                    : 'ส่งข้อความไม่ได้ในตอนนี้'
                  : pendingImages.length > 0
                    ? 'เพิ่มคำบรรยาย (ไม่บังคับ)'
                    : 'พิมพ์ข้อความ หรือวางไฟล์ที่นี่...'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={handlePaste} // วางรูปจากคลิปบอร์ด (screenshot/Line/Ctrl+C) → แนบเลย (user 2026-07-25)
              // enterKeyHint="enter" → คีย์บอร์ดมือถือขึ้นปุ่ม "ขึ้นบรรทัดใหม่" ไม่ใช่ "ส่ง"
              // ให้ป้ายบนปุ่มตรงกับสิ่งที่เกิดขึ้นจริงตาม handler ข้างล่าง
              enterKeyHint="enter"
              onKeyDown={(e) => {
                // Enter = ส่ง เฉพาะ "เดสก์ท็อป" เท่านั้น (user 2026-08-06)
                // บนจอสัมผัสไม่มีปุ่ม Shift ให้กดคู่ → กฎ Shift+Enter ขึ้นบรรทัดใหม่ใช้ไม่ได้เลย
                // ผู้ใช้จึงพิมพ์ข้อความหลายบรรทัดไม่ได้ กด Enter ทีไรข้อความหลุดออกไปทันที
                // บนมือถือปล่อยให้ textarea ขึ้นบรรทัดใหม่ตามปกติ — ส่งด้วยปุ่ม "ส่ง" ข้าง ๆ
                // เช็คในตัว handler ไม่ใช่ตอน render: อ่าน window ตอน render = hydration mismatch
                // (idiom เดียวกับ shareToDevice/MediaDownloadLink ในไฟล์นี้)
                const isTouch = window.matchMedia('(pointer: coarse)').matches
                // isComposing = กำลังเลือกคำจาก IME อยู่ Enter คือ "ยืนยันคำ" ไม่ใช่ "ส่ง"
                if (e.key === 'Enter' && !e.shiftKey && !isTouch && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={composerDisabled}
            />
            {/* ปุ่มส่ง — อยู่ในกล่องเดียวกับช่องพิมพ์ ชิดขวาล่าง (user request 2026-08-06)
                เป็น "แถวของตัวเอง" ใต้ textarea ไม่ใช่ absolute ทับมุม: absolute ต้องกัน
                พื้นที่ด้วย padding-end ที่ textarea ซึ่งกินความกว้างของ **ทุกบรรทัด** ทั้งที่
                บรรทัดล่างสุดบรรทัดเดียวที่ชนปุ่ม
                และต้องเป็นพี่น้องของ textarea ในกล่องนี้ ไม่ใช่ห่อ textarea เพิ่มอีกชั้น —
                useComposerHeight ใช้ `textarea.parentElement` เป็น "กล่องนอก" ทั้งตอนล็อก
                ความสูงระหว่างวัด (กันเธรดเด้งบน iOS) และตอน observe การโผล่/หายของคิวรูปแนบ */}
            {/* (S-14b · ปรับ 2026-08-10 ตาม user) สถานะโควตา/หน้าต่างฟรีของ LINE ย้ายจากแคปชัน
                ใต้ช่องพิมพ์ **เข้าไปอยู่บนปุ่มส่ง** — คำตอบไปอยู่ตรงที่นิ้วกำลังจะกดพอดี และคืน
                บรรทัดใต้ช่องพิมพ์ให้กล่องพิมพ์
                non-LINE ได้ className เดิมทุกตัวอักษร (lineQuotaCaption เป็น null เสมอ) */}
            <div className="flex justify-end px-2 pb-2">
              <button
                type="button"
                onClick={handleSend}
                disabled={composerDisabled || sending || uploading || (!text.trim() && pendingImages.length === 0)}
                // ตัวเลขบนปุ่มบอกแค่ "290/300" ซึ่งอ่านออกด้วยตาเพราะมีบริบทรอบตัว แต่ screen reader
                // อ่านทีละ element จะได้ "ส่ง 290/300" ที่ไม่มีทางรู้ว่าเป็นโควตา — ให้ชื่อที่เข้าถึงได้
                // เป็นประโยคเต็มแทน (ยังขึ้นต้นด้วย "ส่ง" ที่มองเห็น จึงไม่ผิด WCAG 2.5.3 Label in Name)
                aria-label={lineQuotaCaption ? `ส่ง — ${lineQuotaCaption.fullText}` : undefined}
                title={lineQuotaCaption?.fullText}
                // btn-sm + rounded-full = ทรงพิลล์เล็กตามภาพอ้างอิง (user 2026-08-06) — ทั้งคู่เป็น
                // primitive ของธีม (_buttons.css `.btn-sm`, Tailwind `rounded-full`) ไม่ใช่ arbitrary
                // ปุ่มเล็กลงได้เพราะย้ายเข้ามาในกล่องแล้ว: กล่องทั้งใบคือเป้าสายตาอยู่แล้ว
                // ปุ่มไม่ต้องแบกหน้าที่ "หาให้เจอ" เหมือนตอนลอยเดี่ยวข้างกล่อง
                className={`btn btn-sm bg-primary text-white hover:bg-primary-hover shrink-0 rounded-full disabled:opacity-60 ${
                  lineQuotaCaption ? QUOTA_BUTTON_RING_CLASS[lineQuotaCaption.tone] : ''
                }`}
              >
                ส่ง
                {lineQuotaCaption?.buttonSuffix && (
                  // font-normal + opacity ต่ำกว่าคำว่า "ส่ง" เล็กน้อย — ตัวเลขเป็นข้อมูลประกอบ
                  // ไม่ใช่ป้ายของปุ่ม ถ้าน้ำหนักเท่ากันปุ่มจะอ่านเหมือนมีสองคำสั่ง
                  //
                  // 🛑 aria-hidden โดยตั้งใจ: ตอนอยู่ในหน้าต่างฟรีข้อความนี้เปลี่ยนทุกวินาที
                  // ("ฟรี 45 วิ" → "ฟรี 44 วิ") ถ้าปล่อยให้เป็นส่วนหนึ่งของชื่อปุ่ม screen reader
                  // จะถูกรบกวนทุกวินาที — ความหมายทั้งหมดถูกยกไปไว้ใน aria-label ที่นิ่งแล้ว
                  // (ยังกดด้วยเสียงว่า "ส่ง" ได้ เพราะคำนั้นอยู่ทั้งในข้อความที่เห็นและในชื่อ)
                  <span aria-hidden="true" className="ms-1 font-normal opacity-90">
                    · {lineQuotaCaption.buttonSuffix}
                  </span>
                )}
                <Icon icon="send-2" className="ms-1 text-base" />
              </button>
            </div>
          </div>
        </div>
          </>
        )}
      </div>
    </div>

    {/* กดค้างบนข้อความ (มือถือ) → เบลอทั้งเธรด + ยกบับเบิลนั้นขึ้นมาพร้อมเมนู — ทางเข้าเดียวของ
        ตอบกลับ/คัดลอกบนจอสัมผัส เพราะปุ่มข้างบับเบิลเป็น lg:group-hover (desktop-only)
        ส่วนปุ่มหน้ายิ้มตอน hover บนเดสก์ท็อป (mode 'reactions') ยังเป็น popover เกาะปุ่ม ไม่เบลอจอ */}
    {actionTarget && (actionTargetActions.length > 0 || actionTargetReactions.length > 0) && (
      <MessageActionBubble
        anchor={
          actionTarget.mode === 'menu'
            ? {
                kind: 'bubble',
                bubble: actionTarget.bubble,
                mine: actionTarget.message.senderRole === 'SHOP',
              }
            : { kind: 'point', x: actionTarget.x, y: actionTarget.y }
        }
        actions={actionTargetActions}
        reactions={actionTargetReactions}
        // ปุ่ม + → แผงอิโมจิทั้งชุด (user สั่ง 2026-08-03) — ส่งเฉพาะเมื่อข้อความนั้นกดรีแอ็กชันได้จริง
        onPickCustomEmoji={
          actionTargetReactions.length > 0 && actionTarget.message
            ? (emoji) => void reactToMessage(actionTarget.message.id, emoji)
            : undefined
        }
        onClose={() => setActionTarget(null)}
      />
    )}

    {/* ปฏิทินตารางว่างคิวงาน (user สั่ง 2026-08-10) — ชีตตัวเดียวกับที่ฟอร์มสร้างออเดอร์ใช้
        โหมด "ภาพรวมทุกคิว" · กดยืนยันแล้วส่งวัน+เวลาเข้าโมดัลสร้างงานทันที (ลดขั้นตอน)

        resourceId ส่งไปด้วยเฉพาะตอนร้านมีคิวงานเปิดใช้ **ใบเดียว** — หลายคิวต้องปล่อยให้ช่อง
        "บริการ" ในฟอร์มว่างไว้ให้เห็นว่ายังต้องเลือก การเดาให้จะทำให้ผู้ขายเผลอบันทึกผิดคิว
        โดยไม่ทันสังเกต (กติกาเดียวกับที่ปฏิทิน /queues ประกาศไว้ตั้งแต่ feature 00024) */}
    {appointmentCtx && apptSheetOpen && (
      <AppointmentDateSheet
        open
        aggregateResources={appointmentCtx.resources}
        granularity={appointmentCtx.granularity}
        onClose={() => setApptSheetOpen(false)}
        onConfirm={(r) => {
          setApptSheetOpen(false)
          openDraft({
            conversationId,
            customerName: buyerName,
            channel,
            customerAvatar: buyerAvatar,
            pageAvatarUrl: channelAvatarUrl,
            appointmentPrefill: {
              date: r.date,
              startTime: r.startTime,
              endTime: r.endTime,
              resourceId:
                appointmentCtx.resources.length === 1 ? appointmentCtx.resources[0]!.id : undefined,
            },
          })
        }}
      />
    )}

    {/* feature 00018 T5 — sheet มือถือ/tablet (<1024px); ปุ่มเปิดอยู่ใน composer ด้านบน */}
    {sheetOpen && (
      <CustomerPanelSheet data={customerPanelData} onClose={() => setSheetOpen(false)} />
    )}

    {/* ดูรูปเต็มจอ — Base Gallery.tsx:100 (เพิ่ม plugin Zoom + แปลป้าย a11y เป็นไทย) */}
    <Lightbox
      slides={imageSlides}
      open={lightboxIndex >= 0}
      index={lightboxIndex}
      close={() => setLightboxIndex(-1)}
      controller={{ closeOnBackdropClick: true }}
      plugins={[Zoom, LightboxDownload]}
      // มือถือ: ให้ปุ่มในหน้าดูรูปเต็มจอเข้าคลังรูปเหมือนปุ่มใต้รูป (ค่าเริ่มต้นของ plugin
      // บันทึกลง Downloads ซึ่ง user บอกว่าเอาไปใช้ต่อยาก) — desktop คงพฤติกรรมเดิมของ plugin
      download={{
        download: async ({ slide, saveAs }) => {
          const d = (slide as { download?: { url: string; filename: string } }).download
          const url = d?.url ?? (slide.src as string)
          const filename = d?.filename ?? 'image'
          if (await shareToDevice(url, filename)) return
          saveAs(url, filename)
        },
      }}
      labels={{
        Previous: 'รูปก่อนหน้า',
        Next: 'รูปถัดไป',
        Close: 'ปิด',
        'Zoom in': 'ขยาย',
        'Zoom out': 'ย่อ',
        Download: 'บันทึกรูป',
      }}
    />
    </>
  )
}
