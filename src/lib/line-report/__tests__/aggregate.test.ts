import { describe, expect, it } from 'vitest'
import { canSumProfit, combineFinance, combineTotals, isMixedFinanceRules, mergeTop3, sumDays, sumDaysSparse, dailyValues, sumTrend } from '../aggregate'
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

describe('dailyValues / sumTrend (EXT-09)', () => {
  const feb = { year: 2028, month0: 1 } // ก.พ. 29 วัน
  it('คืนเฉพาะวันในช่วงตามลำดับ · Σ = sumDays', () => {
    expect(dailyValues(series, oct, '2026-10-29', '2026-11-02')).toEqual([290, 300, 310])
    expect(dailyValues(series, nov, '2026-10-29', '2026-11-02')).toEqual([10, 20])
    expect(dailyValues(series, oct, '2026-10-06', '2026-10-08').reduce((a, b) => a + b, 0)).toBe(sumDays(series, oct, '2026-10-06', '2026-10-08'))
  })
  it('วันที่ series ไม่มีค่า = 0 (ไม่ข้ามจนเลื่อน) · เดือนสั้นไม่ล้นเกินวันสุดท้าย', () => {
    expect(dailyValues([5], oct, '2026-10-01', '2026-10-03')).toEqual([5, 0, 0])
    expect(dailyValues(series, feb, '2028-02-27', '2028-03-03')).toEqual([270, 280, 290])
  })
  const ok = (c: number[], o: number[]) => ({ state: 'OK', trend: { dates: ['a', 'b'], confirmed: c, orders: o } }) as unknown as ShopSummary
  it('sumTrend รวมเฉพาะร้าน OK · ไม่มีร้านที่มี trend = undefined', () => {
    const err = { state: 'ERROR', trend: { dates: ['a', 'b'], confirmed: [999, 999], orders: [9, 9] } } as unknown as ShopSummary
    expect(sumTrend([ok([1, 2], [1, 1]), ok([10, 20], [2, 0]), err])).toEqual({ dates: ['a', 'b'], confirmed: [11, 22], orders: [3, 1] })
    expect(sumTrend([err])).toBeUndefined()
  })
})

describe('EXP: combineFinance', () => {
  const fin = (expense: number, netSales: number, expenseRecorded = true) => ({ expense, netSales, expenseRecorded })
  const sh = (id: string, state: 'OK' | 'ERROR', finance?: ReturnType<typeof fin>) =>
    ({ shop: { id, name: id, vertical: null }, state, orders: 0, confirmed: 0, unconfirmed: 0, cancelled: 0, finance }) as never
  it('รวมเฉพาะ OK + round2 + recorded แบบ ∧', () => {
    const r = combineFinance([sh('a', 'OK', fin(0.1, 10)), sh('b', 'OK', fin(0.2, -3.3, false)), sh('c', 'ERROR', fin(999, 999))])
    expect(r).toEqual({ expense: 0.3, netSales: 6.7, expenseRecorded: false })
  })
  it('ร้าน OK ขาด finance / ไม่มีร้าน OK → undefined (ไม่รวมบางส่วน)', () => {
    expect(combineFinance([sh('a', 'OK', fin(1, 1)), sh('b', 'OK')])).toBeUndefined()
    expect(combineFinance([sh('a', 'ERROR')])).toBeUndefined()
  })
})

describe('ITEMS §17: combineFinance รวมรายการย่อยข้ามร้าน', () => {
  const fin = (items?: { key: string; label: string; amount: number }[]) => ({ expense: 0, netSales: 0, expenseRecorded: true, ...(items ? { items } : {}) })
  const sh = (id: string, finance: ReturnType<typeof fin>) =>
    ({ shop: { id, name: id, vertical: null }, state: 'OK', orders: 0, confirmed: 0, unconfirmed: 0, cancelled: 0, finance }) as never
  it('รวมตาม key + round2 + มาก→น้อย', () => {
    const r = combineFinance([
      sh('a', fin([{ key: 'RENT', label: 'ค่าเช่า', amount: 0.1 }, { key: 'OTHER', label: 'อื่นๆ', amount: 5 }])),
      sh('b', fin([{ key: 'RENT', label: 'ค่าเช่า', amount: 0.2 }])),
    ])
    expect(r!.items).toEqual([{ key: 'OTHER', label: 'อื่นๆ', amount: 5 }, { key: 'RENT', label: 'ค่าเช่า', amount: 0.3 }])
  })
  it('ร้านใดไม่มี items → ไม่มี items ทั้งก้อน (ไม่ประมาณ)', () => {
    expect(combineFinance([sh('a', fin([{ key: 'RENT', label: 'ค่าเช่า', amount: 1 }])), sh('b', fin())])!.items).toBeUndefined()
  })
})
