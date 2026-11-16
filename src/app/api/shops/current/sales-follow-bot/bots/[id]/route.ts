/** GET/PATCH/DELETE /api/shops/current/sales-follow-bot/bots/[id] (00095 API §4.3-4.5 · H2) */
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { salesFollowErrorResponse } from '@/lib/sales-follow-bot/route-errors'
import { featureGate, parseWith, readJson } from '@/lib/sales-follow-bot/route-gate'
import { ExpectedUpdatedAtQuerySchema, UpdateBotSchema } from '@/lib/sales-follow-bot/schemas'
import { deleteBot, getBot, updateBot } from '@/services/sales-follow-bot.service'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, ctx: Ctx) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'H2')
  if (!gate.ok) return gate.response
  const blocked = featureGate(gate.shopId, gate.active.shop.vertical)
  if (blocked) return blocked
  try {
    return jsonNoStore(await getBot(gate.shopId, (await ctx.params).id))
  } catch (e) {
    return salesFollowErrorResponse(e, 'GET sales-follow-bot/bots/[id]')
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'H2')
  if (!gate.ok) return gate.response
  const blocked = featureGate(gate.shopId, gate.active.shop.vertical)
  if (blocked) return blocked
  const body = parseWith(UpdateBotSchema, await readJson(request))
  if (!body.ok) return body.response
  try {
    return jsonNoStore(await updateBot(gate.shopId, gate.userId, (await ctx.params).id, body.value))
  } catch (e) {
    return salesFollowErrorResponse(e, 'PATCH sales-follow-bot/bots/[id]')
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'H2')
  if (!gate.ok) return gate.response
  const blocked = featureGate(gate.shopId, gate.active.shop.vertical)
  if (blocked) return blocked
  const q = parseWith(ExpectedUpdatedAtQuerySchema, { expectedUpdatedAt: request.nextUrl.searchParams.get('expectedUpdatedAt') })
  if (!q.ok) return q.response
  try {
    return jsonNoStore(await deleteBot(gate.shopId, gate.userId, (await ctx.params).id, q.value.expectedUpdatedAt))
  } catch (e) {
    return salesFollowErrorResponse(e, 'DELETE sales-follow-bot/bots/[id]')
  }
}
