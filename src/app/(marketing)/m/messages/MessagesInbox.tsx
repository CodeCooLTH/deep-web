'use client'

// กล่องข้อความ (mobile) — rebuild เป็นแถว full-bleed แตะง่าย. reuse API เดิม:
// GET /api/chat/conversations?cursor= (cursor pagination + infinite scroll). ไม่มี realtime (เบา).
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

import CustomAvatar from '@core/components/mui/Avatar'
import { formatTimeHM, formatDateTH } from '@/lib/format-date'

type SenderRole = 'BUYER' | 'SHOP'
type ConversationListItem = {
  id: string
  shopId: string
  lastMessageAt: string
  lastMessagePreview: string | null
  lastSenderRole: SenderRole | null
  buyerLastReadAt: string | null
  counterparty: { shopName: string; logo: string | null } | null
}

const isUnread = (it: ConversationListItem) =>
  it.lastSenderRole === 'SHOP' && (it.buyerLastReadAt === null || it.lastMessageAt > it.buyerLastReadAt)

// วันนี้ → เวลา HH:mm, ไม่ใช่วันนี้ → วันที่ไทย
const inboxTime = (iso: string) => {
  const d = new Date(iso)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  return sameDay ? formatTimeHM(iso) : formatDateTH(iso)
}

export default function MessagesInbox() {
  const [items, setItems] = useState<ConversationListItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (cursor?: string) => {
    const url = cursor
      ? `/api/chat/conversations?cursor=${encodeURIComponent(cursor)}`
      : '/api/chat/conversations'
    const res = await fetch(url)
    if (!res.ok) throw new Error()
    return (await res.json()) as { items: ConversationListItem[]; nextCursor: string | null }
  }, [])

  useEffect(() => {
    let alive = true
    setInitialLoading(true)
    setError(false)
    load()
      .then(d => {
        if (!alive) return
        setItems(d.items)
        setNextCursor(d.nextCursor)
      })
      .catch(() => alive && setError(true))
      .finally(() => alive && setInitialLoading(false))
    return () => {
      alive = false
    }
  }, [load])

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const d = await load(nextCursor)
      setItems(prev => [...prev, ...d.items])
      setNextCursor(d.nextCursor)
    } catch {
      /* เงียบไว้ — แถว sentinel จะลองใหม่เมื่อ scroll */
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore, load])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !nextCursor) return
    const ob = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '200px' }
    )
    ob.observe(el)
    return () => ob.disconnect()
  }, [nextCursor, loadMore])

  if (initialLoading) {
    return (
      <div className='flex flex-col gap-2 pbs-2'>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className='flex items-center gap-3 plb-3'>
            <span className='size-12 rounded-full bg-[var(--mui-palette-action-hover)] shrink-0' />
            <div className='flex-1 flex flex-col gap-1.5'>
              <span className='h-3 w-1/3 rounded bg-[var(--mui-palette-action-hover)]' />
              <span className='h-2.5 w-2/3 rounded bg-[var(--mui-palette-action-hover)]' />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className='flex flex-col items-center gap-2 pbs-16 text-center'>
        <i className='tabler-alert-circle text-[32px] text-[var(--mui-palette-error-main)]' />
        <p className='text-[14px] m-0 text-[var(--mui-palette-text-secondary)]'>โหลดข้อความไม่สำเร็จ</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center gap-2 pbs-16 pbe-10 text-center'>
        <div className='size-16 rounded-full bg-[var(--mui-palette-action-hover)] flex items-center justify-center'>
          <i className='tabler-message-2 text-[28px] text-[var(--mui-palette-text-disabled)]' />
        </div>
        <p className='text-[14px] m-0 text-[var(--mui-palette-text-secondary)]'>ยังไม่มีข้อความ</p>
        <p className='text-[12px] m-0 text-[var(--mui-palette-text-disabled)]'>เริ่มแชทกับร้านค้าได้จากหน้าโปรไฟล์ร้าน</p>
      </div>
    )
  }

  return (
    <div className='flex flex-col -mx-4'>
      {items.map(it => {
        const unread = isUnread(it)
        const name = it.counterparty?.shopName ?? 'ร้านค้า'
        const preview =
          it.lastMessagePreview === null
            ? 'ยังไม่มีข้อความ'
            : it.lastSenderRole === 'BUYER'
              ? `คุณ: ${it.lastMessagePreview}`
              : it.lastMessagePreview
        return (
          <Link
            key={it.id}
            href={`/messages/${it.shopId}`}
            className='flex items-center gap-3 pli-4 plb-3 no-underline border-b border-[var(--mui-palette-divider)] active:bg-[var(--mui-palette-action-hover)] transition-colors'
          >
            <CustomAvatar src={it.counterparty?.logo ? `/api/files/${it.counterparty.logo}` : undefined} size={48}>
              {name.slice(0, 1)}
            </CustomAvatar>
            <div className='flex-1 min-w-0'>
              <div className='flex items-center justify-between gap-2'>
                <span
                  className={`text-[14px] truncate ${unread ? 'font-bold text-[var(--mui-palette-text-primary)]' : 'font-medium text-[var(--mui-palette-text-primary)]'}`}
                >
                  {name}
                </span>
                <span className='text-[11px] text-[var(--mui-palette-text-disabled)] shrink-0'>{inboxTime(it.lastMessageAt)}</span>
              </div>
              <div className='flex items-center gap-2 mbs-0.5'>
                <p
                  className={`flex-1 min-w-0 truncate text-[13px] m-0 ${unread ? 'text-[var(--mui-palette-text-primary)] font-medium' : 'text-[var(--mui-palette-text-secondary)]'}`}
                >
                  {preview}
                </p>
                {unread && <span className='size-2 rounded-full bg-[var(--mui-palette-primary-main)] shrink-0' />}
              </div>
            </div>
          </Link>
        )
      })}

      {nextCursor && <div ref={sentinelRef} className='h-10 flex items-center justify-center'>
        {loadingMore && <i className='tabler-loader-2 animate-spin text-[20px] text-[var(--mui-palette-text-disabled)]' />}
      </div>}
    </div>
  )
}
