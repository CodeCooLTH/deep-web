import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTierDisplay } from '@/services/trust-score.service'
import { getTierColor } from '@/lib/trust-tier'
import { getTrustedShops } from '@/services/shop.service'
import { topAuctions, endingSoonAuctions, recentEndedAuctions, listCategories } from '@/services/auction.service'

import HomeFeed, {
  type CategoryItem,
  type TrustedShopCard,
  type AuctionCard
} from './_components/HomeFeed'

export const metadata: Metadata = { title: 'หน้าแรก' }

// storage key → URL (http = external ปล่อยตรง, else prefix /api/files/)
const resolveImg = (u: string) => (u.startsWith('http') ? u : `/api/files/${u}`)

/**
 * หน้าแรก mobile web app (/m) — feed ข้อมูลคนอื่น/ระบบ (discovery):
 * เชื่อม auction (topAuctions/browse), shop (getTrustedShops), category (listCategories) ฝั่ง seller.
 */
export default async function MobileHomePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/auth/sign-in?callbackUrl=/dashboard')

  const userId = (session.user as { id: string }).id
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })

  const [trustedShopsRaw, hotAuctionsRaw, endingRaw, pastRaw, categoriesRaw] = await Promise.all([
    getTrustedShops(12),
    topAuctions(8),
    endingSoonAuctions(8),
    recentEndedAuctions(12),
    listCategories()
  ])

  const categories: CategoryItem[] = categoriesRaw.map(c => ({ id: c.id, name: c.name }))

  const trustedShops: TrustedShopCard[] = trustedShopsRaw
    .filter(s => s.username !== me?.username)
    .map(s => ({
      username: s.username,
      shopName: s.shops[0]?.shopName ?? s.displayName,
      image: s.shops[0]?.logo ? resolveImg(s.shops[0].logo) : s.avatar,
      trustScore: s.trustScore,
      tierLabel: getTierDisplay(s.trustScore).tier,
      tierColor: getTierColor(s.trustScore),
      verified: s.verifications.length > 0
    }))

  const toCard = (a: { id: string; title: string; imageUrl: string; currentPrice: number; bidCount: number }): AuctionCard => ({
    id: a.id,
    title: a.title,
    image: a.imageUrl ? resolveImg(a.imageUrl) : '',
    currentPrice: a.currentPrice,
    bidCount: a.bidCount
  })

  const hotAuctions: AuctionCard[] = hotAuctionsRaw.map(toCard)
  // ประมูลใกล้จบ — ตัด id ที่ซ้ำกับ "กำลังประมูล" ออก กันโชว์ซ้ำ
  const hotIds = new Set(hotAuctions.map(a => a.id))
  const endingAuctions: AuctionCard[] = endingRaw.filter(a => !hotIds.has(a.id)).slice(0, 8).map(toCard)
  const pastAuctions: AuctionCard[] = pastRaw.map(toCard)

  return (
    <HomeFeed
      categories={categories}
      hotAuctions={hotAuctions}
      endingAuctions={endingAuctions}
      pastAuctions={pastAuctions}
      trustedShops={trustedShops}
    />
  )
}
