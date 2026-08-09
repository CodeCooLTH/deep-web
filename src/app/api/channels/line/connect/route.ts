import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { LineConnectSchema } from '@/lib/validations'
import { connectLineChannel, LineChannelServiceError } from '@/services/shop-channel.service'

/**
 * POST /api/channels/line/connect — เชื่อม LINE Official Account เข้าร้าน (feature 00025, S-5)
 *
 * ต่างจาก Facebook (OAuth ผ่าน `/api/channels/facebook/connect` → callback → confirm) ตรงที่ร้านวาง
 * Channel secret + Channel access token เอง (วิธี A ตาม scope baseline §1) — endpoint นี้จึงเป็นจุด
 * เดียวที่ verify+เขียนแถวเกิดขึ้น ไม่มีขั้นตอน OAuth คั่นกลาง
 *
 * ownership: resolveActiveShopContext (pattern เดียวกับ /api/channels/facebook/confirm) — ไม่ trust
 * session.user.activeShopId เปล่า ๆ, re-verify membership เสมอ
 */
export const dynamic = 'force-dynamic'
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' }

function webhookUrl(request: NextRequest): string {
  return `${request.nextUrl.origin}/api/channels/line/webhook`
}

/** map LineChannelServiceError → HTTP ตาม API.md §5 (feedback_service_error_route_mapping:
 *  ทุก error ใหม่ต้องมี route catch ครอบ ไม่งั้นกลายเป็น 500 ที่ผู้ใช้อ่านไม่รู้เรื่อง) */
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

export async function POST(request: NextRequest) {
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

  const parsed = v.safeParse(LineConnectSchema, await request.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.issues[0]
    // API.md §5: SECRET_FORMAT_INVALID เป็น code เดียวที่เอกสารตั้งชื่อไว้จากฝั่ง validate ก่อนยิง LINE
    // (ให้ client แยกกรณีนี้จาก "ข้อมูลไม่ถูกต้อง" ทั่วไปได้) — เดาจาก field แรกที่ validate ไม่ผ่าน
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

  try {
    const { channel, warnings } = await connectLineChannel({
      shopId: activeCtx.shopId,
      userId,
      channelSecret,
      channelAccessToken,
    })

    return NextResponse.json(
      { channel, warnings, webhookUrl: webhookUrl(request) },
      { status: 201, headers: NO_STORE_HEADERS },
    )
  } catch (e) {
    return mapLineChannelError(e, '[POST /api/channels/line/connect]')
  }
}
