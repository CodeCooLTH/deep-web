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

describe('withSampleFinance (EXT-EXP)', () => {
  it('ร้านแรกปกติ · วนครบ 3 สถานะ (ปกติ/ยังไม่มีบันทึก/ติดลบ) · ไม่แตะร้านที่ไม่ OK', async () => {
    const { withSampleFinance } = await import('../preview-sample')
    const ok = (confirmed: number) => ({ state: 'OK', confirmed }) as never
    const out = withSampleFinance({ shops: [ok(500_000), ok(300_000), ok(100_000), { state: 'ERROR' } as never] } as never)
    const f = out.shops.map((s) => s.finance)
    expect(f[0]).toMatchObject({ expenseRecorded: true, expense: 128_400, netSales: 500_000 - 128_400 })
    expect(f[1]).toMatchObject({ expenseRecorded: false, expense: 0 })
    expect(f[2]!.netSales).toBeLessThan(0)
    expect(f[3]).toBeUndefined()
  })
})

describe('withSampleFinance items §17', () => {
  it('Σ items = expense ทุกร้าน · มี ค่าเช่า/ค่าโฆษณา/ค่าบรรจุภัณฑ์/ค่าส่ง', async () => {
    const { withSampleFinance } = await import('../preview-sample')
    const out = withSampleFinance(summary)
    for (const s of out.shops.filter((x) => x.state === 'OK')) {
      expect(s.finance!.items!.reduce((a, i) => a + i.amount, 0)).toBe(s.finance!.expense)
    }
    const labels = out.shops[0].finance!.items!.map((i) => i.label)
    expect(labels).toEqual(expect.arrayContaining(['ค่าเช่า', 'ค่าโฆษณา', 'ค่าบรรจุภัณฑ์', 'ค่าส่งขาไป (จากระบบ)']))
  })
})
