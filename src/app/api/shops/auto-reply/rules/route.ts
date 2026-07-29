import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, forbidIfReadOnly, mapServiceError, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { listRules, createRule } from '@/services/auto-reply-rule.service'
import { AutoReplyRuleCreateSchema } from '@/lib/validations'

/** GET/POST กฎคำตอบทุกระดับ (API.md §4.10-4.11) — specificity คำนวณที่ service ห้ามรับจาก client */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const sp = request.nextUrl.searchParams
  const items = await listRules(ctx.shopId, {
    keywordId: sp.get('keywordId') ?? undefined,
    shopChannelId: sp.get('shopChannelId') ?? undefined,
    productId: sp.get('productId') ?? undefined,
  })
  return NextResponse.json({ items, canEdit: ctx.canEdit }, { headers: AUTO_REPLY_NO_STORE })
}

export async function POST(request: NextRequest) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyRuleCreateSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const o = parsed.output
  try {
    const rule = await createRule(ctx.shopId, ctx.userId, {
      keywordId: o.keywordId,
      shopChannelId: o.shopChannelId,
      adId: o.adId,
      adLabel: o.adLabel,
      productId: o.productId,
      replyText: o.replyText,
      isActive: o.isActive ?? true,
      activeFrom: o.activeFrom ? new Date(o.activeFrom) : null,
      activeUntil: o.activeUntil ? new Date(o.activeUntil) : null,
    })
    return NextResponse.json(rule, { status: 201, headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'สร้างกฎไม่สำเร็จ')
  }
}
