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
import { AUTO_ORDER_RESULT_TYPE } from '@/lib/auto-order-message-type'
import AutoOrderResultCard, { type AutoOrderCardData } from './AutoOrderResultCard'
import AutoReplyTag from './AutoReplyTag'
import ThreadChipStrip, {
  type ThreadChipItem,
  type ThreadStatusItem,
  type ThreadContextItem,
} from './ThreadChipStrip'
import BotPausedBanner, { getBotPausedSummary } from './BotPausedBanner'
import OrderProgressBar, { orderProgressChip } from './OrderProgressBar'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm, pacesConfirmAsync } from '@/lib/paces-swal'
import { parseMetaOrderCard } from '@/lib/meta-order-card'
import Link from 'next/link'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import LightboxDownload from 'yet-another-react-lightbox/plugins/download'
import { generateInitials } from '@/utils/helpers'
// user 2026-07-31: แถวเวลาแสดงแค่ ชม.:นาที — วินาทีไม่ใช่ข้อมูลที่ใช้ตัดสินใจอะไรในแชท
// เวลาเต็ม (วัน+เวลา พ.ศ.) อยู่ที่ title + sr-only ของบับเบิลทุกใบ (Task 7, 2026-09-14 — ruling R19)
// เพราะบับเบิลเก่าหลายวันแสดงแค่ ชม.:นาที ผู้ขายต้องรู้ได้ว่า "วันไหน" โดยไม่ต้องไล่หาตัวคั่นวัน
import { formatTimeHM, formatDateTime, formatDateTimeTH, formatChatBubbleTime } from '@/lib/format-date'
import { chatClockIntervalMs } from '@/lib/chat-thread-scroll'
import { burstIdentity, computeBurstEndIds } from '@/lib/chat-message-burst'
import { isSelfContainedBubble } from '@/lib/chat-bubble-frame'
import { useComposerHeight } from '@/hooks/useComposerHeight'
import { hidesDownloadAffordance } from '@/lib/chat-sticker'
import { parseMetaSystemNotice, parseMetaAiHandoffNotice, readMetaAiControlMarker, attributeMetaAi } from '@/lib/meta-system-notice'
import { META_BUSINESS_SUITE_INBOX_URL } from '@/lib/meta-system-notice'
// SSOT ของ "ผลลัพธ์นี้ทำให้หน้าจอทำอะไร + พูดว่าอะไร" — ห้ามตัดสินใจซ้ำที่นี่ (HR16)
import { describeThreadControlOutcome, type ThreadControlOutcomeName } from '@/lib/thread-control-ui'
import { withEmojiPresentation } from '@/lib/emoji-presentation'
import { describeSendFailure, stripSendFailurePrefix } from '@/lib/chat-send-failure'
import { resolveChatChannel } from '@/lib/chat-channel'
// นิยาม "โพสต์นี้เป็นวิดีโอไหม" ตัวเดียวกับที่รายการคอมเมนต์ใช้ — ห้ามก็อปมาเขียนซ้ำ (HR16)
import { isVideoPost } from '@/lib/facebook-post'
import {
  canRetryFailedMessage,
  needsUncertainSendConfirm,
  UNCERTAIN_RESEND_CONFIRM,
} from '@/lib/chat-retry-eligibility'
// (S-14b, feature 00025) มาตรวัดโควตา LINE — ตรรกะทั้งหมด (รวม boolean ที่ปิดช่องพิมพ์) อยู่ใน
// ฟังก์ชันบริสุทธิ์ที่มีเทสจับ ไม่ใช่เทอร์นารีกลาง JSX (ui-boolean-needs-a-testable-home.md)
import { deriveLineQuotaCaption } from '@/lib/line/quota-caption'
import type { LineQuotaLevel } from '@/lib/line/quota'
import { formatBaht } from '@/lib/format-money'
import Swal from 'sweetalert2'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useSellerChatThread,
  groupByDate,
  pendingKind,
  type ChatProductCard,
  type ChatOrderCard,
  type ChatMessageView,
  type InitialThreadMessages,
} from '@/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread'
import { attachmentDisplayName, formatAttachmentSize } from '@/lib/chat-attachment'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { shouldWarnQuoteUnavailable, quoteJumpTargetId } from '@/lib/chat-quote-availability'
import { useLongPress } from '@/hooks/useLongPress'
import MessageActionBubble, { type MessageAction, type MessageReactionOption } from './MessageActionBubble'
import RecordPaymentSheet from '../../../_components/RecordPaymentSheet'
import { computeOrderMoneyFromSerialized } from '@/lib/order-payment'
import { resolveSlipTarget } from '@/lib/chat-order-actions'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import SellerErrorState from '@/app/(paces)/seller/(dashboard)/_shared/SellerErrorState'
import { SellerThreadSkeleton } from '@/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton'
import { ChannelBadgeOverlay } from '../../components/ChannelBadge'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import type { Dictionary } from '@/i18n/dictionaries/th'
import OrderCardView from '../../../_components/OrderCardView'
import { useDraftOrders, useOrderVocab, useThreadShopId } from '../../../_components/DraftOrderProvider'
import CustomerPanelSheet from './CustomerPanelSheet'
import EmojiPicker, { rememberRecentSticker } from './EmojiPicker'

/**
 * ที่มาของรูปในบับเบิล — ปกติ `imageUrl` คือ fileId ใน storage ของเรา (`/api/files/{id}`) แต่บับเบิล
 * optimistic ของสติกเกอร์ถือ URL ของ CDN Meta มาตรง ๆ (server ยัง mirror ไม่เสร็จ) — user สั่ง
 * 2026-08-04 ให้เห็นรูปสติกเกอร์ทันทีพร้อม spinner เหมือนส่งข้อความ ไม่ใช่รอเงียบ ๆ แล้วคิดว่าหาย
 */
export function mediaSrc(key: string): string {
  return fileUrlOf(key)
}
import AiSuggestPanel from './AiSuggestPanel'
import AiSuggestInline from './AiSuggestInline'
import { useAutoSuggest } from './useAutoSuggest'
import { getAutoSuggestView } from '@/lib/auto-suggest-machine'
import type { AutoSuggestFeedback, AutoSuggestFeedbackReason } from '@/lib/ai-suggest-auto-types'
import ThreadSoundButton from './ThreadSoundToggle'
import ThreadOverflowMenu from './ThreadOverflowMenu'
import ThreadAutoReplyToggle from './ThreadAutoReplyToggle'
import AppointmentDateSheet from '@/app/(paces)/seller/(dashboard)/orders/new/components/AppointmentDateSheet'
import QuickMessageBar from './QuickMessageBar'
import ProductPickerPanel, { type ProductPickPayload } from './ProductPickerPanel'
import { PRODUCT_TRAY_OPEN_EVENT, dispatchMemoryPoke } from '@/lib/chat-memory-events'
import type { QuickMessage } from './QuickMessageManager'
import PhotoAlbum from './PhotoAlbum'
import { knownChatImageSize, shouldShowImagePlaceholder } from '@/lib/chat-image-reserve'
// feature 00048 — คลังไฟล์ต่อลูกค้า (คำทั้งหมดมาจาก SSOT เดียว ห้ามพิมพ์ซ้ำที่นี่ — HR16)
import { LIBRARY_ICONS, isLibraryEligible, emitLibraryChanged } from '@/lib/customer-file-library'
import { toFileUrl, fileUrlOf } from '@/lib/file-url'
import SaveToLibraryButton from './SaveToLibraryButton'
import { ThreadMessageList } from './ThreadMessageList'
import { useStableCallback } from '@/hooks/useStableCallback'
import { JUMP_TO_MESSAGE_EVENT } from './CustomerFileViewer'

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
export function CopyMessageButton({ text }: { text: string }) {
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
export function MetaOrderCardBubble({ amount, status }: { amount: string; status: string | null }) {
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
export function MetaGenericCardCarousel({
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
      {/* 🛑 ไม่มีป้าย "การ์ดจาก Facebook" เหนือแถวนี้ ตั้งใจ (user สั่งถอด 2026-08-14) — อย่าใส่กลับ
          โดยไม่ถามก่อน. สิ่งที่ยังบอกว่านี่ไม่ใช่การ์ดของร้านเองเหลืออยู่ที่ "รูปทรง" ไม่ใช่ "คำ":
          aspect-video + object-contain (OwnProductCardCarousel ใช้ aspect-square + object-cover)
          และการ์ดนี้ไม่มีลิงก์ "ดูสินค้า" สีน้ำเงินสักใบ — ห้ามใส่ต่อ (One Voice; ดูคอมเมนต์หัวฟังก์ชัน)
          ตัวนับ "· N รายการ" หายไปพร้อมป้ายด้วยโดยตั้งใจ: peek ของใบถัดไปที่โผล่ขอบขวาบอกว่าเลื่อนได้
          อยู่แล้ว (w-44 แคบกว่า w-56 ของ OwnProductCardCarousel ซึ่งไม่เคยมีตัวนับมาตั้งแต่แรก)
          หมายเหตุขอบเขต: `CARD_PREFIX` = "[การ์ดจาก Facebook]" ใน channel-chat.service.ts เป็นคนละ
          ระบบ (คำนำหน้า body ของการ์ดที่ไม่มี cards[]/รูป → ขึ้นเป็นบรรทัดระบบ) **ห้ามลบตามไปด้วย** */}
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
export const ATTACHMENT_ICON: Record<string, { icon: string; cls: string }> = {
  IMAGE: { icon: 'photo', cls: 'bg-info/15 text-info' },
  VIDEO: { icon: 'video', cls: 'bg-primary/15 text-primary' },
  AUDIO: { icon: 'volume', cls: 'bg-success/15 text-success' },
  FILE: { icon: 'file-text', cls: 'bg-warning/15 text-warning' },
}

export function MediaDownloadLink({
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
export function ChatImageMessage({
  storageKey,
  onOpen,
  isStickerHint = false,
  imageWidth,
  imageHeight,
}: {
  storageKey: string
  onOpen: () => void
  /** ขนาดจริงจาก server (M3) — รู้ทั้งคู่ = จองกล่องก่อนโหลด กัน layout shift */
  imageWidth?: number | null
  imageHeight?: number | null
  /** ธงจาก server (rawMessage) — แม่นกว่าการวัดขนาดรูป และรู้ได้ก่อนรูปโหลดเสร็จ จึงไม่มีจังหวะ
   *  ที่สติกเกอร์ถูกวาดใหญ่แล้วหุบลง (สติกเกอร์ LINE ขนาดจริง 320–370px หลุดเกณฑ์ 240px) */
  isStickerHint?: boolean
}) {
  const [isSticker, setIsSticker] = useState(isStickerHint)
  const [loaded, setLoaded] = useState(false)
  const size = knownChatImageSize(imageWidth, imageHeight)
  const showBg = shouldShowImagePlaceholder({ known: size !== null, isSticker, loaded })
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
          // รู้ขนาด: attr width/height + h-auto ให้เบราว์เซอร์จอง aspect-ratio ก่อนโหลด (ไม่ใส่ max-h)
          {...(size ?? {})}
          className={`chat-media rounded ${size ? 'h-auto ' : ''}${isSticker ? 'max-w-36' : 'max-w-60'}${showBg ? ' bg-default-100' : ''}`}
          onLoad={(e) => {
            setLoaded(true)
            const el = e.currentTarget
            if (el.naturalWidth <= STICKER_MAX_PX && el.naturalHeight <= STICKER_MAX_PX) setIsSticker(true)
          }}
        />
      </button>
      {/* สติกเกอร์ **และ GIF** ไม่ต้องมีปุ่มบันทึก (user สั่ง 2026-08-27) — แต่ GIF ยังกว้างเท่ารูปปกติ
          จึงแยกธง "ซ่อนปุ่ม" ออกจาก `isSticker` ที่คุมความกว้าง ดู hidesDownloadAffordance */}
      {!hidesDownloadAffordance(storageKey, isSticker) && (
        <MediaDownloadLink storageKey={storageKey} label="บันทึกรูป" />
      )}
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
export function ReactMessageButton({ onOpen }: { onOpen: (rect: DOMRect) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget.getBoundingClientRect())}
      aria-label="กดรีแอ็กชันข้อความนี้"
      title="รีแอ็กชัน"
      className={'text-default-700 hover:bg-default-100 hover:text-default-700 mt-1.5 hidden size-7 shrink-0 items-center justify-center rounded-full transition-colors lg:group-hover:flex' /* carve-out [TAP]: `hidden` + `lg:group-hover:flex` = โผล่เฉพาะตอนเอาเมาส์ชี้บนจอ ≥1024px ⇒ ไม่ใช่เป้าให้นิ้ว กฎ 44px ครอบเฉพาะมือถือ */}
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
export function CreateOrderFromMessageButton({ onCreate }: { onCreate: () => void }) {
  // createLabel ตรง ๆ ห้ามประกอบ "สร้าง"+noun เอง — LODGING คำล็อกคือ "เปิดบิลเข้าพัก"
  const vocab = useOrderVocab()
  return (
    <button
      type="button"
      onClick={onCreate}
      aria-label={`${vocab.createLabel}จากข้อความนี้`}
      title={`${vocab.createLabel}จากข้อความนี้`}
      className={'text-default-700 hover:bg-default-100 hover:text-default-700 mt-1.5 hidden size-7 shrink-0 items-center justify-center rounded-full transition-colors lg:group-hover:flex' /* carve-out [TAP]: `hidden` + `lg:group-hover:flex` = โผล่เฉพาะตอนเอาเมาส์ชี้บนจอ ≥1024px ⇒ ไม่ใช่เป้าให้นิ้ว กฎ 44px ครอบเฉพาะมือถือ */}
    >
      <Icon icon="receipt" className="size-4" />
    </button>
  )
}

/**
 * สถานะการส่งของข้อความฝั่งร้าน — **SSOT ของถ้อยคำทั้งชุด** (HR16)
 *
 * 🛑 (P5 · impeccable critique 2026-08-23) เดิมบันไดนี้ถูกเขียนซ้ำ 2 ที่ในไฟล์เดียวกัน แล้ว
 * **หลุดจากกันจริง**: บล็อกอัลบั้มรูปมีแค่ 2 ขั้น (ขาด "ได้รับแล้ว") และไม่จัดการ `failed` เลย
 * ⇒ สถานะการส่งเดียวกันอ่านได้คนละคำ ขึ้นกับว่าผู้ขายส่งรูปใบเดียวหรือหลายใบ — และกรณีที่แย่ที่สุด
 * คือกลุ่มรูปที่ยิงไม่ออกขึ้นว่า "ส่งแล้ว" ซึ่งเป็นการโกหกชนิดเดียวกับบั๊กต้นเรื่องของ CR นี้
 * `tsc` มองไม่เห็นเพราะสตริงถูกต้องทั้งคู่ — รวมเป็นที่เดียวคือด่านเดียวที่กันการหลุดซ้ำได้
 *
 * ขอบเขต: เรนเดอร์เฉพาะ "กำลังส่ง" กับบันได 3 ขั้น — **ไม่รวมคลัสเตอร์กู้คืน** (ลองใหม่/เหตุผล/ยกเลิก)
 * ซึ่งอยู่เฉพาะบับเบิลเดี่ยว เพราะ retry ของ *กลุ่มรูป* ยังไม่มีนิยาม (ยิงใหม่ใบไหน? ทั้งกอง?)
 * ผู้เรียกจึงรับผิดชอบ UI ของ failed เอง ส่วนที่นี่แค่ไม่แสดงบันไดเมื่อ failed (จะได้ไม่ขัดกัน)
 */
export function ShopDeliveryStatus({
  sending,
  failed,
  isLatest,
  createdAt,
  readAtMs,
  deliveredAtMs,
}: {
  /** บับเบิล optimistic ที่ยังไม่ถึง server **หรือ** แถวที่บันทึกแล้วแต่ยังอยู่ในคิว (QUEUED) */
  sending: boolean
  failed: boolean
  /** เป็นข้อความล่าสุดของร้านไหม — บันไดโชว์เฉพาะใบล่าสุด (เจ้าของระบบ: "ถ้ารัวๆ ก็ให้ อ่านแล้วจังหวะสุดท้ายก็พอ") */
  isLatest: boolean
  createdAt: string
  readAtMs: number
  deliveredAtMs: number
}) {
  // role="status": สถานะชุดนี้เปลี่ยนเองโดยผู้ใช้ไม่ได้กดอะไร (QUEUED→SENT→ได้รับแล้ว→อ่านแล้ว)
  // ถ้าไม่ประกาศ ผู้ใช้ screen reader จะไม่มีทางรู้เลยว่าข้อความออกไปหรือยัง — precedent อยู่ใน
  // ไฟล์นี้เองที่ตัวโหลดข้อความเก่า (P3 · impeccable critique 2026-08-23)
  if (sending) {
    return (
      // 🛑 เหลือคำว่า "กำลังส่ง" คำเดียว — เจ้าของระบบสั่งถอดประโยค "ไม่ต้องส่งซ้ำ" ออก (2026-08-27)
      // สปินเนอร์ที่หมุนอยู่บอกว่างานยังเดินอยู่แล้ว ประโยคสั่งห้ามจึงเป็นเสียงรบกวนในแถวสถานะที่
      // โผล่ทุกครั้งที่ส่ง. ห้ามย้ายคำนี้ไปเป็น `title=` (มือถือไม่มี hover — ด่านด้านล่างกันไว้)
      // สี/ขนาดคงเดิม (inherit text-default-700 12px) ไม่มีสีเตือน ไม่มีตัวนับถอยหลัง (D-2)
      <span role="status" className="flex items-center gap-1">
        <Icon icon="loader-2" className="animate-spin" />
        กำลังส่ง
      </span>
    )
  }
  // failed → ผู้เรียกเป็นคนเรนเดอร์เอง (ดูคอมเมนต์หัวฟังก์ชัน)
  if (failed || !isLatest) return null
  const atMs = new Date(createdAt).getTime()
  /* บันได 3 ขั้น (2026-08-05):
       อ่านแล้ว   — ลูกค้าเปิดอ่านจริง (message_reads) เขียวขั้นเดียวในบันไดนี้
       ได้รับแล้ว — Meta ยืนยันว่าถึงเครื่องลูกค้า (message_deliveries) สีปกติ
       ส่งแล้ว    — Meta รับคำสั่งแล้ว (ตอบ mid) แต่ยังไม่มีหลักฐานว่าถึง
     เขียวสงวนไว้ให้ "อ่านแล้ว" ตัวเดียวตาม Verified-Means-Green — "ได้รับแล้ว" เป็นสถานะระหว่างทาง
     ไม่ใช่สัญญาณความน่าเชื่อถือระดับเดียวกัน (ux 2026-08-05)
     เธรด Instagram ไม่มีขั้นกลาง (deliveredAtMs=0 เสมอ) ข้ามไปที่อ่านแล้วเลย */
  if (readAtMs > 0 && atMs <= readAtMs) {
    return (
      <span role="status" className="text-success flex items-center gap-0.5">
        <Icon icon="checks" /> อ่านแล้ว
      </span>
    )
  }
  if (deliveredAtMs > 0 && atMs <= deliveredAtMs) {
    return (
      <span role="status" className="flex items-center gap-0.5">
        <Icon icon="checks" /> ได้รับแล้ว
      </span>
    )
  }
  return (
    <span role="status" className="flex items-center gap-0.5">
      <Icon icon="check" /> ส่งแล้ว
    </span>
  )
}

export function ReplyMessageButton({ onReply }: { onReply: () => void }) {
  return (
    <button
      type="button"
      onClick={onReply}
      aria-label="ตอบกลับข้อความนี้"
      title="ตอบกลับ"
      className={'text-default-700 hover:bg-default-100 hover:text-default-700 mt-1.5 hidden size-7 shrink-0 items-center justify-center rounded-full transition-colors lg:group-hover:flex' /* carve-out [TAP]: `hidden` + `lg:group-hover:flex` = โผล่เฉพาะตอนเอาเมาส์ชี้บนจอ ≥1024px ⇒ ไม่ใช่เป้าให้นิ้ว กฎ 44px ครอบเฉพาะมือถือ */}
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
export function buildAlbumRows(items: ChatMessageView[]): AlbumRow[] {
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
import { VERTICAL_CTA, type CustomerPanelData, type Tab as CustomerPanelTab } from './CustomerPanel'

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
  /** feature 00023 — สวิตช์ auto-reply ที่ร้านตั้งเองต่อห้อง (`Conversation.autoReplyEnabled`)
   *  null = ยังไม่เคยตั้ง ซึ่งวันนี้ให้ผลเท่ากับเปิด (ดู ThreadAutoReplyToggle) */
  botAutoReplyEnabled?: boolean | null
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
  /** feature 00048 — fileId ที่อยู่ในคลังของลูกค้ารายนี้แล้ว (server query ครั้งเดียวตอน render หน้า)
   *  ใช้สลับ label/ไอคอนของ action "เก็บเข้าคลัง" ทั้ง 3 ทางเข้าให้ตรงกัน */
  savedFileIds: string[]
  /**
   * ข้อความ 30 ใบแรกที่ RSC ดึงมาให้พร้อมหน้า (2026-09-10) — ตัดการไป-กลับเซิร์ฟเวอร์รอบที่สอง
   * ตอนเปิดห้อง ⇒ สเกเลตันของเธรดไม่ต้องโผล่เลย. null = ผู้เรียกที่ยังไม่ส่งมา (ได้พฤติกรรมเดิม)
   */
  initialMessages?: InitialThreadMessages | null
  /**
   * 00019-ext — 'auto' = ร้านที่ใช้ Typhoon: แผงคำแนะนำอัตโนมัติเหนือช่องพิมพ์ (AiSuggestInline)
   * 'manual' (ค่าตั้งต้น) = ปุ่ม sparkles + AiSuggestPanel เดิมทุกอย่าง · ลืมส่ง = พฤติกรรมเดิม
   */
  aiSuggestMode?: 'auto' | 'manual'
}

// feature 00018 — ดู comment หัวไฟล์ (badge "ส่งไม่สำเร็จ")
//
// reply/quote quotable (bugfix 2026-08-10): GET .../messages enrich ฟิลด์นี้มาแล้วทั้งข้อความหลัก
// (ตัดสินก่อนกดส่งผ่าน replyingTo.quotable) และ snapshot replyTo (ตัดสินหลังส่งว่า quote ติดจริงไหม)
// — ChatMessageView (hook) ไม่ประกาศฟิลด์นี้ในชนิดข้อมูล (นอกขอบเขต T4/แก้ไม่ได้รอบนี้ — งานอื่นค้าง
// อยู่ในไฟล์นั้น) จึง extend ชนิดข้อมูลในนี้เองแบบเดียวกับ deliveryStatus/failureReason ข้างบน
/** feature 00061 — ข้อมูลการ์ดผลลัพธ์ที่ route enrich มาให้ (null = ยังอยู่สถานะ "กำลังอ่าน") */
export type ChatMessageWithAutoOrder = ChatMessageView & { autoOrderCard?: AutoOrderCardData | null }

export type ChatMessageWithDelivery = ChatMessageView & {
  /** (CR 2026-08-23) เดิมเป็น `string | null` — ขยายเป็น union เพื่อให้ `tsc` เป็นคนบังคับว่าค่า
   *  'QUEUED' ที่เพิ่งเพิ่มถูกไล่ครบทุกจุดที่อ่านคอลัมน์นี้ (grep จับ object key ไม่ได้ —
   *  docs/conventions/enum-value-removal.md). QUEUED = เขียนแถวแล้วแต่ยังไม่ยิงออกช่องทาง */
  deliveryStatus?: 'SENT' | 'FAILED' | 'QUEUED' | null
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

/**
 * ถอยหลังละเอียดถึงวินาที (ตัดชั่วโมงทิ้งเมื่อ 0 ให้อ่านง่าย)
 *
 * รับ dictionary เข้ามา ไม่ได้อ่านเอง — ฟังก์ชันระดับ module เรียก hook ไม่ได้
 */
function formatCountdown(ms: number, t: Dictionary): string {
  const total = Math.max(0, Math.floor(ms / SECOND_MS))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? fmt(t.inbox.countdownHms, { h, m, s }) : fmt(t.inbox.countdownMs, { m, s })
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
export function ChatAvatar({
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
  /**
   * 🛑 ต้องผ่าน `toFileUrl` เท่านั้น ห้ามประกอบ URL เอง (bugfix 2026-08-14)
   *
   * ที่มา (user เจอเองบน prod): พนักงานที่ตั้งรูปโปรไฟล์ไว้แล้ว แต่ avatar ท้ายบับเบิลของข้อความ
   * ที่ตัวเองส่ง ขึ้นเป็นไอคอนคนสีเทาเสมอ — `/account` เซฟค่าเป็น **`/api/files/{id}`**
   * (ProfileForm.tsx: `const next = \`/api/files/\${fileId}\``) ส่วนที่นี่เคยเช็คแค่ `startsWith('http')`
   * ⇒ ค่าที่ขึ้นต้นด้วย `/` ตกไป else แล้วได้ `/api/files//api/files/{id}` → 404 → onError → fallback
   *
   * `toFileUrl` มีกิ่ง `startsWith('/')` อยู่แล้วและ docstring ของมันเขียนเตือนเคสนี้ไว้ตรงตัว
   * (`AccountAvatar` ก็เจอบั๊กเดียวกันนี้เมื่อ 2026-07-26 "รูปร้านไม่ขึ้น" แล้วแก้ไปฝั่งเดียว)
   * — ยังมีจุดอื่นในรีโปที่ประกอบเองอยู่ ดูรายการใน `src/lib/file-url.ts`
   */
  const src = toFileUrl(avatar)
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
export function ProductCardBubble({ card, username }: { card: ChatProductCard | null; username?: string }) {
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
          // 🔄 object-cover (user สั่งเอง 2026-08-11 รอบสอง: "รูปมันไม่เต็มเหมือน Facebook อ่ะ
          // ผมชอบรูปเต็ม ๆ แบบนี้") — รอบแรกใช้ `contain` โดยอ้าง user-supplied-image-assets.md
          // ที่ว่ารูปสินค้ามักมีข้อความฝังอยู่ cover จะครอปทิ้ง แต่ผลจริงคือรูปแนวตั้งได้แถบขาว
          // ซ้าย-ขวาหนา ดูเหมือนรูปโหลดไม่ครบ ซึ่ง user ตัดสินว่าแย่กว่าการโดนครอป
          //
          // 🛑 กรอบเป็น **จัตุรัส** ไม่ใช่ 16:9 จึงยอมได้: รูปแนวตั้ง 3:4 โดนครอปบน-ล่างราว 25%
          // ถ้าวันไหนเปลี่ยนกรอบให้กว้างขึ้น ต้องกลับมาคิดข้อนี้ใหม่ — ยิ่งกรอบกว้าง cover ยิ่งกิน
          // เนื้อรูปแนวตั้งเยอะขึ้นเร็วมาก (ที่ 1.91:1 จะเหลือรูปแค่แถบกลางราว 28%)
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaSrc(card.imageFileId)} alt="รูปสินค้า" className="absolute inset-0 size-full object-cover" />
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
export function OwnProductCardCarousel({
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
                  `object-cover` (user สั่งเอง 2026-08-11: "ผมชอบรูปเต็ม ๆ แบบนี้") + `mediaSrc`
                  ถ้าใช้ของเดิม การ์ด 1 ใบกับหลายใบในเธรดเดียวกันจะอ่านเป็นคนละภาษา ทั้งที่เป็นของ
                  ชนิดเดียวกัน (HR17: rebase ผ่านสะอาดไม่ได้แปลว่าแพตเทิร์นยังตรงกัน) */}
              <div className="bg-default-100 relative aspect-square w-full overflow-hidden">
                {card?.imageFileId ? (
                  // 🛑 object-cover ต้องตรงกับ ProductCardBubble เสมอ — การ์ดใบเดียวกับหลายใบอยู่ใน
                  // เธรดเดียวกัน ถ้า object-fit ต่างกัน ผู้ขายจะเห็นรูปเต็มตอนส่งใบเดียวแต่มีแถบขาว
                  // ตอนส่งหลายใบ โดยไม่มีอะไรฟ้อง (git ไม่เห็นเป็น conflict เพราะเป็นโค้ดคนละก้อน)
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(card.imageFileId)} alt="รูปสินค้า" className="absolute inset-0 size-full object-cover" />
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
export function OrderCardBubble({ card, onEdit }: { card: ChatOrderCard | null; onEdit: (token: string) => void }) {
  // ชื่อรายการต้องตรงกับประเภทกิจการ — ใช้ hook ที่ไม่บังคับ Provider (การ์ดใบนี้ไม่ได้จะเปิดโมดัล)
  // ใช้เฉพาะตอนไม่มีการ์ด: เมื่อมีการ์ด คำต้องมาจาก `card.vertical` (ร้านเจ้าของ *ใบนั้น*) ไม่ใช่
  // ร้านที่ active อยู่ — กล่องแชทรวมหลายร้าน (00037) ทำให้สองอย่างนี้ต่างกันได้
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
      data={card}
      onEdit={() => onEdit(card.token)}
      className="w-64"
      footer={
        <Link
          href={`/orders/${card.token}`}
          className="bg-primary/5 text-primary hover:bg-primary/10 flex items-center justify-center gap-1.5 border-default-200 border-t px-4 py-2.5 text-sm font-semibold"
        >
          <Icon icon="external-link" className="text-base" />
          {resolveOrderVocab(card.vertical ?? '').viewLabel}
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
  botAutoReplyEnabled = null,
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
  savedFileIds,
  initialMessages,
  aiSuggestMode = 'manual',
}: Props) {
  const t = useT()
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
  /**
   * จอ ≥1280px หรือยัง — ใช้ตัดสินว่าจะใส่ "ชิปสถานะออเดอร์" ลงในแถวชิปไหม (2026-08-14)
   *
   * 🛑 ต้องเป็น matchMedia ไม่ใช่คลาส `xl:hidden` เพราะสิ่งที่ต้องตัดคือ **สมาชิกในอาร์เรย์**
   * ไม่ใช่ element — ซ่อนด้วย CSS จะได้ชิปที่ยังนับอยู่ใน items แต่มองไม่เห็น แล้ว `action`
   * ที่ ThreadChipStrip ยกขึ้นแถวอาจถูกยกมาจากชิปที่ผู้ใช้ไม่เห็นตัว
   *
   * 🛑 ค่า 1280 ต้องตรงกับ `xl:block` ของคอลัมน์ขวาใน page.tsx เสมอ — ช่วง iPad Pro 1024–1279
   * เคยตกหล่นทั้งสองทางมาแล้ว (ทั้งซ้ำและหายไปเลย)
   *
   * Base: แพตเทิร์น matchMedia + addEventListener('change') จาก EmojiPicker.tsx:277-287
   */
  // เริ่ม false เสมอ (S5) — lazy init ที่อ่าน matchMedia ทำให้ server (false) กับ client (true บนจอ ≥1280)
  // เรนเดอร์คนละแบบ = hydration mismatch · effect ด้านล่าง sync ค่าจริงทันทีหลัง mount
  const [isXlUp, setIsXlUp] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)')
    const sync = () => setIsXlUp(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const [sheetOpen, setSheetOpen] = useState(false)
  /** แท็บที่ชีตข้อมูลลูกค้าจะเปิดมาลง (2026-08-14) — ปุ่มคลังไฟล์ในหัวเธรดส่ง 'files' มา ⇒ ไฟล์ = 1 แตะ */
  const [sheetTab, setSheetTab] = useState<CustomerPanelTab>('customer')
  const openPanel = (tab: CustomerPanelTab) => {
    setSheetTab(tab)
    setSheetOpen(true)
  }
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

  /**
   * feature 00048 — คลังไฟล์ต่อลูกค้า: สถานะ "ไฟล์ไหนอยู่ในคลังแล้ว" ของทั้งเธรด
   *
   * เก็บเป็น Set ของ fileId (ไม่ใช่ messageId) เพราะคลังผูกกับ **ไฟล์** — ข้อความคนละใบที่ชี้
   * ไฟล์เดียวกันต้องแสดงสถานะตรงกัน และคีย์ที่ API ใช้ลบก็เป็น fileId เช่นกัน
   *
   * optimistic ทั้งเพิ่มและถอน แล้ว rollback เมื่อล้ม — ผู้ขายกดแล้วต้องเห็นผลทันที
   * ไม่ใช่รอ round-trip (คลังคือของที่กดระหว่างอ่านข้อความ ไม่ใช่ฟอร์มที่ตั้งใจมากรอก)
   */
  const [savedFiles, setSavedFiles] = useState<Set<string>>(() => new Set(savedFileIds))
  const [savingFileId, setSavingFileId] = useState<string | null>(null)
  /**
   * สไลด์ที่กำลังดูอยู่ใน Lightbox — ต่างจาก lightboxIndex ที่เป็นแค่ "จุดเริ่ม" ตอนเปิด
   *
   * 🛑 ต้อง sync ตอนเปิดทุกครั้ง ไม่ใช่รอ `on.view` อย่างเดียว: ถ้าไม่ sync ค่าจะค้างจากรอบก่อน
   * แล้วปุ่ม "เก็บเข้าคลัง" ในแถบเครื่องมือจะสะท้อนสถานะของ **รูปคนละใบ** ในเสี้ยววินาทีแรก
   * ซึ่งเป็นความผิดที่ tsc/build มองไม่เห็นเพราะชนิดถูกทุกตัว
   */
  const [lightboxViewIndex, setLightboxViewIndex] = useState(0)
  useEffect(() => {
    if (lightboxIndex >= 0) setLightboxViewIndex(lightboxIndex)
  }, [lightboxIndex])

  async function toggleLibrary(m: { id: string; imageUrl?: string | null }) {
    const fileId = m.imageUrl
    if (!fileId || savingFileId) return
    const wasSaved = savedFiles.has(fileId)
    setSavingFileId(fileId)
    setSavedFiles((prev) => {
      const next = new Set(prev)
      if (wasSaved) next.delete(fileId)
      else next.add(fileId)
      return next
    })
    try {
      const res = wasSaved
        ? await fetch(`/api/chat/conversations/${conversationId}/library?fileId=${encodeURIComponent(fileId)}`, {
            method: 'DELETE',
          })
        : await fetch(`/api/chat/conversations/${conversationId}/library`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId: m.id }),
          })
      if (!res.ok) throw new Error(String(res.status))
      pacesToast.success(wasSaved ? t.inbox.libraryRemovedToast : t.inbox.librarySavedToast)
      // แผงลูกค้าเป็นพี่น้องกัน ส่ง prop ถึงกันไม่ได้ — ต้องบอกให้มันโหลดกริดใหม่เอง ไม่งั้น toast
      // บอกว่าสำเร็จแต่กริดยังเขียนว่า "ยังไม่มีไฟล์ที่เก็บไว้" (user เจอเองบน prod 2026-08-14)
      // วางหลัง res.ok เท่านั้น — ยิงตอนล้มเหลวคือสั่งให้แผงไปดึงค่าที่ยังไม่เปลี่ยนมาแสดง
      emitLibraryChanged(conversationId)
    } catch {
      // rollback: ปล่อยให้ไอคอนค้างในสถานะที่ไม่ตรงกับฐานคือการโกหกผู้ขาย
      setSavedFiles((prev) => {
        const next = new Set(prev)
        if (wasSaved) next.add(fileId)
        else next.delete(fileId)
        return next
      })
      pacesToast.error(wasSaved ? t.inbox.libraryRemoveFailed : t.inbox.librarySaveFailed)
    } finally {
      setSavingFileId(null)
    }
  }

  /**
   * ฟังคำขอ "ดูในแชท" จากคลังไฟล์ (แผงลูกค้าเป็นพี่น้องกับเธรดบนเดสก์ท็อป ส่ง prop ถึงกันไม่ได้)
   * jumpToMessage มีตัวบอกอยู่แล้วเมื่อข้อความยังไม่ถูกโหลด จึงไม่ต้องเช็คซ้ำที่นี่
   */
  useEffect(() => {
    const onJump = (e: Event) => {
      const id = (e as CustomEvent<{ messageId?: string }>).detail?.messageId
      if (id) jumpToMessage(id)
    }
    window.addEventListener(JUMP_TO_MESSAGE_EVENT, onJump)
    return () => window.removeEventListener(JUMP_TO_MESSAGE_EVENT, onJump)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // composer improvement #1 (feature 00018) — emoji picker; append ต่อท้ายข้อความ ไม่ปิด picker
  // (ผู้ใช้เลือกหลายตัวต่อกันได้ ปิดเองด้วยคลิกนอก/Escape)
  const [emojiOpen, setEmojiOpen] = useState(false)
  /** แผงสติกเกอร์เป็นปุ่มของตัวเอง (user สั่ง 2026-08-04 "อยากให้แยก emoji / sticker เป็น 2 icon") */
  const [stickerOpen, setStickerOpen] = useState(false)
  // S-18b: เปิดให้ LINE ด้วย — ปุ่มเดิม/เงื่อนไขเดิมของ Meta ไม่เปลี่ยน แค่เพิ่มช่องทางที่ผ่าน
  const canSendSticker = channel === 'MESSENGER' || channel === 'INSTAGRAM' || channel === 'LINE'
  /**
   * แหล่งสติกเกอร์ผัน — LINE มีชุดปิดตายตัวจาก SSOT (ไม่ใช่ Sticker Catalog API ของ Meta)
   * S-19: IG ใช้ GIPHY — Meta ไม่มี sticker API ให้ IG เลย (/sticker_packs, /sticker_search เป็นของ
   * Messenger เท่านั้น) เดิม IG ตกไปเป็น META จึงได้แผงที่เลือกไปก็ส่งไม่ผ่าน (พบ 2026-08-26)
   */
  const stickerProvider: 'META' | 'LINE' | 'GIPHY' =
    channel === 'LINE' ? 'LINE' : channel === 'INSTAGRAM' ? 'GIPHY' : 'META'
  // composer improvement #2/#3 — แผงเหนือช่องพิมพ์ (ข้อความสำเร็จรูป / AI ช่วยร่างคำตอบ)
  // state เดียวคุมทั้งคู่ (user สั่ง 2026-07-23: "ต้องไม่ขึ้นซ้อนกัน เปิดได้ทีละอัน") — เดิมแยก
  // boolean คนละตัว กดสองปุ่มแล้วกางพร้อมกันทับกัน (ทั้งคู่เป็นแถบ full-bleed -mt ติดลบ)
  const [activePanel, setActivePanel] = useState<'quick' | 'ai' | 'product' | null>(null)
  const aiOpen = activePanel === 'ai'
  const quickOpen = activePanel === 'quick'
  const productOpen = activePanel === 'product'
  /** ร้านของเธรดที่เปิดอยู่ — ใช้เป็น key ของแผงสินค้า (ดูเหตุผลที่จุด render) */
  const threadShopIdForPanels = useThreadShopId()
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
  const liveRemaining = Math.max(0, expiryTs - nowTs)
  // S1: 1 วิเฉพาะตอนมีตัวเลขวินาทีบนจอ (LINE / เหลือ ≤4 ชม.) นอกนั้น 30 วิ — ทุก tick วาด ChatThread ทั้งเธรดใหม่
  // (primitive เข้า deps ⇒ effect รันใหม่เฉพาะตอนความถี่เปลี่ยนจริง)
  const clockMs = chatClockIntervalMs({ isLine: channel === 'LINE', remainingMs: liveRemaining })
  useEffect(() => {
    if (!isExternal || !windowOpen) return // นับเฉพาะช่องทางนอกที่ window ยังเปิดตอนโหลด
    const timer = setInterval(() => setNowTs(Date.now()), clockMs)
    return () => clearInterval(timer)
  }, [isExternal, windowOpen, clockMs])
  const liveWindowOpen = windowOpen && liveRemaining > 0
  // tick หยาบ ๆ (ทุก 15 วิ) ให้เวลาข้อความล่าสุด "หายไปเอง" หลังส่งเกิน 1 นาที (user request 2026-07-23)
  const [, setMetaTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setMetaTick((x) => x + 1), 15000)
    return () => clearInterval(timer)
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
    unseenNewCount,
    clearUnseen,
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
    notifyTyping,
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
  } = useSellerChatThread(conversationId, shopId, false, initialMessages)

  // ── แตะกล่อง quote แล้วเลื่อนไปหาข้อความต้นทาง (user report 2026-08-11) ──────────────
  //
  // เดิมกล่อง quote เป็น <div> เฉย ๆ กดไม่ได้เลย — ในเธรดที่ลูกค้าส่งรูปติดกันหลายใบ ข้อความว่า
  // "[รูปภาพ]" ชี้ไม่ได้ว่าใบไหน และไม่มีทางย้อนไปดูนอกจากเลื่อนหาเอง
  //
  // 🛑 หาเป้าจาก DOM ไม่ใช่จากอาร์เรย์ `messages` — รูปที่ส่งติดกันถูกยุบเป็น "อัลบั้ม" ใบเดียวซึ่ง
  // ผูก `data-message-id` ไว้กับรูปใบแรกของกลุ่มเท่านั้น (ดูบล็อกอัลบั้มในไฟล์นี้) การหาจาก index
  // ในอาร์เรย์จึงได้ id ที่ไม่มี element จริงรองรับสำหรับรูปใบที่ 2 เป็นต้นไป
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current) }, [])

  function jumpToMessage(targetId: string) {
    const target = scrollRef.current?.querySelector(`[data-message-id="${CSS.escape(targetId)}"]`)
    if (!target) {
      // เธรดโหลดทีละหน้า (load-older ผ่าน sentinel บนสุด) — ข้อความเก่ากว่าหน้าที่โหลดไว้ยังไม่มีใน DOM
      // บอกตรง ๆ ดีกว่าเงียบ ไม่งั้นผู้ขายกดแล้วไม่เกิดอะไรและสรุปว่าปุ่มเสีย
      pacesToast.chat.info('ข้อความที่อ้างถึงยังไม่ได้โหลด — เลื่อนขึ้นด้านบนเพื่อโหลดข้อความเก่าก่อน')
      return
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // ไฮไลต์ชั่วคราว: เลื่อนไปเฉย ๆ ไม่พอ ผู้ใช้ต้องรู้ว่า "ใบไหน" คือใบที่ถูกอ้างถึง
    setHighlightedId(targetId)
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = setTimeout(() => setHighlightedId(null), 1800)
  }
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
    // 🛑 (CR 2026-08-23) เดิมอ่าน `m._status === 'sent'` ซึ่ง **ไม่ถูกตั้งอีกแล้วตลอดกาล** หลัง
    // postMessage เลิกเขียนค่านั้น (ดูคอมเมนต์ที่ useSellerChatThread) — ถ้าไม่ย้ายมาอ่าน
    // deliveryStatus แคปชันโควตา LINE จะค้างค่าเก่าถาวรโดยไม่มีอะไรฟ้อง (ไม่มี type error เพราะ
    // เงื่อนไขยังถูกต้องตามชนิดทุกประการ มันแค่เป็นเท็จเสมอ)
    // นับเฉพาะ SENT: แถว QUEUED ยังไม่หักโควตา แคปชันจึงต้องยังไม่ขยับ
    for (const m of messages) {
      if (m.senderRole === 'SHOP' && (m as ChatMessageWithDelivery).deliveryStatus === 'SENT') lastSentId = m.id
    }
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

  // ป้าย "Meta AI" รายบับเบิล (Task 7, 2026-09-14) — derive จาก marker ชุดเดียวกับ aiAgentActive
  // ไม่มี marker = ไม่ติดป้าย (ดูเหตุผลที่ attributeMetaAi) · เฉพาะ Messenger เพราะ marker มาจากที่นั่นที่เดียว
  const metaAiMessageIds = useMemo(
    () => (channel === 'MESSENGER' ? attributeMetaAi(messages) : new Set<string>()),
    [channel, messages],
  )

  // ผลของการขอสิทธิ์คุมเธรดจาก Meta (2026-08-26 — เดิมเป็น client gate ล้วน ๆ ไม่ยิง API เลย)
  //
  // 🛑 ทำไมเป็น 3 ค่า ไม่ใช่ boolean: `requested` แปลว่า "ขอไปแล้ว ยังไม่รู้ว่าได้สิทธิ์ไหม" ซึ่ง
  // ไม่ใช่ทั้งสำเร็จและล้มเหลว — ยุบให้เหลือ true/false เมื่อไหร่ ผู้ขายจะได้คำสัญญาแบบเดียวกับ
  // บั๊กที่งานนี้มาแก้ (ปุ่มบอกว่าพิมพ์ได้ แล้ว Meta ปฏิเสธตอนกดส่ง)
  //
  // `takeoverFailed` แยกออกมาต่างหาก ไม่ยัดเป็นค่าที่ 4 ของตัวบน เพราะมันตอบคนละคำถาม:
  // ตัวบน = "ตอนนี้เราถือสิทธิ์อยู่ในสถานะไหน" · ตัวนี้ = "ครั้งล่าสุดที่ขอ โดนปฏิเสธไหม"
  // (ขอไม่ผ่าน = ยังอยู่สถานะ 'none' เหมือนเดิมทุกประการ แค่ต้องเปลี่ยนสิ่งที่แสดงบนจอ)
  //
  // ต้อง reset ทั้งคู่เมื่อ aiAgentActive ไล่จาก false→true อีกครั้ง (ลูกค้าทักใหม่แล้ว AI กลับมา
  // คุมระหว่างเปิดหน้าค้าง) ไม่งั้น composer จะปลดล็อกค้างทั้งที่ AI คุมจริงแล้ว — ใช้ ref เก็บค่า
  // รอบก่อนหน้าเทียบเอง (ไม่ใช่แค่ if (aiAgentActive) เพราะนั่นจะ reset ทุกครั้งที่ยัง true อยู่
  // ทำให้กด "ตอบเอง" แล้วปลดล็อกไม่ได้เลยสักครั้ง)
  const [manualOverrideStatus, setManualOverrideStatus] = useState<'none' | 'taken'>('none')
  const [takeoverFailed, setTakeoverFailed] = useState(false)
  const [takeoverBusy, setTakeoverBusy] = useState(false)
  const prevAiAgentActiveRef = useRef(aiAgentActive)
  useEffect(() => {
    if (!prevAiAgentActiveRef.current && aiAgentActive) {
      setManualOverrideStatus('none')
      setTakeoverFailed(false)
    }
    prevAiAgentActiveRef.current = aiAgentActive
  }, [aiAgentActive])

  // แสดง "composer replacement block" (แทนที่ทั้งแถบเครื่องมือ+textarea) เฉพาะตอน AI คุมอยู่จริง
  // ยังไม่ยืนยันตอบเอง และ token ยังไม่ตาย — tokenInvalid ชนะเสมอ (คงพฤติกรรม dim เดิม เพราะ
  // "เชื่อมต่อเพจขาด" กับ "มี AI ทำงานแทนอยู่" คนละความหมาย จะปนกันไม่ได้)
  /**
   * (ส่วนขยาย 00025 2026-08-12 / AC-CH-21/22) แทนที่ช่องพิมพ์เมื่อ token ของ LINE ตายแล้ว
   *
   * ต่างจาก `composerDisabled` (dim) ตรงที่ dim ทำให้เห็นปุ่ม 6 ปุ่มที่กดไม่ได้ ผู้ขายจะพิมพ์
   * ไปครึ่งข้อความแล้วเพิ่งรู้ว่าส่งไม่ได้ — บล็อกทั้งแถบพร้อมทางแก้ตรงนั้นตรงไปตรงมากว่า
   *
   * 🛑 **เฉพาะ LINE** (มติ OQ-1) — `tokenInvalid` เป็น prop ร่วมของทุกช่องทาง แต่ copy
   * "ข้อความที่ลูกค้าส่งมายังอ่านได้ตามปกติ" ยังไม่ได้ยืนยันว่าจริงกับ Meta และการบล็อกผิด
   * แพงกว่าไม่บล็อก (บทเรียน viaStandby 2026-08-09: พิมพ์ไม่ได้ทั้งที่กำลังคุยลูกค้าอยู่)
   *
   * 🛑 บล็อกได้เพราะ `tokenInvalid` คือ **ข้อเท็จจริงที่ LINE ปฏิเสธเราแล้วจริง** ไม่ใช่การอนุมาน
   * — สถานะเตือนอื่น (token ใกล้หมด / webhook ผิด) ห้ามบล็อกเด็ดขาด
   */
  const showTokenInvalidComposer = isExternal && tokenInvalid && channel === 'LINE'
  // ลำดับความสำคัญเดิมคงเดิมทุกประการ (composerDisabled > tokenInvalid > กลุ่ม AI) —
  // งานนี้แค่แตกกิ่ง "กลุ่ม AI" ออกเป็น 2 ทางตามว่าครั้งล่าสุดขอสิทธิ์แล้วโดนปฏิเสธหรือยัง
  const aiComposerSlot = !composerDisabled && !showTokenInvalidComposer && aiAgentActive && manualOverrideStatus === 'none'
  const showAiTakeoverComposer = aiComposerSlot && !takeoverFailed
  const showAiTakeoverFailedComposer = aiComposerSlot && takeoverFailed
  // แถบเหนือช่องพิมพ์หลังขอสิทธิ์แล้ว — หายเองเมื่อ aiAgentActive กลับเป็น false (ไม่มีปุ่มปิด)
  const showManualOverrideStrip = !composerDisabled && aiAgentActive && manualOverrideStatus === 'taken'

  /**
   * ยิงขอสิทธิ์คุมเธรดจริง แล้วแปลผล 3 แบบเป็นสิ่งที่ผู้ขายเห็น
   *
   * 🛑 `throw` ใน `run()` สงวนไว้ให้ "ยิงไม่ถึงปลายทาง" เท่านั้น (เน็ตหลุด/500) — Meta ตอบมาแล้ว
   * ว่าไม่ให้ (`FAILED`) ต้องคืนค่าปกติ เพราะขั้นตอนต่อไปคนละทาง: อันหนึ่งกดซ้ำได้เลย
   * อีกอันต้องไปทำอย่างอื่นที่ Business Suite (ดู pacesConfirmAsync)
   */
  const requestThreadControl = async (): Promise<ThreadControlOutcomeName> => {
    const res = await fetch(`/api/chat/conversations/${conversationId}/thread-control`, {
      method: 'POST',
    })
    if (!res.ok) {
      // 4xx/5xx = ไม่ได้คำตอบเชิงธุรกิจจาก Meta เลย → ให้โมดัลเปิดค้างแล้วกดใหม่ได้
      throw new Error(`thread-control ${res.status}`)
    }
    const data = (await res.json()) as { outcome?: ThreadControlOutcomeName }
    if (!data.outcome) throw new Error('thread-control: no outcome')
    return data.outcome
  }

  const applyTakeoverOutcome = (outcome: ThreadControlOutcomeName) => {
    const ui = describeThreadControlOutcome(outcome)
    setManualOverrideStatus(ui.unlocked ? 'taken' : 'none')
    setTakeoverFailed(ui.blocked)
    if (ui.toastTone === 'success') pacesToast.success(ui.toast)
    else pacesToast.error(ui.toast)
  }

  const confirmTakeOverFromAi = async () => {
    if (takeoverBusy) return
    setTakeoverBusy(true)
    try {
      const outcome = await pacesConfirmAsync<ThreadControlOutcomeName>({
        title: 'ตอบเองแทน AI ของ Meta?',
        text: 'Deep จะขอสิทธิ์ควบคุมแชทนี้จาก Meta ให้ทันที — บางเพจได้สิทธิ์เลย บางเพจต้องรอ Meta อนุมัติก่อน ระหว่างนั้นข้อความอาจส่งไม่ผ่านชั่วคราว',
        confirmButtonText: 'ตอบเอง',
        cancelButtonText: 'ให้ AI ตอบต่อไป',
        errorText: 'เชื่อมต่อ Meta ไม่สำเร็จ — ลองอีกครั้ง',
        run: requestThreadControl,
      })
      if (outcome) applyTakeoverOutcome(outcome)
    } finally {
      setTakeoverBusy(false)
    }
  }

  /** ลองขอสิทธิ์ซ้ำจากบล็อกแดง — ไม่ถามยืนยันอีก ผู้ขายยืนยันเจตนาไปแล้วรอบแรก */
  const retryTakeOverFromAi = async () => {
    if (takeoverBusy) return
    setTakeoverBusy(true)
    try {
      applyTakeoverOutcome(await requestThreadControl())
    } catch {
      pacesToast.error('เชื่อมต่อ Meta ไม่สำเร็จ — ลองอีกครั้ง')
    } finally {
      setTakeoverBusy(false)
    }
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

  /**
   * ── กดค้างบนรูปสลิป → บันทึกการรับเงิน (feature 00050) ─────────────────────────────
   *
   * หัวหน้าสั่งว่าอยากให้ "กดง่าย ๆ ที่หน้า chat" — เส้นทางเดิมคือ เปิดแผงลูกค้า → หาการ์ดใบที่ใช่
   * → กดรับเงิน → พิมพ์ยอด ส่วนตรงนี้คือกดค้างบนรูปที่ลูกค้าเพิ่งส่งมาแล้วยอดถูกเติมให้เลย
   *
   * 🛑 ไม่โผล่เมื่อ **มีใบค้างมากกว่าหนึ่ง** — `resolveSlipTarget()` คืน null เพราะการเดาผิดใบ
   * ทำให้ผิดพร้อมกันสองใบ (ดูเหตุผลเต็มในไฟล์นั้น) ผู้ใช้ยังกดจากการ์ดของใบที่ต้องการได้เสมอ
   */
  const slipTarget =
    customerPanelData?.vertical === 'SERVICE_QUEUE'
      ? resolveSlipTarget(
          customerPanelData.orders.map((o) => ({
            token: o.token,
            label: o.orderNo || o.token.slice(0, 8).toUpperCase(),
            orderStatus: o.status,
            money: computeOrderMoneyFromSerialized({
              totalAmount: o.totalAmount,
              depositAmount: o.depositAmount ?? null,
              payments: o.payments,
            }),
          })),
        )
      : null
  /** fileId ของรูปที่กดค้างมา — null = ชีตปิด (เก็บ fileId ไม่ใช่ boolean เพราะชีตต้องใช้ค่านี้) */
  const [slipPayFileId, setSlipPayFileId] = useState<string | null>(null)

  const actionTargetActions: MessageAction[] = (() => {
    const m = actionTarget?.message
    if (!m || actionTarget?.mode === 'reactions') return []
    const list: MessageAction[] = []
    // เงื่อนไขเดียวกับปุ่ม hover ฝั่ง desktop (ดู canReply ตอน render) — ตอบทับข้อความ optimistic
    // ไม่ได้เพราะ route ต้องการ uuid จริง
    // 🛑 (CR 2026-08-23) QUEUED ก็ตอบทับไม่ได้เช่นกัน แม้จะมี uuid จริงแล้ว: ยังไม่มี mid ของช่องทาง
    // ให้ผูก reply_to (ยิงออกไม่สำเร็จแปลว่าฝั่งโน้นไม่มีข้อความให้อ้างถึง) — ซ่อนแทน disabled
    // เพราะ QUEUED ปกติอยู่ 1-2 วินาที ทำ disabled state ให้ของที่หายเองแทบทันทีคือความซับซ้อนเปล่า
    if (
      !m.isDeleted &&
      !m._status &&
      !m.id.startsWith('local-') &&
      (m as ChatMessageWithDelivery).deliveryStatus !== 'QUEUED'
    ) {
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
    // (CR 2026-08-23) `deliveryStatus !== 'QUEUED'` ด้วยเหตุผลเดียวกับ 'reply' ข้างบน — สติกเกอร์
    // ถูกส่งเป็น "ข้อความใหม่ที่ผูก reply_to" จึงต้องการ mid ของข้อความต้นทางเหมือนกันทุกประการ
    if (
      canSendSticker &&
      !m.isDeleted &&
      !m._status &&
      !m.id.startsWith('local-') &&
      (m as ChatMessageWithDelivery).deliveryStatus !== 'QUEUED'
    ) {
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
    /**
     * feature 00048 — เก็บไฟล์เข้าคลังของลูกค้ารายนี้ (ทางเข้าที่ 1 จาก 3)
     *
     * เกณฑ์อยู่ใน isLibraryEligible ที่เดียว ไม่เขียนเงื่อนไขซ้ำตรงนี้ — สติกเกอร์ถูกเก็บเป็น
     * type='IMAGE' เหมือนรูปทุกประการ (แยกด้วย m.isSticker ที่ API derive จาก rawMessage)
     * ถ้าคัดลอกเงื่อนไขมาเขียนเองแล้วลืมข้อใดข้อหนึ่ง สติกเกอร์จะหลุดเข้าคลังโดยไม่มีอะไรฟ้อง
     */
    if (
      isLibraryEligible({
        type: m.type,
        isSticker: m.isSticker,
        fromCard: false,
        hasFile: Boolean(m.imageUrl),
                    storageKey: m.imageUrl,
      }) &&
      !m.isDeleted &&
      !m._status &&
      !m.id.startsWith('local-')
    ) {
      const saved = Boolean(m.imageUrl && savedFiles.has(m.imageUrl))
      list.push({
        key: 'save-to-library',
        icon: saved ? LIBRARY_ICONS.saved : LIBRARY_ICONS.save,
        label: saved ? t.inbox.libraryUnsave : t.inbox.librarySave,
        onSelect: () => void toggleLibrary(m),
      })
    }
    /**
     * บันทึกการรับเงินจากรูปนี้ — เฉพาะรูปจริง (ไม่ใช่สติกเกอร์/การ์ด) และมีใบที่ค้างชัดเจนใบเดียว
     *
     * 🛑 **"แนบสลิป ≠ ได้รับเงิน"** (มติหัวหน้าข้อ 1) — ปุ่มนี้เปิดชีตให้คนยืนยันยอดเอง
     * ไม่ได้บันทึกเงินให้ทันที การอ่านตัวเลขจากรูปแล้วบันทึกเองคือการแต่งข้อเท็จจริงทางการเงิน
     */
    if (
      slipTarget &&
      m.type === 'IMAGE' &&
      m.imageUrl &&
      !m.isSticker &&
      !m.isDeleted &&
      !m._status
    ) {
      list.push({
        key: 'record-payment',
        icon: 'cash-banknote',
        label: 'บันทึกรับเงิน',
        onSelect: () => setSlipPayFileId(m.imageUrl!),
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
   * เงื่อนไขที่กดไม่ได้: ข้อความถูกลบ, ข้อความ optimistic/ยังส่งไม่สำเร็จ (ยังไม่มี mid ให้ Meta ผูก),
   * และ (CR 2026-08-23) แถวที่ยังอยู่ในคิว — บันทึกลง DB แล้วมี uuid จริง แต่ยังไม่เคยยิงออกช่องทาง
   * จึงยังไม่มี mid เช่นกัน
   */
  const actionTargetReactions: MessageReactionOption[] = (() => {
    const m = actionTarget?.message
    if (
      !m ||
      m.isDeleted ||
      m._status ||
      m.id.startsWith('local-') ||
      (m as ChatMessageWithDelivery).deliveryStatus === 'QUEUED'
    )
      return []
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

  // composer improvement #4 — เลือกสินค้า: 3 โหมดแรกเติมลงช่องพิมพ์ (คนตรวจก่อนกดส่งเสมอ)
  // 🛑 ตั้งแต่ 2026-08-11 มีโหมดที่ 4 ที่ **ส่งออกเอง** — ประโยคเดิมตรงนี้เขียนว่า "ทุกโหมด...ไม่ส่งเอง"
  // ซึ่งกลายเป็นเท็จตั้งแต่วันที่เพิ่มโหมดนั้น (คอมเมนต์ที่อ้างพฤติกรรมของโค้ดต้องขยับตามโค้ด — HR16)
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
  // M1: callback ที่ส่งเข้า ThreadMessageList (React.memo) ต้อง identity คงที่ — ประกาศก่อน early return
  // ทั้งหมดเพราะเป็น hook (ห้ามอยู่ใต้ if/return). ตัวที่อ้าง slideIndexByMessageId อ่านสดตอนถูกเรียก
  const toggleLibraryStable = useStableCallback(toggleLibrary)
  const openDraftStable = useStableCallback(openDraft)
  const openEditOrderStable = useStableCallback(openEditOrder)
  const jumpToMessageStable = useStableCallback(jumpToMessage)
  const openSlide = useStableCallback((key: string) => setLightboxIndex(slideIndexByMessageId.get(key) ?? -1))


  // ── 00019-ext คำแนะนำอัตโนมัติ (Typhoon) ─────────────────────────────────────
  // 🛑 อยู่เหนือ early return (errorState/loadingInitial) ทั้งหมด — hook ใต้ return = จอขาวเมื่อสถานะเปลี่ยน
  // latest = ข้ามการ์ด AUTO_ORDER_RESULT (บันทึกภายใน ไม่ใช่ข้อความจริง — server ข้ามเหมือนกัน)
  // และ anchor = ข้อความ BUYER ล่าสุดในนั้น · enabled=false → hook ไม่ fetch/ไม่มี timer เลย
  const autoSuggestOn = aiSuggestMode === 'auto'
  let latestRealMsg: (typeof messages)[number] | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type !== AUTO_ORDER_RESULT_TYPE) {
      latestRealMsg = messages[i]
      break
    }
  }
  const latestMessageIsBuyer = latestRealMsg?.senderRole === 'BUYER'
  const autoSuggest = useAutoSuggest({
    enabled: autoSuggestOn,
    conversationId,
    latestBuyerMessageId: latestMessageIsBuyer ? latestRealMsg!.id : null,
    latestMessageIsBuyer,
  })
  const aiState = autoSuggest.state
  const aiAnchorId = aiState?.anchorMessageId ?? null
  const aiAttempt = aiState && 'attempt' in aiState ? aiState.attempt : null
  const aiKey = aiAnchorId !== null ? `${aiAnchorId}-${aiAttempt}` : null
  // 00019-ext-mem: แผงลูกค้าแตะแถวสินค้า → เปิดถาดสินค้าพร้อมติ๊กไว้ (nonce ทำให้กดซ้ำแถวเดิมก็ remount) — ไม่ส่งอัตโนมัติ
  const [preselect, setPreselect] = useState<{ id: string; nonce: number } | null>(null)
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<{ productId?: string }>).detail?.productId
      if (!id) return
      setActivePanel('product')
      setPreselect((p) => ({ id, nonce: (p?.nonce ?? 0) + 1 }))
    }
    window.addEventListener(PRODUCT_TRAY_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(PRODUCT_TRAY_OPEN_EVENT, onOpen)
  }, [])
  // ติ๊กล่วงหน้าใช้ได้ "ครั้งเดียว" — ถาดปิด หรือสลับห้อง (ChatThread ไม่ remount) ต้องล้าง
  // ไม่งั้นเปิดถาดตามปกติครั้งถัดไปจะมีสินค้าเก่าติ๊กค้าง แล้วผู้ขายเผลอส่งการ์ดผิดให้ลูกค้าอีกห้อง
  const productTrayOpen = activePanel === 'product'
  useEffect(() => {
    if (!productTrayOpen) setPreselect(null)
  }, [productTrayOpen])
  useEffect(() => {
    setPreselect(null)
  }, [conversationId])
  // คำแนะนำใหม่พร้อม (anchor/attempt เปลี่ยน) = ความจำอาจเพิ่งอัปเดต → ให้แผงดึงใหม่ · deps เป็น primitive
  const aiReadyKey = aiState?.status === 'READY' ? aiKey : null
  useEffect(() => {
    if (aiReadyKey !== null) dispatchMemoryPoke()
  }, [aiReadyKey])
  // ค่า dismissed/recalled เทียบกับ anchor ตรง ๆ ใน getAutoSuggestView → anchor ใหม่ = ค่าเก่าไม่ตรง = หมดผลเอง ไม่ต้องมี effect ล้าง
  const [dismissedAnchorId, setDismissedAnchorId] = useState<string | null>(null)
  const [recalledAnchorId, setRecalledAnchorId] = useState<string | null>(null)
  // feedback ท้องถิ่นต่อ anchor-attempt: key ไม่ตรง = ไม่ใช้ (attempt ใหม่เริ่มสะอาด)
  const [aiLocal, setAiLocal] = useState<{
    key: string
    feedback: AutoSuggestFeedback | null
    reason: AutoSuggestFeedbackReason | null
    note: string
  } | null>(null)
  const aiView = getAutoSuggestView({
    mode: aiSuggestMode,
    status: aiState?.status === 'READY' ? 'ready' : aiState?.status === 'THINKING' ? 'thinking' : 'none',
    anchorIsLatestBuyer: aiAnchorId !== null, // hook กรอง isResultCurrent ให้แล้ว
    typing: text.trim() !== '',
    dismissedAnchorId,
    anchorId: aiAnchorId,
    recalledAnchorId,
    activePanel,
    composerDisabled,
  })
  const aiLive = aiLocal && aiLocal.key === aiKey ? aiLocal : null
  const aiFeedback = aiLive ? aiLive.feedback : aiState?.status === 'READY' ? aiState.feedback : null
  const sendAiFeedback = (next: { feedback: AutoSuggestFeedback; reason?: AutoSuggestFeedbackReason; note?: string }) => {
    if (aiAnchorId === null || aiAttempt === null || aiKey === null) return
    const prev = aiLive
    // server เขียนทับ reason + note ทุกครั้ง (ไม่ส่ง = null) → DOWN ต้องพก note เดิมไปด้วยเสมอ ไม่งั้นเปลี่ยนเหตุผลแล้ว note ใน DB หาย
    // ส่วน UP ตั้งใจล้างทั้งคู่
    const note = next.feedback === 'DOWN' ? (next.note ?? prev?.note ?? '') : ''
    setAiLocal({ key: aiKey, feedback: next.feedback, reason: next.reason ?? null, note })
    autoSuggest
      .sendFeedback({
        anchorMessageId: aiAnchorId,
        attempt: aiAttempt,
        feedback: next.feedback,
        ...(next.reason ? { reason: next.reason } : {}),
        ...(note ? { note } : {}),
      })
      .catch(() => {
        // ล้ม → ย้อนเงียบ (คำแนะนำเป็นของช่วย ไม่ใช่ข้อมูลสำคัญ)
        setAiLocal(prev)
      })
  }

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

  // ข้อความล่าสุดส่งมานานเกิน 1 นาทีแล้ว → ซ่อนเวลา (ส่งเป็น boolean ให้ ThreadMessageList — ไม่ส่ง nowMs เข้าไป)
  const lastMsg = messages[messages.length - 1]
  const lastMsgIsOld = !!lastMsg && Date.now() - new Date(lastMsg.createdAt).getTime() >= 60 * 1000

  // read receipt (feature 00018) — ป้าย "อ่านแล้ว/ส่งแล้ว" โชว์เฉพาะข้อความ SHOP ตัวสุดท้าย (ช่องทางนอก)
  // 🛑 (CR 2026-08-23) ข้าม QUEUED — แก้ที่ **ต้นทาง** ไม่ใช่ไล่เติม !queued ทีละจุดที่ใช้ค่านี้:
  // แถวที่ยังอยู่ในคิวไม่มีวันเป็น lastShopMsgId ⇒ กันบั๊กที่ระดับ data flow ไม่ใช่แค่ระดับ render
  // ผลพลอยได้: ป้าย "อ่านแล้ว/ได้รับแล้ว" ของใบก่อนหน้าที่ส่งสำเร็จแล้วไม่ถูก downgrade ระหว่างรอ
  // และพอ QUEUED→SENT บันไดขยับมาเองในรอบ re-render ถัดไป ไม่ต้องมี logic พิเศษ
  const lastShopMsgId = isExternal
    ? ([...messages]
        .reverse()
        .find((m) => m.senderRole === 'SHOP' && (m as ChatMessageWithDelivery).deliveryStatus !== 'QUEUED')?.id ??
      null)
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
  /**
   * feature 00048 — สไลด์ต้องพก `libraryFileId`/`libraryMessageId` ไปด้วย ไม่ใช่แค่ src/download
   *
   * 🛑 เพราะชุดสไลด์นี้ **ปนของสองชนิด**: รูปที่ลูกค้า/ร้านส่ง (เก็บเข้าคลังได้) กับรูปในการ์ด
   * carousel ของ Facebook (เก็บไม่ได้ — มติ D-4) ถ้าไม่แยกให้ออกต่อสไลด์ ปุ่ม "เก็บเข้าคลัง"
   * จะโผล่บนการ์ดสินค้า/คำขอชำระเงินของ Meta ด้วย ทั้งที่กฎห้ามไว้ — และไม่มี gate ไหนจับได้
   * เพราะทุกอย่างเป็นสตริงที่ถูกต้องตามชนิด
   */
  const imageSlides: {
    src: string
    download: { url: string; filename: string }
    libraryFileId?: string
    libraryMessageId?: string
  }[] = []
  const slideIndexByMessageId = new Map<string, number>()
  for (const m of messages) {
    if (m.type === 'IMAGE' && m.imageUrl) {
      slideIndexByMessageId.set(m.id, imageSlides.length)
      const url = mediaSrc(m.imageUrl)
      const eligible = isLibraryEligible({
        type: m.type,
        isSticker: m.isSticker,
        fromCard: false,
        hasFile: true,
        storageKey: m.imageUrl,
      })
      imageSlides.push({
        src: url,
        download: { url, filename: m.imageUrl.split('/').filter(Boolean).pop() || 'image' },
        // ไม่เข้าเกณฑ์ (สติกเกอร์) → ไม่ใส่คีย์เลย = ปุ่มไม่ render บนสไลด์นั้น
        ...(eligible ? { libraryFileId: m.imageUrl, libraryMessageId: m.id } : {}),
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

  /** สไลด์ที่กำลังแสดงอยู่จริง (อาจ undefined ระหว่างที่ยังไม่เปิด — ผู้เรียกเช็คด้วย ?.) */
  const lightboxSlide = imageSlides[lightboxViewIndex]

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
          ? t.inbox.windowStatusCommentReplyShort
          : t.inbox.windowStatusNeverInboundShort
        : humanAgentOpen
          ? t.inbox.windowStatusHumanAgentShort
          : t.inbox.windowStatusExpiredShort,
      detail: (
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${soft ? 'bg-info/15 text-info-ink' : 'bg-warning/15 text-warning-ink'}`}>
          <Icon icon={soft ? 'info-circle' : 'alert-triangle'} className="mt-0.5 shrink-0 text-lg" />
          <span>
            {neverInbound ? (
              isCommentReplyThread ? (
                // "แชทนี้" ไม่ใช่ "เธรดนี้" — PRODUCT.md ผูกกลุ่มผู้ใช้ digital-literacy ต่ำไว้
                // คำทับศัพท์แบบนี้คือ jargon ที่ต้องตัด (impeccable clarify 2026-08-03)
                t.inbox.windowStatusCommentReplyDetail
              ) : (
                t.inbox.windowStatusNeverInboundDetail
              )
            ) : humanAgentOpen ? (
              // ระดับกลาง: เกิน 24 ชม. แต่ยังตอบได้ด้วย HUMAN_AGENT — ต้องบอกข้อจำกัดให้ครบ
              // เพราะผู้ขายอาจเผลอส่งโปรโมชันซึ่งผิดนโยบายและทำให้แอปโดนระงับได้
              // ประโยคเดียวใน dictionary มี {date} — split เพื่อทำตัวหนาเฉพาะวันที่ ลำดับคำจึงเป็นของแต่ละภาษาเอง
              <>
                {t.inbox.windowStatusHumanAgentDetail.split('{date}')[0]}
                <span className="font-semibold">{humanAgentExpiresAt ? formatDateTime(humanAgentExpiresAt) : t.inbox.windowStatusHumanAgentFallbackExpiry}</span>
                {t.inbox.windowStatusHumanAgentDetail.split('{date}')[1]}
              </>
            ) : (
              // ห้ามเขียนว่า "เกิน 7 วัน" ตรงนี้ (impeccable clarify 2026-08-03) — สาขานี้เข้าเมื่อ
              // humanAgentOpen เป็นเท็จ ซึ่งเกิดได้จาก 2 เหตุ: (ก) เกิน 7 วันจริง หรือ (ข) canUseHumanAgent()
              // ที่ server ตอบ false — คือสวิตช์ใหญ่ระดับระบบปิดอยู่ (ยังไม่ผ่าน App Review) และ PSID/IGSID
              // ของเธรดนี้ไม่อยู่ใน allow-list ทดสอบด้วย (feature 00043 — เดิมเช็คแค่สวิตช์เดียว
              // ไม่มี allow-list รายเธรด)
              // → ร้านที่ลูกค้าเพิ่งเงียบไป 25 ชม. เห็นข้อความ "เกิน 7 วัน" ที่ไม่จริง
              // เขียนเป็น 24 ชม. แทน — จริงทั้งสองเหตุ (7 วันก็เกิน 24 ชม. อยู่แล้ว)
              t.inbox.windowStatusExpiredDetail
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

  /**
   * "ที่มาของแชท" — ยุบเหลือบรรทัดเดียว (user report 2026-08-11: "panel ด้านบน มันซ้อนกันเยอะ
   * จนใช้ยาก") เดิมสามก้อนนี้เป็นแถบของตัวเองเรียงซ้อนกันใต้หัวเธรด รวม ~142-170px บนมือถือ
   *
   * 🛑 **ลำดับใน array คือลำดับความสำคัญ และตัวแรกคือตัวที่โชว์ตอนยุบ — ห้ามสลับ**
   *
   *   1. ชื่อร้าน — คอมเมนต์เดิมของบล็อกนี้เขียนไว้เองว่าเป็นข้อมูลที่ต้องรู้ **ก่อนพิมพ์**
   *      (ตอบในนามใคร) ส่วนอีกสองอันเป็นข้อมูล "เฝ้าดู" ระหว่างคุย. ถ้ามันไปอยู่หลัง +N
   *      ผู้ขายหลายร้านจะตอบลูกค้าในนามร้านผิด ซึ่งถอนคืนไม่ได้ — ต่างจากการไม่เห็นว่าแชท
   *      มาจากโฆษณาชิ้นไหน ซึ่งกดกางดูได้ตลอดเวลา
   *   2. คอมเมนต์ — ถือคำถามจริงของลูกค้า ซึ่งเป็นเหตุผลที่การ์ดนี้ถูกสร้างขึ้นแต่แรก
   *      (user report 2026-08-09: "เปิดห้องมาแล้วไม่รู้ว่าตอบเรื่องอะไร")
   *   3. โฆษณา — ข้อมูลครั้งเดียวจบ และปิดถาวรได้อยู่แล้ว
   *
   * `detail` ของแต่ละตัวคือ JSX ก้อนเดิมยกมาทั้งดุ้น ไม่แก้เนื้อใน — งานนี้เปลี่ยน "ที่เก็บ"
   * ไม่ได้ออกแบบเนื้อหาใหม่
   */
  /** สรุปชิปสถานะออเดอร์ — คำและไอคอนมาจาก OrderProgressBar ที่เดียว ห้ามประกอบเองที่นี่ (HR16) */
  const orderChip = customerPanelData
    ? orderProgressChip({ orders: customerPanelData.orders, vertical: customerPanelData.vertical })
    : null

  const contextItems: ThreadContextItem[] = []
  /**
   * แบนเนอร์ "แชทนี้ตอบกลับจากโฆษณาของคุณ" — แสดงเต็มแถบเหมือนเดิม ไม่ยุบเป็นชิปในแถบ
   *
   * user สั่งกลับ 2026-09-09: "อยากให้แสดงแบบเดิม ... ไม่ชอบ pill แบบปัจจุบัน"
   * เหตุผลที่มันต่างจากที่มาอื่น ๆ ในแถบชิป: ที่มาอื่นตอบว่า "ห้องนี้มาจากไหน" ซึ่งดูครั้งเดียวก็พอ
   * ส่วนโฆษณาผู้ขายต้องอ่าน *เนื้อโฆษณา* เพื่อรู้ว่าลูกค้าเห็นข้อเสนออะไรมาก่อนทัก — ยุบเป็นชิป
   * แล้วต้องกดกางทุกครั้งจึงเป็นการซ่อนสิ่งที่ต้องใช้ตอบลูกค้า
   * ปุ่ม ✕ ยังปิดถาวรต่อเธรดได้เหมือนเดิม (localStorage) สำหรับคนที่อ่านแล้ว
   */
  let adBanner: React.ReactNode = null
  if (shopName) {
    contextItems.push({
      key: 'shop',
      thumbUrl: null,
      icon: 'building-store',
      // ประโยคสมบูรณ์ในตัวเอง → ไม่มีคำนำประเภท (ดู `label` ใน ThreadContextBar)
      label: null,
      short: fmt(t.inbox.contextBar.shopReplyingShort, { shop: shopName }),
      detail: (
        /* feature 00037 — display-only โดยตั้งใจ (มติ Q-3): กดไม่ได้ — บนมือถือ ChatHeader ถูกซ่อน
           ในหน้าเธรดอยู่แล้ว การทำให้ดูกดได้แล้วพาไปที่ที่เข้าไม่ถึงแย่กว่าไม่ให้กด
           สีพื้น bg-primary/5 เดิมถูกถอด: ตอนนี้มันเป็น 1 ใน 3 รายการของแถบเดียวกัน ถ้ายังมี
           พื้นสีเฉพาะตัว แถบจะเปลี่ยนสีไปมาตามว่ารายการแรกคืออะไร */
        <div
          className="border-default-200 text-default-800 flex items-center gap-1.5 border-b px-4 py-1.5 text-xs"
          role="note"
        >
          <Icon icon="building-store" className="text-default-700 shrink-0 text-sm" />
          <span className="min-w-0 truncate">
            {t.inbox.contextBar.shopReplyingPrefix} <span className="font-semibold">{shopName}</span>
          </span>
        </div>
      ),
    })
  }
  if (commentOrigin) {
    /**
     * ข้อความที่จะแสดงแทนคอมเมนต์ — คำนวณครั้งเดียวแล้วใช้ทั้งบรรทัดยุบและตัวกาง
     * (ของเดิมเขียนนิพจน์เดียวกันซ้ำ 2 ที่ ⇒ แปลจุดหนึ่งแล้วลืมอีกจุดได้โดยไม่มีอะไรฟ้อง)
     */
    const commentText =
      commentOrigin.message?.trim() ||
      (commentOrigin.attachmentUrl
        ? t.inbox.contextBar.commentImageOnly
        : t.inbox.contextBar.commentTextEmpty)
    contextItems.push({
      key: 'comment',
      thumbUrl: commentOrigin.postThumbnailUrl,
      icon: 'photo',
      label: t.inbox.contextBar.commentLabel,
      // คำพูดของลูกค้าคือสิ่งที่ตอบ "เปิดห้องมาแล้วต้องคุยเรื่องอะไร" ได้เร็วที่สุด
      // (ชื่อโพสต์เป็นบริบทรอง อยู่ในตัวกาง)
      short: commentText,
      detail: (
        /**
         * ที่มาของเธรด: คอมเมนต์ใต้โพสต์ — แถวเดียวติดหัวแชท ที่เดียวกับแบนเนอร์โฆษณา
         *
         * user สั่ง 2026-08-10 หลังเห็นรุ่นแรก: *"ต้อง merge เป็นด้านบนที่เดียว"* + *"ด้านล่าง …
         * เอาออกเลย"* + *"มันกินพื้นที่เวลาอยู่บน mobile"* — เดิมเป็นการ์ดในสตรีมข้อความสูง ~5 บรรทัด
         *
         * ยุบแล้วยัง **ไม่ทิ้งข้อมูล** — ทั้ง "โพสต์ไหน" และ "ลูกค้าคอมเมนต์ว่าอะไร" อยู่ครบใน 2 บรรทัด
         *
         * ไม่มีปุ่มปิดแบบแบนเนอร์โฆษณา — โฆษณาเป็นข้อมูลครั้งเดียวจบ ส่วนคอมเมนต์ต้นเหตุคือบริบทของ
         * ทั้งห้องที่ผู้ขายอ้างถึงได้ตลอดบทสนทนา
         */
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
              {commentOrigin.postMessage?.trim() || t.inbox.contextBar.commentPostEmpty}
            </p>
            <div className="flex min-w-0 items-center gap-2">
              {/* ไอคอนนำหน้าทำให้แยกออกทันทีว่าบรรทัดนี้คือ "คำพูดของลูกค้า" ไม่ใช่ส่วนต่อของ
                  ข้อความโพสต์ด้านบน — สองก้อนเป็นข้อความยาวคล้ายกันวางติดกัน (ux ทักไว้) */}
              <Icon icon="message-2" className="text-default-500 size-3.5 shrink-0" aria-hidden="true" />
              {/* min-w-0: flex item มี min-width:auto เป็นค่าตั้งต้น ⇒ truncate อย่างเดียวไม่ทำให้
                  span หดต่ำกว่าเนื้อหาได้ พอลิงก์ "ดูคอมเมนต์" (shrink-0) แย่งพื้นที่ไปด้วย
                  แถวจะล้นแทนที่จะถูกตัด — ชัดขึ้นเมื่อ chrome เป็นอังกฤษซึ่งยาวกว่าไทย
                  (docs/conventions/flex-header-truncation.md) */}
              <span
                className="text-default-700 min-w-0 truncate text-sm"
                title={commentOrigin.message ?? undefined}
              >
                {commentText}
              </span>
              {commentOrigin.url && (
                <a
                  href={commentOrigin.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary shrink-0 text-sm font-medium hover:underline"
                >
                  {t.inbox.contextBar.viewComment}
                </a>
              )}
            </div>
          </div>
        </div>
      ),
    })
  }
  if (showAdBanner && adReferral) {
    /**
     * ลำดับ: ข้อความโฆษณาจริง > ชื่อ ad ใน Ads Manager > รหัสโฆษณา — ใช้ทั้งบรรทัดยุบและตัวกาง
     *
     * กิ่งสุดท้ายกันกรณีที่ `adId` เป็น null ด้วย ซึ่ง server บอกว่าเกิดไม่ได้ (กรองมาแล้วว่าต้องมี
     * อย่างน้อยหนึ่งใน adBody/adTitle/adId — ดู type ที่บรรทัด ~688) แต่ชนิดฝั่ง client ยังเป็น
     * nullable ⇒ ของเดิมเขียนเป็น template literal ซึ่งจะพิมพ์คำว่า "null" ออกจอเงียบ ๆ
     * โดย tsc ไม่ทัก (template literal รับ null ได้)
     */
    const adText =
      adReferral.adBody ??
      adReferral.adTitle ??
      (adReferral.adId
        ? fmt(t.inbox.contextBar.adIdFallback, { adId: adReferral.adId })
        : t.inbox.contextBar.adBannerTitle)
    adBanner = (
        /* feature 00018 E5 — ที่มาจากโฆษณา: รูปโฆษณา + "ตอบกลับจากโฆษณา" + ชื่อโฆษณา (เลิกใช้ badge
           เล็กบนหัวเธรดแบบเดิม ซึ่งชื่อโฆษณายาว ๆ ถูกตัดจนอ่านไม่ออกและไม่เห็นว่าเป็นโฆษณาชิ้นไหน)
           เป็น *ข้อมูลบริบท* ไม่ใช่คำเตือน → โทน default-100 กลาง ๆ ไม่ใช่ warning/danger ของแบนเนอร์
           24 ชม.ด้านล่าง เพื่อไม่ให้ผู้ขายอ่านผิดว่าเป็นสิ่งที่ต้องรีบจัดการ

           🛑 ปุ่ม ✕ อยู่ที่นี่เท่านั้น ไม่ยกขึ้นไปบรรทัดยุบ: ที่ 390px บรรทัดยุบมีของคงที่
           px-4(32)+thumb(20)+gap(8)+badge(24)+chevron(24)=108px เหลือข้อความ ~282px — เติม ✕
           เข้าไปเหลือ ~250px และได้ปุ่มสองตัวที่ผลลัพธ์คนละโลก (ปิดถาวร vs กางดู) ห่างกัน 8px
           Base: theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx (DismissingAlert) */
        <div className="border-default-200 flex items-center gap-3 border-b px-4 py-2.5" role="note">
          {adReferral.photoFileId ? (
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
            <p className="text-default-800 text-sm font-semibold">{t.inbox.contextBar.adBannerTitle}</p>
            <div className="flex min-w-0 items-center gap-2">
              {/* adBody คือตัวที่ผู้ขายอ่านแล้วรู้ทันทีว่าโฆษณาชิ้นไหน — ad_title เป็นชื่อภายใน
                  min-w-0 ด้วยเหตุผลเดียวกับแถวคอมเมนต์ด้านบน (truncate ในกล่อง flex ต้องมาเป็นชุด) */}
              <span
                className="text-default-700 min-w-0 truncate text-sm"
                title={adReferral.adBody ?? adReferral.adTitle ?? undefined}
              >
                {adText}
              </span>
              {adReferral.permalink && (
                <a
                  href={adReferral.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary shrink-0 text-sm font-medium hover:underline"
                >
                  {t.inbox.contextBar.viewAd}
                </a>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={dismissAdBanner}
            title={t.inbox.contextBar.dismissAdSource}
            aria-label={t.inbox.contextBar.dismissAdSource}
            className="btn btn-icon text-default-700 hover:bg-default-100 shrink-0"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>
    )
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
            title={t.inbox.backToList}
            aria-label={t.inbox.backToList}
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
            title={fmt(t.inbox.windowClosingSoon, { remaining: formatCountdown(liveRemaining, t) })}
          >
            <Icon icon="alert-triangle" className="shrink-0 text-base" />
            {/* จอแคบเหลือ "เหลือ M:SS" — ยังเป็นคำ ไม่ใช่ไอคอนลอย ๆ ให้เดาความหมาย */}
            <span className="lg:hidden">เหลือ {formatCountdownShort(liveRemaining)}</span>
            <span className="hidden lg:inline">{fmt(t.inbox.windowClosingSoon, { remaining: formatCountdown(liveRemaining, t) })}</span>
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
        {/**
         * คลังไฟล์ — ปุ่มระดับหนึ่งในหัวเธรด (2026-08-14, แบบ A ในม็อกอัพ)
         *
         * ที่มา: user เจอเองบนมือถือ "จะเข้าไปดูไฟล์ที่ใช้ร่วมกันยากมาก" — เดิมทางไปไฟล์คือ 4 ชั้น
         * (ปุ่มข้อมูลลูกค้า → ชีต → แท็บ customer → เลื่อนลงล่างสุด) ตอนนี้เหลือ **1 แตะ**
         *
         * 🛑 ตัวนับมาจาก `savedFiles.size` ซึ่ง server seed มาแล้ว (`listSavedFileIds` ใน page.tsx)
         * และ `toggleLibrary` อัปเดตแบบ optimistic อยู่แล้ว ⇒ **ไม่มี request เพิ่มแม้แต่ใบเดียว**
         * และตัวเลขขยับทันทีที่กดเก็บ ไม่ต้องรอ refetch
         *
         * ซ่อนที่ `xl` เหมือนปุ่มเดิม — ที่ ≥1280px มี CustomerPanel เป็นคอลัมน์ถาวรอยู่ข้าง ๆ แล้ว
         * (breakpoint ต้องตรงกับ `xl:block` ของคอลัมน์ขวาใน page.tsx เสมอ)
         */}
        {/**
         * แถบ ปิด / อัตโนมัติ ของ auto-reply รายห้อง (2026-08-27, user ส่งภาพ segmented pill มา)
         *
         * `ms-auto` อยู่ที่นี่แทนที่จะเป็นปุ่มคลังไฟล์ — ตัวแรกที่มี ms-auto คือตัวที่กินที่ว่าง
         * ทั้งหมด ปุ่มถัดไปจึงเรียงชิดขวาตามเดิมทุกตัว (ปุ่มคลังไฟล์ยังมี ms-auto ของตัวเองไว้
         * สำหรับตอน <md ที่แถบนี้ไม่ถูก render)
         *
         * `hidden md:flex` — user สั่งเฉพาะ desktop. ที่ 320px แถบนี้กว้าง ~150px ซึ่งกินที่ของ
         * ชื่อลูกค้าที่เหลืออยู่ 85px จนหมด (เลขเต็มอยู่ที่กลุ่มปุ่มขวาด้านล่าง) จอแคบจึงใช้
         * `variant="icon"` ของตัวเดียวกันแทน — ไม่ปล่อยให้มือถือเข้าไม่ถึงสิ่งที่เดสก์ท็อปมี
         *
         * ไม่ render เมื่อ `botCouldReply=false` ด้วยเหตุผลเดียวกับ BotPausedBanner — ร้านที่ยัง
         * ไม่มีบอทตัวไหนทำงานเลย การให้เลือก "อัตโนมัติ" คือการเสนอสิ่งที่ไม่มีทางเกิดขึ้น
         */}
        {botCouldReply && (
          <ThreadAutoReplyToggle
            conversationId={conversationId}
            enabled={botAutoReplyEnabled}
            className="ms-auto hidden md:flex"
          />
        )}

        {/**
         * กลุ่มปุ่มขวาของหัวเธรด — `gap-1` ไม่ใช่ `gap-3` ของ `.card-header` (2026-08-27 รอบสอง)
         *
         * 🛑 การยุบ gap คือสิ่งที่ทำให้ "มือถือเห็นกระดิ่ง + ข้อมูลลูกค้าตรง ๆ" เป็นไปได้จริง —
         * กางงบที่ 320px (`.card-header px-5`=40 · `gap-3`=12 · `.btn.btn-icon`=37 · avatar=36):
         *
         * ส่วนคงที่ = 40 + 37(back) + 12 + 36(avatar) + 12 + [ชื่อ] + 12 = **149 + ชื่อ + กลุ่มปุ่ม**
         *
         *   เดิม (folder + `⋯` ที่ gap-3)      กลุ่ม 86  → 235 → ชื่อ **85px @320 · 140px @375**
         *   เติม bell+customer ที่ gap-3 เท่าเดิม  กลุ่ม 184 → 333 → ชื่อ **−13px** ใส่ไม่ลงเลย
         *   ── มติปัจจุบัน: gap-1 + [ตอบอัตโนมัติ][ข้อมูล][`⋯`] ──
         *   2 ปุ่ม (ร้านไม่มีบอท)               กลุ่ม 78  → 227 → ชื่อ **93px @320 · 148px @375**
         *   3 ปุ่ม (ร้านมีบอท)                  กลุ่ม 119 → 268 → ชื่อ **52px @320 · 107px @375**
         *
         * 🛑 ลำดับความสำคัญที่ user เคาะสำหรับจอแคบ: **ตอบอัตโนมัติ > ข้อมูลลูกค้า > เสียง**
         * เสียงเป็นของที่ตั้งครั้งเดียวแล้วแทบไม่แตะอีก จึงเป็นตัวเดียวที่ยอมให้ลึกลงไปอยู่ใน `⋯`
         *
         * 🛑 ปุ่มคลังไฟล์ถูกถอด (user: "ปุ่มมันเยอะไปป่ะ") — ไม่ใช่การกลับมติ 2026-08-14 แต่เพราะ
         * **เงื่อนไขที่ทำให้มันเกิดหมดไปแล้ว**: ตอนนั้นไฟล์อยู่ลึก 4 ชั้นเพราะปุ่ม "ข้อมูลลูกค้า"
         * ไม่มีบนมือถือ ตอนนี้ปุ่มนั้นอยู่บนแถบแล้ว ไฟล์เหลือ 2 แตะ และทั้งสองปุ่มเปิด **ชีตใบเดียวกัน**
         * ต่างแค่แท็บ ⚠️ ของที่หายไปด้วยคือตัวนับ "มีไฟล์ N ใบ" ที่เคยเกาะมุมปุ่ม — ยังไม่ได้ย้ายไปไหน
         */}
        <div className="ms-auto flex shrink-0 items-center gap-1">

        {/* จอแคบ: ไอคอนกดสลับตอบอัตโนมัติ — มาก่อนเสมอตามลำดับที่ user เคาะ
            ≥768px ใช้แถบ segmented ที่อยู่ก่อนกลุ่มนี้แทน (component เดียวกัน คนละ variant) */}
        {botCouldReply && (
          <ThreadAutoReplyToggle
            conversationId={conversationId}
            enabled={botAutoReplyEnabled}
            variant="icon"
            className="md:hidden"
          />
        )}

        {/* เสียงแจ้งเตือนของแชทนี้ — ≥768px เป็นปุ่มกระดิ่งของตัวเอง (user: "ไม่ต้องมี dropdown
            บน desktop ให้ desktop แสดง icon เต็ม ๆ ไปเลย") · จอแคบอยู่ในเมนู `⋯` ท้ายแถว
            (เหตุผลเดิมของ 2026-08-10 ยังอยู่: บนมือถือในห้องแชทต้องกดถึงสวิตช์เสียงได้เสมอ) */}
        <ThreadSoundButton conversationId={conversationId} />
        {/**
         * ข้อมูลลูกค้า — ปุ่มของตัวเองเมื่อ "มีที่ว่างพอ" เท่านั้น (2026-08-14,
         * user: "พวก action อื่นก็ควรแสดงไหม ถ้ามีพื้นที่พอ")
         *
         *   <1280px  โผล่ — 🛑 2026-08-27 user สั่งตรง ๆ ว่ามือถือต้องเห็นปุ่มนี้ ไม่ต้องกดเมนูก่อน
         *            (เดิม `hidden md:inline-flex`) ที่ว่างมาจากการยุบ gap ของกลุ่มปุ่มขวาเป็น
         *            `gap-1` + ถอดปุ่มคลังไฟล์ ดูงบเต็มที่หัวกลุ่มปุ่มด้านบน
         *   ≥1280px  ซ่อน — CustomerPanel เป็นคอลัมน์ถาวรอยู่ข้าง ๆ แล้ว (ต้องตรงกับ `xl:block`
         *            ของคอลัมน์ขวาใน page.tsx เสมอ — ช่วง iPad Pro 1024–1279 เคยตกหล่นมาแล้ว)
         */}
        <button
          type="button"
          onClick={() => openPanel('customer')}
          title={t.inbox.customerInfo}
          aria-label={t.inbox.customerInfo}
          className="btn btn-icon border-default-300 text-default-700 hover:bg-default-100 shrink-0 xl:hidden"
        >
          <Icon icon="user-circle" className="text-lg" />
        </button>

        {/* `⋯` จอแคบเท่านั้น — ถือของชิ้นเดียวคือสวิตช์เสียง (user เคาะ 2026-08-27)
            ตัวปุ่มมีจุด `bell-off` ซ้อนมุมเมื่อห้องนี้เงียบ ⇒ อ่านสถานะได้โดยไม่ต้องเปิดเมนู */}
        <ThreadOverflowMenu conversationId={conversationId} />
        </div>
      </div>

      {/**
       * ที่มาของแชท — ยุบเหลือบรรทัดเดียว กดกางเห็นครบ (user report 2026-08-11)
       *
       * เดิมที่นี่เป็นสามบล็อกเรียงซ้อนกัน (ชื่อร้าน ~28px + โฆษณา ~57px + คอมเมนต์ ~57px)
       * รายการและลำดับความสำคัญประกอบไว้ที่ `contextItems` ด้านบน — ดูเหตุผลของลำดับที่นั่น
       *
       * อยู่ "เหนือ" ThreadStatusBar เหมือนตำแหน่งเดิมของก้อนที่มันแทนที่: บริบท → คำเตือน →
       * ความคืบหน้า (แถบนี้เป็นส่วนต่อของหัวเธรด ส่วนคำเตือนเป็นการ์ดลอยที่แทรกเข้ามา)
       */}
      {/**
       * แถวชิปเดียวใต้หัวเธรด (2026-08-14) — แทนที่ 3 แถบที่เคยเรียงซ้อนกัน
       * (ThreadContextBar "ที่มา" + ThreadStatusBar "คำเตือน" + OrderProgressBar "สถานะออเดอร์")
       *
       * ลำดับใน array = ลำดับความสำคัญบนแถว และเป็นตัวตัดสินว่า `action` ของใครถูกยกขึ้นแถว:
       *   คำเตือน (ต้องลงมือ) → สถานะออเดอร์ (กำลังเกิดขึ้น) → ที่มาของแชท (อ้างอิง)
       * ซึ่งเป็นลำดับเดิมของ 3 แถบเป๊ะ ๆ แค่เปลี่ยนจาก "เรียงลงมา" เป็น "เรียงไปทางขวา"
       *
       * เหตุผลของลำดับภายในแต่ละกลุ่มอยู่ที่จุดที่ประกอบ array นั้น (`threadStatuses`/`contextItems`)
       */}
      <ThreadChipStrip
        items={[
          ...threadStatuses.map<ThreadChipItem>((it) => ({
            key: `status:${it.key}`,
            tone: it.tone,
            icon: it.icon,
            short: it.short,
            detail: it.detail,
            action: it.action,
          })),
          /**
           * ชิปสถานะออเดอร์ — เฉพาะ <1280px เหมือนเดิม (จอ xl มี CustomerPanel เห็นการ์ด+timeline
           * อยู่แล้ว) 🛑 breakpoint ต้องตรงกับ `xl:block` ของคอลัมน์ขวาใน page.tsx เสมอ —
           * ช่วง iPad Pro 1024–1279 เคยตกหล่นทั้งสองทางมาแล้ว
           *
           * ตัดสินด้วย `isXlUp` (matchMedia) ไม่ใช่ `xl:hidden` เพราะที่นี่เป็น **ข้อมูลในอาร์เรย์**
           * ไม่ใช่ element — ซ่อนด้วย CSS จะได้ชิปที่ยังนับอยู่ใน items แต่มองไม่เห็น (แถวว่างที่ยัง
           * กินความสูง + `action` ที่ถูกยกจากชิปที่ไม่มีใครเห็น)
           */
          ...(!isXlUp && customerPanelData && orderChip
            ? [
                {
                  key: 'order',
                  tone: 'order' as const,
                  icon: orderChip.icon,
                  short: orderChip.count > 1 ? `${orderChip.short} +${orderChip.count - 1}` : orderChip.short,
                  detail: (
                    <OrderProgressBar
                      variant="detail"
                      orders={customerPanelData.orders}
                      // ร้านคิวงานไล่แกน "นัดถึงขั้นไหน" ไม่ใช่ "ของอยู่ไหน" (user report 2026-08-08)
                      vertical={customerPanelData.vertical}
                      conversationId={conversationId}
                      customerName={buyerName}
                      channel={channel}
                      customerAvatar={buyerAvatar}
                      pageAvatarUrl={channelAvatarUrl}
                      // ร้านของเธรด ไม่ใช่ร้านที่ active — เปิดเธรดข้ามร้านได้ (BR-UNI-07)
                      shopId={shopId}
                    />
                  ),
                },
              ]
            : []),
          ...contextItems.map<ThreadChipItem>((it) => ({
            key: `ctx:${it.key}`,
            tone: 'context',
            icon: it.icon,
            thumbUrl: it.thumbUrl,
            // ชิปมีที่แค่บรรทัดเดียวสั้น ๆ — คำนำประเภท ("จากโฆษณา") สำคัญกว่าเนื้อหา
            // เพราะเนื้อหาเต็มอยู่ในตัวกางอยู่แล้ว และผู้ขายต้องรู้ก่อนว่า "ที่มาแบบไหน"
            short: it.label ?? it.short,
            detail: it.detail,
          })),
        ]}
      />
      {adBanner}

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
          <div ref={topSentinelRef} className="flex h-9 items-center justify-center">
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
          <ThreadMessageList
            messages={messages}
            conversationId={conversationId}
            channel={channel}
            buyerName={buyerName}
            buyerAvatar={buyerAvatar}
            shopAvatar={shopAvatar}
            channelAvatarUrl={channelAvatarUrl}
            shopUsername={shopUsername}
            isCommentReplyThread={isCommentReplyThread}
            neverInbound={neverInbound}
            lastShopMsgId={lastShopMsgId}
            readAtMs={readAtMs}
            deliveredAtMs={deliveredAtMs}
            lastMsgIsOld={lastMsgIsOld}
            highlightedId={highlightedId}
            savedFiles={savedFiles}
            savingFileId={savingFileId}
            metaAiMessageIds={metaAiMessageIds}
            toggleLibrary={toggleLibraryStable}
            setReplyingTo={setReplyingTo}
            setActionTarget={setActionTarget}
            openDraft={openDraftStable}
            openEditOrder={openEditOrderStable}
            openSlide={openSlide}
            jumpToMessage={jumpToMessageStable}
            resendMessage={resendMessage}
            cancelMessage={cancelMessage}
            retryMessage={retryMessage}
          />
        )}
      </div>
      {/* ปุ่ม "ข้อความใหม่" (Task 7) — Base: orders/components/BulkActionBar.tsx (pill กึ่งกลาง) แต่เป็น
          absolute ใน wrapper นี้ ทับกล่อง scroll โดยไม่ทับหัวแชท/composer · ซ่อนตอนแผงข้อความสำเร็จรูป
          คลุมพื้นที่ข้อความ (quickOpen) · z-20 = ระดับเดียวกับป้ายบนบับเบิล แต่มาทีหลังใน DOM จึงอยู่บน
          R20: ห้ามใส่ role ที่ปุ่ม (role="status" เขียนทับ role ปุ่ม) — ประกาศผ่าน span ด้านล่างแทน */}
      {unseenNewCount > 0 && !quickOpen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
          <button
            type="button"
            onClick={() => {
              // P1-c: ปุ่ม unmount ทันทีหลังกด ⇒ ย้ายโฟกัสไปกล่องข้อความก่อน ไม่งั้นตกไป <body>
              // R25: tabindex ใส่ชั่วคราวแล้วถอดตอน blur — ห้ามใส่ถาวรใน JSX เพราะ iOS Safari
              // ย้ายโฟกัสไปกล่องที่ focus ได้เมื่อแตะเธรด = คีย์บอร์ดหุบกลางการพิมพ์
              // preventScroll กันแย่งกับการเลื่อนลงล่างของ clearUnseen
              const el = scrollRef.current
              if (el) {
                el.setAttribute('tabindex', '-1')
                el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true })
                el.focus({ preventScroll: true })
              }
              clearUnseen()
            }}
            className="btn bg-primary hover:bg-primary-hover pointer-events-auto inline-flex items-center gap-1.5 rounded-full text-nowrap text-white shadow-lg"
          >
            <Icon icon="arrow-down" className="size-4.5" aria-hidden="true" />
            {t.inbox.newMessagesButton}
            <span className="badge bg-card text-primary-ink rounded-full tabular-nums">
              {unseenNewCount > 99 ? '99+' : unseenNewCount}
            </span>
          </button>
        </div>
      )}
      {/* mount ค้างตลอด — live region ที่เพิ่ง mount พร้อมข้อความมักไม่ถูกอ่าน */}
      <span role="status" className="sr-only">
        {unseenNewCount > 0 ? fmt(t.inbox.newMessagesAnnounce, { count: unseenNewCount }) : ''}
      </span>
      </div>

      {/* composer — pattern ChatPage.tsx:99-109 + auto-upload preview chip
          relative: ยึดตำแหน่งแผง AI (absolute bottom-full) ให้ลอยเหนือ composer */}
      <div className="border-t border-default-300 border-dashed relative px-4 py-3 sm:px-6 sm:py-3.75">
        {showTokenInvalidComposer ? (
          /**
           * Base: บล็อก `showAiTakeoverComposer` ด้านล่าง (โครง/คลาสเดียวกันเป๊ะ) — เปลี่ยน
           * tone info→danger, ไอคอน robot→alert-circle, ปุ่ม "ตอบเอง"→ลิงก์ไปหน้าตั้งค่า
           *
           * min-h-24 = 6rem ใน scale ปกติของ Tailwind ไม่ใช่ arbitrary value (HR7) และต้องเท่ากับ
           * บล็อก AI เพื่อไม่ให้ท้ายเธรดยุบตอนสลับสถานะ
           */
          <div className="bg-danger/15 text-danger-ink flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg px-3 py-2 text-center text-sm sm:flex-row sm:items-center sm:text-start">
            <Icon icon="alert-circle" className="shrink-0 text-lg" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              ส่งข้อความหาลูกค้าไม่ได้ตอนนี้ — การเชื่อมต่อ LINE มีปัญหา
              {/* บอกให้ชัดว่าตายข้างเดียว ไม่งั้นผู้ขายจะอ่านว่าทั้งห้องพังแล้วเลิกดูเธรดนี้ */}
              <span className="block text-xs opacity-80 sm:ms-1 sm:inline">
                (ข้อความที่ลูกค้าส่งมายังอ่านได้ตามปกติ)
              </span>
            </span>
            <Link
              href="/settings/channels"
              className="btn btn-sm bg-card text-default-700 min-h-11 shrink-0 sm:min-h-0"
            >
              อัปเดต token
            </Link>
          </div>
        ) : showAiTakeoverComposer ? (
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
              disabled={takeoverBusy}
              className="btn btn-sm bg-card text-default-700 min-h-11 shrink-0 disabled:opacity-60 sm:min-h-0"
            >
              {/* กันกดซ้ำช่วง "ก่อนโมดัลเปิด" — Swal บล็อกให้ได้เฉพาะหลังเปิดแล้วเท่านั้น และ
                  ช่วงนั้นมี dynamic import ของ sweetalert2 คั่นอยู่จริง ไม่ใช่ 0 วินาที */}
              {takeoverBusy && <Icon icon="loader-2" className="me-1 animate-spin text-base" aria-hidden="true" />}
              ตอบเอง
            </button>
          </div>
        ) : showAiTakeoverFailedComposer ? (
          /**
           * บล็อก "Meta ปฏิเสธคำขอ" (2026-08-26)
           *
           * Base: บล็อก `showTokenInvalidComposer` ด้านบนในไฟล์นี้ (โครง/คลาสเดียวกันเป๊ะ รวม
           * min-h-24 ที่ต้องเท่ากันทุกใบในตระกูลนี้ ไม่งั้นท้ายเธรดยุบตอนสลับสถานะ) — เปลี่ยนเป็น
           * 2 ปุ่มในคลัสเตอร์เดียว
           *
           * 🛑 ปุ่มทึบมีได้ใบเดียว และต้องเป็นใบที่ **แก้ปัญหาได้จริง** — ตรงนี้คือ Business Suite
           * (Meta ปฏิเสธทั้ง take และ request แล้ว การกดซ้ำจึงเป็นทางที่ *อาจ* ได้ผล ไม่ใช่ทางที่ได้ผล)
           * ท่าเดียวกับ ShipmentStatusView ที่ผูกปุ่มทึบกับชนิดของ error
           */
          <div className="bg-danger/15 text-danger-ink flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg px-3 py-2 text-center text-sm sm:flex-row sm:items-center sm:text-start">
            <Icon icon="alert-circle" className="shrink-0 text-lg" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              ส่งข้อความหาลูกค้าไม่ได้ตอนนี้ — Meta ไม่ให้ Deep ควบคุมแชทนี้แทน AI
              {/* บอกให้ชัดว่าตายข้างเดียว ไม่งั้นผู้ขายจะอ่านว่าทั้งห้องพังแล้วเลิกดูเธรดนี้
                  (ถ้อยคำเดียวกับบล็อก tokenInvalid ด้านบน — เรื่องเดียวกันต้องพูดเหมือนกัน) */}
              <span className="block text-xs opacity-80 sm:ms-1 sm:inline">
                (ข้อความที่ลูกค้าส่งมายังอ่านได้ตามปกติ)
              </span>
            </span>
            <span className="flex shrink-0 flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={retryTakeOverFromAi}
                disabled={takeoverBusy}
                title="ลองขอสิทธิ์ควบคุมอีกครั้ง"
                aria-label="ลองขอสิทธิ์ควบคุมอีกครั้ง"
                className="btn btn-icon bg-card text-default-700 min-h-11 disabled:opacity-60 sm:min-h-0"
              >
                <Icon icon={takeoverBusy ? 'loader-2' : 'refresh'} className={takeoverBusy ? 'animate-spin' : ''} />
              </button>
              <a
                href={META_BUSINESS_SUITE_INBOX_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm bg-primary text-white min-h-11 sm:min-h-0"
              >
                เข้า Business Suite
                <Icon icon="external-link" className="ms-1 text-sm" />
              </a>
            </span>
          </div>
        ) : (
          <>
        {/* แผงเหนือช่องพิมพ์ — เปิดได้ทีละแผงเท่านั้น (activePanel) จึงไม่มีทางกางซ้อนกัน
            ทั้งสามใช้โครง/สไตล์เดียวกัน ต่างแค่ accent (AI = success, สำเร็จรูป = primary,
            เลือกสินค้า = info) */}
        {autoSuggestOn &&
          (aiView === 'thinking' || aiView === 'ready') &&
          aiState &&
          aiKey !== null &&
          aiAnchorId !== null && (
            <AiSuggestInline
              key={aiKey}
              view={aiView}
              suggestion={aiState.status === 'READY' ? aiState.suggestion : ''}
              feedback={aiFeedback}
              reason={aiFeedback === 'DOWN' ? (aiLive?.reason ?? null) : null}
              savedNote={aiLive?.note ?? ''}
              regenerating={false}
              onPick={(picked) => {
                // ทางเดียวที่คำแนะนำเขียนลงช่องพิมพ์ — ต่อท้ายข้อความเดิม ไม่ทับ
                setText((prev) => (prev.trim() ? `${prev}\n${picked}` : picked))
                setRecalledAnchorId(null)
                composerRef.current?.focus()
              }}
              onLike={() => sendAiFeedback({ feedback: 'UP' })}
              onDislike={() =>
                sendAiFeedback({ feedback: 'DOWN', ...(aiLive?.reason ? { reason: aiLive.reason } : {}) })
              }
              onReason={(reason) => sendAiFeedback({ feedback: 'DOWN', ...(reason ? { reason } : {}) })}
              onNote={(note) =>
                sendAiFeedback({ feedback: 'DOWN', ...(aiLive?.reason ? { reason: aiLive.reason } : {}), note })
              }
              onRegenerate={() => {
                autoSuggest.regenerate().catch(() => pacesToast.warning(t.inbox.aiSuggestRegenBusy))
              }}
              onDismiss={() => setDismissedAnchorId(aiAnchorId)}
            />
          )}
        {!autoSuggestOn && aiOpen && (
          <AiSuggestPanel
            conversationId={conversationId}
            hidePayments={hidePayments}
            onPick={(picked) => {
              setText(picked)
              setActivePanel(null)
            }}
            onClose={() => setActivePanel(null)}
          />
        )}

        {/* แผงข้อความสำเร็จรูปย้ายไปวางทับพื้นที่ข้อความด้านบนแล้ว (ดู relative wrapper) —
            ไม่ได้อยู่เหนือ composer เหมือนแผง AI/สินค้าอีกต่อไป */}

        {/* เลือกหลายรายการเป็น "โหมด" ในแผงนี้แล้ว ไม่ใช่ชีตแยก (ยุบ ProductMultiSelectSheet ทิ้ง
            2026-08-11 — ดูเหตุผลหัวไฟล์ ProductPickerPanel) · ส่งสำเร็จ = ปิดแผงเหมือนโหมด "ส่ง
            การ์ดสินค้า" ใบเดียว · ส่งไม่สำเร็จ = แผงเปิดค้าง ของที่ติ๊กยังอยู่ครบ กดใหม่ได้ทันที */}
        {productOpen && (
          /* 🛑 key = ร้านของเธรด: ChatThread ไม่ remount ตอนสลับ conversationId (มี effect ผูก
             [conversationId] อยู่จุดเดียวทั้งไฟล์ = หลักฐานว่าไม่ remount) และ activePanel เป็น
             state ระดับนี้ — เปิดแผงค้างไว้ในเธรดร้าน A แล้วคลิกเธรดร้าน B จากรายการ แผงจะไม่
             unmount แล้วรายการสินค้าของร้าน A ค้างทับบริบทร้าน B (จอโกหก). remount ทั้ง subtree
             เคลียร์ items/selected/q/loading ให้เองโดยไม่ต้องไล่ผูก dep รายตัว — แพตเทิร์นเดียว
             กับ key={scopeKey} ที่ (chat)/layout.tsx และ inbox/comments/page.tsx ใช้อยู่แล้ว */
          <ProductPickerPanel
            key={`${threadShopIdForPanels}:${preselect?.nonce ?? 0}`}
            initialSelectedIds={preselect ? [preselect.id] : undefined}
            onPick={handleProductPick}
            disabled={composerDisabled}
            onClose={() => setActivePanel(null)}
            channel={channel}
            onSendMany={async (ids) => {
              const res = await sendProductCards(ids)
              if (res.ok) setActivePanel(null)
              return res
            }}
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

          {/* 🛑 อย่าเพิ่มปุ่ม "รูปภาพ" ที่ใส่ `accept="image/*"` เพื่อหวังข้ามเมนูของ iOS —
              ลองมาแล้วและ **ไม่ได้ผล** (ขึ้น prod 2026-08-14 แล้วถอดออกวันเดียวกัน user เป็นคนจับได้)
              iOS ขึ้นเมนู "Photo Library / Take Photo / Choose Files" เหมือนเดิมทุกประการ เพราะเว็บ
              ไม่มีวิธีสั่งปลายทางของ picker ได้เลย — `capture` มีค่าเดียวที่ใช้ได้จริงคือ "เปิดกล้อง"
              ไม่มีค่าที่แปลว่า "คลังรูป". ทางเดียวที่ทำได้คือฝั่ง native ดักการกดแล้วเปิด image picker
              ของเครื่องเอง แล้วส่งไฟล์กลับเข้าเว็บผ่าน native-bridge
              รายละเอียด: docs/superpowers/specs/2026-08-14-chat-attachment-preview-sheet.md */}

          {/* ความคืบหน้าตอนแนบหลายไฟล์ — spinner เปล่าบอกได้แค่ "กำลังทำอะไรอยู่" ซึ่งไม่พอเมื่อคิว
              มี 8 ไฟล์และแต่ละไฟล์ใช้เวลาไม่เท่ากัน (ร้านจะไม่รู้ว่าค้างหรือกำลังไป) */}
          {uploadProgress && uploadProgress.total > 1 && (
            <span className="text-default-700 shrink-0 text-xs" aria-live="polite">
              {/* ย้ายจากสตริงดิบมาเป็นคีย์ i18n — ข้อความนี้ผู้ขายเห็นตอนแนบหลายไฟล์ */}
              {fmt(t.inbox.attachUploading, {
                done: String(uploadProgress.done + 1),
                total: String(uploadProgress.total),
              })}
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
          {(!autoSuggestOn || aiView === 'recall') && (
          <button
            type="button"
            onClick={
              autoSuggestOn
                ? () => {
                    setRecalledAnchorId(aiAnchorId)
                    setDismissedAnchorId(null)
                  }
                : () => togglePanel('ai')
            }
            disabled={composerDisabled}
            aria-label={autoSuggestOn ? t.inbox.aiSuggestRecall : 'AI ช่วยร่างคำตอบ'}
            {...(autoSuggestOn ? {} : { 'aria-expanded': aiOpen })}
            title={autoSuggestOn ? t.inbox.aiSuggestRecall : 'AI ช่วยร่างคำตอบ'}
            className={`btn btn-icon hover:bg-success/10 shrink-0 ${aiOpen ? 'bg-success/10 text-success' : 'text-success'} ${composerDisabled ? 'pointer-events-none opacity-50' : ''}`}
          >
            <Icon icon="sparkles" className="text-lg" />
          </button>
          )}

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
              aria-label="ดูตารางว่างประเภทงาน"
              title="ดูตารางว่างประเภทงาน"
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
        {/* tone info→success (2026-08-26): แถบนี้โผล่ได้เฉพาะตอน Meta **ยืนยันแล้วจริง** ว่าเรา
            ถือสิทธิ์ (outcome TAKEN) ไม่ใช่ "เรากดปุ่มแล้ว" เหมือนก่อนหน้านี้ — success ของ Paces
            เป็น token ของสกินนี้เอง คนละตัวกับ Verified Green ของฝั่ง buyer */}
        {showManualOverrideStrip && (
          <div className="border-success bg-success/5 mb-2 flex items-start gap-2 rounded-lg border-s-2 px-3 py-2">
            <Icon icon="robot" className="text-success-ink mt-0.5 shrink-0 text-base" />
            <p className="text-success-ink mb-0 min-w-0 grow text-xs font-semibold">กำลังตอบเองแทน AI ของ Meta</p>
            <a
              href={META_BUSINESS_SUITE_INBOX_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-success-ink flex shrink-0 items-center gap-1 text-xs font-semibold hover:underline"
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
                {fmt(t.inbox.quotedReplyTo, { name: replyingTo.senderRole === 'SHOP' ? t.inbox.quotedShopMessage : buyerName })}
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
              className="text-default-700 hover:bg-default-100 hover:text-default-700 flex size-11 shrink-0 items-center justify-center rounded-full lg:size-6"
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
                        aria-label={fmt(t.inbox.attachRemove, { name: label })}
                        // bg-dark/60 ไม่ใช่ bg-black/50 — overlay ผสมหมึกตาม Impeccable และให้ตรงกับ
                        // CustomerFileTile/PhotoAlbum ในโฟลเดอร์เดียวกันที่ใช้ token นี้อยู่แล้ว
                        className="bg-dark/60 hover:bg-dark/80 absolute end-1 top-1 flex size-11 items-center justify-center rounded-full text-white lg:size-6"
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
                    ? t.inbox.composerQuotaExhausted
                    : t.inbox.composerDisabled
                  : pendingImages.length > 0
                    ? t.inbox.composerCaptionPlaceholder
                    : t.inbox.composerPlaceholder
              }
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                // แจ้ง "กำลังพิมพ์" เฉพาะตอนคนพิมพ์จริง — throttle อยู่ในตัว notifyTyping เอง
                notifyTyping()
              }}
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
                aria-label={lineQuotaCaption ? fmt(t.inbox.sendWithNote, { note: lineQuotaCaption.fullText }) : t.inbox.send}
                title={lineQuotaCaption?.fullText}
                // btn-sm + rounded-full = ทรงพิลล์เล็กตามภาพอ้างอิง (user 2026-08-06) — ทั้งคู่เป็น
                // primitive ของธีม (_buttons.css `.btn-sm`, Tailwind `rounded-full`) ไม่ใช่ arbitrary
                // ปุ่มเล็กลงได้เพราะย้ายเข้ามาในกล่องแล้ว: กล่องทั้งใบคือเป้าสายตาอยู่แล้ว
                // ปุ่มไม่ต้องแบกหน้าที่ "หาให้เจอ" เหมือนตอนลอยเดี่ยวข้างกล่อง
                //
                // 🛑 `min-h-11 sm:min-h-0` (ux retroactive review 2026-08-11): `.btn-sm` ของธีมคือ
                // `px-3 py-1.25 text-xs` = สูงจริงราว 30px ต่ำกว่าเกณฑ์ tap target 44px ของ DESIGN.md
                // ทั้งที่นี่คือปุ่มที่ถูกกดถี่ที่สุดในหน้า. คืนขนาดเดิมที่ `sm:` เพราะเมาส์แม่นกว่านิ้ว
                // — ท่าเดียวกับปุ่ม "ตอบเอง" ในไฟล์นี้ (พิสูจน์แล้วว่าอยู่ร่วมกับ `btn-sm` ได้โดยไม่
                // ทำลายทรงพิลล์เล็กที่ user สั่งไว้ 2026-08-06)
                className={`btn btn-sm bg-primary text-white hover:bg-primary-hover min-h-11 shrink-0 rounded-full disabled:opacity-60 sm:min-h-0 ${
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

    {/* ชีตรับเงินที่เปิดจากการกดค้างบนรูปสลิป (feature 00050) — ชีตตัวเดียวกับที่การ์ดออเดอร์
        เรียก ไม่มีชีตคู่ขนาน · อยู่นอกเงื่อนไขของ MessageActionBubble เพราะเมนูปิดตัวเองทันที
        ที่เลือก แต่ชีตต้องอยู่ต่อ (ถ้าอยู่ข้างใน มันจะถูกถอดพร้อมเมนูในเฟรมเดียวกัน) */}
    {slipTarget && slipPayFileId && (
      <RecordPaymentSheet
        open
        onClose={() => setSlipPayFileId(null)}
        orderToken={slipTarget.token}
        orderLabel={slipTarget.label}
        shopId={shopId}
        money={slipTarget.money}
        initialSlipFileId={slipPayFileId}
        onChanged={() => router.refresh()}
      />
    )}

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
      <CustomerPanelSheet data={customerPanelData} initialTab={sheetTab} onClose={() => setSheetOpen(false)} />
    )}

    {/* ดูรูปเต็มจอ — Base Gallery.tsx:100 (เพิ่ม plugin Zoom + แปลป้าย a11y เป็นไทย) */}
    <Lightbox
      slides={imageSlides}
      open={lightboxIndex >= 0}
      index={lightboxIndex}
      close={() => setLightboxIndex(-1)}
      controller={{ closeOnBackdropClick: true }}
      plugins={[Zoom, LightboxDownload]}
      /* feature 00048 — ต้องรู้ว่ากำลังดูสไลด์ไหนอยู่ "ตอนนี้" ไม่ใช่สไลด์ที่เปิดมาตอนแรก
         ไม่งั้นเลื่อนไปรูปถัดไปแล้วปุ่มยังสะท้อนสถานะของรูปแรกอยู่ */
      on={{ view: ({ index }) => setLightboxViewIndex(index) }}
      toolbar={{
        buttons: [
          // ปุ่มโผล่เฉพาะสไลด์ที่เก็บเข้าคลังได้ (ไม่ใช่สติกเกอร์/รูปการ์ด carousel)
          lightboxSlide?.libraryFileId && lightboxSlide.libraryMessageId ? (
            <button
              key="save-to-library"
              type="button"
              className="yarl__button"
              disabled={savingFileId === lightboxSlide.libraryFileId}
              aria-label={savedFiles.has(lightboxSlide.libraryFileId) ? t.inbox.libraryUnsave : t.inbox.librarySave}
              title={savedFiles.has(lightboxSlide.libraryFileId) ? t.inbox.libraryUnsave : t.inbox.librarySave}
              onClick={() =>
                void toggleLibrary({ id: lightboxSlide.libraryMessageId!, imageUrl: lightboxSlide.libraryFileId })
              }
            >
              <Icon
                icon={savedFiles.has(lightboxSlide.libraryFileId) ? LIBRARY_ICONS.saved : LIBRARY_ICONS.save}
                className="text-xl"
              />
            </button>
          ) : null,
          'close',
        ],
      }}
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
