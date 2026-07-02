'use client'

/**
 * AuctionSellerHeader — overlay บนสุดของ AuctionHero (feature 00004, Concept 1 redesign 2026-07-02)
 *
 * avatar + ชื่อผู้เปิดประมูล + verified check + Lv pill + สถิติ (ออเดอร์/สำเร็จ) ทางซ้าย,
 * status pill (LIVE ตอน live / ป้ายกลาง ๆ สถานะอื่น) ทางขวา — ไม่มีปุ่มย้อนกลับ (resolved decision #7)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx
 *   (avatar + name + meta-row inline composition pattern)
 * STATUS_BADGE map ย้ายมาจาก AuctionHero.tsx เดิม (asset scrim-on-image exception เดิม คงค่า rgba ดิบไว้)
 *
 * Visual ref (asset เท่านั้น): docs/mockups/auction/buyer-auction-concept1-flow.html .thdr/.shead/.live
 */
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import CustomAvatar from '@core/components/mui/Avatar'
import { getInitials } from '@/utils/getInitials'
import type { SellerTrust } from '@/services/app-shop.service'
import type { PublicAuctionDTO } from '@/services/auction.service'

type Props = {
  seller: SellerTrust | null
  status: PublicAuctionDTO['status']
}

// ป้ายสถานะ (ย้ายมาจาก AuctionHero.tsx เดิม) — rgba คงไว้ดิบ (scrim บนรูปภาพ อ่านได้ทุกโทนสี, ไม่ใช่ semantic
// surface) draft/ended/unsold/cancelled เป็นสีกลาง (neutral), live/scheduled derive จาก error/primary hue
const STATUS_BADGE: Record<PublicAuctionDTO['status'], { label: string; bg: string; dot?: string }> = {
  draft: { label: 'ร่าง', bg: 'rgba(100,116,139,.85)' },
  scheduled: { label: 'เร็ว ๆ นี้', bg: 'rgba(115,103,240,.88)' }, // derive จาก primary.main (#7367F0)
  live: { label: 'LIVE', bg: 'rgba(255,76,81,.9)', dot: 'common.white' }, // derive จาก error.main
  ended: { label: 'จบแล้ว', bg: 'rgba(15,23,42,.82)' },
  unsold: { label: 'ไม่มีผู้ชนะ', bg: 'rgba(100,116,139,.85)' },
  cancelled: { label: 'ยกเลิกแล้ว', bg: 'rgba(100,116,139,.85)' },
}

/** ย่อจำนวนหลักพัน (1000 → "1K") ตาม mockup .stats — สถิติ trust ไม่จำเป็นต้องเป๊ะหลักหน่วย */
function abbreviateCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
  return String(n)
}

export default function AuctionSellerHeader({ seller, status }: Props) {
  const badge = STATUS_BADGE[status]

  return (
    <Box sx={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 6, display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <CustomAvatar
          size={34}
          skin="filled"
          color="primary"
          src={seller?.avatarUrl || undefined}
          sx={{ border: '2px solid rgba(255,255,255,.85)', flexShrink: 0, fontSize: 13, fontWeight: 700 }}
        >
          {seller ? getInitials(seller.name) : <Icon icon="tabler-user" fontSize={16} />}
        </CustomAvatar>

        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
            <Typography
              noWrap
              sx={{ fontSize: 13, fontWeight: 700, color: 'common.white', textShadow: '0 1px 3px rgba(0,0,0,.5)', minWidth: 0 }}
            >
              {seller?.name ?? 'ผู้ขาย'}
            </Typography>
            {seller?.verified && (
              <Icon icon="tabler-rosette-discount-check-filled" style={{ color: '#fff', fontSize: 14, flexShrink: 0 }} />
            )}
            {seller && (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  // Lv badge gradient — documented hex exception (contrast บนรูปภาพ, spec §Theme mapping)
                  background: 'linear-gradient(135deg,#ffcf5e,#ff9f43)',
                  color: '#5a3800',
                  fontSize: 9,
                  fontWeight: 800,
                  px: '6px',
                  py: '1px',
                  borderRadius: 999,
                  flexShrink: 0,
                }}
              >
                <Icon icon="tabler-award-filled" fontSize={10} />
                Lv.{seller.level}
              </Box>
            )}
          </Box>

          {seller && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mt: '2px' }}>
              <Typography
                sx={{ fontSize: 10, color: 'rgba(255,255,255,.92)', textShadow: '0 1px 2px rgba(0,0,0,.5)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
              >
                <Icon icon="tabler-package" fontSize={11} />
                <Box component="b">{abbreviateCount(seller.ordersCount)}</Box> ออเดอร์
              </Typography>
              <Typography
                sx={{ fontSize: 10, color: 'rgba(255,255,255,.92)', textShadow: '0 1px 2px rgba(0,0,0,.5)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
              >
                <Icon icon="tabler-gavel" fontSize={11} />
                <Box component="b">{abbreviateCount(seller.successfulAuctionsCount)}</Box> สำเร็จ
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          px: '11px',
          py: '5px',
          borderRadius: 999,
          bgcolor: badge.bg,
          color: 'common.white',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.03em',
          flexShrink: 0,
        }}
      >
        {badge.dot && (
          <Box
            component="span"
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: badge.dot,
              animation: 'auctionLivePulse 1.4s ease-in-out infinite',
              '@keyframes auctionLivePulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
            }}
          />
        )}
        {badge.label}
      </Box>
    </Box>
  )
}
