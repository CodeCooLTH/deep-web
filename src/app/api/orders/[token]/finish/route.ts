import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { appointmentErrorResponse } from '@/lib/appointment-api'
import { parseServiceJobStepBody, serviceJobErrorResponse } from '@/lib/service-job-api'
import { finishServiceJob } from '@/services/service-job.service'

/**
 * POST /api/orders/[token]/finish — ร้านบริการ "ทำเสร็จแล้ว" (feature 00086 API §4.6 · FR-010)
 * O4 (ตัวเดียวกับเริ่มงาน) · body เหมือน /start · ไม่แตะเงิน/สถานะใบ/วันปิดงาน ⇒ ไม่คืนข้อมูลเงิน
 * กดซ้ำคืนเวลาเดิม `alreadyFinished: true` · `?shopId=` แบบเดียวกับ /start
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const gate = await requireShopCapability(await getServerSession(authOptions), 'O4', {
    shopId: request.nextUrl.searchParams.get('shopId'),
  })
  if (!gate.ok) return gate.response
  const ctx = gate

  const body = await parseServiceJobStepBody(request)
  if (!body.ok) return body.response

  try {
    const r = await finishServiceJob({
      shopId: ctx.shopId,
      orderToken: token,
      actorUserId: ctx.userId,
      actorRoles: ctx.roles,
      photoFileIds: body.value.photoFileIds,
      note: body.value.note,
    })
    return jsonNoStore({ serviceFinishedAt: r.serviceFinishedAt, alreadyFinished: r.alreadyFinished })
  } catch (e) {
    const mapped = serviceJobErrorResponse(e) ?? appointmentErrorResponse(e)
    if (mapped) return mapped
    console.error('[POST /api/orders/[token]/finish] shopId:', ctx.shopId, e instanceof Error ? e.message : e)
    return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
