import { NextRequest, NextResponse } from 'next/server'
import { requireShopContext, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { searchLogs } from '@/services/auto-reply-log.service'
import type { AutoReplyLogDecision, ResolutionLevel, SkipReason } from '@/lib/auto-reply-constants'

/** GET /api/shops/auto-reply/logs — ค้นบันทึก (AC-024-03) PII ถูกตัดที่ service แล้ว */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const sp = request.nextUrl.searchParams

  const result = await searchLogs(ctx.shopId, {
    conversationId: sp.get('conversationId') ?? undefined,
    externalContactId: sp.get('externalContactId') ?? undefined,
    shopChannelId: sp.get('shopChannelId') ?? undefined,
    adId: sp.get('adId') ?? undefined,
    productId: sp.get('productId') ?? undefined,
    keywordId: sp.get('keywordId') ?? undefined,
    decision: (sp.get('decision') as AutoReplyLogDecision) ?? undefined,
    skipReason: (sp.get('skipReason') as SkipReason) ?? undefined,
    resolutionLevel: (sp.get('resolutionLevel') as ResolutionLevel) ?? undefined,
    isTest: sp.has('isTest') ? sp.get('isTest') === 'true' : undefined,
    hasError: sp.has('hasError') ? sp.get('hasError') === 'true' : undefined,
    from: sp.get('from') ? new Date(sp.get('from')!) : undefined,
    to: sp.get('to') ? new Date(sp.get('to')!) : undefined,
    page: sp.get('page') ? Number(sp.get('page')) : undefined,
    pageSize: sp.get('pageSize') ? Number(sp.get('pageSize')) : undefined,
  })

  return NextResponse.json(result, { headers: AUTO_REPLY_NO_STORE })
}
