import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { requireShopCapability } from '@/lib/shop-capability'
import { parseAdReportQuery } from '@/lib/ad-report-query'
import { adReportExportTable } from '@/lib/ad-report-export'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { getAdSalesReport } from '@/services/ad-sales-report.service'
import { toXlsx } from '@/services/order-export.service'

/**
 * GET /api/reports/ads/export?from=&to=&shopChannelId= — ส่งออก "สิ่งที่เห็นบนจอ" เป็น xlsx (feature 00091)
 * xlsx อย่างเดียว (รหัสแอดยาว ~18 หลัก — xlsx เก็บเป็นข้อความได้ปลอดภัย) · F1 เจ้าของร้านเท่านั้น
 */
export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const gate = await requireShopCapability(session, 'F1')
  if (!gate.ok) return gate.response

  const sp = request.nextUrl.searchParams
  const q = parseAdReportQuery({ from: sp.get('from'), to: sp.get('to'), shopChannelId: sp.get('shopChannelId') })
  try {
    const shop = gate.active.shop
    // ค่าโฆษณามาจาก cache เดียวกับหน้าจอ (15 นาที) — ไฟล์จึงตรงกับที่เห็น รวมแถวผีที่มีแต่ค่าโฆษณา
    const report = await getAdSalesReport(shop.id, { from: q.filters.from, to: q.filters.to, shopChannelId: q.filters.shopChannelId })
    const { columns, rows } = adReportExportTable(report, resolveOrderVocab(shop.vertical ?? '').noun)
    const buf = await toXlsx(columns, rows, 'ยอดขายตามโฆษณา')
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="deep-ads-${q.label.from}_${q.label.to}.xlsx"`,
      },
    })
  } catch (e) {
    console.error('[GET /api/reports/ads/export]', e)
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500, headers: NO_STORE })
  }
}
