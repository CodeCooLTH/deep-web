'use client'

/**
 * AuctionHero — รูปหลัก + scrim + ชื่อ + status badge + ปุ่มย้อนกลับ (feature 00004)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx
 *   - CardMedia banner (bs-[250px]) → รูป auction เต็มความกว้าง + gradient scrim ทับด้านล่างให้อ่านชื่อออก
 *   - frosted back button → pattern เดียวกับ src/app/(marketing)/o/[token]/OrderDetailMobile.tsx (banner back button)
 *
 * Visual ref (asset เท่านั้น ไม่ copy layout ดิบ): docs/mockups/auction/seller-auction-v1.html
 *   .live-hero (mobile L821-831) / .imm .live-hero (desktop L1337-1347) — เอาแค่ "โครงหน้าตา"
 *   (รูป+scrim+ชื่อ) ไม่เอา viewer-count (ตัดตาม Controller OQ — ไม่มี data)
 */
import Link from 'next/link'

import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import type { PublicAuctionDTO } from '@/services/auction.service'

type Props = {
  title: string
  imageUrl: string
  status: PublicAuctionDTO['status']
}

// ป้ายสถานะ — ตัด "กำลังดู N คน" ออกตาม Controller OQ (ไม่มี viewer data จริง)
const STATUS_BADGE: Record<PublicAuctionDTO['status'], { label: string; bg: string; dot?: string }> = {
  draft: { label: 'ร่าง', bg: 'rgba(100,116,139,.85)' },
  scheduled: { label: 'เร็ว ๆ นี้', bg: 'rgba(37,99,235,.88)' },
  live: { label: 'LIVE', bg: 'rgba(220,38,38,.9)', dot: '#fff' },
  ended: { label: 'จบแล้ว', bg: 'rgba(15,23,42,.82)' },
  unsold: { label: 'ไม่มีผู้ชนะ', bg: 'rgba(100,116,139,.85)' },
  cancelled: { label: 'ยกเลิกแล้ว', bg: 'rgba(100,116,139,.85)' },
}

export default function AuctionHero({ title, imageUrl, status }: Props) {
  const badge = STATUS_BADGE[status]

  // imageUrl จาก DTO เป็น storage key ดิบ (เช่น "xxx.jpeg") — ต้อง prefix /api/files/ เหมือน seller
  // (AuctionRow/ConsoleHead) มิเช่นนั้น browser โหลด url สัมพัทธ์ /a/{key} → 404 → hero ดำ
  const resolvedImg = imageUrl
    ? imageUrl.startsWith('http')
      ? imageUrl
      : `/api/files/${imageUrl}`
    : null

  return (
    <Box
      sx={{
        position: 'relative',
        height: { xs: 300, md: 380 },
        overflow: 'hidden',
        bgcolor: '#0F172A',
        backgroundImage: resolvedImg ? `url("${resolvedImg}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* scrim gradient — ให้ตัวหนังสือขาวอ่านออกบนรูปทุกโทนสี */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,.75) 100%)',
        }}
      />

      {/* frosted back button — pattern เดียวกับ OrderDetailMobile banner back */}
      <Link href='/' style={{ textDecoration: 'none' }}>
        <IconButton
          aria-label='กลับหน้าหลัก'
          title='กลับหน้าหลัก'
          sx={{
            position: 'absolute',
            top: 13,
            left: 13,
            zIndex: 3,
            width: 36,
            height: 36,
            borderRadius: '50%',
            bgcolor: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.6)',
            boxShadow: '0 2px 6px rgba(0,0,0,.12)',
            color: '#0F172A',
            '&:hover': { bgcolor: 'rgba(255,255,255,1)' },
          }}
        >
          <Icon icon='tabler-arrow-left' fontSize={18} />
        </IconButton>
      </Link>

      {/* status badge มุมขวาบน */}
      <Box
        sx={{
          position: 'absolute',
          top: 14,
          right: 14,
          zIndex: 3,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          px: '11px',
          py: '5px',
          borderRadius: 999,
          bgcolor: badge.bg,
          color: '#fff',
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: '0.03em',
        }}
      >
        {badge.dot && (
          <Box
            component='span'
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: badge.dot,
              animation: 'auctionLivePulse 1.4s ease-in-out infinite',
              '@keyframes auctionLivePulse': {
                '0%,100%': { opacity: 1 },
                '50%': { opacity: 0.35 },
              },
            }}
          />
        )}
        {badge.label}
      </Box>

      {/* ชื่อสินค้า — วางบน scrim ล่างสุด */}
      <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, px: '18px', pb: '16px' }}>
        <Typography
          sx={{
            color: '#fff',
            fontSize: { xs: 17, md: 21 },
            fontWeight: 800,
            letterSpacing: '-0.01em',
            lineHeight: 1.3,
            textShadow: '0 1px 3px rgba(0,0,0,.35)',
          }}
        >
          {title}
        </Typography>
      </Box>
    </Box>
  )
}
