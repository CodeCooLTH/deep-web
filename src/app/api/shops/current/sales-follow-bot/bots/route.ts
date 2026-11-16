/** GET/POST /api/shops/current/sales-follow-bot/bots — รายการ/สร้างบอท (00095 API §4.1-4.2 · H2) */
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { salesFollowErrorResponse, validationErrorResponse } from '@/lib/sales-follow-bot/route-errors'
import { featureGate, readJson } from '@/lib/sales-follow-bot/route-gate'
import { parseCreateBot } from '@/lib/sales-follow-bot/schemas'
import { createBot, listBots } from '@/services/sales-follow-bot.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'H2')
  if (!gate.ok) return gate.response
  const blocked = featureGate(gate.shopId, gate.active.shop.vertical)
  if (blocked) return blocked
  try {
    return jsonNoStore({ bots: await listBots(gate.shopId) })
  } catch (e) {
    return salesFollowErrorResponse(e, 'GET sales-follow-bot/bots')
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'H2')
  if (!gate.ok) return gate.response
  const blocked = featureGate(gate.shopId, gate.active.shop.vertical)
  if (blocked) return blocked
  const parsed = parseCreateBot(await readJson(request))
  if (!parsed.ok) return validationErrorResponse(parsed.issues)
  try {
    return jsonNoStore(await createBot(gate.shopId, gate.userId, parsed.value), { status: 201 })
  } catch (e) {
    return salesFollowErrorResponse(e, 'POST sales-follow-bot/bots')
  }
}
