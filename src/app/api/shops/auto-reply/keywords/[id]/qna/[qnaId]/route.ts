import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import {
  requireShopContext,
  forbidIfReadOnly,
  mapServiceError,
  AUTO_REPLY_NO_STORE,
} from '@/lib/auto-reply-route-context'
import { updateQna, deleteQna } from '@/services/auto-reply-qna.service'
import { AutoReplyQnaUpdateSchema } from '@/lib/validations'

/**
 * PATCH/DELETE ข้อในคลังรายตัว (API.md §4.32-§4.33 · phase `00023-qna`)
 *
 * NOTE: `id` (keywordId) อยู่ใน path เพื่อความสม่ำเสมอของ URL และเพื่อให้ UI สร้างลิงก์ได้ตรง
 * แต่ตัวตัดสิน ownership จริงคือ `qnaId` + `shopId` ใน WHERE ของ service — ส่ง keywordId ผิด
 * จะไม่ทำให้แก้ข้อของร้านอื่นได้ (ยิงข้ามร้าน = AUTO_REPLY_QNA_NOT_FOUND -> 404)
 */
export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; qnaId: string }> },
) {
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; qnaId: string }> },
) {
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
