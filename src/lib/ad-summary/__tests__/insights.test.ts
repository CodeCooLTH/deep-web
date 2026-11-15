import { describe, expect, it } from 'vitest'
import { buildInsights, type InsightInput } from '../insights'
import { buildKpi, coveredOf, type Totals } from '../formulas'
import type { AdRow, CampaignRow } from '../types'

const T = (o: Partial<Totals> = {}): Totals => ({ spend: 2000, coveredSales: 8000, coveredOrders: 20, sales: 8000, orders: 20, chats: 100, impressions: 100000, clicks: 2000, reach: 50000, chatsMeta: 100, ...o })
const kpi = (cur: Partial<Totals>, prev: Partial<Totals> = {}) => buildKpi({ cur: T(cur), prev: T(prev) })
// ตัวตั้ง ROAS ตามค่าโฆษณา (spend>0) เว้นแต่เทสระบุเอง
const withCov = <T extends { spend: number | null; sales: number; orders: number; coveredSales: number; coveredOrders: number }>(r: T, o: Partial<T>): T => ({ ...r, ...coveredOf(r.spend, r.sales, r.orders), ...o })
const ad = (o: Partial<AdRow> = {}): AdRow => withCov({ adId: 'a1', name: 'A1', photoFileId: null, thumbnailUrl: null, adsetId: null, campaignId: 'c1', status: 'ACTIVE', spend: 1000, sales: 4000, orders: 10, chats: 40, chatsMeta: 40, impressions: 10000, clicks: 200, reach: null, cogs: null, tag: null, tagReason: null, creativeFlags: [], coveredSales: 0, coveredOrders: 0, ...o }, o)
const camp = (o: Partial<CampaignRow> = {}): CampaignRow => withCov({ campaignId: 'c1', name: 'C1', objective: 'MESSAGES', status: 'ACTIVE', adsets: [], prevSpend: null, tag: null, tagReason: null, spend: 1000, sales: 2000, orders: 10, chats: 50, chatsMeta: 50, impressions: 10000, clicks: 100, cogs: null, coveredSales: 0, coveredOrders: 0, ...o }, o)
const input = (o: Partial<InsightInput> = {}): InsightInput => ({ kpi: kpi({}), campaigns: [], ads: [], chatGap: { meta: 100, shop: 100 }, truncated: false, metaOk: true, hourly: false, includesRecent: false, ...o })
const rules = (i: InsightInput) => buildInsights(i).map((x) => x.rule)

describe('R1 ต้นทุนต่อออเดอร์ขึ้น', () => {
  // cpa prev 100 (2000/20) → cur 120 = +20% พอดี
  const k = (cur: Partial<Totals>, prev: Partial<Totals> = {}) => kpi({ coveredOrders: 20, ...cur }, prev)
  it('ผ่านที่ขอบ +20% และออเดอร์ ≥ 5', () => {
    const r = buildInsights(input({ kpi: k({ spend: 2400, orders: 5, coveredOrders: 20 }, { orders: 5 }) }))
    expect(r.map((x) => x.rule)).toContain('R1')
  })
  it('ไม่ผ่านที่ +19.9% / ออเดอร์ 4', () => {
    expect(rules(input({ kpi: k({ spend: 2390 }) }))).not.toContain('R1')
    expect(rules(input({ kpi: k({ spend: 2400, orders: 4 }, { orders: 5 }) }))).not.toContain('R1')
  })
  it('ระบุสาเหตุ: ตัวที่เปลี่ยนมากสุด · ไม่มี → ไม่ระบุ', () => {
    const withCause = buildInsights(input({ kpi: k({ spend: 2400, orders: 12 }) })).find((x) => x.rule === 'R1')!
    expect(withCause.params.cause).toBe('closeRate')
    const none = buildInsights(input({ kpi: k({ coveredOrders: 16 }) })).find((x) => x.rule === 'R1')!
    expect(none.params.cause).toBeUndefined()
  })
  it('includesRecent → MEDIUM สูงสุด · ตัวอย่าง ≥ 2× → HIGH', () => {
    const base = k({ spend: 2400 })
    expect(buildInsights(input({ kpi: base })).find((x) => x.rule === 'R1')!.confidence).toBe('HIGH')
    expect(buildInsights(input({ kpi: base, includesRecent: true })).find((x) => x.rule === 'R1')!.confidence).toBe('MEDIUM')
  })
})

describe('R2 ใช้เงินโตเร็วกว่าผล', () => {
  it('spend +20% ออเดอร์ +9% (<ครึ่ง) ผ่าน · +10% ไม่ผ่าน', () => {
    expect(rules(input({ kpi: kpi({ spend: 2400, orders: 21.8, coveredOrders: 21.8 }) }))).toContain('R2')
    expect(rules(input({ kpi: kpi({ spend: 2400, orders: 22, coveredOrders: 22 }) }))).not.toContain('R2')
  })
  it('ค่าโฆษณาช่วงก่อนต่ำกว่าเกณฑ์ → ไม่ผ่าน · spend +19% ไม่ผ่าน', () => {
    expect(rules(input({ kpi: kpi({ spend: 600, orders: 20 }, { spend: 499 }) }))).not.toContain('R2')
    expect(rules(input({ kpi: kpi({ spend: 2380 }) }))).not.toContain('R2')
  })
})

describe('R3 CTR ลด', () => {
  it('ลด 20% พอดี ผ่าน · 19% ไม่ผ่าน', () => {
    expect(rules(input({ kpi: kpi({ clicks: 1600 }) }))).toContain('R3')
    expect(rules(input({ kpi: kpi({ clicks: 1620 }) }))).not.toContain('R3')
  })
  it('การแสดงผลต่ำกว่า 5000 ไม่ผ่าน', () => {
    expect(rules(input({ kpi: kpi({ impressions: 4999, clicks: 80 }, { impressions: 5000, clicks: 100 }) }))).not.toContain('R3')
    expect(rules(input({ kpi: kpi({ impressions: 5000, clicks: 80 }, { impressions: 5000, clicks: 100 }) }))).toContain('R3')
  })
})

describe('R4 ปิดการขายลด', () => {
  // prev closeRate 20% (20/100)
  it('ลด 25% พอดี (15%) ผ่าน · 24% ไม่ผ่าน', () => {
    expect(rules(input({ kpi: kpi({ orders: 15 }) }))).toContain('R4')
    expect(rules(input({ kpi: kpi({ orders: 15.2 }) }))).not.toContain('R4')
  })
  it('แชท 19 ไม่ผ่าน · ไม่พึ่ง Meta', () => {
    expect(rules(input({ kpi: kpi({ chats: 19, orders: 2 }, { chats: 100 }) }))).not.toContain('R4')
    expect(rules(input({ kpi: kpi({ orders: 15 }), metaOk: false }))).toContain('R4')
  })
})

describe('R5 แคมเปญกินงบ', () => {
  const cs = (a: Partial<CampaignRow>) => [camp(a), camp({ campaignId: 'c2', name: 'C2', spend: 1000, orders: 10 })]
  it('ส่วนแบ่งค่าโฆษณา 50% ออเดอร์ 25% ผ่าน (ครึ่งพอดี)', () => {
    const c = [camp({ spend: 1000, orders: 5 }), camp({ campaignId: 'c2', spend: 1000, orders: 15 })]
    expect(rules(input({ campaigns: c }))).toContain('R5')
  })
  it('ออเดอร์ 26% ไม่ผ่าน · ส่วนแบ่งต่ำกว่า 30% ไม่ผ่าน · thin ไม่ผ่าน', () => {
    expect(rules(input({ campaigns: [camp({ spend: 1000, orders: 5.2 }), camp({ campaignId: 'c2', spend: 1000, orders: 14.8 })] }))).not.toContain('R5')
    expect(rules(input({ kpi: kpi({ spend: 3400 }), campaigns: [camp({ spend: 1000, orders: 0 }), camp({ campaignId: 'c2', spend: 2400, orders: 10 })] }))).not.toContain('R5')
    expect(rules(input({ campaigns: cs({ spend: 400, orders: 0, chats: 50 }).map((c, i) => (i === 0 ? c : { ...c, spend: 400 })) }))).not.toContain('R5')
  })
})

describe('R5 ตัวหารส่วนแบ่ง = ตัวเลขหลัก (รวม unknownCampaign)', () => {
  const two = [camp({ spend: 1000, orders: 3 }), camp({ campaignId: 'c2', spend: 200, orders: 10 })]
  it('ไม่มี unknown: 1000/1200 = 83% ออเดอร์ 3/13 = 23% → ยิง', () => {
    expect(rules(input({ kpi: kpi({ spend: 1200, orders: 13 }), campaigns: two }))).toContain('R5')
  })
  it('unknownCampaign ใช้เงิน 2800 (kpi 4000) → ส่วนแบ่ง c1 = 25% < 30% ไม่ยิง', () => {
    expect(rules(input({ kpi: kpi({ spend: 4000, orders: 13 }), campaigns: two }))).not.toContain('R5')
  })
  it('kpi spend null/0 → ไม่ยิง', () => {
    expect(rules(input({ kpi: kpi({ spend: null }), campaigns: two }))).not.toContain('R5')
    expect(rules(input({ kpi: kpi({ spend: 0 }), campaigns: two }))).not.toContain('R5')
  })
})

describe('R6 โฆษณาน่าทดลองเพิ่มงบ', () => {
  // kpi.roas.cur = 8000/2000 = 4 → ต้อง ≥ 6 ; ad ROAS 6 = 6000/1000
  it('ROAS 1.5× พอดี ผ่าน · ต่ำกว่าไม่ผ่าน', () => {
    expect(rules(input({ ads: [ad({ sales: 6000 })] }))).toContain('R6')
    expect(rules(input({ ads: [ad({ sales: 5990 })] }))).not.toContain('R6')
  })
  it('ออเดอร์ < 5 · ค่าโฆษณา < 500 · สถานะไม่ ACTIVE/null · closeRate > 100 → ข้าม', () => {
    expect(rules(input({ ads: [ad({ sales: 6000, orders: 4 })] }))).not.toContain('R6')
    expect(rules(input({ ads: [ad({ sales: 3000, spend: 499 })] }))).not.toContain('R6')
    expect(rules(input({ ads: [ad({ sales: 6000, status: 'PAUSED' })] }))).not.toContain('R6')
    expect(rules(input({ ads: [ad({ sales: 6000, status: null })] }))).not.toContain('R6')
    expect(rules(input({ ads: [ad({ sales: 6000, orders: 50, chats: 40 })] }))).not.toContain('R6')
  })
})

describe('R7 แชทหายระหว่างทาง', () => {
  it('gapBadge HIGH ผ่าน · ส่วนต่าง < 20% หรือ meta < 20 ไม่ผ่าน', () => {
    expect(rules(input({ chatGap: { meta: 100, shop: 80 } }))).toContain('R7')
    expect(rules(input({ chatGap: { meta: 100, shop: 81 } }))).not.toContain('R7')
    expect(rules(input({ chatGap: { meta: 19, shop: 5 } }))).not.toContain('R7')
    expect(rules(input({ chatGap: { meta: null, shop: 5 } }))).not.toContain('R7')
  })
})

describe('R8 CTR สูง ปิดการขายต่ำ', () => {
  // รวม: ctr 2% closeRate 20% → ad ctr ≥ 2.6 · close ≤ 10
  it('ขอบพอดี ผ่าน · เกินขอบไม่ผ่าน · แชท 19 ไม่ผ่าน', () => {
    expect(rules(input({ ads: [ad({ clicks: 260, orders: 4 })] }))).toContain('R8')
    expect(rules(input({ ads: [ad({ clicks: 259, orders: 4 })] }))).not.toContain('R8')
    expect(rules(input({ ads: [ad({ clicks: 260, orders: 5 })] }))).not.toContain('R8')
    expect(rules(input({ ads: [ad({ clicks: 260, orders: 1, chats: 19 })] }))).not.toContain('R8')
  })
})

describe('ภาพรวมการเลือก', () => {
  it('truncated → []', () => { expect(buildInsights(input({ truncated: true, chatGap: { meta: 100, shop: 10 } }))).toEqual([]) })
  it('hourly ปิด R1–R4 แต่ R7 ยังอยู่', () => {
    const i = input({ hourly: true, kpi: kpi({ spend: 2400, clicks: 1000, orders: 10 }), chatGap: { meta: 100, shop: 10 } })
    expect(rules(i)).toEqual(['R7'])
  })
  it('metaOk=false ปิดกฎที่ใช้ Meta (R1 R2 R3 R5 R6 R7 R8) เหลือ R4', () => {
    const i = input({ metaOk: false, kpi: kpi({ spend: 2400, clicks: 1000, orders: 10 }), chatGap: { meta: 100, shop: 10 }, ads: [ad({ sales: 6000 })], campaigns: [camp({ orders: 1 }), camp({ campaignId: 'c2', orders: 20 })] })
    expect(rules(i)).toEqual(['R4'])
  })
  it('สูงสุด 5 ข้อ เรียง priority HIGH ก่อน แล้ว spendAtStake', () => {
    const ads = Array.from({ length: 6 }, (_, n) => ad({ adId: `x${n}`, sales: 6000, spend: 1000 + n * 100 }))
    const r = buildInsights(input({ ads, kpi: kpi({ spend: 2400, clicks: 1000, orders: 10 }), chatGap: { meta: 100, shop: 10 } }))
    expect(r).toHaveLength(5)
    const pri = r.map((x) => x.priority)
    expect(pri).toEqual([...pri].sort((a, b) => (a === b ? 0 : a === 'HIGH' ? -1 : 1)))
    const med = r.filter((x) => x.priority === 'MEDIUM').map((x) => x.spendAtStake)
    expect(med).toEqual([...med].sort((a, b) => b - a))
  })
})
