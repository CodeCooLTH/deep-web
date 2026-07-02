'use client'

/**
 * AuctionHero — Concept 1 "Live Commerce" full-bleed image canvas (feature 00004, redesign 2026-07-02)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx
 *   - CardMedia banner (bs-[250px]) → รูป auction เต็มความกว้าง/สูง + gradient scrim ทับบน-ล่างให้อ่านตัวหนังสือออก
 *
 * เดิม (ก่อน redesign) ไฟล์นี้มี back button/status-badge/viewer-pill/title+HUD ในตัว — ย้ายออกหมดแล้ว
 * (spec docs/superpowers/specs/2026-07-02-buyer-auction-concept1-redesign.md §Components "Changed (existing)"):
 * ตอนนี้เป็นแค่ "ผ้าใบ" รูป + gradient บน/ล่าง ที่รับ overlay children จาก AuctionDetailClient
 * (AuctionSellerHeader/AuctionActionRail/AuctionLiveComment) — ปรับตาม mockup .grad-t(h130)/.grad-b(h52%)
 *
 * Visual ref (asset เท่านั้น — ค่า gradient/สี rgba คงดิบตาม doc exception "on-image scrim"):
 *   docs/mockups/auction/buyer-auction-concept1-flow.html .imgfull/.grad-t/.grad-b
 */
import type { ReactNode } from 'react'

import Box from '@mui/material/Box'

type Props = {
  imageUrl: string
  /** mobile = เต็ม viewport (flex:1 ของ parent flex column, ไม่ scroll หน้า) / desktop = สูงคงที่ 380 (bounded layout) */
  variant: 'mobile' | 'desktop'
  children?: ReactNode
}

export default function AuctionHero({ imageUrl, variant, children }: Props) {
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
        overflow: 'hidden',
        // fallback ไม่มีรูป — พื้นเข้มคงที่เสมอ (ไม่ผูก mode) ใช้ผิว Vuexy always-dark (#2F2B3D, mainColorChannels-light)
        bgcolor: '#2F2B3D',
        backgroundImage: resolvedImg ? `url("${resolvedImg}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        ...(variant === 'mobile' ? { flex: '1 1 auto', minHeight: 0 } : { height: 380 }),
      }}
    >
      {/* scrim บน — ให้ header overlay (avatar/ชื่อผู้ขาย/LIVE) อ่านออก (mockup .grad-t h130) */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 130,
          background: 'linear-gradient(rgba(0,0,0,.62), transparent)',
          zIndex: 1,
        }}
      />
      {/* scrim ล่าง — ให้ rail/คอมเมนต์ล่าสุดอ่านออก (mockup .grad-b h52%) */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '52%',
          background: 'linear-gradient(transparent, rgba(0,0,0,.86))',
        }}
      />

      {children}
    </Box>
  )
}
