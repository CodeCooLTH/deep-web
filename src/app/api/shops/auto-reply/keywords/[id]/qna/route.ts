import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import {
  requireShopContext,
  forbidIfReadOnly,
  mapServiceError,
  AUTO_REPLY_NO_STORE,
} from '@/lib/auto-reply-route-context'
import { listQna, createQna, type QnaListFilter } from '@/services/auto-reply-qna.service'
import { AutoReplyQnaCreateSchema, AutoReplyQnaListQuerySchema } from '@/lib/validations'

/**
 * GET/POST คลังคำถาม-คำตอบของกลุ่มคำ (API.md §4.30-§4.31 · phase `00023-qna`)
 *
 * WARNING: `keywordId` มาจาก path แต่ **ownership ตรวจที่ service ด้วย `shopId` ใน WHERE**
 * (`assertKeywordOwned`) ไม่ใช่ตรวจที่นี่แล้วค่อยส่งต่อ — กันข้ามร้านตั้งแต่ชั้น query
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const { id } = await params

  const url = new URL(request.url)
  const parsed = v.safeParse(AutoReplyQnaListQuerySchema, {
    filter: url.searchParams.get('filter') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  try {
    const result = await listQna(id, ctx.shopId, {
      filter: parsed.output.filter as QnaListFilter | undefined,
      search: parsed.output.search,
    })
    return NextResponse.json({ ...result, canEdit: ctx.canEdit }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'โหลดคลังคำถามไม่สำเร็จ')
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { id } = await params

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyQnaCreateSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  try {
    const created = await createQna(
      id,
      ctx.shopId,
      {
        question: parsed.output.question,
        answer: parsed.output.answer,
        imageFileIds: parsed.output.imageFileIds,
        source: 'MANUAL',
      },
      ctx.userId,
    )
    return NextResponse.json(created, { status: 201, headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'เพิ่มคำถามไม่สำเร็จ')
  }
}
