'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Next/Auth Imports — S-19 (extension #1 Chat Product Context Card) login-gate ปุ่ม "สอบถามสินค้านี้"
// pattern: src/views/pages/user-profile/UserProfileHeader.tsx handleChatClick (AuctionBidPanel.tsx:114-121)
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

// Component Imports (BadgeChip ใช้ useState สำหรับ image error handling)
import AchievementBadgeRow from './AchievementBadgeRow'
import TrustScoreCard from '../TrustScoreCard'
import type { TrustScoreCardData } from '../TrustScoreCard'
import PlatformReputationList from '../PlatformReputationList'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/index.tsx
// Redesign (2026-07-04, hybrid FB Page × Threads spec):
//   - Left column content: About(bio/location/joined/response-rate) + TrustScoreCard + Achievements (medal frame)
//   - Right column content: Pinned products(slice 0-3) + All products(slice 3+) + PlatformReputationList
//   - ProductCard ใหม่ (Base: theme .../apps/academy/my-courses/Courses.tsx bordered-card pattern) แทน ProductTile IG-edge เดิม
//   - ตัด inline "Deep + Shopee/Lazada/TikTok" text-line เดิมออก (ย้ายไป PlatformReputationList component)

// ── Type: สินค้าที่ serialize จาก RSC boundary (Decimal → string) ──
export type SerializedProduct = {
  id: string
  name: string
  /** Decimal serialize แล้วเป็น string ทศนิยม 2 (e.g. "120.00") */
  price: string
  /** images[0] ?? null */
  imageUrl: string | null
}

export type ProfileTabData = {
  achievements: {
    id: string
    name: string
    nameEN: string
    icon: string
    /** URL รูป badge; null = ใช้ emoji fallback */
    imageUrl?: string | null
  }[]
  /** FR-9.5: true เมื่อบัญชี buyer-only (ไม่มีร้าน) — ซ่อน products + platforms ทั้งชุด */
  openShopEmptyState?: boolean
  // Phase 3 (feature 00013 Pin Products, TFR-PIN-06/07): แทน products เดี่ยว + splitPinnedProducts (interim)
  // ด้วยข้อมูลปักหมุดจริงจาก pin.service — pinnedProducts มาจาก getPinnedProducts, otherProducts มาจาก
  // getProductsByShop({excludePinned:true})
  pinnedProducts: SerializedProduct[]
  otherProducts: SerializedProduct[]
  totalBadgeCount: number
  // ── About section (ย้ายมาจาก identity เดิมตาม redesign) ──
  bio?: string | null
  location?: string | null
  /** "มิ.ย. 2568" — formatMonthYearTH() ผลลัพธ์ */
  memberSince: string
  // S-25 (extension #2 Response-rate metric): denormalized field จาก Shop (cron รายวัน S-24)
  chatResponseRate?: number | null
  chatMedianResponseSec?: number | null
  chatResponseSampleSize?: number | null
  // ── TrustScoreCard data ──
  trustScore: number
  tierLabel: string
  tierColor: TrustScoreCardData['tierColor']
  nextTierLabel: string | null
  pointsToNext: number | null
  verifiedLevels: number[]
}

// ── FR-RESP-06: format response time เป็นข้อความไทย ──
// <60นาที(3600วิ)→"~N นาที" · 1-24ชม.→"~N ชม." · 24-48ชม.→"~1 วัน" · >48ชม.→"2+ วัน"
// null → ไม่แสดงบรรทัด time (แต่บรรทัด rate ยังแสดงได้ถ้ามี)
const formatResponseTime = (seconds: number | null | undefined): string | null => {
  if (seconds == null) return null
  if (seconds < 3600) return `~${Math.max(1, Math.round(seconds / 60))} นาที`
  if (seconds < 86400) return `~${Math.max(1, Math.round(seconds / 3600))} ชม.`
  if (seconds < 172800) return '~1 วัน'
  return '2+ วัน'
}

// ── ProductCard ──
// Base: theme/vuexy/typescript-version/full-version/src/views/apps/academy/my-courses/Courses.tsx
// (bordered card: <div className='border rounded bs-full'> → image top → content padded → action button ท้ายการ์ด)
// Adapted: แปลง Tailwind utility → MUI sx (ตาม convention ไฟล์นี้เดิม); image aspect 1/1 แทน full-width auto-height
// S-19 (extension #1 Chat Product Context Card): shopId/isOwnShop prop-drill จาก UserProfile → ProfileRightContent → ProductCard
// ตัด ★rating ต่อสินค้าออก (2026-07-04 fix): Product schema ไม่มี rating รายชิ้นจริง — โชว์ shop avgRating ซ้ำทุกใบ = เลขปลอมต่อชิ้น
// ขัด ethos เดียวกับที่ตัดผู้ติดตามทิ้ง แถวราคาจึงเหลือแค่ราคาอย่างเดียว
const ProductCard = ({
  product,
  pinned,
  shopId,
  isOwnShop,
}: {
  product: SerializedProduct
  pinned: boolean
  shopId: string | null
  isOwnShop?: boolean
}) => {
  const price = parseFloat(product.price)
  const priceLabel = `฿${isNaN(price) ? product.price : price.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

  const router = useRouter()
  const { status: sessionStatus } = useSession()

  // FR-CTX-01/02/03: ปุ่ม "สอบถามสินค้านี้" — ซ่อนเมื่อ isOwnShop หรือไม่มีร้าน (shopId null)
  const showAskButton = Boolean(shopId) && !isOwnShop

  const handleAskClick = () => {
    if (!shopId) return
    const target = `/messages/${shopId}?productId=${product.id}`
    if (sessionStatus !== 'authenticated') {
      router.push(`/auth/sign-in?callbackUrl=${encodeURIComponent(target)}`)
      return
    }
    router.push(target)
  }

  return (
    <Box
      sx={{
        position: 'relative',
        border: '1px solid #E2E8F0',
        borderRadius: '14px',
        overflow: 'hidden',
        bgcolor: 'white',
        transition: 'transform .18s ease, box-shadow .18s ease',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 10px 24px rgba(15,23,42,.10)' },
      }}
    >
      {/* flag "ปักหมุด" มุมซ้ายบน (Phase 3: pinned=true มาจาก getPinnedProducts จริงแล้ว) */}
      {pinned && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            fontSize: '10px',
            fontWeight: 700,
            borderRadius: '999px',
            px: '8px',
            py: '3px',
          }}
        >
          <Icon icon='tabler-pin-filled' fontSize={11} />
          ปักหมุด
        </Box>
      )}

      <Box sx={{ position: 'relative', aspectRatio: '1/1', bgcolor: '#F1F5F9' }}>
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            loading='lazy'
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
            <Icon icon='tabler-photo' fontSize={30} />
          </Box>
        )}
      </Box>

      <Box sx={{ p: '10px 12px 12px' }}>
        <Typography
          component='p'
          sx={{
            m: 0,
            fontSize: '13px',
            fontWeight: 700,
            color: '#0F172A',
            lineHeight: 1.35,
            minHeight: '2.7em',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {product.name}
        </Typography>

        <Typography component='p' sx={{ m: 0, mt: '6px', fontSize: '14px', fontWeight: 800, color: 'primary.main' }}>
          {priceLabel}
        </Typography>

        {showAskButton && (
          <Button
            fullWidth
            size='small'
            variant='tonal'
            onClick={handleAskClick}
            startIcon={<Icon icon='tabler-message-question' fontSize={14} />}
            sx={{ mt: '10px', fontSize: '12px', textTransform: 'none' }}
          >
            สอบถามสินค้านี้
          </Button>
        )}
      </Box>
    </Box>
  )
}

// ── ProfileLeftContent — About + TrustScoreCard + Achievements (medal frame) ──
// ทำไม: แยกออกมาเพื่อให้ desktop wrapper วางใน left panel (sticky 340px) ของ grid ได้
export const ProfileLeftContent = ({
  data,
}: {
  data: Pick<
    ProfileTabData,
    | 'bio'
    | 'location'
    | 'memberSince'
    | 'chatResponseRate'
    | 'chatMedianResponseSec'
    | 'chatResponseSampleSize'
    | 'trustScore'
    | 'tierLabel'
    | 'tierColor'
    | 'nextTierLabel'
    | 'pointsToNext'
    | 'verifiedLevels'
    | 'achievements'
    | 'totalBadgeCount'
  >
}) => {
  const {
    bio,
    location,
    memberSince,
    chatResponseRate,
    chatMedianResponseSec,
    chatResponseSampleSize,
    trustScore,
    tierLabel,
    tierColor,
    nextTierLabel,
    pointsToNext,
    verifiedLevels,
    achievements,
    totalBadgeCount,
  } = data

  // FR-RESP-04: sample-gate ≥3 — ต่ำกว่าซ่อนทั้งบรรทัด response (ไม่โชว์เลขปลอม)
  const showResponse = chatResponseSampleSize != null && chatResponseSampleSize >= 3 && chatResponseRate != null
  const responseTimeLabel = formatResponseTime(chatMedianResponseSec)

  return (
    <>
      {/* ── About section ── */}
      <Box id='about' sx={{ px: { xs: '20px', md: '24px' }, pt: '18px', pb: '8px' }}>
        <Typography
          component='h3'
          sx={{ m: 0, mb: '10px', fontSize: '13px', fontWeight: 700, color: '#64748B', letterSpacing: '.06em', textTransform: 'uppercase' }}
        >
          เกี่ยวกับร้าน
        </Typography>

        {bio && (
          <Typography component='p' sx={{ m: 0, mb: '10px', fontSize: '14px', color: '#0F172A', lineHeight: 1.5 }}>
            {bio}
          </Typography>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#64748B' }}>
          {location && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon='tabler-map-pin' fontSize={14} />
              {location}
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icon icon='tabler-calendar' fontSize={14} />
            เข้าร่วม {memberSince}
          </Box>
          {/* S-25 (extension #2 Response-rate metric): ย้ายจาก stats-text เดิม → มาเป็นบรรทัดใน About */}
          {showResponse && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <Icon icon='tabler-message' fontSize={14} />
              ตอบกลับ <Box component='strong' sx={{ color: '#0F172A' }}>{Math.round(chatResponseRate as number)}%</Box>
              {responseTimeLabel && (
                <>
                  · ตอบเฉลี่ย <Box component='strong' sx={{ color: '#0F172A' }}>{responseTimeLabel}</Box>
                </>
              )}
            </Box>
          )}
        </Box>
      </Box>

      {/* ── Trust Score Card ── */}
      <TrustScoreCard data={{ trustScore, tierLabel, tierColor, nextTierLabel, pointsToNext, verifiedLevels }} />

      {/* ── Achievements (medal frame) ── */}
      {achievements.length > 0 && (
        <Box id='achievements' sx={{ px: { xs: '20px', md: '24px' }, pt: '4px', pb: '20px' }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: '10px' }}>
            <Typography
              component='h3'
              sx={{ m: 0, fontSize: '13px', fontWeight: 700, color: '#64748B', letterSpacing: '.06em', textTransform: 'uppercase' }}
            >
              การรับรอง
            </Typography>
            {totalBadgeCount > 0 && (
              <Typography component='span' sx={{ fontSize: '12px', color: 'primary.main', fontWeight: 600, cursor: 'default', userSelect: 'none' }}>
                ดูทั้งหมด {totalBadgeCount} →
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
            <AchievementBadgeRow items={achievements} />
          </Box>
        </Box>
      )}
    </>
  )
}

// ── ProfileRightContent — Pinned products + All products + Platform reputation ──
// ทำไม: แยกออกมาเพื่อให้ desktop wrapper วางใน right panel ของ grid ได้
// S-19 (extension #1 Chat Product Context Card): shopId/isOwnShop รับแยกจาก data (มาจาก ProfileHeaderData
// ไม่ใช่ ProfileTabData) prop-drill ต่อไปให้ ProductCard ตาม UX spec data-plumbing
export const ProfileRightContent = ({
  data,
  shopId,
  isOwnShop,
}: {
  data: Pick<ProfileTabData, 'pinnedProducts' | 'otherProducts' | 'openShopEmptyState'>
  shopId?: string | null
  isOwnShop?: boolean
}) => {
  const { pinnedProducts, otherProducts, openShopEmptyState } = data
  const hasAnyProduct = pinnedProducts.length > 0 || otherProducts.length > 0

  if (openShopEmptyState) return null

  return (
    <>
      {!hasAnyProduct ? (
        <Box id='pinned-products' sx={{ px: { xs: '20px', md: '24px' }, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', py: '48px', textAlign: 'center' }}>
          <Icon icon='tabler-photo-off' style={{ fontSize: 48, color: '#94A3B8' }} />
          <Box>
            <Typography sx={{ color: '#64748B', fontSize: '14px' }}>ร้านนี้ยังไม่มีสินค้า</Typography>
            <Typography sx={{ color: '#94A3B8', fontSize: '12px', mt: '4px' }}>ติดตามร้านนี้ไว้ก่อนนะ</Typography>
          </Box>
        </Box>
      ) : (
        <>
          {/* ── สินค้าปักหมุด (Phase 3: pinnedProducts จริงจาก getPinnedProducts — ซ่อนทั้งโซนเมื่อว่าง TFR-PIN-07) ── */}
          {pinnedProducts.length > 0 && (
            <Box id='pinned-products' sx={{ px: { xs: '20px', md: '24px' }, pt: '18px', pb: '16px' }}>
              <Typography
                component='h3'
                sx={{ m: 0, mb: '12px', fontSize: '13px', fontWeight: 700, color: '#64748B', letterSpacing: '.06em', textTransform: 'uppercase' }}
              >
                สินค้าปักหมุด
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
                  gap: '12px',
                }}
              >
                {pinnedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    pinned
                    shopId={shopId ?? null}
                    isOwnShop={isOwnShop}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* ── สินค้าทั้งหมด (Phase 3: otherProducts = getProductsByShop excludePinned — ซ่อนเมื่อว่าง) ── */}
          {otherProducts.length > 0 && (
            <Box id='all-products' sx={{ px: { xs: '20px', md: '24px' }, pb: '16px' }}>
              <Typography
                component='h3'
                sx={{ m: 0, mb: '12px', fontSize: '13px', fontWeight: 700, color: '#64748B', letterSpacing: '.06em', textTransform: 'uppercase' }}
              >
                สินค้าทั้งหมด
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
                  gap: '12px',
                }}
              >
                {otherProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    pinned={false}
                    shopId={shopId ?? null}
                    isOwnShop={isOwnShop}
                  />
                ))}
              </Box>
            </Box>
          )}
        </>
      )}

      {/* ── ชื่อเสียงแพลตฟอร์มอื่น (placeholder) ── */}
      <PlatformReputationList />
    </>
  )
}

export default ProfileRightContent
