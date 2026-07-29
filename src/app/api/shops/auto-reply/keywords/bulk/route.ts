import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, forbidIfReadOnly, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { updateKeyword } from '@/services/auto-reply-rule.service'
import { AutoReplyBulkSchema } from '@/lib/validations'

/**
 * POST เปิด/ปิดหลายกลุ่มพร้อมกัน (AC-001-08 / GAP-01)
 *
 * ไม่ใช้ updateMany ตรง ๆ เพราะการ "เปิด" มี invariant ต้องตรวจ (กลุ่มที่เปิดต้องมีคำตรวจจับ
 * และมีคำตอบอย่างน้อย 1 ระดับ — TFR-006) ซึ่ง updateMany ข้ามไป จึงวนเรียก updateKeyword
 * ที่ตรวจให้แล้ว และรายงานผลแยกรายตัวเพื่อให้ UI บอกได้ว่าตัวไหนเปิดไม่ได้เพราะอะไร
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyBulkSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const succeeded: string[] = []
  const failed: { id: string; reason: string }[] = []
  for (const id of parsed.output.keywordIds) {
    try {
      await updateKeyword(id, ctx.shopId, ctx.userId, { isActive: parsed.output.isActive })
      succeeded.push(id)
    } catch (e) {
      failed.push({ id, reason: e instanceof Error ? e.message : 'UNKNOWN' })
    }
  }
  return NextResponse.json({ succeeded, failed }, { headers: AUTO_REPLY_NO_STORE })
}
