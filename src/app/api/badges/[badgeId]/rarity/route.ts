/**
 * GET /api/badges/[badgeId]/rarity
 *
 * คืนความหายาก (rarity) ของ badge คนเดียว — ข้อมูลสาธารณะ-ish แต่ gate ด้วย login
 * ทำไม require login: กัน scraping bulk rarity โดย anonymous
 * ทำไมไม่ cache: query เบา + ต้องการข้อมูลสด (shopCount/earnedCount เปลี่ยนบ่อย)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getBadgeRarity } from '@/services/badge.service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ badgeId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { badgeId } = await params
  if (!badgeId || badgeId.length < 1) {
    return NextResponse.json({ error: 'Invalid badgeId' }, { status: 400 })
  }

  try {
    const rarity = await getBadgeRarity(badgeId)
    if (!rarity) {
      return NextResponse.json({ error: 'Badge not found' }, { status: 404 })
    }
    return NextResponse.json(rarity)
  } catch (err) {
    console.error('[api/badges/rarity] error', badgeId, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
