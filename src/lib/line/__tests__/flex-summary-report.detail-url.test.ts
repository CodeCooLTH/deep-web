import { afterEach, describe, expect, it } from 'vitest'
import { buildSummaryReportFlex, rebuildAtLevel, REPORT_MAX_LEVEL, type SummaryReportInput } from '../flex-summary-report'
import { sellerDashboardUrl } from '@/lib/line-report/config'
import { defaultTemplateFromFlags } from '@/lib/line-report/template'
import { canSumProfit, combineTotals, isMixedFinanceRules } from '@/lib/line-report/aggregate'
import type { GroupSummary, ShopSummary } from '@/lib/line-report/types'

const win = { startIso: '2026-10-05', endIso: '2026-10-05', computedAt: '2026-10-05T14:02:00.000Z' }
const shop = (i: number): ShopSummary => ({
  shop: { id: `s${i}`, name: `ร้าน ${i}`, vertical: 'ONLINE_SALES' },
  state: 'OK', orders: 10, confirmed: 1000, unconfirmed: 0, cancelled: 0,
  top3: [{ name: `สินค้า ${i}`, qty: 5, amount: 500 }],
  profit: { netProfit: 100, capped: false },
})
const shops = [shop(1), shop(2)]
const summary: GroupSummary = {
  window: win, shops, total: combineTotals(shops),
  profitSummable: canSumProfit(shops.map((s) => s.shop)),
  mixedFinanceRules: isMixedFinanceRules(shops.map((s) => s.shop)),
}
const flags = { showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: false }
const mk = (o: Partial<SummaryReportInput> = {}) => buildSummaryReportFlex({ summary, kind: 'DAILY', flags, ...o })
const uriOf = (m: ReturnType<typeof mk>[number]) => (m.contents as { footer?: { contents: { action: { uri: string } }[] } }).footer?.contents[0].action.uri

const URL1 = 'https://seller.example.com/r/abc123'
const URL2 = 'https://seller.example.com/r/def456'

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SELLER_URL
})

describe('detailUrl', () => {
  it('ติดทุกระดับตัดทอน 0..4', () => {
    const [m] = mk({ detailUrl: URL1 })
    for (let l = 0; l <= REPORT_MAX_LEVEL; l++) expect(uriOf(rebuildAtLevel(m, l) as never)).toBe(URL1)
  })
  it('DAILY+MONTHLY push เดียว → ใบแรก detailUrl ใบสอง monthlyDetailUrl', () => {
    const [a, b] = mk({ detailUrl: URL1, monthlyDetailUrl: URL2, monthly: summary })
    expect(uriOf(a)).toBe(URL1)
    expect(uriOf(b)).toBe(URL2)
    expect(uriOf(rebuildAtLevel(b, 4) as never)).toBe(URL2)
  })
  it('ไม่ส่ง → sellerDashboardUrl() และไม่ส่ง monthlyDetailUrl ใบสองไม่ได้ detailUrl', () => {
    process.env.NEXT_PUBLIC_SELLER_URL = 'https://seller.example.com'
    const [a, b] = mk({ monthly: summary })
    expect(uriOf(a)).toBe(sellerDashboardUrl())
    expect(uriOf(b)).toBe(sellerDashboardUrl())
    const [c, d] = mk({ detailUrl: URL1, monthly: summary })
    expect(uriOf(c)).toBe(URL1)
    expect(uriOf(d)).toBe(sellerDashboardUrl())
  })
  it('template.button.show=false → ไม่มี footer', () => {
    const t = defaultTemplateFromFlags({ ...flags, attachCycleToDaily: true, monthlyEnabled: true })
    expect(uriOf(mk({ detailUrl: URL1, template: t })[0])).toBe(URL1)
    const [m] = mk({ detailUrl: URL1, template: { ...t, button: { ...t.button, show: false } } })
    expect(uriOf(m)).toBeUndefined()
  })
  it('builder ไม่เติม openExternalBrowser เอง', () => {
    expect(JSON.stringify(mk({ detailUrl: URL1 })[0])).not.toContain('openExternalBrowser')
  })
})
