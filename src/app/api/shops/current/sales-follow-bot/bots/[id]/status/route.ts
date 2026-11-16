/** PUT /api/shops/current/sales-follow-bot/bots/[id]/status — ปิด/ทดสอบ/เปิดใช้ (00095 API §4.6 · H2) */
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { salesFollowErrorResponse } from '@/lib/sales-follow-bot/route-errors'
import { featureGate, parseWith, readJson } from '@/lib/sales-follow-bot/route-gate'
import { ChangeStatusSchema } from '@/lib/sales-follow-bot/schemas'
import { changeBotStatus } from '@/services/sales-follow-bot.service'

export const dynamic = 'force-dynamic'

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'H2')
  if (!gate.ok) return gate.response
  const blocked = featureGate(gate.shopId, gate.active.shop.vertical)
  if (blocked) return blocked
  const body = parseWith(ChangeStatusSchema, await readJson(request))
  if (!body.ok) return body.response
  try {
    return jsonNoStore(await changeBotStatus(gate.shopId, gate.userId, (await ctx.params).id, body.value))
  } catch (e) {
    return salesFollowErrorResponse(e, 'PUT sales-follow-bot/bots/[id]/status')
  }
}
