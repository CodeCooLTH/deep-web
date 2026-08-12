import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { runLineChannelHealthCheck } from '@/services/line-channel-health.service'
import { LineChannelServiceError } from '@/services/shop-channel.service'
import { sessionUserId } from '@/lib/session-user'

/**
 * POST /api/channels/line/[channelId]/health — ปุ่ม "ทดสอบการเชื่อมต่อ" (ส่วนขยาย 00025 2026-08-12)
 *
 * เป็น POST ไม่ใช่ GET โดยตั้งใจ: มัน **มีผลข้างเคียงจริง** (สั่งให้ LINE ยิง test event เข้ามา
 * และเขียนผลอ่าน token ลงแถว) — GET ที่มีผลข้างเคียงจะถูก prefetch/cache ยิงเองโดยไม่มีใครกด
 *
 * ownership อยู่ใน WHERE ของ service (`{id, shopId, provider:'LINE'}`) ไม่ query แยกก่อน (กัน IDOR)
 */
export const dynamic = 'force-dynamic'
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' }

const ChannelIdParamSchema = v.pipe(v.string(), v.uuid())

export async function POST(request: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const session = await getServerSession(authOptions)
  // 🛑 ห้าม cast `session.user as { id: string }` แล้ว deref ตรง ๆ — "มี session" ไม่เท่ากับ
  // "รู้ว่าเป็นใคร" และ cast แบบนั้นทำให้ `undefined` ไหลเข้า WHERE ของ Prisma ได้เงียบ ๆ
  // (มีเทส [blocker] สแกน `src/app` ทั้งโฟลเดอร์กันไว้ — ผมเพิ่งโดนมันจับตอนเขียนไฟล์นี้)
  const userId = sessionUserId(session)
  if (!session?.user || !userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { channelId } = await params
  const parsedId = v.safeParse(ChannelIdParamSchema, channelId)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ไม่พบช่องทางนี้' }, { status: 404, headers: NO_STORE_HEADERS })
  }

  const activeCtx = await resolveActiveShopContext({
    user: {
      id: userId,
      activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null,
    },
  })
  if (!activeCtx) {
    return NextResponse.json({ error: 'ไม่พบร้านที่กำลังใช้งาน' }, { status: 404, headers: NO_STORE_HEADERS })
  }

  try {
    const report = await runLineChannelHealthCheck({
      channelId: parsedId.output,
      shopId: activeCtx.shopId,
      // ตัวแปรเดียวกับที่หน้าเชื่อมต่อแสดงให้ร้านคัดลอก — ห้ามแยกเป็นสองแหล่ง (HR16)
      webhookUrl: `${request.nextUrl.origin}/api/channels/line/webhook`,
    })
    return NextResponse.json(report, { headers: NO_STORE_HEADERS })
  } catch (e) {
    // ทุก error ใหม่ต้องมี route catch ครอบ ไม่งั้นกลายเป็น 500 ที่ผู้ใช้อ่านไม่รู้เรื่อง
    // (feedback_service_error_route_mapping)
    if (e instanceof LineChannelServiceError && e.code === 'CHANNEL_NOT_FOUND_OR_FORBIDDEN') {
      return NextResponse.json({ error: 'ไม่พบช่องทางนี้' }, { status: 404, headers: NO_STORE_HEADERS })
    }
    console.error('[POST /api/channels/line/[channelId]/health]', e instanceof Error ? e.message : e)
    return NextResponse.json(
      { error: 'ทดสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }
}
