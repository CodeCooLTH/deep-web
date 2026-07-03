// Next Imports
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import NextLink from 'next/link'

// MUI Imports
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

// Service Imports
import { prisma } from '@/lib/prisma'
import { findShopBySlug } from '@/services/shop.service'
import { getAvgRatingByShop } from '@/services/review.service'
import { getProductsByShop } from '@/services/product.service'
import { getTrustLevel } from '@/services/trust-score.service'
import { formatDateTime } from '@/lib/format-date'

// View Imports
import UserProfile from '@views/pages/user-profile'
import type { ProfileHeaderData } from '@views/pages/user-profile/UserProfileHeader'
import type { ProfileTabData, SerializedProduct } from '@views/pages/user-profile/profile'

// Base: src/app/(marketing)/u/[username]/page.tsx (โครงเป๊ะ — reuse @views/pages/user-profile 100%)
// เดิม Base ของหน้านั้น: theme/vuexy/typescript-version/full-version/src/app/[lang]/(dashboard)/(private)/pages/user-profile/page.tsx
// Adapted (00008 Phase 5, P5-4): data source เปลี่ยนจาก user+personal shop → BUSINESS shop
// (findShopBySlug แทน findByUsername) — view/layout/footer/DEFAULT_COVER เดิมทุกอย่าง ไม่ redesign

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const shop = await findShopBySlug(slug)
  if (!shop) return { title: 'ไม่พบร้านค้า' }
  return {
    title: `${shop.shopName} (@${slug})`,
    description: shop.description ?? `โปรไฟล์ความน่าเชื่อถือของ ${shop.shopName} บน Deep`,
  }
}

const TRUST_COLOR: Record<string, 'success' | 'info' | 'warning' | 'error'> = {
  'A+': 'success',
  A: 'success',
  'B+': 'info',
  B: 'info',
  C: 'warning',
  D: 'error',
}

const DEFAULT_COVER = '/images/pages/profile-banner.png'

export default async function BusinessShopProfilePage({ params }: Props) {
  const { slug } = await params
  const shop = await findShopBySlug(slug)
  if (!shop) notFound()

  // ทำไม: เทียบ /u/[username] เป๊ะ แต่ scope ที่ shopId ตรง (business shop แยก trust/badge/verification
  // จาก owner user เอง — 00008 Phase 5 P5-1/P5-2/P5-3)
  const [approvedVerifications, orderStats, ratingAgg, rawProducts] = await Promise.all([
    prisma.verificationRecord.findMany({
      where: { shopId: shop.id, status: 'APPROVED' },
      select: { level: true },
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: { shopId: shop.id },
      _count: { _all: true },
    }),
    getAvgRatingByShop(shop.id),
    getProductsByShop(shop.id, 12),
  ])

  const trustLevel = getTrustLevel(shop.trustScore)
  const trustColor = TRUST_COLOR[trustLevel] ?? 'info'
  const maxVerifyLevel = approvedVerifications.length
    ? Math.max(...approvedVerifications.map((v) => v.level))
    : 0

  const confirmedCount = orderStats.find((s) => s.status === 'CONFIRMED')?._count._all ?? 0
  const completedOrders = confirmedCount

  const { avgRating, reviewCount } = ratingAgg

  // serialize products: Decimal → string, images Json → string[] → first
  // ไม่ส่ง Decimal object ข้าม RSC boundary เพราะ crash runtime แม้ tsc จะไม่เตือน
  const products: SerializedProduct[] = rawProducts.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price.toFixed(2),
    imageUrl: (p.images as string[])[0] ?? null,
  }))

  // FR-4.8 เทียบ /u/[username]: กรอง badge เฉพาะ seller-context (SELLER|ANY)
  const businessBadges = shop.badges.filter(
    (ub) => ub.badge.audience === 'SELLER' || ub.badge.audience === 'ANY',
  )

  // --- Header data -----------------------------------------------------------
  const profileHeader: ProfileHeaderData = {
    coverImg: DEFAULT_COVER,
    // fallback owner avatar เมื่อ shop ไม่มี logo
    profileImg: shop.logo ?? shop.user.avatar,
    fullName: shop.shopName,
    // handle @slug — slug คือ route param ที่ query shop มา (การันตีไม่ null)
    username: slug,
    memberSince: formatDateTime(shop.createdAt),
    shopName: shop.shopName,
    trustScore: shop.trustScore,
    trustLevel,
    trustColor,
    maxVerifyLevel,
    bio: shop.description,
    location: shop.address,
  }

  // --- Profile tab data --------------------------------------------------------
  const profileTab: ProfileTabData = {
    achievements: businessBadges.map((ub) => ({
      id: ub.id,
      name: ub.badge.name,
      nameEN: ub.badge.nameEN,
      icon: ub.badge.icon ?? '',
      imageUrl: ub.badge.imageUrl ?? null,
    })),
    avgRating,
    completedOrders,
    // business shop = shop เสมอ (ไม่มี buyer-only case เหมือน /u/[username])
    openShopEmptyState: false,
    products,
    totalBadgeCount: businessBadges.length,
    // แสดง rating summary เฉพาะเมื่อมีรีวิวอย่างน้อย 3 รายการ (เพื่อความน่าเชื่อถือ)
    showRating: reviewCount >= 3,
  }

  // ทำไม: mobile full-bleed — ไม่มี padding/frame รอบ การ์ดเต็มจอจริง (คงเดิมตาม /u/[username])
  // desktop (md+) คง radial-gradient bg + padding 60px 32px เหมือนเดิม
  // Box ใน RSC ได้ — ไม่มี interactivity ไม่ต้องการ 'use client'
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        p: { xs: 0, md: '0 32px 60px' },
        background: {
          xs: 'var(--mui-palette-background-paper)',
          md: 'radial-gradient(ellipse at top, #DDD6FE 0%, transparent 50%), radial-gradient(ellipse at bottom, #FBCFE8 0%, transparent 50%), #F8FAFC',
        },
      }}
    >
      <UserProfile profileHeader={profileHeader} profileTab={profileTab} />
      {/* mini-footer: legal link ที่ Meta ต้องการ — RSC ใช้ NextLink ห่อ Typography แทน component={Link} (Hard Rule 2) */}
      <Box component='footer' sx={{ textAlign: 'center', py: 2, px: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <NextLink href='/privacy' style={{ textDecoration: 'none' }}>
          <Typography variant='caption' color='text.secondary'>นโยบายความเป็นส่วนตัว</Typography>
        </NextLink>
      </Box>
    </Box>
  )
}
