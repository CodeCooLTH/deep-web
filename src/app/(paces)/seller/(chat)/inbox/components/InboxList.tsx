'use client'
import { useOrderVocab } from '../../_components/DraftOrderProvider'

/**
 * InboxList — client list component ของ /inbox (feat 00011 Deep Chat, S-11;
 * feat 00018 T3: channel tabs + ตัวกรองเพจ + ค้นหา + channel badge overlay)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ContactList.tsx:19-24,44-57
 * (search box `input-icon-group`; row markup: flex justify-between gap-3 px-3.75 py-3 —
 * avatar + ชื่อ + preview ซ้าย, timestamp + badge ขวา) ตัด SimpleBar + "เขียนแชทใหม่"
 * (seller ไม่ initiate — UX-Design-Spec.md §S-11)
 *
 * Channel tabs: Base `theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx:677-689`
 * (`.nav-tabs`/`.nav-link` class) แต่ **ขับ active ด้วย React state เอง ไม่ใช้ `data-hs-tab`**
 * ของ Preline — เหตุผลเดียวกับ FilterDropdown (parent re-render บ่อยจาก fetch/search ทำให้
 * Preline inline-state พัง — ดู src/components/safepay/FilterDropdown.tsx comment หัวไฟล์)
 *
 * ตัวกรอง "เพจ": feat 00018 งาน 2 เปลี่ยนจาก FilterDropdown ธรรมดา → PageFilterDropdown.tsx
 * (search + radio list + avatar เพจ — ดู comment หัวไฟล์นั้น)
 * Channel badge overlay: ใช้ ChannelBadge.tsx (ChannelBadgeOverlay/getChannelDisplay) ที่มีอยู่แล้ว
 *
 * Avatar: reuse pattern BidderAvatar จาก
 * src/app/(paces)/seller/(dashboard)/auctions/[id]/components/AuctionBidFeed.tsx:55-79
 * (รูปจริง http URL หรือ storage fileId + fallback initials `generateInitials` จาก
 * src/utils/helpers.ts) — เธรดช่องทางนอก (feat 00018): IG มี avatarUrl จริง (profile_pic) โชว์รูปได้,
 * Messenger avatarUrl=null (App Review block profile_pic) → ตกไป initials. img onError ก็ fallback เอง
 *
 * Pagination: sentinel + IntersectionObserver — pattern
 * src/app/(paces)/seller/(dashboard)/notifications/components/NotificationFeed.tsx:242-252
 * ผูกกับ cursor pagination จริงของ GET /api/chat/conversations (ไม่ใช่ reveal local array)
 * T3: fetch เดียวกันนี้ (fetchList) ใช้ทั้ง loadMore (append) และ refetch เมื่อ filter เปลี่ยน
 * (replace) — ส่ง query param channel/shopChannelId/q ตาม contract .superpowers/sdd/t1-report.md
 *
 * known-gap (นอกขอบเขต T3 — ดู comment หัวไฟล์ page.tsx): route.ts ยัง enrich counterparty
 * เฉพาะ buyer ไม่ enrich ExternalContact — รายการที่โหลดผ่าน loadMore/filter refetch (ไม่ใช่
 * initial SSR) ของเธรดช่องทางนอกจะ fallback ชื่อเป็น "ผู้ติดต่อ" เสมอแม้มีชื่อจริงใน DB
 *
 * Unread: `badge bg-danger text-white text-2xs` (UX-Design-Spec.md S2) — เดิมแสดงคำว่า "ใหม่"
 * เพราะ data model เก็บ read-state ระดับห้องเท่านั้น (BR-CHAT-09) ไม่มี COUNT ต่อ conversation.
 * ตอนนี้ (user request 2026-07-23) แสดง "จำนวนข้อความที่ยังไม่ได้อ่าน" แทน — นับสดที่ server ด้วย
 * countUnreadByConversation (chat.service.ts, JOIN + GROUP BY ครั้งเดียวต่อหน้า ไม่ N+1) แล้ว
 * enrich เข้ามาเป็น field `unreadCount` ทั้งทาง SSR (inbox/page.tsx) และ GET /api/chat/conversations
 * bug fix (user report prod 2026-07-23): badge อย่างเดียวไม่พอ — แถวที่ยังไม่อ่านกับอ่านแล้ว
 * ใช้ typography เดียวกันเป๊ะจนแยกไม่ออกตอนกวาดตา. เพิ่ม "น้ำหนัก/สีตัวอักษรตามสถานะอ่าน"
 * (convention แอปแชททั่วไป): ยังไม่อ่าน = ชื่อ text-default-900 font-bold + ข้อความย่อ
 * text-default-800 font-semibold + เวลา text-default-700; อ่านแล้ว = เทาลงทั้งแถว
 * (text-default-600 / text-default-700 เหมือนเดิม) — token Paces ล้วน ไม่มี arbitrary value (HR7)
 *
 * Realtime (bug fix เดียวกัน): เดิมรายการนี้ fetch ครั้งเดียวตอน mount แล้วนิ่งตลอด — ข้อความที่
 * webhook (Messenger/Instagram) หรือผู้ซื้อ Deep ส่งเข้ามาไม่โผล่จนกว่าจะรีเฟรชหน้าเอง ทั้งที่ DB
 * trigger ยิง broadcast `chat:shop:{shopId}` event `new_message` อยู่แล้ว (migration
 * 20260703000400_chat_realtime_broadcast) — มีแต่ ChatToastListener (mount ที่ (dashboard)/layout)
 * ที่ฟัง ซึ่ง "ไม่ได้ mount ในหน้าแชท" ((chat)/layout.tsx ไม่มี VerticalLayout). แก้ด้วย 3 ชั้น:
 *   1) subscribe `chat:shop:{shopId}` ผ่าน subscribeShopChat (shared channel — ดู
 *      src/lib/chat-shop-realtime.ts ว่าทำไมต้องแชร์) → refresh หน้าแรกแบบ merge (debounce 400ms)
 *   2) fallback refresh เมื่อ tab กลับมา focus/visible (pattern เดียวกับ useSellerChatThread.ts:163)
 *      — ครอบเคสที่ broadcast ไม่มา เช่น ข้อความ senderRole='SHOP' (echo จากแอป Messenger ของร้าน)
 *      ที่ trigger ไม่ส่งเข้า channel นี้ตามดีไซน์ หรือ WebSocket หลุดเงียบ
 *   3) mark-read เชิงบวกฝั่ง client เมื่อเปิดบทสนทนา (localReadAt) — บน desktop rail component นี้
 *      ไม่ unmount ตอน soft-navigate ไป /inbox/{id} รอ shopLastReadAt จาก server รอบถัดไปไม่ทัน
 *      แถวที่เพิ่งกดอ่านจะยังหนาดำค้างอยู่
 *
 * นอก scope T3 (ตาม plan): ไม่ render ปุ่มปักหมุด/ซ่อน/ปิดงาน/kebab menu — backend (S-7)
 * ยังไม่มี service/API ใน phase นี้ — ห้ามทำปุ่มที่กดแล้วไม่เกิดอะไร
 *
 * feat 00018 (Chat Rail topbar): เพิ่ม prop `railMode` — เมื่อ true (เรียกจาก ChatRail.tsx,
 * desktop ≥1024) ช่องค้นหาย้ายไปอยู่ ChatHeader แล้ว (ดู ChatSearchBox.tsx) ไม่ render ช่องค้นหาซ้ำ
 * ที่นี่ + ใช้ debouncedQuery จาก ChatSearchContext แทน state ในตัว เมื่อ false/ไม่ระบุ (เรียกจาก
 * inbox/page.tsx มือถือ/แท็บเล็ต drill-down — ChatHeader ยังโผล่อยู่ทุก breakpoint แต่ InboxList
 * โหมดนี้เลือกไม่ผูกกับมัน คงพฤติกรรมเดิม local state + debounce ในตัวเอง ไม่แตะ)
 *
 * rewrite (chat-standalone): ย้ายมาจาก (dashboard)/inbox/components/InboxList.tsx — import
 * _shared เปลี่ยนเป็น alias (ย้ายข้าม route group); channel tabs เปลี่ยนจาก .nav-tabs/.nav-link
 * (icon+label ทุก tab) เป็น "pill ไอคอนล้วน" ตามที่ user สั่งเพิ่มวันนี้: "ทั้งหมด" ยังเป็นข้อความ,
 * Deep/Messenger/Instagram เหลือไอคอนล้วน (title+aria-label ภาษาไทยกำกับทุกปุ่ม) อยู่บรรทัด
 * เดียวไม่ตกบรรทัด — Base: ปุ่มวงกลม rounded-full ใช้ token เดียวกับ ChannelBadgeOverlay
 * (ChannelBadge.tsx — bg-light พื้นเฉย/bg-primary/15 พื้น active) ไม่ใช่ arbitrary ใหม่
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { toFileUrl } from '@/lib/file-url'
// ป้ายพฤติกรรมลูกค้า — SSOT เดียวกับหัวแผงลูกค้าในเธรด และป้ายท้ายชื่อในตาราง /orders (HR16)
import { customerBadges, type CustomerBehavior } from '@/lib/customer-behavior'
import { orderStageChipLabel } from '@/lib/order-stage'
import { generateInitials } from '@/utils/helpers'
import { formatChatListTime } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import { subscribeShopChat } from '@/lib/chat-shop-realtime'
import { playChatBeep } from '@/lib/chat-sound'
import { pickBeepTarget } from '@/lib/chat-beep-target'
import { useChatSearchQuery } from '@/context/useChatSearchContext'
import { useLongPress } from '@/hooks/useLongPress'
import { pacesConfirm } from '@/lib/paces-swal'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import PageFilterDropdown from './PageFilterDropdown'
import InboxFilterPanel from './InboxFilterPanel'
import { buildChatListParams, DEFAULT_CHAT_FILTER, isChatListFiltering, type ChatFilterState } from './chat-list-query'
import { type RowAction } from './ConversationRowMenu'
import ChatContextMenu, { type ChatRowAnchor } from './ChatContextMenu'
import SwipeableRow from './SwipeableRow'
import { useT } from '@/i18n/LocaleProvider'
import { salesStatusMeta } from '../[conversationId]/components/CustomerCrmSection'
import {
  ChannelBadgeOverlay,
  ChannelMark,
  getChannelDisplay,
  resolveChatChannel,
  type ChatChannel,
  type ChannelFilterOption,
} from './ChannelBadge'

/** ร้านในขอบเขตของกล่องแชทรวม (feature 00037) — ใช้ทำ badge ในแถวและตัวเลือกร้านตอนกดสร้าง */
export type ShopBrief = { id: string; name: string; logo: string | null }

export type ConversationListItem = {
  id: string
  buyerUserId: string | null // เธรดช่องทางนอก (feature 00018) ไม่มี User ผู้ซื้อ
  shopId: string
  channel: string // 'DEEP' | 'MESSENGER' | 'INSTAGRAM' — feature 00018 (T3: ใช้ทำ badge)
  /** เพจที่เธรดนี้ผูกอยู่ — ใช้หา "รูปเพจ" จาก prop `channels` ที่มี avatarUrl อยู่แล้ว
   *  (ไม่ต้อง query เพิ่ม); null = เธรด Deep */
  shopChannelId?: string | null
  lastMessageAt: string
  lastMessagePreview: string | null
  lastSenderRole: 'BUYER' | 'SHOP' | null
  buyerLastReadAt: string | null
  shopLastReadAt: string | null
  createdAt: string
  // S-7 (ตัวกรอง/จัดการเธรด) — pin indicator + badge "ปิดงานแล้ว" + ตัดสิน action ใน kebab
  isPinned: boolean
  resolvedAt: string | null
  counterparty: { displayName: string; avatar: string | null } | null
  /** จำนวนข้อความจากลูกค้าที่ร้านยังไม่ได้อ่าน (enrich ที่ route/page ด้วย countUnreadByConversation)
   *  optional เผื่อ payload เก่าที่ยังไม่มี field นี้ → fallback เป็น read-mark เดิม */
  unreadCount?: number
  // feature 00018 CRM — ชื่อในแชท (alias) + tag/สถานะขาย (badge ในแถว) — optional เผื่อ payload เก่า
  alias?: string | null
  contactTags?: string[]
  contactSalesStatus?: string
  // feature 00018 — กลุ่ม/แท็บที่เธรดนี้ถูกจัดไว้ (null = แท็บ "ทั้งหมด") — ใช้โชว์ชิปโฟลเดอร์ในแถว
  // ตอนอยู่แท็บ "ทั้งหมด" ให้รู้ว่าเธรดนี้อยู่กลุ่มไหน (user สั่ง 2026-07-24)
  chatGroupId?: string | null
  isSpam?: boolean // feature 00018 — เธรดสแปม (user สั่ง 2026-07-24); ตัดสิน action spam/unspam ใน mini-action
  // user request 2026-07-29 — ป้ายขั้นตอนของออเดอร์ล่าสุด (แทน orderCount เดิมของ 2026-07-25)
  // null = ไม่ต้องแสดงชิป (ไม่เคยมีออเดอร์ หรือป้ายหมดอายุแล้ว — ดู deriveOrderStage)
  // enrich ด้วย enrichWithOrderStage ทั้งฝั่ง RSC (inbox/page.tsx) และ route; optional เผื่อ payload เก่า
  orderStage?: {
    key: string
    label: string
    cls: string
    icon: string
    printCount?: number
    /** ≥2 = ลูกค้าคนนี้มีพัสดุติดปัญหาหลายใบพร้อมกัน → ป้ายเติม "×N" (user สั่ง 2026-08-20) */
    problemCount?: number
  } | null
  /** ป้ายพฤติกรรมลูกค้า (user สั่ง 2026-08-11) — null = ยังไม่ผูกกับลูกค้าในระบบ (ไม่มีป้ายเลย)
   *  enrich ด้วย enrichWithCustomerBehavior ทั้งฝั่ง RSC และ route เหมือน orderStage */
  customerBehavior?: CustomerBehavior | null
  // S-20 (phase 00023-qna) — ป้าย DeepBot/DeepAI แทนคำว่า "คุณ: " เมื่อข้อความล่าสุดมาจากบอท
  // ค่าคือ autoReplyKind ของข้อความล่าสุดจริงของเธรด ('AUTO' | 'AUTO_TEST' | null)
  // enrich ด้วย enrichWithAutoReplyBadge ทั้งฝั่ง RSC (inbox/page.tsx) และ route
  // optional เผื่อ payload เก่าที่ยังไม่มี field นี้ -> fallback เป็นพฤติกรรมเดิม ("คุณ: ")
  lastMessageAutoReplyKind?: string | null
  /**
   * true = ข้อความล่าสุดมาจาก **ChatBot (DeepAI)** ตอบจากคลังความรู้ · false = คำตอบสำเร็จรูป (DeepBot)
   *
   * ชื่อฟิลด์เป็นมรดกจากยุค AI Enhance ที่ถูกถอดออกไปแล้ว (`68c37cd3`) — คงชื่อไว้เพราะทั้ง RSC
   * และ route ส่งชื่อนี้อยู่ · เดิมค่านี้ hardcode `false` ทั้งสองทาง ป้าย DeepAI จึงไม่เคยขึ้นเลย
   * (แก้แล้ว 2026-08-02 — อ่านจาก `AutoReplyLog.matchedVia = 'CHATBOT'`)
   */
  lastMessageIsAiEnhanced?: boolean
  // feature 00018 E5 (user request 2026-07-26) — รหัสโฆษณาที่พาลูกค้าคนนี้เข้ามา โชว์เป็นชิป
  // `ad_id.…` ในแถวแบบ Business Suite; optional เผื่อ payload เก่า
  referralAdId?: string | null
  /**
   * feature 00037 (แก้ 2026-08-08 หลัง ux gate) — ร้านเจ้าของเธรด สำหรับป้ายข้อความในแถว
   *
   * มีเฉพาะโหมดรวมหลายร้าน (server ไม่ enrich ให้เลยเมื่อขอบเขตมีร้านเดียว) — optional ตาม
   * pattern เดียวกับ orderStage/referralAdId
   *
   * 🛑 ทำไมเป็น "ข้อความ" ไม่ใช่ badge รูป: รอบแรกทำเป็น badge รูปมุมบนซ้ายของ avatar แล้วพบว่า
   * ซ้ำกับรูปเพจมุมล่างขวาบนข้อมูลจริง (ร้านตั้งโลโก้เพจเป็นโลโก้ร้านเป็นเรื่องปกติ) — ภาพซ้ำกันได้
   * ข้อความไม่ซ้ำโดยไม่ตั้งใจ
   */
  shop?: { id: string; name: string } | null
}

// ตัวเลือกตัวกรอง "เพจ" — ย้ายนิยามไป ChannelBadge.tsx แล้ว (feat 00018 งาน 2: PageFilterDropdown
// ต้องใช้ type เดียวกัน ไม่อยาก import ย้อนจากไฟล์นี้จนวนเป็น circular import) — re-export ไว้ที่นี่
// เพื่อไม่ต้องแก้ import ที่ page.tsx/ChatRail.tsx (ยังเรียก `from './components/InboxList'` เดิม)
export type { ChannelFilterOption } from './ChannelBadge'

type ApiResponse = { items: ConversationListItem[]; nextCursor: string | null }

/** tab ตัวกรองช่องทาง — 'ALL' ไม่ใช่ ChatChannel จริง จึงแยก union เพิ่ม */
type ChannelTab = 'ALL' | ChatChannel
// feature 00025 S-14a — เพิ่ม LINE ต่อท้าย (ลำดับเดิมของ DEEP/MESSENGER/INSTAGRAM คงเดิม ไม่สลับ)
const CHANNEL_TABS: ChannelTab[] = ['ALL', 'DEEP', 'MESSENGER', 'INSTAGRAM', 'LINE']

// feature 00018 CRM — badge สถานะการขายในแถว (UNSPECIFIED ไม่โชว์). ต้องตรงกับ CustomerCrmSection
/**
 * ป้ายสถานะการขาย — import จาก `CustomerCrmSection` ตัวเดียว ไม่ประกาศซ้ำ (Hard Rule 16)
 *
 * 🛑 เดิมไฟล์นี้มีก็อปของตัวเอง แล้ว **ดริฟต์จากกันจริง**: ที่นี่แก้ "สนใจ" จากเขียวเป็น info
 * ไปแล้ว 2026-08-09 (Verified-Means-Green + คอนทราสต์ 2.11:1 ตก AA) แต่ก็อปในแผงลูกค้ายังเขียวอยู่
 * ⇒ ป้ายอันเดียวกันของลูกค้าคนเดียวกันคนละสีในสองหน้าจอ. รวมเป็นตัวเดียวแล้วทั้งสองที่ได้สีที่แก้แล้ว
 */

/** จำนวนข้อความที่ยังไม่ได้อ่านของแถวนี้ (0 = อ่านแล้ว → ไม่ขึ้น badge, ตัวหนังสือเทา)
 *
 *  ปกติใช้ unreadCount ที่ server นับมาให้ (เฉพาะข้อความจากลูกค้า) — ดีกว่าเกณฑ์เดิม
 *  `lastMessageAt > shopLastReadAt` ที่นับข้อความ "ที่ร้านเพิ่งพิมพ์เอง" เป็นยังไม่อ่านด้วย
 *  fallback (payload ไม่มี field): เกณฑ์ read-mark เดิม → 1/0 (มีแค่ read-state ระดับห้อง BR-CHAT-09)
 *
 *  localReadAt = mark-read เชิงบวกฝั่ง client (เวลาที่กดเปิดบทสนทนาในรอบนี้) — ถ้าอ่านหลังข้อความ
 *  ล่าสุดแล้วถือว่าเคลียร์หมด ไม่ต้องรอ server refetch (บน desktop rail ไม่ unmount ตอน navigate)
 */
function unreadCountOf(c: ConversationListItem, localReadAt?: string): number {
  // user request 2026-07-25: ข้อความล่าสุดเป็นฝั่งเรา (SHOP — ตอบจาก Deep/admin คนอื่น/echo จากเพจตรง)
  // = ถือว่าอ่านแล้ว → ไม่ขึ้น badge, ตัวหนังสือเทา (backend ก็ตัดออกแล้วที่ countUnreadByConversation
  // แต่กันไว้ที่นี่ด้วยเผื่อ payload เก่า/เกณฑ์ fallback ที่นับข้อความร้านเอง)
  if (c.lastSenderRole === 'SHOP') return 0
  const count =
    c.unreadCount ??
    (c.shopLastReadAt === null || new Date(c.lastMessageAt) > new Date(c.shopLastReadAt) ? 1 : 0)
  if (count === 0) return 0
  if (localReadAt && new Date(localReadAt).getTime() >= new Date(c.lastMessageAt).getTime()) return 0
  return count
}

/** avatar คู่สนทนา — รูปจริง (http URL หรือ storage fileId) + fallback initials */
function BuyerAvatar({ avatar, name }: { avatar: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  const src = avatar ? (toFileUrl(avatar)) : null
  if (!src || failed) {
    return (
      // size-10 (40px) ไม่ใช่ size-9: user report 2026-07-23 ว่า badge ช่องทางบังจนรูปโปรไฟล์ดูเล็ก
      // ขยาย avatar + ลด badge (ดู ChannelBadgeOverlay) ให้สัดส่วน badge ต่อ avatar ลดจาก 56% เหลือ 40%
      <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
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
      className="size-10 shrink-0 rounded-full bg-default-100 object-cover"
    />
  )
}

// กลุ่ม/แท็บจัดหมวดแชท (feature 00018) — type-only (ไม่ import จาก service ที่ผูก prisma เข้ามาใน client)
export type ChatGroupTab = { id: string; name: string; sortOrder: number }

type Props = {
  initialItems: ConversationListItem[]
  initialNextCursor: string | null
  channels: ChannelFilterOption[]
  /** ร้านเชื่อม iShip แล้วหรือยัง (ShopShippingAccount status=ACTIVE) — ใช้ซ่อนหัวข้อ "พัสดุ"
   *  ในตัวกรองสำหรับร้านที่ไม่ได้ใช้ ตัดสินฝั่ง server ไม่ต้องให้ client ยิงถามเพิ่ม */
  hasShipping?: boolean
  /** กลุ่ม/แท็บจัดหมวดแชทของร้าน (feature 00018) — SSR ส่งมา, client จัดการเพิ่ม/ลบต่อ */
  initialGroups?: ChatGroupTab[]
  /** true = เรียกจาก Chat Rail (desktop, feat 00018) — ช่องค้นหาอยู่ topbar แล้ว ไม่ render ในตัว
   *  ไม่ระบุ/false = มือถือ/แท็บเล็ต drill-down list (inbox/page.tsx) — พฤติกรรมเดิมทุกประการ */
  railMode?: boolean
  /** true = มีแท็บ ข้อความ|ความคิดเห็น เป็น sticky อยู่เหนือขึ้นไปในกล่อง scroll เดียวกัน (มือถือ)
   *  → หัวรายการต้องเกาะใต้แท็บแทนที่จะเกาะขอบบน ไม่งั้นทับกัน. Chat Rail ไม่ต้องใช้ เพราะที่นั่น
   *  แท็บอยู่นอกกล่อง scroll ไปแล้ว (ChatRail.tsx) */
  tabsAbove?: boolean
  /** ร้านที่รายการครอบคลุม (feature 00037) — subscribe realtime `chat:shop:{id}` ทุกตัวในรายการ
   *  ว่าง = ไม่ subscribe (ยัง fallback refresh ตอน focus ได้ปกติ) */
  shopIds?: string[]
  /** true = โหมดรวมหลายร้าน — เปิด badge ร้านในแถว, ซ่อนแท็บกลุ่ม, ปุ่มสร้างใช้คำกลาง
   *  false = พฤติกรรมเดิมทุกประการ (ผู้ใช้ส่วนใหญ่ของระบบอยู่ทางนี้) */
  unified?: boolean
  /** ร้านที่ active — ค่าตั้งต้นของปุ่มสร้างเมื่อยังไม่ได้เปิดเธรด (BR-UNI-07: ห้ามใช้ตัดสินขอบเขต) */
  activeShopId?: string | null
  /**
   * (ส่วนขยาย 00025 2026-08-12 / AC-CH-31) ผู้ใช้คนนี้ปิดแจ้งเตือนข้อความของร้านที่ active อยู่
   *
   * เป็น **การบอกความจริงของค่าที่เขาตั้งเอง** ไม่ใช่คำเตือนว่าระบบพัง — น้ำเสียงจึงต่างจาก
   * แถบสถานะช่องทาง (info ไม่ใช่ danger) และไม่มีปุ่มปิดถาวร เพราะถ้าปิดได้ ผู้ใช้จะลืมว่า
   * ตัวเองปิดแจ้งเตือนไว้ แล้วพลาดข้อความสำคัญโดยไม่รู้ว่าทำไม
   */
  chatMuted?: boolean
  /**
   * ร้านนี้เชื่อมช่องทางแชทไว้แล้วหรือยัง — ใช้เฉพาะตอนรายการว่าง "และไม่ได้กรองอะไรอยู่"
   * เพื่อเลือกว่าจะชวนไปเชื่อมเพจหรือแค่บอกว่ายังไม่มีใครทัก
   */
  hasAnyChannel?: boolean
}

export default function InboxList({
  initialItems,
  initialNextCursor,
  channels,
  initialGroups = [],
  hasShipping = false,
  railMode = false,
  tabsAbove = false,
  shopIds = [],
  unified = false,
  activeShopId = null,
  chatMuted = false,
  hasAnyChannel = true,
}: Props) {
  const t = useT()
  // ประกาศเป็น Record<string,…> เหมือนก็อปเดิมของไฟล์นี้ — `contactSalesStatus` มาจาก API เป็น
  // string ธรรมดา (ไม่ใช่ union) การ index จึงต้องยอมรับคีย์ที่ไม่รู้จักแล้วตกไป fallback ด้านล่าง
  const SALES_STATUS_META: Record<string, { label: string; cls: string }> = salesStatusMeta(t)
  // ชื่อเรียกรายการตามประเภทกิจการ — อ่านจาก DraftOrderProvider ที่ครอบทั้ง (chat) อยู่แล้ว
  // (ป้ายสถานะออเดอร์ล่าสุดในรายการแชทเคยเขียน "คำสั่งซื้อ" ตายตัว ทั้งที่ร้านบริการ/บ้านพัก
  //  เรียกคนละชื่อ — ตัวเลขและป้ายเดียวกันโผล่หลายที่ต้องมาจากคำชุดเดียวกัน)
  const orderVocab = useOrderVocab()
  // join เป็น string — array prop สร้างใหม่ทุก render ของ parent ถ้าใช้ตัว array ตรง ๆ เป็น dep
  // effect จะวิ่งไม่จบ (ใช้ทั้ง effect subscribe realtime และ effect ตอนขอบเขตเปลี่ยน)
  // (ส่วนขยาย 00025 2026-08-12 / S4) สถานะปิดแจ้งเตือน — server ส่งค่าเริ่มต้นมา แล้ว client
  // ซ่อนแถบเองเมื่อกดเปิดสำเร็จ (ไม่ต้อง refresh ทั้งหน้าเพื่อซ่อนแถบเดียว)
  const [muted, setMuted] = useState(chatMuted)
  const [unmuting, setUnmuting] = useState(false)

  async function handleUnmute() {
    if (!activeShopId) return
    setUnmuting(true)
    try {
      const res = await fetch('/api/account/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId: activeShopId, chatEnabled: true }),
      })
      if (!res.ok) {
        pacesToast.error('เปิดแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      // 🛑 ซ่อนแถบ **หลัง** ได้ผลจริงเท่านั้น ไม่ optimistic — ซ่อนผิดแล้วผู้ใช้เชื่อว่าเปิดแล้ว
      // ทั้งที่ยังปิดอยู่ ซึ่งเสียหายกว่าปุ่มค้างอีกครึ่งวินาที
      setMuted(false)
      pacesToast.success('เปิดแจ้งเตือนของร้านนี้แล้ว')
    } catch {
      pacesToast.error('เปิดแจ้งเตือนไม่สำเร็จ — เครือข่ายมีปัญหา')
    } finally {
      setUnmuting(false)
    }
  }

  const shopIdsKey = shopIds.join(',')
  const [items, setItems] = useState<ConversationListItem[]>(initialItems)
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // ── T3: filter/search state — ขับ tab ด้วย React state เอง (ไม่ใช้ data-hs-tab) ──
  const [channelTab, setChannelTab] = useState<ChannelTab>('ALL')
  const [pageFilter, setPageFilter] = useState('') // shopChannelId, '' = ทุกเพจ
  // feature 00018 กลุ่ม/แท็บจัดหมวดแชท (ตัวกรองอ่านแล้ว/ยังไม่อ่าน ย้ายเข้า filter.readState แล้ว)
  const [groups, setGroups] = useState<ChatGroupTab[]>(initialGroups)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null) // null = แท็บ "ทั้งหมด"

  // แท็กทั้งหมดที่ร้านเคยใช้ — ใช้ทำชิปในตัวกรอง (user สั่ง 2026-07-31)
  // endpoint เดียวกับที่ TagInput ใช้อยู่แล้ว ไม่ต้องทำใหม่; ล้มเหลว = ไม่มีหัวข้อแท็ก ไม่พังทั้งหน้า
  const [allTags, setAllTags] = useState<string[]>([])
  useEffect(() => {
    fetch('/api/chat/tags', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((d) => setAllTags(Array.isArray(d.tags) ? d.tags : []))
      .catch(() => {})
  }, [])
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  // S-7 (ตัวกรองแชท): สถานะ/ผูกลูกค้า/ที่ซ่อน — init = default เดียวกับ SSR (status=open, hidden=false)
  const [filter, setFilter] = useState<ChatFilterState>(DEFAULT_CHAT_FILTER)
  // popover ตัวกรองเปิดได้ทีละตัว — state อยู่ที่นี่ (bug: เดิมสองตัวถือ state เอง เปิดพร้อมกันแล้วทับกัน)
  const [openPanel, setOpenPanel] = useState<'filter' | 'page' | 'group' | null>(null)
  const groupMenuRef = useRef<HTMLDivElement | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null) // แถวที่มี PATCH ค้าง (กันดับเบิล)
  // feature 00018 CRM — แผงลัดประจำแถว (ปักหมุด/ปิดงาน/ซ่อน/สแปม + สถานะขาย/แท็ก/กลุ่ม/เสียง)
  // เปิดได้ 2 ทาง: คลิกขวา (เดสก์ท็อป → anchor 'point') และกดค้าง (มือถือ → anchor 'row' = โหมดเพ่ง)
  const [ctxMenu, setCtxMenu] = useState<{ id: string; anchor: ChatRowAnchor } | null>(null)

  // ── กดค้างบนแถว → แผงลัดโหมดเพ่ง (user สั่ง 2026-08-06) ────────────────
  //
  // ทำไมต้องมี: ทางเข้าเดิมของแผงนี้คือ `onContextMenu` = คลิกขวา ซึ่งจอสัมผัสไม่มี — iOS Safari
  // ไม่ยิง contextmenu จากการกดค้างเลย ผลคือบนมือถือ "ใช้ shortcut ไม่ได้" ทั้งแผง (ปัดซ้ายให้แค่
  // 4 ปุ่มแรก ไม่มีสถานะขาย/แท็ก/กลุ่ม/เสียง)
  //
  // hook เรียกในลูปไม่ได้ จึงมีตัวเดียวที่ container แล้ว resolve ย้อนกลับว่านิ้วอยู่บนแถวไหนผ่าน
  // data-conversation-id — idiom เดียวกับเธรดแชท (ChatThread.tsx:928)
  const longPress = useLongPress((point) => {
    const el = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>('[data-conversation-id]')
    const id = el?.getAttribute('data-conversation-id')
    if (el && id) setCtxMenu({ id, anchor: { kind: 'row', row: el } })
  })
  // เมนู ⋯ ของชุดปุ่ม hover (user สั่ง 2026-08-02) — เก็บเป็น "id ของแถวที่เปิดอยู่" ที่ระดับ list
  // ไม่ใช่ state ในแต่ละแถว เพราะชุดปุ่มต้องรู้ด้วยว่าเมนูเปิดอยู่ไหม (ต้องค้างไว้แม้เมาส์ออกนอกแถว)
  // และเปิดได้ทีละแถวเดียวอยู่แล้ว ref จึงใช้ตัวเดียวร่วมกันได้
  const [rowMenuId, setRowMenuId] = useState<string | null>(null)
  const rowMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!rowMenuId) return
    function onPointerDown(e: MouseEvent) {
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) setRowMenuId(null)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setRowMenuId(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [rowMenuId])

  // ── ช่องค้นหา ──
  // railMode=true: query มาจาก ChatSearchContext (topbar เขียน, ที่นี่แค่อ่าน debouncedQuery —
  //   re-render เฉพาะทุก 400ms ไม่ใช่ทุกตัวอักษร ดู comment หัวไฟล์ useChatSearchContext.tsx)
  // railMode=false: local state + debounce ในตัวเอง (พฤติกรรมเดิมก่อน feat 00018 ทุกประการ)
  // ต้องเรียก useChatSearchQuery() แบบไม่มีเงื่อนไข (rules-of-hooks) — ทั้ง 2 กรณีอยู่ใต้
  // ChatSearchProvider (mount ที่ VerticalLayout.tsx) เหมือนกันอยู่แล้ว เรียกได้เสมอ
  const chatSearchQuery = useChatSearchQuery()
  const [localSearchInput, setLocalSearchInput] = useState('')
  const [localDebouncedQuery, setLocalDebouncedQuery] = useState('')
  const isFirstRun = useRef(true)

  // debounce ช่องค้นหา client-side ก่อนยิง ?q= — เฉพาะโหมด local (railMode=false)
  useEffect(() => {
    if (railMode) return // topbar debounce ให้แล้วผ่าน ChatSearchContext
    const t = setTimeout(() => setLocalDebouncedQuery(localSearchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [localSearchInput, railMode])

  const debouncedQuery = railMode ? chatSearchQuery.debouncedQuery : localDebouncedQuery

  /**
   * ลายเซ็นของ "ชุดข้อมูลที่หน้าจอกำลังแสดง" = ตัวกรองทั้งหมดที่มีผลกับรายการ (ไม่รวม take/cursor)
   *
   * ต้องมีเพราะทั้ง `fetchList` และ `refreshFirstPage` เป็น async และ **ไม่มีอะไรผูกผลลัพธ์กับ
   * ตัวกรองที่ใช้ยิงมันออกไป** — ผลของแท็บเก่าที่ค้างอยู่ในสายจึงมาถึงทีหลังแล้วถูกเขียน/merge
   * ทับชุดใหม่ได้ (user เจอเองบน prod 2026-08-10: กดแท็บ "ปิดงาน"/"สแปม" แล้วเห็นแถวของแท็บ
   * "ทั้งหมด" โผล่มาปนกับสถานะ "ไม่พบบทสนทนาตามที่กรอง")
   *
   * `refreshFirstPage` อันตรายที่สุดในกลุ่มนี้เพราะมันตั้งใจ **merge** ไม่ใช่ replace
   * (เพื่อไม่ให้แถวจาก loadMore หน้าถัด ๆ ไปหายกลางคัน) — merge ที่ไม่เช็คลายเซ็นเท่ากับ
   * "เก็บแถวที่ไม่ตรงตัวกรองปัจจุบันไว้ตลอดไป" และมันถูกยิงทุก 20 วิ + ทุก broadcast realtime
   * จึงเกิดซ้ำได้เองแม้ผู้ใช้ไม่กดอะไรอีก
   */
  const listSignature = buildChatListParams(filter, {
    channelTab,
    pageFilter,
    q: debouncedQuery,
    chatGroupId: activeGroupId,
  }).toString()
  const listSignatureRef = useRef(listSignature)
  /** ลายเซ็นของ "แถวที่อยู่ใน state ตอนนี้" — ต่างจาก listSignatureRef ที่เป็นของ "ที่ควรแสดง"
   *  ทั้งคู่ต่างกันได้จริงในช่วงที่ยังรอผลของตัวกรองใหม่ ซึ่งเป็นช่วงที่ poll 20 วิยิงแทรกได้พอดี */
  const itemsSignatureRef = useRef(listSignature)

  // fetch เดียวใช้ทั้ง loadMore (append) และ refetch เมื่อ filter เปลี่ยน (replace)
  const fetchList = async (opts: { cursor?: string; append: boolean }) => {
    const sig = listSignature
    setLoading(true)
    try {
      // S-7 ตัวกรอง — ประกอบผ่าน builder ตัวเดียวกับที่ ChatRail ใช้ดึงชุดแรก (ห้ามเขียน
      // query string เองอีก: ชุดแรกกับชุด refetch ต้องสะกดตัวกรองชุดเดียวกันเสมอ ไม่งั้น
      // "รายการหายตอนเข้าครั้งแรก แล้วโผล่ตอนสลับแท็บ" กลับมาอีก — ดู chat-list-query.ts)
      const params = buildChatListParams(filter, {
        take: 20,
        cursor: opts.cursor,
        channelTab,
        pageFilter,
        q: debouncedQuery,
        chatGroupId: activeGroupId,
      })
      const res = await fetch(`/api/chat/conversations?${params.toString()}`)
      if (!res.ok) throw new Error('load failed')
      const data: ApiResponse = await res.json()
      // ตัวกรองเปลี่ยนไปแล้วระหว่างรอ → ผลชุดนี้เป็นของแท็บที่ผู้ใช้ออกไปแล้ว ทิ้งทั้งก้อน
      // (ห้าม setItems ต่อ ไม่ว่าจะ append หรือ replace — ทั้งคู่ทำให้แถวข้ามตัวกรองโผล่)
      if (sig !== listSignatureRef.current) return
      itemsSignatureRef.current = sig
      setItems((prev) => (opts.append ? [...prev, ...data.items] : data.items))
      setNextCursor(data.nextCursor)
    } catch {
      pacesToast.error(opts.append ? 'โหลดเพิ่มไม่สำเร็จ ลองใหม่อีกครั้ง' : 'โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  const loadMore = () => {
    if (!nextCursor || loading) return
    fetchList({ cursor: nextCursor, append: true })
  }

  // refetch เมื่อ filter/search เปลี่ยน — ข้าม run แรก (initialItems มาจาก server ตรง filter default อยู่แล้ว)
  useEffect(() => {
    // ตั้งลายเซ็นของชุดที่ "กำลังจะแสดง" ก่อนยิงเสมอ — ผลที่ค้างอยู่ในสายจากตัวกรองก่อนหน้าจะเห็น
    // ค่านี้ไม่ตรงกับของตัวเองแล้วทิ้งตัวเองไป (ทั้ง fetchList และ refreshFirstPage)
    listSignatureRef.current = listSignature
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    fetchList({ append: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchList ผูก closure ของ filter ปัจจุบันอยู่แล้ว
  }, [channelTab, pageFilter, debouncedQuery, filter.status, filter.customerLinked, filter.hidden, filter.readState, filter.spam, filter.tags, filter.shipment, activeGroupId])

  /**
   * ขอบเขตร้านเปลี่ยน (สลับโหมดรวม↔ร้านเดียว) — โหลดรายการใหม่ "ด้วยตัวกรองเดิม" (ux gate 2026-08-08)
   *
   * เดิมใช้ key ที่ parent บังคับ remount ทั้งก้อน ซึ่งเคลียร์รายการได้จริงแต่ล้างตัวกรอง/แท็บ/
   * คำค้นของผู้ใช้ไปด้วย — การสลับโหมดคือการเปลี่ยน "ดูร้านไหน" ไม่ใช่ "เลิกกรองแบบที่ตั้งไว้"
   * คนที่กรอง "ยังไม่อ่าน" อยู่แล้วสลับไปดูทุกร้าน ก็ยังอยากเห็นเฉพาะที่ยังไม่อ่านของทุกร้าน
   *
   * รีเซ็ตเฉพาะสิ่งที่เป็น "ข้อมูลของขอบเขตเดิม" (รายการ + cursor ซึ่ง fetchList เขียนทับให้เอง)
   * ส่วนกลุ่มต้องล้างเมื่อ *เข้า* โหมดรวม เพราะ ChatGroup เป็นของรายร้าน — ค้างไว้จะกลายเป็นกรอง
   * ด้วยกลุ่มของร้านที่ไม่ได้อยู่ในสายตาแล้ว (และ UI ก็ซ่อนปุ่มกลุ่มในโหมดรวม จึงเอาออกเองไม่ได้)
   */
  const scopeSignature = `${unified ? 'U' : 'S'}:${shopIdsKey}`
  const prevScopeRef = useRef(scopeSignature)
  useEffect(() => {
    if (prevScopeRef.current === scopeSignature) return
    prevScopeRef.current = scopeSignature
    if (unified && activeGroupId !== null) {
      // setActiveGroupId จะ trigger effect ข้างบนให้ fetch เองอยู่แล้ว ไม่ต้องยิงซ้ำ
      setActiveGroupId(null)
      return
    }
    fetchList({ append: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchList ผูก closure ของตัวกรองปัจจุบันอยู่แล้ว
  }, [scopeSignature])

  // ชื่อกลุ่มที่เลือกอยู่ — ปุ่มดรอปดาวน์ต้องบอกได้ว่ากรองอะไรอยู่โดยไม่ต้องกดเปิด
  const activeGroupName = activeGroupId ? (groups.find((g) => g.id === activeGroupId)?.name ?? null) : null

  // ปิดดรอปดาวน์กลุ่มเมื่อคลิกนอกเมนู/กด Escape
  useEffect(() => {
    if (openPanel !== 'group') return
    const onPointerDown = (e: MouseEvent) => {
      const el = groupMenuRef.current
      // ไม่ปิดถ้าคลิกในตัวเมนูเอง หรือคลิกที่ปุ่มเปิด (ปุ่มมี toggle ของตัวเองอยู่แล้ว
      // ถ้าปิดตรงนี้ด้วยจะกลายเป็นปิดแล้วเปิดใหม่ทันที = กดปุ่มปิดเมนูไม่ได้)
      if (el?.contains(e.target as Node) || el?.parentElement?.contains(e.target as Node)) return
      setOpenPanel((prev) => (prev === 'group' ? null : prev))
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPanel((prev) => (prev === 'group' ? null : prev))
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openPanel])

  // สลับ tab ช่องทาง — เมื่อกลับไป Deep ต้องล้างตัวกรองเพจไปด้วย (filter ไม่ apply กับ Deep)
  const handleChannelTabChange = (tab: ChannelTab) => {
    setChannelTab(tab)
    if (tab === 'DEEP') {
      setPageFilter('')
      // ตัวกรอง "เพจ" ถูกซ่อนเมื่อ tab=Deep — ถ้า popover ของมันเปิดค้างอยู่ต้องเคลียร์ state ด้วย
      // ไม่งั้น openPanel ค้างเป็น 'page' ทั้งที่ component ถูก unmount ไปแล้ว
      setOpenPanel((p) => (p === 'page' ? null : p))
    }
  }

  // ตัดสินว่ารายการว่างเพราะ "ยังไม่เคยมีใครทัก" หรือ "กรองแล้วไม่เจอ" — คนละข้อความกันสิ้นเชิง
  const isFiltering = isChatListFiltering({
    filter,
    channelTab,
    pageFilter,
    query: debouncedQuery,
    chatGroupId: activeGroupId,
  })

  const clearFilters = () => {
    setChannelTab('ALL')
    setPageFilter('')
    setFilter(DEFAULT_CHAT_FILTER)
    if (railMode) chatSearchQuery.setSearchInput('')
    else setLocalSearchInput('')
  }

  // S-7: ปักหมุด/ซ่อน/ปิดงาน — PATCH แล้ว refetch list (append:false) + toast; "ซ่อน" ยืนยันก่อน
  const handleRowAction = async (id: string, action: RowAction) => {
    if (actioningId) return
    if (action === 'hide') {
      const ok = await pacesConfirm.question(
        'ซ่อนบทสนทนานี้?',
        'จะไม่แสดงในรายการหลัก ดูอีกครั้งได้จากตัวกรอง "เมนูที่ซ่อนอยู่"',
        { confirmButtonText: 'ซ่อน' },
      )
      if (!ok) return
    }
    setActioningId(id)
    try {
      const res = await fetch(`/api/chat/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        pacesToast.chat.error('ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      // สแปม/เอาออกจากสแปม = ตัวเลขบนแท็บเปลี่ยนแน่ ๆ → ข้าม throttle
      if (action === 'spam' || action === 'unspam') void refreshSpamUnread(true)
      const TOAST: Record<RowAction, string> = {
        pin: 'ปักหมุดบทสนทนาแล้ว',
        unpin: 'เลิกปักหมุดแล้ว',
        hide: 'ซ่อนบทสนทนาแล้ว',
        unhide: 'เลิกซ่อนแล้ว',
        resolve: 'ปิดงานแล้ว — ดูได้จากตัวกรองสถานะ "ปิดงานแล้ว"',
        reopen: 'เปิดบทสนทนาใหม่แล้ว',
        spam: 'ย้ายเข้าสแปมแล้ว — ดูได้จากตัวกรอง "ดูสแปม"',
        unspam: 'เอาออกจากสแปมแล้ว',
      }
      pacesToast.chat.success(TOAST[action])
      await fetchList({ append: false })
    } catch {
      pacesToast.chat.error('ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setActioningId(null)
    }
  }

  // ── แท็บมุมมอง: ทั้งหมด / ปิดงาน / สแปม (มาตรฐาน ลบไม่ได้) + กลุ่มที่ร้านสร้างเอง ──
  // user สั่ง 2026-07-31 (mockup V1): ปิดงาน/สแปม เป็นมุมมองพื้นฐานในแถวเดียวกับกลุ่ม
  //
  // ไม่ได้เก็บ state แยก — derive จาก filter ที่มีอยู่ (resolvedAt/isSpam คือแหล่งความจริงเดียวกับ
  // ที่ปุ่ม action ในแถวเขียน) แท็บกับปุ่มจึงสัมพันธ์กันเองทันที ไม่ต้องเขียน sync
  type ViewTab = 'ALL' | 'RESOLVED' | 'SPAM' | null
  const activeViewTab: ViewTab = filter.spam
    ? 'SPAM'
    : filter.status === 'resolved'
      ? 'RESOLVED'
      : // "ทั้งหมด" = status 'all' และไม่ได้อยู่ในกลุ่มไหน — เดิม 'all' ถูกใช้เป็นเคส
        // "ไม่มี UI ไหนตั้งค่านี้" เลย return null พอแท็บทั้งหมดเปลี่ยนมาตั้ง 'all' จริง
        // มันเลยตกเข้าเคสนั้นจนไม่มีแท็บไหน active เลย (user report 2026-07-31)
        activeGroupId === null && filter.status === 'all'
        ? 'ALL'
        : null

  const selectViewTab = (tab: Exclude<ViewTab, null>) => {
    setActiveGroupId(null)
    setFilter((f) => ({
      ...f,
      // "ทั้งหมด" = ยังไม่ปิดงาน + ปิดงานแล้ว (แยกด้วยไอคอน check หน้าชื่อ) — user สั่ง 2026-07-31
      // หลังพบว่าเธรดที่เพิ่งกดปิดงานหายจากแท็บที่ชื่อว่า "ทั้งหมด" ทันทีจนหาไม่เจอ
      // สแปมไม่รวม (user สั่งอีกรอบหลังลองใช้จริง) — ถังสแปมต้องเป็นถังแยกจริง ๆ
      status: tab === 'RESOLVED' ? 'resolved' : tab === 'SPAM' ? 'open' : 'all',
      spam: tab === 'SPAM',
    }))
  }

  /** เข้ากลุ่มที่ร้านสร้างเอง — คืน status/spam เป็นปกติ เพราะเธรดที่ปิดงาน/สแปมแล้ว
   *  ต้องไม่โผล่ในกลุ่มเดิมของมัน (user เลือก 2026-07-31) */
  const selectGroupTab = (groupId: string) => {
    setActiveGroupId(groupId)
    setFilter((f) => ({ ...f, status: 'open', spam: false }))
  }

  // ── feature 00018 กลุ่ม/แท็บจัดหมวดแชท ──
  // สร้างกลุ่มใหม่ (inline "+") — POST แล้วเพิ่มเข้า state + สลับไปแท็บนั้นเลย
  const handleCreateGroup = async () => {
    const name = newGroupName.trim()
    if (!name) {
      setAddingGroup(false)
      return
    }
    try {
      const res = await fetch('/api/chat/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        pacesToast.chat.error(data?.error ?? 'สร้างกลุ่มไม่สำเร็จ')
        return
      }
      setGroups((g) => [...g, data as ChatGroupTab])
      selectGroupTab(data.id)
      setNewGroupName('')
      setAddingGroup(false)
    } catch {
      pacesToast.chat.error('สร้างกลุ่มไม่สำเร็จ ลองใหม่อีกครั้ง')
    }
  }

  // ลบกลุ่ม (คลิกขวาที่แท็บ) — เธรดในกลุ่มกลับไป "ทั้งหมด" เอง (FK SetNull)
  const handleDeleteGroup = async (g: ChatGroupTab) => {
    const ok = await pacesConfirm.danger(`ลบกลุ่ม "${g.name}"?`, 'แชทในกลุ่มนี้จะกลับไปอยู่ "ทั้งหมด" (ไม่ถูกลบ)', {
      confirmButtonText: 'ลบกลุ่ม',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/chat/groups/${g.id}`, { method: 'DELETE' })
      if (!res.ok) {
        pacesToast.chat.error('ลบกลุ่มไม่สำเร็จ')
        return
      }
      setGroups((prev) => prev.filter((x) => x.id !== g.id))
      setActiveGroupId((cur) => (cur === g.id ? null : cur))
      pacesToast.chat.success('ลบกลุ่มแล้ว')
    } catch {
      pacesToast.chat.error('ลบกลุ่มไม่สำเร็จ ลองใหม่อีกครั้ง')
    }
  }

  // ย้ายเธรดเข้ากลุ่ม/เอาออก (คลิกขวาเธรด → เลือกกลุ่ม) — PATCH action 'set-group'
  const handleMoveToGroup = async (conversationId: string, chatGroupId: string | null) => {
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-group', chatGroupId }),
      })
      if (!res.ok) {
        pacesToast.chat.error('ย้ายกลุ่มไม่สำเร็จ')
        return
      }
      pacesToast.chat.success(chatGroupId ? 'ย้ายเข้ากลุ่มแล้ว' : 'เอาออกจากกลุ่มแล้ว')
      // ถ้ากำลังดูแท็บกลุ่มอยู่ แล้วย้ายออก → refetch ให้แถวหาย; อยู่แท็บ "ทั้งหมด" ก็ refetch เฉย ๆ
      await fetchList({ append: false })
    } catch {
      pacesToast.chat.error('ย้ายกลุ่มไม่สำเร็จ ลองใหม่อีกครั้ง')
    }
  }

  // ── realtime refresh (bug fix: รายการไม่อัปเดตเมื่อมีข้อความใหม่ — ดู comment หัวไฟล์) ──
  // refresh = ดึง "หน้าแรก" ตาม filter ปัจจุบันแล้ว merge ทับของเดิม (ไม่ replace ทั้งก้อน) —
  // แถวที่โหลดมาจาก loadMore หน้าถัด ๆ ไปต้องไม่หายไปกลางคัน และ nextCursor ต้องไม่ถูกรีเซ็ต
  // ไม่แตะ loading state — เป็นการรีเฟรชเบื้องหลัง ห้ามให้ spinner กระพริบใส่ผู้ใช้
  const refreshRef = useRef<() => void>(() => {})
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshFirstPage = async () => {
    const sig = listSignature
    try {
      // S-7: realtime refresh ต้องเคารพตัวกรองปัจจุบันด้วย (ไม่งั้นดึงแถวข้าม filter มา merge)
      const params = buildChatListParams(filter, {
        take: 20,
        channelTab,
        pageFilter,
        q: debouncedQuery,
        chatGroupId: activeGroupId,
      })
      const res = await fetch(`/api/chat/conversations?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) return
      const data: ApiResponse = await res.json()
      // ตัวกรองเปลี่ยนระหว่างรอ → ทิ้ง ห้าม merge (merge คือทางที่แถวข้ามตัวกรองเข้ามาได้)
      if (sig !== listSignatureRef.current) return
      setItems((prev) => {
        const freshIds = new Set(data.items.map((i) => i.id))
        // เสียงเตือนข้อความใหม่จากลูกค้า (user สั่ง 2026-07-23) — เทียบกับ state เดิม: เธรดใหม่ทั้งห้อง
        // หรือเธรดเดิมที่ lastMessageAt ขยับ **และ** ข้อความล่าสุดมาจากลูกค้า (ไม่ใช่ที่ร้านเพิ่งส่งเอง)
        // playChatBeep throttle ให้เองแล้วเมื่อหน้าเธรดดังพร้อมกัน (ดู comment ใน chat-sound.ts)
        /**
         * เสียงเตือนข้อความใหม่จากลูกค้า (user สั่ง 2026-07-23) — เกณฑ์อยู่ที่ `pickBeepTarget`
         * (`src/lib/chat-beep-target.ts`) ที่เดียว พร้อมเทส [blocker] ที่พิสูจน์ด้วย mutation แล้ว
         *
         * `comparable` = `prev` เป็นแถวของตัวกรองชุดเดียวกันหรือไม่ — ตัวแปรเดียวกับที่ `base`
         * ข้างล่างใช้ (คำถามเดียวกัน: "prev ชุดนี้เอามาเทียบได้ไหม") เดิมเสียงไม่ได้เช็คข้อนี้เลย
         * จึงดังทุกครั้งที่สลับแท็บ/ตัวกรอง/ค้นหา ทั้งที่ไม่มีข้อความใหม่ (user report 2026-08-10)
         */
        const comparable = itemsSignatureRef.current === sig
        const beepFor = pickBeepTarget({ comparable, items: data.items, previous: prev })
        // throttle key เป็นร้านของเธรดนั้นเอง (ไม่ใช่ร้าน active) — ในโหมดรวม ถ้าใช้ key เดียว
        // ข้อความของ 3 ร้านที่มาพร้อมกันจะได้ยินเสียงเดียว ทั้งที่เป็นคนละร้านคนละเรื่อง
        if (beepFor) playChatBeep({ shopId: beepFor.shopId, conversationId: beepFor.id })
        // หน้าแรกเรียงล่าสุดก่อนอยู่แล้ว (lastMessageAt desc) — วางไว้บนสุดแล้วต่อด้วยของเก่าที่ไม่ซ้ำ
        //
        // `base`: ต่อท้ายด้วยของเดิมได้ **เฉพาะเมื่อของเดิมเป็นชุดของตัวกรองเดียวกัน** — ถ้าผลของ
        // ตัวกรองใหม่มาถึงก่อนที่ fetchList(replace) จะตอบ (poll ยิงทุก 20 วิ ชนได้ง่าย) prev ยัง
        // เป็นแถวของแท็บก่อนหน้าอยู่ การ merge จะพาแถวเหล่านั้นเข้ามาอยู่ในแท็บใหม่
        const base = comparable ? prev : []
        return [...data.items, ...base.filter((p) => !freshIds.has(p.id))]
      })
      itemsSignatureRef.current = sig
    } catch {
      // เงียบ — รอ broadcast/focus รอบถัดไป (เหมือน refetchNewer ของ useSellerChatThread)
    }
  }

  useEffect(() => {
    refreshRef.current = refreshFirstPage
  })

  /** debounce กันกรณีข้อความรัวหลายห้องพร้อมกัน → refresh ทีเดียว */
  /**
   * จำนวนสแปมที่ยังไม่อ่าน สำหรับ badge บนแท็บ "สแปม" (user สั่ง 2026-07-31)
   *
   * performance: ตัวเลขนี้ไม่ได้ไปกับ response ของ list (list ถูกยิงทุกครั้งที่เปลี่ยนตัวกรอง
   * และทุก 20 วินาทีจาก poll ส่วน InboxList ยัง mount พร้อมกัน 2 ตัวเสมอ — ChatRail + หน้า inbox)
   * จึงเป็น endpoint แยกที่ throttle เอง 60 วินาที ยกเว้นจังหวะที่ตัวเลข "ต้องเปลี่ยนแน่ ๆ"
   * คือกดสแปม/เอาออกจากสแปม และตอนเปิดอ่านเธรด ซึ่ง force ทันที
   * ฝั่ง service ก็หยุดนับที่ 100 แถวอยู่แล้ว (UI แสดงแค่ 99+)
   */
  const [spamUnread, setSpamUnread] = useState(0)
  const spamFetchedAt = useRef(0)
  const refreshSpamUnread = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - spamFetchedAt.current < 60_000) return
    spamFetchedAt.current = now
    try {
      const res = await fetch('/api/chat/spam-unread', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { count?: number }
      setSpamUnread(typeof data.count === 'number' ? data.count : 0)
    } catch {
      // เงียบ — badge เป็นข้อมูลเสริม ไม่คุ้มที่จะรบกวนผู้ใช้เมื่อดึงไม่สำเร็จ
    }
  }, [])
  const refreshSpamUnreadRef = useRef(refreshSpamUnread)
  useEffect(() => {
    refreshSpamUnreadRef.current = refreshSpamUnread
  })
  useEffect(() => {
    void refreshSpamUnreadRef.current(true)
  }, [])

  /**
   * จำนวนเธรดที่พัสดุมีปัญหา (feature 00022) — นับทั้งร้าน ไม่ใช่นับจากแถวที่โหลดมา
   * เพราะรายการเป็น cursor pagination ทีละ 20 เคสที่อยู่หน้าถัดไปจะหายจากตัวเลขทันที
   * throttle 60 วิเหมือน spamUnread ด้วยเหตุผลเดียวกัน (list ถูกยิงทุก 20 วิและ mount 2 ตัว)
   */
  const [problemCount, setProblemCount] = useState(0)
  const problemFetchedAt = useRef(0)
  const refreshProblemCount = useCallback(
    async (force = false) => {
      if (!hasShipping) return
      const now = Date.now()
      if (!force && now - problemFetchedAt.current < 60_000) return
      problemFetchedAt.current = now
      try {
        const res = await fetch('/api/chat/problem-count', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { count?: number }
        setProblemCount(typeof data.count === 'number' ? data.count : 0)
      } catch {
        // เงียบ — ชิปเป็นข้อมูลเสริม ดึงไม่ได้ก็แค่ไม่โผล่รอบนั้น
      }
    },
    [hasShipping],
  )
  const refreshProblemCountRef = useRef(refreshProblemCount)
  useEffect(() => {
    refreshProblemCountRef.current = refreshProblemCount
  })
  useEffect(() => {
    void refreshProblemCountRef.current(true)
  }, [])

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      refreshRef.current()
      // throttle 60 วินาทีอยู่ในตัวมันเอง — ไม่ได้ยิงตามทุกรอบ poll
      void refreshSpamUnreadRef.current()
    }, 400)
  }, [])

  // feature 00037 — subscribe ทุกร้านในขอบเขต (subscribeShopChat เป็น refcounted singleton
  // ต่อ shopId อยู่แล้ว การเรียกหลายตัวจึงไม่ชน topic กันเอง) join key เป็น string เพื่อไม่ให้
  // array ที่สร้างใหม่ทุก render ทำให้ effect วิ่งซ้ำไม่จบ
  useEffect(() => {
    const ids = shopIdsKey ? shopIdsKey.split(',') : []
    if (ids.length === 0) return
    const offs = ids.map((id) => subscribeShopChat(id, scheduleRefresh))
    return () => offs.forEach((off) => off())
  }, [shopIdsKey, scheduleRefresh])

  // fallback: refresh เมื่อ tab กลับมา visible/focus — ครอบ broadcast ที่ไม่มา (ข้อความ senderRole
  // ='SHOP' เช่น echo จากแอป Messenger ของร้าน ซึ่ง trigger ไม่ส่งเข้า channel นี้) + socket หลุดเงียบ
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') scheduleRefresh()
    }
    document.addEventListener('visibilitychange', handler)
    window.addEventListener('focus', handler)
    return () => {
      document.removeEventListener('visibilitychange', handler)
      window.removeEventListener('focus', handler)
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [scheduleRefresh])

  // poll เบา ๆ ระหว่างเปิดหน้าแชทอยู่ (user report 2026-07-25 "list ซ้ายไม่ขึ้นข้อความล่าสุดตอนคุยกันอยู่"):
  // เดิม list refresh เฉพาะตอน broadcast 'new_message' มา หรือ focus — ถ้า realtime หลุด/ไม่มา list จะค้าง
  // ต่างจาก thread ที่มี poll 20s อยู่แล้ว → เพิ่ม poll คู่กันให้ list อัปเดต preview/ลำดับ ≤20s เสมอ
  // หยุดเมื่อแท็บถูกซ่อน — ไม่กิน request ตอนไม่มีคนดู (pattern เดียวกับ useSellerChatThread)
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') scheduleRefresh()
    }, 20_000)
    return () => clearInterval(t)
  }, [scheduleRefresh])

  // ── read-state ฝั่ง client — บทสนทนาที่เปิดอยู่/เพิ่งเปิดในรอบนี้ต้องเป็น "อ่านแล้ว" ทันที ──
  // (server mark-read ผ่าน POST .../read ที่ ChatThread อยู่แล้ว แต่ list นี้ไม่ได้ refetch ตาม)
  const pathname = usePathname()
  const router = useRouter()
  const activeConversationId = pathname?.startsWith('/inbox/') ? pathname.slice('/inbox/'.length).split('/')[0] : null
  const [localReadAt, setLocalReadAt] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!activeConversationId) return
    // เธรดที่เพิ่งเปิดอาจเป็นสแปม → badge ต้องลดทันที ไม่ต้องรอ throttle
    void refreshSpamUnreadRef.current(true)
    setLocalReadAt((prev) => ({ ...prev, [activeConversationId]: new Date().toISOString() }))
  }, [activeConversationId])

  // sentinel — re-attach ทุกครั้งที่ items เปลี่ยน (sentinel ย้ายตำแหน่ง) เหมือน NotificationFeed
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !nextCursor) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMore ผูก closure ของ nextCursor/loading ปัจจุบันอยู่แล้ว
  }, [items.length, nextCursor])

  // id เพจ → รูปเพจ (จาก prop channels ที่โหลดมาแล้ว) — ใช้ทำ badge รูปเพจต่อแถว
  // id ช่องทาง → ชื่อ + รูปของบัญชีนั้น (เพจ FB / บัญชี IG / LINE OA) สำหรับ "บรรทัดที่มา"
  const channelNameById = new Map(channels.map((c) => [c.id, c.name]))
  const channelAvatarById = new Map(channels.map((c) => [c.id, c.avatarUrl]))
  /**
   * แพลตฟอร์มที่ร้านมี "หลายบัญชี" — badge มุม avatar แยกแพลตฟอร์มให้อยู่แล้ว บรรทัดที่มาจึง
   * จำเป็นเฉพาะตอนที่แพลตฟอร์มเดียวกันมีหลายบัญชี (เช่น 2 เพจ Facebook) ซึ่งเป็นกรณีเดียวที่
   * badge ตอบไม่ได้จริง ๆ
   *
   * 🛑 เกณฑ์รอบแรก (2026-08-09) ผิด: นับ `channels.length >= 2` ทั้งร้าน ทำให้ร้านที่มี
   * 1 เพจ FB + 1 LINE OA เห็นบรรทัดที่มาทุกแถวด้วยข้อความเดียวกันเป๊ะ — ไม่ได้บอกอะไรใหม่
   * เลยเพราะ badge บอกไปแล้วว่าคนละแพลตฟอร์ม (user รายงานเองว่า "มันเยอะ" หลังเห็นของจริง)
   * บทเรียน: เกณฑ์ต้องผูกกับ "สิ่งที่ยังกำกวมอยู่จริง" ไม่ใช่ "มีของหลายชิ้นไหม"
   */
  /**
   * มีบัญชีนอกเดียวทั้งขอบเขต → badge มุม avatar ใช้ **รูปเพจ/รูป LINE OA จริง** แทนโลโก้แพลตฟอร์ม
   * (user สั่ง 2026-08-09)
   *
   * เหตุผลเดียวกับกติกาอื่นในแถวนี้ทั้งหมด — ไม่แสดงสิ่งที่ไม่ให้ข้อมูล: ร้านที่มีเพจ Facebook
   * เพจเดียว ทุกแถวเป็น Facebook อยู่แล้ว โลโก้ f ซ้ำ 28 แถวจึงบอกอะไรไม่ได้เลย ขณะที่รูปเพจ
   * อย่างน้อยเป็นตราของร้านเอง · พอมี ≥2 บัญชี โลโก้แพลตฟอร์มกลับมามีความหมายทันที (แยกช่องทาง)
   * จึงสลับกลับ — ดู `preferChannelLogo` ที่จุด render
   */
  const singleChannelScope = channels.length <= 1
  const duplicatedProviders = new Set(
    channels
      .map((c) => resolveChatChannel(c.provider))
      .filter((p, _i, all) => all.filter((x) => x === p).length >= 2),
  )

  return (
    // shadow-none (user สั่ง 2026-07-23): .card ของ Paces มี shadow ในตัว (custom/_card.css) ซึ่ง
    // เหมาะกับการ์ดที่ลอยบนพื้นหน้า dashboard — ในหน้าแชทการ์ดนี้กินเต็มคอลัมน์ rail/เต็มจอมือถือ
    // อยู่แล้ว เงาจึงกลายเป็นเส้นคล้ำที่ขอบ ไม่ได้สื่อความลึกอะไร (ขอบ rail มี border-e ของ layout อยู่แล้ว)
    <div className="card shadow-none">
      {/* items-stretch: `.card-header` ของ Paces เป็น `flex flex-wrap items-center justify-between`
          (custom/_card.css) — พอ override เป็น flex-col แล้ว `items-center` ที่เหลืออยู่จะบีบทุกแถว
          ให้กว้างเท่าเนื้อหาแล้วจัดกึ่งกลาง (ปุ่มลอยกลาง ไม่ตรงกับแถวรายการข้างล่างที่ชิดซ้าย +
          แถวตัวกรองไม่เต็มความกว้างจน popover ที่อ้าง inset-x-0 แคบตาม) — ต้อง stretch ทับ */}
      {/* sticky (user สั่ง 2026-07-23): "อยากให้ panel นี้ fixed อยู่บนเสมอ ต่อให้ scroll inbox list"
          — ค้างบนสุดของกล่อง scroll ทั้งสองโหมด: desktop = SimpleBar ใน ChatRail.tsx,
          มือถือ/แท็บเล็ต = `<div className="overflow-y-auto">` ใน (chat)/layout.tsx
          ต้อง bg-card ในตัวเอง (พื้นของ .card อยู่ "หลัง" แถวที่เลื่อนผ่าน — ถ้าหัวโปร่งจะเห็นแถว
          ทะลุ) + z-20 ให้อยู่เหนือทั้งแถวและชุดปุ่มลอยตอน hover. ใช้ได้จริงเพราะ .card ไม่มี
          🛑 z-20 ไม่ใช่ z-10 — `.btn` ของ Paces เป็น z-10 ในตัว จะเสมอกันแล้วปุ่มที่อยู่ทีหลังชนะ
          (paces-btn-z-index-floor.md)
          overflow:hidden (custom/_card.css — มีเฉพาะ .card-collapsed) ที่จะตัด sticky ทิ้ง */}
      {/* tabsAbove (มือถือ): มีแท็บ ข้อความ|ความคิดเห็น เป็น sticky อยู่เหนือขึ้นไปในกล่อง scroll
          เดียวกัน — หัวรายการต้องเกาะ "ใต้แท็บ" ไม่ใช่ที่ 0 ไม่งั้นสองอันค้างที่เส้นเดียวกันแล้วทับกัน
          top-14 = 3.5rem = 56px = ความสูงจริงของแท็บ (pt-3 12px + min-h-11 44px) และเป็น Tailwind
          scale class ปกติ ไม่ใช่ arbitrary value (HR7) */}
      <div
        className={`card-header sticky z-20 flex flex-col items-stretch gap-3 border-dashed bg-card ${
          tabsAbove ? 'top-14' : 'top-0'
        }`}
      >
        {/* ช่องค้นหา — Base ContactList.tsx:19-24 — railMode (desktop rail) ย้ายขึ้น topbar
            แล้ว (ChatSearchBox.tsx) ไม่ render ซ้ำที่นี่ — มือถือ/แท็บเล็ต drill-down ยังมีเหมือนเดิม */}
        {!railMode && (
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" />
            <input
              type="search"
              value={localSearchInput}
              onChange={(e) => setLocalSearchInput(e.target.value)}
              placeholder={t.inbox.searchPlaceholder}
              className="form-input bg-light/30"
            />
          </div>
        )}

        {/* channel tabs — pill ไอคอนล้วน (user สั่งเพิ่ม 2026-07-22 บ่าย): "ทั้งหมด" เป็นข้อความ,
            Deep/Messenger/Instagram เหลือไอคอนล้วน — React state ขับ active เอง ไม่ใช้
            data-hs-tab (เหตุผลเดิม ดู comment หัวไฟล์) shrink-0 กันปุ่มบีบ + overflow-x-auto
            กันตกบรรทัดถ้า rail แคบผิดปกติ (ปกติพอดีบรรทัดเดียวที่ 320px) */}
        {/* channel tabs + ตัวกรอง + เพจ รวมเป็นแถวเดียว flex-wrap (user request 2026-07-23: mobile
            filter กระชับ) — ไหลลงบรรทัดใหม่เองเมื่อแคบ ไม่ใช่ 2 แถวตายตัว. relative สำหรับ popover
            (InboxFilterPanel/PageFilterDropdown) ที่ใช้ inset-x-0 อ้างอิงแถวนี้ (กว้างเท่าแถว ไม่ล้นจอ) */}
        <div className="relative flex flex-wrap items-center gap-1.5">
          <div className="bg-light flex w-full items-center gap-0.5 rounded-lg p-1" aria-label={t.inbox.channelFilterLabel} role="tablist">
          {/* segmented control — พื้นเทาก้อนเดียว ตัวที่เลือกเป็นการ์ดขาวยกขึ้น (mockup V1, 2026-07-31)
              เดิมเป็น pill 4 ก้อนลอยแยกกัน ทำให้ดูเป็นของ 4 ชิ้นทั้งที่เป็นตัวเลือกชุดเดียวกัน
              และแย่งความเด่นกับปุ่มตัวกรอง — user รายงานว่า "รก ดูไม่ออกว่าอะไรสำคัญ" */}
          {CHANNEL_TABS.map((tab) => {
            const active = channelTab === tab
            const display = tab === 'ALL' ? null : getChannelDisplay(tab)
            const label = tab === 'ALL' ? t.inbox.channelAll : display!.label
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                title={label}
                aria-label={tab === 'ALL' ? label : `กรองเฉพาะช่องทาง ${label}`}
                onClick={() => handleChannelTabChange(tab)}
                className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-nowrap lg:min-h-0 ${
                  active ? 'bg-card text-dark shadow-sm font-semibold' : 'text-default-600'
                }`}
              >
                {display && (
                  <Icon
                    icon={display.icon}
                    width={16}
                    height={16}
                    className={display.iconClassName}
                    style={display.iconStyle}
                  />
                )}
                {tab === 'ALL' && label}
              </button>
            )
          })}
          </div>
          {/* ปุ่มตัวกรองเดียว — เพจย้ายเข้าไปเป็นหัวข้อข้างในแล้ว ไม่มีดรอปดาวน์เพจแยกอีก
              (mockup V1 ที่ user อนุมัติ 2026-07-31) */}
          <InboxFilterPanel
            value={filter}
            onApply={(next, page) => {
              setFilter(next)
              setPageFilter(page)
            }}
            open={openPanel === 'filter'}
            onOpenChange={(o) => setOpenPanel(o ? 'filter' : null)}
            channelTab={channelTab}
            pageFilter={pageFilter}
            pageOptions={channels}
            allTags={allTags}
            hasShipping={hasShipping}
          />

          {/* ชิป "พัสดุมีปัญหา" (feature 00022) — ตัวเลขมีความหมายแม้ยังไม่ได้กรอง
              (บอกว่ามีกี่เคสรอจัดการ) ต่างจากตัวกรองอื่นที่ซ่อนในดรอปดาวน์ได้
              ซ่อนทั้งก้อนเมื่อไม่มีปัญหา — ชิปที่ขึ้น 0 คือปุ่มที่กดแล้วไม่มีอะไรให้ดู
              soft ตอนปกติ / ทึบตอนกำลังกรอง: ระดับจัดจ้านสูงสุดเกิดเฉพาะตอนผู้ใช้เลือกเอง

              2026-08-06 (user เลือกทาง A จาก mockup): ใช้ `btn btn-sm` + เส้นขอบ ตัวเดียวกับปุ่ม
              "ตัวกรอง" ข้าง ๆ และตัวเลขเป็น badge วงกลมเหมือน activeCount ของปุ่มนั้นเป๊ะ ๆ
              เดิมเป็น `badge` คนละ primitive จึงต่างกันพร้อมกัน 5 อย่าง (สูง/ตัวอักษร/ไอคอน/ขอบ/
              วิธีแสดงตัวเลข) แล้วอ่านเป็นของคนละชุด — ตอนนี้เหลือต่างกันแค่ "สี" ซึ่งคือสิ่งเดียว
              ที่ควรต่าง (แดง = เร่ง) */}
          {hasShipping && problemCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilter((f) => ({
                  ...f,
                  shipment: f.shipment === 'problem' ? 'all' : 'problem',
                }))
                void refreshProblemCountRef.current(true)
              }}
              aria-pressed={filter.shipment === 'problem'}
              aria-label={
                filter.shipment === 'problem'
                  ? 'กำลังกรองเฉพาะพัสดุมีปัญหา — กดเพื่อดูทั้งหมด'
                  : `กรองเฉพาะพัสดุมีปัญหา (${problemCount} บทสนทนา)`
              }
              className={`btn btn-sm inline-flex items-center gap-2 border ${
                filter.shipment === 'problem'
                  ? 'bg-danger border-danger text-white'
                  : 'bg-card border-danger text-danger'
              }`}
            >
              <Icon icon="alert-triangle" className="size-4" />
              พัสดุมีปัญหา
              <span
                className={`badge text-2xs rounded-full px-1.5 ${
                  filter.shipment === 'problem' ? 'bg-white/25 text-white' : 'bg-danger text-white'
                }`}
              >
                {problemCount > 99 ? '99+' : problemCount}
              </span>
            </button>
          )}

          {/* active-filter chips — x ในตัวเดียวกันคือปุ่มล้างตัวกรองนั้น
              ไม่มี chip ของ "เพจ" (user สั่ง 2026-07-23): ปุ่ม PageFilterDropdown แสดงชื่อเพจที่เลือก
              อยู่บนตัวปุ่มเองแล้ว chip ด้านล่างจึงเป็นชื่อเดียวกันซ้ำสองบรรทัดติดกัน — ล้างตัวกรอง
              ยังทำได้จากในดรอปดาวน์ (ตัวเลือก "ทุกเพจ") ต่างจากตัวกรองสถานะ/ผูกลูกค้า/ซ่อน ที่ปุ่ม
              "ตัวกรอง" ไม่ได้โชว์ค่าที่เลือกบนหน้าปุ่ม chip จึงยังจำเป็น */}
          {/* ชิปสถานะ/สแปม ถูกถอดออก 2026-07-31 — แท็บในแถวล่างแสดงอยู่แล้ว ถ้าโชว์ทั้งคู่จะซ้ำซ้อน */}
          {filter.customerLinked !== 'all' && (
            <span className="badge bg-primary/15 text-primary-ink text-2xs inline-flex items-center gap-1">
              {filter.customerLinked === 'linked' ? 'ผูกลูกค้าแล้ว' : 'ยังไม่ผูกลูกค้า'}
              <button type="button" onClick={() => setFilter((f) => ({ ...f, customerLinked: 'all' }))} aria-label="ล้างตัวกรองผูกลูกค้า" className="inline-flex items-center">
                <Icon icon="x" width={12} height={12} />
              </button>
            </span>
          )}
          {filter.hidden && (
            <span className="badge bg-primary/15 text-primary-ink text-2xs inline-flex items-center gap-1">
              กำลังดูที่ซ่อนอยู่
              <button type="button" onClick={() => setFilter((f) => ({ ...f, hidden: false }))} aria-label="เลิกดูที่ซ่อนอยู่" className="inline-flex items-center">
                <Icon icon="x" width={12} height={12} />
              </button>
            </span>
          )}
          {/* ไม่มี chip ของ "การอ่าน" (user สั่ง 2026-07-24: ปุ่มตัวกรองขึ้น badge (1) อยู่แล้ว = ซ้ำซ้อน)
              — ล้างได้จากในดรอปดาวน์ (radio "ทั้งหมด") ต่างจาก chip สถานะ/ผูกลูกค้า/ซ่อน/สแปม ที่เก็บไว้
              เพราะบอก "ค่าที่เลือกคืออะไร" ซึ่ง badge ตัวเลขบอกไม่ได้ */}
        </div>

        {/* แถวกลุ่ม/แท็บจัดหมวดแชท (feature 00018): ทั้งหมด + กลุ่มที่ตั้งเอง (คลิกขวาลบ) + ปุ่มเพิ่ม inline
            ตัวกรองอ่านแล้ว/ยังไม่อ่านย้ายเข้าปุ่ม "ตัวกรอง" แล้ว (user สั่ง 2026-07-24: แถวนี้แน่นเกินไป) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="border-default-200 flex min-w-0 flex-1 items-center gap-3 border-b" role="tablist" aria-label="มุมมองและกลุ่มแชท">
            {/* แท็บข้อความมีเส้นใต้ (mockup V1) — น้ำหนักต่างจาก segmented ด้านบนชัดเจน ไม่แย่งกันเด่น
                สแปมใช้สี danger ตั้งแต่ยังไม่ถูกเลือก เพราะเป็นถังที่ "ไม่ควรมีอะไรอยู่" (user สั่ง) */}
            {([
              { key: 'ALL', label: t.inbox.channelAll, icon: null, danger: false },
              { key: 'RESOLVED', label: t.inbox.statusResolved, icon: 'circle-check', danger: false },
              { key: 'SPAM', label: t.inbox.statusSpam, icon: 'alert-octagon', danger: true },
            ] as const).map((t) => {
              const on = activeViewTab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => selectViewTab(t.key)}
                  className={`-mb-px flex min-h-11 lg:min-h-0 shrink-0 items-center gap-1 border-b-2 px-0 py-1.5 text-sm text-nowrap ${
                    t.danger
                      ? on
                        ? 'border-danger text-danger font-semibold'
                        : 'border-transparent text-danger font-medium'
                      : on
                        ? 'border-primary text-primary font-semibold'
                        : 'border-transparent text-default-600 font-medium'
                  }`}
                >
                  {t.icon && <Icon icon={t.icon} width={14} height={14} className="shrink-0" />}
                  {t.label}
                  {/* จำนวนสแปมที่ยังไม่อ่าน — เฉพาะแท็บสแปม (user สั่ง 2026-07-31) */}
                  {t.key === 'SPAM' && spamUnread > 0 && (
                    <span className="bg-danger flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold text-white">
                      {spamUnread > 99 ? '99+' : spamUnread}
                    </span>
                  )}
                </button>
              )
            })}
            {/* กลุ่มที่ร้านสร้างเอง → ปุ่มดรอปดาวน์ ไม่ใช่แท็บเรียงยาว (user report 2026-07-31:
                "custom group เยอะ ๆ แล้ว width ล้น UI เพี้ยน")
                ต้นเหตุคือจำนวนกลุ่มไม่จำกัดแต่พื้นที่จำกัด — เรียงเป็นแท็บยังไงก็ล้นวันหนึ่ง
                ปุ่มเดียว + ตัวเลขบอกจำนวน จึงกว้างคงที่เสมอไม่ว่าจะมีกี่กลุ่ม และบอกได้ด้วยว่ามีกี่อัน */}
            <span className="bg-default-300 ms-auto h-4 w-px shrink-0" aria-hidden="true" />
            {/**
              * feature 00037 — โหมดรวมหลายร้าน: กลุ่มเป็นของรายร้าน (ChatGroup มี
              * @@unique([shopId, name]) — กลุ่มชื่อ "รอโอน" ของร้าน A กับ B คือคนละของ ยุบรวมกัน
              * ไม่ได้) ปุ่มจึงเปลี่ยนเป็น "ชี้ทาง" แทน **ห้ามหายเงียบ ๆ หรือ disable เป็นปุ่มเทา**
              * กดแล้วเปิดตัวกรองให้เลย = ลัดไปทำสิ่งที่ผู้ใช้ต้องทำอยู่ดี ไม่ใช่ dead-end
              */}
            {unified ? (
              <button
                type="button"
                onClick={() => setOpenPanel(openPanel === 'filter' ? null : 'filter')}
                // feature 00025 S-14a — "เพจ" → "ช่องทาง" เพราะตัวกรองนี้ตอนนี้มีทั้งเพจ Facebook
                // และ LINE OA ปนกัน คำว่า "เพจ" ไม่ครอบอีกต่อไป (ดูหัวข้อ "เพจ" ใน InboxFilterPanel
                // ที่ปุ่มนี้เปิดออกไปหา — ต้องใช้คำเดียวกัน)
                aria-label="เลือกช่องทางก่อนเพื่อดูกลุ่มที่ตั้งไว้ — กดเพื่อเลือกช่องทาง"
                className="text-default-500 -mb-px flex shrink-0 items-center gap-1 border-b-2 border-transparent px-0 py-1.5 text-sm text-nowrap"
              >
                <Icon icon="folder" width={14} height={14} className="shrink-0" />
                เลือกช่องทางเพื่อดูกลุ่ม
              </button>
            ) : (
            <div className="relative shrink-0">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={openPanel === 'group'}
                onClick={() => setOpenPanel(openPanel === 'group' ? null : 'group')}
                className={`-mb-px flex min-h-11 lg:min-h-0 items-center gap-1 border-b-2 px-0 py-1.5 text-sm text-nowrap ${
                  activeGroupId
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-default-600 font-medium'
                }`}
              >
                <Icon icon="folder" width={14} height={14} className="shrink-0" />
                {/* เลือกอยู่ → โชว์ชื่อกลุ่ม (ผู้ใช้ต้องรู้ว่ากำลังกรองอะไรอยู่โดยไม่ต้องเปิดดรอป)
                    ไม่ได้เลือก → โชว์คำว่า "กลุ่ม" + จำนวนที่มี */}
                {activeGroupName ? (
                  <span className="max-w-28 truncate">{activeGroupName}</span>
                ) : (
                  <>
                    {t.inbox.groups}
                    {groups.length > 0 && <span className="text-default-700">{groups.length}</span>}
                  </>
                )}
                <Icon icon={openPanel === 'group' ? 'chevron-up' : 'chevron-down'} width={12} height={12} />
              </button>

              {openPanel === 'group' && (
                <div
                  ref={groupMenuRef}
                  role="menu"
                  className="border-default-300 bg-card absolute end-0 top-full z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border py-1 shadow-lg"
                >
                  {/* ออกจากกลุ่ม = กลับไปมุมมอง "ทั้งหมด" เต็มรูป ไม่ใช่แค่ล้าง activeGroupId
                      (user report 2026-07-31: กดแล้วแท็บทั้งหมดด้านนอกไม่ active) — การเข้ากลุ่ม
                      ตั้ง status เป็น 'open' ไว้ด้วย ถ้าล้างแค่ id เดียว status ยังค้างที่ 'open'
                      ซึ่งไม่ตรงกับแท็บไหนเลย. ใช้ selectViewTab ตัวเดียวกับแท็บด้านนอกจึงกลับไปตรงกันเสมอ
                      ป้ายใช้คำว่า "ทั้งหมด" ให้ตรงกับแท็บที่มันพากลับไป (user สั่ง) */}
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={activeGroupId === null}
                    onClick={() => {
                      selectViewTab('ALL')
                      setOpenPanel(null)
                    }}
                    className="dropdown-item text-sm"
                  >
                    <Icon icon="check" className={`size-4 ${activeGroupId === null ? 'text-primary' : 'opacity-0'}`} />
                    {t.inbox.channelAll}
                  </button>

                  {groups.map((g) => (
                    // แถวเป็น div ไม่ใช่ button — มีปุ่มลบซ้อนอยู่ข้างใน (button ซ้อน button = invalid HTML)
                    <div key={g.id} className="group/gi flex items-center">
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={activeGroupId === g.id}
                        onClick={() => {
                          selectGroupTab(g.id)
                          setOpenPanel(null)
                        }}
                        className="dropdown-item min-w-0 flex-1 text-sm"
                      >
                        <Icon icon="check" className={`size-4 ${activeGroupId === g.id ? 'text-primary' : 'opacity-0'}`} />
                        <span className="truncate">{g.name}</span>
                      </button>
                      {/* ลบกลุ่ม — ย้ายมาจาก "คลิกขวาที่แท็บ" ซึ่งค้นพบเองไม่ได้และใช้บนมือถือไม่ได้เลย */}
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(g)}
                        aria-label={`ลบกลุ่ม ${g.name}`}
                        title="ลบกลุ่ม"
                        className="text-default-700 hover:text-danger flex size-11 shrink-0 items-center justify-center lg:size-8"
                      >
                        <Icon icon="trash" width={14} height={14} />
                      </button>
                    </div>
                  ))}

                  <hr className="dropdown-divider" />

                  {addingGroup ? (
                    <div className="px-2 py-1">
                      <input
                        autoFocus
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateGroup()
                          else if (e.key === 'Escape') {
                            setAddingGroup(false)
                            setNewGroupName('')
                          }
                        }}
                        onBlur={handleCreateGroup}
                        maxLength={40}
                        placeholder="ชื่อกลุ่มใหม่"
                        aria-label="ชื่อกลุ่มใหม่"
                        // ไม่ใช้ .form-input ตรงนี้ — _forms.css ไม่ได้ห่อ @layer ทำให้ width utility
                        // ไม่มีผลบน .form-input (บทเรียน feedback_paces_forms_css_gotchas) แล้วช่องจะล้นดรอปดาวน์
                        className="text-default-800 bg-light w-full rounded-md px-3 py-1.5 text-sm outline-none"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingGroup(true)}
                      className="dropdown-item text-primary text-sm"
                    >
                      <Icon icon="plus" className="size-4" />
                      {t.inbox.createGroup}
                    </button>
                  )}
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      </div>

      {/* (ส่วนขยาย 00025 2026-08-12 / S4) "คุณปิดแจ้งเตือนของร้านนี้อยู่"
          น้ำเสียง info ไม่ใช่ warning — เป็นการบอกความจริงของค่าที่เขาตั้งเอง ไม่ใช่ระบบพัง
          ไม่มีปุ่มปิดถาวร (มติ OQ-2): หายเมื่อกด "เปิดแจ้งเตือน" สำเร็จเท่านั้น เพราะเงื่อนไข
          ต้องตรงกับความจริง ถ้าปิดได้ผู้ใช้จะลืมว่าตัวเองปิดไว้แล้วพลาดข้อความสำคัญ */}
      {muted && (
        <div className="bg-info/15 text-info-ink mx-4 mb-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm">
          <Icon icon="bell-off" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="mb-1 font-medium">คุณปิดแจ้งเตือนของร้านนี้อยู่</p>
            <p className="mb-2">จะไม่มีแจ้งเตือนเด้งเข้ามือถือเมื่อมีข้อความใหม่จากร้านนี้</p>
            <button
              type="button"
              onClick={handleUnmute}
              disabled={unmuting}
              className="btn btn-sm bg-card text-info hover:bg-info/10 min-h-11 disabled:opacity-50 sm:min-h-0"
            >
              {unmuting ? 'กำลังเปิด...' : 'เปิดแจ้งเตือน'}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="card-body">
          {!isFiltering && !filter.hidden ? (
            /**
             * 🛑 "ยังไม่มีใครทักเลย" ต้องแยกจาก "กรองแล้วไม่เจอ" — เดิมหน้ากลาง (inbox/page.tsx)
             * early-return เป็น empty state ของตัวเองตอน items ว่าง ซึ่งทำให้ InboxList ไม่ถูก
             * render เลย ⇒ ไม่มีใคร subscribe realtime, ไม่มีใคร poll 20 วิ, ไม่มีใคร refresh
             * ตอน focus ⇒ ลูกค้า "คนแรก" ที่ทักเข้ามาไม่ขึ้นในรายการจนกว่าจะรีเฟรชหน้าเอง
             * (user เจอเองบน prod 2026-08-13 — เป็นเคสที่สำคัญที่สุดของกล่องข้อความพอดี
             *  เพราะคนที่ยังไม่เคยคุยกันคือคนที่ร้านอยากตอบเร็วที่สุด)
             *
             * ย้ายมาไว้ที่นี่แทน: รายการว่างก็ยัง mount ครบทุกกลไก ข้อความแรกจึงเด้งเองได้
             */
            <SellerEmptyState
              compact
              icon="message-circle"
              title="ยังไม่มีข้อความ"
              description="เมื่อลูกค้าทักแชทมาที่ร้าน จะแสดงในหน้านี้"
              action={hasAnyChannel ? undefined : { label: 'เชื่อม Facebook Page', href: '/settings/channels' }}
            />
          ) : filter.hidden ? (
            // edge state เฉพาะโหมด "ที่ซ่อนอยู่" — ไม่เด่นปุ่มล้างตัวกรอง (ผู้ใช้ตั้งใจเข้ามาดูโหมดนี้)
            <SellerEmptyState
              compact
              icon="eye-off"
              title="ยังไม่มีบทสนทนาที่ซ่อนไว้"
              description="กดเมนู (⋮) ที่บทสนทนาแล้วเลือก “ซ่อน” เพื่อย้ายมาไว้ที่นี่"
            />
          ) : (
            <>
              <SellerEmptyState
                compact
                icon="filter"
                title="ไม่พบบทสนทนาตามที่กรอง"
                description="ลองเปลี่ยนคำค้นหาหรือล้างตัวกรองแล้วลองใหม่"
              />
              <div className="flex justify-center pb-4">
                <button type="button" onClick={clearFilters} className="btn bg-light text-dark btn-sm">
                  ล้างตัวกรอง
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        // card-body: เส้นประเทาบางๆ (divide-dashed) แบ่งระหว่างแชท — user request 2026-07-23 เดิมดูไม่ออก
        // handlers ของกดค้างอยู่ที่ container ตัวเดียว (hook เรียกในลูปไม่ได้) — ตัวที่ถูกกดหาย้อนกลับ
        // จาก data-conversation-id ของแถว
        <div
          className="card-body divide-y divide-dashed divide-default-300 !p-0"
          {...longPress.handlers}
          // กดค้างครบแล้วปล่อยนิ้ว เบราว์เซอร์ยังยิง click ตามมา → จะเด้งเข้าห้องแชททับเมนูที่เพิ่งเปิด
          // ต้องกลืนใน capture (ก่อนถึง <Link> และก่อน onClickCapture ของ SwipeableRow)
          onClickCapture={(e) => {
            if (longPress.didFire()) {
              e.preventDefault()
              e.stopPropagation()
            }
          }}
        >
          {items.map((c) => {
            // บทสนทนาที่กำลังเปิดอยู่ = อ่านแล้วเสมอ (ไม่ต้องรอ localReadAt/DB ตามทัน)
            const unreadCount = c.id === activeConversationId ? 0 : unreadCountOf(c, localReadAt[c.id])
            const unread = unreadCount > 0
            // feature 00018 CRM — ชื่อในแชท (alias) มาก่อนชื่อจริง ถ้าตั้งไว้ (user: "Wave 110")
            const name =
              c.alias?.trim() || c.counterparty?.displayName || (c.channel === 'DEEP' ? 'ผู้ซื้อ' : 'ผู้ติดต่อ')
            const preview = c.lastMessagePreview ?? 'เริ่มการสนทนาแล้ว'
            const isResolved = c.resolvedAt !== null
            const salesStatus = c.contactSalesStatus ?? 'UNSPECIFIED'
            const contactTags = c.contactTags ?? []
            // ป้ายพฤติกรรมลูกค้า — SSOT เดียวกับหัวแผงลูกค้า/ตาราง /orders
            // `hasHistory` = ผูกกับลูกค้าในระบบแล้ว (null = ยังไม่ผูก → ไม่มีป้ายเลย)
            const behaviorBadges = c.customerBehavior
              ? customerBadges(c.customerBehavior, {
                  hasHistory: true,
                  orderNoun: orderVocab.noun,
                  copy: t.inbox.customerPanel,
                })
              : []
            // ชื่อกลุ่มที่เธรดนี้อยู่ — โชว์เฉพาะแท็บ "ทั้งหมด" (activeGroupId===null); ในแท็บกลุ่มเองไม่ต้อง
            // ย้ำ. หาจาก groups ที่โหลดมาแล้ว (ไม่ query เพิ่ม) — กลุ่มถูกลบ = หาไม่เจอ → ไม่โชว์ชิป
            const groupChip =
              activeGroupId === null && c.chatGroupId ? (groups.find((g) => g.id === c.chatGroupId)?.name ?? null) : null
            return (
              // S-7: แยก <Link> (เนื้อหาแถว) ออกจาก kebab (sibling) — nested button ใน anchor เป็น
              // invalid HTML + คลิก kebab จะ propagate ไป navigate. outer div รับ hover ทั้งแถว
              // ปักหมุด (user สั่ง 2026-07-23): แถวที่ปักหมุดพื้นเทาจาง + แถบ accent เหลืองด้านซ้าย
              // (สีเดียวกับดาว) — แถวปกติใส่ border-transparent ความหนาเท่ากันไว้ด้วย ไม่งั้นเนื้อหา
              // ขยับ 2px ตอนกด/เลิกปักหมุด. ลำดับ "ปักหมุดขึ้นบนสุด" backend จัดให้แล้ว (S-7
              // pin-first keyset cursor) ฝั่งนี้ไม่ต้องเรียงซ้ำ
              <SwipeableRow
                key={c.id}
                actionsWidth={224}
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => handleRowAction(c.id, c.isPinned ? 'unpin' : 'pin')}
                      disabled={actioningId === c.id}
                      className="bg-warning text-2xs flex flex-1 flex-col items-center justify-center gap-0.5 text-white disabled:opacity-50"
                    >
                      <Icon icon={c.isPinned ? 'star-off' : 'star'} width={18} height={18} />
                      {c.isPinned ? 'เลิกปัก' : 'ปักหมุด'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRowAction(c.id, isResolved ? 'reopen' : 'resolve')}
                      disabled={actioningId === c.id}
                      // 🛑 เขียวเฉพาะทิศ "ปิดงาน" — เดิมใช้ bg-success ทั้งสองทิศ ทำให้สีเดียวหมายถึง
                      // สองอย่างที่ตรงข้ามกัน (ปิดงาน vs เปิดใหม่) และผิดกฎ Verified-Means-Green
                      // ที่สงวนเขียวไว้กับ "สำเร็จ/ยืนยันแล้ว" — "เปิดใหม่" คือการย้อนสถานะสำเร็จ
                      // ไม่ใช่การทำให้สำเร็จ (impeccable critique 2026-08-09)
                      className={`text-2xs flex flex-1 flex-col items-center justify-center gap-0.5 text-white disabled:opacity-50 ${
                        isResolved ? 'bg-default-500' : 'bg-success'
                      }`}
                    >
                      <Icon icon={isResolved ? 'arrow-back-up' : 'circle-check'} width={18} height={18} />
                      {isResolved ? 'เปิดใหม่' : 'ปิดงาน'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRowAction(c.id, filter.hidden ? 'unhide' : 'hide')}
                      disabled={actioningId === c.id}
                      className="bg-default-500 text-2xs flex flex-1 flex-col items-center justify-center gap-0.5 text-white disabled:opacity-50"
                    >
                      <Icon icon={filter.hidden ? 'eye' : 'eye-off'} width={18} height={18} />
                      {filter.hidden ? 'เลิกซ่อน' : 'ซ่อน'}
                    </button>
                    {/* สแปม (user สั่ง 2026-07-24) — ในถังสแปมปุ่มนี้กลายเป็น "ไม่ใช่สแปม" */}
                    <button
                      type="button"
                      onClick={() => handleRowAction(c.id, c.isSpam ? 'unspam' : 'spam')}
                      disabled={actioningId === c.id}
                      className="bg-danger text-2xs flex flex-1 flex-col items-center justify-center gap-0.5 text-white disabled:opacity-50"
                    >
                      <Icon icon={c.isSpam ? 'inbox' : 'alert-octagon'} width={18} height={18} />
                      {c.isSpam ? 'ไม่ใช่สแปม' : 'สแปม'}
                    </button>
                  </>
                }
              >
              <div
                // จุดยึดของ "กดค้าง" — useLongPress ที่ container resolve ย้อนกลับมาที่ element นี้
                // เพื่อโคลนไปลอยเหนือฉากเบลอ (ดู ChatContextMenu โหมด 'row')
                data-conversation-id={c.id}
                onContextMenu={(e) => {
                  // เปิดได้ทุกเธรดแล้ว (user สั่ง 2026-07-23: action ประจำแถวต้องอยู่ในคลิกขวาด้วย) —
                  // เดิมเปิดเฉพาะช่องทางนอกเพราะเมนูมีแต่ฟิลด์ CRM; ตอนนี้ DEEP ก็มี ปักหมุด/ปิดงาน/
                  // ซ่อน/เสียง ให้ใช้ (เมนูซ่อนเฉพาะส่วน CRM เอง)
                  e.preventDefault()
                  setCtxMenu({ id: c.id, anchor: { kind: 'point', x: e.clientX, y: e.clientY } })
                }}
                className={`group relative flex items-stretch border-s-2 ${
                  c.id === activeConversationId
                    ? // แชทที่กำลังเปิดอยู่ — เด่นชัดสุด (primary tint + แถบ primary) เพื่อให้รู้ว่าคุยห้องไหน
                      // (user report 2026-07-23: active/pinned พื้นหลังกลืนกันแยกไม่ออก) ชนะ pinned
                      'border-primary bg-primary/10'
                    : c.isPinned
                      ? 'border-warning bg-default-100/60 hover:bg-default-100'
                      : 'border-transparent hover:bg-default-100'
                }`}
              >
                {/* ดาวปักหมุด (user สั่ง 2026-07-23: "พอไปอยู่หน้าสุดมันกินพื้นที่ อยากให้อยู่หน้าชื่อ
                    แทน") — เดิมเป็นปุ่มคอลัมน์แยกหน้าสุด กิน ~42px ของทุกแถวตลอดเวลาเพื่อ action ที่
                    ใช้กับไม่กี่แถว. ตอนนี้เป็น **indicator inline หน้าชื่อ** แสดงเฉพาะแถวที่ปักหมุด
                    ส่วน *การกดปักหมุด* ย้ายไปอยู่กับ action อื่นครบชุดแล้ว: ชุดปุ่มลอยตอน hover
                    (≥1024px) และ kebab (<1024px) — ไม่ได้หายไปไหน. เหตุที่ทำเป็น indicator ไม่ใช่
                    ปุ่ม: ตำแหน่งหน้าชื่ออยู่ใน <Link> ปุ่มซ้อนใน anchor เป็น invalid HTML และคลิก
                    จะ propagate ไป navigate (เหตุผลเดียวกับที่ kebab ต้องเป็น sibling) */}
                {/* py-3 — เคยขยับเป็น py-4 (2026-07-30 "การ์ดเล็กไปหน่อย") แล้วถอยกลับวันถัดมา
                    (user: "เอาจริง ๆ ทำมามันก็ใหญ่ไปอ่ะ") เพราะแถวนี้มีชิปหลายชั้นอยู่แล้ว
                    (ad_id / สถานะขาย / โฟลเดอร์) ความสูงจึงมาจากเนื้อหา ไม่ใช่ padding —
                    เพิ่ม padding ทับเข้าไปยิ่งทำให้เห็นเธรดต่อจอน้อยลงโดยไม่ได้อ่านง่ายขึ้น */}
                <Link href={`/inbox/${c.id}`} className="flex min-w-0 flex-1 justify-between gap-3 py-3 pe-3.75 ps-3.75">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="relative shrink-0">
                      <BuyerAvatar avatar={c.counterparty?.avatar ?? null} name={name} />
                      {/* badge = โลโก้ "แพลตฟอร์ม" เสมอ (มติแบบ C 2026-08-09 — user เลือกจาก mockup)
                          เดิมส่งรูปเพจเข้ามา (user สั่ง 2026-07-23) เพื่อให้ร้านหลายเพจแยกออกว่า
                          ทักมาจากเพจไหน — แต่พอมี LINE เข้ามาปนในลิสต์เดียวกันแล้วพังทันที เพราะ
                          ร้านตั้งโลโก้ร้านเดียวกันทั้งเพจ FB และ LINE OA เป็นเรื่องปกติ → badge
                          เหมือนกันเป๊ะทุกแถว แยกไม่ออกแม้แต่ว่าคนละแพลตฟอร์ม (user เจอเองบน prod)
                          "บัญชีไหน" ย้ายไปตอบด้วยบรรทัดที่มาข้างล่างแทน — ตรงกับบทเรียนที่จดไว้เอง
                          ในไฟล์นี้ (คอมเมนต์ของ prop `shop`): ภาพซ้ำกันได้โดยไม่ตั้งใจ ข้อความไม่ซ้ำ */}
                      <ChannelBadgeOverlay
                        channel={c.channel}
                        imageUrl={
                          singleChannelScope && c.shopChannelId
                            ? (channelAvatarById.get(c.shopChannelId) ?? null)
                            : null
                        }
                      />
                    </span>
                    {/* ชื่อลูกค้า "เข้มเสมอ" ทั้งอ่านแล้ว/ยังไม่อ่าน (user report 2026-07-30: "จางไปดูยาก")
                        เดิมอ่านแล้ว = text-default-600 font-medium → ใช้ความจางของ *ชื่อ* มาบอกสถานะอ่าน
                        ทำให้ข้อมูลที่สำคัญที่สุดในแถว (ลูกค้าคนไหน) อ่านยากที่สุด และเธรดที่อ่านแล้ว
                        คือส่วนใหญ่ของรายการ → ทั้งหน้าดูจางไปหมด
                        สถานะอ่านสื่อด้วย 2 อย่างที่เหลืออยู่แล้ว: น้ำหนักฟอนต์ (bold/semibold) +
                        บรรทัด preview ที่เทาลง + badge จำนวนที่ยังไม่อ่าน — ไม่ต้องเอาสีชื่อมาแลก
                        (token Paces ล้วน ไม่มี arbitrary value — HR7) */}
                    <span className="min-w-0 overflow-hidden text-start">
                      <span
                        className={`text-default-900 flex items-center gap-1 truncate text-xs ${
                          unread ? 'font-bold' : 'font-semibold'
                        }`}
                      >
                        {c.isPinned && (
                          <Icon
                            icon="star-filled"
                            width={14}
                            height={14}
                            // ดาวปักหมุด: คงสี warning (เหลือง) ไว้ ไม่ใช้ -ink (user 2026-08-03
                            // "มันต้องสีเหลืองป่ะ") — เคสนี้ "สี = ตัวตนของไอคอน" ดาวสีน้ำตาลอ่านไม่ออกว่าเป็นดาว
                            // ไม่เสียการเข้าถึง เพราะสถานะปักหมุดสื่อผ่านทางอื่นครบ: แถวถูกเรียงขึ้นบนสุด +
                            // aria-label ของปุ่ม + เมนู ⋯ เขียนว่า "เลิกปักหมุด" (WCAG 1.4.11 ไม่บังคับเมื่อ
                            // ข้อมูลมีในรูปแบบอื่นแล้ว) — ต่างจากข้อความที่ไม่มีทางเลือกอื่นนอกจากอ่าน
                            className="text-warning shrink-0"
                            aria-label="ปักหมุดไว้"
                          />
                        )}
                        {/* ในแท็บ "ทั้งหมด" เธรดที่ปิดงาน/สแปมปนอยู่กับเธรดปกติโดยไม่มีอะไรบอก
                            (user report 2026-07-31) — ใช้ไอคอนสีนำหน้าชื่อแบบเดียวกับดาวปักหมุด
                            ไม่ใช้ข้อความ เพราะพื้นที่ชื่อแคบและ badge ข้อความแย่งสายตากับชื่อลูกค้า */}
                        {isResolved && (
                          <Icon
                            icon="circle-check"
                            width={14}
                            height={14}
                            className="text-success shrink-0"
                            aria-label="ปิดงานแล้ว"
                          />
                        )}
                        {c.isSpam && (
                          <Icon
                            icon="alert-octagon"
                            width={14}
                            height={14}
                            className="text-danger shrink-0"
                            aria-label="สแปม"
                          />
                        )}
                        <span className="truncate">{name}</span>
                      </span>
                      {/* "คุณ: " นำหน้าเมื่อข้อความล่าสุดเป็นของฝั่งร้าน (user สั่ง 2026-07-23:
                          "จะได้รู้ว่าเป็นข้อความของใคร") — convention เดียวกับ Messenger/LINE
                          ใส่เฉพาะตอนมี preview จริง (ไม่ใส่ทับ fallback "เริ่มการสนทนาแล้ว")
                          senderRole='SHOP' ครอบทั้งที่ตอบจาก Deep และ echo จากแอป Messenger ของร้าน
                          — ทั้งคู่คือ "เรา" ในสายตาผู้ใช้ */}
                      {/* preview: text-xs ตามเดิม (เคยขยับเป็น text-sm แล้วถอยกลับพร้อม padding แถว
                          2026-07-31 — แถวสูงเกินไป). คงสี text-default-700 ที่ปรับจาก 400 ไว้
                          เพราะเป็นเรื่องคอนทราสต์ให้อ่านออก ไม่ใช่เรื่องขนาด และตอนนี้บรรทัดนี้
                          เป็นตัวหลักที่บอกสถานะอ่าน (ชื่อเข้มเสมอแล้ว) */}
                      <span
                        // 🛑 text-xs (13px) ไม่ใช่ text-2xs (11px) — impeccable critique 2026-08-09:
                        // ทั้งแถวเคยมีขนาดตัวอักษรแค่ 2 ระดับห่างกัน 1.18 เท่า และ "ข้อความล่าสุด"
                        // ใช้ขนาดเดียวกับชิป ad_id เป๊ะ ลำดับชั้นจึงเหลือแค่ weight+สีเทา ซึ่งถูกใช้
                        // ไปกับสถานะอ่าน/ยังไม่อ่านหมดแล้ว (user: "ความเด่นชัดของข้อความหายไปเลย")
                        // 🛑 ลบ max-w-52 (208px คงที่) — ตั้งมาให้พอดี rail เดสก์ท็อป 320px แต่มือถือ
                        // drill-down กินเต็มจอ ทำให้ทิ้งที่ว่าง 88px/แถวบนจอ 430px และ 426px บนแท็บเล็ต
                        // ขณะที่ข้อความถูกตัดตั้งแต่คำที่ 5 — ซึ่งคือจุดที่คำทักทายจบพอดี ข้อมูลที่ใช้
                        // ตัดสินใจอยู่หลังจุดตัด · min-w-0 ที่ ancestor ทำให้ truncate ทำงานอยู่แล้ว
                        className={`block truncate text-xs ${
                          unread ? 'text-default-900 font-medium' : 'text-default-700'
                        }`}
                      >
                        {/* user request 2026-08-01: ป้าย DeepBot/DeepAI เคยแทนที่คำว่า "คุณ: " ตรงนี้
                            ด้วยตัวอักษรสี primary + ไอคอน ซึ่งเด่นกว่าชื่อลูกค้าจนแย่งสายตาไปทั้งแถว
                            ย้ายไปเป็นชิปในแถวป้ายด้านล่าง (ที่เดียวกับ "สั่งซื้อแล้ว"/แท็ก) แล้วคืน
                            "คุณ: " ให้ทุกข้อความที่ฝั่งร้านส่ง ไม่ว่าคนหรือบอทเป็นคนส่ง — ในสายตา
                            ลูกค้าทั้งคู่คือ "ร้าน" เหมือนกันอยู่แล้ว */}
                        {c.lastSenderRole === 'SHOP' && c.lastMessagePreview && (
                          <span className="text-default-700 font-normal">คุณ: </span>
                        )}
                        {preview}
                      </span>
                      {/* บรรทัด "ที่มา" (มติแบบ C 2026-08-09) — ตอบว่า "บัญชีไหน" ที่ badge มุม
                          avatar ตอบไม่ได้ เพราะ badge บอกได้แค่แพลตฟอร์ม. เบาที่สุดในแถวโดยตั้งใจ
                          (text-2xs + เทา) ไม่ให้แย่งลำดับชั้นจากชื่อลูกค้าซึ่งยังเป็นพระเอก
                          เธรด DEEP ไม่มีบัญชีให้อ้าง → ใช้ "แอป Deep" (ไม่ใช่ "Deep" เฉย ๆ กันสับสน
                          กับชื่อแบรนด์) · เพจถูกถอดไปแล้วแต่เธรดเก่ายังอยู่ → ถอยไปชื่อแพลตฟอร์ม */}
                      {duplicatedProviders.has(resolveChatChannel(c.channel)) && (
                        <span className="text-default-500 mt-0.5 flex min-w-0 items-center gap-1 text-2xs">
                          <ChannelMark
                            channel={c.channel}
                            imageUrl={c.shopChannelId ? (channelAvatarById.get(c.shopChannelId) ?? null) : null}
                          />
                          <span className="truncate">
                            {(c.shopChannelId ? channelNameById.get(c.shopChannelId) : null) ??
                              getChannelDisplay(c.channel).label}
                          </span>
                        </span>
                      )}
                      {/* feature 00018 CRM — สถานะการขาย + tag (ถ้าตั้งไว้) โชว์ในแถว
                          + E5: ชิป `ad_id.…` บอกว่าโฆษณาไหนพาลูกค้ามา (แบบ Business Suite) */}
                      {(salesStatus !== 'UNSPECIFIED' ||
                        contactTags.length > 0 ||
                        !!c.referralAdId ||
                        behaviorBadges.length > 0 ||
                        (c.lastSenderRole === 'SHOP' && !!c.lastMessageAutoReplyKind)) && (
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          {/* ป้ายพฤติกรรมลูกค้า — user สั่ง 2026-08-11
                              รอบแรกผมทำเป็น **ไอคอนล้วนไม่มีคำ** เพราะ critique 2026-08-09 เพิ่งตัดชิป
                              ในแถวนี้จาก "ชิงพื้นที่ได้ถึง 6 ใบ" เหลือ 1 — ผลคือมันขึ้นจริงแต่ผู้ขาย
                              **อ่านไม่ออกว่าเป็นป้าย** (user: "มันไปซ่อนอยู่ตรงไหน งง") ป้ายที่อ่านไม่ออก
                              มีค่าเท่ากับไม่มีป้าย จึงกลับมาเป็นชิปมีคำตามที่ user ระบุถ้อยคำมาเอง
                              คุมพื้นที่แทนด้วย: คำสั้น (`ตีกลับ 2 รายการ`) + max-w + truncate
                              ไม่ให้ดันแถวสูงขึ้นที่ rail 320px */}
                          {behaviorBadges.map((b) => (
                            <span
                              key={b.key}
                              role="img"
                              aria-label={b.detail ?? b.label}
                              title={b.detail ?? b.label}
                              className={`badge text-2xs inline-flex max-w-32 shrink-0 items-center gap-1 ${
                                b.tone === 'warning' ? 'bg-warning/15 text-warning-ink' : 'bg-info/15 text-info-ink'
                              }`}
                            >
                              <Icon icon={b.icon} width={12} height={12} className="shrink-0" aria-hidden="true" />
                              <span className="truncate">{b.label}</span>
                            </span>
                          ))}
                          {/* ชิปโฟลเดอร์ย้ายไปมุมขวาล่าง (ใต้เวลา) แล้ว — user สั่ง 2026-07-24 */}
                          {/* DeepBot/DeepAI — ย้ายมาจากหน้าบรรทัด preview (user 2026-08-01) ให้เป็น
                              ป้ายระดับเดียวกับแท็ก/สถานะขาย ไม่แย่งสายตาจากชื่อลูกค้าอีกต่อไป */}
                          {c.lastSenderRole === 'SHOP' && c.lastMessageAutoReplyKind && (
                            <span className="badge bg-primary/15 text-primary-ink text-2xs inline-flex items-center gap-1">
                              <Icon icon="robot" width={12} height={12} className="shrink-0" aria-hidden="true" />
                              {c.lastMessageIsAiEnhanced ? 'DeepAI' : 'DeepBot'}
                            </span>
                          )}
                          {salesStatus !== 'UNSPECIFIED' && (
                            <span className={`badge text-2xs ${SALES_STATUS_META[salesStatus]?.cls ?? ''}`}>
                              {SALES_STATUS_META[salesStatus]?.label ?? salesStatus}
                            </span>
                          )}
                          {c.referralAdId && (
                            // ตัดข้อความให้สั้น (`max-w-24 truncate`) เหมือน Business Suite ที่โชว์ "ad_id...."
                            // — รหัสเต็มอ่านได้จาก title (hover) และที่แผงลูกค้าด้านขวา
                            <span
                              className="badge bg-default-100 text-default-600 text-2xs inline-flex max-w-24 items-center gap-1"
                              title={`ad_id.${c.referralAdId}`}
                            >
                              <Icon icon="brand-meta" className="size-3 shrink-0" />
                              <span className="truncate">ad_id.{c.referralAdId}</span>
                            </span>
                          )}
                          {/* 🛑 โชว์แท็กใบเดียว ไม่ใช่ 2 (impeccable critique 2026-08-09) — แถวชิงพื้นที่
                              กันได้ถึง 6 ใบ (บอท/สถานะขาย/ad_id/แท็ก×2/+N) แล้ว flex-wrap ไม่มีเพดาน
                              ทำให้ความสูงแถวต่างกันได้ 2.4 เท่า (64px→153px) ในรายการเดียวกัน จนกวาด
                              สายตาเป็นจังหวะไม่ได้ · ลดเหลือ 1 ใบทำให้เคสส่วนใหญ่จบใน 1 บรรทัด
                              แท็กที่เหลือยังนับรวมใน +N และดูครบได้ที่แผงลูกค้า/เมนูคลิกขวา
                              แท็กผู้ใช้พิมพ์เองยาวได้ไม่จำกัด จึงต้อง max-w-28 + truncate กันดันแถว */}
                          {contactTags.slice(0, 1).map((t) => (
                            <span key={t} className="badge bg-primary/15 text-primary-ink text-2xs max-w-28 truncate" title={t}>{t}</span>
                          ))}
                          {contactTags.length > 1 && (
                            <span className="badge bg-default-100 text-default-700 text-2xs">+{contactTags.length - 1}</span>
                          )}
                        </span>
                      )}
                      {/* user request 2026-07-29 — ป้าย "ขั้นตอนล่าสุดของออเดอร์" แทนชิปตะกร้า+จำนวนเดิม
                          (2026-07-25): จำนวนบอกแค่ว่าลูกค้าเคยซื้อกี่ครั้ง ไม่ได้บอกสิ่งที่แอดมินต้องรู้
                          ระหว่างคุยว่า "ของถึงไหนแล้ว". อ้างอิงออเดอร์ล่าสุดใบเดียว; กฎการหมดอายุของป้าย
                          (สำเร็จ 3 วัน / ยกเลิก 1 วัน) อยู่ที่ deriveOrderStage ใน src/lib/order-stage.ts
                          กดแล้วเปิด right panel รายการคำสั่งซื้อเหมือนเดิม (/inbox/{id}?panel=orders)
                          เป็น <span role="link"> ไม่ใช่ <a>/<button> เพราะทั้งแถวอยู่ใน <Link> —
                          nested anchor เป็น invalid HTML + คลิกจะ navigate ผิดที่ (precedent เดียวกับ
                          ดาวปักหมุด/kebab บรรทัดบน) stopPropagation กัน bubble ไปเปิดแชท */}
                      {c.orderStage && (() => {
                        const openOrders = (e: React.SyntheticEvent) => {
                          e.preventDefault()
                          e.stopPropagation()
                          router.push(`/inbox/${c.id}?panel=orders`)
                        }
                        // คำบนชิปมาจาก orderStageChipLabel() ที่เดียว (HR16) — ครอบทั้ง
                        // "พิมพ์ N ครั้ง" (user 2026-07-31) และ "พัสดุมีปัญหา ×N" (user 2026-08-20)
                        // เดิมประกอบข้อความตรงนี้ใน JSX ซึ่งไม่มีที่ให้เทสจับและก็อปไปจออื่นไม่ได้
                        const stageLabel = orderStageChipLabel(c.orderStage)
                        return (
                          <span
                            role="link"
                            tabIndex={0}
                            onClick={openOrders}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') openOrders(e)
                            }}
                            aria-label={`${orderVocab.noun}ล่าสุด: ${stageLabel} — ดูรายการ${orderVocab.noun}`}
                            title={stageLabel}
                            className={`badge ${c.orderStage.cls} text-2xs mt-1 inline-flex w-fit shrink-0 cursor-pointer items-center gap-1 focus-visible:outline-none focus-visible:ring-2`}
                          >
                            <Icon icon={c.orderStage.icon} width={13} height={13} className="shrink-0" />
                            {/* ป้ายนัด ("นัด 16 ส.ค. 69") ยาวกว่าคำสถานะเดิมพอสมควร และ rail แคบสุดที่
                                320px — เพดาน+truncate กันไม่ให้ชิปดันแถวสูงขึ้นทั้งรายการ ข้อความเต็ม
                                ยังอ่านได้จาก title (hover) และ aria-label (screen reader) ซึ่งรับค่า
                                เต็มเสมอ ไม่ได้ถูก CSS ตัด — precedent เดียวกับชิป ad_id ด้านบน */}
                            <span className="truncate">{stageLabel}</span>
                          </span>
                        )
                      })()}
                    </span>
                  </div>

                  {/* คอลัมน์ขวา (user สั่ง 2026-07-24): เวลา+badge อยู่ "บนขวา", ชิปโฟลเดอร์ "ล่างขวา"
                      (ใต้เวลา). self-stretch + justify-between ดันสองก้อนไปหัว-ท้ายของความสูงแถว —
                      แถวไหนไม่มีกลุ่มก็ไม่โชว์ชิป (เวลายังอยู่บนขวาเหมือนเดิม) */}
                  <span className="flex shrink-0 flex-col items-end justify-between self-stretch py-0.5">
                    <span className="flex flex-col items-end gap-1.25">
                      {/* timestamp — สีตามสถานะอ่าน (main); indicator ปักหมุดอยู่หน้าชื่อแล้ว */}
                      {/* เดิมซ่อนเวลาตอน hover (`lg:group-hover:invisible`, 2026-08-02) เพราะชุดปุ่ม
                          มาทับที่ตรงนี้พอดี — พอ user สั่งย้ายชุดปุ่มไปกลางการ์ด (2026-08-03) มันไม่ทับ
                          แล้ว การซ่อนเวลาจึงกลายเป็นการทิ้งข้อมูลฟรี ๆ ทุกครั้งที่เมาส์ผ่าน → เอาออก */}
                      <span
                        className={`text-2xs ${unread ? 'text-default-700 font-semibold' : 'text-default-700'}`}
                      >
                        {formatChatListTime(c.lastMessageAt)}
                      </span>
                      {/**
                        * ป้ายชื่อร้าน (feature 00037) — เฉพาะโหมดรวม
                        *
                        * วางในคอลัมน์ขวาไม่ใช่แถวชิปฝั่งซ้าย เพราะคอลัมน์นี้ปกติมีแค่เวลา (+ตัวนับ
                        * เมื่อมี) ซึ่งเตี้ยกว่าคอลัมน์ซ้าย (ชื่อ+ข้อความล่าสุด ≥2 บรรทัดเสมอ) อยู่แล้ว
                        * — เพิ่มบรรทัดเล็กที่นี่จึงไม่ดันความสูงแถวในเคสปกติ ต่างจากการแทรกเข้าแถวชิป
                        * ซ้ายที่จะเพิ่มบรรทัดจริงทุกแถว (user เคยบอกแล้วว่าแถว "ใหญ่ไป")
                        *
                        * สี default-500 ไม่ใช่ primary: ป้ายนี้ซ้ำได้หลายสิบครั้งต่อจอ ถ้าใช้สีธีม
                        * จะกินสัดส่วนเกิน One Voice — สงวน primary ไว้กับปุ่มหลักตัวเดียวของแถบเครื่องมือ
                        */}
                      {/* 🛑 ซ่อนป้ายชื่อร้านเมื่อบรรทัดชื่อเพจโชว์อยู่ (user สั่ง 2026-08-09) —
                          เพจหนึ่งเพจเป็นของร้านเดียวเสมอ พอรู้ว่าเพจไหนก็รู้ว่าร้านไหนอัตโนมัติ
                          การโชว์ทั้งคู่คือบอกเรื่องเดียวกันสองที่ในแถวเดียว แถมป้ายร้านอยู่ฝั่งขวา
                          ที่แคบกว่าจึงถูกตัดจนอ่านไม่ได้ความ ("BT Pre…") ขณะที่บรรทัดชื่อเพจได้
                          ความกว้างเต็มแถว — เก็บอันที่อ่านออก ทิ้งอันที่อ่านไม่ออก
                          เธรด DEEP ไม่มีเพจให้อ้าง บรรทัดชื่อเพจจึงไม่เคยโชว์ → ยังเห็นชื่อร้านเสมอ */}
                      {c.shop && !duplicatedProviders.has(resolveChatChannel(c.channel)) && (
                        <span
                          className="text-default-500 text-2xs flex max-w-24 items-center justify-end gap-0.5 truncate"
                          title={`ร้าน ${c.shop.name}`}
                        >
                          <Icon icon="building-store" className="size-3 shrink-0" />
                          <span className="truncate">{c.shop.name}</span>
                        </span>
                      )}
                      {/* จำนวนที่ยังไม่อ่าน — คอลัมน์ขวา ใต้เวลา เหนือชิปกลุ่ม (user สั่ง 2026-07-31
                          หลังลองแบบติดมุม avatar แล้วเลือกกลับมาที่เดิม) คงรูปวงกลมไว้ตามที่สั่ง
                          badge "ปิดงานแล้ว" ไม่อยู่ตรงนี้แล้ว (เป็นไอคอน check หน้าชื่อ) จึงไม่เบียดกัน */}
                      {unread && (
                        <span className="bg-danger flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-2xs font-semibold text-white">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </span>
                    {/* ชิปโฟลเดอร์ = กลุ่มที่เธรดนี้อยู่ (แท็บ "ทั้งหมด" เท่านั้น; ในแท็บกลุ่มเองไม่ย้ำ) */}
                    {groupChip && (
                      <span className="badge bg-default-100 text-default-600 text-2xs inline-flex max-w-28 items-center gap-1">
                        <Icon icon="folder" width={11} height={11} className="shrink-0" />
                        <span className="truncate">{groupChip}</span>
                      </span>
                    )}
                  </span>
                </Link>

                {/* mobile (<1024px): ปุ่ม ⋮ ถูกแทนด้วย "ปัดซ้าย" (SwipeableRow) — user request 2026-07-23 */}

                {/* ชุดปุ่มลอย (≥1024px) — โผล่เมื่อ hover แถวนั้น (user สั่ง 2026-07-23: "ปุ่ม action
                    กินพื้นที่เกินไป ให้ปิดงาน/ซ่อน โผล่ตอน hover เป็นลอย ๆ") ปุ่มถาวรกินความกว้าง
                    ถาวรใน rail 320px ซึ่งแคบอยู่แล้ว. absolute + shadow = ลอยทับ timestamp/badge
                    เฉพาะตอน hover ไม่เบียดความกว้างของเนื้อหาแถวเลย
                    ปักหมุดย้ายเข้าชุดนี้ด้วย (2026-07-23) หลังจากดาวหน้าสุดถูกเปลี่ยนเป็น indicator
                    inline หน้าชื่อ — action ต้องยังกดได้ที่เดียวกับ ปิดงาน/ซ่อน ไม่ใช่หายไป */}
                {/* ตำแหน่งแนวตั้ง — โดนสั่งกลับไปกลับมา บันทึกไว้กันแก้วน:
                    2026-08-02 ย้าย top-1/2 → top-2 เพราะลอยกลางแถวแล้วทับ "ข้อความล่าสุด + แท็ก"
                      ซึ่งเป็นบรรทัดที่ต้องอ่านจริง ๆ (ต้องขยับเมาส์หนีเพื่ออ่านว่าห้องไหนเป็นห้องไหน)
                    2026-08-03 user สั่งกลับมากลางการ์ด ("มันไม่อยู่ตรงกลาง card ของ chat lists")
                      → กลับไป top-1/2 + -translate-y-1/2. ข้อแลกเปลี่ยนเดิมยังอยู่: ตอน hover
                      ชุดปุ่มจะบังปลายบรรทัดข้อความล่าสุด/แท็กด้านขวา (ชุดปุ่มทึบ มีขอบ+เงา)
                    เหลือ 2 action ที่ใช้บ่อยสุด (ปักหมุด/ปิดงาน) ส่วน ซ่อน+สแปม เข้าเมนู ⋯ */}
                <div
                  className={`absolute end-2 top-1/2 -translate-y-1/2 items-center gap-0.5 rounded-lg border border-default-200 bg-card p-0.5 shadow ${
                    // เมนูเปิดอยู่ = ต้องค้างไว้แม้เมาส์ออกนอกแถว ไม่งั้นเมนูที่ล้นออกนอกขอบแถว
                    // จะทำให้ hover หลุด → ชุดปุ่มหาย → เมนูหายตามระหว่างที่ผู้ใช้กำลังจะกดมัน
                    rowMenuId === c.id ? 'flex' : 'hidden lg:group-hover:flex'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleRowAction(c.id, c.isPinned ? 'unpin' : 'pin')}
                    disabled={actioningId === c.id}
                    aria-pressed={c.isPinned}
                    aria-label={c.isPinned ? 'เลิกปักหมุดบทสนทนานี้' : 'ปักหมุดบทสนทนานี้'}
                    title={c.isPinned ? 'เลิกปักหมุด' : 'ปักหมุด'}
                    className={`btn btn-icon btn-sm hover:bg-default-100 disabled:opacity-50 ${
                      // เหลืองเหมือนดาวหน้าชื่อ — ต้องเป็นสีเดียวกันทั้งสองที่ ไม่งั้นดูเป็นคนละสถานะ
                      c.isPinned ? 'text-warning' : 'text-default-600'
                    }`}
                  >
                    <Icon icon={c.isPinned ? 'star-filled' : 'star'} width={16} height={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRowAction(c.id, isResolved ? 'reopen' : 'resolve')}
                    disabled={actioningId === c.id}
                    aria-label={isResolved ? 'เปิดบทสนทนานี้ใหม่' : 'ปิดงานบทสนทนานี้'}
                    title={isResolved ? 'เปิดใหม่' : 'ปิดงาน'}
                    className="btn btn-icon btn-sm text-default-600 hover:bg-default-100 disabled:opacity-50"
                  >
                    <Icon icon={isResolved ? 'arrow-back-up' : 'circle-check'} width={16} height={16} />
                  </button>
                  {/* เมนู ⋯ — custom React (useState + click-outside) ไม่ใช่ Preline hs-dropdown
                      ด้วยเหตุผลเดียวกับ OrderCardMenu: รายการนี้ lazy-load + filter + realtime →
                      re-render ตลอด ทำให้ inline-state ของ Preline หายแล้ว menu ค้าง opacity 0
                      Base (style): theme/paces/Admin/TS/src/assets/css/custom/_dropdown.css (.dropdown-item) */}
                  <div className="relative" ref={rowMenuId === c.id ? rowMenuRef : undefined}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setRowMenuId((prev) => (prev === c.id ? null : c.id))
                      }}
                      aria-haspopup="menu"
                      aria-expanded={rowMenuId === c.id}
                      aria-label="การจัดการอื่น ๆ"
                      title="เพิ่มเติม"
                      className="btn btn-icon btn-sm text-default-600 hover:bg-default-100"
                    >
                      <Icon icon="dots" width={16} height={16} />
                    </button>
                    {rowMenuId === c.id && (
                      <div
                        className="border-default-300 bg-card absolute end-0 top-full z-30 mt-1 min-w-40 overflow-hidden rounded border shadow-lg"
                        role="menu"
                        aria-orientation="vertical"
                      >
                        <div className="space-y-0.5 p-1">
                          <button
                            type="button"
                            role="menuitem"
                            disabled={actioningId === c.id}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setRowMenuId(null)
                              handleRowAction(c.id, filter.hidden ? 'unhide' : 'hide')
                            }}
                            className="dropdown-item text-sm disabled:opacity-50"
                          >
                            <Icon icon={filter.hidden ? 'eye' : 'eye-off'} className="size-4" />
                            {filter.hidden ? 'เลิกซ่อน' : 'ซ่อน'}
                          </button>
                          {/* สแปม (user สั่ง 2026-07-24) — accent แดง (danger) แยกจาก action อื่น
                              เพราะเป็นการ "ตีตราสแปม" ไม่ใช่แค่จัดระเบียบ; ในถังสแปมกลายเป็น "ไม่ใช่สแปม" */}
                          <button
                            type="button"
                            role="menuitem"
                            disabled={actioningId === c.id}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setRowMenuId(null)
                              handleRowAction(c.id, c.isSpam ? 'unspam' : 'spam')
                            }}
                            className={`dropdown-item text-sm disabled:opacity-50 ${
                              c.isSpam ? '' : 'text-danger hover:bg-danger/10'
                            }`}
                          >
                            <Icon icon={c.isSpam ? 'inbox' : 'alert-octagon'} className="size-4" />
                            {c.isSpam ? 'ไม่ใช่สแปม' : 'ย้ายเข้าสแปม'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </SwipeableRow>
            )
          })}

          {/* sentinel — IntersectionObserver trigger loadMore (ซ่อน element เอง ไม่มี card-footer ปุ่ม) */}
          {nextCursor && (
            <div ref={sentinelRef} className="flex items-center justify-center gap-3 py-4">
              <div
                className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent"
                role="status"
                aria-label="กำลังโหลด"
              />
              <span className="text-default-700 text-sm font-medium">กำลังโหลด...</span>
            </div>
          )}
        </div>
      )}

      {/* feature 00018 CRM — แผงลัดประจำแถว: คลิกขวา (เดสก์ท็อป) / กดค้าง (มือถือ — โหมดเพ่ง) */}
      {ctxMenu &&
        (() => {
          // อ่านสถานะจาก items ตอน render (ไม่ snapshot ลง state ตอนคลิกขวา) — หลัง action + refetch
          // เมนูที่ยังเปิดอยู่จะได้ label ที่ตรงความจริง ไม่ค้างเป็น "ปักหมุด" ทั้งที่ปักไปแล้ว
          const row = items.find((i) => i.id === ctxMenu.id)
          if (!row) return null
          return (
            <ChatContextMenu
              anchor={ctxMenu.anchor}
              conversationId={row.id}
              external={row.channel !== 'DEEP'}
              salesStatus={row.contactSalesStatus ?? 'UNSPECIFIED'}
              tags={row.contactTags ?? []}
              groups={groups}
              currentGroupId={row.chatGroupId ?? null}
              onMoveToGroup={(gid) => {
                handleMoveToGroup(row.id, gid)
                setCtxMenu(null)
              }}
              isPinned={row.isPinned}
              isResolved={row.resolvedAt !== null}
              isSpam={row.isSpam ?? false}
              hiddenContext={filter.hidden}
              busyAction={actioningId === row.id}
              onAction={(a) => handleRowAction(row.id, a)}
              onClose={() => setCtxMenu(null)}
              onUpdated={() => {
                fetchList({ append: false })
                setCtxMenu(null)
              }}
            />
          )
        })()}
    </div>
  )
}
