import { describe, it, expect } from 'vitest'

import { buildServiceReport, buildServiceToday, compareLabelOf, deltaOf, type ServiceReportData } from '../view-model'

/**
 * [blocker] ตัวคำนวณกลางรายงานร้านบริการ (feature 00078 · FR-001)
 * ค่าอ้างอิง = ข้อมูลจริงร้าน BT Premium - สุขสวัสดิ์ ต.ค. 2569 (prod อ่านอย่างเดียว 2026-10-16 · SQL ใน PRD §8)
 * ยอดขาย 636,900 = ปิดงานแล้ว 248,300 + ยังไม่ปิดงาน 388,600 · ค่าใช้จ่าย 119,949 · กำไร 128,351 · 69 งาน
 */
const OCT: ServiceReportData = {
  mode: 'daily',
  year: 2026,
  month: 10,
  labels: Array.from({ length: 31 }, (_, i) => String(i + 1)),
  closed: [0, 0, 0, 0, 93000, 59000, 54500, 7000, 0, 15500, 19300, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  closedCounts: [0, 0, 2, 0, 6, 4, 3, 1, 0, 3, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  unclosed: [0, 0, 24500, 53500, 12000, 4500, 32000, 0, 0, 7900, 52900, 57900, 71400, 49200, 12900, 9900, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  unclosedCounts: [2, 0, 6, 5, 1, 1, 2, 0, 0, 2, 6, 3, 8, 5, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  cost: Array(31).fill(0),
  expense: [0, 2497, 3146, 1240, 6817, 93823, 2776, 282, 0, 2777, 0, 0, 0, 6394, 197, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  futureFromIndex: 16,
  prevSalesToDate: 57300,
}

describe('[blocker] buildServiceReport — ยอดขาย', () => {
  const m = buildServiceReport(OCT, 'sales')
  it('ตัวเลขรวมตรงข้อมูลจริง', () => {
    expect(m.totals).toEqual({ sales: 636900, closed: 248300, unclosed: 388600, cost: 0, expense: 119949, profit: 128351, jobs: 69 })
    expect(m.hero).toEqual({ label: 'ยอดขาย', value: 636900, tone: 'neutral' })
  })
  it('แถบสมการ = ปิดงานแล้ว + ยังไม่ปิดงาน', () => {
    expect(m.strip.map((c) => [c.label, c.value, c.op ?? '', c.dot])).toEqual([
      ['ปิดงานแล้ว', 248300, '', 'counted'],
      ['ยังไม่ปิดงาน', 388600, '+', 'notCounted'],
    ])
  })
  it('% เทียบ 1–16 ก.ย. (ช่วงเดียวกันถึงวันนี้)', () => {
    expect(m.delta).toEqual({ direction: 'up', pct: 1012, compareLabel: '1–16 ก.ย.' })
  })
  it('ตาราง: ใหม่สุดก่อน · เฉพาะวันที่มีความเคลื่อนไหว · กำไร (งานที่ปิดแล้ว) ติดลบได้', () => {
    expect(m.rows[0].label).toBe('16')
    expect(m.rows.map((r) => r.label)).not.toContain('9')
    const d14 = m.rows.find((r) => r.label === '14')!
    expect(d14).toMatchObject({ jobs: 5, closed: 0, unclosed: 49200, expense: 6394, profit: -6394 })
    expect(m.rows.reduce((s, r) => s + r.closed + r.unclosed, 0)).toBe(636900)
    expect(m.hasCost).toBe(false)
  })
  it('กราฟยอดขาย = เขียว (ปิดงานแล้ว) + เหลือง (ยังไม่ปิดงาน)', () => {
    expect(m.chart.series.map((s) => s.key)).toEqual(['closed', 'unclosed'])
    expect(m.chart.futureFromIndex).toBe(16)
  })
})

describe('[blocker] buildServiceReport — กำไร', () => {
  const m = buildServiceReport(OCT, 'profit')
  it('กำไร = ปิดงานแล้ว − ต้นทุน − ค่าใช้จ่าย · ต้นทุน 0 = ไม่มีช่องต้นทุน', () => {
    expect(m.hero).toEqual({ label: 'กำไร', value: 128351, tone: 'profit' })
    expect(m.strip.map((c) => [c.label, c.op ?? ''])).toEqual([
      ['ปิดงานแล้ว', ''],
      ['ค่าใช้จ่าย', '−'],
    ])
  })
  it('มีต้นทุน → มีช่องต้นทุนอะไหล่ · ติดลบ → "ขาดทุน"', () => {
    const lossy = buildServiceReport({ ...OCT, cost: OCT.cost.map((_, i) => (i === 4 ? 300000 : 0)) }, 'profit')
    expect(lossy.hasCost).toBe(true)
    expect(lossy.strip.map((c) => c.label)).toEqual(['ปิดงานแล้ว', 'ต้นทุนอะไหล่', 'ค่าใช้จ่าย'])
    expect(lossy.hero).toMatchObject({ label: 'ขาดทุน', tone: 'loss' })
    expect(lossy.hero.value).toBe(248300 - 300000 - 119949)
  })
  it('กราฟกำไร = ชุดเดียว ค่าติดลบได้', () => {
    expect(m.chart.series).toHaveLength(1)
    expect(m.chart.series[0].data[13]).toBe(-6394)
  })
})

describe('% และป้ายช่วงที่เทียบ', () => {
  it('ช่วงก่อนเป็น 0 = ไม่แสดง (ไม่โกหก ∞%)', () => {
    expect(deltaOf(100, 0, 'x')).toBeNull()
    expect(buildServiceReport({ ...OCT, prevSalesToDate: 0 }, 'sales').delta).toBeNull()
  })
  it('ป้าย: เดือนอดีต = ชื่อเดือนก่อน · รายเดือนปีปัจจุบัน = ม.ค.–เดือนนี้ ปีก่อน · ปีอดีต = ปี พ.ศ.', () => {
    expect(compareLabelOf({ ...OCT, futureFromIndex: 31 })).toBe('ก.ย.')
    expect(compareLabelOf({ ...OCT, month: 1 })).toBe('1–16 ธ.ค.')
    const monthly = { mode: 'monthly' as const, year: 2026, labels: Array(12).fill('m'), futureFromIndex: 10 }
    expect(compareLabelOf(monthly)).toBe('ม.ค.–ต.ค. 2568')
    expect(compareLabelOf({ ...monthly, futureFromIndex: 12 })).toBe('ปี 2568')
  })
})

describe('การ์ดโหมดวันนี้', () => {
  it('ตัวเลขวันนี้ + เทียบค่าเฉลี่ย 14 วัน', () => {
    const t = buildServiceToday({ ...OCT, last14: { labels: Array(14).fill('d'), closed: Array(14).fill(1000), unclosed: Array(14).fill(0) } }, 'sales')
    expect(t.hero.value).toBe(9900)
    expect(t.delta).toEqual({ direction: 'up', pct: 890, compareLabel: 'ค่าเฉลี่ย 14 วันล่าสุด' })
    expect(t.chart?.series.map((s) => s.key)).toEqual(['closed', 'unclosed'])
  })
})
