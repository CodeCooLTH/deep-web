import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { requireShopCapability } from '@/lib/shop-capability'
import { EXPORT_MAX_ROWS, exportFilename, toCsv } from '@/lib/order-export'
import { loadOrderExport, toXlsx } from '@/services/order-export.service'

/**
 * POST /api/orders/export — ส่งออกออเดอร์ของร้าน active เป็น CSV / xlsx (feature 00086)
 *
 * P3 = เจ้าของร้านเท่านั้น (มติ user 2026-10-29) — ไฟล์มีต้นทุน/ค่าส่ง/กำไรทุกคอลัมน์
 * POST ไม่ใช่ GET: โหมดตามตัวกรองส่ง publicToken ได้ถึง 5,000 ตัว เกินความยาว URL
 * ร้านมาจาก session เท่านั้น · token ที่ส่งมาถูกกรองด้วยร้านซ้ำใน service
 */
const BodySchema = v.variant('scope', [
  v.object({
    scope: v.literal('all'),
    format: v.picklist(['csv', 'xlsx']),
  }),
  v.object({
    scope: v.literal('filtered'),
    format: v.picklist(['csv', 'xlsx']),
    // เกินเพดานตอบข้อความแบบเดียวกับที่ service นับได้ — ไม่ใช่ 400 ดิบ
    tokens: v.pipe(v.array(v.pipe(v.string(), v.uuid())), v.minLength(1)),
  }),
])

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const gate = await requireShopCapability(session, 'P3')
  if (!gate.ok) return gate.response

  const parsed = v.safeParse(BodySchema, await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400, headers: NO_STORE })
  const body = parsed.output

  const tokens = body.scope === 'filtered' ? body.tokens : null
  if (tokens && tokens.length > EXPORT_MAX_ROWS) {
    return NextResponse.json({ error: 'TOO_MANY', max: EXPORT_MAX_ROWS }, { status: 413, headers: NO_STORE })
  }

  const shop = gate.active.shop
  const result = await loadOrderExport(shop.id, shop.vertical, tokens)
  if (result.kind === 'empty') return NextResponse.json({ error: 'EMPTY' }, { status: 404, headers: NO_STORE })
  if (result.kind === 'too_many') {
    return NextResponse.json({ error: 'TOO_MANY', max: EXPORT_MAX_ROWS, count: result.count }, { status: 413, headers: NO_STORE })
  }

  const filename = exportFilename(shop.slug ?? shop.id, body.scope, body.format, new Date())
  const headers = {
    ...NO_STORE,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'X-Export-Count': String(result.rows.length),
  }
  if (body.format === 'csv') {
    return new NextResponse(toCsv(result.columns, result.rows), {
      headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' },
    })
  }
  const buf = await toXlsx(result.columns, result.rows, 'ออเดอร์')
  return new NextResponse(new Uint8Array(buf), {
    headers: { ...headers, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  })
}
