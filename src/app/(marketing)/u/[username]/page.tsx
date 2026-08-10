// Next Imports
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import NextLink from 'next/link'

// MUI Imports
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'

// Service Imports
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { canAccessShop } from '@/lib/shop-context'
import { findByUsername } from '@/services/user.service'
import { getAvgRatingByUsername } from '@/services/review.service'
import { getProductsByShop, getConfirmedOrderCountByProduct } from '@/services/product.service'
import { getPinnedProducts } from '@/services/pin.service'
import { getTierLabel, getTierColor, getNextTierInfo, getTierGradient } from '@/lib/trust-tier'
import { getShopProfileStats } from '@/services/shop.service'
import { getShopVideos } from '@/services/shop-video.service'
import { toFileUrl } from '@/lib/file-url'
import { getReviewsByUsername } from '@/services/review.service'
import { getPublicRooms, getShopAvailability } from '@/services/room.service'
import { listServiceResources, serializeServiceResource } from '@/services/service-resource.service'
import { getShopPageLayout, listShopPageBlocks } from '@/services/shop-page-layout.service'
import ShopProfile from '@views/pages/user-profile/v2/ShopProfile'
import ProfileUnavailable from '@views/pages/user-profile/v2/ProfileUnavailable'
import { formatMonthYearTH } from '@/lib/format-date'
import { shopCategoryLabel } from '@/lib/shop-categories'

// View Imports
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

type Props = {
  params: Promise<{ username: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

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

  // feature 00035 (TFR-004) — สวิตช์เผยแพร่หน้าร้าน ไม่มีร้านเลย (บัญชี buyer-only) = ไม่มีแถว
  // ShopPageLayout เสมอ ใช้ fallback isPublished:true ของ service ตรง ๆ
  const pageLayout = user.shop
    ? await getShopPageLayout(user.shop.id)
    : { isPublished: true, tabOrder: [] as string[] }
  // เจ้าของ "หรือทีมงาน" ร้าน (canAccessShop ครอบทั้งสองกรณี) ยังต้องเห็นหน้าปกติแม้ปิดเผยแพร่อยู่
  // — คนละตัวกับ isOwnShop (owner เท่านั้น) ที่ใช้คุมปุ่มแชท ไม่ใช่ publish gate
  const canManagePage = user.shop && viewerId ? await canAccessShop(user.shop.id, viewerId) : false

  // ปิดเผยแพร่ + ผู้ดูไม่ใช่เจ้าของ/ทีมงาน → คืน 200 พร้อมหน้า "ปิดการแสดงผลชั่วคราว" ไม่ใช่ notFound()
  // (ร้านนี้มีอยู่จริง แค่ผู้ขายสวิตช์ปิดไว้เอง — คนละเคสกับ !user ด้านบน) ตัดจบก่อน query หนักด้านล่าง
  if (!pageLayout.isPublished && !canManagePage) {
    return <ProfileUnavailable />
  }

  // ทำไม: ตัด getReviewsByUsername ออก — ProfileTab ไม่แสดง RecentReviews อีกแล้ว
  // คง getAvgRatingByUsername + orderStats + products ที่ยังใช้งานอยู่
  // redesign 2026-07-26: สถิติ/ช่องทาง/การกระจายดาว ของหน้าโฉมใหม่ รวมอยู่ใน service เดียว
  // buyer-only (ไม่มีร้าน) → null ทั้งก้อน แล้ว UI ซ่อน block ที่เกี่ยวข้องเอง
  const profileStats = user.shop ? await getShopProfileStats(user.shop.id) : null
  const recentReviews = await getReviewsByUsername(username, 10)
  const shopVideos = user.shop ? await getShopVideos(user.shop.id) : []
  // feature 00035 (TFR-005) — บล็อกที่ผู้ขายจัดวางไว้เหนือแถบแท็บ
  const pageBlocks = user.shop ? await listShopPageBlocks(user.shop.id) : []

  // ประเภทกิจการกำหนดชุดแท็บ (feat 00017 + 00028) — บ้านพักขาย "คืนที่ว่าง" ไม่ใช่ชิ้นสินค้า,
  // สินค้าและบริการมีแท็บ "บริการ" เพิ่มจากคิวงาน (ServiceResource)
  const isLodging = user.shop?.vertical === 'LODGING'
  const isServiceQueue = user.shop?.vertical === 'SERVICE_QUEUE'
  const rawRooms = isLodging && user.shop ? await getPublicRooms(user.shop.id) : []
  // ปฏิทินวันว่าง — เฉพาะร้านที่พัก ร้านทั่วไปไม่ต้องคิวรี
  const availability = isLodging && user.shop ? await getShopAvailability(user.shop.id, 3) : null
  // คิวงานที่เปิดใช้งานอยู่ — เฉพาะร้านสินค้าและบริการ (feature 00028 U11, reuse service เดิม feat 00024)
  const rawServices =
    isServiceQueue && user.shop ? await listServiceResources(user.shop.id, { activeOnly: true }) : []
  const publicServices = rawServices.map(serializeServiceResource)
  const publicRooms = rawRooms.map((r) => ({
    id: r.id,
    name: r.name,
    capacity: r.maxGuests,
    basePrice: Number(r.pricePerNight),
    imageUrl: r.images[0] ?? null,
  }))

  // เดิมมี prisma.order.groupBy({ by:['status'] }) อยู่ตรงนี้อีกชุด ซึ่งเป็นคิวรีเดียวกันเป๊ะกับที่
  // getShopProfileStats() ยิงไปแล้วด้านบน (shop.service.ts:245) = ยิงซ้ำ 2 รอบต่อการโหลด 1 ครั้ง
  // แล้วผลของชุดที่สองไปตกที่ profileHeader.completedOrders/.completionRate ซึ่งไม่มีใคร render
  // (ShopProfile อ่านจาก profileStats ทั้งหมด) — ถอดออกแล้ว อ่านจาก profileStats ที่มีอยู่แทน
  const [approvedVerifications, ratingAgg, rawPinnedProducts, rawOtherProducts] = await Promise.all([
    prisma.verificationRecord.findMany({
      where: { userId: user.id, status: 'APPROVED' },
      select: { level: true },
    }),
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

  // อ่านจาก profileStats ชุดเดียวกับที่ ShopProfile ใช้ — ไม่คำนวณสูตรซ้ำที่นี่อีก
  // (เดิม page นี้เรียก computeCompletionRate() เองแล้วผลตกที่ field ที่ไม่มีใคร render
  //  ทำให้เกณฑ์ขั้นต่ำใน order-stats.ts ไม่เคยมีผลกับหน้าจอจริงเลย — feature 00039 BR-OSM-10)
  const completedOrders = profileStats?.completedOrders ?? 0
  const completionRate = profileStats?.completionRate ?? null

  // avgRating + reviewCount จาก aggregate (ครอบคลุม review ทั้งหมด)
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
    // teaser ที่ผู้ขายเขียนไว้สำหรับการ์ดสินค้าโดยเฉพาะ (≤200 ตัวอักษร) — ไม่ใช่ description เต็ม
    shortDescription: p.shortDescription,
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
      {/* feature 00035 — เจ้าของ/ทีมงานเห็นหน้าปกติแม้ปิดเผยแพร่อยู่ แต่ต้องรู้ว่าคนอื่นมองไม่เห็น
          Alert เต็มความกว้าง ไม่มีมุมโค้ง วางบนสุดเหนือ ProfileHero (Base: PhoneVerifyPrompt.tsx ~L260) */}
      {!pageLayout.isPublished && canManagePage && (
        <Alert severity='warning' sx={{ borderRadius: 0 }}>
          <Typography className='font-medium' color='text.primary'>
            หน้าร้านนี้ปิดการแสดงผลอยู่
          </Typography>
          <Typography variant='body2'>
            ผู้เยี่ยมชมทั่วไปมองไม่เห็นหน้านี้ตอนนี้ — คุณเห็นเพราะเป็นเจ้าของหรือทีมงานร้าน
          </Typography>
        </Alert>
      )}

      {/* redesign 2026-07-26 (ทิศทาง C) — ใช้ ShopProfile ร่วมกับ /b/[slug]
          ของเดิม (UserProfile) ยังอยู่ในโค้ดเบสจนกว่า user จะรับงาน แล้วค่อยลบทีเดียว */}
      {/* feature 00035 (รื้อ canvas 2026-08-07 รอบสอง) — เดิมห่อด้วย BuilderPreviewBridge เฉพาะโหมด
          draft (เจ้าของ/ทีมงานเปิดจาก builder ผ่าน iframe) ตัด iframe ออกแล้ว ไม่มี Bridge อีกต่อไป */}
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
              // แปลงคีย์หมวดเป็นคำไทยก่อนถึงหน้าจอ (เส้นทางนี้พลาดเหมือน /b/[slug] เป๊ะ —
              // แก้ที่เดียวไม่พอเสมอ เพราะ public profile มี 2 เส้น)
              category: shopCategoryLabel(user.shop?.category),
              memberSince: formatMonthYearTH(user.createdAt),
              // imageUrl = artwork จริงของเหรียญ (sync กับ /b/[slug] — แก้เส้นเดียวไม่พอเสมอ)
              badges: sellerContextBadges.map((ub) => ({
                id: ub.id,
                name: ub.badge.name,
                nameEN: ub.badge.nameEN,
                icon: ub.badge.icon ?? '',
                imageUrl: ub.badge.imageUrl ?? null,
              })),
              totalBadgeCount: sellerContextBadges.length,
              completedOrders: profileStats?.completedOrders ?? null,
              customerCount: profileStats?.customerCount ?? null,
              repeatCustomerCount: profileStats?.repeatCustomerCount ?? null,
              completionRate: profileStats?.completionRate ?? null,
              // feature 00039 — ตัวหาร/ใบที่หักออก ต้องส่งไปคู่กับ % เสมอ (BR-OSM-07)
              // และ belowMinSample ให้ UI แสดงข้อความ "ยังสรุปไม่ได้" แทนการหายเงียบ
              completionDenominator: profileStats?.completionDenominator ?? 0,
              completionExcluded: profileStats?.completionExcluded ?? 0,
              completionBelowMinSample: profileStats?.completionBelowMinSample ?? false,
              canChat: !!user.shop && !isOwnShop,
              // แผงอธิบายคะแนนใช้บอก "อีกกี่คะแนนถึงระดับถัดไป" — ค่าเดียวกับที่ profileTab ใช้อยู่แล้ว
              nextTierLabel: nextTier?.nextTierLabel ?? null,
              pointsToNext: nextTier?.pointsToNext ?? null,
              isLodging,
              isServiceQueue,
            },
            isLodging,
            isServiceQueue,
            rooms: publicRooms,
            availability,
            services: publicServices,
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
            videos: shopVideos,
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
            tabOrder: pageLayout.tabOrder,
            blocks: pageBlocks,
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
