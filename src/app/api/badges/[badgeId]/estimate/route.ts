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
import { getBadgeProgress, getBadgePaceEstimate, toBadgeScope } from '@/services/badge.service'
import { requireActiveShop } from '@/lib/shop-context'
import { sessionUserId } from '@/lib/session-user'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ badgeId: string }> },
) {
  const session = await getServerSession(authOptions)
  // ทำไม cast as any: session.user.id ถูก inject ใน auth.ts callback แต่ NextAuth type ไม่รู้ — เหมือน pattern ใน verification/route.ts
  const userId = sessionUserId(session)
  if (!session?.user || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { badgeId } = await params
  if (!badgeId || badgeId.length < 1) {
    return NextResponse.json({ error: 'Invalid badgeId' }, { status: 400 })
  }

  try {
    // 🛑 scope ด้วยร้านที่เปิดอยู่ ไม่ใช่ userId เปล่า ๆ — ต้องเป็นชุดเดียวกับหน้า /badges ที่เรียก
    // endpoint นี้ ไม่งั้น "อีกกี่วันจะได้" จะคำนวณจากออเดอร์ของร้านส่วนตัวคนละร้านกับที่แสดงอยู่
    const active = await requireActiveShop(session as { user?: { id?: string | null; activeShopId?: string | null } | null })
    const scope = toBadgeScope(active, userId)

    // หา BadgeProgress สำหรับ badge นี้โดยเฉพาะ
    const allProgress = await getBadgeProgress(scope.ownerUserId, 'SELLER', scope.shop)
    const badgeProgress = allProgress.find((bp) => bp.badge.id === badgeId)

    if (!badgeProgress) {
      return NextResponse.json({
        estimateDays: null,
        ratePerDay: null,
        reason: 'no_data',
      })
    }

    const estimate = await getBadgePaceEstimate(scope.ownerUserId, badgeProgress, scope.shop)
    return NextResponse.json(estimate)
  } catch (err) {
    console.error('[api/badges/estimate] error', badgeId, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
