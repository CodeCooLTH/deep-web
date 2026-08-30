import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { parseReportQuery } from '@/lib/agent-report-query'
import { resolveAgentReportAccess } from '@/services/agent-report-access.service'
import { getAgentPerformanceOverview } from '@/services/agent-performance.service'

/**
 * GET /api/seller/reports/agents — ภาพรวม + ตารางจัดอันดับผลงานแอดมิน (feature 00059)
 *
 * query: from · to (YYYY-MM-DD, เวลาไทย) · channel · source · shopChannelId
 *
 * 🛑 ไม่รับ `shopId` จาก query เด็ดขาด — ร้านมาจาก session เท่านั้น (แพตเทิร์นเดียวกับ
 * `/api/seller/sales-series`) ⇒ ได้ membership guard มาฟรีจาก `resolveAgentReportAccess`
 * และไม่มีทางยิงข้ามร้านได้แม้รู้ id
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return jsonNoStore({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 })

  const access = await resolveAgentReportAccess(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (access.kind === 'NO_SHOP') {
    return jsonNoStore({ error: 'ไม่พบร้านค้า กรุณาเปิดร้านก่อนใช้งาน' }, { status: 404 })
  }

  const sp = request.nextUrl.searchParams
  const parsed = parseReportQuery({
    from: sp.get('from'),
    to: sp.get('to'),
    channel: sp.get('channel'),
    source: sp.get('source'),
    shopChannelId: sp.get('shopChannelId'),
  })

  try {
    const result = await getAgentPerformanceOverview(access.shop.id, parsed.filters, {
      scopeToAgentUserId: access.kind === 'SELF' ? access.scopeToAgentUserId : null,
    })
    return jsonNoStore({
      ...result,
      label: parsed.label,
      clamped: parsed.clamped,
      access: { kind: access.kind, canSeeRevenue: access.canSeeRevenue, userId: access.userId },
    })
  } catch (e) {
    console.error('[GET /api/seller/reports/agents]', e)
    return jsonNoStore({ error: 'โหลดรายงานไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }
}
