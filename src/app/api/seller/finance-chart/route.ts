/**
 * GET /api/seller/finance-chart — กราฟการเงิน 3 แท็บของร้านบริการ (feature 00073 เฟส B · FR-011)
 *
 * query: ?range=MONTH|M3|M6|M12|YEAR&year=YYYY&month=M[&advance=1]
 * เจ้าของร้านเท่านั้น (F1 — ตัวเลขเงินเต็ม) · ร้านบริการเท่านั้น (ร้านอื่น 404 — ไม่มีกราฟนี้)
 * shopId จาก active shop ของ session เท่านั้น (ห้ามรับจาก query)
 *
 * Base: src/app/api/seller/sales-series/route.ts (guard + valibot query)
 */
import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { requireShopCapability } from '@/lib/shop-capability'
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import { REPORT_RANGES } from '@/lib/report-settings'
import { getAdvanceDeposits, getFinanceChartData } from '@/services/finance-chart.service'

export const dynamic = 'force-dynamic'

const QuerySchema = v.object({
  range: v.picklist(REPORT_RANGES),
  year: v.optional(v.pipe(v.number(), v.integer(), v.minValue(2000), v.maxValue(2100))),
  month: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(12))),
})

export async function GET(request: NextRequest) {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'F1')
  if (!gate.ok) return gate.response
  const shop = gate.active.shop
  if (!usesServiceFinanceRules(shop.vertical)) {
    return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  const sp = request.nextUrl.searchParams
  const num = (k: string) => (sp.get(k) != null ? Number(sp.get(k)) : undefined)
  const parsed = v.safeParse(QuerySchema, { range: sp.get('range') ?? undefined, year: num('year'), month: num('month') })
  if (!parsed.success) {
    return NextResponse.json({ error: 'พารามิเตอร์ไม่ถูกต้อง' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  const { range, year, month } = parsed.output
  const [data, advance] = await Promise.all([
    getFinanceChartData(shop.id, shop.vertical, range, { year, month }),
    sp.get('advance') === '1' ? getAdvanceDeposits(shop.id) : Promise.resolve(null),
  ])
  return NextResponse.json({ ...data, advance }, { headers: { 'Cache-Control': 'no-store' } })
}
