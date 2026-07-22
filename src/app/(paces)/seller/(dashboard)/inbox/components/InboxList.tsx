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
 * ตัวกรอง "เพจ": ใช้ src/components/safepay/FilterDropdown.tsx ตรง (มี Base ผูกอยู่แล้ว)
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
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { generateInitials } from '@/utils/helpers'
import { relativeTimeTh } from '@/lib/relative-time-th'
import { pacesToast } from '@/lib/paces-toast'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import { ChannelBadgeOverlay, getChannelDisplay, type ChatChannel } from './ChannelBadge'

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

/** ตัวเลือกตัวกรอง "เพจ" — 1 ต่อ ShopChannel ที่เชื่อมไว้ (label ผสม provider ไว้แล้วที่ page.tsx) */
export type ChannelFilterOption = { id: string; label: string }

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
}

export default function InboxList({ initialItems, initialNextCursor, channels }: Props) {
  const [items, setItems] = useState<ConversationListItem[]>(initialItems)
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // ── T3: filter/search state — ขับ tab ด้วย React state เอง (ไม่ใช้ data-hs-tab) ──
  const [channelTab, setChannelTab] = useState<ChannelTab>('ALL')
  const [pageFilter, setPageFilter] = useState('') // shopChannelId, '' = ทุกเพจ
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const isFirstRun = useRef(true)

  // debounce ช่องค้นหา client-side ก่อนยิง ?q=
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

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
    setSearchInput('')
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

  const selectedPageLabel = channels.find((c) => c.id === pageFilter)?.label

  return (
    <div className="card">
      <div className="card-header flex flex-col gap-3 border-dashed">
        {/* ช่องค้นหา — Base ContactList.tsx:19-24 */}
        <div className="input-icon-group">
          <Icon icon="search" className="input-icon" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="ค้นหาชื่อ ลูกค้า เบอร์ หรือข้อความในแชท"
            className="form-input bg-light/30"
          />
        </div>

        {/* channel tabs — React state ขับ active เอง ไม่ใช้ data-hs-tab (ดู comment หัวไฟล์) */}
        <nav className="nav-tabs overflow-x-auto" aria-label="ตัวกรองช่องทาง" role="tablist">
          {CHANNEL_TABS.map((tab) => {
            const active = channelTab === tab
            const display = tab === 'ALL' ? null : getChannelDisplay(tab)
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleChannelTabChange(tab)}
                className={`nav-link text-nowrap ${active ? 'border-b border-primary text-primary' : ''}`}
              >
                {display && (
                  <Icon
                    icon={display.icon}
                    width={14}
                    height={14}
                    className={`me-1 inline-block align-text-bottom ${display.iconClassName ?? ''}`}
                    style={display.iconStyle}
                  />
                )}
                {tab === 'ALL' ? 'ทั้งหมด' : display!.label}
              </button>
            )
          })}
        </nav>

        {/* ตัวกรอง "เพจ" — ซ่อนเมื่อ tab=Deep (filter ไม่ apply) หรือไม่มีเพจให้เลือก */}
        {channelTab !== 'DEEP' && channels.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              icon="filter"
              value={pageFilter}
              options={[{ value: '', label: 'ทุกเพจ' }, ...channels.map((c) => ({ value: c.id, label: c.label }))]}
              onChange={setPageFilter}
              defaultLabel="เพจ"
              resetValue=""
              className="btn-sm"
            />

            {/* active-filter chip — x ในตัวเดียวกันคือปุ่มล้างตัวกรองนั้น */}
            {pageFilter && selectedPageLabel && (
              <span className="badge bg-primary/15 text-primary text-2xs inline-flex items-center gap-1">
                {selectedPageLabel}
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
