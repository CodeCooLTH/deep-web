import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { parseReportQuery } from '@/lib/agent-report-query'
import { resolveAgentReportAccess } from '@/services/agent-report-access.service'
import { getConversationBreakdown } from '@/services/agent-performance.service'

/**
 * GET /api/seller/reports/agents/{agentId}/conversations — เธรดที่ประกอบเป็นตัวเลขของคนนั้น
 *
 * `agentId = 'all'` = ทุกเธรดในขอบเขต (ใช้จากหน้าภาพรวม) — สงวนคำนี้ไว้เพราะ id จริงเป็น uuid
 * จึงไม่มีทางชนกัน
 */
export const dynamic = 'force-dynamic'

/** เพดานต่อหน้า — ป้องกันคำขอที่ขอทีเดียวหมดช่วง 92 วัน */
const MAX_LIMIT = 100

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
  const target = agentId === 'all' ? null : agentId
  if (access.kind === 'SELF' && target !== access.scopeToAgentUserId) {
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
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(sp.get('limit')) || 25))
  const offset = Math.max(0, Number(sp.get('offset')) || 0)

  try {
    const result = await getConversationBreakdown(access.shop.id, target, parsed.filters, {
      limit,
      offset,
    })
    // ยอดเงินต่อใบต้องหายไปจาก payload จริง ๆ เมื่อไม่มีสิทธิ์ ไม่ใช่แค่ไม่ render คอลัมน์
    const rows = access.canSeeRevenue
      ? result.rows
      : result.rows.map((r) => ({ ...r, orderValue: null }))
    return jsonNoStore({ ...result, rows, limit, offset, canSeeRevenue: access.canSeeRevenue })
  } catch (e) {
    console.error('[GET /api/seller/reports/agents/:id/conversations]', e)
    return jsonNoStore({ error: 'โหลดรายการสนทนาไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }
}
