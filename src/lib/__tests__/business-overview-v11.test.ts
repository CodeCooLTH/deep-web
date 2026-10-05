// 00069 v1.1 — TC-009 (แทนที่) · TC-012 · TC-014
import { describe, it, expect } from 'vitest'
import { periodRange, aggregateSalesSeries, buildStack, buildPortfolio, OTHERS_KEY, type AdditiveSalesSeries, type ComparisonRow } from '../business-overview'

const s = (o: Partial<AdditiveSalesSeries> & { values: number[] }): AdditiveSalesSeries => ({
  labels: o.values.map((_, i) => String(i + 1)),
  confirmedValues: o.values.map(() => 0),
  unconfirmedValues: o.values.map(() => 0),
  orderCounts: o.values.map(() => 1),
  codPendingValues: o.values.map(() => 0),
  total: o.values.reduce((a, b) => a + b, 0),
  prevTotal: 0,
  prevTotalToDate: 0,
  futureFromIndex: 2,
  ...o,
})

describe('periodRange (TC-012)', () => {
  it('รายวัน = ทั้งเดือน · ก.พ. ปีอธิกสุรทิน', () => {
    expect(periodRange('daily', 2028, 2)).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    expect(periodRange('daily', 2026, 2)).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(periodRange('daily', 2026, 12)).toEqual({ start: '2026-12-01', end: '2026-12-31' })
  })
  it('รายเดือน = ทั้งปี', () => expect(periodRange('monthly', 2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' }))
})

describe('aggregateSalesSeries (TC-009)', () => {
  it('บวกตาม index ทุกฟิลด์ · labels/futureFromIndex จากตัวแรก', () => {
    const r = aggregateSalesSeries([
      s({ values: [1, 2, 3], confirmedValues: [1, 0, 0], unconfirmedValues: [0, 2, 0], codPendingValues: [0, 0, 3], prevTotal: 5, prevTotalToDate: 4 }),
      s({ values: [10, 20, 30], confirmedValues: [10, 0, 0], unconfirmedValues: [0, 20, 0], codPendingValues: [0, 0, 30], prevTotal: 1, prevTotalToDate: 1 }),
    ])!
    expect(r.values).toEqual([11, 22, 33])
    expect(r.confirmedValues).toEqual([11, 0, 0])
    expect(r.unconfirmedValues).toEqual([0, 22, 0])
    expect(r.codPendingValues).toEqual([0, 0, 33])
    expect(r.orderCounts).toEqual([2, 2, 2])
    expect(r.total).toBe(66)
    expect(r.prevTotal).toBe(6)
    expect(r.prevTotalToDate).toBe(5)
    expect(r.futureFromIndex).toBe(2)
    expect(r.labels).toEqual(['1', '2', '3'])
  })
  it('last14 รวมเมื่อมี · ไม่มี = ไม่ใส่', () => {
    const l = Array.from({ length: 14 }, (_, i) => String(i))
    const one = Array(14).fill(1)
    const r = aggregateSalesSeries([s({ values: [1], last14Labels: l, last14Confirmed: one, last14Unconfirmed: one }), s({ values: [1], last14Labels: l, last14Confirmed: one, last14Unconfirmed: one })])!
    expect(r.last14Confirmed).toEqual(Array(14).fill(2))
    expect(r.last14Unconfirmed).toEqual(Array(14).fill(2))
    expect(aggregateSalesSeries([s({ values: [1] })])!.last14Labels).toBeUndefined()
  })
  it('ว่าง → null', () => expect(aggregateSalesSeries([])).toBeNull())
})

describe('buildStack', () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, name: `ร้าน${i}`, total: 100 - i, values: [100 - i, 1] }))
  it('≤5 ร้าน → ครบทุกร้าน เรียงยอด', () => {
    const r = buildStack(mk(5))
    expect(r.map((x) => x.key)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4'])
  })
  it('เกิน 5 → 4 ร้านสูงสุด + อื่น ๆ ที่รวมยอดถูก', () => {
    const r = buildStack(mk(7))
    expect(r).toHaveLength(5)
    expect(r[4].key).toBe(OTHERS_KEY)
    expect(r[4].values).toEqual([96 + 95 + 94, 3])
  })
})

describe('buildPortfolio (TC-014)', () => {
  const row = (o: Partial<Omit<ComparisonRow, 'sharePct'>>): Omit<ComparisonRow, 'sharePct'> => ({
    shopId: 'x', shopName: 'x', logoUrl: null, vertical: 'ONLINE_SALES', isPersonal: false, status: 'OK',
    sales: 0, netProfit: 0, marginPct: null, missingCost: false, missingExpense: false, href: '', ...o,
  })
  it('Personal ไม่นับยอดรวม · อยู่ท้าย · sharePct null · share รวม = 100', () => {
    const { totals, rows } = buildPortfolio([
      row({ shopId: 'p', shopName: 'ก', isPersonal: true, sales: 9999, netProfit: 9999 }),
      row({ shopId: 'a', shopName: 'ข', sales: 300, netProfit: 30 }),
      row({ shopId: 'b', shopName: 'ค', sales: 700, netProfit: 70 }),
    ])
    expect(totals.sales).toBe(1000)
    expect(totals.netProfit).toBe(100)
    expect(rows.map((r) => r.shopId)).toEqual(['b', 'a', 'p'])
    expect(rows[2].sharePct).toBeNull()
    expect(rows[0].sharePct! + rows[1].sharePct!).toBeCloseTo(100, 2)
  })
  it('ERROR ไม่นับ + incomplete · ยอดรวม 0 → sharePct null', () => {
    const { totals, rows } = buildPortfolio([row({ shopId: 'a', status: 'ERROR', sales: 50 }), row({ shopId: 'b' })])
    expect(totals.sales).toBe(0)
    expect(totals.incomplete).toBe(true)
    expect(rows.every((r) => r.sharePct === null)).toBe(true)
  })
  it('Personal ข้อมูลไม่ครบ ไม่ทำให้ยอดรวมติดป้าย · ผสมประเภทร้าน = mixed', () => {
    const { totals } = buildPortfolio([
      row({ shopId: 'p', isPersonal: true, missingExpense: true, vertical: 'SERVICE_QUEUE' }),
      row({ shopId: 'a', vertical: 'ONLINE_SALES' }),
    ])
    expect(totals.incomplete).toBe(false)
    expect(totals.mixedFinanceRules).toBe(false)
    expect(buildPortfolio([row({ vertical: 'SERVICE_QUEUE' }), row({ shopId: 'b' })]).totals.mixedFinanceRules).toBe(true)
  })
})
