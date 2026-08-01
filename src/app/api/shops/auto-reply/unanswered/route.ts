import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, mapServiceError, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { listUnanswered } from '@/services/auto-reply-unanswered.service'
import { AutoReplyUnansweredListQuerySchema } from '@/lib/validations'
import type { UnansweredStatus } from '@/lib/auto-reply-constants'

/**
 * GET คิวคำถามที่ DeepBot ตอบไม่ได้ (API.md §4.37 · phase `00023-qna`)
 *
 * NOTE: ไม่มี `forbidIfReadOnly` — เป็นการอ่านล้วน ทุกคนที่เข้าถึงร้านได้ควรเห็นว่าบอทพลาดตรงไหน
 * `pendingCount` คืนมาเสมอไม่ว่าจะกรองแท็บไหนอยู่ เพราะหัวการ์ดต้องบอกจำนวนงานค้างจริง
 * ไม่ใช่จำนวนของผลกรอง (ตรงกับพฤติกรรม `stats` ของคลังคำถาม)
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error

  const url = new URL(request.url)
  const takeRaw = url.searchParams.get('take')
  const parsed = v.safeParse(AutoReplyUnansweredListQuerySchema, {
    status: url.searchParams.get('status') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    take: takeRaw === null ? undefined : Number(takeRaw),
  })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  try {
    const result = await listUnanswered(ctx.shopId, {
      status: parsed.output.status as UnansweredStatus | undefined,
      search: parsed.output.search,
      take: parsed.output.take,
    })
    return NextResponse.json({ ...result, canEdit: ctx.canEdit }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'โหลดคิวคำถามไม่สำเร็จ')
  }
}
