import { describe, expect, it } from 'vitest'
import { profitMetrics, profitStatus, type ProfitParts } from './ads-profit'
import { buildProfitInsights, type InsightRow } from './ads-profit-insights'

const row = (adId: string, spend: number | null, p: Partial<ProfitParts>, extra: Partial<InsightRow> = {}): InsightRow => {
  const parts: ProfitParts = { orders: 0, revenue: 0, cogs: 0, variable: 0, incomplete: 0, ...p }
  const metrics = profitMetrics(spend, parts)
  return { adId, spend, parts, metrics, status: profitStatus(spend, parts, metrics), cancelled: 0, returned: 0, objective: null, ...extra }
}

describe('buildProfitInsights', () => {
  it('ขาดทุน (ใช้เงินไม่มีใบ) มาก่อน ความมั่นใจสูง', () => {
    const r = buildProfitInsights([row('A', 800, {}), row('B', 500, { orders: 10, revenue: 5000, cogs: 2000 })])
    expect(r[0]).toMatchObject({ kind: 'LOSS', adId: 'A', priority: 1, value: -800, confidence: 'HIGH' })
  })
  it('ROAS สูงแต่ขาดทุน แยกเป็นข้อ ROAS_BUT_LOSS', () => {
    const r = buildProfitInsights([row('A', 1000, { orders: 10, revenue: 3000, cogs: 2500 })])
    expect(r[0]).toMatchObject({ kind: 'ROAS_BUT_LOSS', value: 3 })
  })
  it('ต้นทุนต่อใบสูง ≥ 1.5 เท่าค่าเฉลี่ย', () => {
    const r = buildProfitInsights([
      row('A', 1000, { orders: 5, revenue: 10000, cogs: 2000 }), // 200/ใบ
      row('B', 1000, { orders: 20, revenue: 20000, cogs: 4000 }), // 50/ใบ · เฉลี่ย 80
    ])
    expect(r.find((i) => i.kind === 'HIGH_CPO')).toMatchObject({ adId: 'A', value: 200, baseline: 80 })
  })
  it('กำไรสม่ำเสมอ: กำไร > 0 · อัตรากำไร ≥ 15% · ≥ 5 ใบ', () => {
    const r = buildProfitInsights([row('A', 500, { orders: 10, revenue: 10000, cogs: 5000 })])
    expect(r).toEqual([expect.objectContaining({ kind: 'STEADY_PROFIT', adId: 'A', priority: 3 })])
  })
  it('ยกเลิก/ตีกลับสูงกว่าค่าเฉลี่ย', () => {
    const r = buildProfitInsights([
      row('A', 100, { orders: 6, revenue: 600, cogs: 300 }, { cancelled: 4 }),
      row('B', 100, { orders: 30, revenue: 3000, cogs: 1500 }),
    ])
    expect(r.find((i) => i.kind === 'HIGH_LOST')?.adId).toBe('A')
  })
  it('ต้นทุนไม่ครบ / โฆษณาการรับรู้ / ใช้เงินน้อย ไม่ถูกตัดสิน', () => {
    expect(buildProfitInsights([row('A', 800, { orders: 1, revenue: 100, incomplete: 1 })])).toEqual([])
    expect(buildProfitInsights([row('A', 800, {}, { objective: 'OUTCOME_AWARENESS' })])).toEqual([])
    expect(buildProfitInsights([row('A', 100, {})])).toEqual([])
  })
  it('โฆษณาให้ทักแชท (OUTCOME_ENGAGEMENT) ยังถูกตัดสินด้วยกำไร', () => {
    expect(buildProfitInsights([row('A', 800, {}, { objective: 'OUTCOME_ENGAGEMENT' })])[0]?.kind).toBe('LOSS')
  })
})
