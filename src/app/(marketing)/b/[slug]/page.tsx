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
import { getProductsByShop, getConfirmedOrderCountByProduct } from '@/services/product.service'
import { getPinnedProducts } from '@/services/pin.service'
import { getPublicRooms, getConfirmedBookingCountByRoom } from '@/services/room.service'
import { getTierLabel, getTierColor, getNextTierInfo } from '@/lib/trust-tier'
import { formatMonthYearTH } from '@/lib/format-date'
import { computeCompletionRate } from '@/lib/order-stats'

// View Imports
import ShopProfile from '@views/pages/user-profile/v2/ShopProfile'
import { getShopProfileStats } from '@/services/shop.service'
import { getShopVideos } from '@/services/shop-video.service'
import { getShopAvailability } from '@/services/room.service'
import { getTierGradient } from '@/lib/trust-tier'
import { toFileUrl } from '@/lib/file-url'
import type { ProfileHeaderData } from '@views/pages/user-profile/UserProfileHeader'
import type { ProfileTabData, SerializedProduct } from '@views/pages/user-profile/profile'

// Base: src/app/(marketing)/u/[username]/page.tsx (โครงเป๊ะ — reuse @views/pages/user-profile 100%)
// เดิม Base ของหน้านั้น: theme/vuexy/typescript-version/full-version/src/app/[lang]/(dashboard)/(private)/pages/user-profile/page.tsx
// Adapted (00008 Phase 5, P5-4): data source เปลี่ยนจาก user+personal shop → BUSINESS shop
// (findShopBySlug แทน findByUsername) — view/layout/footer เดิมทุกอย่าง ไม่ redesign
// Redesign (2026-07-04): sync กับ /u/[username] — tier label/color จาก trust-tier.ts SSOT, memberSince → formatMonthYearTH,
// เพิ่ม verifiedLevels + nextTierInfo (type ProfileHeaderData/ProfileTabData เปลี่ยนร่วมกัน ต้อง sync ทั้ง 2 หน้าเสมอ)
// Phase 3 (feature 00013 Pin Products): sync กับ /u/[username] — pinnedProducts/otherProducts แทน products เดี่ยว

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
  const [approvedVerifications, orderStats, ratingAgg, rawPinnedProducts, rawOtherProducts] = await Promise.all([
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
    // Phase 3 (feature 00013): pinned + other แยกคิวรี (sync /u/[username])
    getPinnedProducts(shop.id),
    getProductsByShop(shop.id, 12, { excludePinned: true }),
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
  // Desktop layout redesign: completionRate จาก orderStats ที่ query อยู่แล้ว (ไม่ query ใหม่)
  const cancelledCount = orderStats.find((s) => s.status === 'CANCELLED')?._count._all ?? 0
  const completionRate = computeCompletionRate(confirmedCount, cancelledCount)

  const { avgRating, reviewCount } = ratingAgg

  // serialize products: Decimal → string, images Json → string[] → first
  // ไม่ส่ง Decimal object ข้าม RSC boundary เพราะ crash runtime แม้ tsc จะไม่เตือน
  // Phase 3 (feature 00013): serialize แยกชุด pinned/other — ทั้งสองมาจาก Prisma row shape เดียวกัน
  // ยอด "ขายแล้ว" ต่อสินค้า — ดึงครั้งเดียวสำหรับทั้งชุดปักหมุดและชุดที่เหลือ (query เดียว ไม่ใช่ต่อใบ)
  const soldByProduct = await getConfirmedOrderCountByProduct([
    ...rawPinnedProducts.map((p) => p.id),
    ...rawOtherProducts.map((p) => p.id),
  ])

  const serializeProductRow = (p: (typeof rawPinnedProducts)[number]): SerializedProduct => ({
    id: p.id,
    name: p.name,
    price: p.price.toFixed(2),
    soldCount: soldByProduct.get(p.id) ?? 0,
    imageUrl: (p.images as string[])[0] ?? null,
  })
  // feature 00017 — ร้านประเภทบ้านพักแสดง "ห้องพัก" แทน "สินค้า" บนโปรไฟล์สาธารณะ (FR-LODG-07)
  // ใช้ grid เดิมทั้งหมด แค่เปลี่ยนแหล่งข้อมูล — ความสม่ำเสมอของหน้าสำคัญกว่าการมี layout เฉพาะ
  // getPublicRooms คืนเฉพาะห้อง isActive และตัด field ตั้งค่าภายใน (depositMode/Value) ออกแล้ว
  const isLodging = shop.vertical === 'LODGING'
  const rooms = isLodging ? await getPublicRooms(shop.id) : []

  // redesign 2026-07-26 — ใช้แหล่งข้อมูลชุดเดียวกับ /u/[username] ผ่าน ShopProfile
  const profileStats = await getShopProfileStats(shop.id)
  const shopVideos = await getShopVideos(shop.id)
  const availability = isLodging ? await getShopAvailability(shop.id, 3) : null
  // รีวิวของร้านนี้ — scope ที่ shopId ตรง ไม่ใช่ผ่าน owner user (business shop แยก trust จาก owner)
  const shopReviews = await prisma.review.findMany({
    where: { order: { shopId: shop.id } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, rating: true, comment: true, createdAt: true },
  })
  const publicRooms = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    capacity: r.maxGuests,
    basePrice: Number(r.pricePerNight),
    imageUrl: r.images[0] ?? null,
  }))

  // ยอด "เข้าพักแล้ว" ต่อห้อง — ต้องอยู่หลัง rooms ถูกสร้าง
  const bookedByRoom = await getConfirmedBookingCountByRoom(rooms.map((r) => r.id))

  const pinnedProducts: SerializedProduct[] = isLodging
    ? []
    : rawPinnedProducts.map(serializeProductRow)
  const otherProducts: SerializedProduct[] = isLodging
    ? rooms.map((r) => ({
        id: r.id,
        name: r.name,
        price: r.pricePerNight,
        soldCount: bookedByRoom.get(r.id) ?? 0,
        imageUrl: r.images[0] ?? null,
      }))
    : rawOtherProducts.map(serializeProductRow)

  // FR-4.8 เทียบ /u/[username]: กรอง badge เฉพาะ seller-context (SELLER|ANY)
  const businessBadges = shop.badges.filter(
    (ub) => ub.badge.audience === 'SELLER' || ub.badge.audience === 'ANY',
  )

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
    pinnedProducts,
    otherProducts,
    itemKind: isLodging ? ('ROOM' as const) : ('PRODUCT' as const),
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
      <ShopProfile
        data={{
          hero: {
            shopName: shop.shopName,
            username: slug,
            avatar: toFileUrl(shop.logo) ?? shop.user.avatar ?? null,
            coverImage: toFileUrl(shop.coverImage),
            tierGradient: getTierGradient(shop.trustScore),
            trustScore: shop.trustScore,
            tierLabel,
            maxVerifyLevel,
            category: shop.category ?? null,
            memberSince: formatMonthYearTH(shop.createdAt),
            badges: businessBadges.map((ub) => ({
              id: ub.id,
              name: ub.badge.name,
              nameEN: ub.badge.nameEN,
              icon: ub.badge.icon ?? '',
            })),
            totalBadgeCount: businessBadges.length,
            completedOrders: profileStats.completedOrders,
            customerCount: profileStats.customerCount,
            repeatCustomerCount: profileStats.repeatCustomerCount,
            completionRate: profileStats.completionRate,
            canChat: true,
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
          },
          channels: profileStats.channels,
          videos: shopVideos,
          reviews: shopReviews.map((r) => ({
            id: r.id,
            rating: r.rating,
            comment: r.comment,
            createdAtIso: r.createdAt.toISOString(),
          })),
          avgRating: profileStats.avgRating,
          reviewCount: profileStats.reviewCount,
          ratingDistribution: profileStats.ratingDistribution,
          shopId: shop.id,
          isOwnShop: false,
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
