'use client'

/**
 * AuctionActionRail — แถบไอคอนแนวตั้งลอยขวา (feature 00004, Concept 1 redesign 2026-07-02)
 *
 * ผู้ชม (read-only) / ติดตาม (watch toggle) / บิด (เปิด modal ประวัติ) / แชร์ — frosted pill ทับรูป
 * ไม่มี theme file "vertical action rail" ตรงตัวใน Vuexy (เหมือนกรณี AuctionResultCard.tsx ที่ไม่มี
 * theme demo ให้ copy) — ประกอบจาก MUI Box/IconButton primitive ตาม pattern frosted-overlay ที่
 * AuctionHero.tsx เดิมใช้อยู่แล้ว (frosted back button) + CustomAvatar/Icon ที่ใช้ทั่วทั้ง feature นี้
 *
 * Visual ref (asset เท่านั้น — ค่า rgba พื้นหลัง frosted คงดิบตาม doc exception "on-image scrim",
 * spec §Theme mapping ระบุค่านี้ไว้ตรง ๆ): docs/mockups/auction/buyer-auction-concept1-flow.html .rail
 */
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'

import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

type Props = {
  viewerCount: number
  watching: boolean
  onToggleWatch: () => void
  bidCount: number
  onOpenBidHistory: () => void
  shareUrl: string
  shareTitle: string
  /** true = ended/unsold/cancelled — เหลือแค่ปุ่มประวัติบิด(read-only)+แชร์ (edge state "rail read-only history") */
  readOnly?: boolean
}

export default function AuctionActionRail({
  viewerCount,
  watching,
  onToggleWatch,
  bidCount,
  onOpenBidHistory,
  shareUrl,
  shareTitle,
  readOnly = false,
}: Props) {
  const theme = useTheme()

  async function handleShare() {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    if (nav?.share) {
      try {
        await nav.share({ title: shareTitle, url: shareUrl })
      } catch {
        // ผู้ใช้กดยกเลิกกล่องแชร์ของระบบ — เงียบ ไม่ถือเป็น error
      }
      return
    }
    if (nav?.clipboard) {
      try {
        await nav.clipboard.writeText(shareUrl)
        toast.success('คัดลอกลิงก์แล้ว')
      } catch {
        toast.error('คัดลอกลิงก์ไม่สำเร็จ')
      }
    }
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        right: 9,
        bottom: { xs: '30%', sm: '32%' },
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        gap: '13px',
        alignItems: 'center',
        // frosted pill — documented on-image scrim exception (spec §Theme mapping ระบุค่าตรง ๆ)
        bgcolor: 'rgba(18,16,28,.46)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,.16)',
        borderRadius: '24px',
        px: '7px',
        py: '11px',
      }}
    >
      {!readOnly && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', color: 'common.white' }}>
          <Icon icon="tabler-eye" fontSize={22} />
          <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: 'common.white', textShadow: '0 1px 2px rgba(0,0,0,.5)' }}>
            {viewerCount}
          </Typography>
        </Box>
      )}

      {!readOnly && (
        <Box
          component="button"
          type="button"
          onClick={onToggleWatch}
          aria-label="ติดตามการประมูล"
          aria-pressed={watching}
          sx={{
            p: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
            color: watching ? 'error.main' : 'common.white',
          }}
        >
          <Icon icon={watching ? 'tabler-heart-filled' : 'tabler-heart'} fontSize={22} />
        </Box>
      )}

      <Box
        component="button"
        type="button"
        onClick={onOpenBidHistory}
        aria-label="ดูประวัติการเสนอราคา"
        sx={{
          p: 0,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2px',
          color: 'common.white',
        }}
      >
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            display: 'grid',
            placeItems: 'center',
            boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.55)}`,
          }}
        >
          <Icon icon="tabler-gavel" fontSize={19} style={{ color: '#fff' }} />
        </Box>
        <Typography sx={{ fontSize: 9.5, fontWeight: 800, color: 'common.white' }}>บิด {bidCount}</Typography>
      </Box>

      <Box
        component="button"
        type="button"
        onClick={handleShare}
        aria-label="แชร์การประมูลนี้"
        sx={{
          p: 0,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2px',
          color: 'common.white',
        }}
      >
        <Icon icon="tabler-share-3" fontSize={22} />
        <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: 'common.white' }}>แชร์</Typography>
      </Box>
    </Box>
  )
}
