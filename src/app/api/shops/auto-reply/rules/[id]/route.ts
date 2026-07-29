import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, forbidIfReadOnly, mapServiceError, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { updateRule, deleteRule } from '@/services/auto-reply-rule.service'
import { AutoReplyRuleUpdateSchema } from '@/lib/validations'

/** PATCH/DELETE กฎรายตัว (API.md §4.12-4.13) */
export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { id } = await params

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyRuleUpdateSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const o = parsed.output
  try {
    const rule = await updateRule(id, ctx.shopId, ctx.userId, {
      shopChannelId: o.shopChannelId,
      adId: o.adId,
      adLabel: o.adLabel,
      productId: o.productId,
      replyText: o.replyText,
      isActive: o.isActive,
      activeFrom: o.activeFrom ? new Date(o.activeFrom) : null,
      activeUntil: o.activeUntil ? new Date(o.activeUntil) : null,
    })
    return NextResponse.json(rule, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'บันทึกไม่สำเร็จ')
  }
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { id } = await params
  try {
    await deleteRule(id, ctx.shopId)
    return NextResponse.json({ ok: true }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'ลบไม่สำเร็จ')
  }
}
