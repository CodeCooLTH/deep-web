'use client'

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
 * (text-default-600 / text-default-400 เหมือนเดิม) — token Paces ล้วน ไม่มี arbitrary value (HR7)
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
import { generateInitials } from '@/utils/helpers'
import { formatChatListTime } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import { subscribeShopChat } from '@/lib/chat-shop-realtime'
import { playChatBeep } from '@/lib/chat-sound'
import { useChatSearchQuery } from '@/context/useChatSearchContext'
import { pacesConfirm } from '@/lib/paces-swal'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import PageFilterDropdown from './PageFilterDropdown'
import InboxFilterPanel, { type ChatFilterState, DEFAULT_CHAT_FILTER } from './InboxFilterPanel'
import { type RowAction } from './ConversationRowMenu'
import ChatContextMenu from './ChatContextMenu'
import SwipeableRow from './SwipeableRow'
import { ChannelBadgeOverlay, getChannelDisplay, type ChatChannel, type ChannelFilterOption } from './ChannelBadge'

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
  orderStage?: { key: string; label: string; cls: string; icon: string; printCount?: number } | null
  // feature 00018 E5 (user request 2026-07-26) — รหัสโฆษณาที่พาลูกค้าคนนี้เข้ามา โชว์เป็นชิป
  // `ad_id.…` ในแถวแบบ Business Suite; optional เผื่อ payload เก่า
  referralAdId?: string | null
}

// ตัวเลือกตัวกรอง "เพจ" — ย้ายนิยามไป ChannelBadge.tsx แล้ว (feat 00018 งาน 2: PageFilterDropdown
// ต้องใช้ type เดียวกัน ไม่อยาก import ย้อนจากไฟล์นี้จนวนเป็น circular import) — re-export ไว้ที่นี่
// เพื่อไม่ต้องแก้ import ที่ page.tsx/ChatRail.tsx (ยังเรียก `from './components/InboxList'` เดิม)
export type { ChannelFilterOption } from './ChannelBadge'

type ApiResponse = { items: ConversationListItem[]; nextCursor: string | null }

/** tab ตัวกรองช่องทาง — 'ALL' ไม่ใช่ ChatChannel จริง จึงแยก union เพิ่ม */
type ChannelTab = 'ALL' | ChatChannel
const CHANNEL_TABS: ChannelTab[] = ['ALL', 'DEEP', 'MESSENGER', 'INSTAGRAM']

// feature 00018 CRM — badge สถานะการขายในแถว (UNSPECIFIED ไม่โชว์). ต้องตรงกับ CustomerCrmSection
const SALES_STATUS_META: Record<string, { label: string; cls: string }> = {
  INTERESTED: { label: 'สนใจ', cls: 'bg-success/15 text-success' },
  NOT_INTERESTED: { label: 'ไม่สนใจ', cls: 'bg-default-200 text-default-600' },
}

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
  const src = avatar ? (avatar.startsWith('http') ? avatar : `/api/files/${avatar}`) : null
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
  /** ร้านที่ active — ใช้ subscribe realtime `chat:shop:{shopId}`; null = ไม่ subscribe
   *  (ยัง fallback refresh ตอน focus ได้ปกติ) */
  shopId?: string | null
}

export default function InboxList({
  initialItems,
  initialNextCursor,
  channels,
  initialGroups = [],
  hasShipping = false,
  railMode = false,
  shopId = null,
}: Props) {
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
  // feature 00018 CRM — เมนูคลิกขวา (ตั้งสถานะ/แท็กเร็ว) เฉพาะเธรดช่องทางนอก
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null)

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

  // fetch เดียวใช้ทั้ง loadMore (append) และ refetch เมื่อ filter เปลี่ยน (replace)
  const fetchList = async (opts: { cursor?: string; append: boolean }) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ take: '20' })
      if (opts.cursor) params.set('cursor', opts.cursor)
      if (channelTab !== 'ALL') params.set('channel', channelTab)
      if (pageFilter) params.set('shopChannelId', pageFilter)
      if (debouncedQuery) params.set('q', debouncedQuery)
      // S-7 ตัวกรอง — ส่งเฉพาะที่ไม่ใช่ default (ลด query param ที่ไม่จำเป็น; backend default = open/false)
      if (filter.status !== 'open') params.set('status', filter.status)
      if (filter.customerLinked !== 'all') params.set('customerLinked', filter.customerLinked)
      if (filter.hidden) params.set('hidden', 'true')
      if (filter.spam) params.set('spam', 'true')
      // แท็ก: ส่งเป็น CSV (route แยกเอง) — ไม่ส่งเมื่อไม่ได้เลือก เพื่อไม่ให้ query string รกโดยเปล่าประโยชน์
      if (filter.tags.length > 0) params.set('tags', filter.tags.join(','))
      if (filter.shipment !== 'all') params.set('shipment', filter.shipment)
      if (activeGroupId) params.set('chatGroupId', activeGroupId)
      if (filter.readState !== 'all') params.set('readState', filter.readState)
      const res = await fetch(`/api/chat/conversations?${params.toString()}`)
      if (!res.ok) throw new Error('load failed')
      const data: ApiResponse = await res.json()
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
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    fetchList({ append: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchList ผูก closure ของ filter ปัจจุบันอยู่แล้ว
  }, [channelTab, pageFilter, debouncedQuery, filter.status, filter.customerLinked, filter.hidden, filter.readState, filter.spam, filter.tags, filter.shipment, activeGroupId])

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
      : filter.status === 'all'
        ? null // ไม่ตรงกับแท็บไหน (ไม่มี UI ตั้งค่านี้แล้ว แต่กันไว้)
        : activeGroupId === null
          ? 'ALL'
          : null

  const selectViewTab = (tab: Exclude<ViewTab, null>) => {
    setActiveGroupId(null)
    setFilter((f) => ({
      ...f,
      status: tab === 'RESOLVED' ? 'resolved' : 'open',
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
    try {
      const params = new URLSearchParams({ take: '20' })
      if (channelTab !== 'ALL') params.set('channel', channelTab)
      if (pageFilter) params.set('shopChannelId', pageFilter)
      if (debouncedQuery) params.set('q', debouncedQuery)
      // S-7: realtime refresh ต้องเคารพตัวกรองปัจจุบันด้วย (ไม่งั้นดึงแถวข้าม filter มา merge)
      if (filter.status !== 'open') params.set('status', filter.status)
      if (filter.customerLinked !== 'all') params.set('customerLinked', filter.customerLinked)
      if (filter.hidden) params.set('hidden', 'true')
      if (filter.spam) params.set('spam', 'true')
      // แท็ก: ส่งเป็น CSV (route แยกเอง) — ไม่ส่งเมื่อไม่ได้เลือก เพื่อไม่ให้ query string รกโดยเปล่าประโยชน์
      if (filter.tags.length > 0) params.set('tags', filter.tags.join(','))
      if (filter.shipment !== 'all') params.set('shipment', filter.shipment)
      if (activeGroupId) params.set('chatGroupId', activeGroupId)
      if (filter.readState !== 'all') params.set('readState', filter.readState)
      const res = await fetch(`/api/chat/conversations?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) return
      const data: ApiResponse = await res.json()
      setItems((prev) => {
        const freshIds = new Set(data.items.map((i) => i.id))
        // เสียงเตือนข้อความใหม่จากลูกค้า (user สั่ง 2026-07-23) — เทียบกับ state เดิม: เธรดใหม่ทั้งห้อง
        // หรือเธรดเดิมที่ lastMessageAt ขยับ **และ** ข้อความล่าสุดมาจากลูกค้า (ไม่ใช่ที่ร้านเพิ่งส่งเอง)
        // playChatBeep throttle ให้เองแล้วเมื่อหน้าเธรดดังพร้อมกัน (ดู comment ใน chat-sound.ts)
        const prevById = new Map(prev.map((p) => [p.id, p]))
        const beepFor = data.items.find((it) => {
          if (it.lastSenderRole !== 'BUYER') return false
          const before = prevById.get(it.id)
          // ดังทุกข้อความที่ลูกค้าส่งเข้ามา (user สั่ง 2026-07-30) — เกณฑ์เดียวคือ "มีข้อความใหม่จริง"
          //
          // ประวัติที่ต้องรู้ก่อนแก้ตรงนี้: เดิม (2026-07-26) มีเงื่อนไขเพิ่มว่าต้องเป็น "เทิร์นใหม่"
          // เท่านั้น (ก่อนหน้าต้องเป็นฝั่งร้านพูดล่าสุด) เพราะ user รายงานว่าลูกค้า spam รัว ๆ แล้ว
          // เสียงดังรัว ๆ. ผลข้างเคียงคือข้อความที่ 2, 3, 4 ในเทิร์นเดียวกันเงียบสนิท → user รายงาน
          // 2026-07-30 ว่า "มีข้อความเข้าแต่ดังครั้งเดียว"
          //
          // ตอนนี้แก้ที่ต้นเหตุจริงแทน: ความน่ารำคาญมาจาก "ความถี่" ไม่ใช่ "จำนวนข้อความ" →
          // ย้ายไปคุมด้วยระยะเวลาที่ playChatBeep (MIN_GAP_MS) ซึ่งรวบข้อความที่มาติดกันเร็วให้เหลือ
          // เสียงเดียว โดยข้อความที่ห่างกันพอสมควรยังมีเสียงของตัวเองครบ
          return !before || new Date(it.lastMessageAt).getTime() > new Date(before.lastMessageAt).getTime()
        })
        if (beepFor) playChatBeep({ shopId, conversationId: beepFor.id })
        // หน้าแรกเรียงล่าสุดก่อนอยู่แล้ว (lastMessageAt desc) — วางไว้บนสุดแล้วต่อด้วยของเก่าที่ไม่ซ้ำ
        return [...data.items, ...prev.filter((p) => !freshIds.has(p.id))]
      })
    } catch {
      // เงียบ — รอ broadcast/focus รอบถัดไป (เหมือน refetchNewer ของ useSellerChatThread)
    }
  }

  useEffect(() => {
    refreshRef.current = refreshFirstPage
  })

  /** debounce กันกรณีข้อความรัวหลายห้องพร้อมกัน → refresh ทีเดียว */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => refreshRef.current(), 400)
  }, [])

  useEffect(() => {
    if (!shopId) return
    return subscribeShopChat(shopId, scheduleRefresh)
  }, [shopId, scheduleRefresh])

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
  const channelAvatarById = new Map(channels.map((c) => [c.id, c.avatarUrl]))

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
          ทะลุ) + z-10 ให้อยู่เหนือทั้งแถวและชุดปุ่มลอยตอน hover. ใช้ได้จริงเพราะ .card ไม่มี
          overflow:hidden (custom/_card.css — มีเฉพาะ .card-collapsed) ที่จะตัด sticky ทิ้ง */}
      <div className="card-header sticky top-0 z-10 flex flex-col items-stretch gap-3 border-dashed bg-card">
        {/* ช่องค้นหา — Base ContactList.tsx:19-24 — railMode (desktop rail) ย้ายขึ้น topbar
            แล้ว (ChatSearchBox.tsx) ไม่ render ซ้ำที่นี่ — มือถือ/แท็บเล็ต drill-down ยังมีเหมือนเดิม */}
        {!railMode && (
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" />
            <input
              type="search"
              value={localSearchInput}
              onChange={(e) => setLocalSearchInput(e.target.value)}
              placeholder="ค้นหาชื่อ ลูกค้า เบอร์ หรือข้อความในแชท"
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
          <div className="bg-light flex w-full items-center gap-0.5 rounded-lg p-1" aria-label="ตัวกรองช่องทาง" role="tablist">
          {/* segmented control — พื้นเทาก้อนเดียว ตัวที่เลือกเป็นการ์ดขาวยกขึ้น (mockup V1, 2026-07-31)
              เดิมเป็น pill 4 ก้อนลอยแยกกัน ทำให้ดูเป็นของ 4 ชิ้นทั้งที่เป็นตัวเลือกชุดเดียวกัน
              และแย่งความเด่นกับปุ่มตัวกรอง — user รายงานว่า "รก ดูไม่ออกว่าอะไรสำคัญ" */}
          {CHANNEL_TABS.map((tab) => {
            const active = channelTab === tab
            const display = tab === 'ALL' ? null : getChannelDisplay(tab)
            const label = tab === 'ALL' ? 'ทั้งหมด' : display!.label
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                title={label}
                aria-label={tab === 'ALL' ? 'ทั้งหมด' : `กรองเฉพาะช่องทาง ${label}`}
                onClick={() => handleChannelTabChange(tab)}
                className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-nowrap ${
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

          {/* active-filter chips — x ในตัวเดียวกันคือปุ่มล้างตัวกรองนั้น
              ไม่มี chip ของ "เพจ" (user สั่ง 2026-07-23): ปุ่ม PageFilterDropdown แสดงชื่อเพจที่เลือก
              อยู่บนตัวปุ่มเองแล้ว chip ด้านล่างจึงเป็นชื่อเดียวกันซ้ำสองบรรทัดติดกัน — ล้างตัวกรอง
              ยังทำได้จากในดรอปดาวน์ (ตัวเลือก "ทุกเพจ") ต่างจากตัวกรองสถานะ/ผูกลูกค้า/ซ่อน ที่ปุ่ม
              "ตัวกรอง" ไม่ได้โชว์ค่าที่เลือกบนหน้าปุ่ม chip จึงยังจำเป็น */}
          {/* ชิปสถานะ/สแปม ถูกถอดออก 2026-07-31 — แท็บในแถวล่างแสดงอยู่แล้ว ถ้าโชว์ทั้งคู่จะซ้ำซ้อน */}
          {filter.customerLinked !== 'all' && (
            <span className="badge bg-primary/15 text-primary text-2xs inline-flex items-center gap-1">
              {filter.customerLinked === 'linked' ? 'ผูกลูกค้าแล้ว' : 'ยังไม่ผูกลูกค้า'}
              <button type="button" onClick={() => setFilter((f) => ({ ...f, customerLinked: 'all' }))} aria-label="ล้างตัวกรองผูกลูกค้า" className="inline-flex items-center">
                <Icon icon="x" width={12} height={12} />
              </button>
            </span>
          )}
          {filter.hidden && (
            <span className="badge bg-primary/15 text-primary text-2xs inline-flex items-center gap-1">
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
          <div className="border-default-200 flex min-w-0 flex-1 items-center gap-4 overflow-x-auto border-b" role="tablist" aria-label="มุมมองและกลุ่มแชท">
            {/* แท็บข้อความมีเส้นใต้ (mockup V1) — น้ำหนักต่างจาก segmented ด้านบนชัดเจน ไม่แย่งกันเด่น
                สแปมใช้สี danger ตั้งแต่ยังไม่ถูกเลือก เพราะเป็นถังที่ "ไม่ควรมีอะไรอยู่" (user สั่ง) */}
            {([
              { key: 'ALL', label: 'ทั้งหมด', icon: null, danger: false },
              { key: 'RESOLVED', label: 'ปิดงาน', icon: 'circle-check', danger: false },
              { key: 'SPAM', label: 'สแปม', icon: 'alert-octagon', danger: true },
            ] as const).map((t) => {
              const on = activeViewTab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => selectViewTab(t.key)}
                  className={`-mb-px flex shrink-0 items-center gap-1 border-b-2 px-0 py-1.5 text-sm text-nowrap ${
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
                </button>
              )
            })}
            {/* กลุ่มที่ร้านสร้างเอง → ปุ่มดรอปดาวน์ ไม่ใช่แท็บเรียงยาว (user report 2026-07-31:
                "custom group เยอะ ๆ แล้ว width ล้น UI เพี้ยน")
                ต้นเหตุคือจำนวนกลุ่มไม่จำกัดแต่พื้นที่จำกัด — เรียงเป็นแท็บยังไงก็ล้นวันหนึ่ง
                ปุ่มเดียว + ตัวเลขบอกจำนวน จึงกว้างคงที่เสมอไม่ว่าจะมีกี่กลุ่ม และบอกได้ด้วยว่ามีกี่อัน */}
            <span className="bg-default-300 mx-1 h-4 w-px shrink-0" aria-hidden="true" />
            <div className="relative shrink-0 pb-1.5">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={openPanel === 'group'}
                onClick={() => setOpenPanel(openPanel === 'group' ? null : 'group')}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm text-nowrap ${
                  activeGroupId ? 'bg-primary text-white font-semibold' : 'bg-light text-default-700 font-medium'
                }`}
              >
                <Icon icon="folder" width={14} height={14} className="shrink-0" />
                {/* เลือกอยู่ → โชว์ชื่อกลุ่ม (ผู้ใช้ต้องรู้ว่ากำลังกรองอะไรอยู่โดยไม่ต้องเปิดดรอป)
                    ไม่ได้เลือก → โชว์คำว่า "กลุ่ม" + จำนวนที่มี */}
                {activeGroupName ? (
                  <span className="max-w-28 truncate">{activeGroupName}</span>
                ) : (
                  <>
                    กลุ่ม
                    {groups.length > 0 && (
                      <span className="badge bg-default-200 text-default-700 text-2xs rounded-full px-1.5">
                        {groups.length}
                      </span>
                    )}
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
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={activeGroupId === null}
                    onClick={() => {
                      setActiveGroupId(null)
                      setOpenPanel(null)
                    }}
                    className="dropdown-item text-sm"
                  >
                    <Icon icon="check" className={`size-4 ${activeGroupId === null ? 'text-primary' : 'opacity-0'}`} />
                    ทุกกลุ่ม
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
                        className="text-default-400 hover:text-danger flex size-8 shrink-0 items-center justify-center"
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
                      สร้างกลุ่มใหม่
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card-body">
          {filter.hidden ? (
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
        <div className="card-body divide-y divide-dashed divide-default-300 !p-0">
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
                      className="bg-success text-2xs flex flex-1 flex-col items-center justify-center gap-0.5 text-white disabled:opacity-50"
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
                onContextMenu={(e) => {
                  // เปิดได้ทุกเธรดแล้ว (user สั่ง 2026-07-23: action ประจำแถวต้องอยู่ในคลิกขวาด้วย) —
                  // เดิมเปิดเฉพาะช่องทางนอกเพราะเมนูมีแต่ฟิลด์ CRM; ตอนนี้ DEEP ก็มี ปักหมุด/ปิดงาน/
                  // ซ่อน/เสียง ให้ใช้ (เมนูซ่อนเฉพาะส่วน CRM เอง)
                  e.preventDefault()
                  setCtxMenu({ x: e.clientX, y: e.clientY, id: c.id })
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
                      {/* รูปเพจจริงถ้าเพจนั้นมี (user สั่ง 2026-07-23) — หาได้จาก channels prop ที่
                          มี avatarUrl ต่อเพจอยู่แล้ว ไม่ต้องเพิ่ม query ต่อแถว; ไม่มีรูป/ไม่มีเพจ
                          → ChannelBadgeOverlay ถอยไปโลโก้ช่องทางเอง */}
                      <ChannelBadgeOverlay
                        channel={c.channel}
                        imageUrl={c.shopChannelId ? (channelAvatarById.get(c.shopChannelId) ?? null) : null}
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
                        className={`text-default-900 flex items-center gap-1 truncate text-sm ${
                          unread ? 'font-bold' : 'font-semibold'
                        }`}
                      >
                        {c.isPinned && (
                          <Icon
                            icon="star-filled"
                            width={14}
                            height={14}
                            className="text-warning shrink-0"
                            aria-label="ปักหมุดไว้"
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
                          2026-07-31 — แถวสูงเกินไป). คงสี text-default-500 ที่ปรับจาก 400 ไว้
                          เพราะเป็นเรื่องคอนทราสต์ให้อ่านออก ไม่ใช่เรื่องขนาด และตอนนี้บรรทัดนี้
                          เป็นตัวหลักที่บอกสถานะอ่าน (ชื่อเข้มเสมอแล้ว) */}
                      <span
                        className={`block max-w-52 truncate text-xs ${
                          unread ? 'text-default-800 font-semibold' : 'text-default-500'
                        }`}
                      >
                        {c.lastSenderRole === 'SHOP' && c.lastMessagePreview && (
                          <span className="text-default-500 font-normal">คุณ: </span>
                        )}
                        {preview}
                      </span>
                      {/* feature 00018 CRM — สถานะการขาย + tag (ถ้าตั้งไว้) โชว์ในแถว
                          + E5: ชิป `ad_id.…` บอกว่าโฆษณาไหนพาลูกค้ามา (แบบ Business Suite) */}
                      {(salesStatus !== 'UNSPECIFIED' || contactTags.length > 0 || !!c.referralAdId) && (
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          {/* ชิปโฟลเดอร์ย้ายไปมุมขวาล่าง (ใต้เวลา) แล้ว — user สั่ง 2026-07-24 */}
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
                          {contactTags.slice(0, 2).map((t) => (
                            <span key={t} className="badge bg-primary/15 text-primary text-2xs">{t}</span>
                          ))}
                          {contactTags.length > 2 && (
                            <span className="badge bg-default-100 text-default-500 text-2xs">+{contactTags.length - 2}</span>
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
                        // "พิมพ์แล้ว" กับ "พิมพ์ N ครั้ง" บอกเรื่องเดียวกัน (user 2026-07-31) — รู้จำนวน
                        // เมื่อไหร่ก็ใช้จำนวนไปเลย ได้ข้อมูลมากกว่าในพื้นที่เท่ากัน ไม่ต้องมี 2 ชิป
                        const stageLabel =
                          c.orderStage.key === 'LABEL_PRINTED' && c.orderStage.printCount
                            ? `พิมพ์ ${c.orderStage.printCount} ครั้ง`
                            : c.orderStage.label
                        return (
                          <span
                            role="link"
                            tabIndex={0}
                            onClick={openOrders}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') openOrders(e)
                            }}
                            aria-label={`คำสั่งซื้อล่าสุด: ${stageLabel} — ดูรายการคำสั่งซื้อ`}
                            className={`badge ${c.orderStage.cls} text-2xs mt-1 inline-flex w-fit shrink-0 cursor-pointer items-center gap-1 focus-visible:outline-none focus-visible:ring-2`}
                          >
                            <Icon icon={c.orderStage.icon} width={13} height={13} className="shrink-0" />
                            {stageLabel}
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
                      <span className={`text-xs ${unread ? 'text-default-700 font-semibold' : 'text-default-400'}`}>
                        {formatChatListTime(c.lastMessageAt)}
                      </span>
                      {/* resolved กับ unread ไม่โชว์พร้อมกัน — resolved = badge "ปิดงานแล้ว" (S-7),
                          ไม่งั้น badge จำนวนที่ยังไม่อ่าน (99+, main) */}
                      {isResolved ? (
                        <span className="badge text-2xs bg-success/15 text-success">ปิดงานแล้ว</span>
                      ) : (
                        unread && (
                          <span className="badge text-2xs bg-danger text-white">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )
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
                <div className="absolute end-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-lg border border-default-200 bg-card p-1 shadow lg:group-hover:flex">
                  <button
                    type="button"
                    onClick={() => handleRowAction(c.id, c.isPinned ? 'unpin' : 'pin')}
                    disabled={actioningId === c.id}
                    aria-pressed={c.isPinned}
                    aria-label={c.isPinned ? 'เลิกปักหมุดบทสนทนานี้' : 'ปักหมุดบทสนทนานี้'}
                    title={c.isPinned ? 'เลิกปักหมุด' : 'ปักหมุด'}
                    className={`btn btn-icon btn-sm hover:bg-default-100 disabled:opacity-50 ${
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
                  <button
                    type="button"
                    onClick={() => handleRowAction(c.id, filter.hidden ? 'unhide' : 'hide')}
                    disabled={actioningId === c.id}
                    aria-label={filter.hidden ? 'เลิกซ่อนบทสนทนานี้' : 'ซ่อนบทสนทนานี้'}
                    title={filter.hidden ? 'เลิกซ่อน' : 'ซ่อน'}
                    className="btn btn-icon btn-sm text-default-600 hover:bg-default-100 disabled:opacity-50"
                  >
                    <Icon icon={filter.hidden ? 'eye' : 'eye-off'} width={16} height={16} />
                  </button>
                  {/* สแปม (user สั่ง 2026-07-24) — accent แดง (danger) แยกจาก action อื่นเพราะเป็น
                      การ "ตีตราสแปม" ไม่ใช่แค่จัดระเบียบ; ในถังสแปมกลายเป็น "ไม่ใช่สแปม" */}
                  <button
                    type="button"
                    onClick={() => handleRowAction(c.id, c.isSpam ? 'unspam' : 'spam')}
                    disabled={actioningId === c.id}
                    aria-label={c.isSpam ? 'เอาออกจากสแปม' : 'ย้ายเข้าสแปม'}
                    title={c.isSpam ? 'ไม่ใช่สแปม' : 'สแปม'}
                    className={`btn btn-icon btn-sm hover:bg-danger/10 disabled:opacity-50 ${c.isSpam ? 'text-default-600' : 'text-danger'}`}
                  >
                    <Icon icon={c.isSpam ? 'inbox' : 'alert-octagon'} width={16} height={16} />
                  </button>
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
              <span className="text-default-500 text-sm font-medium">กำลังโหลด...</span>
            </div>
          )}
        </div>
      )}

      {/* feature 00018 CRM — เมนูคลิกขวา (ตั้งสถานะ/แท็กเร็ว) */}
      {ctxMenu &&
        (() => {
          // อ่านสถานะจาก items ตอน render (ไม่ snapshot ลง state ตอนคลิกขวา) — หลัง action + refetch
          // เมนูที่ยังเปิดอยู่จะได้ label ที่ตรงความจริง ไม่ค้างเป็น "ปักหมุด" ทั้งที่ปักไปแล้ว
          const row = items.find((i) => i.id === ctxMenu.id)
          if (!row) return null
          return (
            <ChatContextMenu
              x={ctxMenu.x}
              y={ctxMenu.y}
              conversationId={row.id}
              external={row.channel !== 'DEEP'}
              salesStatus={row.contactSalesStatus ?? 'UNSPECIFIED'}
              tags={row.contactTags ?? []}
              groups={groups}
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
