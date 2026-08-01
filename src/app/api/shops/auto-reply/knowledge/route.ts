import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import {
  requireShopContext, forbidIfReadOnly, mapServiceError, AUTO_REPLY_NO_STORE,
} from '@/lib/auto-reply-route-context'
import { listShopQna, createShopQna } from '@/services/auto-reply-qna.service'
import { AutoReplyQnaCreateSchema } from '@/lib/validations'

/** GET/POST คลังความรู้ระดับร้าน — ใช้โดย ChatBot (phase `00023-ai-enhance`) */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const search = new URL(request.url).searchParams.get('search') ?? undefined
  try {
    const result = await listShopQna(ctx.shopId, { search })
    return NextResponse.json({ ...result, canEdit: ctx.canEdit }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'โหลดคลังความรู้ไม่สำเร็จ')
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyQnaCreateSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  try {
    const created = await createShopQna(ctx.shopId, parsed.output, ctx.userId)
    return NextResponse.json(created, { status: 201, headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'เพิ่มไม่สำเร็จ')
  }
}
