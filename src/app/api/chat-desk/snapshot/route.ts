import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as v from 'valibot'

import { authOptions } from '@/lib/auth'
import { listAccessibleShopIds } from '@/lib/shop-capability'
import { sessionUserId } from '@/lib/session-user'
import { FORBIDDEN_ROLE_BODY } from '@/lib/forbidden-role'
import { pickDeskShop } from '@/lib/chat-desk/owner-scope'
import { parseDeskFilters } from '@/lib/chat-desk/filters'
import { getDeskSnapshot, sortShopIdsByName } from '@/services/chat-desk.service'

/**
 * GET /api/chat-desk/snapshot — snapshot โต๊ะแชทของร้านหนึ่งร้าน (00077 · API.md §4.1) อ่านอย่างเดียว
 * สิทธิ์ X7 (เจ้าของ) ตรวจสดทุกคำขอ ไม่พึ่ง layout/JWT · ADMIN → 403 ไม่มีข้อมูลใดหลุด
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' }
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } })

const shopIdSchema = v.pipe(v.string(), v.uuid())

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  const sp = request.nextUrl.searchParams
  const rawShop = sp.get('shopId')
  if (rawShop !== null && !v.is(shopIdSchema, rawShop)) return json({ error: 'INVALID_QUERY' }, 400)

  try {
    const t0 = performance.now()
    // literal 'X7' ต้องอยู่ที่นี่ — ทะเบียน route-capabilities + ตัวสแกนบังคับ (ห้ามย้ายไปฟังก์ชันอื่น)
    let owned = await listAccessibleShopIds(userId, 'X7')
    const active = (session?.user as { activeShopId?: string | null } | undefined)?.activeShopId ?? null
    // ต้องเรียงตามชื่อก็ต่อเมื่อต้องเดาร้านตั้งต้น (ไม่ได้ขอ และร้านที่ active ไม่ใช่ร้านของเจ้าของ)
    if (!rawShop && owned.length > 1 && !(active && owned.includes(active))) owned = await sortShopIdsByName(owned)
    const shopId = pickDeskShop(owned, rawShop, active)
    if (!shopId) return json(FORBIDDEN_ROLE_BODY, 403)
    const guard = performance.now() - t0

    const result = await getDeskSnapshot(shopId, parseDeskFilters(sp))
    if (!result) return json(FORBIDDEN_ROLE_BODY, 403)
    const { directory, rooms, daily } = result.timings
    const timing = `guard;dur=${guard.toFixed(1)}, directory;dur=${directory.toFixed(1)}, rooms;dur=${rooms.toFixed(1)}, daily;dur=${daily.toFixed(1)}`
    return json(result.snapshot, 200, { 'Server-Timing': timing })
  } catch (e) {
    console.error('[GET /api/chat-desk/snapshot]', e instanceof Error ? e.message : e)
    return json({ error: 'INTERNAL' }, 500)
  }
}
