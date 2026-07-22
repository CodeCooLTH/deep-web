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
// คง: back-button frosted-glass, verify badge ✓ บน avatar (carve-out dingbat), chat login-gate เดิม (S-8)

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
            boxShadow: '0 2px 6px rgba(0,0,0,.12)',
            color: '#2F2B3D',
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
        {/* Avatar 112px overlap cover (mt ลบ) + verify badge มุมขวาล่าง */}
        <Box sx={{ position: 'relative', width: 112, height: 112, flexShrink: 0, mt: '-56px', zIndex: 2 }}>
          <Avatar
            src={data.profileImg ?? undefined}
            alt={displayName}
            sx={{
              width: 112,
              height: 112,
              borderRadius: '50%',
              border: '4px solid white',
              boxShadow: '0 6px 14px rgba(15,23,42,.18)',
              fontSize: '2.75rem',
              fontWeight: 800,
              bgcolor: '#2F2B3D1F',
              color: '#2F2B3D',
            }}
          >
            {displayName.slice(0, 1)}
          </Avatar>
          {/* D9: verify badge มุมขวาล่าง — carve-out dingbat ✓ (single-color typographic, ไม่ใช่ emoji) */}
          {showVerify && (
            <Box
              component='span'
              title='ยืนยันแล้ว'
              sx={{
                position: 'absolute',
                bottom: 4,
                right: 4,
                width: 27,
                height: 27,
                borderRadius: '50%',
                bgcolor: '#28C76F',
                color: 'white',
                display: 'grid',
                placeItems: 'center',
                fontSize: '14px',
                fontWeight: 900,
                border: '3px solid white',
                boxShadow: '0 1px 4px rgba(29,155,240,.4)',
              }}
            >
              ✓
            </Box>
          )}
        </Box>

        {/* Name / handle / metric row — sm+ ชิดซ้าย, xs จัดกลาง */}
        <Box sx={{ flex: 1, minWidth: 0, textAlign: { xs: 'center', sm: 'left' } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'center', sm: 'flex-start' }, gap: '6px', flexWrap: 'wrap' }}>
            <Typography
              component='h1'
              sx={{ m: 0, fontSize: '21px', fontWeight: 800, letterSpacing: '-0.02em', color: '#2F2B3D', lineHeight: 1.15 }}
            >
              {displayName}
            </Typography>
            {showVerify && (
              <Icon icon='tabler-rosette-discount-check-filled' style={{ color: '#28C76F', fontSize: 18 }} aria-label='ยืนยันแล้ว' />
            )}
          </Box>

          <Typography component='p' sx={{ m: 0, mt: '1px', fontSize: '14px', color: '#808390', lineHeight: 1.3 }}>
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
              color: '#808390',
            }}
          >
            <Box component='span'>
              <Box component='strong' sx={{ color: '#2F2B3D', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {data.completedOrders.toLocaleString('th-TH')}
              </Box>{' '}
              ออเดอร์
            </Box>
            {data.showRating && (
              <>
                <Box component='span' sx={{ color: '#2F2B3D1F' }}>·</Box>
                <Box component='span' sx={{ color: '#FF9F43', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                  <Icon icon='tabler-star-filled' fontSize={13} />
                  {data.avgRating.toFixed(1)}
                </Box>
              </>
            )}
            <Box component='span' sx={{ color: '#2F2B3D1F' }}>·</Box>
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
