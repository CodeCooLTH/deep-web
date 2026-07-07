import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'
import { placeBid, BidError } from '@/services/auction.service'
import { prisma } from '@/lib/prisma'

// POST /api/app/auctions/[id]/buy-now — ซื้อทันที (TFR-007, API.md §4.12)
// ไม่รับ body — amount ต้องมาจาก auction.buyNowPrice ใน DB เท่านั้น (ห้าม client กำหนดราคาเอง)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  const { user } = auth

  const { id } = await params

  const auction = await prisma.auction.findUnique({ where: { id }, select: { buyNowPrice: true } })
  if (!auction) return NextResponse.json({ error: 'ไม่พบรายการประมูล' }, { status: 404 })
  if (auction.buyNowPrice == null) {
    return NextResponse.json({ error: 'auction นี้ไม่มีตัวเลือกซื้อทันที' }, { status: 400 })
  }

  try {
    // placeBid มี buy-now branch (amount >= buyNowPrice) ที่ settle ในทรานแซคชันเดียวกันแล้ว
    // (self-bid/ปิดแล้ว/race guard ทั้งหมดใช้ของ placeBid ตรง ๆ — ไม่ duplicate logic ที่นี่)
    const updatedAuction = await placeBid(id, user.id, Number(auction.buyNowPrice))

    // Order.auctionId @unique — เกิดจาก settleAuctionCore(force:true) ในทรานแซคชันของ placeBid ข้างบน
    const order = await prisma.order.findUnique({ where: { auctionId: id }, select: { id: true } })
    if (!order) {
      // ไม่ควรเกิด (placeBid buy-now branch ต้อง settle เสมอ) — log ไว้สืบสวนถ้าเจอ
      console.error('[POST /api/app/auctions/[id]/buy-now] settled but no Order found', { auctionId: id })
      return NextResponse.json({ error: 'ซื้อทันทีไม่สำเร็จ' }, { status: 500 })
    }

    return NextResponse.json({ auction: updatedAuction, orderId: order.id })
  } catch (e) {
    if (e instanceof BidError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
    console.error('[POST /api/app/auctions/[id]/buy-now] placeBid failed', e)
    return NextResponse.json({ error: 'ซื้อทันทีไม่สำเร็จ' }, { status: 500 })
  }
}
