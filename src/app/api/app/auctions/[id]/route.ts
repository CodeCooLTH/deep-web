import { NextRequest, NextResponse } from 'next/server'
import { getAuctionDetail } from '@/services/auction.service'

// GET /api/app/auctions/[id] — รายละเอียด auction + ประวัติบิด (public)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auction = await getAuctionDetail(id)
  if (!auction) return NextResponse.json({ error: 'ไม่พบรายการประมูล' }, { status: 404 })
  return NextResponse.json(auction)
}
