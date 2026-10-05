/**
 * line-report-summary.test.ts — unit (mock SSOT) ของ buildGroupSummary (00068 · AC-14-2/14-7 · 15-2/15-3 · 16-4/16-6/16-7)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/services/dashboard.service', () => ({ getSalesSeries: vi.fn() }))
vi.mock('@/services/pnl.service', () => ({ getPnlReport: vi.fn() }))
vi.mock('@/services/product-sales-series.service', () => ({ getProductSalesMonth: vi.fn() }))
vi.mock('@/services/expense.service', () => ({ listExpenses: vi.fn(async () => []) }))
vi.mock('@/services/cancelled-order-count.service', () => ({ countCancelledOrders: vi.fn(async () => 2) }))

import { getSalesSeries } from '@/services/dashboard.service'
import { getPnlReport } from '@/services/pnl.service'
import { getProductSalesMonth } from '@/services/product-sales-series.service'
import { countCancelledOrders } from '@/services/cancelled-order-count.service'
import { buildGroupSummary, buildCycleCumulative, createSweepCache } from '../line-report-summary.service'

const series = vi.mocked(getSalesSeries)
const pnl = vi.mocked(getPnlReport)
const top = vi.mocked(getProductSalesMonth)
const cancelled = vi.mocked(countCancelledOrders)

const mk = (id: string, name: string, vertical: string | null = 'ONLINE_SALES') => ({ id, name, vertical })
const win = { startIso: '2026-10-05', endIso: '2026-10-05', computedAt: '2026-10-05T10:00:00.000Z' }
const all = { showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: true }
const day = (v: number, d = 5) => Array.from({ length: 31 }, (_, i) => (i + 1 === d ? v : 0))
const fakeSeries = (n: number, c: number, u: number) =>
  ({ orderCounts: day(n), confirmedValues: day(c), unconfirmedValues: day(u) }) as never
const sparse = (qty: number, amount: number) => ({ qty: [[4, qty]], amount: [[4, amount]] })

beforeEach(() => {
  vi.clearAllMocks()
  series.mockImplementation(async () => fakeSeries(3, 300, 50))
  pnl.mockResolvedValue({ netProfit: 120, hasMissingCost: false } as never)
  top.mockResolvedValue({ rows: [{ key: 'p1', name: 'A', isCustom: false, ...sparse(2, 20) }] } as never)
})

describe('buildGroupSummary', () => {
  it('showProfit=false -> ไม่เรียก getPnlReport เลย', async () => {
    const s = await buildGroupSummary({ shops: [mk('a', 'ก')], excluded: [], window: win, flags: { ...all, showProfit: false }, cache: createSweepCache() })
    expect(pnl).not.toHaveBeenCalled()
    expect(s.shops[0].profit).toBeUndefined()
  })

  it('showProfit=true: ส่ง vertical ของร้าน + ป้ายเพดานเมื่อไม่มีค่าใช้จ่าย (capped)', async () => {
    const s = await buildGroupSummary({ shops: [mk('a', 'ก', 'SERVICE_QUEUE')], excluded: [], window: win, flags: all, cache: createSweepCache() })
    expect(pnl.mock.calls[0][2]).toBe('SERVICE_QUEUE')
    expect(series.mock.calls[0][4]).toBe('SERVICE_QUEUE')
    expect(s.shops[0].profit).toEqual({ netProfit: 120, capped: true })
  })

  it('LODGING ไม่มี top3 และไม่เรียก getProductSalesMonth', async () => {
    const s = await buildGroupSummary({ shops: [mk('l', 'บ้านพัก', 'LODGING')], excluded: [], window: win, flags: all, cache: createSweepCache() })
    expect(s.shops[0].top3).toBeUndefined()
    expect(top).not.toHaveBeenCalled()
  })

  it('ร้านที่ throw -> ERROR ไม่นับยอดรวม (ไม่ใช่ 0 ในยอดรวม) · ร้านอื่นยังได้ตัวเลข', async () => {
    series.mockImplementation(async (id) => {
      if (id === 'bad') throw new Error('boom')
      return fakeSeries(3, 300, 50)
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const s = await buildGroupSummary({ shops: [mk('ok', 'ก'), mk('bad', 'ข')], excluded: [], window: win, flags: all, cache: createSweepCache() })
    expect(s.shops.map((x) => x.state)).toEqual(['OK', 'ERROR'])
    expect(s.total).toEqual({ orders: 3, confirmed: 300, unconfirmed: 50, cancelled: 2 })
  })

  it('ทุกร้านล้ม -> ทุกแถว ERROR (ผู้เรียกตัดสิน ALL_SHOPS_FAILED)', async () => {
    series.mockRejectedValue(new Error('x'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const s = await buildGroupSummary({ shops: [mk('a', 'ก'), mk('b', 'ข')], excluded: [], window: win, flags: all, cache: createSweepCache() })
    expect(s.shops.every((x) => x.state === 'ERROR')).toBe(true)
    expect(s.total).toEqual({ orders: 0, confirmed: 0, unconfirmed: 0, cancelled: 0 })
  })

  it('cache: ร้านเดียว/ช่วงเดียวกัน เรียกซ้ำสองรอบ -> SSOT ถูกเรียกครั้งเดียวต่อ key', async () => {
    const cache = createSweepCache()
    const input = { shops: [mk('a', 'ก')], excluded: [], window: win, flags: all, cache }
    await buildGroupSummary(input)
    await buildGroupSummary(input)
    expect(series).toHaveBeenCalledTimes(1)
    expect(top).toHaveBeenCalledTimes(1)
    expect(cancelled).toHaveBeenCalledTimes(1)
    expect(pnl).toHaveBeenCalledTimes(1)
  })

  it('ช่วงคร่อมเดือน: เรียก series/top3 ต่อเดือน (2 ครั้ง) และรวมเฉพาะวันในช่วง', async () => {
    const w = { ...win, startIso: '2026-09-30', endIso: '2026-10-01' }
    series.mockImplementation(async (_i, _m, p) => ({
      orderCounts: day(1, (p as { month: number }).month === 9 ? 30 : 1),
      confirmedValues: day(10, (p as { month: number }).month === 9 ? 30 : 1),
      unconfirmedValues: day(0),
    }) as never)
    const s = await buildGroupSummary({ shops: [mk('a', 'ก')], excluded: [], window: w, flags: { ...all, showProfit: false }, cache: createSweepCache() })
    expect(series).toHaveBeenCalledTimes(2)
    expect(s.shops[0].orders).toBe(2)
    expect(s.shops[0].confirmed).toBe(20)
  })

  it('Top 3 ต่อร้าน: ชื่อซ้ำข้ามร้านไม่รวมกัน · ตัด isCustom · ตัดแถวที่ไม่ขายในช่วง', async () => {
    top.mockImplementation(async () => ({
      rows: [
        { key: 'p1', name: 'เสื้อ', isCustom: false, ...sparse(2, 20) },
        { key: '__custom__', name: 'พิมพ์เอง', isCustom: true, ...sparse(9, 90) },
        { key: 'p2', name: 'เก่า', isCustom: false, qty: [[0, 5]], amount: [[0, 50]] }, // วันที่ 1 ไม่อยู่ในช่วง
      ],
    }) as never)
    const s = await buildGroupSummary({ shops: [mk('a', 'ก'), mk('b', 'ข')], excluded: [], window: win, flags: all, cache: createSweepCache() })
    for (const x of s.shops) expect(x.top3).toEqual([{ name: 'เสื้อ', qty: 2, amount: 20 }])
  })

  it('top3Truncated: เดือนใดเดือนหนึ่ง truncated -> ตั้งธง · ไม่ truncated -> ไม่ตั้ง', async () => {
    const w = { ...win, startIso: '2026-09-30', endIso: '2026-10-01' }
    top.mockImplementation(async (_i, _y, m0) => ({ rows: [], truncated: m0 === 9 }) as never)
    const s = await buildGroupSummary({ shops: [mk('a', 'ก')], excluded: [], window: w, flags: all, cache: createSweepCache() })
    expect(s.shops[0].top3Truncated).toBe(true)
    top.mockResolvedValue({ rows: [], truncated: false } as never)
    const s2 = await buildGroupSummary({ shops: [mk('b', 'ข')], excluded: [], window: w, flags: all, cache: createSweepCache() })
    expect(s2.shops[0].top3Truncated).toBeUndefined()
  })

  it('กำไร: ผสมบริการ/อื่น -> profitSummable=false, mixed=true · เรียงร้านยอดขาย↓ · excluded ต่อท้าย · ร้านเดียวไม่มี total', async () => {
    series.mockImplementation(async (id) => fakeSeries(1, id === 'a' ? 100 : 500, 0))
    const s = await buildGroupSummary({
      shops: [mk('a', 'ก'), mk('b', 'ข', 'SERVICE_QUEUE')],
      excluded: [{ shop: mk('x', 'ล็อก'), reason: 'LOCKED' }],
      window: win, flags: all, cache: createSweepCache(),
    })
    expect(s.profitSummable).toBe(false)
    expect(s.mixedFinanceRules).toBe(true)
    expect(s.shops.map((x) => x.shop.id)).toEqual(['b', 'a', 'x'])
    expect(s.shops[2]).toMatchObject({ state: 'EXCLUDED', excludedReason: 'LOCKED' })
    const one = await buildGroupSummary({ shops: [mk('a', 'ก')], excluded: [], window: win, flags: all, cache: createSweepCache() })
    expect(one.total).toBeUndefined()
  })

  it('ยอดรวม = ผลบวกรายร้านพอดี', async () => {
    series.mockImplementation(async (id) => fakeSeries(id === 'a' ? 2 : 5, id === 'a' ? 100 : 250, id === 'a' ? 7 : 1))
    const s = await buildGroupSummary({ shops: [mk('a', 'ก'), mk('b', 'ข')], excluded: [], window: win, flags: all, cache: createSweepCache() })
    expect(s.total).toEqual({ orders: 7, confirmed: 350, unconfirmed: 8, cancelled: 4 })
  })
})

describe('buildCycleCumulative', () => {
  it('ไม่เรียก pnl/top3 · นับร้านที่ล้ม', async () => {
    series.mockImplementation(async (id) => {
      if (id === 'bad') throw new Error('x')
      return fakeSeries(3, 300, 50)
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await buildCycleCumulative({ shops: [mk('a', 'ก'), mk('bad', 'ข')], window: win, cache: createSweepCache() })
    expect(r).toEqual({ totals: { orders: 3, confirmed: 300, unconfirmed: 50, cancelled: 2 }, failedShops: 1 })
    expect(pnl).not.toHaveBeenCalled()
    expect(top).not.toHaveBeenCalled()
  })
})

describe('AC-14-1 สแกนซอร์ส', () => {
  it('ไม่มีสูตรยอดขาย/กำไรของตัวเอง', () => {
    const src = readFileSync(join(__dirname, '../line-report-summary.service.ts'), 'utf8')
    expect(src).not.toMatch(/revenueOrderWhere|totalAmount|\bcost\b/)
    expect(src).toMatch(/=\s*await getSalesSeries\(/)
    expect(src).toMatch(/=\s*await getPnlReport\(/)
  })
})
