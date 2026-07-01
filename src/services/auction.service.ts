/**
 * Auction service — โดเมนประมูลของ Buyer App + Seller Console (feature 00002 — Seller Auction)
 *
 * แหล่งสเปก (SSOT ต่อชั้น):
 *   - docs/20 - Features/00002 - Seller Auction/SDS.md §6/§7 (function signature + DTO design)
 *   - docs/20 - Features/00002 - Seller Auction/SRS.md §3 (TFR-001~017) + §8 (risk R-SRS-1~7)
 *   - docs/20 - Features/00002 - Seller Auction/API.md §9 (DTO appendix)
 *
 * DTO 2 ชนิดแยกจริง (TFR-013) — ป้องกัน dev เผลอ leak `reservePrice`/`expectedPrice` ให้ buyer:
 *   - PublicAuctionDTO  → buyer-facing (REST /api/app/auctions/** + Realtime payload subset)
 *   - SellerAuctionDTO  → seller-facing เท่านั้น (เพิ่ม reservePrice/expectedPrice/cancelledAt/bidHistory)
 *
 * งานชุดนี้ (Batch B task #3) ครอบคลุมเฉพาะ "core" —
 *   DTO/mapper, error class, placeBid (concurrency-safe), settleAuctionCore/settleAuction (2-layer),
 *   flipScheduledToLive, endEarlyAuction, adjustSuccessfulBidCount
 * Seller CRUD (createAuction/updateAuction/cancelAuction/publishAuction/listSellerAuctions/
 * getSellerAuctionDetail) = task #4 แยก (type/mapper ที่ export จากไฟล์นี้ให้ #4 ใช้ต่อได้ทันที)
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { pushToUser } from '@/services/app-push.service'
import { evaluateBadges } from '@/services/badge.service'

const PAGE_SIZE = 20

// ─────────────────────────────────────────────────────────────────────────────
// DTO types (SDS §7.1 / API.md §9 — 2 type แยกจริง)
// ─────────────────────────────────────────────────────────────────────────────

/** buyer-facing (REST /api/app/auctions/** + Realtime payload subset) */
export type PublicAuctionDTO = {
  id: string
  title: string
  description: string | null
  imageUrl: string
  images: string[]
  currentPrice: number
  bidIncrement: number
  buyNowPrice: number | null
  hasReserve: boolean // แทนค่า reservePrice จริง — ห้ามส่งตัวเลขจริงให้ buyer
  antiSnipeCount: number
  startTimeMs: number | null
  endTimeMs: number
  bidCount: number
  shopId: string
  status: 'draft' | 'scheduled' | 'live' | 'ended' | 'unsold' | 'cancelled'
  category: string | null
}
// *** ห้ามมี key `reservePrice`/`expectedPrice` ใน type นี้เลย (ไม่ใช่ optional undefined) ***

/** seller-facing เท่านั้น (GET /api/seller/auctions/[id]) */
export type SellerAuctionDTO = PublicAuctionDTO & {
  reservePrice: number | null
  expectedPrice: number | null // pure display indicator, ไม่กระทบ settle logic ใด ๆ (TFR-013)
  // หมายเหตุ: SDS §7.1 ระบุ ISO string (RSC-safe pattern) ส่วน API.md §9 เขียนเป็น epoch ms —
  // 2 เอกสารขัดกัน — ยึด SDS (มี mapper code ชัดเจน + เหตุผล RSC-safe ผูกกับ
  // feedback_rsc_pii_neutralize_at_source) แจ้ง Controller ให้ sync เอกสารต่อ
  cancelledAt: string | null // ISO string
  bidHistory: BidDTO[] // top 20, displayName only
}

/** สำหรับ GET /api/seller/auctions (list) — เบากว่า SellerAuctionDTO เต็ม */
export type SellerAuctionListItemDTO = Pick<
  SellerAuctionDTO,
  'id' | 'title' | 'imageUrl' | 'status' | 'currentPrice' | 'bidCount' | 'endTimeMs' | 'startTimeMs'
>

/** ไม่มี field ใหม่ — reuse ของเดิม 100% */
export type BidDTO = { id: string; amount: number; bidder: string; atMs: number }

/** @deprecated ใช้ `PublicAuctionDTO` แทน — คง alias ไว้กัน caller เดิม (เช่น import ชื่อ type นี้ในอนาคต) ไม่พัง */
export type AuctionDTO = PublicAuctionDTO

type AuctionRow = Prisma.AuctionGetPayload<{}>

// ─────────────────────────────────────────────────────────────────────────────
// Mapper (SDS §7.2) — ห้าม spread `...a` หรือ literal ที่มี reservePrice/expectedPrice ปนใน PublicAuctionDTO
// ─────────────────────────────────────────────────────────────────────────────

export function toPublicAuctionDTO(a: AuctionRow): PublicAuctionDTO {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    imageUrl: a.imageUrl,
    images: (a.images as string[]) ?? [],
    currentPrice: Number(a.currentPrice),
    bidIncrement: Number(a.bidIncrement),
    buyNowPrice: a.buyNowPrice ? Number(a.buyNowPrice) : null,
    hasReserve: a.reservePrice != null, // ← จุดเดียวที่ "แตะ" reservePrice ใน mapper นี้ (boolean cast เท่านั้น)
    antiSnipeCount: a.antiSnipeCount,
    startTimeMs: a.startTime ? a.startTime.getTime() : null,
    endTimeMs: a.endTime.getTime(),
    bidCount: a.bidCount,
    shopId: a.shopId,
    status: a.status as PublicAuctionDTO['status'],
    category: a.category,
  }
}

export function toSellerAuctionDTO(a: AuctionRow, bidHistory: BidDTO[]): SellerAuctionDTO {
  return {
    ...toPublicAuctionDTO(a),
    reservePrice: a.reservePrice ? Number(a.reservePrice) : null,
    expectedPrice: a.expectedPrice ? Number(a.expectedPrice) : null,
    cancelledAt: a.cancelledAt ? a.cancelledAt.toISOString() : null,
    bidHistory,
  }
}

/**
 * @deprecated ใช้ `toPublicAuctionDTO` แทน — คง export ชื่อเดิมไว้เพราะ `app-shop.service.ts`
 * ยัง import ตรง ๆ อยู่ (`liveAuctions.map(toAuctionDTO)`) — เป็น superset ที่เข้ากันได้
 * (เพิ่ม field เท่านั้น ไม่มี field หายไป จึงไม่พัง caller เดิม)
 */
export function toAuctionDTO(a: AuctionRow): PublicAuctionDTO {
  return toPublicAuctionDTO(a)
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
}): Promise<{ items: (PublicAuctionDTO & { bidderCount: number })[]; nextCursor: number | null }> {
  // lazy sweep ก่อน query หลัก (TFR-015 ต้องมาก่อน settle เพื่อให้ scheduled ที่ถึงเวลาได้ขึ้น live ก่อนถูกกรองสถานะ)
  await flipScheduledToLive()
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
  const items = pageRows.map((r) => ({ ...toPublicAuctionDTO(r), bidderCount: r._count.bids }))
  return { items, nextCursor: hasNext ? page + 1 : null }
}

/** auction ที่บิดเยอะสุด (สำหรับ section "กำลังประมูล" / Top) */
export async function topAuctions(limit = 10): Promise<PublicAuctionDTO[]> {
  await flipScheduledToLive()
  await settleEndedAuctions()
  const rows = await prisma.auction.findMany({
    where: { status: 'live' },
    orderBy: { bidCount: 'desc' },
    take: limit,
  })
  return rows.map(toPublicAuctionDTO)
}

/** auction รายตัว + ประวัติบิดล่าสุด (buyer-facing — public detail) */
export async function getAuctionDetail(
  id: string,
): Promise<(PublicAuctionDTO & { bidHistory: BidDTO[] }) | null> {
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
    ...toPublicAuctionDTO(a),
    bidHistory: a.bids.map((b) => ({
      id: b.id,
      amount: Number(b.amount),
      bidder: b.bidder.displayName,
      atMs: b.createdAt.getTime(),
    })),
  }
}

/** ค้นหา auction จาก title (live เท่านั้น) */
export async function searchAuctions(q: string, limit = 30): Promise<PublicAuctionDTO[]> {
  const term = q.trim()
  if (!term) return []
  const rows = await prisma.auction.findMany({
    where: { status: 'live', title: { contains: term, mode: 'insensitive' } },
    orderBy: { bidCount: 'desc' },
    take: limit,
  })
  return rows.map(toPublicAuctionDTO)
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
): Promise<(PublicAuctionDTO & { bidderCount: number })[]> {
  const rows = await prisma.watchList.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { auction: { include: { _count: { select: { bids: true } } } } },
  })
  return rows.map((w) => ({ ...toPublicAuctionDTO(w.auction), bidderCount: w.auction._count.bids }))
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

// ─────────────────────────────────────────────────────────────────────────────
// Error classes (SDS §11.1)
// ─────────────────────────────────────────────────────────────────────────────

export class BidError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export class AuctionOpError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409,
  ) {
    super(message)
  }
}

export class BelowReserveConfirmError extends Error {
  readonly status = 409 as const
  readonly code = 'BELOW_RESERVE_CONFIRM_REQUIRED' as const
  constructor(
    readonly currentPrice: number,
    readonly hasReserve: true,
  ) {
    super('ต้องยืนยันก่อนจบประมูลที่ราคาต่ำกว่า reserve')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Settle (2-layer ตาม R-SRS-5 — settleAuctionCore ห้ามเปิด $transaction เอง)
// ─────────────────────────────────────────────────────────────────────────────

/** ข้อมูลที่ต้องใช้ทำ post-commit best-effort hook (push/badge/level) — ไม่ผ่าน DB ระหว่าง tx */
type SettledInfo = {
  orderId: string
  winnerId: string
  shopUserId: string
  title: string
  price: number
}

/**
 * settleAuctionCore — ปิด auction 1 รายการ (ชั้นใน, รับ `tx` จากภายนอกเสมอ ห้ามเปิด `$transaction` เอง — R-SRS-5)
 *  - idempotent: เช็ค Order เดิมก่อนสร้างซ้ำเสมอ (R-SRS-4 backstop 2 ชั้น คู่กับ `Order.auctionId @unique`)
 *  - reserve check (TFR-008): currentPrice < reservePrice → unsold (ไม่สร้าง Order)
 *  - winner = bid ORDER BY amount DESC, createdAt ASC (tiebreak ตาม BRD §8.6)
 *  - force=true: ข้าม endTime>now() check (ใช้จาก buy-now/end-early)
 *  - onSettled: callback sync (ไม่ await) เอาไว้ให้ caller capture ข้อมูลสำหรับ post-commit
 *    hook (push/adjustSuccessfulBidCount/evaluateBadges) — เรียกเฉพาะตอนสร้าง Order ใหม่จริง
 *    (ไม่ยิงซ้ำตอน idempotent-hit) ตาม NFR "post-commit best-effort ไม่ throw กระทบ write path"
 */
export async function settleAuctionCore(
  tx: Prisma.TransactionClient,
  auctionId: string,
  opts?: { force?: boolean; onSettled?: (info: SettledInfo) => void },
): Promise<{ ended: boolean; orderId: string | null }> {
  const a = await tx.auction.findUnique({
    where: { id: auctionId },
    include: {
      shop: { select: { userId: true } },
      bids: { orderBy: [{ amount: 'desc' }, { createdAt: 'asc' }], take: 1 }, // winner + tiebreak (BRD §8.6)
    },
  })
  if (!a) return { ended: false, orderId: null }

  // idempotent — มี Order อยู่แล้ว → คืนผลเดิม ไม่สร้างซ้ำ (เรียกซ้ำกี่ครั้งผลลัพธ์เหมือนเดิม)
  const existing = await tx.order.findUnique({ where: { auctionId } })
  if (existing) {
    if (a.status === 'live') await tx.auction.update({ where: { id: auctionId }, data: { status: 'ended' } })
    return { ended: true, orderId: existing.id }
  }

  // ปิดไปแล้วเป็น terminal state โดยไม่มี order (unsold/ended จากการเรียกครั้งก่อน) → ไม่ทำซ้ำ
  if (a.status === 'unsold' || a.status === 'ended') {
    return { ended: true, orderId: null }
  }

  // ยังไม่ถึงเวลาปิด (เว้นแต่ force=true จาก buy-now/end-early — TFR-007/TFR-012)
  if (!opts?.force && a.endTime.getTime() > Date.now()) {
    return { ended: false, orderId: null }
  }

  const winner = a.bids[0]
  // reserve check (TFR-008) — ไม่มี reserve = ถือว่า met เสมอ
  const reserveMet = a.reservePrice == null || Number(a.currentPrice) >= Number(a.reservePrice)

  if (!winner || !reserveMet) {
    await tx.auction.update({ where: { id: auctionId }, data: { status: 'unsold' } })
    return { ended: true, orderId: null }
  }

  await tx.auction.update({ where: { id: auctionId }, data: { status: 'ended' } })

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

  // แจ้งเตือน "คุณชนะการประมูล" ให้ผู้ชนะ (in-app, อยู่ใน tx เดียวกับ order — ต้องสำเร็จคู่กัน)
  await tx.notification.create({
    data: {
      userId: winner.bidderId,
      kind: 'won',
      title: 'คุณชนะการประมูล! 🎉',
      body: `${a.title} ฿${Number(a.currentPrice).toLocaleString()} — ชำระเงินเพื่อรับสินค้า`,
      refId: order.id,
    },
  })

  opts?.onSettled?.({
    orderId: order.id,
    winnerId: winner.bidderId,
    shopUserId: a.shop.userId,
    title: a.title,
    price: Number(a.currentPrice),
  })

  return { ended: true, orderId: order.id }
}

/**
 * post-commit best-effort hook — push "ชนะการประมูล" + adjustSuccessfulBidCount(+1) +
 * evaluateBadges(seller/buyer) — เรียกหลัง transaction ที่มี settleAuctionCore commit สำเร็จแล้วเท่านั้น
 * ห้าม throw กระทบ caller (TFR-009/016/017 — "post-commit, ไม่ throw")
 */
async function runPostSettleHooks(info: SettledInfo): Promise<void> {
  try {
    await pushToUser(
      info.winnerId,
      'คุณชนะการประมูล! 🎉',
      `${info.title} ฿${info.price.toLocaleString()} — ชำระเงินเพื่อรับสินค้า`,
      { type: 'won', orderId: info.orderId },
    )
  } catch (e) {
    console.error('[settleAuctionCore] pushToUser failed', e)
  }
  try {
    await adjustSuccessfulBidCount(info.winnerId, 1)
  } catch (e) {
    console.error('[settleAuctionCore] adjustSuccessfulBidCount failed', e)
  }
  try {
    await evaluateBadges(info.shopUserId, 'SELLER')
  } catch (e) {
    console.error('[settleAuctionCore] evaluateBadges(SELLER) failed', e)
  }
  try {
    await evaluateBadges(info.winnerId, 'BUYER')
  } catch (e) {
    console.error('[settleAuctionCore] evaluateBadges(BUYER) failed', e)
  }
}

/**
 * settleAuction — wrapper เดิม (คง signature เป๊ะ — caller เดิม `settleEndedAuctions`/
 * `/api/app/auctions/[id]/settle` ไม่ต้องแก้) เปิด `$transaction` เองแล้วเรียก `settleAuctionCore`
 */
export async function settleAuction(auctionId: string): Promise<{ ended: boolean; orderId: string | null }> {
  let hook: SettledInfo | null = null
  const result = await prisma.$transaction((tx) =>
    settleAuctionCore(tx, auctionId, {
      onSettled: (info) => {
        hook = info
      },
    }),
  )
  if (hook) void runPostSettleHooks(hook)
  return result
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

/** flipScheduledToLive (TFR-015) — scheduled ที่ถึงเวลาเปิดแล้ว → live, เรียกแบบ lazy ก่อน query หลัก */
export async function flipScheduledToLive(): Promise<number> {
  const due = await prisma.auction.findMany({
    where: { status: 'scheduled', startTime: { lte: new Date() } },
    select: { id: true },
    take: 100,
  })
  let n = 0
  for (const { id } of due) {
    try {
      // conditional update กัน race ถ้ามีคำขออื่น flip พร้อมกัน (currentPrice ตั้งเป็น startPrice ไว้แล้วตอน create)
      const res = await prisma.auction.updateMany({ where: { id, status: 'scheduled' }, data: { status: 'live' } })
      if (res.count > 0) n++
    } catch (e) {
      console.error('[flipScheduledToLive] failed for', id, e)
    }
  }
  return n
}

/**
 * endEarlyAuction (TFR-012) — seller สั่งจบ auction ก่อนถึง endTime
 * ownership + status guard, below-reserve double-confirm, reuse settleAuctionCore(force:true) 100%
 */
export async function endEarlyAuction(
  auctionId: string,
  shopUserId: string,
  opts: { confirmBelowReserve?: boolean } = {},
): Promise<{ status: 'ended' | 'unsold'; orderId: string | null }> {
  let hook: SettledInfo | null = null
  const result = await prisma.$transaction(async (tx) => {
    const a = await tx.auction.findUnique({
      where: { id: auctionId },
      include: { shop: { select: { userId: true } } },
    })
    if (!a) throw new AuctionOpError('ไม่พบรายการประมูล', 404)
    if (a.shop.userId !== shopUserId) throw new AuctionOpError('ไม่มีสิทธิ์เข้าถึง', 403)
    if (a.status !== 'live') throw new AuctionOpError('ไม่สามารถจบประมูลนี้ได้ในสถานะปัจจุบัน', 409)

    // AC-03: double-confirm เมื่อราคายังไม่ถึง reserve (มีคนบิดแล้วแต่ราคาต่ำกว่า reserve)
    const belowReserve = a.reservePrice != null && Number(a.currentPrice) < Number(a.reservePrice)
    if (a.bidCount >= 1 && belowReserve && !opts.confirmBelowReserve) {
      throw new BelowReserveConfirmError(Number(a.currentPrice), true)
    }

    return settleAuctionCore(tx, auctionId, {
      force: true, // ข้าม endTime>now() check — จบก่อนเวลาได้
      onSettled: (info) => {
        hook = info
      },
    })
  })

  if (hook) void runPostSettleHooks(hook)
  return { status: result.orderId ? 'ended' : 'unsold', orderId: result.orderId }
}

/**
 * adjustSuccessfulBidCount (TFR-016) — ปรับ `User.successfulBidCount` (ใช้คำนวณ User Level ladder)
 *  - +1: เรียกจาก settleAuctionCore เมื่อมี winner (post-commit best-effort)
 *  - -1: เรียกจาก order cancel flow (order.service.ts) เมื่อ Order.auctionId != null (GREATEST(0,...) กันติดลบ)
 */
export async function adjustSuccessfulBidCount(userId: string, delta: 1 | -1): Promise<void> {
  if (delta === 1) {
    await prisma.user.update({ where: { id: userId }, data: { successfulBidCount: { increment: 1 } } })
    return
  }
  // -1: ใช้ raw SQL เพราะต้อง GREATEST(0, count-1) กัน underflow ติดลบ (Prisma ไม่มี helper นี้ตรง ๆ)
  await prisma.$executeRaw`UPDATE "User" SET "successfulBidCount" = GREATEST(0, "successfulBidCount" - 1) WHERE id = ${userId}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Place Bid (TFR-005/006/007 — conditional-update concurrency guard, R-SRS-1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * วางบิด — atomic ใน transaction เดียว ครอบคลุม anti-snipe + buy-now instant settle:
 *  - guard: auction live, ยังไม่หมดเวลา, ไม่ self-bid, amount >= currentPrice+bidIncrement
 *  - conditional `updateMany` WHERE currentPrice=<snapshot> (R-SRS-1 — กัน lost-update ข้าม
 *    concurrent transaction, pattern เดียวกับ `wallet.service.ts::deductCredit`) — count===0 → 409
 *  - amount >= buyNowPrice → buy-now path: `settleAuctionCore(tx, id, {force:true})` ในทรานแซคชันเดียว (TFR-007)
 *  - ไม่ใช่ buy-now → anti-snipe (endTime-now<=60s && antiSnipeCount<5 → +60s,+1 ในทรานแซคชันเดียว, TFR-006)
 *  - post-commit best-effort: pushToUser(outbid) + evaluateBadges(bidderId,'BUYER') — ห้าม throw กระทบ response
 */
export async function placeBid(auctionId: string, bidderId: string, amount: number): Promise<PublicAuctionDTO> {
  let outbidUserId: string | null = null
  let outbidTitle = ''
  let settleHook: SettledInfo | null = null

  const dto = await prisma.$transaction(async (tx) => {
    const a = await tx.auction.findUnique({
      where: { id: auctionId },
      include: { shop: { select: { userId: true } } },
    })
    if (!a) throw new BidError('ไม่พบรายการประมูล', 404)
    if (a.status !== 'live' || a.endTime.getTime() <= Date.now()) {
      throw new BidError('การประมูลปิดแล้ว', 409)
    }
    if (a.shop.userId === bidderId) {
      throw new BidError('ไม่สามารถเสนอราคา auction ของตัวเองได้', 403)
    }
    const minNext = Number(a.currentPrice) + Number(a.bidIncrement)
    if (amount < minNext) {
      throw new BidError(`ต้องบิดอย่างน้อย ${minNext.toLocaleString()} บาท`, 400)
    }

    // conditional update (R-SRS-1) — WHERE currentPrice ต้องยังเท่าค่าที่เพิ่งอ่าน (optimistic guard)
    // ป้องกัน lost-update เมื่อ 2 transaction วิ่งพร้อมกันภายใต้ READ COMMITTED
    const res = await tx.auction.updateMany({
      where: { id: auctionId, status: 'live', currentPrice: a.currentPrice },
      data: { currentPrice: amount, bidCount: { increment: 1 } },
    })
    if (res.count === 0) {
      // มีคนแซงระหว่างที่เราอ่านค่า — ให้ client retry ด้วย currentPrice ล่าสุด (FR-AUC-05-AC-08)
      throw new BidError('มีคนเสนอราคาก่อนคุณ กรุณาลองใหม่', 409)
    }

    // ผู้บิดสูงสุดก่อนหน้า (ไว้แจ้งเตือนว่าโดนแซง)
    const prevTop = await tx.bid.findFirst({
      where: { auctionId },
      orderBy: { amount: 'desc' },
      select: { bidderId: true },
    })

    await tx.bid.create({ data: { auctionId, bidderId, amount } })

    if (a.buyNowPrice != null && amount >= Number(a.buyNowPrice)) {
      // buy-now path (TFR-007) — settle ทันทีในทรานแซคชันเดียวกัน (reuse settleAuctionCore 100%)
      await settleAuctionCore(tx, auctionId, {
        force: true,
        onSettled: (info) => {
          settleHook = info
        },
      })
    } else {
      // anti-snipe (TFR-006) — เช็คจาก a.endTime ที่อ่านตอนต้น tx (ไม่ใช่ wall-clock เฉย ๆ) กัน race ข้าม tx (R-SRS-3)
      if (a.endTime.getTime() - Date.now() <= 60_000 && a.antiSnipeCount < 5) {
        await tx.auction.update({
          where: { id: auctionId },
          data: {
            endTime: new Date(a.endTime.getTime() + 60_000),
            antiSnipeCount: { increment: 1 },
          },
        })
      }
    }

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
      outbidUserId = prevTop.bidderId
      outbidTitle = a.title
    }

    // อ่านค่าล่าสุดหลังทุก branch (bid ปกติ/anti-snipe/buy-now settle) — ให้ผลถูกต้องทุกกรณีเดียวกัน
    const updated = await tx.auction.findUniqueOrThrow({ where: { id: auctionId } })
    return toPublicAuctionDTO(updated)
  })

  // post-commit best-effort — ห้ามให้ throw กระทบ response ของ placeBid (TFR-005/017)
  if (outbidUserId) {
    void pushToUser(outbidUserId, 'มีคนเสนอราคาสูงกว่า', `${outbidTitle} — ฿${amount.toLocaleString()}`, {
      type: 'outbid',
      auctionId,
    })
  }
  if (settleHook) void runPostSettleHooks(settleHook)
  evaluateBadges(bidderId, 'BUYER').catch((e) => console.error('[placeBid] evaluateBadges(BUYER) failed', e))

  return dto
}

// ─────────────────────────────────────────────────────────────────────────────
// Seller CRUD (Batch B task #4) — createAuction/updateAuction/cancelAuction/
// publishAuction/listSellerAuctions/getSellerAuctionDetail (SDS §6 signature เป๊ะ)
// reuse ของ #3 100%: AuctionOpError/toSellerAuctionDTO/flipScheduledToLive — ไม่แตะ logic เดิม
// ─────────────────────────────────────────────────────────────────────────────

export type CreateAuctionInput = {
  title: string
  description?: string
  images: string[]
  category?: string
  productId?: string
  startPrice: number
  reservePrice?: number
  buyNowPrice?: number
  expectedPrice?: number
  bidIncrement: number
  mode: 'draft' | 'publishNow' | 'schedule'
  startTime?: Date
  endTime: Date
}

/** + startPrice/reservePrice/buyNowPrice/expectedPrice แก้ได้ตาม OQ-4 (BRD §2.7 sign-off 2026-07-01) */
export type UpdateAuctionInput = Partial<
  Pick<
    CreateAuctionInput,
    | 'title'
    | 'description'
    | 'images'
    | 'bidIncrement'
    | 'endTime'
    | 'category'
    | 'productId'
    | 'startPrice'
    | 'reservePrice'
    | 'buyNowPrice'
    | 'expectedPrice'
  >
>

/**
 * AuctionValidationError — เพิ่มใหม่สำหรับ task #4 เท่านั้น (ไม่แตะ error class ของ #3)
 * ใช้เมื่อ business validation fail หลัง "merge" ค่าที่แก้ (patch) เข้ากับ auction ปัจจุบันใน DB
 * (เช่น `updateAuction` เช็ค reservePrice>=startPrice โดยรวมค่าที่ไม่ได้ส่งมาในคำขอนี้ด้วย) — Valibot
 * ที่ route ชั้นบนตรวจได้แค่ field ที่ส่งมาจริง ไม่รู้ค่าที่ไม่ได้แก้ จึง merge-validate ต้องอยู่ที่ service
 * status 400 ให้ mapping ตรงกับ "Valibot safeParse fail" ใน SDS §11.2 (response shape ต่อ client เหมือนกัน)
 * ⚠️ หมายเหตุถึง Controller/reviewer: SDS §11.1/§11.2 ไม่ได้ list error class นี้ไว้ (เพราะ SDS §11 ออกแบบ
 * ก่อนที่จะลง detail ว่า merge-validate ต้องทำที่ไหน) — route handler (Batch C #6) ต้องเพิ่ม
 * `instanceof AuctionValidationError` → 400 ในการ map error ด้วย (ตาม pattern §11.3 เดิม)
 */
export class AuctionValidationError extends Error {
  readonly status = 400 as const
  constructor(message: string) {
    super(message)
  }
}

/** createAuction (TFR-001) — derive status จาก mode; currentPrice=startPrice เสมอตอนสร้าง */
export async function createAuction(shopId: string, input: CreateAuctionInput): Promise<SellerAuctionDTO> {
  // ห้ามรับ shopId จาก input object เด็ดขาด (FR-AUC-01-AC-09) — shopId มาจาก param เท่านั้น
  // (caller/route derive จาก session แล้วก่อนเรียกฟังก์ชันนี้ — กัน seller สร้าง auction ให้ shop อื่น)
  const status: 'draft' | 'scheduled' | 'live' =
    input.mode === 'draft' ? 'draft' : input.mode === 'schedule' ? 'scheduled' : 'live'

  const row = await prisma.auction.create({
    data: {
      shopId,
      title: input.title,
      description: input.description ?? null,
      imageUrl: input.images[0], // รูปแรกเป็น thumbnail หลัก — images[] เก็บ gallery เต็ม (schema ไม่มี field แยก)
      images: input.images,
      category: input.category ?? null,
      productId: input.productId ?? null,
      startPrice: input.startPrice,
      currentPrice: input.startPrice,
      reservePrice: input.reservePrice ?? null,
      buyNowPrice: input.buyNowPrice ?? null,
      expectedPrice: input.expectedPrice ?? null,
      bidIncrement: input.bidIncrement,
      status,
      startTime: status === 'scheduled' ? input.startTime : null,
      endTime: input.endTime,
      bidCount: 0,
      antiSnipeCount: 0,
    },
  })
  return toSellerAuctionDTO(row, [])
}

/**
 * updateAuction (TFR-002) — เฉพาะ status draft/scheduled เท่านั้น; ownership guard 403/404 (findUnique
 * + explicit check — ต่างจาก getSellerAuctionDetail เพราะ endpoint นี้ต้องคืน 403 ให้ต่างจาก 404 ตาม API.md
 * §4.4); price fields แก้ได้ตาม OQ-4 — merge กับค่าปัจจุบันใน DB แล้ว revalidate cross-field เหมือนตอนสร้าง
 */
export async function updateAuction(
  auctionId: string,
  shopUserId: string,
  input: UpdateAuctionInput,
): Promise<SellerAuctionDTO> {
  const a = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { shop: { select: { userId: true } } },
  })
  if (!a) throw new AuctionOpError('ไม่พบรายการประมูล', 404)
  if (a.shop.userId !== shopUserId) throw new AuctionOpError('ไม่มีสิทธิ์เข้าถึง', 403)
  // re-check ที่ DB จริง ไม่เชื่อ client state (race: seller ค้างฟอร์มไว้ระหว่างที่ auction publish ไปแล้วจาก tab อื่น — TFR-002)
  if (a.status !== 'draft' && a.status !== 'scheduled') {
    throw new AuctionOpError('ไม่สามารถแก้ไข auction ที่เปิดรับ bid แล้ว', 409)
  }

  // merge ค่าที่แก้เข้ากับค่าปัจจุบันเพื่อ revalidate cross-field (Valibot ชั้น route รู้แค่ field ที่ส่งมาในคำขอนี้)
  const mergedStartPrice = input.startPrice ?? Number(a.startPrice)
  const mergedReservePrice =
    'reservePrice' in input ? (input.reservePrice ?? null) : a.reservePrice != null ? Number(a.reservePrice) : null
  const mergedBuyNowPrice =
    'buyNowPrice' in input ? (input.buyNowPrice ?? null) : a.buyNowPrice != null ? Number(a.buyNowPrice) : null

  if (mergedReservePrice != null && mergedReservePrice < mergedStartPrice) {
    throw new AuctionValidationError('reservePrice ต้องไม่ต่ำกว่า startPrice')
  }
  if (mergedBuyNowPrice != null && mergedBuyNowPrice <= (mergedReservePrice ?? mergedStartPrice)) {
    throw new AuctionValidationError('buyNowPrice ต้องสูงกว่า reservePrice หรือ startPrice')
  }

  if (input.endTime) {
    if (input.endTime.getTime() < Date.now() + 30 * 60 * 1000) {
      throw new AuctionValidationError('endTime ต้องอยู่ในอนาคตอย่างน้อย 30 นาที')
    }
    if (a.startTime && input.endTime.getTime() <= a.startTime.getTime()) {
      throw new AuctionValidationError('startTime ต้องอยู่ในอนาคตและก่อน endTime')
    }
  }

  const updated = await prisma.auction.update({
    where: { id: auctionId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.images !== undefined ? { images: input.images, imageUrl: input.images[0] } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.productId !== undefined ? { productId: input.productId } : {}),
      ...(input.bidIncrement !== undefined ? { bidIncrement: input.bidIncrement } : {}),
      ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
      ...(input.startPrice !== undefined ? { startPrice: input.startPrice, currentPrice: input.startPrice } : {}),
      ...('reservePrice' in input ? { reservePrice: input.reservePrice ?? null } : {}),
      ...('buyNowPrice' in input ? { buyNowPrice: input.buyNowPrice ?? null } : {}),
      ...('expectedPrice' in input ? { expectedPrice: input.expectedPrice ?? null } : {}),
    },
  })
  return toSellerAuctionDTO(updated, [])
}

/**
 * cancelAuction (TFR-003) — conditional update กัน race: draft/scheduled ยกเลิกได้เสมอ,
 * live ต้อง bidCount===0; ended/unsold/cancelled = terminal (ยกเลิกไม่ได้)
 * หมายเหตุ: SDS §6 ระบุ return type `{status:'cancelled'}` แต่ API.md §4.6 เขียนว่าคืน `SellerAuctionDTO`
 * เต็ม — 2 เอกสารขัดกัน ยึด SDS ตามที่ Controller สั่งเป๊ะในงานนี้ (flag ให้ Controller sync เอกสารต่อ)
 */
export async function cancelAuction(auctionId: string, shopUserId: string): Promise<{ status: 'cancelled' }> {
  const a = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { shop: { select: { userId: true } } },
  })
  if (!a) throw new AuctionOpError('ไม่พบรายการประมูล', 404)
  if (a.shop.userId !== shopUserId) throw new AuctionOpError('ไม่มีสิทธิ์เข้าถึง', 403)

  if (a.status === 'live' && a.bidCount >= 1) {
    throw new AuctionOpError('ไม่สามารถยกเลิก auction ที่มีผู้เสนอราคาแล้ว', 409)
  }
  if (a.status === 'ended' || a.status === 'unsold' || a.status === 'cancelled') {
    throw new AuctionOpError('ไม่สามารถยกเลิก auction ในสถานะนี้ได้', 409)
  }

  // conditional update สองรูปแบบ (API.md §4.6 / TFR-003) — count===0 แปลว่า state เปลี่ยนไปแล้วระหว่างเช็ค (race)
  const res = await prisma.auction.updateMany({
    where: {
      id: auctionId,
      OR: [{ status: { in: ['draft', 'scheduled'] } }, { status: 'live', bidCount: 0 }],
    },
    data: { status: 'cancelled', cancelledAt: new Date() },
  })
  if (res.count === 0) {
    throw new AuctionOpError('ไม่สามารถยกเลิก auction ในสถานะนี้ได้ (สถานะเปลี่ยนไปแล้ว)', 409)
  }
  return { status: 'cancelled' }
}

/**
 * publishAuction (TFR-001 ต่อเนื่อง) — draft → live/scheduled เท่านั้น (409 ถ้า status!=='draft')
 * schedule ต้องมี startTime ในอนาคตและก่อน endTime เดิม (OQ-6 — reject ชัดเจน ไม่ auto-fallback publishNow)
 */
export async function publishAuction(
  auctionId: string,
  shopUserId: string,
  mode: 'publishNow' | 'schedule',
  startTime?: Date,
): Promise<SellerAuctionDTO> {
  const a = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { shop: { select: { userId: true } } },
  })
  if (!a) throw new AuctionOpError('ไม่พบรายการประมูล', 404)
  if (a.shop.userId !== shopUserId) throw new AuctionOpError('ไม่มีสิทธิ์เข้าถึง', 403)
  if (a.status !== 'draft') {
    throw new AuctionOpError('ไม่สามารถเผยแพร่ auction ในสถานะปัจจุบันได้', 409)
  }

  if (mode === 'schedule') {
    if (!startTime) throw new AuctionValidationError('startTime ต้องระบุเมื่อเลือกตั้งเวลาเปิดประมูล')
    // OQ-6 (BRD §2.7) — startTime อดีต/ปัจจุบัน → reject ชัดเจน ไม่ auto-fallback publishNow
    if (startTime.getTime() <= Date.now() || startTime.getTime() >= a.endTime.getTime()) {
      throw new AuctionValidationError('startTime ต้องอยู่ในอนาคตและก่อน endTime')
    }
  }

  const updated = await prisma.auction.update({
    where: { id: auctionId },
    data: {
      status: mode === 'schedule' ? 'scheduled' : 'live',
      startTime: mode === 'schedule' ? startTime : null,
    },
  })
  return toSellerAuctionDTO(updated, [])
}

/** listSellerAuctions (TFR-004) — WHERE shopId scope เสมอ (ไม่ post-filter); flipScheduledToLive lazy ก่อน query */
export async function listSellerAuctions(
  shopId: string,
  opts: { status?: string; page?: number },
): Promise<{ items: SellerAuctionListItemDTO[]; nextCursor: number | null }> {
  await flipScheduledToLive() // TFR-015 — seller เห็น status ล่าสุดแม้ buyer ยังไม่เคย browse

  const page = opts.page && opts.page > 0 ? opts.page : 1
  const where: Prisma.AuctionWhereInput = {
    shopId,
    ...(opts.status ? { status: opts.status } : {}),
  }

  const rows = await prisma.auction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1, // +1 เพื่อรู้ว่ามีหน้าถัดไปไหม
  })

  const hasNext = rows.length > PAGE_SIZE
  const pageRows = hasNext ? rows.slice(0, PAGE_SIZE) : rows
  const items: SellerAuctionListItemDTO[] = pageRows.map((r) => {
    const dto = toSellerAuctionDTO(r, [])
    return {
      id: dto.id,
      title: dto.title,
      imageUrl: dto.imageUrl,
      status: dto.status,
      currentPrice: dto.currentPrice,
      bidCount: dto.bidCount,
      endTimeMs: dto.endTimeMs,
      startTimeMs: dto.startTimeMs,
    }
  })
  // หมายเหตุ: SDS §6 คืน { items, nextCursor } แต่ API.md §4.2 เขียนว่าคืน { items, hasNext } — 2 เอกสารขัดกัน
  // ยึด SDS ตามที่ Controller สั่งเป๊ะในงานนี้ (flag ให้ Controller sync เอกสารต่อ)
  return { items, nextCursor: hasNext ? page + 1 : null }
}

/**
 * getSellerAuctionDetail (TFR-011) — ownership scope ที่ WHERE clause (findFirst ไม่ใช่ findUnique+post-check)
 * กัน RSC PII leak (feedback_rsc_dal_authz) — คืน null ถ้าไม่พบ/ไม่ใช่เจ้าของ (route map เป็น 404 ทั้งคู่)
 */
export async function getSellerAuctionDetail(
  auctionId: string,
  shopUserId: string,
): Promise<SellerAuctionDTO | null> {
  await flipScheduledToLive() // TFR-015 — seller เห็น status ล่าสุดแม้ buyer ยังไม่เคย browse

  const a = await prisma.auction.findFirst({
    where: { id: auctionId, shop: { userId: shopUserId } }, // ownership scope ที่ WHERE (ไม่ใช่ post-check)
    include: {
      bids: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { bidder: { select: { displayName: true } } },
      },
    },
  })
  if (!a) return null

  const history: BidDTO[] = a.bids.map((b) => ({
    id: b.id,
    amount: Number(b.amount),
    bidder: b.bidder.displayName, // displayName เท่านั้น — ไม่มี phone/email/bidderId (SRS §5.5 ข้อ 2)
    atMs: b.createdAt.getTime(),
  }))
  return toSellerAuctionDTO(a, history)
}
