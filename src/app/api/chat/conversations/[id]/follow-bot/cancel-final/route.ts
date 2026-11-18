/** POST /api/chat/conversations/[id]/follow-bot/cancel-final — ยกเลิก action ท้ายสุดที่ค้างรอของห้องนี้ (00095 BR-FA-12 · H2 สิทธิ์เดียวกับหยุดบอท) · ไม่ใช้ featureGate: ร้านที่ถูกถอดต้องยังหยุดบอทที่ค้างได้ */
import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { resolveConversationShopId } from '@/lib/chat-scope'
import { forbiddenRoleResponse } from '@/lib/forbidden-role'
import { sessionUserId } from '@/lib/session-user'
import { salesFollowErrorResponse } from '@/lib/sales-follow-bot/route-errors'
import { cancelFinalForConversation } from '@/services/sales-follow-bot.service'

export const dynamic = 'force-dynamic'

/**
 * 00037 กล่องแชทรวม — ใช้ "ร้านเจ้าของห้อง" ไม่ใช่ร้านที่ active (permission-gate-follows-the-row)
 * ไม่มีห้อง/ไม่ใช่สมาชิกร้านนั้น = 404 · สมาชิกแต่บทบาทไม่ถือ cap = 403 FORBIDDEN_ROLE
 * (ขอบเขตร้านตาม chatScopeMode ของผู้ใช้เหมือน route พี่น้อง เช่น customer-prefill)
 */
async function requireShopContext(conversationId: string, cap: 'H2'): Promise<{ response: NextResponse } | { shopId: string; userId: string }> {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!session?.user || !userId) return { response: jsonNoStore({ error: 'unauthorized' }, { status: 401 }) }
  const activeShopId = (session.user as { activeShopId?: string | null }).activeShopId ?? null
  const resolved = await resolveConversationShopId({ user: { id: userId, activeShopId } }, conversationId, cap)
  if (!resolved) return { response: jsonNoStore({ error: 'NOT_FOUND' }, { status: 404 }) }
  if ('denied' in resolved) return { response: forbiddenRoleResponse() }
  return { shopId: resolved.shopId, userId }
}

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireShopContext((await ctx.params).id, 'H2')
  if ('response' in gate) return gate.response
  try {
    return jsonNoStore(await cancelFinalForConversation(gate.shopId, (await ctx.params).id))
  } catch (e) {
    return salesFollowErrorResponse(e, 'POST chat/conversations/[id]/follow-bot/cancel-final')
  }
}
