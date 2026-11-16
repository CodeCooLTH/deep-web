/** GET /api/shops/current/sales-follow-bot/sends — ประวัติการส่ง keyset (00095 API §4.9 · H2) · cursor ปลอม = 200 ว่าง (service) */
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { salesFollowErrorResponse } from '@/lib/sales-follow-bot/route-errors'
import { featureGate } from '@/lib/sales-follow-bot/route-gate'
import { listSends } from '@/services/sales-follow-bot.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'H2')
  if (!gate.ok) return gate.response
  const blocked = featureGate(gate.shopId, gate.active.shop.vertical)
  if (blocked) return blocked
  const sp = request.nextUrl.searchParams
  const limit = sp.get('limit')
  try {
    // limit ที่ไม่ใช่ตัวเลข → NaN → service ใช้ค่าตั้งต้น 50 และ clamp 1..50
    return jsonNoStore(await listSends(gate.shopId, { cursor: sp.get('cursor'), limit: limit === null ? undefined : Number(limit) }))
  } catch (e) {
    return salesFollowErrorResponse(e, 'GET sales-follow-bot/sends')
  }
}
