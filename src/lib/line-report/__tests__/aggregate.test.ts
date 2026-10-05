import { describe, expect, it } from 'vitest'
import { canSumProfit, combineTotals, isMixedFinanceRules, mergeTop3, sumDays, sumDaysSparse } from '../aggregate'
import type { ShopSummary } from '../types'

const oct = { year: 2026, month0: 9 }
const nov = { year: 2026, month0: 10 }
// series วันที่ 1..31: ค่า = วัน × 10
const series = Array.from({ length: 31 }, (_, i) => (i + 1) * 10)

describe('sumDays — จุดเดียวที่ตัดวัน (ขอบ ±1 ต้องแดง)', () => {
  it('รวมเฉพาะวันในช่วง inclusive ทั้งสองขอบ', () => {
    expect(sumDays(series, oct, '2026-10-06', '2026-10-08')).toBe(60 + 70 + 80)
    expect(sumDays(series, oct, '2026-10-06', '2026-10-06')).toBe(60)
    expect(sumDays(series, oct, '2026-10-31', '2026-10-31')).toBe(310)
    expect(sumDays(series, oct, '2026-10-01', '2026-10-01')).toBe(10)
  })
  it('ช่วงคร่อมเดือน: แต่ละเดือนเอาเฉพาะวันของช่วง ผลรวม = ผลรวมวันตรง ๆ', () => {
    const start = '2026-10-29'
    const end = '2026-11-02'
    const a = sumDays(series, oct, start, end) // 29,30,31
    const b = sumDays(series.slice(0, 30), nov, start, end) // 1,2
    expect(a).toBe(290 + 300 + 310)
    expect(b).toBe(10 + 20)
    expect(a + b).toBe(290 + 300 + 310 + 10 + 20)
  })
  it('ช่วงนอกเดือน = 0 · series สั้นกว่าเดือนไม่พัง', () => {
    expect(sumDays(series, oct, '2026-11-01', '2026-11-30')).toBe(0)
    expect(sumDays([5, 5], oct, '2026-10-01', '2026-10-31')).toBe(10)
  })
  it('sparse [dayIdx0, value]', () => {
    const rows: [number, number][] = [[0, 1], [4, 2], [5, 4], [30, 8]]
    expect(sumDaysSparse(rows, oct, '2026-10-05', '2026-10-06')).toBe(2 + 4)
    expect(sumDaysSparse(rows, oct, '2026-10-01', '2026-10-31')).toBe(15)
    expect(sumDaysSparse(rows, oct, '2026-10-02', '2026-10-04')).toBe(0)
  })
})

const shop = (id: string, vertical: string | null, o: Partial<ShopSummary> = {}): ShopSummary => ({
  shop: { id, name: id, vertical },
  state: 'OK',
  orders: 1,
  confirmed: 100,
  unconfirmed: 10,
  cancelled: 1,
  ...o,
})

describe('combineTotals (TFR-14: ยอดรวม = ผลบวกรายร้านพอดี)', () => {
  it('บวกเฉพาะ OK — ERROR/EXCLUDED ไม่นับ', () => {
    const shops = [shop('a', null), shop('b', null, { orders: 4, confirmed: 400 }), shop('c', null, { state: 'ERROR', orders: 99 }), shop('d', null, { state: 'EXCLUDED', orders: 99 })]
    expect(combineTotals(shops)).toEqual({ orders: 5, confirmed: 500, unconfirmed: 20, cancelled: 2 })
    expect(combineTotals([])).toEqual({ orders: 0, confirmed: 0, unconfirmed: 0, cancelled: 0 })
  })
})

describe('mergeTop3', () => {
  it('รวมข้ามเดือน ตัด isCustom เรียง qty↓ amount↓ ชื่อ', () => {
    const out = mergeTop3([
      { productId: 'p1', name: 'ข', qty: 2, amount: 100 },
      { productId: 'p1', name: 'ข', qty: 3, amount: 150 },
      { productId: 'p2', name: 'ก', qty: 5, amount: 50 },
      { productId: 'p3', name: 'ค', qty: 5, amount: 900 },
      { name: 'ง', qty: 5, amount: 50 },
      { name: 'พิเศษ', qty: 99, amount: 99, isCustom: true },
      { name: 'จ', qty: 1, amount: 1 },
    ])
    expect(out.map((r) => r.name)).toEqual(['ค', 'ข', 'ก'])
    expect(out[1]).toEqual({ name: 'ข', qty: 5, amount: 250 })
  })
  it('ไม่ถึง 3 รายการก็คืนเท่าที่มี', () => expect(mergeTop3([])).toEqual([]))
})

describe('canSumProfit / isMixedFinanceRules', () => {
  const svc = { vertical: 'SERVICE_QUEUE' }
  const sell = { vertical: 'SELLER' }
  it('ร้านเดียว/ว่าง/กติกาเดียวกัน → รวมได้', () => {
    expect(canSumProfit([])).toBe(true)
    expect(canSumProfit([svc])).toBe(true)
    expect(canSumProfit([svc, svc])).toBe(true)
    expect(canSumProfit([sell, { vertical: null }, { vertical: 'LODGING' }])).toBe(true)
  })
  it('ผสมบริการ/อื่น → รวมไม่ได้ (ทั้งสองลำดับ ทุกตำแหน่ง)', () => {
    expect(canSumProfit([svc, sell])).toBe(false)
    expect(canSumProfit([sell, svc])).toBe(false)
    expect(canSumProfit([sell, sell, svc])).toBe(false)
    expect(isMixedFinanceRules([svc, sell])).toBe(true)
    expect(isMixedFinanceRules([sell, sell])).toBe(false)
  })
  // mutation note: เปลี่ยน size > 1 เป็น > 0 → เคส "รวมได้" แดง · เปลี่ยนเป็น some(...) เทียบแค่ร้านแรก → เคส [sell, sell, svc] แดง
})
