import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import {
  requireShopContext, forbidIfReadOnly, mapServiceError, AUTO_REPLY_NO_STORE,
} from '@/lib/auto-reply-route-context'
import { updateGuardrail, deleteGuardrail } from '@/services/auto-reply-guardrail.service'
import { AutoReplyGuardrailUpdateSchema } from '@/lib/validations'

/** PATCH/DELETE กฎระดับร้านรายข้อ — ownership scope ด้วย shopId ใน service เหมือนของรายกลุ่ม */
export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ guardrailId: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { guardrailId } = await params
  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyGuardrailUpdateSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  try {
    await updateGuardrail(guardrailId, ctx.shopId, parsed.output)
    return NextResponse.json({ ok: true }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'บันทึกไม่สำเร็จ')
  }
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ guardrailId: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { guardrailId } = await params
  try {
    await deleteGuardrail(guardrailId, ctx.shopId)
    return NextResponse.json({ ok: true }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'ลบไม่สำเร็จ')
  }
}
