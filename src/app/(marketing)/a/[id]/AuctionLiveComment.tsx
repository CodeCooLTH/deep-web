'use client'

/**
 * AuctionLiveComment — ชื่อสินค้า + คอมเมนต์บิดล่าสุด 1 รายการ ทับมุมล่างซ้ายของ AuctionHero
 * (feature 00004, Concept 1 redesign 2026-07-02)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/chat/ChatLog.tsx
 *   (comment-bubble + CustomAvatar/getInitials composition — Base เดียวกับที่ AuctionBidHistory.tsx ใช้)
 *   ที่นี่ตัด logic กลุ่ม/scroll ทั้งหมดออก เหลือแค่ 1 bubble (bid ล่าสุด = leader เสมอ เพราะราคาขึ้นทางเดียว)
 *
 * Visual ref (asset เท่านั้น): docs/mockups/auction/buyer-auction-concept1-flow.html .ov/.fcmt
 */
import { useMemo } from 'react'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import CustomAvatar from '@core/components/mui/Avatar'
import { getInitials } from '@/utils/getInitials'
import type { BidDTO } from '@/services/auction.service'
import { fileUrlOf } from '@/lib/file-url'

type Props = {
  title: string
  latestBid: BidDTO | null
}

// helper เวลาสัมพัทธ์ — duplicate เล็ก ๆ ตาม pattern เดิมของ feature นี้ (AuctionBidHistory.tsx มีสำเนาเดียวกัน)
function relativeTimeTh(atMs: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - atMs) / 1000))
  if (diffSec < 60) return 'เมื่อสักครู่'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`
  return `${Math.floor(diffHour / 24)} วันที่แล้ว`
}

export default function AuctionLiveComment({ title, latestBid }: Props) {
  // useMemo กัน react-hooks/purity (ห้ามเรียก Date.now() ตรง ๆ ระหว่าง render) — deps ผูกกับ latestBid?.id
  // เจตนา "คำนวณ now ใหม่เมื่อมี bid ใหม่เข้ามา" ไม่ใช่ใช้ค่า id ในตัว callback เอง จึงต้อง disable exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => Date.now(), [latestBid?.id])

  return (
    <Box sx={{ position: 'absolute', left: 13, right: 66, bottom: 13, zIndex: 5, color: 'common.white' }}>
      <Typography
        sx={{
          fontSize: 15,
          fontWeight: 700,
          textShadow: '0 1px 3px rgba(0,0,0,.5)',
          mb: latestBid ? '9px' : 0,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {title}
      </Typography>

      {latestBid && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <CustomAvatar
            size={23}
            skin="filled"
            color="primary"
            src={latestBid.avatar ? (fileUrlOf(latestBid.avatar)) : undefined}
            sx={{ border: '1.5px solid rgba(255,255,255,.45)', fontSize: 8, flexShrink: 0 }}
          >
            {getInitials(latestBid.bidder)}
          </CustomAvatar>
          <Box
            sx={{
              bgcolor: 'rgba(0,0,0,.44)',
              backdropFilter: 'blur(4px)',
              borderRadius: '13px',
              px: '10px',
              py: '5px',
              fontSize: 11.5,
              lineHeight: 1.25,
              maxWidth: '100%',
            }}
          >
            <Box component="span" sx={{ fontWeight: 700 }}>
              {latestBid.bidder}
            </Box>{' '}
            {/* bid ล่าสุด = ผู้นำเสมอ (ราคาขึ้นทางเดียว) */}
            <Icon icon="tabler-crown" fontSize={12} style={{ color: '#ffd45e', verticalAlign: '-1px' }} />{' '}
            เสนอ ฿{latestBid.amount.toLocaleString()}
            <Box component="span" sx={{ color: 'rgba(255,255,255,.55)', fontSize: 10, ml: '4px' }}>
              · {relativeTimeTh(latestBid.atMs, now)}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
