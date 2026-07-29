import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, forbidIfReadOnly, mapServiceError, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { getConfig, upsertConfig } from '@/services/auto-reply-config.service'
import { AutoReplyConfigSchema } from '@/lib/validations'

/** GET/PATCH /api/shops/auto-reply/config — การตั้งค่าระดับร้าน (feature 00023 API.md §4.1-4.2) */
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const config = await getConfig(ctx.shopId)
  // canEdit ส่งไปให้ UI ตัดสินโหมดอ่านอย่างเดียว — ฝั่งเขียนตรวจ role ซ้ำเสมอ ไม่เชื่อค่านี้กลับมา
  return NextResponse.json({ ...config, canEdit: ctx.canEdit }, { headers: AUTO_REPLY_NO_STORE })
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  if (body === null) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const parsed = v.safeParse(AutoReplyConfigSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  try {
    const config = await upsertConfig(ctx.shopId, ctx.userId, parsed.output)
    return NextResponse.json({ ...config, canEdit: true }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
  }
}
