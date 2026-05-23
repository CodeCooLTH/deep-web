'use client'

// MUI Imports
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'

// Icon Imports
import { Icon } from '@iconify/react'

// Component Imports
import AboutOverview from './AboutOverview'
import type { AboutOverviewData } from './AboutOverview'
import VerificationBadges from './VerificationBadges'
import AchievementBadges from './AchievementBadges'
import RecentReviews from './RecentReviews'
import CustomChip from '@core/components/mui/Chip'

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
  about: AboutOverviewData
  verification: {
    level: number
    label: string
    icon: string
    active: boolean
  }[]
  achievements: {
    id: string
    name: string
    nameEN: string
    icon: string
    /** URL รูป badge; null = ใช้ emoji fallback */
    imageUrl?: string | null
  }[]
  reviews: {
    id: string
    rating: number
    comment: string | null
    createdAt: string
    itemName: string | null
  }[]
  avgRating: number
  /** จำนวนออเดอร์ที่สำเร็จ (status CONFIRMED) */
  completedOrders: number
  /** จำนวนออเดอร์ทั้งหมด (CONFIRMED + CANCELLED) — ใช้คำนวณ completionRate */
  totalOrders: number
  /** จำนวนรีวิวทั้งหมด — aggregate จาก DB ทั้งหมด ไม่ใช่แค่ตัวอย่าง 10 รายการ */
  reviewCount: number
  /** อัตราการเสร็จสมบูรณ์ (0–100) */
  completionRate: number
  /** FR-9.5: true เมื่อบัญชี buyer-only (ไม่มีร้าน) — แสดง empty-state ชวนเปิดร้านแทน achievement badge */
  openShopEmptyState?: boolean
  // ── ใหม่ (T4) ──
  products: SerializedProduct[]
  totalBadgeCount: number
  /** แสดง rating summary เฉพาะเมื่อมีรีวิวเพียงพอ (caller ส่ง true เมื่อ reviewCount ≥ 3) */
  showRating: boolean
}

// ── ข้อมูล cross-platform hardcode (D2 + D4) ──
// ทำไม: data จริงยังไม่มี — spec กำหนดให้แสดงค่าตัวอย่าง + ป้าย "ตัวอย่าง" (D5)
const PLATFORMS = [
  { key: 'shopee', label: 'Shopee', icon: 'simple-icons:shopee', color: '#EE4D2D', orders: '8,500', rating: '4.8' },
  { key: 'lazada', label: 'Lazada', icon: null, color: '#0F146D', orders: '1,200', rating: '4.9' },
  { key: 'tiktok', label: 'TikTok', icon: 'simple-icons:tiktok', color: '#010101', orders: '240', rating: '4.7' },
  { key: 'deep', label: 'Deep', icon: null, color: '#4F46E5', orders: '847', rating: '4.9' },
] as const

// ── Stats Bar ──
// ทำไม: แสดง order count + rating + completion rate แบบ inline text — ตาม mockup .stats-text
const StatsBar = ({
  completedOrders,
  avgRating,
  reviewCount,
  completionRate,
  showRating,
  totalOrders,
}: {
  completedOrders: number
  avgRating: number
  reviewCount: number
  completionRate: number
  showRating: boolean
  totalOrders: number
}) => {
  return (
    <Box className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--mui-palette-text-secondary)]'>
      <span className='font-semibold text-[var(--mui-palette-text-primary)]'>
        {completedOrders.toLocaleString('th-TH')}
      </span>{' '}
      ออเดอร์สำเร็จ
      {showRating && (
        <>
          <span className='opacity-30'>·</span>
          <span className='flex items-center gap-1'>
            <i className='tabler-star-filled text-[var(--mui-palette-warning-main)] text-xs' />
            <span className='font-semibold text-[var(--mui-palette-text-primary)]'>
              {avgRating.toFixed(1)}
            </span>
            <span className='text-xs'>({reviewCount} รีวิว)</span>
          </span>
        </>
      )}
      {/* ซ่อน completion rate เมื่อไม่มีออเดอร์เลย — หารด้วย 0 ไม่ meaningful */}
      {totalOrders > 0 && (
        <>
          <span className='opacity-30'>·</span>
          <span>
            <span className='font-semibold text-[var(--mui-palette-text-primary)]'>
              {completionRate.toFixed(0)}%
            </span>{' '}
            เสร็จสมบูรณ์
          </span>
        </>
      )}
    </Box>
  )
}

// ── Cross-platform placeholder section ──
// ทำไม: D2 + D5 — section นี้เป็น placeholder hardcode; ต้องมีป้าย "ตัวอย่าง" ทุกที่ชัดเจน
const CrossPlatformSection = () => {
  return (
    <Card>
      <CardContent className='flex flex-col gap-4'>
        {/* header + ป้าย "ตัวอย่าง" */}
        <div className='flex items-center gap-2 flex-wrap'>
          <Typography className='uppercase text-xs font-bold tracking-widest' color='text.disabled'>
            สถิติจากแพลตฟอร์มอื่น
          </Typography>
          <CustomChip color='warning' size='small' label='ตัวอย่าง' />
        </div>

        {/* platform pills */}
        <Box className='flex flex-wrap items-center gap-x-3 gap-y-2 text-sm'>
          {PLATFORMS.map((p, idx) => (
            <span key={p.key} className='flex items-center gap-x-3 flex-wrap'>
              <span className='flex items-center gap-1.5 whitespace-nowrap'>
                {/* platform logo: ใช้ Iconify ถ้ามี; fallback text label + สี brand (D8) */}
                {p.icon ? (
                  <Icon icon={p.icon} style={{ color: p.color, fontSize: 16 }} aria-label={p.label} />
                ) : (
                  <span className='text-xs font-bold' style={{ color: p.color }}>
                    {p.label}
                  </span>
                )}
                {/* แสดงชื่อเฉพาะ platform ที่ไม่มี icon (Lazada) เพื่อระบุตัวตน */}
                {p.icon && (
                  <span className='text-xs text-[var(--mui-palette-text-disabled)]'>{p.label}</span>
                )}
                <span className='font-bold text-[var(--mui-palette-text-primary)]'>{p.orders}</span>
                <span className='text-[var(--mui-palette-warning-main)] text-xs font-semibold'>
                  ★{p.rating}
                </span>
              </span>
              {idx < PLATFORMS.length - 1 && (
                <span className='text-[var(--mui-palette-text-disabled)] opacity-40 font-light'>·</span>
              )}
            </span>
          ))}
        </Box>

        {/* on-time + response time (hardcode D4) */}
        <Box className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--mui-palette-text-secondary)]'>
          <span className='flex items-center gap-1'>
            <i className='tabler-clock-check text-[var(--mui-palette-success-main)]' />
            98% ส่งตรงเวลา
          </span>
          <span className='flex items-center gap-1'>
            <i className='tabler-message-dots text-[var(--mui-palette-info-main)]' />
            ตอบภายใน 2 ชั่วโมง
          </span>
        </Box>

        {/* fine print */}
        <Typography variant='caption' color='text.disabled' className='leading-snug'>
          *ข้อมูลตัวอย่างเพื่อแสดงรูปแบบ ไม่ใช่ยอดจริง
        </Typography>
      </CardContent>
    </Card>
  )
}

// ── Product grid tile ──
// ทำไม: แยก sub-component เพื่ออ่านง่าย; hover overlay ใช้ Tailwind group-hover (ทำงานใน client component ได้)
const ProductTile = ({ product }: { product: SerializedProduct }) => {
  const price = parseFloat(product.price)

  return (
    <Box
      className='group relative overflow-hidden rounded-sm bg-[var(--mui-palette-action-hover)]'
      sx={{ aspectRatio: '1', position: 'relative' }}
    >
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt={product.name}
          loading='lazy'
          className='w-full h-full object-cover transition-transform duration-300 group-hover:scale-105'
          style={{ display: 'block' }}
        />
      ) : (
        // ทำไม: สินค้าไม่มีรูป — แสดง placeholder สีเทา + icon แทนรูปเสีย
        <Box className='w-full h-full flex items-center justify-center text-[var(--mui-palette-text-disabled)]'>
          <Icon icon='tabler-photo' fontSize={32} />
        </Box>
      )}

      {/* hover overlay — name + price */}
      <Box
        className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-2'
        sx={{ background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.82))' }}
      >
        <Typography
          className='text-white text-xs font-semibold leading-tight line-clamp-2'
          sx={{ textShadow: '0 1px 2px rgba(0,0,0,.4)' }}
        >
          {product.name}
        </Typography>
        <Typography
          className='text-white text-sm font-bold mt-0.5'
          sx={{ textShadow: '0 1px 2px rgba(0,0,0,.4)' }}
        >
          ฿{isNaN(price) ? product.price : price.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        </Typography>
      </Box>
    </Box>
  )
}

// ── Product grid section ──
const ProductGrid = ({ products }: { products: SerializedProduct[] }) => {
  return (
    <Card>
      <CardContent className='flex flex-col gap-4'>
        <Typography className='uppercase text-xs font-bold tracking-widest' color='text.disabled'>
          สินค้าของร้าน
        </Typography>

        {products.length === 0 ? (
          // empty state — spec ข้อ 7
          <Box className='flex flex-col items-center gap-3 py-8 text-center'>
            <Icon
              icon='tabler-photo-off'
              className='text-5xl text-[var(--mui-palette-text-disabled)]'
            />
            <Typography color='text.secondary' className='text-sm'>
              ร้านนี้ยังไม่มีสินค้า
            </Typography>
          </Box>
        ) : (
          // 3-column Instagram grid — gap เล็กเพื่อให้ดู compact เหมือน mockup
          <Grid container spacing={0.5}>
            {products.map((product) => (
              <Grid key={product.id} size={{ xs: 4 }}>
                <ProductTile product={product} />
              </Grid>
            ))}
          </Grid>
        )}
      </CardContent>
    </Card>
  )
}

// ── Chat FAB ──
// ทำไม: disabled + tooltip "เร็ว ๆ นี้" ตาม D3 (ยังไม่มี backend chat); sticky bottom เหมือน mockup
const ChatFab = () => {
  return (
    <Box className='flex justify-center mt-4'>
      {/* ห่อ Button disabled ด้วย <span> ก่อน Tooltip — ทำไม: MUI disabled button ไม่ trigger pointer events → Tooltip ไม่ทำงาน */}
      <Tooltip title='เร็ว ๆ นี้' placement='top'>
        <span>
          <Button
            variant='contained'
            disabled
            startIcon={<Icon icon='tabler-message-circle' />}
            sx={{
              position: 'sticky',
              bottom: 32,
              borderRadius: 999,
              px: 4,
              py: 1.5,
              fontWeight: 700,
              fontSize: '0.9rem',
            }}
          >
            แชทกับร้านนี้
          </Button>
        </span>
      </Tooltip>
    </Box>
  )
}

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/index.tsx
// (Grid/Card layout reference — 5/7 left/right split)
// D7 approved exception: StatsBar, CrossPlatformSection, ProductGrid, ChatFab compose จาก MUI primitive
// Adapted: เพิ่ม stats bar, cross-platform placeholder, product grid, Chat FAB ตาม spec 2026-05-23
const ProfileTab = ({ data }: { data: ProfileTabData }) => {
  // อ่าน stats โดยตรงจาก top-level fields ของ ProfileTabData (type-safe)
  // ทำไม: ย้ายออกจาก about cast — about เป็น AboutOverviewData บริสุทธิ์ ไม่ยัด stats เพิ่ม
  const { completedOrders, totalOrders, reviewCount, completionRate } = data

  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12, md: 5, lg: 4 }} className='order-last md:order-first'>
        <Grid container spacing={6}>
          <Grid size={{ xs: 12 }}>
            <AboutOverview data={data.about} />
          </Grid>
          {/* Stats bar — ข้อมูลจริงจาก DB (🟢 Live) */}
          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <StatsBar
                  completedOrders={completedOrders}
                  avgRating={data.avgRating}
                  reviewCount={reviewCount}
                  completionRate={completionRate}
                  showRating={data.showRating}
                  totalOrders={totalOrders}
                />
              </CardContent>
            </Card>
          </Grid>
          {/* Cross-platform placeholder — 🟡 Placeholder (D2 + D5) */}
          <Grid size={{ xs: 12 }}>
            <CrossPlatformSection />
          </Grid>
        </Grid>
      </Grid>

      <Grid size={{ xs: 12, md: 7, lg: 8 }} className='order-first md:order-last'>
        <Grid container spacing={6}>
          <Grid size={{ xs: 12 }}>
            <VerificationBadges items={data.verification} />
          </Grid>
          {data.achievements.length > 0 && (
            <Grid size={{ xs: 12 }}>
              <AchievementBadges items={data.achievements} totalCount={data.totalBadgeCount} />
            </Grid>
          )}
          {/* FR-9.5: บัญชี buyer-only — แสดง empty-state ชวนเปิดร้าน แทนการแสดง achievement badge */}
          {data.openShopEmptyState && data.achievements.length === 0 && (
            <Grid size={{ xs: 12 }}>
              <Card variant='outlined'>
                <CardContent className='flex flex-col items-center gap-3 py-8 text-center'>
                  <Icon icon='tabler-building-store' className='text-5xl text-[var(--mui-palette-primary-main)]' />
                  <Typography variant='h6'>เปิดร้านเพื่อสะสม Achievement Badge</Typography>
                  <Typography variant='body2' color='text.secondary'>
                    บัญชีนี้ยังไม่มีร้านค้า Achievement Badge จะแสดงเมื่อเปิดร้านและเริ่มขายสินค้า
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          )}
          <Grid size={{ xs: 12 }}>
            <RecentReviews reviews={data.reviews} avgRating={data.avgRating} />
          </Grid>
          {/* Product grid — 🟢 Live (ซ่อนเมื่อ buyer-only ไม่มีร้าน) */}
          {!data.openShopEmptyState && (
            <Grid size={{ xs: 12 }}>
              <ProductGrid products={data.products} />
            </Grid>
          )}
        </Grid>
      </Grid>

      {/* Chat FAB — ⚪ Disabled "เร็ว ๆ นี้" (D3) */}
      <Grid size={{ xs: 12 }}>
        <ChatFab />
      </Grid>
    </Grid>
  )
}

export default ProfileTab
