import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { requireShopContext, forbidIfReadOnly, mapServiceError, AUTO_REPLY_NO_STORE } from '@/lib/auto-reply-route-context'
import { setTestMode } from '@/services/auto-reply-config.service'
import { AutoReplyTestModeSchema } from '@/lib/validations'

/**
 * PUT /api/shops/auto-reply/test-mode — เปิด/ปิดโหมดทดสอบระดับร้าน (AC-021-01)
 *
 * เปิดโหมดนี้ = auto-reply ตอบ "เฉพาะเธรดใน allowlist" เท่านั้น ลูกค้าจริงคนอื่นเงียบสนิท
 * ควรตั้ง expiresInHours เสมอ (AC-021-08) เพราะร้านลืมปิดคือความเสี่ยงที่ PRD §6.1 ระบุไว้:
 * ร้านเข้าใจว่าระบบทำงานอยู่ แต่จริง ๆ ตอบแค่เธรดทดสอบ ลูกค้าจริงไม่ได้รับคำตอบและร้านไม่รู้ตัว
 */
export const dynamic = 'force-dynamic'

export async function PUT(request: NextRequest) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AutoReplyTestModeSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { testMode, expiresInHours } = parsed.output
  const expiresAt =
    testMode && expiresInHours ? new Date(Date.now() + expiresInHours * 3600_000) : null
  try {
    const config = await setTestMode(ctx.shopId, ctx.userId, {
      testMode,
      testModeExpiresAt: expiresAt,
    })
    return NextResponse.json(config, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'เปลี่ยนโหมดทดสอบไม่สำเร็จ')
  }
}
