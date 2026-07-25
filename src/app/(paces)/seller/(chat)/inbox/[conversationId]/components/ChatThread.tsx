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
import Link from 'next/link'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import { generateInitials } from '@/utils/helpers'
import { formatTime } from '@/lib/format-date'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  useSellerChatThread,
  groupByDate,
  type ChatProductCard,
  type ChatOrderCard,
  type ChatMessageView,
} from '@/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread'
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
        copied ? 'text-success' : 'text-default-400 hover:bg-default-100 hover:text-default-700'
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
 * ปุ่ม "ตอบกลับ" (reply/quote, user 2026-07-25) — โผล่ตอน hover เฉพาะ desktop (lg:group-hover)
 * เหมือน CopyMessageButton; ใช้กับข้อความทุกชนิด (text/รูป/การ์ด — ตอบทับได้หมด)
 */
function ReplyMessageButton({ onReply }: { onReply: () => void }) {
  return (
    <button
      type="button"
      onClick={onReply}
      aria-label="ตอบกลับข้อความนี้"
      title="ตอบกลับ"
      className="text-default-400 hover:bg-default-100 hover:text-default-700 mt-1.5 hidden size-7 shrink-0 items-center justify-center rounded-full transition-colors lg:group-hover:flex"
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
    const bare = m.type === 'IMAGE' && !!m.imageUrl && !m.body
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
  /** feature 00018 — 'DEEP' | 'MESSENGER' | 'INSTAGRAM' (resolve/fallback ทำที่ server แล้ว) */
  channel: string
  /** ชื่อเพจ (ShopChannel.name) ที่เธรดนี้ผูกอยู่ — แสดงบน badge แทนคำว่า "Messenger"/"Instagram"
   *  (user request 2026-07-23) null = เธรด Deep หรือหาเพจไม่เจอ → badge กลับไปใช้ชื่อช่องทาง */
  channelName: string | null
  /** รูปเพจ (ShopChannel.avatarUrl) — badge ช่องทางใช้รูปเพจแทนโลโก้ Facebook ถ้ามี (user 2026-07-23) */
  channelAvatarUrl: string | null
  /** feature 00018 Phase 2 — ลูกค้าทักมาจากโฆษณาชื่อนี้ (messaging_referrals) — badge บนหัวเธรด; null=ไม่ใช่ */
  referralAdTitle: string | null
  /** feature 00018 — ผลลัพธ์ getWindowState() คำนวณที่ server ณ เวลา render หน้า (ไม่ live-tick) */
  windowOpen: boolean
  msRemaining: number
  /** feature 00018 — ShopChannel.status === 'TOKEN_INVALID' (เฉพาะ channel != DEEP) */
  tokenInvalid: boolean
  /** ลูกค้ายังไม่เคยทักเข้ามาเลย (lastInboundAt=NULL) — เธรดที่ร้าน initiate จาก Facebook เอง
   *  (user report 2026-07-24). แยก banner จาก "เกิน 24 ชม." ที่สื่อว่าลูกค้าเคยทักแล้ว */
  neverInbound: boolean
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

/** สี/ไอคอน banner 24h ตาม tier ของเวลาที่เหลือ + ข้อความ countdown สด (ตัดสินเฉพาะ 2 tier ที่ยัง
 *  ไม่หมด — tier "หมดแล้ว"/TOKEN_INVALID ตัดสินที่ caller) */
function formatWindowBanner(msRemaining: number): { cls: string; icon: string; text: string } {
  if (msRemaining > FOUR_HOURS_MS) {
    return {
      cls: 'bg-info/15 text-info',
      icon: 'clock',
      text: `ตอบได้อีก ${formatCountdown(msRemaining)} นับจากข้อความล่าสุดของลูกค้า`,
    }
  }
  return {
    cls: 'bg-warning/15 text-warning',
    icon: 'alert-triangle',
    text: `ใกล้หมดเวลาตอบ — เหลือ ${formatCountdown(msRemaining)}`,
  }
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
      <div className="text-default-400 flex items-center gap-2">
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
          <Icon icon="photo" className="text-default-400 text-xl" />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-default-800 mb-0 line-clamp-1 text-sm font-semibold">{card.name}</p>
        <p className="text-default-600 mb-0 text-sm">{priceLabel}</p>
        {!card.isActive && (
          <span className="text-default-400 mt-0.5 flex items-center gap-1 text-2xs">
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
      <div className="text-default-400 flex items-center gap-2">
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
  channel,
  channelName,
  channelAvatarUrl,
  referralAdTitle,
  windowOpen,
  msRemaining,
  tokenInvalid,
  neverInbound,
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

  const composerDisabled = isExternal && (tokenInvalid || !liveWindowOpen)
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
    handleRemoveImage,
    handleSend,
    replyingTo,
    setReplyingTo,
    retryMessage,
    externalReadAt: externalReadAtLive,
  } = useSellerChatThread(conversationId, shopId)

  // composer improvement #2 — เลือกข้อความสำเร็จรูป: แนบรูปถ้ามี (ทุกช่องทางรวม Messenger/IG) +
  // เติมข้อความ/caption ลง composer (รูปมี caption → ตั้งเป็นข้อความ, ไม่มีรูป → ต่อท้ายข้อความเดิม)
  function handleQuickPick(qm: QuickMessage) {
    // รูปหลายใบ (user สั่ง 2026-07-23) — แนบทั้งหมดลงคิว กดส่งครั้งเดียว ระบบทยอยส่งให้เอง
    // fallback imageFileId เดี่ยว: payload จาก API เวอร์ชันเก่าระหว่าง deploy
    const imgs = qm.imageFileIds?.length ? qm.imageFileIds : qm.imageFileId ? [qm.imageFileId] : []
    if (imgs.length > 0) {
      setPendingImages(imgs.map((fileId) => ({ fileId, previewUrl: `/api/files/${fileId}` })))
      if (qm.body) setText(qm.body)
    } else if (qm.body) {
      setText((prev) => (prev.trim() ? `${prev}\n${qm.body}` : qm.body))
    }
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

  // ดูรูปเต็มจอ — รวมรูปทุกใบในเธรด (เรียงตามเวลาเหมือนที่แสดง) เป็น slides ชุดเดียว แล้วจำ index
  // ของแต่ละข้อความไว้ เพื่อให้คลิกรูปไหนก็เปิดที่รูปนั้นแล้วเลื่อนดูใบอื่นต่อได้ (ไม่ใช่เปิดทีละใบ
  // แยกกัน) — เฉพาะ type='IMAGE'; VIDEO/AUDIO มี control ของตัวเอง, FILE เปิดแท็บใหม่อยู่แล้ว
  const imageSlides: { src: string }[] = []
  const slideIndexByMessageId = new Map<string, number>()
  for (const m of messages) {
    if (m.type === 'IMAGE' && m.imageUrl) {
      slideIndexByMessageId.set(m.id, imageSlides.length)
      imageSlides.push({ src: `/api/files/${m.imageUrl}` })
    }
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
        <div className="flex items-center gap-3">
          <Link
            href="/inbox"
            title="กลับรายการ"
            aria-label="กลับรายการ"
            className="btn btn-icon border-default-300 shrink-0 lg:hidden"
          >
            <Icon icon="arrow-left" className="text-lg" />
          </Link>
          <ChatAvatar avatar={buyerAvatar} name={buyerName} />
          <div className="min-w-0">
            <h5 className="text-base mb-1.25">{buyerName}</h5>
            <div className="flex flex-wrap items-center gap-1.5">
              <ChannelBadge channel={channel} label={channelName} imageUrl={channelAvatarUrl} />
              {/* ทักมาจากโฆษณา (feature 00018 Phase 2, messaging_referrals) — context แรกเข้าให้ร้านตอบตรงจุด */}
              {referralAdTitle && (
                <span className="badge bg-info/15 text-info text-2xs inline-flex max-w-56 items-center gap-1" title={referralAdTitle}>
                  <Icon icon="speakerphone" className="size-3 shrink-0" />
                  <span className="truncate">ทักจากโฆษณา: {referralAdTitle}</span>
                </span>
              )}
            </div>
          </div>
        </div>

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
            className={`btn btn-icon hover:bg-default-100 shrink-0 ${threadMuted ? 'text-default-500' : 'text-default-700'}`}
          >
            <Icon icon={threadMuted ? 'bell-off' : 'bell'} className="text-lg" />
          </button>
        )}
      </div>

      {/* feature 00018 T4 — แบนเนอร์ 24h window / token invalid (เฉพาะ channel != DEEP) แสดงทันทีใต้
          header เสมอเมื่อยังเปิดอยู่ ไม่ใช่แค่ตอนใกล้หมด (BRD §6.5) */}
      {isExternal && (
        <div className="px-4 pt-4">
          {tokenInvalid ? (
            <div className="bg-danger/15 text-danger flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
              <Icon icon="alert-circle" className="mt-0.5 shrink-0 text-lg" />
              <span>
                การเชื่อมต่อกับเพจนี้มีปัญหา — ไปที่ตั้งค่าช่องทางเพื่อเชื่อมต่อใหม่{' '}
                <Link href="/settings/channels" className="font-semibold underline">
                  ตั้งค่าช่องทาง
                </Link>
              </span>
            </div>
          ) : !liveWindowOpen ? (
            // แยก 2 เคส (user report 2026-07-24): ลูกค้ายังไม่เคยทัก vs ทักแล้วเกิน 24 ชม.
            // ทั้งคู่ส่งไม่ได้เหมือนกัน แต่ข้อความต่างกันไม่ให้ผู้ขายเข้าใจผิดว่า "เกิน 24 ชม.ของใคร"
            <div className="bg-danger/15 text-danger flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
              <Icon icon="message-circle-off" className="mt-0.5 shrink-0 text-lg" />
              <span>
                {neverInbound
                  ? 'ลูกค้ายังไม่เคยทักเข้ามาในระบบ — ส่งข้อความจากที่นี่ไม่ได้จนกว่าลูกค้าจะทักมา (นโยบาย Messenger/Instagram)'
                  : 'เกิน 24 ชั่วโมงนับจากข้อความล่าสุดของลูกค้า — ส่งข้อความใหม่ไม่ได้ กรุณารอให้ลูกค้าทักมาใหม่'}
              </span>
            </div>
          ) : (
            (() => {
              const banner = formatWindowBanner(liveRemaining)
              return (
                <div className={`${banner.cls} flex items-start gap-2 rounded-lg px-3 py-2 text-sm`}>
                  <Icon icon={banner.icon} className="mt-0.5 shrink-0 text-lg" />
                  <span>{banner.text}</span>
                </div>
              )
            })()
          )}
        </div>
      )}

      {/* scroll body — plain div + ref (ไม่ SimpleBar ตาม spec, ต้อง programmatic scroll) */}
      {/* overscroll-contain (user report prod 2026-07-23: "เวลา scroll มันไปถึง fixed ด้านบนเลย
          ทำให้ด้านบนขยับตลอด"): เมื่อเลื่อนถึงหัว/ท้ายรายการข้อความ เบราว์เซอร์จะส่ง scroll ต่อไปให้
          ancestor ที่เลื่อนได้ (scroll chaining) → คอลัมน์กลางของ (chat)/layout.tsx และหน้าเว็บ
          ขยับตาม หัวแชทเลื่อนหนีทั้งที่ควรค้าง. overscroll-contain ตัด chain ที่ container นี้ */}
      {/* pb-0 + last:mb-1 (user สั่ง 2026-07-23: "ข้อความสุดท้ายห่างจากช่องพิมพ์มากเกินไป เปลืองพื้นที่"):
          ระยะห่างเดิมเป็นผลรวม 3 ชั้น — `my-5` ของแถวสุดท้าย (20px) + `py-4` ของกล่อง scroll (16px)
          + `py-3.75` ของ composer (15px) ≈ 51px. ตัดชั้นกลางทิ้ง (pb-0) และหุบ margin ล่างของ
          "แถวสุดท้ายเท่านั้น" เหลือ 4px → ~19px โดยจังหวะห่างระหว่าง bubble (my-5 ตาม Base
          ChatPage.tsx) ไม่เปลี่ยนแม้แต่นิดเดียว */}
      <div
        ref={scrollRef}
        className="card-body min-h-0 grow overflow-y-auto overscroll-contain pt-4 pb-0 [&>*:last-child>*:last-child]:mb-1"
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
                <span className="badge bg-default-100 text-default-500 text-2xs">{g.label}</span>
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
                          <div className={`text-default-400 mt-1 flex items-center gap-1.5 text-xs ${mine ? 'justify-end' : ''}`}>
                            {showTime && (
                              <span className="flex items-center gap-1">
                                <Icon icon="clock" />
                                {formatTime(last.createdAt)}
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
                const mine = m.senderRole === 'SHOP'
                // จัดเวลาเป็นกลุ่ม — แสดงเวลาเฉพาะท้าย burst, ไม่ขณะกำลังส่ง, และข้อความล่าสุดซ่อนหลัง 1 นาที
                const atBurstEnd = burstEndIds.has(m.id)
                const isLastOld = m.id === lastMsgId && nowMs - new Date(m.createdAt).getTime() >= RECENT_MS
                const showTime = atBurstEnd && m._status !== 'sending' && !isLastOld
                // feature 00018 T4 (ภาคผนวก A-3): deliveryStatus/failureReason มีจริงตอน runtime
                // (getMessages ไม่ select เลย คืนทุกคอลัมน์ของ ChatMessage — ดู comment หัวไฟล์)
                const mExt = m as ChatMessageWithDelivery
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
                    </div>
                  ) : null
                return (
                  // Base ChatPage.tsx:64/79 — `my-5 flex items-start gap-2.5` (+ justify-end ฝั่งตัวเอง)
                  <div key={m.id} className={`group my-5 flex items-start gap-2.5 ${mine ? 'justify-end' : ''}`}>
                    {!mine && <ChatAvatar avatar={buyerAvatar} name={buyerName} />}
                    {mine && actionCluster}
                    {/* feature 00018 T4 (ภาคผนวก A-3): เดิม Base ไม่ใส่ max-w บนคอลัมน์นี้เลย ทำให้
                        ข้อความยาว (auto-reply) ดันเต็มบรรทัด — ห้ามใส่ percent bracket (ผิด HR7 ตาม
                        comment เดิมของไฟล์นี้) จึงใช้ Tailwind scale class มาตรฐาน (ไม่ใช่ bracket)
                        max-w-96 (24rem) — precedent scale class เดียวกับ InboxList.tsx max-w-52 และ
                        max-w-60 ที่บรรทัด IMAGE ด้านล่างในไฟล์นี้เอง; min-w-0 กัน flex item ไม่ยอม shrink,
                        break-words กันคำ/ลิงก์ยาวล้นกรอบ */}
                    <div className="min-w-0 max-w-96 break-words">
                      {/* reply quote (feature 00018 Phase 3) — กล่องจาง ๆ เยื้องเหนือบับเบิล ให้เห็นชัดว่าเป็น
                          quote คนละก้อนกับข้อความตอบ (user report 2026-07-25: ดูยาก) */}
                      {m.replyTo && (
                        <div className={`mb-1 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className="border-default-300 bg-default-100/70 max-w-full rounded-lg border-s-2 px-2.5 py-1">
                            <p className="text-default-500 mb-0 text-2xs font-medium">
                              ตอบกลับ{m.replyTo.senderRole === 'SHOP' ? 'ข้อความของร้าน' : buyerName}
                            </p>
                            <p className="text-default-500 mb-0 line-clamp-2 text-xs opacity-90">
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
                              <p className="text-default-400 mb-0 flex items-center gap-1 text-sm italic">
                                <Icon icon="ban" className="text-sm" />
                                ข้อความถูกลบ
                              </p>
                            </div>
                          )
                        }
                        // รูป/วิดีโอล้วน (ไม่มี caption) → ไม่มีกรอบ bubble (มีสี+รูปทรงในตัว); เสียง/ไฟล์คงกรอบ
                        // ORDER = การ์ด self-contained เช่นกัน (มีกรอบ/สีในตัว) → ไม่ต้องกรอบ bubble ครอบ
                        const bareImage =
                          m.type === 'ORDER' || ((m.type === 'IMAGE' || m.type === 'VIDEO') && m.imageUrl && !m.body)
                        return (
                          <div className={bareImage ? '' : `rounded px-6 py-3 ${m.type === 'PRODUCT' ? 'bg-light' : mine ? 'bg-primary text-white' : 'bg-light'}`}>
                        {m.type === 'ORDER' ? (
                          <OrderCardBubble card={m.orderCard ?? null} onEdit={openEditOrder} />
                        ) : m.type === 'PRODUCT' ? (
                          <ProductCardBubble card={m.productCard ?? null} username={shopUsername} thumbSize="size-14" />
                        ) : (
                          <>
                            {m.type === 'IMAGE' && m.imageUrl && (
                              // คลิก/กด Enter ที่รูป → เปิดเต็มจอ (user request 2026-07-23). ใช้ <button>
                              // ครอบแทนใส่ onClick บน <img> เพื่อให้โฟกัส/คีย์บอร์ด/screen reader ใช้ได้จริง
                              // (block + w-fit กันปุ่มยืดเต็มความกว้างบับเบิลจนกดโดนที่ว่างข้างรูป)
                              <button
                                type="button"
                                onClick={() => setLightboxIndex(slideIndexByMessageId.get(m.id) ?? -1)}
                                aria-label="ดูรูปเต็มจอ"
                                className="block w-fit cursor-zoom-in"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`/api/files/${m.imageUrl}`}
                                  alt="รูปภาพที่ส่ง"
                                  className="max-w-60 rounded"
                                />
                              </button>
                            )}
                            {/* feature 00018 — ไฟล์แนบช่องทางนอก (วิดีโอ/เสียง/ไฟล์) mirror มาแล้ว serve ผ่าน /api/files */}
                            {m.type === 'VIDEO' && m.imageUrl && (
                              <video src={`/api/files/${m.imageUrl}`} controls className="max-w-60 rounded" />
                            )}
                            {m.type === 'AUDIO' && m.imageUrl && (
                              <audio src={`/api/files/${m.imageUrl}`} controls className="max-w-60" />
                            )}
                            {m.type === 'FILE' && m.imageUrl && (
                              <a
                                href={`/api/files/${m.imageUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary flex items-center gap-2 text-sm font-medium hover:underline"
                              >
                                <Icon icon="file-download" className="text-lg" />
                                เปิดไฟล์แนบ
                              </a>
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
                              <p className="text-default-400 mb-0 text-sm italic">ข้อความไม่รองรับ — เปิดดูใน Messenger</p>
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
                          </>
                        )}
                          </div>
                        )
                      })()}
                      {/* reaction (feature 00018 Phase 2, message_reactions) — emoji ที่ react บนข้อความนี้
                          ชิปเล็ก ๆ เกยขอบล่างบับเบิล (FB-style); ฝั่งเรา justify-end, ฝั่งลูกค้า justify-start */}
                      {m.reactionEmoji && (
                        <div className={`-mt-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <span className="bg-card border-default-200 rounded-full border px-1.5 py-0.5 text-xs shadow-sm">
                            {m.reactionEmoji}
                          </span>
                        </div>
                      )}
                      {/* feature 00018 T4 — badge "ส่งไม่สำเร็จ" ใต้ bubble (deliveryStatus='FAILED';
                          null สำหรับข้อความแชทในแอปเดิมทั้งหมด — เงื่อนไขนี้จึงไม่ trigger กับ DEEP) */}
                      {mExt.deliveryStatus === 'FAILED' && (
                        <div className="bg-danger/15 text-danger mt-1.5 flex items-start gap-1 rounded px-2 py-1 text-2xs">
                          <Icon icon="alert-circle" className="mt-0.5 shrink-0 text-sm" />
                          <span>ส่งไม่สำเร็จ — {mExt.failureReason ?? 'ไม่ทราบสาเหตุ'}</span>
                        </div>
                      )}
                      {/* meta row (user request 2026-07-23): เวลาเป็นกลุ่ม (ท้าย burst, ไม่ทุกข้อความ) +
                          avatar เพจ/ร้าน ย้ายมาอยู่ใต้ข้อความ ขนาดเล็ก (size-5) + สถานะส่ง/อ่าน.
                          กำลังส่ง = ไม่มีเวลา; ข้อความล่าสุดซ่อนเวลาหลังส่งเกิน 1 นาที */}
                      {(showTime ||
                        (mine &&
                          (atBurstEnd ||
                            m._status === 'sending' ||
                            (m._status === 'failed' && m._retry) ||
                            m.id === lastShopMsgId ||
                            m._status === 'sent'))) && (
                        <div className={`text-default-400 mt-1 flex items-center gap-1.5 text-xs ${mine ? 'justify-end' : ''}`}>
                          {showTime && (
                            <span className="flex items-center gap-1">
                              <Icon icon="clock" />
                              {formatTime(m.createdAt)}
                            </span>
                          )}
                          {mine && m._status === 'sending' && (
                            <span className="flex items-center gap-1">
                              <Icon icon="loader-2" className="animate-spin" />
                              กำลังส่ง
                            </span>
                          )}
                          {mine && m._status === 'failed' && m._retry && (
                            <button
                              type="button"
                              onClick={() => retryMessage(m.id, m._retry!)}
                              className="text-danger flex items-center gap-1 font-medium hover:underline"
                            >
                              <Icon icon="refresh" />
                              ลองใหม่
                            </button>
                          )}
                          {mine && m._status !== 'sending' && m._status !== 'failed' && m.id === lastShopMsgId ? (
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
                    {!mine && actionCluster}
                  </div>
                )
              })}
            </div>
          ))
        )}
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

        {quickOpen && (
          <QuickMessageBar
            onPick={handleQuickPick}
            disabled={composerDisabled}
            onClose={() => setActivePanel(null)}
          />
        )}

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

          {/* feature 00018 T4 — disabled ถาวรเมื่อ channel != DEEP (backend คืน 400 ถ้าส่งรูปช่องทาง
              นอก — กันที่ UI ก่อนถึง error นั้น) หรือ composer ปิดทั้งชุด (window/token) */}
          <label
            className={`btn btn-icon text-default-600 hover:bg-default-100 shrink-0 ${attachDisabled || composerDisabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
            aria-label={attachDisabled ? 'ยังไม่รองรับการส่งรูปในช่องทางนี้' : 'แนบรูปภาพ'}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
              disabled={attachDisabled || composerDisabled || uploading || sending}
            />
            <Icon icon={uploading ? 'loader-2' : 'paperclip'} className={`text-lg ${uploading ? 'animate-spin' : ''}`} />
          </label>

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

          {/* feature 00018 T5 — เปิด Customer Panel แบบ sheet เฉพาะจอเล็ก (<1024px) ที่ desktop ใช้
              CustomerPanel.tsx แบบ persistent column แทน (ดู page.tsx)
              ms-auto: ดันไปชิดขวาสุดของแถวเครื่องมือ — คนละกลุ่มกับปุ่มแต่งข้อความ 3 ตัวทางซ้าย */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="ข้อมูลลูกค้า"
            className="btn btn-icon text-default-600 hover:bg-default-100 ms-auto shrink-0 lg:hidden"
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
              className="text-default-400 hover:bg-default-100 hover:text-default-700 flex size-6 shrink-0 items-center justify-center rounded-full"
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
            {/* คิวรูปที่รอส่ง — หลายรูปได้ (ข้อความสำเร็จรูปที่มีหลายรูป, user สั่ง 2026-07-23)
                เลื่อนแนวนอนเมื่อเกินความกว้าง; ลบได้ทีละใบ */}
            {pendingImages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto p-2 pb-0">
                {pendingImages.map((img, i) => (
                  <div key={img.fileId} className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.previewUrl} alt={`รูปที่จะส่ง ${i + 1}`} className="max-h-28 rounded-lg object-contain" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(img.fileId)}
                      aria-label={`ลบรูปที่ ${i + 1}`}
                      className="absolute end-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                    >
                      <Icon icon="x" className="text-sm" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              rows={1}
              className="min-h-11 block w-full resize-none border-0 bg-transparent px-3 py-2.5 text-sm outline-none transition-all focus:min-h-20 focus:ring-0"
              placeholder={composerDisabled ? 'ส่งข้อความไม่ได้ในตอนนี้' : pendingImages.length > 0 ? 'เพิ่มคำบรรยาย (ไม่บังคับ)' : 'พิมพ์ข้อความ...'}
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
      plugins={[Zoom]}
      labels={{ Previous: 'รูปก่อนหน้า', Next: 'รูปถัดไป', Close: 'ปิด', 'Zoom in': 'ขยาย', 'Zoom out': 'ย่อ' }}
    />
    </>
  )
}
