import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { parseReportQuery } from '@/lib/agent-report-query'
import { resolveAgentReportAccess } from '@/services/agent-report-access.service'
import { getAgentPerformance } from '@/services/agent-performance.service'

/**
 * GET /api/seller/reports/agents/{agentId} — ผลงานของแอดมินคนเดียว + แนวโน้มรายวัน
 *
 * 🛑 ด่านสิทธิ์ต้องอยู่ที่นี่ด้วย ไม่ใช่แค่ซ่อนลิงก์บนหน้าจอ — พนักงานที่ยังไม่ได้รับสิทธิ์
 * ดูข้อมูลการเงินของร้าน ต้องยิง id ของเพื่อนร่วมงานเข้ามาแล้วได้ 403 (โจทย์ข้อ 12)
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ agentId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return jsonNoStore({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 })

  const access = await resolveAgentReportAccess(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (access.kind === 'NO_SHOP') {
    return jsonNoStore({ error: 'ไม่พบร้านค้า กรุณาเปิดร้านก่อนใช้งาน' }, { status: 404 })
  }

  const { agentId } = await ctx.params
  if (access.kind === 'SELF' && agentId !== access.scopeToAgentUserId) {
    return jsonNoStore({ error: 'ไม่มีสิทธิ์ดูผลงานของสมาชิกคนอื่น' }, { status: 403 })
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
    const detail = await getAgentPerformance(access.shop.id, agentId, parsed.filters)
    if (!detail) return jsonNoStore({ error: 'ไม่พบสมาชิกคนนี้ในร้าน' }, { status: 404 })
    return jsonNoStore({
      ...detail,
      label: parsed.label,
      clamped: parsed.clamped,
      access: { kind: access.kind, canSeeRevenue: access.canSeeRevenue },
    })
  } catch (e) {
    console.error('[GET /api/seller/reports/agents/:id]', e)
    return jsonNoStore({ error: 'โหลดรายงานไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }
}
