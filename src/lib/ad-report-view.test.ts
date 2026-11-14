import { describe, it, expect } from 'vitest'
import { bestCloseRateRow, bestRoasRow, costPerOrder, roas, sortNullLast, pointsDelta, provinceLines, slotLabel, topWithRest } from '@/lib/ad-report-view'

describe('bestCloseRateRow (มติ O1: ≥10 ใบ และ ≤100%)', () => {
  const r = (id: string, orders: number, closeRatePct: number | null) => ({ id, orders, closeRatePct })
  it('ข้ามแอดที่ออเดอร์ < 10 · เกิน 100% · ไม่มีแชท', () => {
    expect(bestCloseRateRow([r('a', 9, 90), r('b', 12, 120), r('c', 20, null)])).toBeNull()
    expect(bestCloseRateRow([r('a', 10, 50), r('b', 30, 80), r('c', 5, 100)])?.id).toBe('b')
  })
  it('ขอบ: 10 ใบพอดีและ 100% พอดีผ่าน · เสมอ → ออเดอร์มากกว่า', () => {
    expect(bestCloseRateRow([r('a', 10, 100)])?.id).toBe('a')
    expect(bestCloseRateRow([r('a', 10, 60), r('b', 15, 60)])?.id).toBe('b')
    expect(bestCloseRateRow([r('a', 10, 100.01)])).toBeNull()
  })
})

describe('provinceLines', () => {
  it('top N + อื่น ๆ + ไม่ระบุ — ผลรวมเท่าเดิม', () => {
    const src = [{ name: 'ก', sales: 50 }, { name: 'ข', sales: 30 }, { name: 'ค', sales: 10 }, { name: null, sales: 7 }, { name: 'ง', sales: 3 }]
    const l = provinceLines(src, 2)
    expect(l.map((x) => x.kind)).toEqual(['province', 'province', 'other', 'unknown'])
    expect(l[2]).toMatchObject({ sales: 13, count: 2 })
    expect(l.reduce((s, x) => s + x.sales, 0)).toBe(100)
  })
  it('ทุกใบไม่มีที่อยู่ → แถวเดียว "ไม่ระบุ" (ห้ามซ่อน)', () => {
    expect(provinceLines([{ name: null, sales: 120 }], 8)).toEqual([{ kind: 'unknown', name: null, sales: 120, count: 0 }])
  })
})

describe('อื่น ๆ', () => {
  it('pointsDelta null เมื่อไม่มีค่า', () => {
    expect(pointsDelta(null, 10)).toBeNull()
    expect(pointsDelta(12.34, 10)).toBe(2.3)
  })
  it('topWithRest', () => {
    expect(topWithRest([{ sales: 1 }], 5).rest).toBeNull()
  })
  it('slotLabel', () => {
    const f = (d: string) => `D:${d}`
    expect(slotLabel('2026-10-01', f)).toBe('D:2026-10-01')
    expect(slotLabel('2026-10-01T09', f)).toBe('09:00')
  })
})

describe('roas / costPerOrder (FR-010)', () => {
  it('spend null/0 → null · spend>0 ยอด 0 → 0', () => {
    expect(roas(1000, null)).toBeNull()
    expect(roas(1000, 0)).toBeNull()
    expect(roas(0, 500)).toBe(0)
    expect(roas(1850, 500)).toBe(3.7)
  })
  it('costPerOrder: orders 0 → null · spend null → null', () => {
    expect(costPerOrder(500, 0)).toBeNull()
    expect(costPerOrder(null, 3)).toBeNull()
    expect(costPerOrder(500, 4)).toBe(125)
  })
})

describe('bestRoasRow (≥10 ใบ และ spend>0 · เสมอ → ออเดอร์มากกว่า)', () => {
  const r = (id: string, orders: number, sales: number, spend: number | null) => ({ id, orders, sales, spend })
  it('ข้ามแอดที่ไม่เข้าเกณฑ์', () => {
    expect(bestRoasRow([r('a', 9, 9000, 100), r('b', 20, 100, null), r('c', 20, 100, 0)])).toBeNull()
  })
  it('เลือก ROAS สูงสุด · เสมอ → orders มากกว่า', () => {
    expect(bestRoasRow([r('a', 10, 1000, 500), r('b', 12, 3000, 500)])?.id).toBe('b')
    expect(bestRoasRow([r('a', 10, 1000, 500), r('b', 15, 1000, 500)])?.id).toBe('b')
  })
})

describe('sortNullLast', () => {
  it('null ท้ายสุดทั้งสองทิศ', () => {
    const rows = [{ v: 2 as number | null }, { v: null }, { v: 5 }]
    expect(sortNullLast(rows, (r) => r.v, true).map((r) => r.v)).toEqual([5, 2, null])
    expect(sortNullLast(rows, (r) => r.v, false).map((r) => r.v)).toEqual([2, 5, null])
  })
})
