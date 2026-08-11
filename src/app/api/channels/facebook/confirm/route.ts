import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { listManageablePages } from '@/lib/facebook/graph'
import { OAUTH_USER_TOKEN_COOKIE, readPendingUserToken } from '@/lib/facebook/pending-connect'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { ConfirmChannelPagesSchema } from '@/lib/validations'
import { connectPages } from '@/services/shop-channel.service'
import { sessionUserId } from '@/lib/session-user'

/**
 * POST /api/channels/facebook/confirm — เชื่อมเฉพาะเพจที่ user ติ๊กเลือก (feature 00018)
 *
 * นี่คือจุดที่ "การเชื่อมจริง" เกิดขึ้น (เขียน ShopChannel + subscribe webhook) — callback ไม่ทำแล้ว
 *
 * authorization ของเพจอยู่ที่ Meta: เราดึงรายการเพจใหม่จาก user token ที่พักไว้ แล้วรับเฉพาะ id
 * ที่อยู่ในรายการนั้น (= user มีสิทธิ์ MESSAGING+MODERATE จริง) — id ที่ client ยัดมาเองเกินรายการ
 * จะถูกทิ้งเงียบ ไม่ใช่แค่ trust ค่าจาก body
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!session?.user || !userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const activeCtx = await resolveActiveShopContext({
    user: { id: userId, activeShopId: ((session.user as any).activeShopId as string | null | undefined) ?? null },
  })
  if (!activeCtx) return NextResponse.json({ error: 'no_shop' }, { status: 400 })

  const parsed = v.safeParse(ConfirmChannelPagesSchema, await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }
  const { pageIds, forceIds = [] } = parsed.output

  const userToken = readPendingUserToken(request)
  if (!userToken) return NextResponse.json({ error: 'session_expired' }, { status: 410 })

  try {
    const manageable = await listManageablePages(userToken)
    const selected = manageable.filter((p) => pageIds.includes(p.id))
    if (selected.length === 0) {
      return NextResponse.json({ error: 'ไม่พบเพจที่เลือก กรุณาเชื่อมต่อใหม่' }, { status: 400 })
    }

    // forceIds ต้องเป็น subset ของที่เลือกจริงเสมอ — กันการยืนยันย้ายเพจที่ไม่ได้อยู่ในรายการเลือก
    const effectiveForceIds = forceIds.filter((id) => selected.some((p) => p.id === id))

    const result = await connectPages(activeCtx.shopId, userId, selected, { forceIds: effectiveForceIds })

    const res = NextResponse.json({
      connected: result.connected,
      // skipped: เพจที่ติดร้านอื่นและ user "ไม่ได้" ยืนยันย้าย — ส่งชื่อร้านกลับไปให้ UI บอกเหตุผลได้
      skipped: result.skipped,
      subscribeFailed: result.subscribeFailed,
    })
    // ใช้ token เสร็จแล้วทิ้งทันที ไม่ปล่อยค้างจนครบ 10 นาที (กดยืนยันซ้ำต้องเริ่ม OAuth ใหม่)
    res.cookies.set(OAUTH_USER_TOKEN_COOKIE, '', { path: '/api/channels/facebook', maxAge: 0 })
    return res
  } catch (e) {
    console.error('[fb-confirm] ล้มเหลว', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่' }, { status: 502 })
  }
}
