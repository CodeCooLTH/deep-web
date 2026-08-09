import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { LinePatchSchema } from '@/lib/validations'
import { updateLineChannelCredentials, LineChannelServiceError } from '@/services/shop-channel.service'

/**
 * PATCH /api/channels/line/[channelId] — อัปเดต credential ของ LINE OA ที่เชื่อมไว้แล้ว (feature 00025, S-5)
 *
 * ใช้กู้คืนจาก TOKEN_INVALID (วาง token ใหม่หลัง revoke/regenerate) หรือหมุน channel secret —
 * 🛑 ไม่มีสวิตช์เปิด/ปิดตอบอัตโนมัติที่ endpoint นี้ (BR-LINE-17 — ใช้ endpoint ของ 00023 เท่านั้น)
 */
export const dynamic = 'force-dynamic'
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' }

// path param channelId ต้องเป็น uuid — pattern เดียวกับ /api/channels/[id]/route.ts (DELETE เดิม)
const ChannelIdParamSchema = v.pipe(v.string(), v.uuid())

/** map LineChannelServiceError → HTTP ตาม API.md §5 (feedback_service_error_route_mapping) */
function mapLineChannelError(e: unknown, logTag: string): NextResponse {
  if (e instanceof LineChannelServiceError) {
    switch (e.code) {
      case 'TOKEN_INVALID':
        return NextResponse.json(
          { error: 'ไม่สามารถใช้ Channel access token นี้ได้ กรุณาตรวจสอบว่าคัดลอกครบถ้วน', code: 'TOKEN_INVALID' },
          { status: 400, headers: NO_STORE_HEADERS },
        )
      case 'LINE_UNAVAILABLE':
        return NextResponse.json(
          { error: 'ระบบ LINE ไม่ตอบสนองชั่วคราว กรุณาลองใหม่อีกครั้ง', code: 'LINE_UNAVAILABLE' },
          { status: 502, headers: NO_STORE_HEADERS },
        )
      case 'CHANNEL_TAKEN': {
        const shopName = e.shopName ?? 'ร้านอื่น'
        return NextResponse.json(
          {
            error: `บัญชี LINE นี้เชื่อมอยู่กับร้าน "${shopName}" แล้ว ต้องถอดจากร้านนั้นก่อน`,
            code: 'CHANNEL_TAKEN',
          },
          { status: 409, headers: NO_STORE_HEADERS },
        )
      }
      case 'LINE_ACCOUNT_MISMATCH':
        return NextResponse.json(
          { error: 'key ที่วางเป็นของบัญชี LINE คนละบัญชีกับที่เชื่อมไว้', code: 'LINE_ACCOUNT_MISMATCH' },
          { status: 409, headers: NO_STORE_HEADERS },
        )
      case 'CHANNEL_NOT_FOUND_OR_FORBIDDEN':
        return NextResponse.json({ error: 'ไม่พบช่องทางนี้' }, { status: 404, headers: NO_STORE_HEADERS })
    }
  }
  console.error(logTag, e instanceof Error ? e.message : e)
  return NextResponse.json(
    { error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' },
    { status: 500, headers: NO_STORE_HEADERS },
  )
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = (session.user as { id: string }).id

  const activeCtx = await resolveActiveShopContext({
    user: {
      id: userId,
      activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null,
    },
  })
  if (!activeCtx) {
    return NextResponse.json({ error: 'ไม่พบร้านที่กำลังใช้งาน' }, { status: 404 })
  }

  const { channelId: rawChannelId } = await params
  const idCheck = v.safeParse(ChannelIdParamSchema, rawChannelId)
  if (!idCheck.success) {
    return NextResponse.json({ error: 'รหัสช่องทางไม่ถูกต้อง' }, { status: 400 })
  }

  const parsed = v.safeParse(LinePatchSchema, await request.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.issues[0]
    const field = (issue?.path?.[0] as { key?: unknown } | undefined)?.key
    return NextResponse.json(
      {
        error: issue?.message ?? 'ข้อมูลไม่ถูกต้อง',
        ...(field === 'channelSecret' ? { code: 'SECRET_FORMAT_INVALID' } : {}),
      },
      { status: 400 },
    )
  }
  const { channelSecret, channelAccessToken } = parsed.output
  if (!channelSecret && !channelAccessToken) {
    return NextResponse.json({ error: 'ไม่มีข้อมูลให้แก้ไข' }, { status: 400 })
  }

  try {
    const { channel, warnings } = await updateLineChannelCredentials({
      channelId: idCheck.output,
      shopId: activeCtx.shopId,
      channelSecret,
      channelAccessToken,
    })
    return NextResponse.json({ channel, warnings }, { status: 200, headers: NO_STORE_HEADERS })
  } catch (e) {
    return mapLineChannelError(e, '[PATCH /api/channels/line/[channelId]]')
  }
}
