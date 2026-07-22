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

// Type Imports — TrustScoreCardData['tierColor'] ใช้ประกาศ type ProfileTabData.tierColor ด้านล่าง (type-only, ไม่ import component)
import type { TrustScoreCardData } from '../TrustScoreCard'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/index.tsx
// Redesign (2026-07-04, hybrid FB Page × Threads spec) — เนื้อหา left/right column เดิม
// Desktop layout redesign (IG-style + trust data): ยุบ ProfileLeftContent ทิ้งทั้งหมด — เนื้อหากระจายไปที่
// ProfileStatsBar/BadgePillRow (ใต้ identity bar) + TrustDetailSection (full-bleed band ใต้ product grid) แทน
// ProfileRightContent เหลือแค่ product grid (การ์ดชื่อเสียงข้ามแพลตฟอร์มเดิมไม่กลับมา — ถูกลบทิ้งโดยตั้งใจ 2026-07-22
// impeccable critique P0: ตัวเลข hardcode ของ Shopee/Lazada/TikTok)
// ProductCard คงเดิม (Base: theme .../apps/academy/my-courses/Courses.tsx bordered-card pattern)

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
  /** feature 00017 — ร้าน LODGING ใช้ grid เดียวกันแต่เนื้อหาเป็นห้องพัก
   *  optional + default 'PRODUCT' เพื่อไม่กระทบผู้เรียกเดิม (/u/[username]) */
  itemKind?: 'PRODUCT' | 'ROOM'
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
        border: '1px solid #2F2B3D1F',
        borderRadius: '14px',
        overflow: 'hidden',
        bgcolor: 'white',
        transition: 'transform .18s ease, box-shadow .18s ease',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 10px 24px rgba(47,43,61,.10)' },
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
          <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#808390' }}>
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
            color: '#2F2B3D',
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

// ── ProfileRightContent — Pinned products + All products (product grid เท่านั้น) ──
// ทำไม: แยกออกมาเพื่อให้ index.tsx เรียกใช้ได้ตรง ๆ
// Desktop layout redesign: การ์ดชื่อเสียงข้ามแพลตฟอร์มเดิม ไม่กลับมา (ถูกลบทิ้งโดยตั้งใจ)
// (ProfileLeftContent เดิม/medal-frame achievements ก็ยุบทิ้งไปพร้อมกัน — ดู ProfileStatsBar/BadgePillRow/TrustDetailSection)
// S-19 (extension #1 Chat Product Context Card): shopId/isOwnShop รับแยกจาก data (มาจาก ProfileHeaderData
// ไม่ใช่ ProfileTabData) prop-drill ต่อไปให้ ProductCard ตาม UX spec data-plumbing
export const ProfileRightContent = ({
  data,
  shopId,
  isOwnShop,
}: {
  data: Pick<ProfileTabData, 'pinnedProducts' | 'otherProducts' | 'openShopEmptyState' | 'itemKind'>
  shopId?: string | null
  isOwnShop?: boolean
}) => {
  const { pinnedProducts, otherProducts, openShopEmptyState, itemKind = 'PRODUCT' } = data
  const hasAnyProduct = pinnedProducts.length > 0 || otherProducts.length > 0
  // ร้านบ้านพักใช้ grid เดียวกับสินค้า (ความสม่ำเสมอของหน้าสำคัญกว่าการมี layout เฉพาะ)
  // เปลี่ยนเฉพาะถ้อยคำให้ตรงกับสิ่งที่ผู้ใช้เห็นจริง
  const isRoom = itemKind === 'ROOM'
  const L = isRoom
    ? { empty: 'ร้านนี้ยังไม่มีห้องพัก', pinned: 'ห้องพักแนะนำ', all: 'ห้องพักทั้งหมด' }
    : { empty: 'ร้านนี้ยังไม่มีสินค้า', pinned: 'สินค้าปักหมุด', all: 'สินค้าทั้งหมด' }

  if (openShopEmptyState) return null

  return (
    <>
      {!hasAnyProduct ? (
        <Box id='pinned-products' sx={{ px: { xs: '20px', md: '24px' }, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', py: '48px', textAlign: 'center' }}>
          <Icon icon='tabler-photo-off' style={{ fontSize: 48, color: '#808390' }} />
          <Box>
            <Typography sx={{ color: '#808390', fontSize: '14px' }}>{L.empty}</Typography>
            <Typography sx={{ color: '#808390', fontSize: '12px', mt: '4px' }}>ติดตามร้านนี้ไว้ก่อนนะ</Typography>
          </Box>
        </Box>
      ) : (
        <>
          {/* ── สินค้าปักหมุด (Phase 3: pinnedProducts จริงจาก getPinnedProducts — ซ่อนทั้งโซนเมื่อว่าง TFR-PIN-07) ── */}
          {pinnedProducts.length > 0 && (
            <Box id='pinned-products' sx={{ px: { xs: '20px', md: '24px' }, pt: '18px', pb: '16px' }}>
              <Typography
                component='h3'
                sx={{ m: 0, mb: '12px', fontSize: '13px', fontWeight: 600, color: '#2F2B3D' }}
              >
                {L.pinned}
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  // 3 คอลัมน์คงที่ตั้งแต่ md(900) ขึ้นไป (ไม่ไล่ 2→3→4 ตาม breakpoint เหมือนเดิม)
                  gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
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
                sx={{ m: 0, mb: '12px', fontSize: '13px', fontWeight: 600, color: '#2F2B3D' }}
              >
                {L.all}
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  // 3 คอลัมน์คงที่ตั้งแต่ md(900) ขึ้นไป (ไม่ไล่ 2→3→4 ตาม breakpoint เหมือนเดิม)
                  gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
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
    </>
  )
}

export default ProfileRightContent
