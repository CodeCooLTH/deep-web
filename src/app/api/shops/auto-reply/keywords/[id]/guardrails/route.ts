import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import {
  requireShopContext,
  forbidIfReadOnly,
  mapServiceError,
  AUTO_REPLY_NO_STORE,
} from '@/lib/auto-reply-route-context'
import { listGuardrails, createGuardrail } from '@/services/auto-reply-guardrail.service'
import { AutoReplyGuardrailCreateSchema } from '@/lib/validations'

/** GET/POST กฎห้ามตอบของกลุ่มคำ (phase `00023-ai-enhance`) */
export const dynamic = 'force-dynamic'

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const { id } = await params
  try {
    const items = await listGuardrails(id, ctx.shopId)
    return NextResponse.json({ items, canEdit: ctx.canEdit }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'โหลดกฎห้ามตอบไม่สำเร็จ')
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { id } = await params

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyGuardrailCreateSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  try {
    const created = await createGuardrail(id, ctx.shopId, parsed.output, ctx.userId)
    return NextResponse.json(created, { status: 201, headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'เพิ่มกฎไม่สำเร็จ')
  }
}
