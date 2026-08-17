/**
 * /api/orders/[token]/payments — บันทึก/อ่าน "เงินที่ได้รับจริง" ของออเดอร์ (feature 00050)
 *
 * POST = ร้านกดยืนยันว่ารับเงินก้อนหนึ่งแล้ว · GET = ประวัติการรับเงิน
 *
 * 🛑 ไม่มี PATCH โดยเจตนา — "จ่ายมาแล้ว แก้ไม่ได้" (หัวหน้า 2026-08-15)
 * กรอกผิดให้ยกเลิกที่ `DELETE /api/orders/[token]/payments/[paymentId]` แล้วบันทึกใหม่
 *
 * Base (โครง guard + valibot + error mapping):
 *   src/app/api/orders/[token]/appointment/outcome/route.ts
 */
import { NextRequest } from 'next/server'
import * as v from 'valibot'

import { requireShopMember, jsonNoStore } from '@/lib/shop-api-guard'
import {
  OrderPaymentError,
  listPayments,
  recordPayment,
} from '@/services/order-payment.service'

export const dynamic = 'force-dynamic'

/**
 * ร้านของคำขอนี้ — `?shopId=` จากกล่องแชท (ท่าเดียวกับ `/api/products`, `/api/chat/quick-messages`,
 * `/api/chat/ai-quota` ที่ถูกกดจากเธรดเดียวกัน — `sibling-surface-parity`)
 *
 * ไม่ส่งมา = ใช้ร้านที่ active ตามเดิม · ส่งมาแล้วไม่มีสิทธิ์ = 403 ไม่ถอยไปร้านอื่น
 */
function shopIdFromQuery(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('shopId')
}

const RecordPaymentSchema = v.object({
  kind: v.picklist(['DEPOSIT', 'BALANCE']),
  /**
   * ยอดเงิน — รับเป็น number และบังคับ > 0 ที่นี่ด้วย ทั้งที่ DB มี CHECK อยู่แล้ว
   * เพื่อให้ผู้ใช้ได้ 400 พร้อมเหตุผลอ่านออก แทน 500 จาก constraint violation
   * (ความถูกต้องจริงยังอยู่ที่ CHECK — ชั้นนี้คือการบอกเหตุผล ไม่ใช่ด่าน)
   */
  amount: v.pipe(v.number(), v.minValue(0.01), v.maxValue(99_999_999)),
  method: v.optional(v.picklist(['TRANSFER', 'CASH', 'OTHER']), 'TRANSFER'),
  slipFileId: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(200)))),
  note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(500)))),
})

function mapError(e: unknown) {
  if (e instanceof OrderPaymentError) {
    const status = e.code === 'ORDER_NOT_FOUND' || e.code === 'PAYMENT_NOT_FOUND' ? 404 : 400
    return jsonNoStore({ error: e.code }, { status })
  }
  return null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const ctx = await requireShopMember({ shopId: shopIdFromQuery(request) })
  if ('error' in ctx) return ctx.error

  const parsed = v.safeParse(RecordPaymentSchema, await request.json().catch(() => null))
  if (!parsed.success) return jsonNoStore({ error: 'VALIDATION_ERROR' }, { status: 400 })

  try {
    const result = await recordPayment({
      shopId: ctx.shopId,
      orderToken: token,
      receivedByUserId: ctx.userId,
      kind: parsed.output.kind,
      amount: parsed.output.amount,
      method: parsed.output.method,
      slipFileId: parsed.output.slipFileId ?? null,
      note: parsed.output.note ?? null,
    })
    return jsonNoStore(result)
  } catch (e) {
    const mapped = mapError(e)
    if (mapped) return mapped
    console.error('[POST /api/orders/[token]/payments] shopId:', ctx.shopId, e)
    return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const ctx = await requireShopMember({ shopId: shopIdFromQuery(request) })
  if ('error' in ctx) return ctx.error

  try {
    return jsonNoStore({ payments: await listPayments({ shopId: ctx.shopId, orderToken: token }) })
  } catch (e) {
    const mapped = mapError(e)
    if (mapped) return mapped
    console.error('[GET /api/orders/[token]/payments] shopId:', ctx.shopId, e)
    return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
