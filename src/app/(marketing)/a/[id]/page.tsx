/**
 * /a/[id] — Public auction detail page (feature 00004 — Buyer Web Auction)
 *
 * RSC public (ไม่ต้อง login ก็ดูได้) — fetch PublicAuctionDTO (+bidHistory) + seller trust แล้ว
 * ส่งเป็น primitive props ให้ client wrapper AuctionDetailClient จัดการ realtime state + bid panel
 *
 * Base (RSC pattern — optional session + prisma lookup + flatten เป็น plain object ข้าม RSC boundary):
 *   src/app/(marketing)/o/[token]/page.tsx (getServerSession optional, prisma.findUnique ประกอบ
 *   ข้อมูลเสริม, ส่ง object primitive ล้วนให้ client component)
 *   + src/app/(marketing)/u/[username]/page.tsx (generateMetadata pattern)
 *
 * 🛑 ส่งเฉพาะ PublicAuctionDTO เท่านั้น — getAuctionDetail() คืน DTO จาก toPublicAuctionDTO() mapper
 * ที่ไม่มี key reservePrice/expectedPrice อยู่แล้ว (SSOT — ไม่ต้อง strip เพิ่มที่นี่)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAuctionDetail } from '@/services/auction.service'
import { getSellerTrust } from '@/services/app-shop.service'

import AuctionDetailClient from './AuctionDetailClient'
import { sessionUserId } from '@/lib/session-user'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const auction = await getAuctionDetail(id)
  if (!auction) return { title: 'ไม่พบรายการประมูล' }

  const description =
    auction.description ??
    `เสนอราคาสินค้า "${auction.title}" บน Deep — ราคาปัจจุบัน ฿${auction.currentPrice.toLocaleString()}`

  return {
    title: `${auction.title} — ประมูลบน Deep`,
    description,
    openGraph: {
      title: auction.title,
      description,
      images: auction.imageUrl ? [{ url: auction.imageUrl }] : undefined,
    },
  }
}

export default async function AuctionDetailPage({ params }: Props) {
  const { id } = await params

  // session เป็น optional เสมอ (หน้านี้ public) — ใช้เช็ค isWinner/initialWatching + reactedByMe (feat 00005)
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)

  const auction = await getAuctionDetail(id, userId ?? undefined)
  if (!auction) notFound()
  // draft = ยังไม่เผยแพร่ (seller แก้อยู่) — กันหลุด public ผ่าน direct link (security LOW, defense-in-depth)
  if (auction.status === 'draft') notFound()

  const seller = await getSellerTrust(auction.shopId)

  // isWinner (OQ-4/5): เทียบ session.user.id กับ Order.buyerUserId ของ auction นี้ — เช็คเฉพาะตอน
  // ended (unsold/cancelled ไม่มี Order เกิดขึ้นเลย); ไม่ login/ไม่ใช่ผู้ชนะ = false เสมอ (fail-closed)
  let isWinner = false
  if (userId && auction.status === 'ended') {
    const order = await prisma.order.findUnique({
      where: { auctionId: id },
      select: { buyerUserId: true },
    })
    isWinner = order?.buyerUserId === userId
  }

  // initialWatching — ไม่มี GET endpoint เช็คสถานะ watch แยก จึง query ตรงที่นี่ (RSC มี prisma อยู่แล้ว)
  // ให้ปุ่มหัวใจใน AuctionBidPanel เริ่มต้นตรงกับสถานะจริงถ้า user เคยกด watch ไว้ก่อนหน้า
  let initialWatching = false
  if (userId) {
    const watch = await prisma.watchList.findUnique({
      where: { userId_auctionId: { userId, auctionId: id } },
      select: { id: true },
    })
    initialWatching = !!watch
  }

  return (
    <AuctionDetailClient
      auction={auction}
      seller={seller}
      isWinner={isWinner}
      initialWatching={initialWatching}
    />
  )
}
