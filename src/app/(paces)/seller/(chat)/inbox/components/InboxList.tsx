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
 * Unread: `badge bg-danger text-white text-2xs` (UX-Design-Spec.md S2) เมื่อ
 * shopLastReadAt===null || lastMessageAt>shopLastReadAt — badge แสดง "ใหม่" (ไม่มี unread
 * message COUNT ต่อ conversation ใน data model นี้ มีแค่ read-state ระดับห้อง — BR-CHAT-09)
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
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { generateInitials } from '@/utils/helpers'
import { relativeTimeTh } from '@/lib/relative-time-th'
import { pacesToast } from '@/lib/paces-toast'
import { useChatSearchQuery } from '@/context/useChatSearchContext'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import PageFilterDropdown from './PageFilterDropdown'
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
  counterparty: { displayName: string; avatar: string | null } | null
}

// ตัวเลือกตัวกรอง "เพจ" — ย้ายนิยามไป ChannelBadge.tsx แล้ว (feat 00018 งาน 2: PageFilterDropdown
// ต้องใช้ type เดียวกัน ไม่อยาก import ย้อนจากไฟล์นี้จนวนเป็น circular import) — re-export ไว้ที่นี่
// เพื่อไม่ต้องแก้ import ที่ page.tsx/ChatRail.tsx (ยังเรียก `from './components/InboxList'` เดิม)
export type { ChannelFilterOption } from './ChannelBadge'

type ApiResponse = { items: ConversationListItem[]; nextCursor: string | null }

/** tab ตัวกรองช่องทาง — 'ALL' ไม่ใช่ ChatChannel จริง จึงแยก union เพิ่ม */
type ChannelTab = 'ALL' | ChatChannel
const CHANNEL_TABS: ChannelTab[] = ['ALL', 'DEEP', 'MESSENGER', 'INSTAGRAM']

function isUnread(c: ConversationListItem): boolean {
  return c.shopLastReadAt === null || new Date(c.lastMessageAt) > new Date(c.shopLastReadAt)
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
}

export default function InboxList({ initialItems, initialNextCursor, channels, railMode = false }: Props) {
  const [items, setItems] = useState<ConversationListItem[]>(initialItems)
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // ── T3: filter/search state — ขับ tab ด้วย React state เอง (ไม่ใช้ data-hs-tab) ──
  const [channelTab, setChannelTab] = useState<ChannelTab>('ALL')
  const [pageFilter, setPageFilter] = useState('') // shopChannelId, '' = ทุกเพจ

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
  }, [channelTab, pageFilter, debouncedQuery])

  // สลับ tab ช่องทาง — เมื่อกลับไป Deep ต้องล้างตัวกรองเพจไปด้วย (filter ไม่ apply กับ Deep)
  const handleChannelTabChange = (tab: ChannelTab) => {
    setChannelTab(tab)
    if (tab === 'DEEP') setPageFilter('')
  }

  const clearFilters = () => {
    setChannelTab('ALL')
    setPageFilter('')
    if (railMode) chatSearchQuery.setSearchInput('')
    else setLocalSearchInput('')
  }

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
      <div className="card-header flex flex-col gap-3 border-dashed">
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

        {/* ตัวกรอง "เพจ" — ซ่อนเมื่อ tab=Deep (filter ไม่ apply) หรือไม่มีเพจให้เลือก
            feat 00018 งาน 2: FilterDropdown ธรรมดา → PageFilterDropdown (search + radio + avatar) */}
        {channelTab !== 'DEEP' && channels.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <PageFilterDropdown value={pageFilter} options={channels} onChange={setPageFilter} />

            {/* active-filter chip — x ในตัวเดียวกันคือปุ่มล้างตัวกรองนั้น */}
            {pageFilter && selectedPageName && (
              <span className="badge bg-primary/15 text-primary text-2xs inline-flex items-center gap-1">
                {selectedPageName}
                <button
                  type="button"
                  onClick={() => setPageFilter('')}
                  aria-label="ล้างตัวกรองเพจ"
                  className="inline-flex items-center"
                >
                  <Icon icon="x" width={12} height={12} />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card-body">
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
        </div>
      ) : (
        <div className="card-body divide-y divide-default-200 !p-0">
          {items.map((c) => {
            const unread = isUnread(c)
            const name = c.counterparty?.displayName ?? (c.channel === 'DEEP' ? 'ผู้ซื้อ' : 'ผู้ติดต่อ')
            const preview = c.lastMessagePreview ?? 'เริ่มการสนทนาแล้ว'
            return (
              <Link
                key={c.id}
                href={`/inbox/${c.id}`}
                className="hover:bg-default-100 block w-full"
              >
                {/* row — Base ContactList.tsx:44 `flex justify-between gap-3 px-3.75 py-3` (ไม่มี
                    items-center บน outer row — child ทั้งสองฝั่งมี items-center/items-end ของตัวเองแล้ว) */}
                <div className="flex justify-between gap-3 px-3.75 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="relative shrink-0">
                      <BuyerAvatar avatar={c.counterparty?.avatar ?? null} name={name} />
                      <ChannelBadgeOverlay channel={c.channel} />
                    </span>
                    <span className="min-w-0 overflow-hidden text-start">
                      <span className="text-default-900 block truncate text-sm font-semibold">{name}</span>
                      <span className="text-default-400 block max-w-52 truncate text-xs">{preview}</span>
                    </span>
                  </div>

                  <span className="flex shrink-0 flex-col items-end justify-center gap-1.25">
                    <span className="text-default-400 text-xs">
                      {relativeTimeTh(new Date(c.lastMessageAt).getTime())}
                    </span>
                    {unread && (
                      <span className="badge text-2xs bg-danger text-white">ใหม่</span>
                    )}
                  </span>
                </div>
              </Link>
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
