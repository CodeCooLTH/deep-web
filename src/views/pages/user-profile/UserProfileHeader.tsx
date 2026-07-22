'use client'

// MUI Imports
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Lib Imports
import { getTierGradient } from '@/lib/trust-tier'
import type { TierChipColor } from '@/lib/trust-tier'

// Next Imports
// ทำไม: back button ใน client component — ใช้ Link ได้โดยตรง ไม่ผิด Hard Rule 2 (ซึ่งห้ามเฉพาะ component={Link} ใน MUI server component)
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Auth Imports — S-8 (feat 00011 Deep Chat) login-gate pattern (AuctionBidPanel.tsx:114-121)
import { useSession } from 'next-auth/react'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx
// Asset/content source: mockup_shop_profile.html (คงต่อเนื่องจาก D7 exception เดิม)
// Redesign (2026-07-04, hybrid FB Page × Threads spec): เปลี่ยน cover จากรูป baked → CSS gradient ต่อ tier (getTierGradient)
// + dot-mesh overlay (CSS ล้วน); identity bar responsive row/column; metric row แทน bio/location/joined (ย้ายไป About section
// ใน profile/index.tsx ซ้าย); ตัดเมตริก "ผู้ติดตาม" ทิ้งทั้งหมด (ไม่มี follow system จริง)
// คง: back-button frosted-glass, chat login-gate เดิม (S-8)
// Impeccable audit 2026-07-22 (S-B2): ลบ verify badge วงกลมบน avatar ทิ้ง — เดิมเป็นสีน้ำเงิน Twitter
// ซึ่งไม่มีความหมาย "ยืนยันแล้ว" ในระบบ Deep เลย (เขียว #28C76F เท่านั้นที่แปลว่า verified)
// แทนด้วย Chip tonal success ข้างชื่อจุดเดียว ตาม design-spec decision #3 — avatar ไม่มี badge ซ้อนแล้ว
// ส่วนขยาย Desktop layout redesign (2026-07-22, IG-style + trust data): avatar 112px(มือถือ)→152px(md+)
// ตาม wireframe เป้าหมายที่ Controller ระบุ (overlap มากขึ้นให้สมดุลกับ container 960px ที่กว้างขึ้น)
// completionRate (S-B12) เพิ่มใน ProfileHeaderData — ใช้ที่ ProfileStatsBar เท่านั้น ไม่ใช้ในไฟล์นี้

export type ProfileHeaderData = {
  profileImg?: string | null
  fullName: string
  username: string
  shopName?: string | null
  trustScore: number
  /** ชื่อ tier แสดงผล (Deep Classic/Silver/Gold/Diamond/Star) — จาก getTierLabel() (Tier Lists SSOT) */
  tierLabel: string
  /** สี chip ตาม Tier Lists SSOT — จาก getTierColor() */
  tierColor: TierChipColor
  maxVerifyLevel: number
  /** จำนวนออเดอร์สำเร็จ — แสดงใน metric row */
  completedOrders: number
  /** S-B12: % สำเร็จ (confirmed/(confirmed+cancelled)*100) — null เมื่อยังไม่มี order จบเลย (ร้านใหม่) */
  completionRate: number | null
  avgRating: number
  /** true เมื่อมีรีวิว >= 3 (เพื่อความน่าเชื่อถือ) — ซ่อน ★rating ถ้า false */
  showRating: boolean
  // S-8 (feat 00011 Deep Chat): ร้านของ user นี้ (ถ้ามี isShop) — null = บัญชี buyer-only แชทไม่ได้
  shopId?: string | null
  // B3: true เมื่อ viewer (session user) เป็นเจ้าของร้านนี้เอง — self-chat ต้อง disable
  isOwnShop?: boolean
}

// ── ProfileBanner — Trust Banner section only ──
// ทำไม: แยกออกมาเพื่อให้ desktop wrapper span ทั้ง 2 col ใน CSS Grid ได้
// bannerHeight responsive ตาม spec: {xs:148, sm:200, md:240}
export const ProfileBanner = ({
  data,
  bannerHeight = { xs: 148, sm: 200, md: 240 },
}: {
  data: Pick<ProfileHeaderData, 'trustScore'>
  bannerHeight?: number | string | { xs?: number; sm?: number; md?: number }
}) => {
  const gradient = getTierGradient(data.trustScore)

  return (
    <Box
      sx={{
        height: bannerHeight,
        position: 'relative',
        overflow: 'hidden',
        // ทำไม: dot-mesh overlay (CSS ล้วน) แทนลายจุดที่เคย baked ในรูป cover เดิม — ซ้อนบน gradient ต่อ tier
        backgroundImage: `radial-gradient(rgba(255,255,255,.22) 1.5px, transparent 1.6px), ${gradient}`,
        backgroundSize: '22px 22px, 100% 100%',
        backgroundPosition: 'center, center',
        backgroundRepeat: 'repeat, no-repeat',
      }}
    >
      {/* Back button — มุมซ้ายบน absolute; frosted glass กัน background gradient กลืน */}
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
            boxShadow: 'var(--mui-customShadows-sm)',
            color: 'text.primary',
            '&:hover': {
              bgcolor: 'rgba(255,255,255,1)',
            },
          }}
        >
          <Icon icon='tabler-arrow-left' fontSize={20} />
        </IconButton>
      </Link>
    </Box>
  )
}

// ── ProfileIdentityBar — avatar + name/handle/metric-row + actions (แชท/ติดตาม) ──
// ทำไม: แยกออกมาเพื่อให้ desktop wrapper วางใน 'identity' grid-area (span 2 col เหนือ left/right) ได้
// responsive: xs = column จัดกลาง; sm+ = row (avatar+ชื่อชิดซ้าย, ปุ่ม ml:auto ชิดขวา)
export const ProfileIdentityBar = ({
  data,
}: {
  data: ProfileHeaderData
}) => {
  const displayName = data.shopName ?? data.fullName
  // D9: แสดง verify badge วงกลมเมื่อ maxVerifyLevel >= 1 เท่านั้น
  const showVerify = data.maxVerifyLevel >= 1

  // S-8 (feat 00011 Deep Chat): login-gate ก่อนเข้าห้องแชท — pattern AuctionBidPanel.tsx:114-121
  const router = useRouter()
  const { status: sessionStatus } = useSession()
  const chatDisabled = !data.shopId || Boolean(data.isOwnShop)

  const handleChatClick = () => {
    if (chatDisabled || !data.shopId) return
    if (sessionStatus !== 'authenticated') {
      router.push(`/auth/sign-in?callbackUrl=${encodeURIComponent(`/messages/${data.shopId}`)}`)
      return
    }
    router.push(`/messages/${data.shopId}`)
  }

  return (
    <Box sx={{ px: { xs: '20px', md: '24px' }, pt: '12px', pb: '16px' }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'center', sm: 'flex-end' },
          gap: { xs: '12px', sm: '16px' },
        }}
      >
        {/* Avatar overlap cover (mt ลบ) — S-B10/wireframe (ส่วนขยาย IG-style): 112px มือถือ → 152px desktop(md+) */}
        <Box
          sx={{
            position: 'relative',
            width: { xs: 112, md: 152 },
            height: { xs: 112, md: 152 },
            flexShrink: 0,
            mt: { xs: '-56px', md: '-76px' },
            zIndex: 2,
          }}
        >
          <Avatar
            src={data.profileImg ?? undefined}
            alt={displayName}
            sx={{
              width: { xs: 112, md: 152 },
              height: { xs: 112, md: 152 },
              borderRadius: '50%',
              border: '4px solid white',
              boxShadow: 'var(--mui-customShadows-lg)',
              fontSize: '2.75rem',
              fontWeight: 800,
              // ทำไม (S-B3): ตัด bgcolor/color fallback ทิ้ง — MuiAvatar override (overrides/avatar.ts:29-33)
              // บังคับ text.primary + default bg #EEEDF0 อยู่แล้ว ไม่ต้อง hardcode ซ้ำ
            }}
          >
            {displayName.slice(0, 1)}
          </Avatar>
        </Box>

        {/* Name / handle / metric row — sm+ ชิดซ้าย, xs จัดกลาง */}
        <Box sx={{ flex: 1, minWidth: 0, textAlign: { xs: 'center', sm: 'left' } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'center', sm: 'flex-start' }, gap: '6px', flexWrap: 'wrap' }}>
            <Typography
              component='h1'
              sx={{ m: 0, fontSize: '21px', fontWeight: 800, letterSpacing: '-0.02em', color: 'text.primary', lineHeight: 1.15 }}
            >
              {displayName}
            </Typography>
            {/* S-B2: เอาวงกลมน้ำเงินบน avatar ออก (ตาม spec decision #3) — เหลือ chip เขียวจุดเดียวข้างชื่อ */}
            {showVerify && (
              <Chip
                size='small'
                variant='tonal'
                color='success'
                icon={<Icon icon='tabler-rosette-discount-check-filled' fontSize={14} />}
                label='ยืนยันตัวตนแล้ว'
                sx={{ height: 22, fontSize: '12px', fontWeight: 500, '& .MuiChip-label': { px: '8px' } }}
              />
            )}
          </Box>

          <Typography component='p' sx={{ m: 0, mt: '1px', fontSize: '14px', color: 'text.secondary', lineHeight: 1.3 }}>
            @{data.username}
          </Typography>

          {/* metric row: {orders} ออเดอร์ · ★{rating}(ถ้า showRating) · [tier chip]
              ตัด "ผู้ติดตาม" ออกทั้งหมด (ไม่มี follow system จริง)
              ตัด "ส่งตรงเวลา 98%" ออก (2026-07-04 fix): เป็น hardcode ไม่มี field จริงในระบบ โชว์ปนข้อมูลจริงโดยไม่มีป้าย "ตัวอย่าง"
              ขัด ethos เดียวกับที่ตัด follower/per-product rating ทิ้ง */}
          <Box
            sx={{
              mt: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: { xs: 'center', sm: 'flex-start' },
              flexWrap: 'wrap',
              gap: '6px',
              fontSize: '13px',
              color: 'text.secondary',
            }}
          >
            <Box component='span'>
              <Box component='strong' sx={{ color: 'text.primary', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {data.completedOrders.toLocaleString('th-TH')}
              </Box>{' '}
              ออเดอร์
            </Box>
            {data.showRating && (
              <>
                <Box component='span' sx={{ color: 'text.disabled' }}>·</Box>
                <Box component='span' sx={{ color: 'warning.main', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                  <Icon icon='tabler-star-filled' fontSize={13} />
                  {data.avgRating.toFixed(1)}
                </Box>
              </>
            )}
            <Box component='span' sx={{ color: 'text.disabled' }}>·</Box>
            <Chip
              size='small'
              variant='tonal'
              color={data.tierColor}
              label={data.tierLabel}
              sx={{ height: 22, fontSize: '11px', fontWeight: 700, '& .MuiChip-label': { px: '8px' } }}
            />
          </Box>
        </Box>

        {/* Actions: แชท(primary) / ติดตาม(disabled "เร็ว ๆ นี้") — sm+ ชิดขวา (ml:auto) */}
        <Box
          sx={{
            display: 'flex',
            gap: '8px',
            ml: { sm: 'auto' },
            mt: { xs: '4px', sm: 0 },
            flexShrink: 0,
          }}
        >
          {chatDisabled ? (
            <Tooltip title={data.isOwnShop ? 'นี่คือร้านค้าของคุณเอง' : 'ยังแชทไม่ได้'} placement='top'>
              <span>
                <Button
                  disabled
                  variant='contained'
                  startIcon={<Icon icon='tabler-message-circle-2' fontSize={16} />}
                  sx={{ borderRadius: 999, textTransform: 'none', fontWeight: 700 }}
                >
                  แชท
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Button
              onClick={handleChatClick}
              variant='contained'
              color='primary'
              startIcon={<Icon icon='tabler-message-circle-2' fontSize={16} />}
              sx={{ borderRadius: 999, textTransform: 'none', fontWeight: 700 }}
            >
              แชท
            </Button>
          )}

          <Tooltip title='เร็ว ๆ นี้' placement='top'>
            <span>
              <Button
                disabled
                variant='outlined'
                color='secondary'
                sx={{ borderRadius: 999, textTransform: 'none', fontWeight: 700 }}
              >
                ติดตาม
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  )
}

// ── UserProfileHeader — default export รวม (mobile-compatible) ──
// ทำไม: คง default export ไว้เพื่อ backward compat + ใช้ใน mobile flow ผ่าน wrapper/index.tsx
const UserProfileHeader = ({ data }: { data: ProfileHeaderData }) => {
  return (
    <>
      <ProfileBanner data={data} />
      <ProfileIdentityBar data={data} />
    </>
  )
}

export default UserProfileHeader
