import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { anchorIndexes, buildServiceChartOptions } from '../chart-options'
import { chartAriaOf } from '../words'

/** [blocker] กราฟรายงานร้านบริการ + กั้นไม่ให้กระทบร้านอื่น/รายงาน LINE (feature 00078) */
const colors = { counted: 'G', notCounted: 'Y', outflow: 'R', axis: 'A', grid: 'D', marker: 'M' }
const chart = {
  categories: ['1', '2', '3', '4', '5'],
  series: [
    { key: 'closed' as const, name: 'ปิดงานแล้ว', data: [1, 2, 3, 4, 5] },
    { key: 'unclosed' as const, name: 'ยังไม่ปิดงาน', data: [5, 4, 3, 2, 1] },
  ],
  futureFromIndex: 3,
}

describe('[blocker] buildServiceChartOptions', () => {
  it('ยอดขาย: แท่งซ้อน เขียว/เหลือง · ช่องอนาคตเป็น null (แกนยาวเท่าเดือน)', () => {
    const o = buildServiceChartOptions(chart, 'bar', colors, { height: 200 })
    expect(o.chart?.stacked).toBe(true)
    expect(o.colors).toEqual(['G', 'Y'])
    expect((o.series as { data: (number | null)[] }[])[0].data).toEqual([1, 2, 3, null, null])
  })
  it('เส้น: ไม่ซ้อน', () => {
    const o = buildServiceChartOptions(chart, 'line', colors, { height: 200 })
    expect(o.chart?.type).toBe('line')
    expect(o.chart?.stacked).toBe(false)
  })
  it('กำไร: ชุดเดียว · ค่าติดลบเป็นสีค่าใช้จ่าย', () => {
    const o = buildServiceChartOptions({ ...chart, series: [{ key: 'profit', name: 'กำไร', data: [1, -2, 3, 0, 0] }] }, 'bar', colors, { height: 200 })
    expect(o.chart?.stacked).toBe(false)
    expect(o.plotOptions?.bar?.colors?.ranges?.[0]?.color).toBe('R')
  })
  it('แตะแท่ง: เรียก onPick เฉพาะวันที่ถึงแล้ว', () => {
    const onPick = vi.fn()
    const o = buildServiceChartOptions(chart, 'bar', colors, { height: 200, onPick })
    const sel = o.chart?.events?.dataPointSelection as unknown as (e: unknown, c: unknown, cfg: { dataPointIndex: number }) => void
    sel(null, null, { dataPointIndex: 1 })
    sel(null, null, { dataPointIndex: 4 })
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith(1)
  })
  it('ป้ายแกน x: ห่างกัน ≥3 ช่องทุกเดือน/ทุกวันนี้ ("30""31" ไม่ติดกัน) · วันนี้มีป้ายเสมอ', () => {
    for (const count of [28, 29, 30, 31])
      for (let ffi = 1; ffi <= count; ffi++) {
        const a = [...anchorIndexes(count, ffi)].sort((x, y) => x - y)
        for (let i = 1; i < a.length; i++) expect(a[i] - a[i - 1]).toBeGreaterThanOrEqual(3)
        expect(a[0]).toBe(0)
        expect(a[a.length - 1]).toBe(count - 1)
        if (ffi < count && ffi - 1 >= 3 && count - ffi >= 3) expect(a).toContain(ffi - 1)
      }
  })
  it('รายเดือน: ป้ายครบ 12 เดือน (ไม่ใช้หมุดวัน) · เส้นปัจจุบัน = "เดือนนี้"', () => {
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
    const m = { categories: months, series: chart.series.map((x) => ({ ...x, data: Array(12).fill(1) })), futureFromIndex: 10 }
    const o = buildServiceChartOptions(m, 'bar', colors, { height: 200, period: 'monthly' })
    const fmt = (o.xaxis?.labels as { formatter: (v: string) => string }).formatter
    expect(months.map(fmt)).toEqual(months)
    expect((o.annotations?.xaxis?.[0]?.label as { text: string }).text).toBe('เดือนนี้')
    const d = buildServiceChartOptions({ ...chart, categories: Array.from({ length: 31 }, (_, i) => String(i + 1)), series: chart.series.map((x) => ({ ...x, data: Array(31).fill(1) })), futureFromIndex: 17 }, 'bar', colors, { height: 200 })
    expect((d.annotations?.xaxis?.[0]?.label as { text: string }).text).toBe('วันนี้')
    expect((d.xaxis?.labels as { formatter: (v: string) => string }).formatter('2')).toBe('')
  })
  it('คำอ่านกราฟตรงกับกราฟจริง', () => {
    expect(chartAriaOf({ profit: false, period: 'daily', tappable: true })).toBe('กราฟยอดขาย รายวัน แตะวันไหนเพื่อดูบิลของวันนั้น')
    expect(chartAriaOf({ profit: true, period: 'monthly', tappable: false })).toBe('กราฟกำไร รายเดือน')
    expect(chartAriaOf({ profit: false, period: 'last14', tappable: false })).toBe('กราฟยอดขาย 14 วันล่าสุด')
  })
  it('[iOS] type line เสมอ + stackOnlyBar — ชุดเดียวกับกราฟร้านขายของ (type bar + ซีรีส์ column = แท่งลอย/ห้อยใต้แกนบน iPhone)', () => {
    for (const kind of ['bar', 'line'] as const) {
      const o = buildServiceChartOptions(chart, kind, colors, { height: 200 })
      expect(o.chart?.type).toBe('line')
      expect((o.chart as { stackOnlyBar?: boolean }).stackOnlyBar).toBe(true)
      expect(o.chart?.animations?.enabled).toBe(false)
      expect((o.series as { type: string }[]).every((s) => s.type === (kind === 'bar' ? 'column' : 'line'))).toBe(true)
    }
  })
  it('ไม่มีคีย์ที่ค่าเป็น undefined — ApexCharts merge ทับค่าตั้งต้นแล้วพัง (หน้าแรกล้ม: events.beforeMount)', () => {
    const undefinedPaths = (v: unknown, path: string, out: string[]) => {
      if (v === null || typeof v !== 'object') return out
      for (const [k, x] of Object.entries(v)) {
        if (x === undefined) out.push(`${path}.${k}`)
        else undefinedPaths(x, `${path}.${k}`, out)
      }
      return out
    }
    const today = { ...chart, futureFromIndex: 3 }
    const full = { ...chart, futureFromIndex: 5 }
    const profit = { ...chart, series: [{ key: 'profit' as const, name: 'กำไร', data: [1, -2, 3, 0, 0] }] }
    for (const c of [today, full, profit])
      for (const kind of ['bar', 'line'] as const)
        for (const onPick of [undefined, () => {}]) {
          expect(undefinedPaths(buildServiceChartOptions(c, kind, colors, { height: 200, onPick }), 'o', [])).toEqual([])
        }
  })
})

describe('[blocker] ไม่กระทบร้านอื่น · ไม่แตะรายงาน LINE', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  const D = 'src/app/(paces)/seller/(dashboard)'
  it('หน้าแรก: ข้อมูลการ์ดใหม่คิดเฉพาะร้านบริการ · การ์ดเดิมยังอยู่สำหรับร้านอื่น', () => {
    const page = read(`${D}/dashboard/page.tsx`)
    expect(page).toMatch(/if \(usesServiceFinanceRules\(shop\.vertical\) && salesSeriesRes\.status === 'fulfilled'/)
    expect(page).toMatch(/\{serviceReport \? \(\s*<ServiceReportCard[\s\S]*?\) : \(\s*<SalesReport /)
    const cc = read(`${D}/dashboard/components/CommandCenter.tsx`)
    expect(cc).toMatch(/data\.serviceReport && !data\.portfolio \? \(\s*<ServiceReportCard[\s\S]*?\) : \(\s*<SalesChartCard/)
  })
  it('หน้า /sales: บล็อกใหม่อยู่หลัง isServiceQueue เท่านั้น', () => {
    const sales = read(`${D}/sales/page.tsx`)
    const i = sales.indexOf('if (isServiceQueue) {')
    expect(i).toBeGreaterThan(sales.indexOf("const isServiceQueue = resolveShopVertical(shop.vertical) === 'SERVICE_QUEUE'"))
    expect(sales.slice(i, sales.indexOf('\n  }\n', i))).toContain('<ServiceReportPanel')
    expect(sales.match(/<ServiceReportPanel/g)).toHaveLength(1)
  })
  it('รายงาน LINE / หน้า /lr ไม่ import ของ 00078', () => {
    for (const f of [
      'src/services/line-report-summary.service.ts',
      'src/services/line-report-detail.service.ts',
      'src/lib/line/flex-report-blocks.ts',
      'src/lib/line/flex-summary-report.ts',
    ])
      expect(read(f)).not.toMatch(/service-report/)
  })
  it('getSalesSeries: unclosedCounts อยู่ในบล็อกร้านบริการเท่านั้น (ร้านอื่น/LINE ไม่มีฟิลด์นี้)', () => {
    const svc = read('src/services/dashboard.service.ts')
    const block = svc.slice(svc.indexOf('if (unclosedRows) {'), svc.indexOf('unclosed = {', svc.indexOf('if (unclosedRows) {')))
    expect(block).toContain('uCounts[idx] += 1')
  })
})
