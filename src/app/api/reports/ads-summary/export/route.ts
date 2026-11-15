import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireShopCapability } from '@/lib/shop-capability'
import { parseAdReportQuery } from '@/lib/ad-report-query'
import { adSummaryExportTable, EXPORT_LEVELS, type ExportLevel } from '@/lib/ad-summary/export'
import { toCsv } from '@/lib/order-export'
import { getAdSummaryReport } from '@/services/ad-summary-report.service'

/**
 * GET /api/reports/ads-summary/export?level=campaign|adset|ad&from=&to=&shopChannelId= — ส่งออก CSV ของหน้าสรุปโฆษณา (feature 00094 FR-008)
 * ทุกแถวของระดับที่เลือก (ไม่ใช่แค่หน้าที่เห็น) · F1 เจ้าของร้านเท่านั้น · ค่าโฆษณามาจากแคชเดียวกับหน้าจอ
 */
export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }
const LEVEL_LABEL: Record<ExportLevel, string> = { campaign: 'แคมเปญ', adset: 'ชุดโฆษณา', ad: 'โฆษณา' }

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const gate = await requireShopCapability(session, 'F1')
  if (!gate.ok) return gate.response

  const sp = request.nextUrl.searchParams
  const level = (sp.get('level') ?? 'campaign') as ExportLevel
  if (!EXPORT_LEVELS.includes(level)) return NextResponse.json({ error: 'INVALID_LEVEL' }, { status: 400, headers: NO_STORE })
  const q = parseAdReportQuery({ from: sp.get('from'), to: sp.get('to'), shopChannelId: sp.get('shopChannelId') })
  try {
    const shop = gate.active.shop
    const report = await getAdSummaryReport(shop.id, { from: q.filters.from, to: q.filters.to, shopChannelId: q.filters.shopChannelId })
    const { columns, rows } = adSummaryExportTable(report, level)
    // เพจ: ค้นด้วย shopId ด้วย (กันอ่านชื่อเพจร้านอื่นจาก id ที่ส่งมา)
    const page = q.filters.shopChannelId
      ? (await prisma.shopChannel.findFirst({ where: { id: q.filters.shopChannelId, shopId: shop.id }, select: { name: true } }))?.name ?? '—'
      : 'ทุกเพจ'
    const esc = (f: string) => (/[",\n\r]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f)
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const info = esc(`สรุปโฆษณา (${LEVEL_LABEL[level]}) · ช่วงวันที่ ${q.label.from} ถึง ${q.label.to} · เพจ: ${page} · สร้างเมื่อ ${stamp} UTC`)
    const csv = toCsv(columns, rows)
    // toCsv ขึ้นต้นด้วย BOM — แทรกบรรทัดข้อมูลต่อจาก BOM ก่อนหัวคอลัมน์
    return new NextResponse(`${csv.slice(0, 1)}${info}\r\n${csv.slice(1)}`, {
      headers: {
        ...NO_STORE,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ads-summary-${level}-${q.label.from}_${q.label.to}.csv"`,
      },
    })
  } catch (e) {
    console.error('[GET /api/reports/ads-summary/export]', e instanceof Error ? e.message : 'unknown') // ไม่ log ตัว error ดิบ (อาจมี URL)
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500, headers: NO_STORE })
  }
}
