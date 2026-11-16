import { describe, expect, it } from 'vitest'
import { allocateSpend, profitMetrics, profitStatus, sumParts, type ProfitParts } from './ads-profit'

// ตัวอย่าง Video A จากบรีฟ (PRD §8) — fixture ความถูกต้องทางการเงิน
const videoA: ProfitParts = { orders: 10, revenue: 5000, cogs: 2700, variable: 400, incomplete: 0 }

describe('profitMetrics — Video A', () => {
  const m = profitMetrics(1200, videoA)
  it('กำไรก่อน/หลังค่าโฆษณา', () => {
    expect(m.profitBefore).toBe(1900)
    expect(m.profitAfter).toBe(700)
  })
  it('ต่อใบ · ROAS · อัตรากำไร · ยอดเฉลี่ย', () => {
    expect(m.costPerOrder).toBe(120)
    expect(m.profitPerOrder).toBe(70)
    expect(m.roas).toBe(4.17)
    expect(m.margin).toBe(14)
    expect(m.aov).toBe(500)
  })
  it('สถานะ = กำไร', () => expect(profitStatus(1200, videoA, m)).toBe('PROFIT'))
})

describe('โฆษณาใช้เงินแต่ไม่มีคำสั่งซื้อ', () => {
  const none: ProfitParts = { orders: 0, revenue: 0, cogs: 0, variable: 0, incomplete: 0 }
  const m = profitMetrics(500, none)
  it('0 ใบ · กำไร = −ค่าโฆษณา · ตัวหาร 0 เป็น null', () => {
    expect(m.profitAfter).toBe(-500)
    expect(m.costPerOrder).toBeNull()
    expect(m.profitPerOrder).toBeNull()
    expect(m.aov).toBeNull()
    expect(m.margin).toBeNull()
    expect(m.roas).toBe(0)
  })
  it('ใช้เงินถึงเกณฑ์ = ขาดทุน (ไม่ใช่ข้อมูลไม่พอ)', () => expect(profitStatus(500, none, m)).toBe('LOSS'))
  it('ใช้เงินน้อย ไม่มีใบ = ข้อมูลไม่พอ', () => expect(profitStatus(50, none, profitMetrics(50, none))).toBe('LOW_DATA'))
})

describe('สถานะอื่น', () => {
  it('ต้นทุนไม่ครบ ชนะทุกสถานะ (ไม่นับเป็นกำไร 0)', () => {
    const p = { ...videoA, incomplete: 2 }
    expect(profitStatus(1200, p, profitMetrics(1200, p))).toBe('INCOMPLETE')
  })
  it('ไม่ทราบค่าโฆษณา = กำไรหลังค่าโฆษณา null', () => {
    const m = profitMetrics(null, videoA)
    expect(m.profitAfter).toBeNull()
    expect(m.roas).toBeNull()
    expect(profitStatus(null, videoA, m)).toBe('NO_SPEND')
  })
  it('เท่าทุน: |กำไร| ≤ 2% ของค่าโฆษณา', () => {
    const p = { ...videoA, cogs: 2700 + 690 } // กำไรหลัง = 10 ≤ 24
    expect(profitStatus(1200, p, profitMetrics(1200, p))).toBe('BREAKEVEN')
  })
  it('ขาดทุน', () => {
    const p = { ...videoA, cogs: 4000 }
    expect(profitStatus(1200, p, profitMetrics(1200, p))).toBe('LOSS')
  })
})

describe('allocateSpend — ผลรวม = ค่าโฆษณาจริง', () => {
  it('หารลงตัว', () => expect(allocateSpend(1200, 10)).toEqual(Array(10).fill(120)))
  it('หารไม่ลงตัว ใบสุดท้ายรับเศษ', () => {
    const a = allocateSpend(100, 3)
    expect(a).toEqual([33.33, 33.33, 33.34])
    expect(Math.round(a.reduce((s, v) => s + v, 0) * 100) / 100).toBe(100)
  })
  it('0 ใบ ไม่จัดสรร', () => expect(allocateSpend(500, 0)).toEqual([]))
})

it('sumParts รวมทุกช่อง', () => {
  expect(sumParts([videoA, { orders: 1, revenue: 10, cogs: 1, variable: 2, incomplete: 1 }])).toEqual({ orders: 11, revenue: 5010, cogs: 2701, variable: 402, incomplete: 1 })
})
