/**
 * ad-report-export — ตารางสำหรับไฟล์ xlsx ของรายงานยอดขายตามโฆษณา (00091) · pure
 * หัวคอลัมน์ = หัวตารางบนจอ 7 ตัว + 2 แถวสรุปท้ายไฟล์ · แถวที่ชื่อแอดว่างใส่รหัสในคอลัมน์ "โฆษณา" เหมือนหน้าจอ
 */
import type { ExportColumn, ExportRow } from '@/lib/order-export'
import type { AdReport } from '@/services/ad-sales-report.service'

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
  const rows: ExportRow[] = report.rows.map((r) => ({
    ad: r.adTitle ?? r.adId,
    chats: r.chats,
    orders: r.orders,
    rate: r.closeRatePct === null ? '—' : `${r.closeRatePct}%`,
    sales: r.sales,
    avg: r.avgPerOrder,
    lost: r.cancelledOrReturned,
  }))
  const s = report.summary
  rows.push(
    { ad: 'รวมจากโฆษณา', orders: s.adOrders, sales: s.adSales },
    { ad: 'ไม่ได้มาจากโฆษณา', orders: s.nonAdOrders, sales: s.nonAdSales },
  )
  return { columns, rows }
}
