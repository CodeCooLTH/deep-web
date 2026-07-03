'use client'

/**
 * InboxList — client list component ของ /inbox (feat 00011 Deep Chat, S-11)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ContactList.tsx:44-57
 * (row markup: flex justify-between gap-3 px-3.75 py-3 — avatar + ชื่อ + preview ซ้าย,
 * timestamp + badge ขวา) ตัด SimpleBar (ไม่ split-view กับ ChatPage แล้ว — seller เป็นหน้า
 * list เดี่ยว /inbox แยกจาก thread /inbox/[conversationId])
 *
 * Avatar: reuse pattern BidderAvatar จาก
 * src/app/(paces)/seller/(dashboard)/auctions/[id]/components/AuctionBidFeed.tsx:55-79
 * (รูปจริง http URL หรือ storage fileId + fallback initials `generateInitials` จาก
 * src/utils/helpers.ts — เหมือน Base ContactList.tsx ที่ import ตัวเดียวกัน)
 *
 * Pagination: sentinel + IntersectionObserver — pattern
 * src/app/(paces)/seller/(dashboard)/notifications/components/NotificationFeed.tsx:242-252
 * ผูกกับ cursor pagination จริงของ GET /api/chat/conversations (ไม่ใช่ reveal local array)
 *
 * Unread: `badge bg-danger text-white text-2xs` (UX-Design-Spec.md S2) เมื่อ
 * shopLastReadAt===null || lastMessageAt>shopLastReadAt — badge แสดง "ใหม่" (ไม่มี unread
 * message COUNT ต่อ conversation ใน data model นี้ มีแค่ read-state ระดับห้อง — BR-CHAT-09)
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { generateInitials } from '@/utils/helpers'
import { relativeTimeTh } from '@/lib/relative-time-th'
import { pacesToast } from '@/lib/paces-toast'
import SellerEmptyState from '../../_shared/SellerEmptyState'

export type ConversationListItem = {
  id: string
  buyerUserId: string
  shopId: string
  lastMessageAt: string
  lastMessagePreview: string | null
  lastSenderRole: 'BUYER' | 'SHOP' | null
  buyerLastReadAt: string | null
  shopLastReadAt: string | null
  createdAt: string
  counterparty: { displayName: string; avatar: string | null } | null
}

type ApiResponse = { items: ConversationListItem[]; nextCursor: string | null }

function isUnread(c: ConversationListItem): boolean {
  return c.shopLastReadAt === null || new Date(c.lastMessageAt) > new Date(c.shopLastReadAt)
}

/** avatar ผู้ซื้อ — รูปจริง (http URL หรือ storage fileId) + fallback initials */
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
}

export default function InboxList({ initialItems, initialNextCursor }: Props) {
  const [items, setItems] = useState<ConversationListItem[]>(initialItems)
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadMore = async () => {
    if (!nextCursor || loading) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ cursor: nextCursor, take: '20' })
      const res = await fetch(`/api/chat/conversations?${params.toString()}`)
      if (!res.ok) throw new Error('load-more failed')
      const data: ApiResponse = await res.json()
      setItems((prev) => [...prev, ...data.items])
      setNextCursor(data.nextCursor)
    } catch {
      pacesToast.error('โหลดเพิ่มไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
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

  if (items.length === 0) {
    return (
      <SellerEmptyState
        icon="message-circle"
        title="ยังไม่มีข้อความ"
        description="เมื่อลูกค้าทักแชทมาที่ร้าน จะแสดงในหน้านี้"
      />
    )
  }

  return (
    <div className="card">
      <div className="card-body divide-y divide-default-200 !p-0">
        {items.map((c) => {
          const unread = isUnread(c)
          const name = c.counterparty?.displayName ?? 'ผู้ซื้อ'
          const preview = c.lastMessagePreview ?? 'เริ่มการสนทนาแล้ว'
          return (
            <Link
              key={c.id}
              href={`/inbox/${c.id}`}
              className="hover:bg-default-100 block w-full"
            >
              <div className="flex items-center justify-between gap-3 px-3.75 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <BuyerAvatar avatar={c.counterparty?.avatar ?? null} name={name} />
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
      </div>

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
  )
}
