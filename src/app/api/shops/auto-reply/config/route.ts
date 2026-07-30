import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, forbidIfReadOnly, mapServiceError, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { getConfig, upsertConfig } from '@/services/auto-reply-config.service'
import { AutoReplyConfigPatchSchema } from '@/lib/validations'

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
  const parsed = v.safeParse(AutoReplyConfigPatchSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  try {
    // merge กับค่าปัจจุบัน — upsertConfig เป็น full replace (TFR-001) แต่ client ส่ง partial ได้
    // ถ้าไม่ merge การกดสวิตช์ตัวเดียวจะล้างค่า cooldown/handoffPhrases ที่ร้านตั้งไว้ทิ้งทั้งหมด
    const current = await getConfig(ctx.shopId)
    const config = await upsertConfig(ctx.shopId, ctx.userId, {
      isEnabled: parsed.output.isEnabled ?? current.isEnabled,
      humanTakeoverPauseMode: parsed.output.humanTakeoverPauseMode ?? (current.humanTakeoverPauseMode as never),
      keywordCooldownSec: parsed.output.keywordCooldownSec ?? current.keywordCooldownSec,
      maxRepliesPerConversation: parsed.output.maxRepliesPerConversation ?? current.maxRepliesPerConversation,
      adsContextMode: parsed.output.adsContextMode ?? (current.adsContextMode as never),
      adsContextHours: parsed.output.adsContextHours !== undefined ? parsed.output.adsContextHours : current.adsContextHours,
      handoffPhrases: parsed.output.handoffPhrases ?? current.handoffPhrases,
    })
    return NextResponse.json({ ...config, canEdit: true }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
  }
}
