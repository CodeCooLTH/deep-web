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
import { findShopBySlug } from '@/services/shop.service'
import { getProductsByShop, getConfirmedOrderCountByProduct } from '@/services/product.service'
import { getPinnedProducts } from '@/services/pin.service'
import { getPublicRooms, getConfirmedBookingCountByRoom } from '@/services/room.service'
import { listServiceResources, serializeServiceResource } from '@/services/service-resource.service'
import { getShopPageLayout, listShopPageBlocks } from '@/services/shop-page-layout.service'
import { getTierLabel, getTierColor, getNextTierInfo } from '@/lib/trust-tier'
import { shopCategoryLabel } from '@/lib/shop-categories'
import { formatMonthYearTH } from '@/lib/format-date'

// View Imports
import ShopProfile from '@views/pages/user-profile/v2/ShopProfile'
import ProfileUnavailable from '@views/pages/user-profile/v2/ProfileUnavailable'
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

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

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

  // feature 00035 (TFR-004) — sync กับ /u/[username]: ต้องรู้ว่า viewer เป็นเจ้าของ/ทีมงานร้านนี้ไหม
  // ก่อนหน้านี้ isOwnShop hardcode false เสมอ ทำให้ publish gate ด้านล่างทำงานไม่ได้เลย
  const session = await getServerSession(authOptions)
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null
  const isOwnShop = viewerId !== null && shop.userId === viewerId
  // เจ้าของ "หรือทีมงาน" ร้าน (canAccessShop ครอบทั้งสองกรณี BUSINESS admin/staff ด้วย) — คนละตัวกับ
  // isOwnShop (owner เท่านั้น) ที่ใช้คุมปุ่มแชท ไม่ใช่ publish gate
  const canManagePage = viewerId ? await canAccessShop(shop.id, viewerId) : false

  const pageLayout = await getShopPageLayout(shop.id)

  // ปิดเผยแพร่ + ผู้ดูไม่ใช่เจ้าของ/ทีมงาน → คืน 200 พร้อมหน้า "ปิดการแสดงผลชั่วคราว" ไม่ใช่ notFound()
  // (ร้านนี้มีอยู่จริง แค่ผู้ขายสวิตช์ปิดไว้เอง — คนละเคสกับ !shop ด้านบน) ตัดจบก่อน query หนักด้านล่าง
  if (!pageLayout.isPublished && !canManagePage) {
    return <ProfileUnavailable />
  }

  // ทำไม: เทียบ /u/[username] เป๊ะ แต่ scope ที่ shopId ตรง (business shop แยก trust/badge/verification
  // จาก owner user เอง — 00008 Phase 5 P5-1/P5-2/P5-3)
  // เดิมมี prisma.order.groupBy({ by:['status'] }) อยู่ในชุดนี้อีกตัว ซึ่งซ้ำกับที่
  // getShopProfileStats() ยิงอยู่แล้ว (shop.service.ts:245) และผลของมันไปตกที่
  // profileHeader.completedOrders/.completionRate ที่ไม่มีใคร render — ถอดออกแล้ว (sync กับ /u/[username])
  //
  // เดิมชุดนี้ยิง getAvgRatingByShop() ไปด้วยอีกตัว ซึ่งผลตกที่ `const { avgRating, reviewCount }`
  // ที่ไม่มีใครใช้เลย — ค่าที่ส่งเข้า UI จริงมาจาก profileStats ทั้งคู่ (query ซ้ำที่ยิงทิ้งทุกครั้ง
  // ที่มีคนเปิดหน้าร้าน) ถอดออกแล้วพร้อมกับ const ที่ตายตามกัน
  const [approvedVerifications, rawPinnedProducts, rawOtherProducts] = await Promise.all([
    prisma.verificationRecord.findMany({
      where: { shopId: shop.id, status: 'APPROVED' },
      select: { level: true },
    }),
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

  // feature 00017 — ร้านประเภทบ้านพักแสดง "ห้องพัก" แทน "สินค้า" บนโปรไฟล์สาธารณะ (FR-LODG-07)
  // ใช้ grid เดิมทั้งหมด แค่เปลี่ยนแหล่งข้อมูล — ความสม่ำเสมอของหน้าสำคัญกว่าการมี layout เฉพาะ
  const isLodging = shop.vertical === 'LODGING'
  // feature 00028 (U11) — เส้นทางที่ 2 ของ public profile (business shop ผ่าน slug) ต้องรู้จัก
  // SERVICE_QUEUE เหมือน /u/[username] ไม่งั้นร้านนี้จะตกเข้า branch ONLINE_SALES เงียบ ๆ
  const isServiceQueue = shop.vertical === 'SERVICE_QUEUE'

  // 🛑 ทั้งชุดนี้เคยเป็น await เรียงต่อกัน 6 รอบ ทั้งที่ไม่มีตัวไหนใช้ผลของตัวก่อนหน้าเลย —
  // หน้าสาธารณะที่คนกดจากลิงก์ในแชทจ่ายค่า round-trip นั้นทุกครั้งโดยไม่ได้อะไรกลับมา
  // ตัวเดียวที่ต้องรอจริงคือ bookedByRoom (ต้องรู้ rooms ก่อน) จึงอยู่นอกชุดนี้
  //
  // profileStats = แหล่งเดียวกับ /u/[username] — completedOrders/completionRate อ่านจากชุดนี้
  // ไม่คำนวณสูตรซ้ำเอง (เดิมเรียก computeCompletionRate() ที่หน้า แล้วผลตกที่ field ที่ไม่มีใคร
  // render ทำให้เกณฑ์ขั้นต่ำใน order-stats.ts ไม่เคยมีผลกับหน้าจอจริง — feature 00039 BR-OSM-10)
  const [profileStats, soldByProduct, rooms, rawServices, shopVideos, pageBlocks, availability, shopReviews] =
    await Promise.all([
      getShopProfileStats(shop.id),
      // ยอด "ขายแล้ว" ต่อสินค้า — ดึงครั้งเดียวสำหรับทั้งชุดปักหมุดและชุดที่เหลือ (query เดียว ไม่ใช่ต่อใบ)
      getConfirmedOrderCountByProduct([
        ...rawPinnedProducts.map((p) => p.id),
        ...rawOtherProducts.map((p) => p.id),
      ]),
      // getPublicRooms คืนเฉพาะห้อง isActive และตัด field ตั้งค่าภายใน (depositMode/Value) ออกแล้ว
      isLodging ? getPublicRooms(shop.id) : Promise.resolve([]),
      isServiceQueue ? listServiceResources(shop.id, { activeOnly: true }) : Promise.resolve([]),
      getShopVideos(shop.id),
      // feature 00035 (TFR-005) — บล็อกที่ผู้ขายจัดวางไว้เหนือแถบแท็บ (sync กับ /u/[username])
      listShopPageBlocks(shop.id),
      isLodging ? getShopAvailability(shop.id, 3) : Promise.resolve(null),
      // รีวิวของร้านนี้ — scope ที่ shopId ตรง ไม่ใช่ผ่าน owner user (business shop แยก trust จาก owner)
      prisma.review.findMany({
        where: { order: { shopId: shop.id } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, rating: true, comment: true, createdAt: true },
      }),
    ])

  // serialize products: Decimal → string, images Json → string[] → first
  // ไม่ส่ง Decimal object ข้าม RSC boundary เพราะ crash runtime แม้ tsc จะไม่เตือน
  // Phase 3 (feature 00013): serialize แยกชุด pinned/other — ทั้งสองมาจาก Prisma row shape เดียวกัน
  const serializeProductRow = (p: (typeof rawPinnedProducts)[number]): SerializedProduct => ({
    id: p.id,
    name: p.name,
    price: p.price.toFixed(2),
    soldCount: soldByProduct.get(p.id) ?? 0,
    imageUrl: (p.images as string[])[0] ?? null,
  })

  const publicServices = rawServices.map(serializeServiceResource)

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

      {/* feature 00035 (รื้อ canvas 2026-08-07 รอบสอง) — เดิมห่อด้วย BuilderPreviewBridge เฉพาะโหมด
          draft (sync กับ /u/[username]) ตัด iframe ออกแล้ว ไม่มี Bridge อีกต่อไป */}
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
              // คีย์ดิบใน DB ("general"/"motorcycle") ต้องแปลงเป็นคำไทยก่อนถึงหน้าจอเสมอ —
              // บรรทัดนี้อยู่ติดกับ @username และวันเปิดร้าน ผู้ซื้อใช้อ่านยืนยันว่ามาถูกร้าน
              category: shopCategoryLabel(shop.category),
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
              // feature 00039 — ตัวหาร/ใบที่หักออก ต้องส่งไปคู่กับ % เสมอ (BR-OSM-07)
              // และ belowMinSample ให้ UI แสดงข้อความ "ยังสรุปไม่ได้" แทนการหายเงียบ
              completionDenominator: profileStats?.completionDenominator ?? 0,
              completionExcluded: profileStats?.completionExcluded ?? 0,
              completionBelowMinSample: profileStats?.completionBelowMinSample ?? false,
              // feature 00035 — เดิม hardcode true ได้เพราะ isOwnShop ของหน้านี้ hardcode false อยู่แล้ว
              // พอ Task 4 คำนวณ isOwnShop จริง (เพื่อใช้กับ publish gate) การคง true ไว้จะทำให้เจ้าของ
              // เห็นปุ่มทักแชทบนหน้าร้านตัวเอง ซึ่งเป็นเคสที่ self-chat guard (feat 00011 B3) กันอยู่
              // sync กับ /u/[username]:277 ที่เขียนเงื่อนไขนี้ถูกมาตั้งแต่แรก
              canChat: !isOwnShop,
              // แผงอธิบายคะแนนใช้บอก "อีกกี่คะแนนถึงระดับถัดไป" — ค่าเดียวกับที่ profileTab ใช้อยู่แล้ว
              // (getNextTierInfo เรียกไปแล้วด้านบน ไม่ได้ยิงเพิ่ม)
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
