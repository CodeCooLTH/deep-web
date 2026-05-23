// Next Imports
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

// MUI Imports
import Box from '@mui/material/Box'

// Service Imports
import { prisma } from '@/lib/prisma'
import { findByUsername } from '@/services/user.service'
import { getAvgRatingByUsername } from '@/services/review.service'
import { getProductsByShop } from '@/services/product.service'
import { getTrustLevel } from '@/services/trust-score.service'

// View Imports
import UserProfile from '@views/pages/user-profile'
import type { ProfileHeaderData } from '@views/pages/user-profile/UserProfileHeader'
import type { ProfileTabData, SerializedProduct } from '@views/pages/user-profile/profile'

// Base: theme/vuexy/typescript-version/full-version/src/app/[lang]/(dashboard)/(private)/pages/user-profile/page.tsx
// Adapted: public (no auth), data sourced from SafePay services instead of getProfileData()
// Rework (2026-05-23): ตัด about/verification/reviews data ออก — ProfileTabData ไม่มี field เหล่านี้แล้ว
// ตัด getReviewsByUsername call + ลด Promise.all — ไม่ต้องการ reviews array อีกต่อไป

type Props = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const user = await findByUsername(username)
  if (!user) return { title: 'ไม่พบผู้ใช้' }
  return {
    title: `${user.displayName} (@${user.username})`,
    description: user.shop?.description ?? `โปรไฟล์ความน่าเชื่อถือของ ${user.displayName} บน Deep`,
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

const dateFmt = new Intl.DateTimeFormat('th-TH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const DEFAULT_COVER = '/images/pages/profile-banner.png'

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params
  const user = await findByUsername(username)
  if (!user) notFound()

  // ทำไม: ตัด getReviewsByUsername ออก — ProfileTab ไม่แสดง RecentReviews อีกแล้ว
  // คง getAvgRatingByUsername + orderStats + products ที่ยังใช้งานอยู่
  const [approvedVerifications, orderStats, ratingAgg, rawProducts] = await Promise.all([
    prisma.verificationRecord.findMany({
      where: { userId: user.id, status: 'APPROVED' },
      select: { level: true },
    }),
    user.shop
      ? prisma.order.groupBy({
          by: ['status'],
          where: { shopId: user.shop.id },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ status: string; _count: { _all: number } }>),
    // aggregate ทั้งหมด — ใช้แสดง rating บน platforms section
    getAvgRatingByUsername(username),
    // ดึงสินค้าเฉพาะเมื่อมีร้าน (isShop=true) — buyer-only ส่ง [] แทน
    // เปลี่ยน 9 → 12: desktop 4-col เต็ม 3 แถว / mobile 3-col 4 แถว ตาม spec
    user.shop ? getProductsByShop(user.shop.id, 12) : Promise.resolve([]),
  ])

  const trustLevel = getTrustLevel(user.trustScore)
  const trustColor = TRUST_COLOR[trustLevel] ?? 'info'
  const maxVerifyLevel = approvedVerifications.length
    ? Math.max(...approvedVerifications.map((v) => v.level))
    : 0

  const confirmedCount = orderStats.find((s) => s.status === 'CONFIRMED')?._count._all ?? 0
  const completedOrders = confirmedCount

  // avgRating + reviewCount จาก aggregate (ครอบคลุม review ทั้งหมด)
  const { avgRating, reviewCount } = ratingAgg

  // serialize products: Decimal → string, images Json → string[] → first
  // ไม่ส่ง Decimal object ข้าม RSC boundary เพราะ crash runtime แม้ tsc จะไม่เตือน
  const products: SerializedProduct[] = rawProducts.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price.toFixed(2),
    imageUrl: (p.images as string[])[0] ?? null,
  }))

  // FR-4.8: กรอง badge ที่แสดงบน public profile — เฉพาะ seller-context (SELLER|ANY)
  const sellerContextBadges = user.userBadges.filter(
    (ub) => ub.badge.audience === 'SELLER' || ub.badge.audience === 'ANY'
  )

  // --- Header data -----------------------------------------------------------
  const profileHeader: ProfileHeaderData = {
    coverImg: DEFAULT_COVER,
    profileImg: user.avatar,
    fullName: user.displayName,
    username: user.username,
    memberSince: dateFmt.format(user.createdAt),
    shopName: user.isShop && user.shop ? user.shop.shopName : null,
    trustScore: user.trustScore,
    trustLevel,
    trustColor,
    maxVerifyLevel,
    bio: user.shop?.description ?? null,
    location: user.shop?.address ?? null,
  }

  // --- Profile tab data (ตัด about/verification/reviews ออกแล้ว) ------------
  const profileTab: ProfileTabData = {
    // FR-4.8 + FR-9.5: ใช้ sellerContextBadges ที่กรองไว้แล้ว
    achievements: sellerContextBadges.map((ub) => ({
      id: ub.id,
      name: ub.badge.name,
      nameEN: ub.badge.nameEN,
      icon: ub.badge.icon ?? '',
      imageUrl: ub.badge.imageUrl ?? null,
    })),
    avgRating,
    completedOrders,
    // FR-9.5: buyer-only account → ส่ง flag เพื่อซ่อน products + platforms sections
    openShopEmptyState: !user.isShop,
    products,
    totalBadgeCount: sellerContextBadges.length,
    // แสดง rating summary เฉพาะเมื่อมีรีวิวอย่างน้อย 3 รายการ (เพื่อความน่าเชื่อถือ)
    showRating: reviewCount >= 3,
  }

  // ทำไม: mobile full-bleed — ไม่มี padding/frame รอบ การ์ดเต็มจอจริง (user feedback 2026-05-23)
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
    </Box>
  )
}
