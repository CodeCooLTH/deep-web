import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as v from 'valibot'

import { authOptions } from '@/lib/auth'
import { listAccessibleShopIds } from '@/lib/shop-capability'
import { sessionUserId } from '@/lib/session-user'
import { getRoomPreview } from '@/services/chat-desk.service'

/**
 * GET /api/chat-desk/rooms/{id}/preview — 30 ข้อความล่าสุดของห้อง อ่านอย่างเดียว (00077 · API.md §4.2)
 * 🛑 ไม่แตะ shopLastReadAt · ไม่ markRead · ไม่ส่ง seen/sender action (AC-CD-40)
 * ห้องร้านอื่น/ผู้ดูไม่ใช่เจ้าของ/ไม่มีห้อง → 404 เหมือนกันหมด (403 จะยืนยันว่าห้องมีอยู่จริง)
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

const idSchema = v.pipe(v.string(), v.uuid())

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  const { id } = await params
  if (!v.is(idSchema, id)) return json({ error: 'INVALID_ID' }, 400)

  try {
    const owned = await listAccessibleShopIds(userId, 'X7')
    if (owned.length === 0) return json({ error: 'NOT_FOUND' }, 404)
    const preview = await getRoomPreview(owned, id)
    if (!preview) return json({ error: 'NOT_FOUND' }, 404)
    return json(preview)
  } catch (e) {
    console.error('[GET /api/chat-desk/rooms/[id]/preview]', e instanceof Error ? e.message : e)
    return json({ error: 'INTERNAL' }, 500)
  }
}
