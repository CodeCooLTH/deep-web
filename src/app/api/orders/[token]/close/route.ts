import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { CloseServiceJobSchema } from '@/lib/validations'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { forbiddenRoleResponse } from '@/lib/forbidden-role'
import { can } from '@/lib/shop-permissions'
import { appointmentErrorResponse } from '@/lib/appointment-api'
import { serviceJobErrorResponse } from '@/lib/service-job-api'
import { getOrderMoney, OrderPaymentError } from '@/services/order-payment.service'
import { closeServiceJob, reopenServiceJob } from '@/services/service-job.service'

/**
 * /api/orders/[token]/close — ร้านบริการ "ปิดงาน" / "เปิดงานอีกครั้ง" (feature 00073)
 *
 * POST   ปิดงาน: ผล (ให้บริการแล้ว/ไม่มาตามนัด) + เงินที่เหลือ + มัดจำ — กดครั้งเดียว
 *        O4 = ลงผลงาน (ด่านหลัก) · ส่งเงินมาด้วยต้องมี O5 · คืนมัดจำต้องมี O6
 *        (ช่าง = O4 ไม่มี O5 ⇒ ปิดได้แต่ส่งเงินไม่ได้ — 00071)
 * DELETE เปิดงานอีกครั้ง (มติ D2) — O6 (เจ้าของ/ผู้จัดการ) · ก่อนลูกค้ายืนยันเท่านั้น
 * GET    สถานะเงินของงานสำหรับชีตปิดงาน (บอร์ดคิว/แชทไม่ได้ถือยอดรับแล้ว/ค้างไว้) — O4
 *        เงินคืนเฉพาะผู้มี O5 · ผู้อื่นได้ money: null (ชีตซ่อนส่วนรับเงิน)
 *
 * `?shopId=` — กดจากกล่องแชทที่เปิดเธรดของอีกร้านได้ (เหมือน /appointment/outcome)
 */
export const dynamic = 'force-dynamic'

function shopIdFromQuery(request: NextRequest) {
  return request.nextUrl.searchParams.get('shopId')
}

function mapError(e: unknown): Response | null {
  const mapped = serviceJobErrorResponse(e) ?? appointmentErrorResponse(e)
  if (mapped) return mapped
  if (e instanceof OrderPaymentError) return jsonNoStore({ error: e.code }, { status: 400 })
  return null
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const gate = await requireShopCapability(await getServerSession(authOptions), 'O4', { shopId: shopIdFromQuery(request) })
  if (!gate.ok) return gate.response
  const ctx = gate

  const parsed = v.safeParse(CloseServiceJobSchema, await request.json().catch(() => null))
  if (!parsed.success) return jsonNoStore({ error: 'VALIDATION_ERROR' }, { status: 400 })
  const input = parsed.output

  // สิทธิ์ต่อส่วน — ตรวจที่ server ทุกครั้ง ไม่เชื่อว่า UI ซ่อนให้แล้ว
  if (input.payment && !can(ctx.roles, 'O5')) return forbiddenRoleResponse()
  if (input.outcome === 'NO_SHOW' && input.deposit === 'REFUND' && !can(ctx.roles, 'O6')) return forbiddenRoleResponse()

  try {
    const result = await closeServiceJob({
      shopId: ctx.shopId,
      orderToken: token,
      actorUserId: ctx.userId,
      outcome: input.outcome,
      payment: input.payment
        ? {
            amount: input.payment.amount,
            method: input.payment.method,
            slipFileId: input.payment.slipFileId ?? null,
            note: input.payment.note ?? null,
          }
        : null,
      deposit: input.deposit,
    })
    // ช่างไม่เห็นเงิน — คืนเฉพาะสถานะ (00071: เงินเต็มเป็นของ O5 ขึ้นไป)
    return jsonNoStore({
      serviceClosedAt: result.serviceClosedAt,
      appointmentStatus: result.appointmentStatus,
      ...(can(ctx.roles, 'O5') ? { money: result.money } : {}),
    })
  } catch (e) {
    const mapped = mapError(e)
    if (mapped) return mapped
    console.error('[POST /api/orders/[token]/close] shopId:', ctx.shopId, e instanceof Error ? e.message : e)
    return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const gate = await requireShopCapability(await getServerSession(authOptions), 'O6', { shopId: shopIdFromQuery(request) })
  if (!gate.ok) return gate.response
  const ctx = gate

  try {
    return jsonNoStore(await reopenServiceJob({ shopId: ctx.shopId, orderToken: token, actorUserId: ctx.userId }))
  } catch (e) {
    const mapped = mapError(e)
    if (mapped) return mapped
    console.error('[DELETE /api/orders/[token]/close] shopId:', ctx.shopId, e instanceof Error ? e.message : e)
    return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const gate = await requireShopCapability(await getServerSession(authOptions), 'O4', { shopId: shopIdFromQuery(request) })
  if (!gate.ok) return gate.response
  const ctx = gate
  if (!can(ctx.roles, 'O5')) return jsonNoStore({ money: null })
  try {
    return jsonNoStore({ money: await getOrderMoney({ shopId: ctx.shopId, orderToken: token }) })
  } catch (e) {
    if (e instanceof OrderPaymentError) return jsonNoStore({ error: 'SERVICE_JOB_NOT_FOUND' }, { status: 404 })
    console.error('[GET /api/orders/[token]/close] shopId:', ctx.shopId, e instanceof Error ? e.message : e)
    return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
