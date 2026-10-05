import { describe, expect, it } from 'vitest'
import { buildSampleSummary, sampleCycleTotals, withSampleProfit } from '../preview-sample'
import { buildSummaryReportFlex } from '@/lib/line/flex-summary-report'

const summary = buildSampleSummary({
  shops: [
    { id: 'a', name: 'A', vertical: 'ONLINE_SALES', state: 'OK' },
    { id: 'b', name: 'B', vertical: 'ONLINE_SALES', state: 'OK' },
    { id: 'l', name: 'L', vertical: 'ONLINE_SALES', state: 'LOCKED' },
  ],
  window: { startIso: '2026-10-05', endIso: '2026-10-05' },
  computedAtIso: '2026-10-05T11:00:00.000Z',
})

const ALL = { showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: true }

describe('withSampleProfit', () => {
  it('เติมกำไรให้ร้าน OK เท่านั้น ไม่แก้ต้นฉบับ', () => {
    const p = withSampleProfit(summary)
    expect(p.shops.map((s) => !!s.profit)).toEqual([true, true, false])
    expect(summary.shops.every((s) => !s.profit)).toBe(true)
  })
  it('builder แสดงบรรทัดกำไรเมื่อ showProfit + มี profit · ไม่เปิด = ไม่มีคำว่ากำไร', () => {
    const on = JSON.stringify(buildSummaryReportFlex({ summary: withSampleProfit(summary), kind: 'DAILY', flags: { ...ALL, showProfit: true } }))
    const off = JSON.stringify(buildSummaryReportFlex({ summary, kind: 'DAILY', flags: { ...ALL, showProfit: false } }))
    expect(on).toContain('กำไร')
    expect(off).not.toContain('กำไร')
  })
})

describe('sampleCycleTotals', () => {
  it('ยอดสะสมมากกว่ายอดวันเสมอ', () => {
    const t = sampleCycleTotals(summary)
    expect(t.confirmed).toBeGreaterThan(0)
    expect(t.confirmed).toBeGreaterThan(summary.shops.filter((s) => s.state === 'OK').reduce((n, s) => n + s.confirmed, 0))
  })
})
