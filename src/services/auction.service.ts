/**
 * Auction service — โดเมนประมูลของ Buyer App (แยกจากระบบเดิมของ SafePay).
 *
 * map Prisma row → shape ที่ฝั่งแอปคาดหวัง (ตรงกับ src/api/types.ts ใน Deep-App):
 *   Auction = { id, title, imageUrl, currentPrice, bidIncrement, endTimeMs,
 *               bidCount, shopId, status, bidHistory? }
 *   BrowsedAuction = Auction & { bidderCount }
 *
 * realtime (live/ws) ยังไม่ทำ — ดู memory project-scope.
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

const PAGE_SIZE = 20

export type AuctionDTO = {
  id: string
  title: string
  imageUrl: string
  currentPrice: number
  bidIncrement: number
  endTimeMs: number
  bidCount: number
  shopId: string
  status: 'live' | 'ended'
}

export type BidDTO = { id: string; amount: number; bidder: string; atMs: number }

type AuctionRow = Prisma.AuctionGetPayload<{}>

/** map Auction row → app DTO. export ไว้ใช้ร่วม (app-shop ก็ใช้ตัวนี้ ไม่ map ซ้ำ) */
export function toAuctionDTO(a: AuctionRow): AuctionDTO {
  return {
    id: a.id,
    title: a.title,
    imageUrl: a.imageUrl,
    currentPrice: Number(a.currentPrice),
    bidIncrement: Number(a.bidIncrement),
    endTimeMs: a.endTime.getTime(),
    bidCount: a.bidCount,
    shopId: a.shopId,
    status: a.status === 'ended' ? 'ended' : 'live',
  }
}

export type BrowseSort = 'bidders' | 'ending' | 'priceHigh' | 'priceLow'

function orderForSort(sort: BrowseSort): Prisma.AuctionOrderByWithRelationInput {
  switch (sort) {
    case 'ending':
      return { endTime: 'asc' }
    case 'priceHigh':
      return { currentPrice: 'desc' }
    case 'priceLow':
      return { currentPrice: 'asc' }
    case 'bidders':
    default:
      return { bidCount: 'desc' }
  }
}

/** browse แบบ cursor pagination → { items, nextCursor } (ตรงกับ Paginated<T> ของแอป) */
export async function browseAuctions(opts: {
  sort?: BrowseSort
  category?: string | null
  page?: number
}): Promise<{ items: (AuctionDTO & { bidderCount: number })[]; nextCursor: number | null }> {
  await settleEndedAuctions() // lazy: ปิดประมูลที่หมดเวลา + ออก order ให้ผู้ชนะ ก่อนแสดงผล
  const page = opts.page && opts.page > 0 ? opts.page : 1
  const where: Prisma.AuctionWhereInput = {
    status: 'live',
    ...(opts.category ? { category: opts.category } : {}),
  }

  const rows = await prisma.auction.findMany({
    where,
    orderBy: orderForSort(opts.sort ?? 'bidders'),
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1, // +1 เพื่อรู้ว่ามีหน้าถัดไปไหม
    include: { _count: { select: { bids: true } } },
  })

  const hasNext = rows.length > PAGE_SIZE
  const pageRows = hasNext ? rows.slice(0, PAGE_SIZE) : rows
  const items = pageRows.map((r) => ({ ...toAuctionDTO(r), bidderCount: r._count.bids }))
  return { items, nextCursor: hasNext ? page + 1 : null }
}

/** auction ที่บิดเยอะสุด (สำหรับ section "กำลังประมูล" / Top) */
export async function topAuctions(limit = 10): Promise<AuctionDTO[]> {
  await settleEndedAuctions()
  const rows = await prisma.auction.findMany({
    where: { status: 'live' },
    orderBy: { bidCount: 'desc' },
    take: limit,
  })
  return rows.map(toAuctionDTO)
}

/** auction รายตัว + ประวัติบิดล่าสุด */
export async function getAuctionDetail(
  id: string,
): Promise<(AuctionDTO & { bidHistory: BidDTO[] }) | null> {
  const a = await prisma.auction.findUnique({
    where: { id },
    include: {
      bids: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { bidder: { select: { displayName: true } } },
      },
    },
  })
  if (!a) return null
  return {
    ...toAuctionDTO(a),
    bidHistory: a.bids.map((b) => ({
      id: b.id,
      amount: Number(b.amount),
      bidder: b.bidder.displayName,
      atMs: b.createdAt.getTime(),
    })),
  }
}

/** ค้นหา auction จาก title (live เท่านั้น) */
export async function searchAuctions(q: string, limit = 30): Promise<AuctionDTO[]> {
  const term = q.trim()
  if (!term) return []
  const rows = await prisma.auction.findMany({
    where: { status: 'live', title: { contains: term, mode: 'insensitive' } },
    orderBy: { bidCount: 'desc' },
    take: limit,
  })
  return rows.map(toAuctionDTO)
}

// หมวดหมู่หลัก 8 อันสำหรับหน้า Home (name ต้องตรงกับ CAT_MAP ใน CategoryTile เพื่อให้ได้ไอคอน)
// 4 อันแรกมี auction จริงใน seed; ที่เหลือ browse ได้ (ว่างจนกว่าจะมีของ)
const HOME_CATEGORIES = [
  'พระเครื่อง',
  'นาฬิกา',
  'ของสะสม',
  'กล้อง',
  'เหรียญ',
  'แสตมป์',
  'เครื่องประดับ',
  'งานศิลปะ',
  'เครื่องราง',
  'ธนบัตร',
  'ของเล่นสะสม',
  'หนังสือเก่า',
  'เซรามิก',
  'เครื่องดนตรี',
  'ภาพถ่าย',
  'ของโบราณ',
] as const

/** หมวดหมู่หน้า Home → CategoryRich[] (imageUrl ว่าง → แอป render ไอคอนแทน) */
export async function listCategories(): Promise<{ id: string; name: string; imageUrl: string }[]> {
  return HOME_CATEGORIES.map((c) => ({ id: c, name: c, imageUrl: '' }))
}

/** auction ที่ user กด watch ไว้ → BrowsedAuction[] */
export async function watchingAuctions(
  userId: string,
): Promise<(AuctionDTO & { bidderCount: number })[]> {
  const rows = await prisma.watchList.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { auction: { include: { _count: { select: { bids: true } } } } },
  })
  return rows.map((w) => ({ ...toAuctionDTO(w.auction), bidderCount: w.auction._count.bids }))
}

/** ประวัติการบิดของ user → HistoryEntry[] */
export async function bidHistory(
  userId: string,
  limit = 50,
): Promise<{ id: string; kind: 'bid'; text: string; atMs: number }[]> {
  const rows = await prisma.bid.findMany({
    where: { bidderId: userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { auction: { select: { title: true } } },
  })
  return rows.map((b) => ({
    id: b.id,
    kind: 'bid' as const,
    text: `บิด ${Number(b.amount).toLocaleString()} บาท — ${b.auction.title}`,
    atMs: b.createdAt.getTime(),
  }))
}

/**
 * Phase 2 — ปิดประมูล 1 รายการ: ถ้าหมดเวลาแล้วและยัง live →
 *  - set status='ended'
 *  - ผู้บิดสูงสุด = ผู้ชนะ → สร้าง SafePay Order (PENDING) ผูก auctionId
 * idempotent: auctionId @unique + เช็ค order เดิมก่อน. ไม่มีบิด = ปิดเฉย ๆ ไม่มี order.
 */
export async function settleAuction(
  auctionId: string,
): Promise<{ ended: boolean; orderId: string | null }> {
  return prisma.$transaction(async (tx) => {
    const a = await tx.auction.findUnique({
      where: { id: auctionId },
      include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
    })
    if (!a) return { ended: false, orderId: null }

    // ยังไม่ถึงเวลาปิด → ไม่ทำอะไร
    if (a.status !== 'ended' && a.endTime.getTime() > Date.now()) {
      return { ended: false, orderId: null }
    }

    // ปิดแล้ว — หา order เดิม (idempotent)
    const existing = await tx.order.findUnique({ where: { auctionId } })
    if (existing) {
      if (a.status !== 'ended') await tx.auction.update({ where: { id: auctionId }, data: { status: 'ended' } })
      return { ended: true, orderId: existing.id }
    }

    if (a.status !== 'ended') {
      await tx.auction.update({ where: { id: auctionId }, data: { status: 'ended' } })
    }

    const winner = a.bids[0]
    if (!winner) return { ended: true, orderId: null } // ไม่มีคนบิด → ไม่มีผู้ชนะ

    const order = await tx.order.create({
      data: {
        auctionId: a.id,
        shopId: a.shopId,
        buyerUserId: winner.bidderId,
        type: 'PHYSICAL',
        totalAmount: a.currentPrice,
        status: 'PENDING',
        fulfillmentMode: 'SHIPPED',
        items: { create: [{ name: a.title, qty: 1, price: a.currentPrice }] },
      },
    })

    // แจ้งเตือน "คุณชนะการประมูล" ให้ผู้ชนะ
    await tx.notification.create({
      data: {
        userId: winner.bidderId,
        kind: 'won',
        title: 'คุณชนะการประมูล! 🎉',
        body: `${a.title} ฿${Number(a.currentPrice).toLocaleString()} — ชำระเงินเพื่อรับสินค้า`,
        refId: order.id,
      },
    })
    return { ended: true, orderId: order.id }
  })
}

/** sweep — ปิดทุก auction ที่หมดเวลาแต่ยัง live (เรียกแบบ lazy ตอน browse/won) */
export async function settleEndedAuctions(): Promise<number> {
  const ended = await prisma.auction.findMany({
    where: { status: 'live', endTime: { lte: new Date() } },
    select: { id: true },
    take: 100,
  })
  let n = 0
  for (const { id } of ended) {
    try {
      await settleAuction(id)
      n++
    } catch (e) {
      console.error('[settleEndedAuctions] failed for', id, e)
    }
  }
  return n
}

export class BidError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/**
 * วางบิด — atomic ใน transaction:
 *  - auction ต้อง live + ยังไม่หมดเวลา
 *  - amount ต้อง >= currentPrice + bidIncrement
 *  - สร้าง Bid + อัปเดต currentPrice/bidCount
 * คืน auction ที่อัปเดตแล้ว (DTO).
 */
export async function placeBid(
  auctionId: string,
  bidderId: string,
  amount: number,
): Promise<AuctionDTO> {
  return prisma.$transaction(async (tx) => {
    const a = await tx.auction.findUnique({ where: { id: auctionId } })
    if (!a) throw new BidError('ไม่พบรายการประมูล', 404)
    if (a.status === 'ended' || a.endTime.getTime() <= Date.now()) {
      throw new BidError('การประมูลปิดแล้ว', 409)
    }
    const minNext = Number(a.currentPrice) + Number(a.bidIncrement)
    if (amount < minNext) {
      throw new BidError(`ต้องบิดอย่างน้อย ${minNext.toLocaleString()} บาท`, 400)
    }

    // ผู้บิดสูงสุดก่อนหน้า (ไว้แจ้งเตือนว่าโดนแซง)
    const prevTop = await tx.bid.findFirst({
      where: { auctionId },
      orderBy: { amount: 'desc' },
      select: { bidderId: true },
    })

    await tx.bid.create({ data: { auctionId, bidderId, amount } })
    const updated = await tx.auction.update({
      where: { id: auctionId },
      data: { currentPrice: amount, bidCount: { increment: 1 } },
    })

    // แจ้งเตือน "โดนแซงราคา" ให้ผู้บิดสูงสุดเดิม (ถ้ามี และไม่ใช่คนเดิม)
    if (prevTop && prevTop.bidderId !== bidderId) {
      await tx.notification.create({
        data: {
          userId: prevTop.bidderId,
          kind: 'outbid',
          title: 'มีคนเสนอราคาสูงกว่า',
          body: `${a.title} — ราคาล่าสุด ฿${amount.toLocaleString()}`,
          refId: auctionId,
        },
      })
    }
    return toAuctionDTO(updated)
  })
}
