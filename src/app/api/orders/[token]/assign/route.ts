import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { AssignServiceJobSchema } from '@/lib/validations'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { appointmentErrorResponse } from '@/lib/appointment-api'
import { serviceJobErrorResponse } from '@/lib/service-job-api'
import { assignServiceJob, unassignServiceJob } from '@/services/service-job.service'

/**
 * /api/orders/[token]/assign — ผู้รับผิดชอบงานบริการ (feature 00086 API §4.7 · FR-007/008)
 *
 * POST   `{ userId }` มอบ/เปลี่ยนผู้รับผิดชอบ → `{ assignedUserId, assigneeName }` (ต้องเป็นสมาชิกฝ่ายช่าง)
 * DELETE ยกเลิกผู้รับผิดชอบ → `{ assignedUserId: null }`
 *
 * O2s (เจ้าของ ผู้จัดการ ตอบแชท เปิดบิล · SDS TD-009) — ช่างล้วนไม่มี O2s ⇒ 403 (ช่างใช้ /assign/claim รับเอง)
 * ร้านไม่ใช่บริการ → 403 FEATURE_NOT_AVAILABLE (service assert) · `?shopId=` แบบเดียวกับ /start
 */
export const dynamic = 'force-dynamic'

function mapError(route: string, shopId: string, e: unknown): Response {
  const mapped = serviceJobErrorResponse(e) ?? appointmentErrorResponse(e)
  if (mapped) return mapped
  console.error(`[${route} /api/orders/[token]/assign] shopId:`, shopId, e instanceof Error ? e.message : e)
  return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const gate = await requireShopCapability(await getServerSession(authOptions), 'O2s', {
    shopId: request.nextUrl.searchParams.get('shopId'),
  })
  if (!gate.ok) return gate.response
  const ctx = gate

  const parsed = v.safeParse(AssignServiceJobSchema, await request.json().catch(() => null))
  if (!parsed.success) return jsonNoStore({ error: 'VALIDATION_ERROR' }, { status: 400 })

  try {
    const r = await assignServiceJob({ shopId: ctx.shopId, orderToken: token, actorUserId: ctx.userId, userId: parsed.output.userId })
    return jsonNoStore({ assignedUserId: r.assignedUserId, assigneeName: r.assigneeName })
  } catch (e) {
    return mapError('POST', ctx.shopId, e)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const gate = await requireShopCapability(await getServerSession(authOptions), 'O2s', {
    shopId: request.nextUrl.searchParams.get('shopId'),
  })
  if (!gate.ok) return gate.response
  const ctx = gate

  try {
    const r = await unassignServiceJob({ shopId: ctx.shopId, orderToken: token, actorUserId: ctx.userId })
    return jsonNoStore({ assignedUserId: r.assignedUserId })
  } catch (e) {
    return mapError('DELETE', ctx.shopId, e)
  }
}
