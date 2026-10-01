import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bucketForChart, MAX_DAILY_BARS, type DayLike } from '@/lib/sales-chart-buckets'

/** [blocker] กราฟช่วงยาว (2026-10-01) — รวมเป็นรายสัปดาห์โดยไม่ทำให้ยอดรวมเพี้ยน */
const day = (i: number): DayLike => ({
  date: `2026-01-${String(i + 1).padStart(2, '0')}`.replace(/-(\d{2})$/, (_m, d) => `-${d}`),
  revenue: i + 1,
  unconfirmedRevenue: 2,
  shippingCost: 0.5,
  received: 1,
})
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ ...day(i), date: `d${i}` }))
const sumOf = (xs: { revenue: number; unconfirmedRevenue: number; shippingCost?: number; received?: number }[]) => ({
  revenue: xs.reduce((s, r) => s + r.revenue, 0),
  unconfirmed: xs.reduce((s, r) => s + r.unconfirmedRevenue, 0),
  shipping: xs.reduce((s, r) => s + (r.shippingCost ?? 0), 0),
  received: xs.reduce((s, r) => s + (r.received ?? 0), 0),
})

describe('[blocker] bucketForChart', () => {
  it('ไม่เกินเพดาน = รายวันเหมือนเดิม (แท่งละวัน)', () => {
    const { weekly, buckets } = bucketForChart(rows(MAX_DAILY_BARS))
    expect(weekly).toBe(false)
    expect(buckets).toHaveLength(MAX_DAILY_BARS)
    expect(buckets[0].start).toBe(buckets[0].end)
  })

  it('เกินเพดาน = รายสัปดาห์ แท่งละ 7 วัน แท่งสุดท้ายสั้นได้', () => {
    const input = rows(100)
    const { weekly, buckets } = bucketForChart(input)
    expect(weekly).toBe(true)
    expect(buckets).toHaveLength(Math.ceil(100 / 7))
    expect(buckets[0]).toMatchObject({ start: 'd0', end: 'd6' })
    expect(buckets.at(-1)).toMatchObject({ start: 'd98', end: 'd99' })
  })

  it('ผลรวมทุกแท่ง = ผลรวมรายวันเสมอ (ไม่มีวันหลุด/นับซ้ำ)', () => {
    for (const n of [1, 7, 62, 63, 100, 366]) {
      const input = rows(n)
      const { buckets } = bucketForChart(input)
      expect(sumOf(buckets), `n=${n}`).toEqual(sumOf(input))
    }
  })
})

describe('[blocker] กราฟใช้กติกาใหม่', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('/sales: กราฟรวมผ่าน bucketForChart และหัวการ์ดบอกว่ารายสัปดาห์', () => {
    const src = read('src/app/(paces)/seller/(dashboard)/sales/components/SalesChart.tsx')
    expect(src).toMatch(/const \{ weekly, buckets \} = bucketForChart\(daily\)/)
    expect(src).toMatch(/weekly \? 'ยอดขายรายสัปดาห์' : 'ยอดขายรายวัน'/)
    expect(src).not.toMatch(/data: daily\.map\(/)
  })
  it('รายงานสินค้า: กราฟสูงขึ้นบนจอ ≥1024', () => {
    const src = read('src/app/(paces)/seller/(dashboard)/reports/products/components/ProductSalesClient.tsx')
    expect(src).toMatch(/height=\{isDesktop \? 320 : 240\}/)
    expect(src).toMatch(/const isDesktop = useMinWidth\(1024\) === true/)
  })
})
