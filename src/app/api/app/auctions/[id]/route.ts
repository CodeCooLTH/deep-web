import { NextRequest, NextResponse } from 'next/server'
import { getAuctionDetail } from '@/services/auction.service'
import { getSellerTrust } from '@/services/app-shop.service'

// GET /api/app/auctions/[id] — รายละเอียด auction + ประวัติบิด + trust ผู้ขาย (public)
// (compose ที่ route เพื่อเลี่ยง circular import: app-shop ↔ auction service)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auction = await getAuctionDetail(id)
  if (!auction) return NextResponse.json({ error: 'ไม่พบรายการประมูล' }, { status: 404 })
  const seller = await getSellerTrust(auction.shopId)
  return NextResponse.json({ ...auction, seller })
}
