import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import {
  requireShopContext,
  forbidIfReadOnly,
  mapServiceError,
  AUTO_REPLY_NO_STORE,
} from '@/lib/auto-reply-route-context'
import { getChatbotConfig, updateChatbotConfig } from '@/services/ai-chatbot-config.service'
import { ensureShopDefaultGuardrails } from '@/services/auto-reply-guardrail.service'
import { AiChatbotConfigPatchSchema } from '@/lib/validations'

/** GET/PATCH ตั้งค่า ChatBot ระดับร้าน (phase `00023-ai-enhance`) */
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const config = await getChatbotConfig(ctx.shopId)
  return NextResponse.json({ ...config, canEdit: ctx.canEdit }, { headers: AUTO_REPLY_NO_STORE })
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireShopContext()
  if ('error' in ctx) return ctx.error
  const denied = forbidIfReadOnly(ctx)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const parsed = v.safeParse(AiChatbotConfigPatchSchema, body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  try {
    // ส่งเฉพาะฟิลด์ที่ client ส่งมาจริง — service เขียนเฉพาะที่ไม่ undefined
    const config = await updateChatbotConfig(ctx.shopId, parsed.output)

    // เปิด ChatBot ครั้งแรก -> ใส่ชุดกฎเริ่มต้นระดับร้านให้ (เงื่อนไขเดียวกับรายกลุ่มคำ:
    // คัดลอกเฉพาะตอนยังไม่มีกฎสักข้อ ร้านที่ลบทิ้งแล้วปิด-เปิดใหม่จะไม่ได้ของเก่ากลับมา)
    if (parsed.output.aiChatbotEnabled === true || (parsed.output.aiChatbotStatus && parsed.output.aiChatbotStatus !== 'OFFLINE')) {
      await ensureShopDefaultGuardrails(ctx.shopId, ctx.userId)
    }
    return NextResponse.json(config, { headers: AUTO_REPLY_NO_STORE })
  } catch (e) {
    return mapServiceError(e, 'บันทึกไม่สำเร็จ')
  }
}
