'use client'

/**
 * ChatWidgetList — list view ของ ChatWidget panel (feat 00011 Deep Chat, ChatWidget task)
 *
 * copy row markup จาก ../inbox/components/InboxList.tsx — เปลี่ยน `Link href` เป็น
 * `button onClick` (ไม่ navigate เต็มหน้า เปิด thread view ในตัว panel แทน) + ตัด `.card` นอก
 * (SellerChatWidget เป็นคนวาด `.card` ครอบ panel ทั้งก้อนอยู่แล้ว) (UX-Design-Spec-Bubble.md
 * "List view (2 skin)")
 *
 * fetch เอง (ไม่รับ initial data จาก server เหมือน InboxList เพราะ widget เป็น client component
 * mount ที่ layout ไม่มี RSC parent ส่ง props มาให้) — เรียก GET /api/chat/conversations ตรง ๆ
 * (endpoint เดิม role แยกตาม subdomain header อยู่แล้ว ไม่ต้องส่ง shopId เอง)
 */
import { useEffect, useRef, useState } from 'react'
import { generateInitials } from '@/utils/helpers'
import { relativeTimeTh } from '@/lib/relative-time-th'
import { pacesToast } from '@/lib/paces-toast'
import SellerEmptyState from './SellerEmptyState'
import SellerErrorState from './SellerErrorState'
import { toFileUrl } from '@/lib/file-url'

export type ConversationListItem = {
  id: string
  // feature 00018: เธรดจากช่องทางนอก (Messenger/IG) ไม่มี User ในระบบ → null ได้
  // type นี้เป็น shape ของ JSON จาก /api/chat/conversations ที่ TS ตรวจข้ามฝั่งให้ไม่ได้
  // จึงต้องแก้ตามด้วยมือให้ตรง reality ไม่งั้นเป็นระเบิดเวลาเมื่อมีคนเริ่มอ่าน field นี้
  buyerUserId: string | null
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

/** avatar ผู้ซื้อ — copy ตรงจาก InboxList.tsx BuyerAvatar (duplicate เล็ก ๆ ตาม convention เดิม) */
function BuyerAvatar({ avatar, name }: { avatar: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  const src = avatar ? (toFileUrl(avatar)) : null
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
  /** เลือกห้อง — parent (SellerChatWidget) สลับไป view='thread' + ลด unread count ถ้าห้องนั้น unread */
  onSelect: (conversation: ConversationListItem) => void
}

export default function ChatWidgetList({ onSelect }: Props) {
  const [items, setItems] = useState<ConversationListItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [errorState, setErrorState] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // ── initial load — ทุกครั้งที่ panel เปิด list view (mount) ──────────────
  useEffect(() => {
    let cancelled = false
    async function loadInitial() {
      setLoadingInitial(true)
      setErrorState(false)
      try {
        const res = await fetch('/api/chat/conversations?take=20')
        if (!res.ok) throw new Error('load failed')
        const data: ApiResponse = await res.json()
        if (cancelled) return
        setItems(data.items)
        setNextCursor(data.nextCursor)
      } catch {
        if (!cancelled) setErrorState(true)
      } finally {
        if (!cancelled) setLoadingInitial(false)
      }
    }
    loadInitial()
    return () => {
      cancelled = true
    }
  }, [])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
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
      setLoadingMore(false)
    }
  }

  // sentinel — re-attach ทุกครั้งที่ items เปลี่ยน (pattern เดียวกับ InboxList.tsx)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMore ผูก closure ของ nextCursor/loadingMore ปัจจุบันอยู่แล้ว
  }, [items.length, nextCursor])

  if (errorState) {
    // compact=ตัด .card นอก (SellerChatWidget ครอบ .card ของ panel อยู่แล้ว)
    return (
      <div className="flex h-full items-center">
        <SellerErrorState compact message="โหลดข้อความไม่สำเร็จ ลองใหม่อีกครั้ง" />
      </div>
    )
  }

  if (loadingInitial) {
    return (
      <div className="flex h-full items-center justify-center">
        <div
          className="border-primary size-7 animate-spin rounded-full border-2 border-t-transparent"
          role="status"
          aria-label="กำลังโหลด"
        />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center">
        <SellerEmptyState
          compact
          icon="message-circle"
          title="ยังไม่มีข้อความ"
          description="เมื่อลูกค้าทักแชทมาที่ร้าน จะแสดงในหน้านี้"
        />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto divide-y divide-default-200">
      {items.map((c) => {
        const unread = isUnread(c)
        const name = c.counterparty?.displayName ?? 'ผู้ซื้อ'
        const preview = c.lastMessagePreview ?? 'เริ่มการสนทนาแล้ว'
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className="hover:bg-default-100 block w-full text-start"
          >
            {/* row — Base ContactList.tsx:44 `flex justify-between gap-3 px-3.75 py-3` (ไม่มี
                items-center บน outer row — child ทั้งสองฝั่งมี items-center/items-end ของตัวเองแล้ว) */}
            <div className="flex justify-between gap-3 px-3.75 py-3">
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
                {unread && <span className="badge text-2xs bg-danger text-white">ใหม่</span>}
              </span>
            </div>
          </button>
        )
      })}

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
