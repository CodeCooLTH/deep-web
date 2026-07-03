import { NextRequest, NextResponse } from 'next/server'
import { requireAppUser } from '@/lib/app-auth'
import { prisma } from '@/lib/prisma'
import { evaluateBadges } from '@/services/badge.service'

// POST /api/app/auctions/[id]/watch — เพิ่มเข้ารายการติดตาม (SRS §11 OQ-5, API.md §4.14)
// upsert กันกด watch ซ้ำชน @@unique([userId, auctionId])
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  const { user } = auth

  const { id } = await params
  const auction = await prisma.auction.findUnique({ where: { id }, select: { id: true } })
  if (!auction) return NextResponse.json({ error: 'ไม่พบรายการประมูล' }, { status: 404 })

  await prisma.watchList.upsert({
    where: { userId_auctionId: { userId: user.id, auctionId: id } },
    create: { userId: user.id, auctionId: id },
    update: {},
  })
  // trigger badge eval — best-effort ไม่ block response (Auction Watcher)
  void evaluateBadges(user.id, 'BUYER').catch((e) => console.error('[watch] evaluateBadges(BUYER) failed', e))
  return NextResponse.json({ watching: true })
}

// DELETE /api/app/auctions/[id]/watch — เอาออกจากรายการติดตาม (API.md §4.15)
// idempotent — ไม่เคย watch อยู่ก็ตอบ 200 { watching:false } เหมือนกัน (DELETE ควร idempotent ตาม REST semantics)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAppUser(request)
  if ('response' in auth) return auth.response
  const { user } = auth

  const { id } = await params
  await prisma.watchList.deleteMany({ where: { userId: user.id, auctionId: id } })
  return NextResponse.json({ watching: false })
}
