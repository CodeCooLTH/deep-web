import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTierDisplay } from '@/services/trust-score.service'
import { getTierColor } from '@/lib/trust-tier'
import { getTrustedShops, getSellerTrustByShopIds, getConfirmedOrderCountByShopIds } from '@/services/shop.service'
import { topAuctions, recentEndedAuctions, listCategoriesWithImage } from '@/services/auction.service'

import HomeFeed, { type CategoryItem, type TrustedShopCard, type AuctionCard } from './_components/HomeFeed'

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

/**
 * หน้าแรก mobile web app (/m) — feed ข้อมูลคนอื่น/ระบบ (discovery):
 * เชื่อม auction (topAuctions/browse), shop (getTrustedShops), category (listCategories) ฝั่ง seller.
 */
export default async function MobileHomePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/auth/sign-in?callbackUrl=/dashboard')

  const userId = (session.user as { id: string }).id

  // parallel ทุก query (me รวมใน Promise.all — เดิม await แยก sequential เสีย 1 round-trip)
  const [me, trustedShopsRaw, hotAuctionsRaw, pastRaw, categoriesRaw] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
    getTrustedShops(12),
    topAuctions(8),
    recentEndedAuctions(12),
    listCategoriesWithImage()
  ])

  // หมวดหมู่สินค้า + รูปสินค้าจริง — ลำดับ: listing จริงในหมวด > รูป cover curated (bundle) > ('' → ไอคอน)
  const categories: CategoryItem[] = categoriesRaw.map(c => ({
    name: c.name,
    imageUrl: c.imageUrl ? resolveImg(c.imageUrl) : (CATEGORY_COVER[c.name] ?? '')
  }))

  // batch: จำนวนดีลสำเร็จต่อร้าน + seller trust ต่อ auction — parallel (independent จาก Promise.all แรก)
  const trustedShopIds = trustedShopsRaw.map(s => s.shops[0]?.id).filter((id): id is string => !!id)
  const auctionShopIds = [...new Set([...hotAuctionsRaw, ...pastRaw].map(a => a.shopId))]
  const [shopDeals, sellerTrust] = await Promise.all([
    getConfirmedOrderCountByShopIds(trustedShopIds),
    getSellerTrustByShopIds(auctionShopIds)
  ])

  const trustedShops: TrustedShopCard[] = trustedShopsRaw
    .filter(s => s.username !== me?.username)
    .map(s => {
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

  const hotAuctions: AuctionCard[] = hotAuctionsRaw.map(toCard)
  const pastAuctions: AuctionCard[] = pastRaw.map(toCard)

  return (
    <HomeFeed categories={categories} hotAuctions={hotAuctions} pastAuctions={pastAuctions} trustedShops={trustedShops} />
  )
}
