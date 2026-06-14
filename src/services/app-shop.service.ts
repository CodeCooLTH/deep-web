/**
 * App shop service — map SafePay Shop/Review → shape ที่แอปคาดหวัง
 * (ShopProfile / ShopDetail / Review ใน Deep-App src/api/types.ts).
 *
 * หมายเหตุ: `trustLevel` (tier) ใช้ `getTierDisplay` จาก trust-score.service
 * ซึ่งยึด SSOT `docs/10 - Business Rules/Tier Lists.md` (ห้ามตั้ง mapping เองที่อื่น).
 */
import { prisma } from '@/lib/prisma'
import { toAuctionDTO } from '@/services/auction.service'
import { getTierDisplay } from '@/services/trust-score.service'

const PAGE_SIZE = 20

function fileUrl(fileId: string | null | undefined): string {
  return fileId ? `/api/files/${fileId}` : ''
}

async function ratingFor(shopId: string): Promise<{ avg: number; count: number }> {
  const agg = await prisma.review.aggregate({
    where: { order: { shopId } },
    _avg: { rating: true },
    _count: { _all: true },
  })
  return { avg: agg._avg.rating ?? 0, count: agg._count._all }
}

async function isVerified(userId: string): Promise<boolean> {
  const n = await prisma.verificationRecord.count({
    where: { userId, status: 'APPROVED', level: { gte: 2 } },
  })
  return n > 0
}

export type ShopProfileDTO = {
  id: string
  name: string
  avatarUrl: string
  rating: number
  verified: boolean
}

/** รายชื่อร้าน (paginated) → { items, nextCursor } */
export async function listShops(
  page = 1,
): Promise<{ items: ShopProfileDTO[]; nextCursor: number | null }> {
  const p = page > 0 ? page : 1
  const rows = await prisma.shop.findMany({
    orderBy: { createdAt: 'desc' },
    skip: (p - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    include: { user: { select: { id: true, avatar: true } } },
  })
  const hasNext = rows.length > PAGE_SIZE
  const pageRows = hasNext ? rows.slice(0, PAGE_SIZE) : rows
  const shopIds = pageRows.map((s) => s.id)
  const userIds = pageRows.map((s) => s.userId)

  // กัน N+1: ดึง rating รวม + verified ของทุกร้านในหน้านี้ ด้วย 2 query (ไม่ใช่ 2×N)
  const [reviews, verifiedRecs] = await Promise.all([
    prisma.review.findMany({
      where: { order: { shopId: { in: shopIds } } },
      select: { rating: true, order: { select: { shopId: true } } },
    }),
    prisma.verificationRecord.findMany({
      where: { userId: { in: userIds }, status: 'APPROVED', level: { gte: 2 } },
      select: { userId: true },
    }),
  ])

  const ratingByShop = new Map<string, { sum: number; n: number }>()
  for (const r of reviews) {
    const cur = ratingByShop.get(r.order.shopId) ?? { sum: 0, n: 0 }
    cur.sum += r.rating
    cur.n += 1
    ratingByShop.set(r.order.shopId, cur)
  }
  const verifiedUsers = new Set(verifiedRecs.map((v) => v.userId))

  const items = pageRows.map((s): ShopProfileDTO => {
    const rt = ratingByShop.get(s.id)
    return {
      id: s.id,
      name: s.shopName,
      avatarUrl: fileUrl(s.logo) || s.user.avatar || '',
      rating: rt ? Number((rt.sum / rt.n).toFixed(1)) : 0,
      verified: verifiedUsers.has(s.userId),
    }
  })
  return { items, nextCursor: hasNext ? p + 1 : null }
}

/** รายละเอียดร้าน — lean: ส่งเฉพาะ field ที่มีข้อมูลจริง (ที่เหลือ optional ฝั่งแอป) */
export async function getShopDetail(id: string) {
  const s = await prisma.shop.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          avatar: true,
          trustScore: true,
          userBadges: { include: { badge: true } },
        },
      },
    },
  })
  if (!s) return null

  const t = getTierDisplay(s.user.trustScore)

  // query ที่ไม่พึ่งกัน → ยิงขนานกัน (ลด latency)
  const [{ avg, count }, verified, lifetimeOrders, liveAuctions] = await Promise.all([
    ratingFor(s.id),
    isVerified(s.userId),
    prisma.order.count({ where: { shopId: s.id } }),
    prisma.auction.findMany({
      where: { shopId: s.id, status: 'live' },
      orderBy: { bidCount: 'desc' },
      take: 20,
    }),
  ])

  const joined = s.createdAt
  const joinedMonth = `${joined.getMonth() + 1}/${joined.getFullYear()}`

  return {
    id: s.id,
    name: s.shopName,
    avatarUrl: fileUrl(s.logo) || s.user.avatar || '',
    rating: Number(avg.toFixed(1)),
    verified,
    handle: s.user.username,
    bio: s.description ?? undefined,
    location: s.address ?? undefined,
    joinedMonth,
    // ชั้น Trust (ตาม SSOT Tier Lists) — index = dots, total = 5
    trustLevel: { tier: t.tier, index: t.dots, total: 5 },
    stats: {
      lifetimeOrders,
      onTimePct: 0, // ยังไม่มีข้อมูล (placeholder ตามเว็บ Phase 2)
      replyMins: 0, // ยังไม่มีข้อมูล
      deepRating: Number(avg.toFixed(1)),
      deepCount: count,
    },
    achievements: s.user.userBadges.map((ub) => ({
      id: ub.badge.id,
      name: ub.badge.name,
      icon: ub.badge.icon ?? '',
    })),
    achievementsTotal: s.user.userBadges.length,
    auctions: liveAuctions.map(toAuctionDTO), // ใช้ mapper ร่วม ไม่ map ซ้ำ
  }
}

export type SellerTrust = {
  shopId: string
  name: string
  avatarUrl: string
  verified: boolean
  rating: number
  reviewCount: number
  trust: { score: number; letter: string; tier: string; dots: number }
}

/** ข้อมูล trust ของผู้ขาย (ไว้โชว์บนหน้า auction detail ให้ผู้ซื้อมั่นใจ — "กันโกง") */
export async function getSellerTrust(shopId: string): Promise<SellerTrust | null> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      id: true,
      shopName: true,
      logo: true,
      userId: true,
      user: { select: { avatar: true, trustScore: true } },
    },
  })
  if (!shop) return null
  const [{ avg, count }, verified] = await Promise.all([ratingFor(shopId), isVerified(shop.userId)])
  const t = getTierDisplay(shop.user.trustScore)
  return {
    shopId: shop.id,
    name: shop.shopName,
    avatarUrl: fileUrl(shop.logo) || shop.user.avatar || '',
    verified,
    rating: Number(avg.toFixed(1)),
    reviewCount: count,
    trust: { score: shop.user.trustScore, letter: t.letter, tier: t.tier, dots: t.dots },
  }
}

export type ReviewDTO = { id: string; author: string; rating: number; text: string; atMs: number }

/** รีวิวของร้าน → Review[] (app shape) */
export async function getShopReviews(shopId: string, take = 30): Promise<ReviewDTO[]> {
  const rows = await prisma.review.findMany({
    where: { order: { shopId } },
    orderBy: { createdAt: 'desc' },
    take,
    include: { reviewer: { select: { displayName: true } } },
  })
  return rows.map((r) => ({
    id: r.id,
    author: r.reviewer?.displayName ?? 'ผู้ใช้',
    rating: r.rating,
    text: r.comment ?? '',
    atMs: r.createdAt.getTime(),
  }))
}
