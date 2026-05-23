'use client'

// MUI Imports
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Next Imports
// ทำไม: back button ใน client component — ใช้ Link ได้โดยตรง ไม่ผิด Hard Rule 2 (ซึ่งห้ามเฉพาะ component={Link} ใน MUI server component)
import Link from 'next/link'

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
      {/* Back button — มุมซ้ายบน absolute; frosted glass กัน background gradient กลืน */}
      {/* ทำไม: user ต้องการ back button ใน banner — ใช้ Link (client component ทำได้) นำทางไป home "/" */}
      <Link href='/' style={{ textDecoration: 'none' }}>
        <IconButton
          aria-label='กลับหน้าหลัก'
          title='กลับหน้าหลัก'
          sx={{
            position: 'absolute',
            top: { xs: 16, md: 16 },
            left: { xs: 16, md: 24 },
            zIndex: 3,
            width: 38,
            height: 38,
            borderRadius: '50%',
            bgcolor: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.6)',
            boxShadow: '0 2px 6px rgba(0,0,0,.12)',
            color: '#0F172A',
            '&:hover': {
              bgcolor: 'rgba(255,255,255,1)',
            },
          }}
        >
          <Icon icon='tabler-arrow-left' fontSize={20} />
        </IconButton>
      </Link>

      {/* Trust content: ชิดขวา ตาม mockup .trust-content */}
      {/* R11: px responsive — xs:20px (กันชนมือถือแคบ) md:36px (ค่าเดิม) */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          px: { xs: '20px', md: '36px' },
          py: '28px',
          zIndex: 1,
        }}
      >
        {/* trust-left: column align-end */}
        {/* R7: maxWidth 60% กัน "Deep Diamond" ล้นบน mobile แคบ */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end', maxWidth: '60%' }}>
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

          {/* Tier name — R7: responsive fontSize xs:22px md:28px กัน overflow บน mobile แคบ */}
          <Typography
            component='p'
            sx={{
              m: 0,
              fontSize: { xs: '22px', md: '28px' },
              fontWeight: 900,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              color: '#1E293B',
              textShadow: '0 1px 0 rgba(0,0,0,.06)',
            }}
          >
            {tier.name}
          </Typography>

          {/* Progress dots — R12: responsive size xs:10 md:12, gap xs:5px md:6px */}
          <Box sx={{ display: 'flex', gap: { xs: '5px', md: '6px' }, mt: '8px', justifyContent: 'flex-end' }}>
            {Array.from({ length: TOTAL_DOTS }).map((_, i) => {
              const filled = i < tier.filledDots
              return (
                <Box
                  key={i}
                  sx={{
                    width: { xs: 10, md: 12 },
                    height: { xs: 10, md: 12 },
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
      {/* ── Header: Avatar กลาง + Actions ใต้ avatar (user: ย้าย avatar มากลาง) ── */}
      {/* mt: -68px ดึง avatar ขึ้นทับ banner; column + center จัด avatar/actions กลาง */}
      <Box
        sx={{
          mt: '-68px',
          px: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Avatar 128px + verify badge มุมขวาล่าง (user: ย้าย verify มาบน avatar) */}
        <Box sx={{ position: 'relative', width: 128, height: 128, flexShrink: 0 }}>
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
            }}
          >
            {displayName.slice(0, 1)}
          </Avatar>
          {/* D9: verify badge มุมขวาล่าง — แสดงเมื่อ maxVerifyLevel >= 1; ring ขาวให้เด่นบน avatar */}
          {showVerify && (
            <Box
              component='span'
              title='ยืนยันแล้ว'
              sx={{
                position: 'absolute',
                bottom: 6,
                right: 6,
                width: 30,
                height: 30,
                borderRadius: '50%',
                bgcolor: '#1D9BF0',
                color: 'white',
                display: 'grid',
                placeItems: 'center',
                fontSize: '15px',
                fontWeight: 900,
                border: '3px solid white',
                boxShadow: '0 1px 4px rgba(29,155,240,.4)',
              }}
            >
              ✓
            </Box>
          )}
        </Box>

      </Box>

      {/* ── Identity (จัดกลางให้ coherent กับ avatar กลาง) ── */}
      <Box sx={{ px: '24px', pt: '12px', textAlign: 'center' }}>
        {/* name-row: ชื่อร้าน + verify badge */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
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
            justifyContent: 'center',
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

        {/* Action buttons: ⋯ + chat icon + Follow — ย้ายมาหลัง meta-row ตาม user feedback */}
        {/* ทำไม: user เลือก "ใต้ identity" — actions อยู่ท้าย identity block จัดกลาง */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: '8px', pt: '12px' }}>
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
                    // R6: opacity 1 — ดู "เร็ว ๆ นี้" ไม่ใช่ "พัง" (MUI default 0.38 ทำให้ button ดูพัง)
                    opacity: 1,
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
                    // R6: opacity 1 — คุม color เองผ่าน sx
                    opacity: 1,
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

          {/* ปุ่ม Follow dark pill — user ขอเก็บ x-actions Follow ไว้ (ลบเฉพาะ banner-follow R14) */}
          {/* style ตาม mockup .x-follow: bg ink, white, radius 999, 14px/700 */}
          <Tooltip title='เร็ว ๆ นี้' placement='top'>
            <span>
              <Button
                disabled
                sx={{
                  px: '22px',
                  py: '9px',
                  bgcolor: '#0F172A',
                  color: 'white',
                  borderRadius: 999,
                  fontSize: '14px',
                  fontWeight: 700,
                  textTransform: 'none',
                  lineHeight: 1.2,
                  '&.Mui-disabled': {
                    // R6: opacity 1 — ดู "เร็ว ๆ นี้" ไม่ใช่ disabled พัง
                    opacity: 1,
                    bgcolor: '#0F172A',
                    color: 'rgba(255,255,255,0.7)',
                  },
                }}
              >
                Follow
              </Button>
            </span>
          </Tooltip>
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
