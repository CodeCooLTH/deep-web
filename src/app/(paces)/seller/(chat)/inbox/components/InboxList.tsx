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
 * src/utils/helpers.ts) — เธรดช่องทางนอก (feat 00018) avatarUrl เป็น null เสมอ (Meta ไม่ให้รูป)
 * จึงตกไป fallback initials เสมอ (ไม่ต้องแยก branch พิเศษ)
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
import { usePathname } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { generateInitials } from '@/utils/helpers'
import { relativeTimeTh } from '@/lib/relative-time-th'
import { pacesToast } from '@/lib/paces-toast'
import { subscribeShopChat } from '@/lib/chat-shop-realtime'
import { useChatSearchQuery } from '@/context/useChatSearchContext'
import { pacesConfirm } from '@/lib/paces-swal'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import PageFilterDropdown from './PageFilterDropdown'
import InboxFilterPanel, { type ChatFilterState, DEFAULT_CHAT_FILTER } from './InboxFilterPanel'
import ConversationRowMenu, { type RowAction } from './ConversationRowMenu'
import { ChannelBadgeOverlay, getChannelDisplay, type ChatChannel, type ChannelFilterOption } from './ChannelBadge'

export type ConversationListItem = {
  id: string
  buyerUserId: string | null // เธรดช่องทางนอก (feature 00018) ไม่มี User ผู้ซื้อ
  shopId: string
  channel: string // 'DEEP' | 'MESSENGER' | 'INSTAGRAM' — feature 00018 (T3: ใช้ทำ badge)
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
}

// ตัวเลือกตัวกรอง "เพจ" — ย้ายนิยามไป ChannelBadge.tsx แล้ว (feat 00018 งาน 2: PageFilterDropdown
// ต้องใช้ type เดียวกัน ไม่อยาก import ย้อนจากไฟล์นี้จนวนเป็น circular import) — re-export ไว้ที่นี่
// เพื่อไม่ต้องแก้ import ที่ page.tsx/ChatRail.tsx (ยังเรียก `from './components/InboxList'` เดิม)
export type { ChannelFilterOption } from './ChannelBadge'

type ApiResponse = { items: ConversationListItem[]; nextCursor: string | null }

/** tab ตัวกรองช่องทาง — 'ALL' ไม่ใช่ ChatChannel จริง จึงแยก union เพิ่ม */
type ChannelTab = 'ALL' | ChatChannel
const CHANNEL_TABS: ChannelTab[] = ['ALL', 'DEEP', 'MESSENGER', 'INSTAGRAM']

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
      <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
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
      className="size-9 shrink-0 rounded-full bg-default-100 object-cover"
    />
  )
}

type Props = {
  initialItems: ConversationListItem[]
  initialNextCursor: string | null
  channels: ChannelFilterOption[]
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
  // S-7 (ตัวกรองแชท): สถานะ/ผูกลูกค้า/ที่ซ่อน — init = default เดียวกับ SSR (status=open, hidden=false)
  const [filter, setFilter] = useState<ChatFilterState>(DEFAULT_CHAT_FILTER)
  // popover ตัวกรองเปิดได้ทีละตัว — state อยู่ที่นี่ (bug: เดิมสองตัวถือ state เอง เปิดพร้อมกันแล้วทับกัน)
  const [openPanel, setOpenPanel] = useState<'filter' | 'page' | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null) // แถวที่มี PATCH ค้าง (กันดับเบิล)

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
  }, [channelTab, pageFilter, debouncedQuery, filter.status, filter.customerLinked, filter.hidden])

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
      }
      pacesToast.chat.success(TOAST[action])
      await fetchList({ append: false })
    } catch {
      pacesToast.chat.error('ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setActioningId(null)
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
      const res = await fetch(`/api/chat/conversations?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) return
      const data: ApiResponse = await res.json()
      setItems((prev) => {
        const freshIds = new Set(data.items.map((i) => i.id))
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

  // ── read-state ฝั่ง client — บทสนทนาที่เปิดอยู่/เพิ่งเปิดในรอบนี้ต้องเป็น "อ่านแล้ว" ทันที ──
  // (server mark-read ผ่าน POST .../read ที่ ChatThread อยู่แล้ว แต่ list นี้ไม่ได้ refetch ตาม)
  const pathname = usePathname()
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

  const selectedPageName = channels.find((c) => c.id === pageFilter)?.name

  return (
    <div className="card">
      {/* items-stretch: `.card-header` ของ Paces เป็น `flex flex-wrap items-center justify-between`
          (custom/_card.css) — พอ override เป็น flex-col แล้ว `items-center` ที่เหลืออยู่จะบีบทุกแถว
          ให้กว้างเท่าเนื้อหาแล้วจัดกึ่งกลาง (ปุ่มลอยกลาง ไม่ตรงกับแถวรายการข้างล่างที่ชิดซ้าย +
          แถวตัวกรองไม่เต็มความกว้างจน popover ที่อ้าง inset-x-0 แคบตาม) — ต้อง stretch ทับ */}
      <div className="card-header flex flex-col items-stretch gap-3 border-dashed">
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
        <div className="flex items-center gap-1.5 overflow-x-auto" aria-label="ตัวกรองช่องทาง" role="tablist">
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
                className={
                  tab === 'ALL'
                    ? `shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-nowrap ${
                        active ? 'bg-primary text-white' : 'bg-light text-default-700'
                      }`
                    : `flex size-9 shrink-0 items-center justify-center rounded-full ${active ? 'bg-primary/15' : 'bg-light'}`
                }
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

        {/* แถวตัวกรอง — S-7: ปุ่ม "ตัวกรอง" (สถานะ/ผูกลูกค้า/ที่ซ่อน) แสดงเสมอ (ใช้ได้ทุกช่องทาง);
            ตัวกรอง "เพจ" ยังซ่อนเมื่อ tab=Deep (filter ไม่ apply) หรือไม่มีเพจ */}
        {/* relative ที่ "แถว" ไม่ใช่ที่ปุ่ม — popover ของทั้งสองตัวใช้ inset-x-0 อ้างอิงแถวนี้ จึงกว้าง
            เท่าแถวพอดีเสมอ ไม่ล้นออกนอก Chat Rail (320px)/ขอบจอมือถือ (bug จริงบน prod: ล้นแล้ว
            ancestor scroll แนวนอน ทั้งรายการเลื่อนซ้ายค้าง เลื่อนกลับไม่ได้เพราะ scrollbar ถูกซ่อน) */}
        <div className="relative flex flex-wrap items-center gap-2">
          <InboxFilterPanel
            value={filter}
            onChange={(patch) => setFilter((f) => ({ ...f, ...patch }))}
            onClear={() => setFilter(DEFAULT_CHAT_FILTER)}
            open={openPanel === 'filter'}
            onOpenChange={(o) => setOpenPanel(o ? 'filter' : null)}
          />

          {channelTab !== 'DEEP' && channels.length > 0 && (
            <PageFilterDropdown
              value={pageFilter}
              options={channels}
              onChange={setPageFilter}
              open={openPanel === 'page'}
              onOpenChange={(o) => setOpenPanel(o ? 'page' : null)}
            />
          )}

          {/* active-filter chips — x ในตัวเดียวกันคือปุ่มล้างตัวกรองนั้น */}
          {pageFilter && selectedPageName && (
            <span className="badge bg-primary/15 text-primary text-2xs inline-flex items-center gap-1">
              {selectedPageName}
              <button type="button" onClick={() => setPageFilter('')} aria-label="ล้างตัวกรองเพจ" className="inline-flex items-center">
                <Icon icon="x" width={12} height={12} />
              </button>
            </span>
          )}
          {filter.status !== 'open' && (
            <span className="badge bg-primary/15 text-primary text-2xs inline-flex items-center gap-1">
              สถานะ: {filter.status === 'resolved' ? 'ปิดงานแล้ว' : 'ทั้งหมด'}
              <button type="button" onClick={() => setFilter((f) => ({ ...f, status: 'open' }))} aria-label="ล้างตัวกรองสถานะ" className="inline-flex items-center">
                <Icon icon="x" width={12} height={12} />
              </button>
            </span>
          )}
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
        <div className="card-body divide-y divide-default-200 !p-0">
          {items.map((c) => {
            // บทสนทนาที่กำลังเปิดอยู่ = อ่านแล้วเสมอ (ไม่ต้องรอ localReadAt/DB ตามทัน)
            const unreadCount = c.id === activeConversationId ? 0 : unreadCountOf(c, localReadAt[c.id])
            const unread = unreadCount > 0
            const name = c.counterparty?.displayName ?? (c.channel === 'DEEP' ? 'ผู้ซื้อ' : 'ผู้ติดต่อ')
            const preview = c.lastMessagePreview ?? 'เริ่มการสนทนาแล้ว'
            const isResolved = c.resolvedAt !== null
            return (
              // S-7: แยก <Link> (เนื้อหาแถว) ออกจาก kebab (sibling) — nested button ใน anchor เป็น
              // invalid HTML + คลิก kebab จะ propagate ไป navigate. outer div รับ hover ทั้งแถว
              // ปักหมุด (user สั่ง 2026-07-23): แถวที่ปักหมุดพื้นเทาจาง + แถบ accent เหลืองด้านซ้าย
              // (สีเดียวกับดาว) — แถวปกติใส่ border-transparent ความหนาเท่ากันไว้ด้วย ไม่งั้นเนื้อหา
              // ขยับ 2px ตอนกด/เลิกปักหมุด. ลำดับ "ปักหมุดขึ้นบนสุด" backend จัดให้แล้ว (S-7
              // pin-first keyset cursor) ฝั่งนี้ไม่ต้องเรียงซ้ำ
              <div
                key={c.id}
                className={`group relative flex items-stretch border-s-2 ${
                  c.isPinned ? 'border-warning bg-default-100/60 hover:bg-default-100' : 'border-transparent hover:bg-default-100'
                }`}
              >
                {/* ดาวปักหมุด — นอก <Link> (sibling) ด้วยเหตุผลเดียวกับ kebab: ปุ่มซ้อนใน anchor เป็น
                    invalid HTML และคลิกจะ propagate ไป navigate. ปักหมุดแล้ว = ดาวทึบเหลือง,
                    ยังไม่ปัก = ดาวโปร่งจาง ๆ กดเพื่อปักได้ทันที (ไม่ต้องเปิด kebab) */}
                <button
                  type="button"
                  onClick={() => handleRowAction(c.id, c.isPinned ? 'unpin' : 'pin')}
                  disabled={actioningId === c.id}
                  aria-pressed={c.isPinned}
                  aria-label={c.isPinned ? 'เลิกปักหมุดบทสนทนานี้' : 'ปักหมุดบทสนทนานี้'}
                  title={c.isPinned ? 'เลิกปักหมุด' : 'ปักหมุด'}
                  className={`flex shrink-0 items-center px-3 ${
                    c.isPinned ? 'text-warning' : 'text-default-300 hover:text-warning'
                  } ${actioningId === c.id ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <Icon icon={c.isPinned ? 'star-filled' : 'star'} width={18} height={18} />
                </button>

                <Link href={`/inbox/${c.id}`} className="flex min-w-0 flex-1 justify-between gap-3 py-3 pe-3.75 ps-0">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="relative shrink-0">
                      <BuyerAvatar avatar={c.counterparty?.avatar ?? null} name={name} />
                      <ChannelBadgeOverlay channel={c.channel} />
                    </span>
                    {/* น้ำหนัก/สีตัวอักษรตามสถานะอ่าน — ยังไม่อ่าน = เข้ม+หนา, อ่านแล้ว = เทาลง
                        (token Paces ล้วน ไม่มี arbitrary value — HR7) */}
                    <span className="min-w-0 overflow-hidden text-start">
                      <span
                        className={`block truncate text-sm ${
                          unread ? 'text-default-900 font-bold' : 'text-default-600 font-medium'
                        }`}
                      >
                        {name}
                      </span>
                      <span
                        className={`block max-w-52 truncate text-xs ${
                          unread ? 'text-default-800 font-semibold' : 'text-default-400'
                        }`}
                      >
                        {preview}
                      </span>
                    </span>
                  </div>

                  <span className="flex shrink-0 flex-col items-end justify-center gap-1.25">
                    {/* timestamp — สีตามสถานะอ่าน (main); ตัว indicator ปักหมุดย้ายไปเป็นดาวหน้าแถวแล้ว
                        (เดิมเป็นไอคอนหมุดเล็ก ๆ นำหน้าเวลา ซึ่งมองไม่ค่อยเห็นและกดไม่ได้) */}
                    <span className={`text-xs ${unread ? 'text-default-700 font-semibold' : 'text-default-400'}`}>
                      {relativeTimeTh(new Date(c.lastMessageAt).getTime())}
                    </span>
                    {/* resolved กับ unread ไม่โชว์พร้อมกัน (เธรดปิดงานแล้วไม่มี unread ตาม flow) —
                        resolved = badge "ปิดงานแล้ว" (S-7), ไม่งั้น badge จำนวนที่ยังไม่อ่าน (99+, main) */}
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
                </Link>

                {/* kebab actions — นอก Link (sibling) — เหลือเฉพาะ <1024px: จอสัมผัสไม่มี hover
                    จึงต้องมีทางเข้าถึง action แบบกดได้จริง (ชุดปุ่มลอยด้านล่างใช้ไม่ได้บนจอสัมผัส) */}
                <div className="flex items-center pe-2 lg:hidden">
                  <ConversationRowMenu
                    isPinned={c.isPinned}
                    isResolved={isResolved}
                    hiddenContext={filter.hidden}
                    busy={actioningId === c.id}
                    onAction={(a) => handleRowAction(c.id, a)}
                  />
                </div>

                {/* ชุดปุ่มลอย (≥1024px) — โผล่เมื่อ hover แถวนั้น (user สั่ง 2026-07-23: "ปุ่ม action
                    กินพื้นที่เกินไป ให้ปิดงาน/ซ่อน โผล่ตอน hover เป็นลอย ๆ") ปุ่มถาวรกินความกว้าง
                    ถาวรใน rail 320px ซึ่งแคบอยู่แล้ว. absolute + shadow = ลอยทับ timestamp/badge
                    เฉพาะตอน hover ไม่เบียดความกว้างของเนื้อหาแถวเลย
                    ปักหมุดไม่อยู่ในชุดนี้ — ดาวหน้าแถวเห็นตลอดเวลาโดยตั้งใจ (เป็น indicator ด้วย) */}
                <div className="absolute end-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-lg border border-default-200 bg-card p-1 shadow lg:group-hover:flex">
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
                </div>
              </div>
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
    </div>
  )
}
