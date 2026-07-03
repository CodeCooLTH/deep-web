'use client'

/**
 * AuctionBidHistoryModal — bottom sheet "ประวัติการเสนอราคา" ใหม่→เก่า, lazy-load (feature 00004,
 * Concept 1 redesign 2026-07-02)
 *
 * ดูดซับ logic เดิมของ AuctionBidHistory.tsx (reaction toggle, LEVEL_STYLE/AuctionLevel, relative-time,
 * avatar/leader) มาไว้ในนี้ทั้งหมด — ต่างจากเดิมตรงที่เป็น full-screen modal (Drawer 82%h) + infinite-scroll
 * ผ่าน GET /api/app/auctions/{id}/bids?page=N แทนการ slice 5 รายการแรกแบบเดิม (initialBids = SSR ชุดแรก 20
 * รายการ ตรงกับ PAGE_SIZE ของ endpoint พอดี — page 2 คือหน้าถัดไปจริง)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/email/ComposeMail.tsx (Drawer bottom)
 *   + theme/vuexy/typescript-version/full-version/src/views/apps/chat/ChatLog.tsx (comment-bubble feed,
 *   Base เดิมของ AuctionBidHistory.tsx ที่ไฟล์นี้สืบทอด logic มา)
 *
 * Visual ref (asset เท่านั้น): docs/mockups/auction/buyer-auction-concept1-flow.html .sheet (h82%) .bids/.cmt
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

import Drawer from '@mui/material/Drawer'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import CircularProgress from '@mui/material/CircularProgress'
import type { Theme } from '@mui/material/styles'

import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import CustomAvatar from '@core/components/mui/Avatar'
import { getInitials } from '@/utils/getInitials'
import type { BidDTO } from '@/services/auction.service'

type Props = {
  open: boolean
  onClose: () => void
  auctionId: string
  bidCount: number
  /** SSR ชุดแรก (auction.bidHistory จาก getAuctionDetail — top 20 ใหม่→เก่า, ตรงกับ PAGE_SIZE endpoint) */
  initialBids: BidDTO[]
  /** bidHistory[0] ปัจจุบันของ parent — ใช้ตรวจจับ "มี bid ใหม่จาก realtime" เพื่อ prepend เงียบ ๆ */
  latestBid: BidDTO | null
  /** ให้ค่าเฉพาะตอน status==='live' — undefined = ไม่ต้องโชว์ indicator */
  connectionState?: 'live' | 'reconnecting'
}

type ReactionState = { count: number; reacted: boolean }

// mirror src/services/auction.service.ts PAGE_SIZE (spec §Backend contract "PAGE_SIZE 20")
const PAGE_SIZE = 20

// สี badge ต่อ bidder level — สำเนาเดียวกับ AuctionBidHistory.tsx (duplication ตาม pattern เดิมของ feature นี้)
const LEVEL_STYLE: Record<number, { bg: string; color: string }> = {
  5: { bg: 'warning.lighterOpacity', color: 'warning.main' },
  4: { bg: 'info.lighterOpacity', color: 'info.main' },
  3: { bg: 'primary.lighterOpacity', color: 'primary.main' },
  2: { bg: 'action.selected', color: 'text.secondary' },
  1: { bg: 'action.selected', color: 'text.secondary' },
}

function relativeTimeTh(atMs: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - atMs) / 1000))
  if (diffSec < 60) return `${diffSec} วินาทีที่แล้ว`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`
  return `${Math.floor(diffHour / 24)} วันที่แล้ว`
}

export default function AuctionBidHistoryModal({ open, onClose, auctionId, bidCount, initialBids, latestBid, connectionState }: Props) {
  const router = useRouter()
  const { status: sessionStatus } = useSession()
  const now = Date.now()

  const [bids, setBids] = useState<BidDTO[]>(initialBids)
  const [nextPage, setNextPage] = useState<number | null>(initialBids.length >= PAGE_SIZE ? 2 : null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const [reactions, setReactions] = useState<Record<string, ReactionState>>({})
  const [pending, setPending] = useState<Set<string>>(new Set())

  const scrollBoxRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // ทุกครั้งที่เปิด modal ใหม่ → sync กับ initialBids ล่าสุดจาก parent (SSR/realtime state ปัจจุบัน) กัน state ค้าง
  useEffect(() => {
    if (!open) return
    setBids(initialBids)
    setNextPage(initialBids.length >= PAGE_SIZE ? 2 : null)
    setLoadError(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset เฉพาะตอน open เปลี่ยนเป็น true เท่านั้น
  }, [open])

  // seed reaction overlay จาก bids ปัจจุบัน (รายการใหม่ที่โหลดเพิ่ม/prepend ก็ seed ให้ด้วย)
  useEffect(() => {
    setReactions((prev) => {
      const next = { ...prev }
      for (const b of bids) if (!(b.id in next)) next[b.id] = { count: b.reactionCount, reacted: b.reactedByMe }
      return next
    })
  }, [bids])

  // realtime bid ใหม่ระหว่างเปิด modal อยู่ → prepend เงียบ ๆ (resolved decision #8)
  useEffect(() => {
    if (!open || !latestBid) return
    setBids((prev) => (prev[0]?.id === latestBid.id ? prev : [latestBid, ...prev]))
  }, [open, latestBid])

  async function loadMore() {
    if (!nextPage || loadingMore) return
    setLoadingMore(true)
    setLoadError(false)
    try {
      const res = await fetch(`/api/app/auctions/${auctionId}/bids?page=${nextPage}`)
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as { items: BidDTO[]; nextPage: number | null }
      setBids((prev) => [...prev, ...data.items])
      setNextPage(data.nextPage)
    } catch {
      setLoadError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  // infinite scroll — IntersectionObserver บน sentinel ท้ายลิสต์ (root = กล่อง scroll ของ sheet เอง)
  useEffect(() => {
    if (!open || !nextPage) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        // ไม่ auto-retry ตอน error ค้าง — ให้ผู้ใช้กด "ลองใหม่" เอง กัน loop ยิงซ้ำรัว ๆ
        if (entries[0]?.isIntersecting && !loadError) loadMore()
      },
      { root: scrollBoxRef.current, threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ผูก sentinel/nextPage/loadError เท่านั้น กัน re-subscribe ถี่เกิน
  }, [open, nextPage, loadError])

  /** ยังไม่ login → เด้ง sign-in (callbackUrl กลับหน้านี้) — เหมือน AuctionBidHistory.tsx เดิม */
  function requireLogin(): boolean {
    if (sessionStatus !== 'authenticated') {
      router.push(`/auth/sign-in?callbackUrl=${encodeURIComponent(`/a/${auctionId}`)}`)
      return true
    }
    return false
  }

  async function toggleReaction(bidId: string) {
    if (requireLogin()) return
    if (pending.has(bidId)) return
    const cur = reactions[bidId] ?? { count: 0, reacted: false }
    setReactions((r) => ({ ...r, [bidId]: { count: cur.count + (cur.reacted ? -1 : 1), reacted: !cur.reacted } }))
    setPending((p) => new Set(p).add(bidId))
    try {
      const res = await fetch(`/api/auctions/${auctionId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bidId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setReactions((r) => ({ ...r, [bidId]: cur }))
        toast.error(data.error ?? 'ทำรายการไม่สำเร็จ')
        return
      }
      setReactions((r) => ({ ...r, [bidId]: { count: data.reactionCount, reacted: data.reacted } }))
    } catch {
      setReactions((r) => ({ ...r, [bidId]: cur }))
      toast.error('ทำรายการไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setPending((p) => {
        const n = new Set(p)
        n.delete(bidId)
        return n
      })
    }
  }

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            borderRadius: '18px 18px 0 0',
            height: '82%',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: (theme: Theme) => theme.customShadows.xl,
          },
        },
      }}
    >
      <Box sx={{ width: 40, height: 4, borderRadius: 99, bgcolor: 'divider', mx: 'auto', mt: '9px', flexShrink: 0 }} />

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: '16px',
          py: '10px',
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Typography sx={{ fontWeight: 800, fontSize: 15, color: 'text.primary' }}>ประวัติการเสนอราคา ({bidCount})</Typography>
          {connectionState && (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                px: '9px',
                py: '3px',
                borderRadius: 999,
                fontSize: 10.5,
                fontWeight: 700,
                bgcolor: connectionState === 'live' ? 'error.lighterOpacity' : 'action.selected',
                color: connectionState === 'live' ? 'error.main' : 'text.secondary',
              }}
            >
              {connectionState === 'live' && (
                <Box
                  component="span"
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: 'error.main',
                    animation: 'bidHistoryModalPulse 1.4s ease-in-out infinite',
                    '@keyframes bidHistoryModalPulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
                  }}
                />
              )}
              {connectionState === 'live' ? 'สด' : 'กำลังเชื่อมต่อใหม่'}
            </Box>
          )}
        </Box>
        <IconButton onClick={onClose} aria-label="ปิด" size="small" sx={{ bgcolor: 'action.selected', color: 'text.secondary' }}>
          <Icon icon="tabler-x" fontSize={16} />
        </IconButton>
      </Box>

      <Box ref={scrollBoxRef} sx={{ flex: 1, overflowY: 'auto', px: '16px', py: '12px' }}>
        {bids.length === 0 ? (
          <Box sx={{ py: '40px', textAlign: 'center' }}>
            <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>ยังไม่มีผู้เสนอราคา — เป็นคนแรกที่เสนอราคา!</Typography>
          </Box>
        ) : (
          bids.map((bid, idx) => {
            const isLeader = idx === 0 // เรียงใหม่→เก่าเสมอ → รายการแรก = leader เสมอ (ราคาขึ้นทางเดียว)
            return (
              <Box key={bid.id} sx={{ display: 'flex', gap: '10px', py: '9px' }}>
                <CustomAvatar
                  size={32}
                  skin="light"
                  color={isLeader ? 'primary' : undefined}
                  src={bid.avatar ? (bid.avatar.startsWith('http') ? bid.avatar : `/api/files/${bid.avatar}`) : undefined}
                >
                  {getInitials(bid.bidder)}
                </CustomAvatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'inline-block', bgcolor: isLeader ? 'primary.lighterOpacity' : 'action.hover', borderRadius: '10px', px: '11px', py: '7px', maxWidth: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.primary' }}>{bid.bidder}</Typography>
                      <Box
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          bgcolor: LEVEL_STYLE[bid.level.level].bg,
                          color: LEVEL_STYLE[bid.level.level].color,
                          fontSize: 10,
                          fontWeight: 800,
                          px: '7px',
                          py: '1px',
                          borderRadius: 999,
                        }}
                      >
                        <Icon icon={bid.level.icon} fontSize={11} />
                        {bid.level.label}
                      </Box>
                      {isLeader && (
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '3px', bgcolor: 'primary.lighterOpacity', color: 'primary.main', fontSize: 10, fontWeight: 800, px: '7px', py: '1px', borderRadius: 999 }}>
                          <Icon icon="tabler-crown" fontSize={11} />
                          ผู้นำ
                        </Box>
                      )}
                    </Box>
                    <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: '1px' }}>
                      เสนอราคา <b>฿{bid.amount.toLocaleString()}</b>
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mt: '3px', ml: '2px' }}>
                    <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>{relativeTimeTh(bid.atMs, now)}</Typography>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => toggleReaction(bid.id)}
                      disabled={pending.has(bid.id)}
                      sx={{
                        p: 0,
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: 11,
                        fontWeight: 700,
                        color: reactions[bid.id]?.reacted ? 'error.main' : 'text.disabled',
                        '&:disabled': { opacity: 0.6 },
                      }}
                    >
                      <Icon icon={reactions[bid.id]?.reacted ? 'tabler-heart-filled' : 'tabler-heart'} fontSize={13} />
                      ถูกใจ
                      {(reactions[bid.id]?.count ?? 0) > 0 && (
                        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                          {reactions[bid.id]?.count}
                        </Box>
                      )}
                    </Box>
                  </Box>
                </Box>
              </Box>
            )
          })
        )}

        {nextPage && (
          <Box ref={sentinelRef} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', py: '14px' }}>
            {loadError ? (
              <Box
                component="button"
                type="button"
                onClick={loadMore}
                sx={{ border: 'none', background: 'none', cursor: 'pointer', color: 'error.main', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Icon icon="tabler-refresh" fontSize={14} />
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
    </Drawer>
  )
}
