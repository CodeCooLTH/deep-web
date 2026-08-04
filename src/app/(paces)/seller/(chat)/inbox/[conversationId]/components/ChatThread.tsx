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
 *  - channel badge ที่ header (ChannelBadge.tsx ที่มีอยู่แล้ว)
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
import BotPausedBanner, { getBotPausedSummary } from './BotPausedBanner'
import ThreadStatusBar, { type ThreadStatusItem } from './ThreadStatusBar'
import { pacesToast } from '@/lib/paces-toast'
import { parseMetaOrderCard } from '@/lib/meta-order-card'
import Link from 'next/link'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import LightboxDownload from 'yet-another-react-lightbox/plugins/download'
import { generateInitials } from '@/utils/helpers'
// user 2026-07-31: แถวเวลาแสดงแค่ ชม.:นาที — วินาทีไม่ใช่ข้อมูลที่ใช้ตัดสินใจอะไรในแชท
// แต่ยังเก็บเวลาเต็มไว้ใน title ให้ชี้ดูได้ (formatTimeHM มีอยู่แล้ว ไม่ต้องเขียน formatter ใหม่)
import { formatTime, formatTimeHM, formatDateTime } from '@/lib/format-date'
import { useComposerHeight } from '@/hooks/useComposerHeight'
import { parseMetaSystemNotice } from '@/lib/meta-system-notice'
import { withEmojiPresentation } from '@/lib/emoji-presentation'
import { describeSendFailure, stripSendFailurePrefix } from '@/lib/chat-send-failure'
import Swal from 'sweetalert2'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
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
import { useLongPress } from '@/hooks/useLongPress'
import MessageActionBubble, { type MessageAction, type MessageReactionOption } from './MessageActionBubble'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import SellerErrorState from '@/app/(paces)/seller/(dashboard)/_shared/SellerErrorState'
import { SellerThreadSkeleton } from '@/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton'
import { ChannelBadge } from '../../components/ChannelBadge'
import OrderCardView from '../../../_components/OrderCardView'
import { useDraftOrders } from '../../../_components/DraftOrderProvider'
import CustomerPanelSheet from './CustomerPanelSheet'
import EmojiPicker from './EmojiPicker'
import AiSuggestPanel from './AiSuggestPanel'
import QuickMessageBar from './QuickMessageBar'
import {
  CHAT_SOUND_EVENT,
  isChatSoundMuted,
  isConversationMuted,
  setConversationMuted,
} from '@/lib/chat-sound'
import ProductPickerPanel, { type ProductPickPayload } from './ProductPickerPanel'
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
function MetaOrderCardBubble({ amount }: { amount: string }) {
  return (
    <div className="bg-light flex w-52 items-center gap-3 rounded-lg p-3">
      <span className="bg-card text-default-900 flex size-10 shrink-0 items-center justify-center rounded-full">
        <Icon icon="currency-baht" width={20} height={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-default-900 block text-base font-bold">{amount}</span>
        <span className="text-default-700 block text-xs">คำขอชำระเงินผ่าน Messenger</span>
      </span>
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
  const url = `/api/files/${storageKey}`
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
function ChatImageMessage({ storageKey, onOpen }: { storageKey: string; onOpen: () => void }) {
  const [isSticker, setIsSticker] = useState(false)
  return (
    <>
      {/* คลิก/กด Enter ที่รูป → เปิดเต็มจอ (user request 2026-07-23). ใช้ <button>
          ครอบแทนใส่ onClick บน <img> เพื่อให้โฟกัส/คีย์บอร์ด/screen reader ใช้ได้จริง
          (block + w-fit กันปุ่มยืดเต็มความกว้างบับเบิลจนกดโดนที่ว่างข้างรูป) */}
      <button type="button" onClick={onOpen} aria-label="ดูรูปเต็มจอ" className="block w-fit cursor-zoom-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/files/${storageKey}`}
          alt="รูปภาพที่ส่ง"
          className="max-w-60 rounded"
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
const ALBUM_GAP_MS = 2 * 60 * 1000
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
    const sameGroup =
      bare &&
      prev &&
      prev.senderRole === m.senderRole &&
      new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() <= ALBUM_GAP_MS
    if (bare && (buf.length === 0 || sameGroup)) {
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
import type { CustomerPanelData } from './CustomerPanel'

type Props = {
  conversationId: string
  /** ร้านที่ active — ใช้เป็น key throttle เสียงแจ้งเตือนรายร้าน (ต่างร้านไม่แข่งกันดัง, user 2026-07-24) */
  shopId: string | null
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
  /** ลูกค้ายังไม่เคยทักเข้ามาเลย (lastInboundAt=NULL) — เธรดที่ร้าน initiate จาก Facebook เอง
   *  (user report 2026-07-24). แยก banner จาก "เกิน 24 ชม." ที่สื่อว่าลูกค้าเคยทักแล้ว */
  neverInbound: boolean
  /** เกิน 24 ชม. แต่ยังไม่เกิน 7 วัน และร้านได้ permission human_agent แล้ว → คนตอบเองได้อยู่ */
  humanAgentOpen?: boolean
  humanAgentExpiresAt?: string | null
  /** feature 00018 T5 — ข้อมูล Customer Panel เดียวกับที่ desktop column ใช้ (สำหรับ sheet มือถือ) */
  customerPanelData: CustomerPanelData
}

// feature 00018 — ดู comment หัวไฟล์ (badge "ส่งไม่สำเร็จ")
type ChatMessageWithDelivery = ChatMessageView & {
  deliveryStatus?: string | null
  failureReason?: string | null
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
function ProductCardBubble({ card, username, thumbSize }: { card: ChatProductCard | null; username?: string; thumbSize: string }) {
  if (!card) {
    // FR-CTX-08 — สินค้าถูกลบจริง (ไม่พบใน productMap) แทนทั้งการ์ดด้วย empty state ไม่มีลิงก์/รูป
    return (
      <div className="text-default-700 flex items-center gap-2">
        <Icon icon="package-off" className="text-xl" />
        <span className="text-sm">ไม่พบสินค้านี้แล้ว</span>
      </div>
    )
  }

  const priceLabel = `฿${card.price.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
  const href = username ? `/u/${username}` : undefined

  const inner = (
    <div className="flex items-center gap-3">
      <span className={`${thumbSize} bg-default-100 flex shrink-0 items-center justify-center overflow-hidden rounded-lg`}>
        {card.imageFileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/${card.imageFileId}`} alt={card.name} className="size-full object-cover" />
        ) : (
          <Icon icon="photo" className="text-default-700 text-xl" />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-default-800 mb-0 line-clamp-1 text-sm font-semibold">{card.name}</p>
        <p className="text-default-600 mb-0 text-sm">{priceLabel}</p>
        {!card.isActive && (
          <span className="text-default-700 mt-0.5 flex items-center gap-1 text-2xs">
            <Icon icon="ban" />
            หยุดขายแล้ว
          </span>
        )}
        <span className="text-primary mt-1 flex items-center gap-1 text-sm font-semibold">
          ดูสินค้า <Icon icon="external-link" className="text-sm" />
        </span>
      </div>
    </div>
  )

  // คลิกทั้งก้อนได้ (tap target ใหญ่กว่า 44px) — ถ้าไม่มี username (edge case ไม่ล็อกอิน/session ยังโหลด)
  // แสดงเนื้อหาเฉย ๆ ไม่มีลิงก์ แทนที่จะ crash
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  )
}

/**
 * OrderCardBubble — เนื้อหาข้อความ type='ORDER' (การ์ดคำสั่งซื้อในแชท ฝั่ง seller)
 * user request 2026-07-25: ใช้ OrderCardView shared (การ์ดเดียวกับแท็บคำสั่งซื้อ) — แตะการ์ด → เปิด
 * โมดัลแก้ไข (onEdit); footer "ดูคำสั่งซื้อ" → /orders/{token}. buyer มี component แยก (Vuexy)
 */
function OrderCardBubble({ card, onEdit }: { card: ChatOrderCard | null; onEdit: (token: string) => void }) {
  if (!card) {
    return (
      <div className="text-default-700 flex items-center gap-2">
        <Icon icon="receipt-off" className="text-xl" />
        <span className="text-sm">ไม่พบคำสั่งซื้อนี้แล้ว</span>
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
          ดูคำสั่งซื้อ
        </Link>
      }
    />
  )
}

export default function ChatThread({
  conversationId,
  shopId,
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
  neverInbound,
  humanAgentOpen = false,
  humanAgentExpiresAt = null,
  customerPanelData,
}: Props) {
  const { data: session } = useSession()
  const shopUsername = (session?.user as { username?: string } | undefined)?.username
  // แตะการ์ดคำสั่งซื้อในแชท → เปิดโมดัลแก้ไข (user 2026-07-25: เหมือนแตะการ์ดใน right panel)
  const { openDraft } = useDraftOrders()
  const openEditOrder = (token: string) =>
    openDraft({ conversationId, customerName: buyerName, channel, customerAvatar: buyerAvatar, editOrderToken: token })
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
  // composer improvement #2/#3 — แผงเหนือช่องพิมพ์ (ข้อความสำเร็จรูป / AI ช่วยร่างคำตอบ)
  // state เดียวคุมทั้งคู่ (user สั่ง 2026-07-23: "ต้องไม่ขึ้นซ้อนกัน เปิดได้ทีละอัน") — เดิมแยก
  // boolean คนละตัว กดสองปุ่มแล้วกางพร้อมกันทับกัน (ทั้งคู่เป็นแถบ full-bleed -mt ติดลบ)
  const [activePanel, setActivePanel] = useState<'quick' | 'ai' | 'product' | null>(null)
  const aiOpen = activePanel === 'ai'
  const quickOpen = activePanel === 'quick'
  const productOpen = activePanel === 'product'
  const togglePanel = (panel: 'quick' | 'ai' | 'product') =>
    setActivePanel((cur) => (cur === panel ? null : panel))
  // feature 00018 — composer/attach ปิดเมื่อช่องทางนอก (Messenger/IG) ยังไม่รองรับส่งรูป, หรือ
  // ส่งข้อความไม่ได้ (window ปิด/token ตาย) — ดู comment หัวไฟล์
  const isExternal = channel !== 'DEEP'
  // live 24h countdown — capture เวลาหมดอายุครั้งเดียวตอน mount (msRemaining จาก server + เวลาโหลด)
  // แล้ว tick ทุกวินาที ให้ banner ถอยหลังจริง และ composer ปิดเองเมื่อถึง 0 ไม่ต้อง reload หน้า
  const [expiryTs] = useState(() => Date.now() + msRemaining)
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

  // เสียงแจ้งเตือน: สถานะปิดเสียง (ระดับแอป/รายเธรด) อ่านหลัง mount เท่านั้น — localStorage ไม่มี
  // ฝั่ง server ถ้าอ่านตอน render แรกจะ hydration mismatch
  const [appSoundMuted, setAppSoundMuted] = useState(false)
  const [threadMuted, setThreadMuted] = useState(false)
  useEffect(() => {
    const sync = () => {
      setAppSoundMuted(isChatSoundMuted())
      setThreadMuted(isConversationMuted(conversationId))
    }
    sync()
    window.addEventListener(CHAT_SOUND_EVENT, sync)
    return () => window.removeEventListener(CHAT_SOUND_EVENT, sync)
  }, [conversationId])

  // เหลือเงื่อนไขล็อกเดียว: เพจหลุดการเชื่อมต่อ (2026-08-03 — user: "การไป lock ui มันทำให้เกิดปัญหา")
  //
  // ต่างกันตรง "รู้แน่" กับ "เดา": tokenInvalid คือข้อเท็จจริงที่ยืนยันแล้ว (ยิงไปก็ 190 ทุกครั้ง)
  // และร้านแก้ที่หน้านี้ไม่ได้ ต้องไปเชื่อมเพจใหม่ก่อน — ล็อกไว้ถูกแล้ว. ส่วนหน้าต่าง 24 ชม./7 วัน
  // เป็นค่าที่ "เราคำนวณเอง" จาก lastInboundAt ที่คลาดได้ทั้งสองทาง การล็อกจากค่านั้น = ห้ามร้าน
  // ส่งข้อความที่ Meta จะรับจริง. ปล่อยให้ส่งแล้วโชว์เหตุผลบนบับเบิลถ้าไม่ผ่าน ตรงความจริงกว่า
  // (ฝั่ง service เลิกบล็อกล่วงหน้าให้ข้อความที่คนพิมพ์เองแล้ว — channel-chat.service.ts)
  const composerDisabled = isExternal && tokenInvalid
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
    externalReadAt: externalReadAtLive,
    // beepEnabled=false — หน้า inbox มี InboxList เป็นเจ้าของเสียงเตือนแล้ว (กันเสียงเบิ้ล 2 ครั้ง)
  } = useSellerChatThread(conversationId, shopId, false)

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
    if (m.body?.trim()) {
      list.push({
        key: 'order',
        icon: 'receipt',
        label: 'สร้างคำสั่งซื้อ',
        onSelect: () =>
          openDraft({
            conversationId,
            customerName: buyerName,
            channel,
            customerAvatar: buyerAvatar,
            prefillText: m.body!,
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
  const burstEndIds = new Set<string>()
  for (let i = 0; i < messages.length; i++) {
    const cur = messages[i]
    const nxt = messages[i + 1]
    if (
      !nxt ||
      nxt.senderRole !== cur.senderRole ||
      new Date(nxt.createdAt).getTime() - new Date(cur.createdAt).getTime() > GROUP_GAP_MS
    ) {
      burstEndIds.add(cur.id)
    }
  }

  // read receipt (feature 00018) — ป้าย "อ่านแล้ว/ส่งแล้ว" โชว์เฉพาะข้อความ SHOP ตัวสุดท้าย (ช่องทางนอก)
  const lastShopMsgId = isExternal
    ? ([...messages].reverse().find((m) => m.senderRole === 'SHOP')?.id ?? null)
    : null
  // ค่าจาก hook (สดจาก GET ล่าสุด) มาก่อน prop ของ server (อ่านครั้งเดียวตอน render หน้า) — read
  // event ของ Meta มาทีหลังและไม่ทริกเกอร์ realtime จึงต้องพึ่ง refetch รอบถัดไป (bug fix 2026-07-23)
  const readAt = externalReadAtLive ?? externalReadAtInitial
  const readAtMs = readAt ? new Date(readAt).getTime() : 0

  // เธรดที่เกิดจาก "ตอบกลับความคิดเห็น" (private reply) — Meta แนบบรรทัดระบบที่มีลิงก์คอมเมนต์
  // มาด้วยเสมอ จับจาก comment_id ในลิงก์ ไม่ใช่จากถ้อยคำ เพราะเพจตั้งภาษาต่างกันได้
  const isCommentReplyThread = messages.some((m) => (m.body ?? '').includes('comment_id='))

  // ดูรูปเต็มจอ — รวมรูปทุกใบในเธรด (เรียงตามเวลาเหมือนที่แสดง) เป็น slides ชุดเดียว แล้วจำ index
  // ของแต่ละข้อความไว้ เพื่อให้คลิกรูปไหนก็เปิดที่รูปนั้นแล้วเลื่อนดูใบอื่นต่อได้ (ไม่ใช่เปิดทีละใบ
  // แยกกัน) — เฉพาะ type='IMAGE'; VIDEO/AUDIO มี control ของตัวเอง, FILE เปิดแท็บใหม่อยู่แล้ว
  // download: ตั้งชื่อไฟล์ตอนบันทึกจาก storage key (ไม่งั้นได้ชื่อเป็น path ของ /api/files)
  const imageSlides: { src: string; download: { url: string; filename: string } }[] = []
  const slideIndexByMessageId = new Map<string, number>()
  for (const m of messages) {
    if (m.type === 'IMAGE' && m.imageUrl) {
      slideIndexByMessageId.set(m.id, imageSlides.length)
      const url = `/api/files/${m.imageUrl}`
      imageSlides.push({
        src: url,
        download: { url, filename: m.imageUrl.split('/').filter(Boolean).pop() || 'image' },
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
        <div className="bg-danger/15 text-danger flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
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
  if (isExternal && !tokenInvalid && !liveWindowOpen) {
    // แยก 3 เคส (user report 2026-07-24 / 2026-07-31):
    //   1. เธรดที่เกิดจากการตอบคอมเมนต์ — Meta ให้ตอบได้ 1 ข้อความ (private reply) แล้วต้อง
    //      รอลูกค้าตอบกลับ. ร้านเพิ่งส่งสำเร็จไปหยก ๆ การขึ้นแถบแดงจึงอ่านเหมือนระบบพัง
    //      ทั้งที่เป็นสถานะปกติตามนโยบาย → ใช้โทน info ไม่ใช่ danger
    //   2. ลูกค้ายังไม่เคยทักเลย (เธรดมาจากทางอื่น)
    //   3. ทักแล้วแต่เกิน 24 ชม. — เสียโอกาสจริง แต่ตั้งแต่ 2026-08-03 ไม่บล็อกแล้ว (ดู composerDisabled)
    //      สีจึงลงจาก danger → warning: danger สงวนไว้ให้สิ่งที่ยืนยันแล้วว่าล้มเหลว/บล็อกจริง
    //      (token ตาย, แถบใต้บับเบิลที่ส่งไม่ผ่าน) ไม่ใช่สิ่งที่ยังกดส่งได้และอาจผ่าน
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
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${soft ? 'bg-info/15 text-info' : 'bg-warning/15 text-warning'}`}>
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
              // humanAgentOpen เป็นเท็จ ซึ่งเกิดได้จาก 2 เหตุ: เกิน 7 วันจริง หรือ
              // META_HUMAN_AGENT_ENABLED ปิดอยู่ (ตอนนี้ปิด เพราะยังไม่ผ่าน App Review)
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
        <div className="bg-info/15 text-info flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
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
      <div className="card-header">
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
          <ChatAvatar avatar={buyerAvatar} name={buyerName} />
          {/* justify-center: ชื่อ+ชิปอยู่กึ่งกลางแนวตั้งเทียบกับ avatar (user สั่ง 2026-08-02)
              — เดิมกล่องนี้สูงไม่เท่า avatar เลยดูลอยสูงกว่ากลางรูป */}
          <div className="flex min-w-0 flex-col justify-center">
            <h5 className="text-base mb-1.25">{buyerName}</h5>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* ไม่ส่ง imageUrl → ชิปใช้ "โลโก้แบรนด์ของช่องทาง" (f สีน้ำเงิน / IG) ให้ตรงกับ
                  แผงลูกค้าฝั่งขวาที่เป็นแบบนี้อยู่แล้ว (user สั่ง 2026-08-02)
                  เดิมส่ง avatar ของเพจเข้าไป ทำให้ชิปโชว์รูปเพจ ซึ่งซ้ำกับสิ่งที่ผู้ใช้เพิ่งเห็น
                  และไม่ได้บอกว่าเป็นช่องทางไหน — ข้อมูลที่ชิปนี้มีหน้าที่บอกจริง ๆ
                  ห้ามเติมตราช่องทางซ้อนบน avatar ที่นี่ด้วย: ลองแล้ว 2026-08-02 กลายเป็นไอคอน
                  เพจโผล่ 2 ที่ติดกัน (user report "ทำไม icon เพจมันซ้อนกัน") — หัวเธรดบอกช่องทาง
                  ที่ชิปที่เดียวพอ ต่างจากรายการแชทที่ไม่มีชิปจึงต้องใช้ตราบนรูป */}
              <ChannelBadge channel={channel} label={channelName} />
            </div>
          </div>
        </div>

        {/* นับถอยหลังหน้าต่าง 24 ชม. — อยู่ในแถบเดียวกับชื่อลูกค้า ชิดขวา (user สั่ง 2026-08-02)
            เดิมเป็นแถบเหลืองเต็มความกว้างใต้หัวเธรด ซึ่งกินความสูงของพื้นที่อ่านข้อความตลอด 4 ชม.
            สุดท้ายทั้งที่เป็นข้อมูล "เฝ้าดู" ไม่ใช่สิ่งที่ต้องอ่านเป็นย่อหน้า
            เฉพาะ tier นี้เท่านั้นที่ย้ายขึ้นมา — tier "ส่งไม่ได้แล้ว"/token เสีย ยังเป็นแถบเต็ม
            ด้านล่างเหมือนเดิม เพราะข้อความยาวและมีลิงก์ให้กด ย่อลงมาบรรทัดเดียวไม่ได้
            ms-auto ตัวแรกกินที่ว่างทั้งหมด → ปุ่มถัดไปที่มี ms-auto อยู่แล้วไม่ขยับตำแหน่ง */}
        {isExternal && !tokenInvalid && liveWindowOpen && liveRemaining <= FOUR_HOURS_MS && (
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

        {/* ข้อมูลลูกค้า — ปุ่มมีป้ายกำกับที่หัวเธรด สำหรับช่วงที่คอลัมน์ขวายังไม่โผล่ (<1280px)
            user report 2026-08-01 (iPad Pro): "เปิดข้อมูลลูกค้าไม่ได้" ทั้งที่ปุ่มมีอยู่แล้ว —
            ของเดิมเป็นไอคอนเปล่าไม่มีข้อความ อยู่มุมขวาสุดของแถบเครื่องมือเหนือช่องพิมพ์ ซึ่งล่างสุด
            ของจอและไม่มีใครมองหาข้อมูลลูกค้าตรงนั้น. ที่ ≥1280px ไม่ต้องมี เพราะแผงอยู่ข้าง ๆ แล้ว
            (breakpoint ต้องตรงกับ xl:block ของคอลัมน์ขวาใน page.tsx เสมอ) */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          title="ข้อมูลลูกค้า"
          className="btn btn-sm border-default-300 text-default-700 hover:bg-default-100 ms-auto hidden shrink-0 items-center gap-1 md:inline-flex xl:hidden"
        >
          <Icon icon="user-circle" className="text-base" />
          <span>ข้อมูลลูกค้า</span>
        </button>

        {/* ปิดเสียงเฉพาะเธรดนี้ (user สั่ง 2026-07-23) — ซ่อนเมื่อปิดเสียงระดับแอปอยู่แล้ว เพราะปุ่ม
            นี้จะไม่มีผลอะไรและทำให้เข้าใจผิดว่า "เปิดอยู่" ทั้งที่ทั้งแอปเงียบ (สวิตช์ระดับแอปอยู่ที่
            ChatHeader) */}
        {!appSoundMuted && (
          <button
            type="button"
            onClick={() => setConversationMuted(conversationId, !threadMuted)}
            aria-pressed={threadMuted}
            title={threadMuted ? 'เปิดเสียงเฉพาะแชทนี้' : 'ปิดเสียงเฉพาะแชทนี้'}
            aria-label={threadMuted ? 'เปิดเสียงเฉพาะแชทนี้' : 'ปิดเสียงเฉพาะแชทนี้'}
            className={`btn btn-icon hover:bg-default-100 shrink-0 ${threadMuted ? 'text-default-700' : 'text-default-700'}`}
          >
            <Icon icon={threadMuted ? 'bell-off' : 'bell'} className="text-lg" />
          </button>
        )}
      </div>

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

      {/* แถบสถานะห้อง — ยุบเป็นบรรทัดเดียว กดกางดูรายละเอียด (user report 2026-08-02:
          "alert box เยอะ ๆ ไม่ work มันรกหน้าจอมาก") ลำดับใน array = ลำดับความสำคัญ:
          ส่งไม่ได้เลย > ส่งได้แบบมีเงื่อนไข > บอทเงียบ > โหมดทดสอบ
          ตัวแรกคือตัวที่โชว์ตอนยุบ ที่เหลือนับเป็น +N */}
      <ThreadStatusBar items={threadStatuses} />

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
                    <div key={ms[0].id} className={`my-5 flex items-start gap-2.5 ${mine ? 'justify-end' : ''}`}>
                      {!mine && <ChatAvatar avatar={buyerAvatar} name={buyerName} />}
                      <div className="min-w-0">
                        <PhotoAlbum ms={ms} onOpen={(id) => setLightboxIndex(slideIndexByMessageId.get(id) ?? -1)} />
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
                // เหตุการณ์การโทร — การ์ดกลางจอ ไม่ใช่บับเบิล (2026-08-03)
                //
                // ทำไมไม่ทำเป็นบับเบิล: ข้อมูลจริงจาก Meta คือ senderRole='SHOP' เสมอ **แม้เป็นสายที่
                // ลูกค้าโทรเข้ามา** ถ้า render ชิดขวาเป็นบับเบิลสีร้าน = โกหกว่าร้านพิมพ์ข้อความนี้เอง
                // ใช้ pattern เดียวกับ date divider ด้านบน (กึ่งกลาง ไม่มี avatar) เพราะมันคือ log
                // ของระบบ ไม่ใช่บทสนทนา — และไม่มีปุ่ม "โทรกลับ" เพราะเรายังโทรกลับไม่ได้จริง
                // (Calling API ต้อง subscribe webhook `calls` + รัน WebRTC เอง) ปุ่มที่กดไม่ได้ = UI โกหก
                if (m.type === 'CALL') {
                  const missed = m.body === 'Missed call'
                  return (
                    <div key={m.id} className="my-4 flex justify-center">
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
                const failDetail = failedPersisted ? describeSendFailure(mExt.failureReason) : null
                // ฝั่ง optimistic เคยไม่มีเหตุผลให้ดู (เห็นแต่ toast ตอนกดส่ง) — แต่ toast หายเองใน
                // ไม่กี่วินาที เหลือบับเบิลแดงที่ไม่บอกว่าทำไม. ตั้งแต่เลิกล็อกช่องพิมพ์ตามหน้าต่าง
                // 24 ชม. (2026-08-03) บับเบิลล้มเหลวเกิดถี่ขึ้นมาก เหตุผลจึงต้องอยู่ติดข้อความถาวร
                // เท่ากันทั้งสองเส้นทาง — hook เก็บไว้ที่ `_failReason` ให้แล้ว
                const failReason = failDetail
                  ? failDetail.known && failDetail.metaCode !== null
                    ? `${failDetail.text} (Meta #${failDetail.metaCode})`
                    : failDetail.text
                  : stripSendFailurePrefix(m._failReason)
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
                const canRetryFailed = failedPersisted
                  ? (m.type === 'TEXT' && !!m.body?.trim()) || retryAttachment
                  : !!m._retry
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
                const cancelFailed = async () => {
                  const r = await Swal.fire({
                    buttonsStyling: false,
                    icon: 'warning',
                    title: 'ยกเลิกการส่งข้อความนี้?',
                    text: 'ข้อความจะหายไปจากห้องแชทและกู้คืนไม่ได้ — ลูกค้าไม่เคยได้รับข้อความนี้อยู่แล้ว',
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
                    </div>
                  ) : null
                // ข้อความ "ระบบ" ที่ Facebook แทรกเองในเธรด (user report 2026-07-30) — เช่น
                // "คุณกำลังตอบกลับความคิดเห็น...ดูความคิดเห็น(url)" หรือ "<ชื่อ> replied to an ad."
                // Meta ส่งมาในนามเพจ ถ้า render เป็นบับเบิลปกติจะเข้าใจผิดว่าแอดมินพิมพ์เอง
                // (user: "ทำให้เข้าใจผิดว่าคนพิมพ์") + URL ดิบยาวเต็มจอ
                // → บรรทัดกลางจอสีจางแบบ Messenger ตามรูปที่ user ส่งมา ไม่ใช่บับเบิล
                const systemNotice = m.type === 'TEXT' ? parseMetaSystemNotice(m.body) : null
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
                      {m.replyTo && (
                        <div className={`mb-1 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className="border-default-300 bg-default-100/70 max-w-full rounded-lg border-s-2 px-2.5 py-1">
                            <p className="text-default-700 mb-0 text-2xs font-medium">
                              ตอบกลับ{m.replyTo.senderRole === 'SHOP' ? 'ข้อความของร้าน' : buyerName}
                            </p>
                            <p className="text-default-700 mb-0 line-clamp-2 text-xs opacity-90">
                              {m.replyTo.body ?? '[สื่อ/ไฟล์แนบ]'}
                            </p>
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
                        const bareImage =
                          m.type === 'ORDER' ||
                          !!metaOrder ||
                          ((m.type === 'IMAGE' || m.type === 'VIDEO') && m.imageUrl && !m.body)
                        return (
                          <div className={bareImage ? '' : `rounded px-6 py-3 ${m.type === 'PRODUCT' ? 'bg-light' : mine ? 'bg-primary text-white' : 'bg-light'}`}>
                        {m.type === 'ORDER' ? (
                          <OrderCardBubble card={m.orderCard ?? null} onEdit={openEditOrder} />
                        ) : metaOrder ? (
                          <MetaOrderCardBubble amount={metaOrder.amount} />
                        ) : m.type === 'PRODUCT' ? (
                          <ProductCardBubble card={m.productCard ?? null} username={shopUsername} thumbSize="size-14" />
                        ) : (
                          <>
                            {m.type === 'IMAGE' && m.imageUrl && (
                              <ChatImageMessage
                                storageKey={m.imageUrl}
                                onOpen={() => setLightboxIndex(slideIndexByMessageId.get(m.id) ?? -1)}
                              />
                            )}
                            {/* feature 00018 — ไฟล์แนบช่องทางนอก (วิดีโอ/เสียง/ไฟล์) mirror มาแล้ว serve ผ่าน /api/files */}
                            {m.type === 'VIDEO' && m.imageUrl && (
                              <>
                                <video src={`/api/files/${m.imageUrl}`} controls className="max-w-60 rounded" />
                                <MediaDownloadLink storageKey={m.imageUrl} label="บันทึกวิดีโอ" attachmentName={m.attachmentName} />
                              </>
                            )}
                            {m.type === 'AUDIO' && m.imageUrl && (
                              <>
                                <audio src={`/api/files/${m.imageUrl}`} controls className="max-w-60" />
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
                          {mine && m._status !== 'sending' && !failed && m.id === lastShopMsgId ? (
                            readAtMs > 0 && new Date(m.createdAt).getTime() <= readAtMs ? (
                              <span className="text-success flex items-center gap-0.5">
                                <Icon icon="checks" /> อ่านแล้ว
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
        {/* แผงเหนือช่องพิมพ์ — เปิดได้ทีละแผงเท่านั้น (activePanel) จึงไม่มีทางกางซ้อนกัน
            ทั้งสามใช้โครง/สไตล์เดียวกัน ต่างแค่ accent (AI = success, สำเร็จรูป = primary,
            เลือกสินค้า = info) */}
        {aiOpen && (
          <AiSuggestPanel
            conversationId={conversationId}
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
          />
        )}

        {/* layout ตามที่ user สั่ง 2026-07-23 (ref 12Tees — HR6: เอาโครงจาก ref, skin เป็น Paces):
              [ แผง AI ]
              [ แถวปุ่มเครื่องมือ ]
              [ ช่องพิมพ์ ][ ปุ่มส่ง ]
            เดิมทุกอย่างอยู่แถวเดียวกันหมด (ปุ่ม 4 ตัว + input + ส่ง) — บนมือถือ/rail แคบ ๆ ช่องพิมพ์
            ถูกบีบจนพิมพ์ยาว ๆ ไม่เห็นข้อความตัวเอง แยกแถวแล้วช่องพิมพ์ได้ความกว้างเต็ม */}
        <div className="mb-2 flex items-center gap-1">
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
            className={`btn btn-icon hover:bg-info/10 shrink-0 ${productOpen ? 'bg-info/10 text-info' : 'text-default-600'} ${composerDisabled ? 'pointer-events-none opacity-50' : ''}`}
          >
            <Icon icon="package" className="text-lg" />
          </button>

          {/* แนบไฟล์ — multiple + ทุกชนิด (user สั่ง 2026-08-02) เดิมทีละ 1 ไฟล์ เฉพาะ jpg/png/webp
              ไม่ใส่ accept เลยโดยตั้งใจ (ไม่ใช่ accept แบบ wildcard) — Safari บางเวอร์ชันตีความ
              wildcard แล้วซ่อนไฟล์บางชนิดในกล่องเลือก. กฎว่าอะไรส่งได้อยู่ที่ lib/chat-attachment.ts
              ซึ่งบังคับทั้งฝั่ง client (ก่อนอัปโหลด) และ /api/chat/upload (ตัวจริง) */}
          <label
            className={`btn btn-icon text-default-600 hover:bg-default-100 shrink-0 ${attachDisabled || composerDisabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
            aria-label={attachDisabled ? 'ยังไม่รองรับการแนบไฟล์ในช่องทางนี้' : 'แนบไฟล์'}
            title="แนบไฟล์ (เลือกหลายไฟล์พร้อมกันได้)"
          >
            <input
              type="file"
              multiple
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
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setEmojiOpen((v) => !v)}
              disabled={composerDisabled}
              aria-label="เลือกอิโมจิ"
              aria-expanded={emojiOpen}
              className={`btn btn-icon text-default-600 hover:bg-default-100 ${emojiOpen ? 'bg-default-100' : ''} ${composerDisabled ? 'pointer-events-none opacity-50' : ''}`}
            >
              <Icon icon="mood-smile" className="text-lg" />
            </button>
            {emojiOpen && (
              <EmojiPicker onSelect={(emoji) => setText((prev) => prev + emoji)} onClose={() => setEmojiOpen(false)} />
            )}
          </div>

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

          {/* feature 00018 T5 — ทางเข้า Customer Panel แบบ sheet สำหรับ **มือถือ** (<768px) เท่านั้น
              ตั้งแต่ 768px ขึ้นไปใช้ปุ่มมีป้ายกำกับ "ข้อมูลลูกค้า" ที่หัวเธรดแทน (หาเจอง่ายกว่ามาก —
              user report 2026-08-01) และตั้งแต่ 1280px ขึ้นไปเป็นคอลัมน์ขวาจริง (ดู page.tsx)
              ไอคอนเปล่าตรงนี้จึงเหลือไว้เฉพาะจอที่แคบจนหัวเธรดใส่ปุ่มมีข้อความไม่ไหว
              ms-auto: ดันไปชิดขวาสุดของแถวเครื่องมือ — คนละกลุ่มกับปุ่มแต่งข้อความ 3 ตัวทางซ้าย */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="ข้อมูลลูกค้า"
            className="btn btn-icon text-default-600 hover:bg-default-100 ms-auto shrink-0 md:hidden"
          >
            <Icon icon="user-circle" className="text-lg" />
          </button>
        </div>

        {/* แถวช่องพิมพ์ + ปุ่มส่ง — textarea (ไม่ใช่ input) เพราะต้อง "สูงขึ้นตอนโฟกัส" ตามที่สั่ง
            Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx:93
            (`<textarea rows className="form-textarea">`) — ต้องใช้ .form-textarea ไม่ใช่ .form-input
            เพราะ .form-input ล็อก h-9.25 + py-0 ไว้สำหรับบรรทัดเดียว ส่วน .form-textarea เป็น h-auto!
            (custom/_forms.css:56) จึงยืดได้จริง
            min-h-11 ปกติ (tap target 44px) → focus:min-h-20 (Tailwind scale ปกติ ไม่ใช่ arbitrary — HR7)
            resize-none: ห้ามลากขยายเอง (จะพัง layout การ์ด); Enter = ส่ง, Shift+Enter = ขึ้นบรรทัดใหม่
            (พฤติกรรมเดิมของ input ที่ต้องคงไว้ — textarea จะขึ้นบรรทัดใหม่เองถ้าไม่ preventDefault)
            items-end: ปุ่มส่งชิดล่างเสมอเวลา textarea ยืด ไม่ลอยกลาง */}
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
                      ? '[คำสั่งซื้อ]'
                      : replyingTo.type === 'PRODUCT'
                        ? '[สินค้า]'
                        : '[สื่อ/ไฟล์แนบ]')}
              </p>
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
              placeholder={composerDisabled ? 'ส่งข้อความไม่ได้ในตอนนี้' : pendingImages.length > 0 ? 'เพิ่มคำบรรยาย (ไม่บังคับ)' : 'พิมพ์ข้อความ หรือวางไฟล์ที่นี่...'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={handlePaste} // วางรูปจากคลิปบอร์ด (screenshot/Line/Ctrl+C) → แนบเลย (user 2026-07-25)
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={composerDisabled}
            />
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={composerDisabled || sending || uploading || (!text.trim() && pendingImages.length === 0)}
            className="btn bg-primary text-white hover:bg-primary-hover shrink-0 disabled:opacity-60"
          >
            ส่ง <Icon icon="send-2" className="ms-1 text-xl" />
          </button>
        </div>
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
