import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, forbidIfReadOnly, mapServiceError, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { getKeywordDetail, updateKeyword, deleteKeyword } from '@/services/auto-reply-rule.service'
import { ensureDefaultGuardrails } from '@/services/auto-reply-guardrail.service'
import { AutoReplyKeywordUpdateSchema } from '@/lib/validations'

/** GET/PATCH/DELETE กลุ่มคำรายตัว (API.md §4.5-4.7) */
export const dynamic = 'force-dynamic'

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const { id } = await params
  // shopId อยู่ใน where ของ service ไม่ใช่เช็คทีหลัง — กันข้ามร้านตั้งแต่ชั้น query
  const keyword = await getKeywordDetail(id, ctx.shopId)
  if (!keyword) return NextResponse.json({ error: 'ไม่พบกลุ่มคำนี้' }, { status: 404 })
  return NextResponse.json({ ...keyword, canEdit: ctx.canEdit }, { headers: AUTO_REPLY_NO_STORE })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { id } = await params

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyKeywordUpdateSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  try {
    const keyword = await updateKeyword(id, ctx.shopId, ctx.userId, parsed.output)

    // เปิด AI Enhance ครั้งแรก -> คัดลอกชุดกฎห้ามตอบเริ่มต้นให้ (AC-027-01)
    //
    // WARNING: ตัวมันเองไม่ throw และคัดลอกเฉพาะตอนกลุ่มยังไม่มีกฎสักข้อ — ร้านที่ลบกฎทิ้ง
    // แล้วปิด-เปิดสวิตช์ใหม่จะ **ไม่** ได้ของที่ลบไปแล้วกลับมา (AC-027-04)
    if (parsed.output.aiEnhanceEnabled === true) {
      await ensureDefaultGuardrails(id, ctx.shopId, ctx.userId)
    }

    return NextResponse.json(keyword, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'บันทึกไม่สำเร็จ')
  }
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied
  const { id } = await params
  try {
    await deleteKeyword(id, ctx.shopId)
    return NextResponse.json({ ok: true }, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'ลบไม่สำเร็จ')
  }
}
