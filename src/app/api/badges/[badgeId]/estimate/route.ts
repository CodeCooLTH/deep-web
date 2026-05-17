/**
 * GET /api/badges/[badgeId]/estimate
 *
 * คืน pace estimate ของ badge สำหรับ user ที่ login อยู่
 *
 * Security: userId ดึงจาก getServerSession เท่านั้น — ห้าม trust query param/path
 * ทำไม: ถ้าดึงจาก URL จะมีช่อง IDOR ที่ user A ดู estimate ของ user B ได้
 *
 * ถ้าไม่มี badge ที่ตรง badgeId สำหรับ user นี้ → คืน reason='no_data'
 * (ไม่ 404 เพราะ badge อาจมีอยู่แต่ progress ไม่ถูก seed ให้ user)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getBadgeProgress, getBadgePaceEstimate } from '@/services/badge.service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ badgeId: string }> },
) {
  const session = await getServerSession(authOptions)
  // ทำไม cast as any: session.user.id ถูก inject ใน auth.ts callback แต่ NextAuth type ไม่รู้ — เหมือน pattern ใน verification/route.ts
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as { id: string }).id
  const { badgeId } = await params
  if (!badgeId || badgeId.length < 1) {
    return NextResponse.json({ error: 'Invalid badgeId' }, { status: 400 })
  }

  try {
    // หา BadgeProgress สำหรับ badge นี้โดยเฉพาะ
    const allProgress = await getBadgeProgress(userId, 'SELLER')
    const badgeProgress = allProgress.find((bp) => bp.badge.id === badgeId)

    if (!badgeProgress) {
      return NextResponse.json({
        estimateDays: null,
        ratePerDay: null,
        reason: 'no_data',
      })
    }

    const estimate = await getBadgePaceEstimate(userId, badgeProgress)
    return NextResponse.json(estimate)
  } catch (err) {
    console.error('[api/badges/estimate] error', badgeId, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
