/**
 * ad-report-export — ตารางสำหรับไฟล์ xlsx ของรายงานยอดขายตามโฆษณา (00091) · pure
 * หัวคอลัมน์ = หัวตารางบนจอ 7 ตัว (+ ค่าโฆษณา/ต้นทุนต่อใบ/ROAS เมื่อเชื่อมบัญชีโฆษณาได้ — ตรงกับจอ) + 2 แถวสรุปท้ายไฟล์ · แถวที่ชื่อแอดว่างใส่รหัสในคอลัมน์ "โฆษณา" เหมือนหน้าจอ
 */
import type { ExportColumn, ExportRow } from '@/lib/order-export'
import type { AdReport } from '@/services/ad-sales-report.service'
import { costPerOrder, roas } from '@/lib/ad-report-view'

export function adReportExportTable(report: AdReport, noun: string): { columns: ExportColumn[]; rows: ExportRow[] } {
  const columns: ExportColumn[] = [
    { key: 'ad', header: 'โฆษณา', kind: 'text' },
    { key: 'chats', header: 'แชทจากโฆษณา', kind: 'int' },
    { key: 'orders', header: noun, kind: 'int' },
    { key: 'rate', header: 'อัตราปิดการขาย', kind: 'text' },
    { key: 'sales', header: 'ยอดขาย', kind: 'money' },
    { key: 'avg', header: 'ยอดเฉลี่ยต่อใบ', kind: 'money' },
    { key: 'lost', header: 'ยกเลิก/คืน', kind: 'int' },
  ]
  const withSpend = report.ads.state === 'OK'
  if (withSpend) {
    columns.push(
      { key: 'spend', header: 'ค่าโฆษณา', kind: 'money' },
      { key: 'cpo', header: `ต้นทุนต่อ${noun}`, kind: 'money' },
      { key: 'roas', header: 'ROAS', kind: 'text' },
    )
  }
  const roasText = (v: number | null) => (v === null ? '—' : v.toFixed(2))
  const rows: ExportRow[] = report.rows.map((r) => ({
    ad: r.adTitle ?? r.adId,
    chats: r.chats,
    orders: r.orders,
    rate: r.closeRatePct === null ? '—' : `${r.closeRatePct}%`,
    sales: r.sales,
    avg: r.avgPerOrder,
    lost: r.cancelledOrReturned,
    ...(withSpend && { spend: r.spend, cpo: costPerOrder(r.spend, r.orders), roas: roasText(roas(r.sales, r.spend)) }),
  }))
  const s = report.summary
  rows.push(
    {
      ad: 'รวมจากโฆษณา', orders: s.adOrders, sales: s.adSales,
      ...(withSpend && { spend: report.ads.summary.spend, cpo: report.ads.summary.costPerOrder, roas: roasText(report.ads.summary.roas) }),
    },
    { ad: 'ไม่ได้มาจากโฆษณา', orders: s.nonAdOrders, sales: s.nonAdSales },
  )
  return { columns, rows }
}
