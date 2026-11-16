/** GET /api/shops/current/sales-follow-bot/test-rooms — ค้นห้องทดสอบ (00095 API §4.8 · H2) */
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { SALES_FOLLOW_LIMITS } from '@/lib/sales-follow-bot/constants'
import { salesFollowErrorResponse, validationErrorResponse } from '@/lib/sales-follow-bot/route-errors'
import { featureGate } from '@/lib/sales-follow-bot/route-gate'
import { searchTestRooms } from '@/services/sales-follow-bot.service'

export const dynamic = 'force-dynamic'

const ChannelIdsSchema = v.pipe(v.array(v.pipe(v.string(), v.uuid())), v.minLength(1), v.maxLength(SALES_FOLLOW_LIMITS.maxChannels))

export async function GET(request: NextRequest) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'H2')
  if (!gate.ok) return gate.response
  const blocked = featureGate(gate.shopId, gate.active.shop.vertical)
  if (blocked) return blocked
  const sp = request.nextUrl.searchParams
  const ids = v.safeParse(ChannelIdsSchema, (sp.get('channelIds') ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  if (!ids.success) return validationErrorResponse([{ code: 'CHANNELS_REQUIRED', path: 'channelIds' }])
  try {
    return jsonNoStore({ rooms: await searchTestRooms(gate.shopId, ids.output, sp.get('q') ?? undefined) })
  } catch (e) {
    return salesFollowErrorResponse(e, 'GET sales-follow-bot/test-rooms')
  }
}
