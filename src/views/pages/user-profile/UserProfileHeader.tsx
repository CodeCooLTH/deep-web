'use client'

// MUI Imports
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx
// Asset/content source: mockup_shop_profile.html
// Rework: เปลี่ยนเป็น fragment/Box ไล่ลงตาม mockup_shop_profile.html (single-card — ไม่มี Card wrapper อีก)
// D7 approved exception: trust banner + sunburst/dot overlays + progress dots compose จาก MUI Box primitive
// Tooltip บน disabled Button ต้องการ 'use client'
// Responsive (2026-05-23): เพิ่ม named exports ProfileBanner + ProfileLeftPanel
//   เพื่อให้ wrapper/index.tsx จัด 3-block CSS Grid บน desktop
//   UserProfileHeader คงเป็น default export รวม (= ProfileBanner + ProfileLeftPanel) สำหรับ mobile flow เดิม

export type ProfileHeaderData = {
  coverImg: string           // คง field เดิมไว้ (ไม่ใช้ render แต่ไม่ break ผู้เรียก)
  profileImg?: string | null
  fullName: string
  username: string
  memberSince: string
  shopName?: string | null
  trustScore: number
  trustLevel: string         // "A+"|"A"|"B+"|"B"|"C"|"D"
  trustColor: 'success' | 'info' | 'warning' | 'error'
  maxVerifyLevel: number
  bio?: string | null
  location?: string | null
}

// --- Helper: map trustLevel → tier name + gradient ---

type TierInfo = { name: string; gradient: string; filledDots: number }

function getTierInfo(trustLevel: string): TierInfo {
  // Frozen mapping ตาม spec 2026-05-23
  switch (trustLevel) {
    case 'A+':
      return { name: 'Deep Diamond', gradient: 'linear-gradient(135deg, #DDD6FE, #7C3AED, #EC4899)', filledDots: 5 }
    case 'A':
      return { name: 'Deep Platinum', gradient: 'linear-gradient(135deg, #BAE6FD, #0284C7)', filledDots: 4 }
    case 'B+':
      return { name: 'Deep Gold', gradient: 'linear-gradient(135deg, #FEF9C3, #CA8A04)', filledDots: 3 }
    case 'B':
      return { name: 'Deep Silver', gradient: 'linear-gradient(135deg, #E2E8F0, #9CA3AF)', filledDots: 2 }
    case 'C':
      return { name: 'Deep Bronze', gradient: 'linear-gradient(135deg, #FDE68A, #D97706)', filledDots: 1 }
    case 'D':
    default:
      return { name: 'Deep Starter', gradient: 'linear-gradient(135deg, #E2E8F0, #94A3B8)', filledDots: 0 }
  }
}

const TOTAL_DOTS = 5

// ── ProfileBanner — Trust Banner section only ──
// ทำไม: แยกออกมาเพื่อให้ desktop wrapper span ทั้ง 2 col ใน CSS Grid ได้
// bannerHeight: responsive ผ่าน prop — mobile 160 / desktop 200
export const ProfileBanner = ({
  data,
  bannerHeight = 160,
}: {
  data: Pick<ProfileHeaderData, 'trustLevel'>
  /** MUI sx height — ตัวเลข / responsive object / string (เช่น '100%') */
  bannerHeight?: number | string | { xs?: number; md?: number }
}) => {
  const tier = getTierInfo(data.trustLevel)

  return (
    <Box
      sx={{
        height: bannerHeight,
        background: tier.gradient,
        position: 'relative',
        overflow: 'hidden',
        // sunburst pattern — opacity .6 ตาม mockup .trust-banner::before
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background:
            'repeating-conic-gradient(from 45deg at 50% 50%, transparent 0deg, transparent 18deg, #F8FAFC22 18deg, #F8FAFC22 22deg)',
          opacity: 0.6,
        },
        // dot pattern overlay — opacity .35 ตาม mockup .trust-banner::after
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(#1E293B15 1px, transparent 1px)',
          backgroundSize: '14px 14px',
          opacity: 0.35,
        },
      }}
    >
      {/* Trust content: ชิดขวา ตาม mockup .trust-content */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          px: '36px',
          py: '28px',
          zIndex: 1,
        }}
      >
        {/* trust-left: column align-end */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
          {/* Trust Level label */}
          <Typography
            component='p'
            sx={{
              m: 0,
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              opacity: 0.8,
              color: '#1E293B',
            }}
          >
            Trust Level
          </Typography>

          {/* Tier name — 28px/900 ตาม mockup .trust-name */}
          <Typography
            component='p'
            sx={{
              m: 0,
              fontSize: '28px',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              color: '#1E293B',
              textShadow: '0 1px 0 rgba(0,0,0,.06)',
            }}
          >
            {tier.name}
          </Typography>

          {/* Progress dots — 5 จุด gap 5px ตาม mockup .trust-stars */}
          <Box sx={{ display: 'flex', gap: '5px', mt: '8px', justifyContent: 'flex-end' }}>
            {Array.from({ length: TOTAL_DOTS }).map((_, i) => {
              const filled = i < tier.filledDots
              return (
                <Box
                  key={i}
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: filled ? '#1E293B' : '#1E293B33',
                    border: '1.5px solid',
                    borderColor: filled ? '#1E293B' : '#1E293B66',
                    boxShadow: filled
                      ? '0 0 0 2px #F8FAFC, 0 0 8px #1E293B44'
                      : 'none',
                  }}
                />
              )
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

// ── ProfileLeftPanel — X-header (avatar + actions) + Identity (name/verify/bio/meta) ──
// ทำไม: แยกออกมาเพื่อให้ desktop wrapper วางใน left column ของ grid ได้
// bio clamp: ใช้ responsive sx ภายใน — md+ clamp 4 บรรทัด ตาม spec; mobile ไม่ clamp
export const ProfileLeftPanel = ({
  data,
}: {
  data: ProfileHeaderData
}) => {
  const displayName = data.shopName ?? data.fullName
  // D9: แสดง verify badge วงกลมเมื่อ maxVerifyLevel >= 1 เท่านั้น
  const showVerify = data.maxVerifyLevel >= 1

  return (
    <>
      {/* ── X-style header: Avatar LEFT + Actions RIGHT ── */}
      {/* mt: -68px ดึง avatar ขึ้นทับ banner ตาม mockup .x-header margin-top:-68px */}
      <Box
        sx={{
          mt: '-68px',
          px: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Avatar 128px วงกลม border 5px white ตาม mockup .logo */}
        <Avatar
          src={data.profileImg ?? undefined}
          alt={displayName}
          sx={{
            width: 128,
            height: 128,
            borderRadius: '50%',
            border: '5px solid white',
            boxShadow: '0 6px 14px rgba(15,23,42,.18)',
            fontSize: '3.25rem',
            fontWeight: 800,
            bgcolor: '#E2E8F0',
            color: '#475569',
            flexShrink: 0,
          }}
        >
          {displayName.slice(0, 1)}
        </Avatar>

        {/* Action buttons: ⋯ + chat icon + Follow pill ตาม mockup .x-actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', pb: '8px' }}>
          {/* ปุ่มกลม ⋯ 36px */}
          <Tooltip title='เร็ว ๆ นี้' placement='top'>
            <span>
              <Button
                disabled
                sx={{
                  minWidth: 0,
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  bgcolor: 'white',
                  border: '1px solid #CBD5E1',
                  color: '#334155',
                  fontSize: '18px',
                  fontWeight: 700,
                  p: 0,
                  '&.Mui-disabled': {
                    bgcolor: 'white',
                    color: '#94A3B8',
                    border: '1px solid #E2E8F0',
                  },
                }}
              >
                ⋯
              </Button>
            </span>
          </Tooltip>

          {/* ปุ่มกลม chat icon 36px */}
          <Tooltip title='เร็ว ๆ นี้' placement='top'>
            <span>
              <Button
                disabled
                sx={{
                  minWidth: 0,
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  bgcolor: 'white',
                  border: '1px solid #CBD5E1',
                  color: '#334155',
                  p: 0,
                  '&.Mui-disabled': {
                    bgcolor: 'white',
                    color: '#94A3B8',
                    border: '1px solid #E2E8F0',
                  },
                }}
              >
                <Icon icon='tabler-message' fontSize={16} />
              </Button>
            </span>
          </Tooltip>

          {/* ปุ่ม Follow dark pill ตาม mockup .x-follow */}
          <Tooltip title='เร็ว ๆ นี้' placement='top'>
            <span>
              <Button
                disabled
                sx={{
                  padding: '9px 22px',
                  bgcolor: '#0F172A',
                  color: 'white',
                  border: 'none',
                  borderRadius: '999px',
                  fontSize: '14px',
                  fontWeight: 700,
                  letterSpacing: 0,
                  lineHeight: 1,
                  '&.Mui-disabled': {
                    bgcolor: '#0F172A',
                    color: 'rgba(255,255,255,0.6)',
                  },
                }}
              >
                Follow
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Identity ── */}
      {/* px 24 pt 12 ตาม mockup .identity */}
      <Box sx={{ px: '24px', pt: '12px' }}>
        {/* name-row: ชื่อร้าน + verify badge */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <Typography
            component='h2'
            sx={{
              m: 0,
              fontSize: '22px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#0F172A',
              lineHeight: 1.15,
            }}
          >
            {displayName}
          </Typography>

          {/* D9: แสดงเฉพาะเมื่อ maxVerifyLevel >= 1 — วงกลม 22px bg #1D9BF0 white ✓ */}
          {showVerify && (
            <Box
              component='span'
              title='ยืนยันแล้ว'
              sx={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                bgcolor: '#1D9BF0',
                color: 'white',
                display: 'grid',
                placeItems: 'center',
                fontSize: '12px',
                fontWeight: 900,
                boxShadow: '0 1px 3px rgba(29,155,240,.3)',
                flexShrink: 0,
              }}
            >
              ✓
            </Box>
          )}
        </Box>

        {/* handle @username — 14px color #64748B */}
        <Typography
          component='p'
          sx={{ m: 0, mt: '1px', fontSize: '14px', color: '#64748B', lineHeight: 1.3 }}
        >
          @{data.username}
        </Typography>

        {/* bio — ซ่อนถ้า null ตาม mockup .bio */}
        {/* ทำไม: md+ clamp 4 บรรทัดตาม spec ด้วย responsive sx — mobile ไม่ clamp (display unset) */}
        {data.bio && (
          <Typography
            component='p'
            sx={{
              m: 0,
              pt: '8px',
              fontSize: '14px',
              color: '#0F172A',
              lineHeight: 1.45,
              // mobile: ไม่ clamp — แสดงเต็ม
              // md+: clamp 4 บรรทัด
              display: { xs: 'block', md: '-webkit-box' },
              WebkitLineClamp: { md: 4 },
              WebkitBoxOrient: { md: 'vertical' },
              overflow: { md: 'hidden' },
            }}
          >
            {data.bio}
          </Typography>
        )}

        {/* meta-row: location + joined ตาม mockup .meta-row */}
        <Box
          sx={{
            pt: '6px',
            pb: '16px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            fontSize: '13px',
            color: '#64748B',
            lineHeight: 1.3,
          }}
        >
          {/* location — ซ่อนถ้า null */}
          {data.location && (
            <Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Icon icon='tabler-map-pin' fontSize={14} />
              {data.location}
            </Box>
          )}

          {/* joined date */}
          <Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Icon icon='tabler-calendar' fontSize={14} />
            เข้าร่วม {data.memberSince}
          </Box>
        </Box>
      </Box>
    </>
  )
}

// ── UserProfileHeader — default export รวม (mobile-compatible) ──
// ทำไม: คง default export ไว้เพื่อ backward compat + ใช้ใน mobile flow ผ่าน wrapper/index.tsx
const UserProfileHeader = ({ data }: { data: ProfileHeaderData }) => {
  return (
    <>
      <ProfileBanner data={data} bannerHeight={160} />
      <ProfileLeftPanel data={data} />
    </>
  )
}

export default UserProfileHeader
