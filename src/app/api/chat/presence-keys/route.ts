import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { chatScopeOrDeny, resolveChatScope } from '@/lib/chat-scope'
import { sessionUserId } from '@/lib/session-user'
import { presenceKeyFor } from '@/lib/chat-desk/presence-key'

/**
 * GET /api/chat/presence-keys — คีย์ presence ทึบของ "ผู้เรียก" ในทุกร้านในขอบเขตแชท (00077 · API.md §4.3)
 * ขอบเขต = ร้านที่ถือ H1 (ADMIN ที่แชทได้ลงชื่อได้) · คืนเฉพาะคีย์ของตัวเอง ไม่ใช่ของคนอื่น
 */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' }

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE })

  try {
    const activeShopId = (session?.user as { activeShopId?: string | null } | undefined)?.activeShopId ?? null
    const r = chatScopeOrDeny(await resolveChatScope({ user: { id: userId, activeShopId } }, 'H1'))
    if ('response' in r) return r.response
    const keys = r.scope.shopIds.map((shopId) => ({ shopId, key: presenceKeyFor(shopId, userId) }))
    return NextResponse.json({ keys }, { headers: NO_STORE })
  } catch (e) {
    console.error('[GET /api/chat/presence-keys]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500, headers: NO_STORE })
  }
}
