'use client'

/**
 * Buyer Inbox — /messages (feature 00011 Deep Chat, S-9)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/chat/SidebarLeft.tsx
 *   (renderChat `<li>` L66-122) — ตัด Drawer/search-Autocomplete/UserProfileLeft ออกทั้งหมด
 *   เพราะหน้านี้เป็น standalone inbox page (ไม่ใช่ split-pane chat app) — page shell ใช้
 *   BuyerAppLayout เดียวกับ /orders (ดู (buyer-app)/layout.tsx)
 * Empty-state: theme ChatContent.tsx:93-111 (CustomAvatar circular + tabler-message-2)
 * Cursor-pagination pattern: AuctionBidHistoryModal.tsx (sentinel + IntersectionObserver)
 *
 * client fetch-based (ไม่ใช่ RSC) ตาม UX-Design-Spec.md S-9 — GET /api/chat/conversations
 * คืน counterparty (B1 route enrich) = shop { shopName, logo } เพราะหน้านี้เป็น buyer surface
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'

import { Icon } from '@iconify/react'

import CustomAvatar from '@core/components/mui/Avatar'
import { getInitials } from '@/utils/getInitials'
import { formatDate, formatTime } from '@/lib/format-date'

type SenderRole = 'BUYER' | 'SHOP'

type ConversationListItem = {
  id: string
  shopId: string
  lastMessageAt: string
  lastMessagePreview: string | null
  lastSenderRole: SenderRole | null
  buyerLastReadAt: string | null
  shopLastReadAt: string | null
  counterparty: { shopName: string; logo: string | null } | null
}

type ListResponse = { items: ConversationListItem[]; nextCursor: string | null }

/** เวลาแถวรายการ — วันนี้โชว์เวลา (formatTime), อื่น ๆ โชว์วันที่ (formatDate); ใช้ format-date.ts เท่านั้น
 *  (ห้าม toLocaleDateString/Intl.DateTimeFormat เองตาม convention — Date.toDateString() ที่นี่ใช้แค่เทียบ "วันนี้ไหม") */
function formatInboxTime(iso: string): string {
  const d = new Date(iso)
  const isToday = d.toDateString() === new Date().toDateString()
  return isToday ? formatTime(d) : formatDate(d)
}

function isUnread(item: ConversationListItem): boolean {
  return item.lastSenderRole === 'SHOP' && (item.buyerLastReadAt === null || item.lastMessageAt > item.buyerLastReadAt)
}

export default function BuyerMessagesPage() {
  const [items, setItems] = useState<ConversationListItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async (cursor?: string) => {
    const qs = new URLSearchParams()
    if (cursor) qs.set('cursor', cursor)
    const res = await fetch(`/api/chat/conversations?${qs.toString()}`)
    if (!res.ok) throw new Error('load failed')
    return (await res.json()) as ListResponse
  }, [])

  // โหลดหน้าแรก
  useEffect(() => {
    let cancelled = false
    setInitialLoading(true)
    setError(false)
    load()
      .then((data) => {
        if (cancelled) return
        setItems(data.items)
        setNextCursor(data.nextCursor)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setInitialLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [load])

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setError(false)
    try {
      const data = await load(nextCursor)
      setItems((prev) => [...prev, ...data.items])
      setNextCursor(data.nextCursor)
    } catch {
      setError(true)
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore, load])

  // infinite scroll — sentinel ท้ายลิสต์, root = viewport (หน้า standalone ไม่มีกล่อง scroll ของตัวเอง)
  useEffect(() => {
    if (!nextCursor) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !error) loadMore()
      },
      { threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ผูก sentinel/nextCursor/error เท่านั้น
  }, [nextCursor, error, loadMore])

  const retryInitial = () => {
    setError(false)
    setInitialLoading(true)
    load()
      .then((data) => {
        setItems(data.items)
        setNextCursor(data.nextCursor)
      })
      .catch(() => setError(true))
      .finally(() => setInitialLoading(false))
  }

  return (
    <Box>
      <Typography variant='h5' sx={{ mb: 4 }}>
        ข้อความ
      </Typography>

      {initialLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={28} />
        </Box>
      ) : error && items.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 8 }}>
          <Typography color='text.secondary'>โหลดข้อความไม่สำเร็จ</Typography>
          <Box
            component='button'
            type='button'
            onClick={retryInitial}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'primary.main',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            <Icon icon='tabler-refresh' fontSize={16} />
            ลองใหม่
          </Box>
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px', py: 10 }}>
          <CustomAvatar variant='circular' size={98} color='primary' skin='light'>
            <Icon icon='tabler-message-2' fontSize={50} />
          </CustomAvatar>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 600 }}>ยังไม่มีข้อความ</Typography>
            <Typography color='text.secondary' sx={{ fontSize: 14 }}>
              เริ่มแชทกับร้านค้าได้จากหน้าโปรไฟล์ร้านค้า
            </Typography>
          </Box>
        </Box>
      ) : (
        <Box component='ul' sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {items.map((item) => {
            const shopName = item.counterparty?.shopName ?? 'ร้านค้า'
            const logo = item.counterparty?.logo
            const preview =
              item.lastMessagePreview === null
                ? 'ยังไม่มีข้อความ'
                : item.lastSenderRole === 'BUYER'
                  ? `คุณ: ${item.lastMessagePreview}`
                  : item.lastMessagePreview
            const unread = isUnread(item)

            return (
              <Box component='li' key={item.id}>
                <Link href={`/messages/${item.shopId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      py: '12px',
                      px: '4px',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <CustomAvatar src={logo ? `/api/files/${logo}` : undefined} skin='light' size={44}>
                      {getInitials(shopName)}
                    </CustomAvatar>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontWeight: unread ? 700 : 500 }} className='truncate'>
                        {shopName}
                      </Typography>
                      <Typography
                        variant='body2'
                        color={unread ? 'text.primary' : 'text.secondary'}
                        className='truncate'
                      >
                        {preview}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                      <Typography variant='caption' color='text.disabled'>
                        {formatInboxTime(item.lastMessageAt)}
                      </Typography>
                      {unread && (
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />
                      )}
                    </Box>
                  </Box>
                </Link>
              </Box>
            )
          })}

          {nextCursor && (
            <Box ref={sentinelRef} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', py: '14px' }}>
              {error ? (
                <Box
                  component='button'
                  type='button'
                  onClick={loadMore}
                  sx={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: 'error.main',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Icon icon='tabler-refresh' fontSize={14} />
                  โหลดไม่สำเร็จ ลองใหม่
                </Box>
              ) : (
                <>
                  <CircularProgress size={16} />
                  <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>กำลังโหลดเพิ่ม…</Typography>
                </>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
