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
    // shopId:null = personal/user-level (00008 P5-1) — verified badge ของ personal shop
    // ไม่นับ verification ของ Business shop (คนละ entity)
    where: { userId, shopId: null, status: 'APPROVED', level: { gte: 2 } },
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
      // shopId:null = personal/user-level (00008 P5-1) — batch verified สำหรับ personal shop cards
      where: { userId: { in: userIds }, shopId: null, status: 'APPROVED', level: { gte: 2 } },
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
  // level: 1..5 ตาม Tier Lists SSOT (docs/10 - Business Rules/Tier Lists.md) — Classic=1..Star=5
  // (derive จาก t.dots ที่มีอยู่แล้ว ห้ามตั้ง mapping ใหม่ที่นี่)
  level: number
  // ordersCount: order ทั้งหมดของร้านนี้ ทุกช่องทาง (ไม่กรอง status)
  ordersCount: number
  successfulAuctionsCount: number
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
  const [{ avg, count }, verified, ordersCount, successfulAuctionsCount] = await Promise.all([
    ratingFor(shopId),
    isVerified(shop.userId),
    // ordersCount: นับ order ทั้งหมดของร้าน ทุกช่องทาง (ไม่กรอง status) — ใช้ count ไม่ fetch array
    prisma.order.count({ where: { shopId } }),
    // successfulAuctionsCount: นิยาม = จำนวน order ที่เกิดจากการประมูล (Order.auctionId != null) และ
    // status='CONFIRMED' (ผู้ซื้อกดยืนยันรับสินค้าแล้ว = fulfilled sale, ดู VALID_TRANSITIONS ที่
    // order.service.ts). ไม่ต้อง join กับ Auction.status='ended' ซ้ำ เพราะ settleAuctionCore
    // (auction.service.ts) สร้าง Order ให้ auction ก็ต่อเมื่อปิดแบบ 'ended' เท่านั้น (unsold ไม่สร้าง Order
    // เลย) — Order ที่มี auctionId จึงผูกกับ auction ที่ ended เสมอ โดยไม่ต้อง query auction ซ้ำ
    prisma.order.count({ where: { shopId, auctionId: { not: null }, status: 'CONFIRMED' } }),
  ])
  const t = getTierDisplay(shop.user.trustScore)
  return {
    shopId: shop.id,
    name: shop.shopName,
    avatarUrl: fileUrl(shop.logo) || shop.user.avatar || '',
    verified,
    rating: Number(avg.toFixed(1)),
    reviewCount: count,
    trust: { score: shop.user.trustScore, letter: t.letter, tier: t.tier, dots: t.dots },
    level: Math.max(1, t.dots), // clamp min 1 (letter D → dots=0 ตาม Tier Lists SSOT แต่ level UI ต้อง 1..5)
    ordersCount,
    successfulAuctionsCount,
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
