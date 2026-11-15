import { describe, expect, it } from 'vitest'
import { buildFunnel } from '../funnel'
import { buildKpi, type Totals } from '../formulas'

const T = (o: Partial<Totals> = {}): Totals => ({ spend: 1000, coveredSales: 5000, coveredOrders: 10, sales: 6000, orders: 10, chats: 100, impressions: 100000, clicks: 2000, reach: 50000, chatsMeta: 200, ...o })
const run = (cur: Partial<Totals>, prev: Partial<Totals> = {}, clicks = { cur: 2000 as number | null, prev: 2000 as number | null }) => buildFunnel(buildKpi({ cur: T(cur), prev: T(prev) }), clicks)

describe('buildFunnel', () => {
  it('ห้าขั้น ที่มาและ crossSource ที่ index 2', () => {
    const f = run({})
    expect(f.steps.map((s) => s.key)).toEqual(['impressions', 'clicks', 'chatsMeta', 'chats', 'orders'])
    expect(f.steps.map((s) => s.source)).toEqual(['META', 'META', 'META', 'SHOP', 'SHOP'])
    expect(f.rates.map((r) => r.crossSource)).toEqual([false, false, true, false])
    expect(f.rates[0].cur).toBe(2); expect(f.rates[3].cur).toBe(10)
  })
  it('ขั้น null ไม่ข้าม: ทั้งสองอัตราที่แตะขั้นนั้นเป็น null', () => {
    const f = run({ chatsMeta: null })
    expect(f.rates[1].cur).toBeNull(); expect(f.rates[2].cur).toBeNull(); expect(f.rates[3].cur).toBe(10)
  })
  it('worst = ขั้นที่ลดมากสุด ≤ -15%', () => {
    // closeRate (rate 3): prev 10% → cur 5% = -50% · rate 0: ลด -20%
    const f = run({ orders: 5, clicks: 1600 } as Partial<Totals>, {}, { cur: 1600, prev: 2000 })
    expect(f.worst).toBe(3)
  })
  it('ไม่ถึง -15% → null', () => { expect(run({}).worst).toBeNull(); expect(run({ orders: 9 }).worst).toBeNull() })
  it('ตัวหารต่ำกว่า 20 ในช่วงใดช่วงหนึ่ง → ไม่ถูกชี้ (ขอบ 19 / 20)', () => {
    // ย่อทุกขั้นช่วงนี้เป็นสัดส่วนเดียวกัน เหลือเฉพาะอัตราปิดการขาย (ขั้น 3) ที่ลดจริง
    const at = (f: number) => run({ impressions: 100000 * f, clicks: 2000 * f, chatsMeta: 200 * f, chats: 100 * f, orders: 1 }, {}, { cur: 2000 * f, prev: 2000 })
    expect(at(0.19).worst).toBeNull()
    expect(at(0.2).worst).toBe(3)
  })
})
