'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Component Imports (BadgeChip ใช้ useState สำหรับ image error handling)
import AchievementBadgeRow from './AchievementBadgeRow'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/index.tsx
// Rework (2026-05-23): ตัด AboutOverview, VerificationBadges, RecentReviews ออกทั้งหมด ตามคำสั่ง user
// เปลี่ยนจาก Grid 2-คอลัมน์ → single-column ไล่ลงตาม mockup_shop_profile.html (D7 approved exception)
// Responsive (2026-05-23): แยก named exports ProfileLeftContent + ProfileRightContent
//   เพื่อให้ wrapper/index.tsx จัด 3-block CSS Grid บน desktop — ProfileTab คงไว้ mobile-compatible

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
  avgRating: number
  /** จำนวนออเดอร์ที่สำเร็จ (status CONFIRMED) */
  completedOrders: number
  /** FR-9.5: true เมื่อบัญชี buyer-only (ไม่มีร้าน) */
  openShopEmptyState?: boolean
  products: SerializedProduct[]
  totalBadgeCount: number
  /** แสดง rating summary เฉพาะเมื่อมีรีวิวเพียงพอ (caller ส่ง true เมื่อ reviewCount >= 3) */
  showRating: boolean
}

// ── Cross-platform platform data (hardcode placeholder ตาม D2 + D4 + D5) ──
// ทำไม: data จริงยังไม่มี — spec กำหนดให้แสดงค่าตัวอย่าง + caption ซื่อสัตย์ (D5)
const PLATFORMS_PLACEHOLDER = [
  { key: 'shopee', label: 'Shopee', icon: 'simple-icons:shopee', color: '#EE4D2D', orders: '8.5K', rating: '4.8' },
  { key: 'lazada', label: 'Lazada', icon: null, color: '#0F146D', orders: '1.2K', rating: '4.9' },
  { key: 'tiktok', label: 'TikTok', icon: 'simple-icons:tiktok', color: '#010101', orders: '240', rating: '4.7' },
] as const

// ── Product tile ──
const ProductTile = ({ product }: { product: SerializedProduct }) => {
  const price = parseFloat(product.price)

  return (
    <Box
      className='group'
      sx={{
        position: 'relative',
        aspectRatio: '1/1',
        overflow: 'hidden',
        bgcolor: '#E2E8F0',
      }}
    >
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt={product.name}
          loading='lazy'
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform .35s ease' }}
          className='group-hover:scale-105'
        />
      ) : (
        // placeholder icon เมื่อสินค้าไม่มีรูป
        <Box
          sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}
        >
          <Icon icon='tabler-photo' fontSize={32} />
        </Box>
      )}

      {/* hover overlay — name + price ตาม mockup .prod-overlay */}
      <Box
        className='opacity-0 group-hover:opacity-100'
        sx={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, transparent 60%, rgba(0,0,0,.85))',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '10px 12px',
          transition: 'opacity .2s',
        }}
      >
        <Typography
          sx={{
            m: 0,
            fontSize: '11px',
            fontWeight: 600,
            color: 'white',
            lineHeight: 1.2,
            textShadow: '0 1px 2px rgba(0,0,0,.4)',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {product.name}
        </Typography>
        <Typography
          sx={{
            m: 0,
            mt: '2px',
            fontSize: '13px',
            fontWeight: 800,
            color: 'white',
            letterSpacing: '-0.01em',
            textShadow: '0 1px 2px rgba(0,0,0,.4)',
          }}
        >
          ฿{isNaN(price) ? product.price : price.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        </Typography>
      </Box>
    </Box>
  )
}

// ── ProfileLeftContent — Platforms + Stats (เฉพาะ seller) ──
// ทำไม: แยกออกมาเพื่อให้ desktop wrapper วางใน left panel ของ grid ได้
// mobile: ถูก render ผ่าน ProfileTab ตามลำดับเดิม — ไม่เปลี่ยน flow
export const ProfileLeftContent = ({
  data,
}: {
  data: Pick<ProfileTabData, 'completedOrders' | 'avgRating' | 'showRating' | 'openShopEmptyState'>
}) => {
  const { completedOrders, avgRating, showRating, openShopEmptyState } = data

  return (
    <>
      {/* ── Platforms (inline text) ── */}
      {/* ทำไม: แสดง Deep (ข้อมูลจริง) + Shopee/Lazada/TikTok (placeholder ตาม D2) ตาม mockup .platforms-section */}
      {!openShopEmptyState && (
        <Box sx={{ px: '24px', pt: '8px' }}>
          <Box
            component='p'
            sx={{ m: 0, fontSize: '13px', color: '#64748B', lineHeight: 1.6 }}
          >
            {/* Deep — ข้อมูลจริง */}
            <Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', mr: '2px' }}>
              <Box component='span' sx={{ fontWeight: 700, letterSpacing: '-0.01em', color: '#4F46E5', fontSize: '13px' }}>
                Deep
              </Box>
              <Box component='span' sx={{ fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                {completedOrders.toLocaleString('th-TH')}
              </Box>
              {showRating && (
                <Box component='span' sx={{ color: '#F59E0B', fontWeight: 600, fontSize: '12px' }}>
                  ★{avgRating.toFixed(1)}
                </Box>
              )}
            </Box>

            {/* Separator */}
            <Box component='span' sx={{ color: '#94A3B8', mx: '2px', fontWeight: 300 }}>·</Box>

            {/* Shopee/Lazada/TikTok — placeholder ตาม D2 */}
            {PLATFORMS_PLACEHOLDER.map((p, idx) => (
              <Box key={p.key} component='span'>
                <Box component='span' sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                  {p.icon ? (
                    <Icon icon={p.icon} style={{ color: p.color, fontSize: 15, verticalAlign: 'middle' }} aria-label={p.label} />
                  ) : (
                    <Box component='span' sx={{ fontSize: '12px', fontWeight: 700, color: p.color }}>{p.label}</Box>
                  )}
                  <Box component='span' sx={{ fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                    {p.orders}
                  </Box>
                  <Box component='span' sx={{ color: '#F59E0B', fontWeight: 600, fontSize: '12px' }}>
                    ★{p.rating}
                  </Box>
                </Box>
                {idx < PLATFORMS_PLACEHOLDER.length - 1 && (
                  <Box component='span' sx={{ color: '#94A3B8', mx: '2px', fontWeight: 300 }}>·</Box>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* ── Stats-text ── */}
      {/* ทำไม: inline text แบบ mockup .stats-text — lifetime orders (จริง); on-time/replies (placeholder ตาม D4) */}
      {!openShopEmptyState && (
        <Box sx={{ px: '24px', pt: '8px' }}>
          <Typography component='p' sx={{ m: 0, lineHeight: 1.45, fontSize: '13px', color: '#64748B' }}>
            <Box component='span' sx={{ mr: '3px' }}>📦</Box>
            <Box component='strong' sx={{ color: '#0F172A', fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
              {completedOrders.toLocaleString('th-TH')}
            </Box>
            {' '}lifetime orders
            <Box component='span' sx={{ color: '#94A3B8', mx: '6px', fontWeight: 300 }}>·</Box>
            <Box component='span' sx={{ mr: '3px' }}>🚚</Box>
            <Box component='strong' sx={{ color: '#0F172A', fontWeight: 800 }}>98%</Box>
            {' '}on-time delivery
            <Box component='span' sx={{ color: '#94A3B8', mx: '6px', fontWeight: 300 }}>·</Box>
            <Box component='span' sx={{ mr: '3px' }}>💬</Box>
            replies in{' '}
            <Box component='strong' sx={{ color: '#0F172A', fontWeight: 800 }}>~8 min</Box>
          </Typography>

          {/* D5 honesty caption — บางเบาแต่ซื่อสัตย์ */}
          <Typography
            component='p'
            sx={{ m: 0, mt: '4px', fontSize: '11px', color: '#94A3B8', lineHeight: 1.4 }}
          >
            *สถิติ Shopee/Lazada/TikTok และเวลาจัดส่ง/ตอบกลับ เป็นตัวอย่าง
          </Typography>
        </Box>
      )}
    </>
  )
}

// ── ProfileRightContent — Achievements + Shop Highlights + Chat FAB ──
// ทำไม: แยกออกมาเพื่อให้ desktop wrapper วางใน right panel ของ grid ได้
// mobile: ถูก render ผ่าน ProfileTab ตามลำดับเดิม — ไม่เปลี่ยน flow
// responsive values ใช้ MUI sx responsive object ภายใน — ไม่ต้องรับ prop จาก wrapper
export const ProfileRightContent = ({
  data,
}: {
  data: Pick<ProfileTabData, 'achievements' | 'products' | 'openShopEmptyState' | 'totalBadgeCount'>
}) => {
  const { achievements, products, openShopEmptyState, totalBadgeCount } = data

  return (
    <>
      {/* ── Featured Achievements ── */}
      {/* ทำไม: ใช้ AchievementBadges ที่ปรับ layout เป็น column-center 78px ตาม mockup .achv-section */}
      {achievements.length > 0 && (
        <Box sx={{ px: '24px', pt: '18px', pb: '12px' }}>
          {/* section-head: flex space-between ตาม mockup .section-head */}
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: '10px' }}>
            <Typography
              component='h3'
              sx={{ m: 0, fontSize: '13px', fontWeight: 700, color: '#64748B', letterSpacing: '.1em', textTransform: 'uppercase' }}
            >
              Featured Achievements
            </Typography>
            {/* "ดูทั้งหมด N →" — ไม่ใช่ link จริง (D3: feature ยังไม่มี) */}
            {totalBadgeCount > 0 && (
              <Typography
                component='span'
                sx={{ fontSize: '12px', color: '#4F46E5', fontWeight: 600, cursor: 'default', userSelect: 'none' }}
              >
                ดูทั้งหมด {totalBadgeCount} →
              </Typography>
            )}
          </Box>

          {/* achv-row: flex wrap gap 2px ตาม mockup .achv-row */}
          {/* ทำไม: desktop ชิดซ้าย (justifyContent: flex-start) ตาม spec — mobile ก็ flex-start เหมือนกัน */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '2px',
              flexWrap: 'wrap',
              justifyContent: 'flex-start',
            }}
          >
            <AchievementBadgeRow items={achievements} />
          </Box>
        </Box>
      )}

      {/* ── Shop Highlights (product grid) ── */}
      {/* ทำไม: ซ่อนเมื่อ buyer-only (openShopEmptyState) — buyer ไม่มีร้าน ไม่มีสินค้า (FR-9.5) */}
      {!openShopEmptyState && (
        <Box sx={{ pt: '8px' }}>
          {/* section-head — px 24 ตาม mockup .prod-section .section-head */}
          <Box sx={{ px: '24px', pb: '14px' }}>
            <Typography
              component='h3'
              sx={{ m: 0, fontSize: '13px', fontWeight: 700, color: '#64748B', letterSpacing: '.1em', textTransform: 'uppercase' }}
            >
              Shop Highlights
            </Typography>
          </Box>

          {/* prod-grid: CSS grid gap 3px bg #E2E8F0 ชิดขอบการ์ด (ไม่มี px) ตาม mockup .prod-grid */}
          {/* ทำไม: mobile 3 col / desktop 4 col ใช้ MUI responsive sx โดยตรง */}
          {products.length === 0 ? (
            <Box sx={{ px: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', py: '32px', textAlign: 'center' }}>
              <Icon icon='tabler-photo-off' style={{ fontSize: 48, color: '#94A3B8' }} />
              <Typography sx={{ color: '#64748B', fontSize: '14px' }}>ร้านนี้ยังไม่มีสินค้า</Typography>
            </Box>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
                gap: '3px',
                bgcolor: '#E2E8F0',
              }}
            >
              {products.map((product) => (
                <ProductTile key={product.id} product={product} />
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* ── Chat FAB ── */}
      {/* ทำไม: sticky bottom 32 ตาม mockup .fab-chat — disabled "เร็ว ๆ นี้" (D3) */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          mt: '24px',
          mb: '32px',
          position: 'sticky',
          bottom: 32,
          zIndex: 10,
        }}
      >
        <Tooltip title='เร็ว ๆ นี้' placement='top'>
          <span>
            <Button
              disabled
              startIcon={<Icon icon='tabler-message-circle' />}
              sx={{
                bgcolor: '#0F172A',
                color: 'white',
                borderRadius: '999px',
                padding: '14px 22px',
                fontSize: '14px',
                fontWeight: 700,
                boxShadow: '0 12px 30px rgba(15,23,42,.35), 0 4px 8px rgba(15,23,42,.15)',
                '&.Mui-disabled': {
                  bgcolor: '#0F172A',
                  color: 'rgba(255,255,255,0.5)',
                },
              }}
            >
              แชทกับร้านนี้
            </Button>
          </span>
        </Tooltip>
      </Box>
    </>
  )
}

// ── Profile Tab (single-column, mobile-compatible — ไม่มี Grid/Card ซ้อน) ──
// ทำไม: default export ยังใช้งานได้ปกติ — mobile render ผ่าน wrapper/index.tsx ที่ใช้ ProfileLeftContent + ProfileRightContent
// ProfileTab ยังถูก export ไว้สำหรับ backward compat แต่ปัจจุบัน wrapper/index.tsx ใช้ named exports แทน
const ProfileTab = ({ data }: { data: ProfileTabData }) => {
  const { completedOrders, avgRating, showRating, openShopEmptyState, achievements, products, totalBadgeCount } = data

  return (
    <>
      <ProfileLeftContent
        data={{ completedOrders, avgRating, showRating, openShopEmptyState }}
      />
      <ProfileRightContent
        data={{ achievements, products, openShopEmptyState, totalBadgeCount }}
      />
    </>
  )
}

export default ProfileTab
