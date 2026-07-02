'use client'

/**
 * AuctionBidHistory — รายการการเสนอราคา (feature 00004)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/chat/ChatLog.tsx
 *   - bubble ต่อรายการ + avatar ซ้าย (CustomAvatar initials fallback ตาม pattern ที่ ChatLog ใช้
 *     `getInitials` + `CustomAvatar` เมื่อไม่มีรูป avatar จริง) → PublicAuctionDTO.bidHistory ไม่มี
 *     avatar url เลย (privacy) จึงใช้ initials เสมอ. FB icon overlay ยังตัดอยู่ (avatar/provider = privacy §5.5)
 *
 * bidder level badge: เพิ่มกลับแล้ว (BidDTO.level จาก successfulBidCount ladder, feat 00002 TFR-016) —
 *   level = reputation ไม่ใช่ PII. FB icon/avatar ยังไม่ทำ (ต้อง product review §5.5 privacy)
 *
 * Visual ref (asset เท่านั้น): docs/mockups/auction/seller-auction-v1.html .stream/.cmt
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import CustomAvatar from '@core/components/mui/Avatar'
import { getInitials } from '@/utils/getInitials'
import type { BidDTO } from '@/services/auction.service'

type Props = {
  auctionId: string
  bidHistory: BidDTO[]
  bidCount: number
  /** ให้ค่าเฉพาะตอน status==='live' — undefined = ไม่ต้องโชว์ indicator (auction ไม่ live) */
  connectionState?: 'live' | 'reconnecting'
}

type ReactionState = { count: number; reacted: boolean }

const VISIBLE_DEFAULT = 5

// สี badge ต่อ bidder level (ladder feat 00002 TFR-016) — buyer Vuexy theme tokens
const LEVEL_STYLE: Record<number, { bg: string; color: string }> = {
  5: { bg: 'warning.lighterOpacity', color: 'warning.main' }, // ตำนาน (gold)
  4: { bg: 'info.lighterOpacity', color: 'info.main' }, // ระดับเพชร (diamond)
  3: { bg: 'primary.lighterOpacity', color: 'primary.main' }, // เซียน
  2: { bg: 'action.selected', color: 'text.secondary' }, // นักประมูล
  1: { bg: 'action.selected', color: 'text.secondary' }, // มือใหม่
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

export default function AuctionBidHistory({ auctionId, bidHistory, bidCount, connectionState }: Props) {
  const [expanded, setExpanded] = useState(false)
  const router = useRouter()
  const { status: sessionStatus } = useSession()
  const now = Date.now()

  // reaction overlay (optimistic) — seed จาก props, re-sync เมื่อ parent refetch (bidHistory เปลี่ยน)
  const [reactions, setReactions] = useState<Record<string, ReactionState>>({})
  useEffect(() => {
    const seed: Record<string, ReactionState> = {}
    for (const b of bidHistory) seed[b.id] = { count: b.reactionCount, reacted: b.reactedByMe }
    setReactions(seed)
  }, [bidHistory])

  const [pending, setPending] = useState<Set<string>>(new Set())

  async function toggleReaction(bidId: string) {
    // ยังไม่ login → เด้ง sign-in (callbackUrl กลับหน้านี้) — FR-REACT-01-AC-02
    if (sessionStatus !== 'authenticated') {
      router.push(`/auth/sign-in?callbackUrl=${encodeURIComponent(`/a/${auctionId}`)}`)
      return
    }
    if (pending.has(bidId)) return
    const cur = reactions[bidId] ?? { count: 0, reacted: false }
    // optimistic toggle
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
        setReactions((r) => ({ ...r, [bidId]: cur })) // revert
        toast.error(data.error ?? 'ทำรายการไม่สำเร็จ')
        return
      }
      // reconcile กับค่าจริงจาก server
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

  const visible = expanded ? bidHistory : bidHistory.slice(0, VISIBLE_DEFAULT)
  const hiddenCount = bidHistory.length - visible.length

  return (
    <Box
      sx={{
        borderRadius: '12px',
        boxShadow: (theme) => theme.customShadows.xs,
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      {/* header — จำนวนบิด + live indicator */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', px: '16px', pt: '14px', pb: '8px' }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: 'text.primary' }}>
          การเสนอราคา ({bidCount})
        </Typography>
        {connectionState && (
          <Box
            sx={{
              ml: 'auto',
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
                component='span'
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: 'error.main',
                  animation: 'bidHistoryPulse 1.4s ease-in-out infinite',
                  '@keyframes bidHistoryPulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
                }}
              />
            )}
            {connectionState === 'live' ? 'สด' : 'กำลังเชื่อมต่อใหม่'}
          </Box>
        )}
      </Box>

      {/* empty state */}
      {bidHistory.length === 0 ? (
        <Box sx={{ px: '16px', pb: '18px', textAlign: 'center' }}>
          <Typography sx={{ fontSize: 12.5, color: 'text.disabled' }}>
            ยังไม่มีผู้เสนอราคา — เป็นคนแรกที่เสนอราคา!
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ px: '16px', pb: '8px' }}>
            {visible.map((bid, idx) => {
              const isLeader = idx === 0 // bidHistory เรียง createdAt desc → รายการแรก = leader เสมอ (ราคาขึ้นทางเดียว)
              return (
                <Box key={bid.id} sx={{ display: 'flex', gap: '10px', py: '9px' }}>
                  {/* avatar จริง (MUI Avatar fallback children=initials อัตโนมัติเมื่อ src null/โหลดพลาด) */}
                  <CustomAvatar
                    size={32}
                    skin='light'
                    color={isLeader ? 'primary' : undefined}
                    src={bid.avatar ? (bid.avatar.startsWith('http') ? bid.avatar : `/api/files/${bid.avatar}`) : undefined}
                  >
                    {getInitials(bid.bidder)}
                  </CustomAvatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                      sx={{
                        display: 'inline-block',
                        bgcolor: isLeader ? 'primary.lighterOpacity' : 'action.hover',
                        borderRadius: '10px',
                        px: '11px',
                        py: '7px',
                        maxWidth: '100%',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.primary' }}>
                          {bid.bidder}
                        </Typography>
                        {/* bidder level badge (ladder จาก successfulBidCount, TFR-016) */}
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
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              bgcolor: 'primary.lighterOpacity',
                              color: 'primary.main',
                              fontSize: 10,
                              fontWeight: 800,
                              px: '7px',
                              py: '1px',
                              borderRadius: 999,
                            }}
                          >
                            <Icon icon='tabler-crown' fontSize={11} />
                            ผู้นำ
                          </Box>
                        )}
                      </Box>
                      <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: '1px' }}>
                        เสนอราคา <b>฿{bid.amount.toLocaleString()}</b>
                      </Typography>
                    </Box>
                    {/* meta row: เวลา · ถูกใจ (toggle) · count (feat 00005) */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mt: '3px', ml: '2px' }}>
                      <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>
                        {relativeTimeTh(bid.atMs, now)}
                      </Typography>
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
            })}
          </Box>

          {/* expand/collapse */}
          {bidHistory.length > VISIBLE_DEFAULT && (
            <Box
              onClick={() => setExpanded((v) => !v)}
              sx={{
                textAlign: 'center',
                py: '11px',
                borderTop: '1px solid',
                borderTopColor: 'divider',
                fontSize: 12,
                fontWeight: 700,
                color: 'primary.main',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Icon icon={expanded ? 'tabler-chevron-up' : 'tabler-chevron-down'} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {expanded ? 'ย่อ' : `ดูการเสนอราคาก่อนหน้า (${hiddenCount})`}
            </Box>
          )}
        </>
      )}
    </Box>
  )
}
