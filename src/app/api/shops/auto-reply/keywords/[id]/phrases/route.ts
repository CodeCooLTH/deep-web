import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, forbidIfReadOnly, mapServiceError, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { addPhrases } from '@/services/auto-reply-rule.service'
import { AutoReplyPhrasesSchema } from '@/lib/validations'

/** POST คำตรวจจับเข้ากลุ่ม (API.md §4.8) — คืน warning เมื่อซ้ำข้ามกลุ่ม (AC-002-04) */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { id } = await params

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyPhrasesSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  try {
    const result = await addPhrases(id, ctx.shopId, parsed.output.phrases)
    return NextResponse.json(result, { status: 201, headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'เพิ่มคำตรวจจับไม่สำเร็จ')
  }
}
