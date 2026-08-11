import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAuctionDetail } from '@/services/auction.service'
import { getSellerTrust } from '@/services/app-shop.service'
import { sessionUserId } from '@/lib/session-user'

// GET /api/app/auctions/[id] — รายละเอียด auction + ประวัติบิด + trust ผู้ขาย (public)
// (compose ที่ route เพื่อเลี่ยง circular import: app-shop ↔ auction service)
// session (web cookie) optional — ใช้คำนวณ reactedByMe (feat 00005); mobile Bearer ไม่มี cookie → reactedByMe=false
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const viewerUserId = sessionUserId(session) ?? undefined
  const auction = await getAuctionDetail(id, viewerUserId)
  if (!auction) return NextResponse.json({ error: 'ไม่พบรายการประมูล' }, { status: 404 })
  const seller = await getSellerTrust(auction.shopId)
  return NextResponse.json({ ...auction, seller })
}
