import { NextRequest, NextResponse } from 'next/server'
import { requireShopContext, forbidIfReadOnly, mapServiceError, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { deletePhrase } from '@/services/auto-reply-rule.service'

/** DELETE คำตรวจจับ 1 คำ (API.md §4.9) */
export const dynamic = 'force-dynamic'

export async function DELETE(
  _r: NextRequest,
  { params }: { params: Promise<{ id: string; phraseId: string }> },
) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { id, phraseId } = await params
  try {
    await deletePhrase(phraseId, id, ctx.shopId)
    return NextResponse.json({ ok: true }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'ลบคำตรวจจับไม่สำเร็จ')
  }
}
