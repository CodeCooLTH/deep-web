import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTierDisplay } from '@/services/trust-score.service'
import { getTierColor } from '@/lib/trust-tier'
import { getTrustedShops, getSellerTrustByShopIds, getConfirmedOrderCountByShopIds } from '@/services/shop.service'
import { topAuctions, recentEndedAuctions, listCategoriesWithImage } from '@/services/auction.service'

import HomeFeed, { type CategoryItem, type TrustedShopCard, type AuctionCard, type TrustSnapshot } from './_components/HomeFeed'
import { sessionUserId } from '@/lib/session-user'

export const metadata: Metadata = { title: 'หน้าแรก' }

// storage key → URL (http = external ปล่อยตรง, else prefix /api/files/)
const resolveImg = (u: string) => (u.startsWith('http') ? u : `/api/files/${u}`)

// รูป cover curated ต่อหมวด (bundle ใน /public — ใช้เป็น fallback เมื่อยังไม่มี listing จริงในหมวดนั้น)
// ที่มา: Wikimedia Commons (CC/PD) → รับประกันทุกหมวดมีรูปสินค้าจริงตั้งแต่ DB ว่าง
const CATEGORY_COVER: Record<string, string> = {
  พระเครื่อง: '/images/categories/phra-krueang.jpg',
  นาฬิกา: '/images/categories/watch.jpg',
  ของสะสม: '/images/categories/collectibles.jpg',
  กล้อง: '/images/categories/camera.jpg',
  เหรียญ: '/images/categories/coin.jpg',
  แสตมป์: '/images/categories/stamp.jpg',
  เครื่องประดับ: '/images/categories/jewelry.jpg',
  งานศิลปะ: '/images/categories/art.jpg',
  เครื่องราง: '/images/categories/talisman.jpg',
  ธนบัตร: '/images/categories/banknote.jpg',
  ของเล่นสะสม: '/images/categories/toys.jpg',
  หนังสือเก่า: '/images/categories/books.jpg',
  เซรามิก: '/images/categories/ceramic.jpg',
  เครื่องดนตรี: '/images/categories/instrument.jpg',
  ภาพถ่าย: '/images/categories/photo.jpg',
  ของโบราณ: '/images/categories/antique.jpg'
}

// ── ข้อมูล discovery (ร้านน่าเชื่อถือ/ประมูลเด่น/ล่าสุด/หมวด) — "เหมือนกันทุก user" จึง cache ร่วมได้
// cache 20 วิ: ตัด SSR หน้าแรกจาก ~1.5-2 วิ (query DB หลายตัว) เหลือ ~instant หลัง hit แรก
// ราคาบน strip อาจ stale ได้ ≤20 วิ (ยอมรับได้ — หน้า browse; แตะเข้าไปเห็นราคา live จริง)
// ไม่มี session/cookie ในนี้ (ข้อมูลสาธารณะ) → ปลอดภัยกับ unstable_cache; trustedShops คืนครบ (กรอง user ทีหลัง)
const getHomeDiscovery = unstable_cache(
  async (): Promise<{
    categories: CategoryItem[]
    trustedShops: TrustedShopCard[]
    hotAuctions: AuctionCard[]
    pastAuctions: AuctionCard[]
  }> => {
    const [trustedShopsRaw, hotAuctionsRaw, pastRaw, categoriesRaw] = await Promise.all([
      getTrustedShops(12),
      topAuctions(8),
      recentEndedAuctions(12),
      listCategoriesWithImage()
    ])

    const trustedShopIds = trustedShopsRaw.map(s => s.shops[0]?.id).filter((id): id is string => !!id)
    const auctionShopIds = [...new Set([...hotAuctionsRaw, ...pastRaw].map(a => a.shopId))]
    const [shopDeals, sellerTrust] = await Promise.all([
      getConfirmedOrderCountByShopIds(trustedShopIds),
      getSellerTrustByShopIds(auctionShopIds)
    ])

    const categories: CategoryItem[] = categoriesRaw.map(c => ({
      name: c.name,
      imageUrl: c.imageUrl ? resolveImg(c.imageUrl) : (CATEGORY_COVER[c.name] ?? '')
    }))

    const trustedShops: TrustedShopCard[] = trustedShopsRaw.map(s => {
      const disp = getTierDisplay(s.trustScore)
      return {
        username: s.username,
        shopName: s.shops[0]?.shopName ?? s.displayName,
        image: s.shops[0]?.logo ? resolveImg(s.shops[0].logo) : s.avatar,
        trustScore: s.trustScore,
        tierLabel: disp.tier,
        tierColor: getTierColor(s.trustScore),
        dots: disp.dots,
        deals: s.shops[0]?.id ? (shopDeals.get(s.shops[0].id) ?? 0) : 0,
        verified: s.verifications.length > 0
      }
    })

    const toCard = (a: { id: string; title: string; imageUrl: string; currentPrice: number; bidCount: number; shopId: string }): AuctionCard => {
      const t = sellerTrust.get(a.shopId)
      return {
        id: a.id,
        title: a.title,
        image: a.imageUrl ? resolveImg(a.imageUrl) : '',
        currentPrice: a.currentPrice,
        bidCount: a.bidCount,
        ...(t && {
          sellerTier: getTierDisplay(t.trustScore).tier,
          sellerTierColor: getTierColor(t.trustScore),
          sellerVerified: t.verified
        })
      }
    }

    return {
      categories,
      trustedShops,
      hotAuctions: hotAuctionsRaw.map(toCard),
      pastAuctions: pastRaw.map(toCard)
    }
  },
  ['m-home-discovery'],
  { revalidate: 20, tags: ['m-home-discovery'] }
)

/**
 * หน้าแรก mobile web app (/m) — feed ข้อมูลคนอื่น/ระบบ (discovery):
 * เชื่อม auction (topAuctions/browse), shop (getTrustedShops), category (listCategories) ฝั่ง seller.
 * discovery cache ร่วม 20 วิ (getHomeDiscovery); เฉพาะ trust ของ user ดึงสดต่อ request
 */
export default async function MobileHomePage() {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!session?.user || !userId) redirect('/auth/sign-in?callbackUrl=/dashboard')


  // me (ต่อ user — สด) + discovery (ร่วม — cache) parallel
  const [me, discovery] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        trustScore: true,
        verifications: { where: { status: 'APPROVED' }, select: { id: true }, take: 1 },
        _count: { select: { userBadges: true } }
      }
    }),
    getHomeDiscovery()
  ])

  // สรุป Trust ของผู้ใช้ → แถบยูทิลิตี้ใต้ banner
  const trust: TrustSnapshot = {
    score: me?.trustScore ?? 0,
    tierLabel: getTierDisplay(me?.trustScore ?? 0).tier,
    tierColor: getTierColor(me?.trustScore ?? 0),
    verified: (me?.verifications.length ?? 0) > 0,
    badges: me?._count.userBadges ?? 0
  }

  // ไม่โชว์ร้านตัวเองในฟีด (กรองหลัง cache — cache เก็บครบทุกคน ใช้ร่วมได้ทุก user)
  const trustedShops = discovery.trustedShops.filter(s => s.username !== me?.username)

  return (
    <HomeFeed
      trust={trust}
      categories={discovery.categories}
      hotAuctions={discovery.hotAuctions}
      pastAuctions={discovery.pastAuctions}
      trustedShops={trustedShops}
    />
  )
}
