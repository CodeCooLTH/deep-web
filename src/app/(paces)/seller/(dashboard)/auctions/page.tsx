/**
 * Base: src/app/(paces)/seller/(dashboard)/orders/page.tsx (RSC data-fetch + no-shop guard pattern)
 *   ก็ยึด theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx (ต้นทางของ orders/page.tsx)
 *
 * Adaptations:
 * - data fetching: listSellerAuctions (auction.service) แทน getOrdersByShop
 *   fetch ทุกสถานะครั้งเดียว (loop ตาม nextCursor สูงสุด 5 หน้า = 100 รายการ กัน shop ที่มีประมูลเยอะ
 *   แต่ยังจำกัด — ยังไม่มี UI pagination แยกต่างหากสำหรับกรณี >100 รายการ ตาม MVP scope)
 *   แล้วให้ client (AuctionListClient) filter เอง — เหมือน pattern orders (ไม่ filter ที่ server
 *   เพราะ AuctionStatStrip ต้องเห็นภาพรวมทุกสถานะพร้อมกัน ไม่ใช่แค่ filter ปัจจุบัน)
 * - stat strip: กำลังประมูล/ยอด live/ใกล้ปิด<1ชม. คำนวณจาก auctions ที่ fetch มา;
 *   บิดวันนี้ = prisma.bid.count ตรง (listSellerAuctions ไม่มี per-bid timestamp ให้ derive ได้)
 *   นับเป็น UTC calendar day (ตาม pattern เดียวกับ orders/page.tsx trend window — ไม่ shift
 *   Asia/Bangkok เพื่อความง่าย MVP, comment เดิมของ orders/page.tsx อธิบายเหตุผลไว้แล้ว)
 * - "no shop" guard เก็บไว้ (เหมือน orders/products)
 */

import { authOptions } from '@/lib/auth'
import { getServerSession } from 'next-auth'
import { requireActiveShop } from '@/lib/shop-context'
import { listSellerAuctions, type SellerAuctionListItemDTO } from '@/services/auction.service'
import { prisma } from '@/lib/prisma'
import Icon from '@/components/wrappers/Icon'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Link from 'next/link'
import type { Metadata } from 'next'
import AuctionStatStrip from './components/AuctionStatStrip'
import AuctionListClient from './components/AuctionListClient'
import AuctionLiveStrip, { type LiveStripItem } from './components/AuctionLiveStrip'
import { STATUS_TABS, type AuctionStatus } from './components/data'

export const metadata: Metadata = { title: 'การประมูล' }

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

const VALID_STATUSES = STATUS_TABS.map((t) => t.value).filter((v) => v !== 'all') as AuctionStatus[]

/** ดึงประมูลทั้งหมดของร้าน — loop ตาม nextCursor (service คืนทีละ 20) สูงสุด 5 หน้า (100 รายการ) */
async function fetchAllAuctions(shopId: string): Promise<SellerAuctionListItemDTO[]> {
  const all: SellerAuctionListItemDTO[] = []
  let page = 1
  for (let i = 0; i < 5; i++) {
    const { items, nextCursor } = await listSellerAuctions(shopId, { page })
    all.push(...items)
    if (!nextCursor) break
    page = nextCursor
  }
  return all
}

export default async function AuctionsPage({ searchParams }: PageProps) {
  const sp = await searchParams

  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) return null

  // Phase 4: resolve active shop (Personal หรือ Business ตาม context ที่สลับ) — membership guard ได้ฟรี
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })

  if (!active) {
    return (
      <div className="card p-10 rounded-xl text-center max-w-2xl mx-auto">
        <Icon icon="building-store" className="size-16 text-warning mx-auto mb-4" />
        <h2 className="text-xl font-bold text-dark mb-2">ยังไม่มีร้านค้า</h2>
        <p className="text-default-400 mb-6">ต้องสร้างร้านก่อนจึงจะเปิดประมูลได้</p>
        <Link
          href="/shop"
          className="btn bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-hover inline-flex items-center gap-2"
        >
          <Icon icon="plus" />
          สร้างร้านค้า
        </Link>
      </div>
    )
  }

  const shop = active.shop

  let auctions: SellerAuctionListItemDTO[] = []
  try {
    auctions = await fetchAllAuctions(shop.id)
  } catch {
    auctions = []
  }

  // บิดวันนี้ — ต้อง query ตรง (listSellerAuctions ไม่มี per-bid timestamp)
  let bidsToday = 0
  try {
    const now = new Date()
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    bidsToday = await prisma.bid.count({
      where: { createdAt: { gte: startOfDay }, auction: { shopId: shop.id } },
    })
  } catch {
    bidsToday = 0
  }

  const liveItems = auctions.filter((a) => a.status === 'live')
  const nowMs = Date.now()
  const closingSoonCount = liveItems.filter(
    (a) => a.endTimeMs - nowMs > 0 && a.endTimeMs - nowMs < 60 * 60 * 1000,
  ).length
  const liveTotal = liveItems.reduce((s, a) => s + a.currentPrice, 0)

  // livestrip (desktop) = live + scheduled ตาม mockup D1 — ต้องมี watchCount (COUNT WatchList)
  // "142 กำลังดู" ใน mockup = concurrent viewer ที่ระบบไม่มี → ใช้ "ติดตาม N" (WatchList) แทน
  const stripSource = auctions.filter((a) => a.status === 'live' || a.status === 'scheduled')
  let watchCountMap = new Map<string, number>()
  try {
    if (stripSource.length > 0) {
      const grouped = await prisma.watchList.groupBy({
        by: ['auctionId'],
        where: { auctionId: { in: stripSource.map((a) => a.id) } },
        _count: { auctionId: true },
      })
      watchCountMap = new Map(grouped.map((g) => [g.auctionId, g._count.auctionId]))
    }
  } catch {
    watchCountMap = new Map()
  }
  // live ก่อน แล้วตามด้วย scheduled (ตามลำดับ mockup)
  const stripItems: LiveStripItem[] = [
    ...stripSource.filter((a) => a.status === 'live'),
    ...stripSource.filter((a) => a.status === 'scheduled'),
  ].map((a) => ({
    id: a.id,
    title: a.title,
    imageUrl: a.imageUrl,
    currentPrice: a.currentPrice,
    bidCount: a.bidCount,
    endTimeMs: a.endTimeMs,
    startTimeMs: a.startTimeMs,
    status: a.status as 'live' | 'scheduled',
    watchCount: watchCountMap.get(a.id) ?? 0,
  }))

  const requestedStatus =
    sp.status && VALID_STATUSES.includes(sp.status as AuctionStatus) ? (sp.status as AuctionStatus) : undefined
  const activeStatus = requestedStatus ?? 'all'

  return (
    <>
      <div className="hidden lg:block">
        <PageBreadcrumb title="การประมูล" trail={[{ label: 'การขาย' }]} />
      </div>

      <AuctionStatStrip
        liveCount={liveItems.length}
        bidsToday={bidsToday}
        liveTotal={liveTotal}
        closingSoonCount={closingSoonCount}
      />

      <AuctionLiveStrip items={stripItems} />

      <AuctionListClient auctions={auctions} activeStatus={activeStatus} />
    </>
  )
}
