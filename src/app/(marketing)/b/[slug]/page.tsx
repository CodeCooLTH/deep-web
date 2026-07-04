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
import { getTierLabel, getTierColor, getNextTierInfo } from '@/lib/trust-tier'
import { formatMonthYearTH } from '@/lib/format-date'

// View Imports
import UserProfile from '@views/pages/user-profile'
import type { ProfileHeaderData } from '@views/pages/user-profile/UserProfileHeader'
import type { ProfileTabData, SerializedProduct } from '@views/pages/user-profile/profile'

// Base: src/app/(marketing)/u/[username]/page.tsx (โครงเป๊ะ — reuse @views/pages/user-profile 100%)
// เดิม Base ของหน้านั้น: theme/vuexy/typescript-version/full-version/src/app/[lang]/(dashboard)/(private)/pages/user-profile/page.tsx
// Adapted (00008 Phase 5, P5-4): data source เปลี่ยนจาก user+personal shop → BUSINESS shop
// (findShopBySlug แทน findByUsername) — view/layout/footer เดิมทุกอย่าง ไม่ redesign
// Redesign (2026-07-04): sync กับ /u/[username] — tier label/color จาก trust-tier.ts SSOT, memberSince → formatMonthYearTH,
// เพิ่ม verifiedLevels + nextTierInfo (type ProfileHeaderData/ProfileTabData เปลี่ยนร่วมกัน ต้อง sync ทั้ง 2 หน้าเสมอ)

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

  const maxVerifyLevel = approvedVerifications.length
    ? Math.max(...approvedVerifications.map((v) => v.level))
    : 0
  const verifiedLevels = [...new Set(approvedVerifications.map((v) => v.level))]
  const tierLabel = getTierLabel(shop.trustScore)
  const tierColor = getTierColor(shop.trustScore)
  const nextTier = getNextTierInfo(shop.trustScore)

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
    // fallback owner avatar เมื่อ shop ไม่มี logo
    profileImg: shop.logo ?? shop.user.avatar,
    fullName: shop.shopName,
    // handle @slug — slug คือ route param ที่ query shop มา (การันตีไม่ null)
    username: slug,
    shopName: shop.shopName,
    trustScore: shop.trustScore,
    tierLabel,
    tierColor,
    maxVerifyLevel,
    completedOrders,
    avgRating,
    showRating: reviewCount >= 3,
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
    // business shop = shop เสมอ (ไม่มี buyer-only case เหมือน /u/[username])
    openShopEmptyState: false,
    products,
    totalBadgeCount: businessBadges.length,
    bio: shop.description,
    location: shop.address,
    memberSince: formatMonthYearTH(shop.createdAt),
    trustScore: shop.trustScore,
    tierLabel,
    tierColor,
    nextTierLabel: nextTier?.nextTierLabel ?? null,
    pointsToNext: nextTier?.pointsToNext ?? null,
    verifiedLevels,
  }

  // ทำไม: full-bleed ทุก breakpoint ตาม mockup ที่ user อนุมัติ (2026-07-04 fix, sync กับ /u/[username]) — ไม่มี padding ข้าง/gradient frame
  // Box ใน RSC ได้ — ไม่มี interactivity ไม่ต้องการ 'use client'
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        p: 0,
        background: 'var(--mui-palette-background-paper)',
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
