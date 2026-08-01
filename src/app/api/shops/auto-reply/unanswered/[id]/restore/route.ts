import { NextRequest, NextResponse } from 'next/server'
import {
  requireShopContext,
  forbidIfReadOnly,
  mapServiceError,
  AUTO_REPLY_NO_STORE,
} from '@/lib/auto-reply-route-context'
import { restoreUnanswered } from '@/services/auto-reply-unanswered.service'

/**
 * POST ยกเลิกการข้าม — ย้ายกลับไปแท็บ "รอกรอก" (API.md §4.39 · phase `00023-qna`)
 *
 * NOTE: undo ตัวนี้คือเหตุผลที่ dismiss ไม่ลบแถวทิ้ง (user ตัดสิน 2026-08-01 ข้อ 1)
 * service กรอง `status: 'DISMISSED'` ใน WHERE — เรียกกับแถวที่ไม่ได้ถูกข้ามไว้จะได้ 404
 * ไม่ใช่ 200 เงียบ ๆ เพื่อให้ UI ที่ยิงผิดสถานะรู้ตัว
 */
export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { id } = await params

  try {
    await restoreUnanswered(id, ctx.shopId)
    return NextResponse.json({ ok: true }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'ย้ายกลับไม่สำเร็จ')
  }
}
