import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { bidHistoryPaged } from '@/services/auction.service'

// GET /api/app/auctions/[id]/bids?page=<n> — ประวัติการเสนอราคาแบบแบ่งหน้า (public, lazy-load)
// mirror /api/app/auctions/browse (page-based) — { items, nextPage }, ใหม่→เก่า
// session (web cookie) optional — ใช้คำนวณ reactedByMe เหมือน /api/app/auctions/[id]; mobile Bearer ไม่มี cookie → false
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const pageRaw = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1

  const exists = await prisma.auction.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'ไม่พบรายการประมูล' }, { status: 404 })

  const session = await getServerSession(authOptions)
  const viewerUserId = session?.user ? (session.user as { id: string }).id : undefined
  const result = await bidHistoryPaged(id, page, viewerUserId)
  return NextResponse.json(result)
}
