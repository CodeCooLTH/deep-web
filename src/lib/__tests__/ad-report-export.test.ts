import { describe, expect, it } from 'vitest'

import { adReportExportTable } from '@/lib/ad-report-export'
import type { AdReport } from '@/services/ad-sales-report.service'

const row = { adId: '1', adTitle: 'แอด A', adPhotoFileId: null, chats: 10, orders: 4, closeRatePct: 40, sales: 2000, avgPerOrder: 500, cancelledOrReturned: 0, spend: 500, noChats: false }
const base = {
  rows: [row],
  summary: { adSales: 2000, nonAdSales: 100, adOrders: 4, nonAdOrders: 1, adSharePct: 95, chats: 10, closeRatePct: 40 },
} as unknown as AdReport
const ads = (state: string) => ({ state, summary: { spend: 500, roas: 4, costPerOrder: 125 } }) as unknown as AdReport['ads']

describe('adReportExportTable', () => {
  it('บัญชีโฆษณาใช้ได้ → มีคอลัมน์ค่าโฆษณา/ต้นทุนต่อใบ/ROAS ทั้งรายแอดและแถวรวม (ตรงกับจอ)', () => {
    const { columns, rows } = adReportExportTable({ ...base, ads: ads('OK') }, 'ออเดอร์')
    expect(columns.map((c) => c.key)).toEqual(['ad', 'chats', 'orders', 'rate', 'sales', 'avg', 'lost', 'spend', 'cpo', 'roas'])
    expect(columns.find((c) => c.key === 'cpo')?.header).toBe('ต้นทุนต่อออเดอร์')
    expect(rows[0]).toMatchObject({ spend: 500, cpo: 125, roas: '4.00' })
    expect(rows[1]).toMatchObject({ ad: 'รวมจากโฆษณา', spend: 500, cpo: 125, roas: '4.00' })
  })

  it('ยังไม่เชื่อมบัญชี → ไม่มีคอลัมน์ค่าโฆษณา', () => {
    const { columns, rows } = adReportExportTable({ ...base, ads: ads('NOT_CONNECTED') }, 'ออเดอร์')
    expect(columns).toHaveLength(7)
    expect(rows[0]).not.toHaveProperty('spend')
  })
})
