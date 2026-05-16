// Next Imports
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

// Service Imports
import { prisma } from '@/lib/prisma'
import { findByUsername } from '@/services/user.service'
import { getReviewsByUsername } from '@/services/review.service'
import { getTrustLevel } from '@/services/trust-score.service'

// View Imports
import UserProfile from '@views/pages/user-profile'
import type { ProfileHeaderData } from '@views/pages/user-profile/UserProfileHeader'
import type { ProfileTabData } from '@views/pages/user-profile/profile'

// Base: theme/vuexy/typescript-version/full-version/src/app/[lang]/(dashboard)/(private)/pages/user-profile/page.tsx
// Adapted: public (no auth), data sourced from SafePay services instead of getProfileData(),
// tab wrapper dropped — see views/pages/user-profile/index.tsx comment.

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

  const [reviews, approvedVerifications, orderStats] = await Promise.all([
    getReviewsByUsername(username, 10, 0),
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
  ])

  const trustLevel = getTrustLevel(user.trustScore)
  const trustColor = TRUST_COLOR[trustLevel] ?? 'info'
  const maxVerifyLevel = approvedVerifications.length
    ? Math.max(...approvedVerifications.map((v) => v.level))
    : 0

  const completedOrders =
    orderStats.find((s) => s.status === 'CONFIRMED')?._count._all ?? 0

  const avgRating = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0

  // FR-4.8: กรอง badge ที่จะแสดงบน public profile — เฉพาะ seller-context (SELLER|ANY) เท่านั้น
  // BUYER-audience badge ดูได้เฉพาะหน้า /badges (self) ไม่ใช่ public profile
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
    stats: {
      completedOrders,
      reviews: reviews.length,
      // นับเฉพาะ seller-context badge ที่แสดงบน public profile จริง ๆ
      badges: sellerContextBadges.length,
    },
  }

  // --- About / Overview data -------------------------------------------------
  const aboutItems = [
    {
      property: 'ชื่อที่แสดง',
      value: user.displayName,
      icon: 'tabler-user',
    },
    {
      property: 'ชื่อผู้ใช้',
      value: `@${user.username}`,
      icon: 'tabler-at',
    },
    {
      property: 'สมาชิกตั้งแต่',
      value: dateFmt.format(user.createdAt),
      icon: 'tabler-calendar',
    },
  ]

  if (user.isShop && user.shop) {
    aboutItems.push({
      property: 'ร้าน',
      value: user.shop.shopName,
      icon: 'tabler-building-store',
    })
  }

  const overviewItems = [
    {
      property: 'Trust Score',
      value: `${user.trustScore} (ระดับ ${trustLevel})`,
      icon: 'tabler-shield-check',
    },
    {
      property: 'ระดับการยืนยัน',
      value: maxVerifyLevel > 0 ? `ระดับ ${maxVerifyLevel}` : 'ยังไม่ยืนยัน',
      icon: 'tabler-rosette-discount-check',
    },
    {
      property: 'Badge',
      value: `${sellerContextBadges.length} รายการ`,
      icon: 'tabler-award',
    },
  ]

  // --- Profile tab data ------------------------------------------------------
  const profileTab: ProfileTabData = {
    about: {
      about: aboutItems,
      overview: overviewItems,
      shopInfo:
        user.isShop && user.shop
          ? {
              shopName: user.shop.shopName,
              description: user.shop.description,
              category: user.shop.category,
            }
          : null,
    },
    verification: [
      {
        level: 1,
        label: 'ยืนยันเบอร์/อีเมล',
        icon: 'tabler-phone-check',
        active: maxVerifyLevel >= 1,
      },
      {
        level: 2,
        label: 'ยืนยันบัตรประชาชน',
        icon: 'tabler-id-badge-2',
        active: maxVerifyLevel >= 2,
      },
      {
        level: 3,
        label: 'ยืนยันจดทะเบียนธุรกิจ',
        icon: 'tabler-briefcase',
        active: maxVerifyLevel >= 3,
      },
    ],
    // FR-4.8 + FR-9.5: ใช้ sellerContextBadges ที่กรองไว้แล้ว — ไม่แสดง BUYER-audience และ progress
    // imageUrl: เพิ่มเพื่อให้ AchievementBadges ใช้ precedence imageUrl→emoji; badge row มีอยู่แล้วใน
    // include:{ badge: true } ของ findByUsername — ไม่ leak PII (imageUrl เป็น public URL)
    achievements: sellerContextBadges.map((ub) => ({
      id: ub.id,
      name: ub.badge.name,
      nameEN: ub.badge.nameEN,
      icon: ub.badge.icon ?? '',
      imageUrl: ub.badge.imageUrl ?? null,
    })),
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      itemName: r.order.items[0]?.name ?? null,
    })),
    avgRating,
    // FR-9.5: buyer-only account → ส่ง flag เพื่อให้ ProfileTab แสดง empty-state ชวนเปิดร้าน
    openShopEmptyState: !user.isShop,
  }

  return (
    <div className='p-4 sm:p-6 lg:p-10 min-bs-[100dvh] bg-[var(--mui-palette-background-default)]'>
      <div className='mx-auto max-w-6xl'>
        <UserProfile profileHeader={profileHeader} profileTab={profileTab} />
      </div>
    </div>
  )
}
