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
import { useState } from 'react'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import CustomAvatar from '@core/components/mui/Avatar'
import { getInitials } from '@/utils/getInitials'
import type { BidDTO } from '@/services/auction.service'

type Props = {
  bidHistory: BidDTO[]
  bidCount: number
  /** ให้ค่าเฉพาะตอน status==='live' — undefined = ไม่ต้องโชว์ indicator (auction ไม่ live) */
  connectionState?: 'live' | 'reconnecting'
}

const VISIBLE_DEFAULT = 5

// สี badge ต่อ bidder level (ladder feat 00002 TFR-016) — buyer Vuexy (hex)
const LEVEL_STYLE: Record<number, { bg: string; color: string }> = {
  5: { bg: '#FEF3C7', color: '#B45309' }, // ตำนาน (gold)
  4: { bg: '#E0F2FE', color: '#0369A1' }, // ระดับเพชร (diamond)
  3: { bg: '#EEF2FF', color: '#4338CA' }, // เซียน
  2: { bg: '#F1F5F9', color: '#475569' }, // นักประมูล
  1: { bg: '#F1F5F9', color: '#94A3B8' }, // มือใหม่
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

export default function AuctionBidHistory({ bidHistory, bidCount, connectionState }: Props) {
  const [expanded, setExpanded] = useState(false)
  const now = Date.now()

  const visible = expanded ? bidHistory : bidHistory.slice(0, VISIBLE_DEFAULT)
  const hiddenCount = bidHistory.length - visible.length

  return (
    <Box sx={{ borderRadius: '12px', boxShadow: '0 1px 2px rgba(15,23,42,.06)', bgcolor: '#fff', overflow: 'hidden' }}>
      {/* header — จำนวนบิด + live indicator */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', px: '16px', pt: '14px', pb: '8px' }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: '#0F172A' }}>
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
              bgcolor: connectionState === 'live' ? '#FEE2E2' : '#F1F5F9',
              color: connectionState === 'live' ? '#DC2626' : '#64748B',
            }}
          >
            {connectionState === 'live' && (
              <Box
                component='span'
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: '#DC2626',
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
          <Typography sx={{ fontSize: 12.5, color: '#94A3B8' }}>
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
                        bgcolor: isLeader ? '#EFF4FF' : '#F8FAFC',
                        borderRadius: '10px',
                        px: '11px',
                        py: '7px',
                        maxWidth: '100%',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>
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
                              bgcolor: '#DBEAFE',
                              color: '#1D4ED8',
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
                      <Typography sx={{ fontSize: 13, color: '#334155', mt: '1px' }}>
                        เสนอราคา <b>฿{bid.amount.toLocaleString()}</b>
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: 10.5, color: '#94A3B8', mt: '3px', ml: '2px' }}>
                      {relativeTimeTh(bid.atMs, now)}
                    </Typography>
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
                borderTop: '1px solid #EEF2F7',
                fontSize: 12,
                fontWeight: 700,
                color: '#2563EB',
                cursor: 'pointer',
                '&:hover': { bgcolor: '#F8FAFC' },
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
