import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import {
  requireShopContext, forbidIfReadOnly, mapServiceError, AUTO_REPLY_NO_STORE,
} from '@/lib/auto-reply-route-context'
import { updateQna, deleteQna } from '@/services/auto-reply-qna.service'
import { AutoReplyQnaUpdateSchema } from '@/lib/validations'

/** PATCH/DELETE ข้อในคลังความรู้ — ownership อยู่ที่ shopId ใน WHERE ของ service */
export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ qnaId: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { qnaId } = await params
  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyQnaUpdateSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  try {
    await updateQna(qnaId, ctx.shopId, parsed.output, ctx.userId)
    return NextResponse.json({ ok: true }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'บันทึกไม่สำเร็จ')
  }
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ qnaId: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { qnaId } = await params
  try {
    await deleteQna(qnaId, ctx.shopId)
    return NextResponse.json({ ok: true }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'ลบไม่สำเร็จ')
  }
}
