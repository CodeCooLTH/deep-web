import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { appointmentErrorResponse } from '@/lib/appointment-api'
import { serviceJobErrorResponse } from '@/lib/service-job-api'
import { startServiceJob } from '@/services/service-job.service'

/**
 * POST /api/orders/[token]/start — ร้านบริการ "เริ่มงาน" (feature 00078 FR-CS-26)
 * O4 (ช่างเรียกได้) · ไม่แตะสถานะ/เงิน จึงไม่คืนข้อมูลเงิน · `?shopId=` สำหรับกล่องแชทข้ามร้าน
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const gate = await requireShopCapability(await getServerSession(authOptions), 'O4', {
    shopId: request.nextUrl.searchParams.get('shopId'),
  })
  if (!gate.ok) return gate.response
  const ctx = gate

  try {
    const r = await startServiceJob({ shopId: ctx.shopId, orderToken: token, actorUserId: ctx.userId })
    return jsonNoStore({ serviceStartedAt: r.serviceStartedAt, alreadyStarted: r.alreadyStarted })
  } catch (e) {
    const mapped = serviceJobErrorResponse(e) ?? appointmentErrorResponse(e)
    if (mapped) return mapped
    console.error('[POST /api/orders/[token]/start] shopId:', ctx.shopId, e instanceof Error ? e.message : e)
    return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
