// Next Imports
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import NextLink from 'next/link'

// MUI Imports
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

// Service Imports
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { findByUsername } from '@/services/user.service'
import { getAvgRatingByUsername } from '@/services/review.service'
import { getProductsByShop } from '@/services/product.service'
import { getPinnedProducts } from '@/services/pin.service'
import { getTierLabel, getTierColor, getNextTierInfo, getTierGradient } from '@/lib/trust-tier'
import { getShopProfileStats } from '@/services/shop.service'
import { toFileUrl } from '@/lib/file-url'
import { getReviewsByUsername } from '@/services/review.service'
import { getPublicRooms, getShopAvailability } from '@/services/room.service'
import ShopProfile from '@views/pages/user-profile/v2/ShopProfile'
import { formatMonthYearTH } from '@/lib/format-date'
import { computeCompletionRate } from '@/lib/order-stats'

// View Imports
import UserProfile from '@views/pages/user-profile'
import type { ProfileHeaderData } from '@views/pages/user-profile/UserProfileHeader'
import type { ProfileTabData, SerializedProduct } from '@views/pages/user-profile/profile'

// Base: theme/vuexy/typescript-version/full-version/src/app/[lang]/(dashboard)/(private)/pages/user-profile/page.tsx
// Adapted: public (no auth), data sourced from SafePay services instead of getProfileData()
// Rework (2026-05-23): ตัด about/verification/reviews data ออก — ProfileTabData ไม่มี field เหล่านี้แล้ว
// ตัด getReviewsByUsername call + ลด Promise.all — ไม่ต้องการ reviews array อีกต่อไป
// Redesign (2026-07-04, hybrid FB Page × Threads spec): tier label/color มาจาก trust-tier.ts SSOT ทั้งหมด
// (เลิกใช้ getTrustLevel()+TRUST_COLOR local map เดิม — ซ้ำซ้อนกับ Tier Lists SSOT และไม่เคยถูก render จริง)
// memberSince เปลี่ยนจาก formatDateTime → formatMonthYearTH (เดือน-ปีล้วน ไม่ต้องละเอียดระดับวัน)
// เพิ่ม verifiedLevels + nextTierInfo ป้อน TrustScoreCard; ตัดเมตริก "ผู้ติดตาม" ทิ้ง (ไม่มี follow system จริง)
// Phase 3 (feature 00013 Pin Products, SDS §4.4): แทน getProductsByShop(shop.id,12) เดี่ยว ด้วย
// getPinnedProducts(shop.id) + getProductsByShop(shop.id,12,{excludePinned:true}) คู่กัน

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

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params
  const user = await findByUsername(username)
  if (!user) notFound()

  // S-8 (feat 00011 Deep Chat): ต้องรู้ว่า viewer login อยู่หรือไม่ + เป็นเจ้าของร้านนี้เองไหม (B3 self-chat guard)
  // หน้านี้ public (ไม่ redirect ถ้าไม่ login) — ใช้แค่เพื่อคำนวณ isOwnShop, ไม่ gate การเข้าถึงหน้า
  const session = await getServerSession(authOptions)
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null
  const isOwnShop = viewerId !== null && user.shop?.userId === viewerId

  // ทำไม: ตัด getReviewsByUsername ออก — ProfileTab ไม่แสดง RecentReviews อีกแล้ว
  // คง getAvgRatingByUsername + orderStats + products ที่ยังใช้งานอยู่
  // redesign 2026-07-26: สถิติ/ช่องทาง/การกระจายดาว ของหน้าโฉมใหม่ รวมอยู่ใน service เดียว
  // buyer-only (ไม่มีร้าน) → null ทั้งก้อน แล้ว UI ซ่อน block ที่เกี่ยวข้องเอง
  const profileStats = user.shop ? await getShopProfileStats(user.shop.id) : null
  const recentReviews = await getReviewsByUsername(username, 10)

  // ประเภทกิจการกำหนดชุดแท็บ (feat 00017) — บ้านพักขาย "คืนที่ว่าง" ไม่ใช่ชิ้นสินค้า
  const isLodging = user.shop?.vertical === 'LODGING'
  const rawRooms = isLodging && user.shop ? await getPublicRooms(user.shop.id) : []
  // ปฏิทินวันว่าง — เฉพาะร้านที่พัก ร้านทั่วไปไม่ต้องคิวรี
  const availability = isLodging && user.shop ? await getShopAvailability(user.shop.id, 3) : null
  const publicRooms = rawRooms.map((r) => ({
    id: r.id,
    name: r.name,
    capacity: r.maxGuests,
    basePrice: Number(r.pricePerNight),
    imageUrl: r.images[0] ?? null,
  }))

  const [approvedVerifications, orderStats, ratingAgg, rawPinnedProducts, rawOtherProducts] = await Promise.all([
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
    // Phase 3 (feature 00013): pinned + other แยกคิวรี — เปลี่ยน 9 → 12: desktop 4-col เต็ม 3 แถว / mobile 3-col 4 แถว ตาม spec
    user.shop ? getPinnedProducts(user.shop.id) : Promise.resolve([]),
    user.shop ? getProductsByShop(user.shop.id, 12, { excludePinned: true }) : Promise.resolve([]),
  ])

  const maxVerifyLevel = approvedVerifications.length
    ? Math.max(...approvedVerifications.map((v) => v.level))
    : 0
  // เลขระดับยืนยันที่ approved แล้ว (dedupe) — ป้อน TrustScoreCard chip row (1=OTP, 2=เอกสาร, 3=จดทะเบียนธุรกิจ)
  const verifiedLevels = [...new Set(approvedVerifications.map((v) => v.level))]
  const tierLabel = getTierLabel(user.trustScore)
  const tierColor = getTierColor(user.trustScore)
  const nextTier = getNextTierInfo(user.trustScore)

  const confirmedCount = orderStats.find((s) => s.status === 'CONFIRMED')?._count._all ?? 0
  const completedOrders = confirmedCount
  // Desktop layout redesign: completionRate จาก orderStats ที่ query อยู่แล้ว (ไม่ query ใหม่)
  const cancelledCount = orderStats.find((s) => s.status === 'CANCELLED')?._count._all ?? 0
  const completionRate = computeCompletionRate(confirmedCount, cancelledCount)

  // avgRating + reviewCount จาก aggregate (ครอบคลุม review ทั้งหมด)
  const { avgRating, reviewCount } = ratingAgg

  // serialize products: Decimal → string, images Json → string[] → first
  // ไม่ส่ง Decimal object ข้าม RSC boundary เพราะ crash runtime แม้ tsc จะไม่เตือน
  // Phase 3 (feature 00013): serialize แยกชุด pinned/other — ทั้งสองมาจาก Prisma row shape เดียวกัน
  const serializeProductRow = (p: (typeof rawPinnedProducts)[number]): SerializedProduct => ({
    id: p.id,
    name: p.name,
    price: p.price.toFixed(2),
    imageUrl: (p.images as string[])[0] ?? null,
  })
  const pinnedProducts: SerializedProduct[] = rawPinnedProducts.map(serializeProductRow)
  const otherProducts: SerializedProduct[] = rawOtherProducts.map(serializeProductRow)

  // FR-4.8: กรอง badge ที่แสดงบน public profile — เฉพาะ seller-context (SELLER|ANY)
  const sellerContextBadges = user.userBadges.filter(
    (ub) => ub.badge.audience === 'SELLER' || ub.badge.audience === 'ANY'
  )

  // --- Header data -----------------------------------------------------------
  const profileHeader: ProfileHeaderData = {
    profileImg: user.avatar,
    fullName: user.displayName,
    username: user.username,
    shopName: user.isShop && user.shop ? user.shop.shopName : null,
    trustScore: user.trustScore,
    tierLabel,
    tierColor,
    maxVerifyLevel,
    completedOrders,
    completionRate,
    avgRating,
    showRating: reviewCount >= 3,
    // S-8 (feat 00011 Deep Chat)
    shopId: user.shop?.id ?? null,
    isOwnShop,
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
    // FR-9.5: buyer-only account → ส่ง flag เพื่อซ่อน products + platforms sections
    openShopEmptyState: !user.isShop,
    pinnedProducts,
    otherProducts,
    totalBadgeCount: sellerContextBadges.length,
    bio: user.shop?.description ?? null,
    location: user.shop?.address ?? null,
    memberSince: formatMonthYearTH(user.createdAt),
    // S-25 (extension #2 Response-rate metric): denormalized field จาก Shop (cron รายวัน S-24)
    // ไม่มีร้าน (buyer-only) → undefined → ProfileLeftContent ซ่อน section เอง (FR-RESP-04)
    chatResponseRate: user.shop?.chatResponseRate ?? null,
    chatMedianResponseSec: user.shop?.chatMedianResponseSec ?? null,
    chatResponseSampleSize: user.shop?.chatResponseSampleSize ?? null,
    trustScore: user.trustScore,
    tierLabel,
    tierColor,
    nextTierLabel: nextTier?.nextTierLabel ?? null,
    pointsToNext: nextTier?.pointsToNext ?? null,
    verifiedLevels,
  }

  // ทำไม: full-bleed ทุก breakpoint ตาม mockup ที่ user อนุมัติ (2026-07-04 fix) — ไม่มี padding ข้าง/gradient frame
  // ทั้ง mobile และ desktop (เดิม md+ เคยมีการ์ด 1024 ลอย + radial-gradient รอบ ผิด requirement เต็มจอ)
  // Box ใน RSC ได้ — ไม่มี interactivity ไม่ต้องการ 'use client'
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        p: 0,
        background: 'var(--mui-palette-background-paper)',
      }}
    >
      {/* redesign 2026-07-26 (ทิศทาง C) — ใช้ ShopProfile ร่วมกับ /b/[slug]
          ของเดิม (UserProfile) ยังอยู่ในโค้ดเบสจนกว่า user จะรับงาน แล้วค่อยลบทีเดียว */}
      <ShopProfile
        data={{
          hero: {
            shopName: profileHeader.shopName ?? profileHeader.fullName,
            username: profileHeader.username,
            avatar: toFileUrl(user.shop?.logo) ?? profileHeader.profileImg ?? null,
            coverImage: toFileUrl(user.shop?.coverImage),
            tierGradient: getTierGradient(user.trustScore),
            trustScore: user.trustScore,
            tierLabel,
            maxVerifyLevel,
            category: user.shop?.category ?? null,
            memberSince: formatMonthYearTH(user.createdAt),
            badges: sellerContextBadges.map((ub) => ({
              id: ub.id,
              name: ub.badge.name,
              nameEN: ub.badge.nameEN,
              icon: ub.badge.icon ?? '',
            })),
            totalBadgeCount: sellerContextBadges.length,
            completedOrders: profileStats?.completedOrders ?? null,
            customerCount: profileStats?.customerCount ?? null,
            repeatCustomerCount: profileStats?.repeatCustomerCount ?? null,
            completionRate: profileStats?.completionRate ?? null,
            canChat: !!user.shop && !isOwnShop,
            isLodging,
          },
          isLodging,
          rooms: publicRooms,
          availability,
          pinnedProducts,
          otherProducts,
          about: {
            bio: profileTab.bio,
            location: profileTab.location,
            memberSince: profileTab.memberSince,
            chatResponseRate: profileTab.chatResponseRate,
            chatMedianResponseSec: profileTab.chatMedianResponseSec,
            chatResponseSampleSize: profileTab.chatResponseSampleSize,
          },
          channels: profileStats?.channels ?? [],
          reviews: recentReviews.map((r) => ({
            id: r.id,
            rating: r.rating,
            comment: r.comment,
            createdAtIso: r.createdAt.toISOString(),
          })),
          avgRating: profileStats?.avgRating ?? null,
          reviewCount: profileStats?.reviewCount ?? 0,
          ratingDistribution: profileStats?.ratingDistribution ?? null,
          shopId: profileHeader.shopId ?? null,
          isOwnShop,
          itemKind: profileTab.itemKind,
        }}
      />

      {/* mini-footer: legal link ที่ Meta ต้องการ — RSC ใช้ NextLink ห่อ Typography แทน component={Link} (Hard Rule 2) */}
      <Box component='footer' sx={{ textAlign: 'center', py: 2, px: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <NextLink href='/privacy' style={{ textDecoration: 'none' }}>
          <Typography variant='caption' color='text.secondary'>นโยบายความเป็นส่วนตัว</Typography>
        </NextLink>
      </Box>
    </Box>
  )
}
