/**
 * GET /api/seller/service-report/day?date=YYYY-MM-DD — บิลของหนึ่งวัน (feature 00078 · FR-004)
 * โหลดเมื่อผู้ใช้แตะแถววัน/แท่งกราฟเท่านั้น
 *
 * ด่าน: F1 (เจ้าของร้าน) แล้ว **ร้านบริการเท่านั้น** (อื่น 404) · คืนเฉพาะฟิลด์ที่จอใช้
 */
import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireShopCapability } from '@/lib/shop-capability'
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import { getServiceReportDayBills } from '@/services/service-report.service'

export const dynamic = 'force-dynamic'

const DateSchema = v.pipe(
  v.string(),
  v.regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/),
  // วันที่ต้องมีจริง — "2026-02-31" ผ่าน regex แต่ Date.UTC ปัดไป 3 มี.ค. ⇒ ได้บิลผิดวัน
  v.check((s) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d
  }),
)

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 })
  const gate = await requireShopCapability(session, 'F1')
  if (!gate.ok) return gate.response
  const shop = gate.active.shop
  if (!usesServiceFinanceRules(shop.vertical)) return NextResponse.json({ error: 'ไม่พบหน้านี้' }, { status: 404 })

  const parsed = v.safeParse(DateSchema, new URL(request.url).searchParams.get('date') ?? '')
  if (!parsed.success) return NextResponse.json({ error: 'วันที่ไม่ถูกต้อง' }, { status: 400 })

  try {
    const bills = await getServiceReportDayBills(shop.id, parsed.output)
    return NextResponse.json({ bills }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    console.error('[GET /api/seller/service-report/day]', e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
