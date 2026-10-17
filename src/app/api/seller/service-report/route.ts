/**
 * GET /api/seller/service-report — ข้อมูลหน้า "ยอดขายและกำไร" ของร้านบริการหนึ่งช่วง (feature 00078 · FR-003)
 * ใช้ตอนเลื่อนช่วง/สลับรายวัน-รายเดือน (ช่วงแรกมาจาก RSC แล้ว)
 *
 * ด่าน: F1 (เจ้าของร้าน — ชุดเดียวกับ /api/seller/sales-series) แล้ว **ร้านบริการเท่านั้น** (อื่น 404)
 * 🛑 รายงานกลุ่ม LINE ไม่ใช้ route นี้
 */
import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireShopCapability } from '@/lib/shop-capability'
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import { getServiceReportData } from '@/services/service-report.service'

export const dynamic = 'force-dynamic'

const QuerySchema = v.object({
  mode: v.picklist(['daily', 'monthly']),
  year: v.pipe(v.number(), v.integer(), v.minValue(2000), v.maxValue(2100)),
  month: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(12))),
})

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 })
  const gate = await requireShopCapability(session, 'F1')
  if (!gate.ok) return gate.response
  const shop = gate.active.shop
  if (!usesServiceFinanceRules(shop.vertical)) return NextResponse.json({ error: 'ไม่พบหน้านี้' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const monthRaw = searchParams.get('month')
  const parsed = v.safeParse(QuerySchema, {
    mode: searchParams.get('mode') ?? undefined,
    year: Number(searchParams.get('year')),
    month: monthRaw != null ? Number(monthRaw) : undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: 'พารามิเตอร์ไม่ถูกต้อง' }, { status: 400 })
  const { mode, year, month } = parsed.output
  if (mode === 'daily' && month == null) return NextResponse.json({ error: 'โหมดรายวันต้องระบุเดือน' }, { status: 400 })

  try {
    const data = await getServiceReportData(shop.id, shop.vertical, mode, { year, month })
    return NextResponse.json(data, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    console.error('[GET /api/seller/service-report]', e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
