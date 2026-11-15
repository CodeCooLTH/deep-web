import { describe, expect, it } from 'vitest'
import { MIN_CHATS, MIN_SPEND, classify, creativeFlags, isThin, objectiveGroup } from '../classify'
import { coveredOf } from '../formulas'
import type { RollUp } from '../types'

const R = (o: Partial<RollUp> = {}): RollUp => {
  const r = { spend: 1000, sales: 4000, orders: 10, coveredSales: 0, coveredOrders: 0, chats: 50, chatsMeta: 60, impressions: 10000, clicks: 200, cogs: null, ...o }
  return { ...r, ...coveredOf(r.spend, r.sales, r.orders), ...o } // covered ตาม spend>0 เว้นแต่ระบุเอง
}
const close = () => 'close' as const

describe('objectiveGroup / isThin', () => {
  it('กลุ่มปิดการขาย', () => {
    for (const o of ['OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'MESSAGES', 'CONVERSIONS', 'LEAD_GENERATION']) expect(objectiveGroup(o)).toBe('close')
    for (const o of ['OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC', null]) expect(objectiveGroup(o)).toBe('other')
  })
  it('thin ที่ขอบพอดี', () => {
    expect(isThin({ spend: MIN_SPEND, chats: MIN_CHATS })).toBe(false)
    expect(isThin({ spend: MIN_SPEND - 1, chats: MIN_CHATS })).toBe(true)
    expect(isThin({ spend: MIN_SPEND, chats: MIN_CHATS - 1 })).toBe(true)
    expect(isThin({ spend: null, chats: 99 })).toBe(true)
  })
})

describe('classify ใช้ ROAS/ต้นทุนต่อออเดอร์แบบ covered (นิยามเดียวกับ KPI)', () => {
  it('ยอดขายของโฆษณาที่ไม่มีค่าโฆษณาไม่พอง ROAS ของแคมเปญ', () => {
    // แคมเปญ 3 มียอด 4000 แต่ 3000 มาจากโฆษณาที่ spend=0 → covered 1000 → ROAS 1 ไม่ใช่ 4
    const rows = [R(), R(), R({ coveredSales: 1000, coveredOrders: 3 })]
    expect(classify(rows, close)[2].tag).toBe('watch')
  })
})

describe('classify', () => {
  const mid = () => [R(), R(), R({ sales: 4000 })]
  it('good / ok / watch / thin', () => {
    // base: ROAS 4, cpo 100 (จากแถวที่ไม่ thin ทั้งหมด)
    const rows = [R({ sales: 4000, orders: 10 }), R({ sales: 4000, orders: 10 }), R({ sales: 8000, orders: 20 }), R({ sales: 4000, orders: 10 }), R({ spend: 100 })]
    const t = classify(rows, close)
    expect(t[2].tag).toBe('good'); expect(t[2].reason).toContain('ROAS'); expect(t[2].reason).not.toMatch(/Deep|แอด/)
    expect(t[0].tag).toBe('ok'); expect(t[4].tag).toBe('thin')
  })
  it('watch: ไม่มีออเดอร์ ค่าโฆษณา ≥ 3× cpo กลาง · ROAS ต่ำ · cpo สูง', () => {
    const rows = [R(), R(), R({ spend: 1500, orders: 0, sales: 0 })]
    expect(classify(rows, close)[2].tag).toBe('watch')
    const rows2 = [R(), R(), R(), R({ sales: 500, orders: 1 })]
    expect(classify(rows2, close)[3].tag).toBe('watch')
  })
  it('ไม่มีออเดอร์แต่ใช้เงินน้อยกว่า 3× cpo กลาง → ไม่ watch ด้วยข้อนี้', () => {
    // base cpo = (1000*2+600)/20+... ใช้ rows ที่ cpo=100 → 3× = 300 ; แถว spend 500 orders 0 ROAS 0 ≤ 0.6× → ยัง watch จาก ROAS
    const rows = [R(), R(), R({ spend: 500, orders: 0, sales: 0 })]
    expect(classify(rows, close)[2].tag).toBe('watch')
  })
  it('กลุ่มอื่นไม่เทียบกัน และไม่ปนกลุ่มปิดการขาย', () => {
    const rows = [R(), R(), R({ sales: 0, orders: 0 }), R()]
    const g = (r: RollUp) => (r === rows[2] ? ('other' as const) : ('close' as const))
    const t = classify(rows, g)
    expect(t[2].tag).toBeNull(); expect(t[0].tag).toBe('ok')
  })
  it('กลุ่มที่แถวผ่านเกณฑ์ < 2 → ไม่จัดกลุ่ม (thin ยังเป็น thin)', () => {
    const t = classify([R(), R({ spend: 10 })], close)
    expect(t[0].tag).toBeNull(); expect(t[1].tag).toBe('thin')
  })
  it('คืนตามลำดับ input', () => { expect(classify(mid(), close)).toHaveLength(3) })
})

describe('creativeFlags', () => {
  const totals = { spend: 4000, orders: 20, ctr: 2, closeRate: 20 }
  const ad = (o = {}) => ({ spend: 1000, orders: 1, chats: 40, impressions: 10000, clicks: 100, ...o })
  it('ใช้เงินมาก ออเดอร์น้อย: spendShare 25% ≥ 2× orderShare 5%', () => { expect(creativeFlags(ad(), totals)).toContain('HIGH_SPEND_LOW_ORDERS') })
  it('ขอบ: spendShare = 2× orderShare พอดี → ติด', () => { expect(creativeFlags(ad({ spend: 1000, orders: 2.5 }), totals)).toContain('HIGH_SPEND_LOW_ORDERS') ; expect(creativeFlags(ad({ spend: 1000, orders: 3 }), totals)).not.toContain('HIGH_SPEND_LOW_ORDERS') })
  it('CTR สูง ปิดการขายต่ำ (R8)', () => {
    // ctr 2.6=1.3× · close 10 = 0.5×
    expect(creativeFlags(ad({ clicks: 260, orders: 4 }), totals)).toContain('HIGH_CTR_LOW_CLOSE')
    expect(creativeFlags(ad({ clicks: 259, orders: 4 }), totals)).not.toContain('HIGH_CTR_LOW_CLOSE')
  })
  it('thin → ไม่ flag', () => { expect(creativeFlags(ad({ spend: 100 }), totals)).toEqual([]) })
})
