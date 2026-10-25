import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const page = readFileSync(join(process.cwd(), 'src/app/(paces)/seller/(dashboard)/sales/page.tsx'), 'utf8')

/** user 2026-10-25: /sales ยอด/การ์ด/ลำดับไม่ตรงชีตมือถือ เพราะหน้านี้คิดยอดเองคนละ query */
describe('[blocker] /sales = เนื้อในตัวเดียวกับชีตมือถือ', () => {
  it('ร้านอื่น: SalesChartSheet layout="page" + ข้อมูลชุดเดียวกับหน้าแรก', () => {
    expect(page).toMatch(/<SalesChartSheet layout="page"/)
    expect(page).toMatch(/getSalesSeries\(shop\.id, 'daily', \{ year, month \}, true, shop\.vertical\)/)
    expect(page).toMatch(/withShippingExpenses\(shop\.id, s, 'daily'/)
  })
  it('ร้านบริการ: ServiceReportPanel ตัวเดียวกับชีตมือถือ', () => {
    expect(page).toMatch(/<ServiceReportPanel /)
  })
  it('หน้านี้ห้ามคิดยอดเอง', () => {
    expect(page).not.toMatch(/getOrdersByShop|countsAsRevenue|getPnlReport/)
  })
})
