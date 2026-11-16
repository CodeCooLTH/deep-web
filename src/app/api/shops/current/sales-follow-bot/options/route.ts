/** GET /api/shops/current/sales-follow-bot/options — ตัวเลือกฟอร์ม (00095 API §4.7 · H2) */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { salesFollowErrorResponse } from '@/lib/sales-follow-bot/route-errors'
import { featureGate } from '@/lib/sales-follow-bot/route-gate'
import { getBotOptions } from '@/services/sales-follow-bot.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'H2')
  if (!gate.ok) return gate.response
  const blocked = featureGate(gate.shopId, gate.active.shop.vertical)
  if (blocked) return blocked
  try {
    return jsonNoStore(await getBotOptions(gate.shopId))
  } catch (e) {
    return salesFollowErrorResponse(e, 'GET sales-follow-bot/options')
  }
}
