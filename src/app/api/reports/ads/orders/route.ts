import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { requireShopCapability } from '@/lib/shop-capability'
import { parseAdReportQuery } from '@/lib/ad-report-query'
import { listOrdersForAd } from '@/services/ad-sales-report.service'

/**
 * GET /api/reports/ads/orders?adId=&from=&to=&shopChannelId= — คำสั่งซื้อของแอดหนึ่งตัว ≤50 ใบล่าสุดในช่วง (feature 00091)
 *
 * F1 = เจ้าของร้านเท่านั้น (ยอดเงินของใบ) · ร้านมาจาก session ไม่รับ shopId จาก query
 */
export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const gate = await requireShopCapability(session, 'F1')
  if (!gate.ok) return gate.response

  const sp = request.nextUrl.searchParams
  const adId = sp.get('adId')?.trim()
  if (!adId) return NextResponse.json({ error: 'INVALID_QUERY' }, { status: 400, headers: NO_STORE })

  const q = parseAdReportQuery({ from: sp.get('from'), to: sp.get('to'), shopChannelId: sp.get('shopChannelId') })
  try {
    const shop = gate.active.shop
    const result = await listOrdersForAd(shop.id, shop.vertical, adId, { from: q.filters.from, to: q.filters.to, shopChannelId: q.filters.shopChannelId })
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (e) {
    console.error('[GET /api/reports/ads/orders]', e)
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500, headers: NO_STORE })
  }
}
