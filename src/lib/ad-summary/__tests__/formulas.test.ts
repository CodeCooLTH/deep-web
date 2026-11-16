import { describe, expect, it } from 'vitest'
import { TONE, buildKpi, buildProfit, coveredOf, cpaOfRow, cpm, roasOfRow, pctChange, trendOf, type Totals } from '../formulas'

const T = (o: Partial<Totals> = {}): Totals => ({ spend: 1000, coveredSales: 5000, coveredOrders: 10, sales: 6000, orders: 12, chats: 60, impressions: 50000, clicks: 1000, reach: 25000, chatsMeta: 80, ...o })

describe('pctChange (F-10)', () => {
  it('คำนวณ % และปัด 2 ตำแหน่ง', () => { expect(pctChange(150, 100)).toBe(50); expect(pctChange(1, 3)).toBe(-66.67) })
  it('ฐานเป็น 0/ลบ/null หรือ cur null → null', () => {
    expect(pctChange(5, 0)).toBeNull(); expect(pctChange(5, -1)).toBeNull(); expect(pctChange(5, null)).toBeNull(); expect(pctChange(null, 5)).toBeNull()
  })
})

describe('TONE / trendOf', () => {
  it('ค่าโฆษณา = signed (มติ user)', () => { expect(TONE.spend).toBe('signed') })
  it('inverse และ neutral ตาม BR-AIR-02', () => {
    for (const k of ['cpa', 'cpc', 'cpm', 'costPerChatMeta'] as const) expect(TONE[k]).toBe('inverse')
    for (const k of ['impressions', 'reach'] as const) expect(TONE[k]).toBe('signed')
    expect(TONE.frequency).toBe('neutral')
  })
  it('ทิศทาง', () => {
    expect(trendOf({ cur: 120, prev: 100 }, 'signed')).toBe('good')
    expect(trendOf({ cur: 80, prev: 100 }, 'signed')).toBe('bad')
    expect(trendOf({ cur: 120, prev: 100 }, 'inverse')).toBe('bad')
    expect(trendOf({ cur: 80, prev: 100 }, 'inverse')).toBe('good')
    expect(trendOf({ cur: 80, prev: 100 }, 'neutral')).toBe('neutral')
    expect(trendOf({ cur: 80, prev: 0 }, 'signed')).toBeNull()
  })
})

describe('buildKpi', () => {
  it('สูตรตามนิยาม', () => {
    const k = buildKpi({ cur: T(), prev: T({ spend: 500 }) })
    expect(k.roas.cur).toBe(5); expect(k.cpa.cur).toBe(100); expect(k.closeRate.cur).toBe(20); expect(k.aov.cur).toBe(500)
    expect(k.frequency.cur).toBe(2); expect(k.ctr.cur).toBe(2); expect(k.cpc.cur).toBe(1); expect(k.cpm.cur).toBe(20); expect(k.costPerChatMeta.cur).toBe(12.5)
    expect(k.roas.prev).toBe(10)
  })
  it('ตัวหาร 0/null → null ไม่ใช่ 0', () => {
    const k = buildKpi({ cur: T({ spend: null, orders: 0, chats: 0, reach: 0, impressions: null, clicks: null, chatsMeta: 0, coveredOrders: 0 }), prev: T() })
    for (const key of ['roas', 'cpa', 'closeRate', 'aov', 'frequency', 'ctr', 'cpc', 'cpm', 'costPerChatMeta'] as const) expect(k[key].cur).toBeNull()
  })
  it('cpm = spend/impressions*1000', () => { expect(cpm(30, 1000)).toBe(30); expect(cpm(30, 0)).toBeNull() })
})

describe('buildProfit', () => {
  const base = { coveredSales: 10000, cogs: 6000, spend: 1000, missingCostLines: 0, truncated: false, byCampaign: [{ campaignId: 'a', name: 'A', sales: 5000, cogs: 3000, spend: 500 }, { campaignId: 'b', name: 'B', sales: 5000, cogs: null, spend: 500 }] }
  it('คำนวณ F-13..F-16', () => {
    const p = buildProfit(base)
    expect(p.grossProfit).toBe(4000); expect(p.profitAfterAds).toBe(3000); expect(p.grossMargin).toBe(0.4); expect(p.breakEvenRoas).toBe(2.5)
    expect(p.byCampaign[0].profitAfterAds).toBe(1500); expect(p.byCampaign[1].profitAfterAds).toBeNull()
  })
  it('ต้นทุนไม่ครบ/เกินเพดาน/cogs null → null หมด', () => {
    for (const o of [{ missingCostLines: 1 }, { truncated: true }, { cogs: null }]) {
      const p = buildProfit({ ...base, ...o })
      expect([p.grossProfit, p.profitAfterAds, p.grossMargin, p.breakEvenRoas]).toEqual([null, null, null, null])
    }
  })
  it('กำไรขั้นต้น ≤ 0 → breakEvenRoas null', () => {
    const p = buildProfit({ ...base, cogs: 10000 })
    expect(p.grossMargin).toBe(0); expect(p.breakEvenRoas).toBeNull()
  })
  it('spend null → profitAfterAds null', () => { expect(buildProfit({ ...base, spend: null }).profitAfterAds).toBeNull() })
})

describe('coveredOf / roasOfRow / cpaOfRow (HR16 นิยามเดียวกับ KPI)', () => {
  it('spend > 0 → ยอด/ออเดอร์นับเป็น covered · spend 0/null → 0', () => {
    expect(coveredOf(100, 500, 2)).toEqual({ coveredSales: 500, coveredOrders: 2 })
    expect(coveredOf(0, 500, 2)).toEqual({ coveredSales: 0, coveredOrders: 0 })
    expect(coveredOf(null, 500, 2)).toEqual({ coveredSales: 0, coveredOrders: 0 })
  })
  it('ROAS = covered ÷ spend · ต้นทุนต่อออเดอร์ = spend ÷ coveredOrders · หารไม่ได้ → null', () => {
    expect(roasOfRow({ spend: 100, coveredSales: 300, coveredOrders: 3 })).toBe(3)
    expect(cpaOfRow({ spend: 100, coveredSales: 300, coveredOrders: 4 })).toBe(25)
    expect(roasOfRow({ spend: null, coveredSales: 300, coveredOrders: 3 })).toBeNull()
    expect(cpaOfRow({ spend: 100, coveredSales: 0, coveredOrders: 0 })).toBeNull()
  })
})
