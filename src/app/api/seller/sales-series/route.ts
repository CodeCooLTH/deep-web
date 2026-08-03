import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { getSalesSeries } from '@/services/dashboard.service'
import { resolveExpenseAccess } from '@/services/expense-access.service'

// auth per-user + query-driven — ห้าม cache ข้าม user/ช่วง (feedback_auth_api_cache_control)
export const dynamic = 'force-dynamic'

// query: ?mode=daily|monthly&year=YYYY&month=MM (month บังคับเมื่อ daily)
const QuerySchema = v.object({
  mode: v.picklist(['daily', 'monthly']),
  year: v.pipe(v.number(), v.integer(), v.minValue(2000), v.maxValue(2100)),
  month: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(12))),
})

// GET /api/seller/sales-series — ยอดขายต่อวัน/เดือนของร้านตัวเอง (Sales Chart)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 })
  }
  // shopId มาจาก active shop ของ session เท่านั้น (ห้ามรับจาก query) — membership guard ฟรีจาก requireActiveShop
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) {
    return NextResponse.json({ error: 'ไม่พบร้านค้า กรุณาเปิดร้านก่อนใช้งาน' }, { status: 404 })
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
    // ค่าใช้จ่าย/กำไรสุทธิมี gate สิทธิ์ของตัวเอง (แพ็กเกจ + สิทธิ์พนักงาน) — ไม่ผ่าน = ไม่ query
    // และ response ไม่มีฟิลด์เหล่านั้นเลย ชีตยอดขายจะซ่อนบล็อกนั้นเอง
    const expenseAccess = await resolveExpenseAccess(
      session as unknown as { user: { id: string; activeShopId?: string | null } },
    )
    const series = await getSalesSeries(
      active.shop.id,
      mode,
      { year, month },
      expenseAccess.kind === 'GRANTED',
    )
    return NextResponse.json(series, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    console.error('[GET /api/seller/sales-series]', e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
