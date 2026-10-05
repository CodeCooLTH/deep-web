import { describe, it, expect } from 'vitest'
import { marginPercent, summarizeOverview, financeHrefFor, sumSeries, buildRangeQs, type OverviewCard } from '../business-overview'

const card = (o: Partial<OverviewCard>): OverviewCard => ({
  shopId: 'x', shopName: 'x', logoUrl: null, vertical: 'ONLINE_SALES', status: 'OK',
  revenue: 0, netProfit: 0, marginPct: null, orderCount: 0, missingCost: false, missingExpense: false, href: '', ...o,
})

describe('marginPercent (TC-006)', () => {
  it('revenue 0 / ติดลบ → null', () => {
    expect(marginPercent(0, 5)).toBeNull()
    expect(marginPercent(-10, 5)).toBeNull()
  })
  it('ขาดทุนไม่ clamp', () => expect(marginPercent(1000, -200)).toBe(-20))
  it('ปัด 2 ตำแหน่ง', () => expect(marginPercent(3, 1)).toBe(33.33))
})

describe('summarizeOverview (TC-004)', () => {
  const a = card({ shopId: 'a', shopName: 'ก', revenue: 100, netProfit: 10, orderCount: 2 })
  const b = card({ shopId: 'b', shopName: 'ข', revenue: 300, netProfit: 50, orderCount: 3, vertical: 'SERVICE_QUEUE' })
  it('รวมยอด + เรียง revenue desc + mixed', () => {
    const r = summarizeOverview([a, b])
    expect(r.totals).toMatchObject({ revenue: 400, netProfit: 60, orderCount: 5, mixedFinanceRules: true })
    expect(r.cards.map((c) => c.shopId)).toEqual(['b', 'a'])
  })
  it('ยอดเท่ากันเรียงชื่อ', () => {
    const r = summarizeOverview([card({ shopId: 'z', shopName: 'ข', revenue: 5 }), card({ shopId: 'y', shopName: 'ก', revenue: 5 })])
    expect(r.cards.map((c) => c.shopId)).toEqual(['y', 'z'])
  })
  it('การ์ด ERROR ไม่นับยอด และ incomplete=true', () => {
    const r = summarizeOverview([a, card({ status: 'ERROR', revenue: 999, netProfit: 999, orderCount: 9 })])
    expect(r.totals).toMatchObject({ revenue: 100, netProfit: 10, orderCount: 2, incomplete: true })
  })
  it('ข้อมูลครบ → incomplete=false · mixed=false', () => {
    expect(summarizeOverview([a]).totals).toMatchObject({ incomplete: false, mixedFinanceRules: false })
  })
  it('missingCost / missingExpense → incomplete', () => {
    expect(summarizeOverview([card({ missingCost: true })]).totals.incomplete).toBe(true)
    expect(summarizeOverview([card({ missingExpense: true })]).totals.incomplete).toBe(true)
  })
})

describe('sumSeries (TC-009)', () => {
  it('รวมตาม index · ไม่มี netProfitValues = 0', () => {
    const r = sumSeries([
      { labels: ['1', '2', '3'], values: [1, 2, 3], netProfitValues: [1, 1, 1] },
      { labels: ['1', '2', '3'], values: [10, 20, 30] },
    ])
    expect(r).toEqual({ labels: ['1', '2', '3'], revenue: [11, 22, 33], netProfit: [1, 1, 1] })
  })
  it('ว่าง → null', () => expect(sumSeries([])).toBeNull())
})

describe('financeHrefFor / buildRangeQs (TC-010)', () => {
  it('ร้านบริการ → /sales?tab=pnl', () => expect(financeHrefFor('SERVICE_QUEUE', 'range=7d')).toBe('/sales?tab=pnl&range=7d'))
  it('ร้านอื่น → /expenses', () => {
    expect(financeHrefFor('ONLINE_SALES', 'range=7d')).toBe('/expenses?range=7d')
    expect(financeHrefFor('LODGING', 'range=month')).toBe('/expenses?range=month')
  })
  it('custom มี start/end · preset มีแค่ range', () => {
    expect(buildRangeQs({ preset: 'custom', custom: ['2026-10-01', '2026-10-05'] })).toBe('range=custom&start=2026-10-01&end=2026-10-05')
    expect(buildRangeQs({ preset: 'month', custom: null })).toBe('range=month')
  })
})
