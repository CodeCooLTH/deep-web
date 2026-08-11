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
// Desktop layout redesign (IG-style + trust data): avatar 112px(มือถือ)→152px(md+) ตาม wireframe เป้าหมาย
// (overlap มากขึ้นให้สมดุลกับ container 960px ที่กว้างขึ้น); metric row เดิม (ออเดอร์·★รีวิว·tier chip) ถูกลบออก
// เพราะข้อมูลชุดเดียวกันย้ายไปอยู่ที่ ProfileStatsBar ซึ่ง render อยู่ใต้บล็อกนี้ทันที — คงไว้จะซ้ำ 2 แถวติดกัน
// known-gap: tierColor กลายเป็น prop ที่ไม่ถูกใช้ในไฟล์นี้แล้วหลังลบ metric row (field อื่นยังอ่านผ่าน
// ProfileStatsBar จาก object เดียวกัน — ไม่ลบ field ออกจาก type เพราะ TrustScoreCard ยังใช้ tierColor ต่อ)
//
// P0-1/P0-2 (2026-07-22 Impeccable critique — แก้เพิ่มรอบนี้):
// - verify badge เดิมเป็น binary เขียว (icon เปล่า ไม่มี text node ให้ screen reader อ่าน) → เปลี่ยนเป็น chip
//   3 ระดับ (L1 OTP=เทา, L2/L3=เขียว) พร้อม text จริง; avatar corner badge ยกเงื่อนไขเป็น L2+ เท่านั้น
// - completionRate ใน ProfileHeaderData ตอนนี้ใช้ทั้งใน ProfileStatsBar และ ProfileBanner (new-shop override —
//   completionRate===null บังคับ banner เป็นเกรย์เทาม่วงเสมอ ไม่ว่า trustScore จะสูงแค่ไหน)
// - back-button shadow: rgba(0,0,0,.12) (ผิด Ink-Tinted Shadow Rule) → var(--mui-customShadows-sm)

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
  /** จำนวนออเดอร์สำเร็จ — แสดงใน ProfileStatsBar */
  completedOrders: number
  /** % สำเร็จ (confirmed/(confirmed+cancelled)*100) — null เมื่อยังไม่มี order จบเลย (ร้านใหม่) */
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
  // known-gap: completionRate เป็น optional (ต่างจาก Pick<> ตรง ๆ ตามสเปก) เพราะมีผู้เรียกนอกขอบเขต task นี้
  // (OrderDetailMobile.tsx /o/[token] — PublicOrderData ไม่มี field นี้ใน contract, อยู่นอก scope งานนี้)
  // undefined = ไม่ override (พฤติกรรมเดิม ใช้ tier gradient เสมอ) ต่างจาก null ที่ตั้งใจส่งมาเพื่อบอกว่า "ร้านใหม่"
  data: Pick<ProfileHeaderData, 'trustScore'> & {
    completionRate?: ProfileHeaderData['completionRate']
    /**
     * บอกตรง ๆ ว่าร้านนี้ยังไม่มีประวัติ — ใช้เมื่อผู้เรียก "รู้คำตอบอยู่แล้ว" แต่ส่ง
     * `completionRate` มาไม่ได้
     *
     * 🛑 ทำไมต้องมี prop แยก ทั้งที่ดูเหมือน `completionRate === null` ก็พอ:
     * บางหน้าจงใจไม่แสดง % สำเร็จ (FR-OSM-11) แล้ว `getOrderSummaryForSignIn()` จึง
     * **hardcode `completionRate = null` เสมอ** ⇒ ฟิลด์เดียวแบกสองความหมายที่ชนกันพอดี
     * ("ไม่โชว์ %" กับ "ไม่มีประวัติ") ถ้าเอาค่านั้นส่งเข้ามาตรง ๆ ทุกร้านจะกลายเป็น
     * "ร้านใหม่" หมดแม้ร้านที่ขายมาเป็นปี — สัญญาณจริงคือ "มีออเดอร์จบไหม" ไม่ใช่ค่า % (HR16)
     */
    isNewShop?: boolean
  }
  bannerHeight?: number | string | { xs?: number; sm?: number; md?: number }
}) => {
  // P0-2 (Impeccable critique): "ร้านใหม่" ผูกกับ completionRate === null (ต้องมีออเดอร์จบจริง >= 3)
  // ไม่ใช่ trustScore — คะแนนถูกดันด้วยรีวิวเพื่อนได้ แต่ออเดอร์จบจริงปลอมยากกว่ามาก
  // ไม่ว่าคะแนนจะสูงแค่ไหน ถ้ายังไม่ผ่าน 3 ออเดอร์จบ → banner เทาเสมอ (ไม่ใช้ tier gradient ที่ดูเหมือนรางวัล)
  const isNewShop = data.isNewShop ?? data.completionRate === null
  const gradient = isNewShop
    ? 'linear-gradient(135deg, #9b98a8 0%, #bdbbc7 55%, #dedce4 100%)'
    : getTierGradient(data.trustScore)

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
            // P0-2 #5: rgba(0,0,0,.12) ผิด Ink-Tinted Shadow Rule → ใช้ token เงาที่ tint ด้วย ink จริง
            boxShadow: 'var(--mui-customShadows-sm)',
            color: '#2F2B3D',
            '&:hover': {
              bgcolor: 'rgba(255,255,255,1)',
            },
          }}
        >
          <Icon icon='tabler-arrow-left' fontSize={20} />
        </IconButton>
      </Link>

      {/* P0-2 #2: pill "ร้านใหม่" — บอกตรง ๆ ว่ายังไม่มีประวัติเพียงพอ แทนที่จะปล่อยให้ banner เทาดูเหมือนบั๊ก */}
      {isNewShop && (
        <Box
          sx={{
            position: 'absolute',
            left: { xs: 16, md: 24 },
            bottom: 12,
            zIndex: 3,
            display: 'inline-flex',
            alignItems: 'center',
            bgcolor: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.6)',
            boxShadow: '0 2px 8px rgb(47 43 61 / 0.12)',
            borderRadius: '9999px',
            px: '10px',
            py: '4px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#2F2B3D',
          }}
        >
          ร้านใหม่ · ยังไม่มีประวัติเพียงพอ
        </Box>
      )}
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

  // P0-1 (Impeccable critique): สัญลักษณ์ยืนยันตัวตน 3 ระดับ แทน binary เขียว
  // L1 OTP = เทา (ซิมเติมเงินซื้อได้ที่เซเว่น — เขียวต้องสงวนให้หลักฐานที่ปลอมยาก)
  // L2 เอกสาร / L3 ธุรกิจ = เขียวเดียวกัน (แยก 3 สีจะทำให้ความหมาย "เขียว = เชื่อได้" เฟ้อ — ต่างกันที่ข้อความพอ)
  const verifyChip =
    data.maxVerifyLevel >= 3
      ? { text: 'ยืนยันธุรกิจแล้ว', icon: 'tabler-building-store' }
      : data.maxVerifyLevel === 2
        ? { text: 'ยืนยันเอกสารแล้ว', icon: 'tabler-file-certificate' }
        : data.maxVerifyLevel === 1
          ? { text: 'ยืนยันเบอร์โทรแล้ว', icon: 'tabler-phone-check' }
          : null
  const isGreenVerify = data.maxVerifyLevel >= 2
  // D9: avatar corner badge (✓) แสดงเฉพาะ L2+ (เอกสาร/ธุรกิจ) — L1 OTP ไม่ใช่หลักฐานที่ปลอมยากพอจะขึ้นเครื่องหมายเขียวบนอวตาร์
  const showAvatarBadge = data.maxVerifyLevel >= 2

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
        {/* Avatar overlap cover (mt ลบ) — 112px มือถือ → 152px desktop(md+) + verify badge มุมขวาล่าง */}
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
              boxShadow: '0 6px 14px rgba(15,23,42,.18)',
              fontSize: '2.75rem',
              fontWeight: 800,
              bgcolor: '#2F2B3D1F',
              color: '#2F2B3D',
            }}
          >
            {displayName.slice(0, 1)}
          </Avatar>
          {/* D9: verify badge มุมขวาล่าง — carve-out dingbat ✓ (single-color typographic, ไม่ใช่ emoji)
              decorative: accessible name มาจาก verifyChip ข้างล่างแล้ว (ไม่พึ่ง title บน element นี้อีก) */}
          {showAvatarBadge && (
            <Box
              component='span'
              aria-hidden='true'
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
            {/* P0-1: chip ยืนยันตัวตน 3 ระดับ แทน bare icon เดิม — เป็น content node จริง screen reader อ่านได้เอง */}
            {verifyChip && (
              <Box
                component='span'
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  bgcolor: isGreenVerify ? 'rgb(40 199 111 / 0.16)' : 'rgb(47 43 61 / 0.08)',
                  color: isGreenVerify ? '#28C76F' : 'rgba(47,43,61,0.7)',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '9999px',
                  px: '8px',
                  py: '3px',
                  lineHeight: 1.3,
                }}
              >
                <Icon icon={verifyChip.icon} fontSize={13} aria-hidden='true' />
                {verifyChip.text}
              </Box>
            )}
          </Box>

          <Typography component='p' sx={{ m: 0, mt: '1px', fontSize: '14px', color: '#808390', lineHeight: 1.3 }}>
            @{data.username}
          </Typography>

          {/* metric row เดิม (ออเดอร์ · ★รีวิว · tier chip) ถูกลบออกที่นี่ — Desktop layout redesign
              ข้อมูลชุดเดียวกันย้ายไปอยู่ที่ ProfileStatsBar ซึ่ง render อยู่ใต้บล็อกนี้ทันที
              ถ้าคงไว้จะเห็นตัวเลขชุดเดิมซ้ำกัน 2 แถวติดกัน ขัดเจตนา layout ที่ต้องการความสะอาดแบบ IG */}
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
