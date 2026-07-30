import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, forbidIfReadOnly, mapServiceError, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { listKeywords, createKeyword } from '@/services/auto-reply-rule.service'
import { AutoReplyKeywordCreateSchema } from '@/lib/validations'

/** GET/POST /api/shops/auto-reply/keywords — รายการ/สร้างกลุ่มคำ (API.md §4.3-4.4) */
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const items = await listKeywords(ctx.shopId)
  return NextResponse.json({ items, canEdit: ctx.canEdit }, { headers: AUTO_REPLY_NO_STORE })
}

export async function POST(request: NextRequest) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyKeywordCreateSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  try {
    const keyword = await createKeyword(ctx.shopId, ctx.userId, parsed.output)
    return NextResponse.json(keyword, { status: 201, headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'สร้างกลุ่มคำไม่สำเร็จ')
  }
}
