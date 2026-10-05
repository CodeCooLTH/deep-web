import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { sessionUserId } from '@/lib/session-user'
import { getPortfolioSeries, listOverviewShops } from '@/services/business-overview.service'

// auth per-user + query-driven — ห้าม cache ข้าม user/ช่วง (feedback_auth_api_cache_control)
export const dynamic = 'force-dynamic'

// ชุดเดียวกับ /api/seller/sales-series — ชีตรวมเลื่อนช่วงแบบเดียวกับชีตยอดขายของร้าน
const QuerySchema = v.object({
  mode: v.picklist(['daily', 'monthly']),
  year: v.pipe(v.number(), v.integer(), v.minValue(2000), v.maxValue(2100)),
  month: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(12))),
})

/**
 * GET /api/seller/portfolio-series — ยอดรวมทุกธุรกิจ (feature 00069 v1.1 · API.md ส่วนแก้ไข v1.1)
 *
 * 🛑 ร้านที่คืนมาจาก listOverviewShops(userId) เท่านั้น (OWNER + BUSINESS + จ่ายแล้ว) — ไม่รับ shopId จาก query
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!userId) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 })
  }
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
  // ภาพรวมเป็นของบริบท Personal เท่านั้น (BRD FR-001) — บริบทร้าน BUSINESS ใช้ชีตยอดขายของร้านเอง
  if (!active || active.kind !== 'PERSONAL') {
    return NextResponse.json({ error: 'ใช้ได้เฉพาะบัญชีส่วนตัว' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const monthRaw = searchParams.get('month')
  const parsed = v.safeParse(QuerySchema, {
    mode: searchParams.get('mode') ?? undefined,
    year: Number(searchParams.get('year')),
    month: monthRaw != null ? Number(monthRaw) : undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'พารามิเตอร์ไม่ถูกต้อง' }, { status: 400 })
  }
  const { mode, year, month } = parsed.output
  if (mode === 'daily' && month == null) {
    return NextResponse.json({ error: 'โหมดรายวันต้องระบุเดือน' }, { status: 400 })
  }

  try {
    const shops = await listOverviewShops(userId)
    const data = await getPortfolioSeries(shops, active.shop, mode, year, mode === 'daily' ? month ?? null : null)
    return NextResponse.json(data, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    console.error('[GET /api/seller/portfolio-series]', e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
