import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_REPORT_SETTINGS,
  resolveReportSettings,
  showsUnclosedInCharts,
  showsUnclosedOnCard,
  showsUnclosedSummary,
} from '../report-settings'
import { FINANCE_COLORS } from '../finance-colors'
import { FLEX_COLORS } from '../line/flex-report-blocks'
import { buildSummaryReportFlex } from '../line/flex-summary-report'
import { canSumProfit, combineTotals, isMixedFinanceRules } from '../line-report/aggregate'
import type { GroupSummary, ShopSummary } from '../line-report/types'

/** 00073 ภาคต่อ FR-016 — ตั้งค่า "งานที่ยังไม่ปิด" + สีตัวกลาง + บรรทัดในรายงาน LINE (ร้านบริการเท่านั้น) */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('ตั้งค่า งานที่ยังไม่ปิด (สีเหลือง)', () => {
  it('[blocker] ค่าตั้งต้น = CARD (หน้าตาหลัง #156 ไม่เปลี่ยน) · ค่าเพี้ยน = CARD · ร้านอื่นค่าตั้งต้นเสมอ', () => {
    expect(DEFAULT_REPORT_SETTINGS.unclosedDisplay).toBe('CARD')
    expect(resolveReportSettings({ unclosedDisplay: 'ALL' }, 'SERVICE_QUEUE').unclosedDisplay).toBe('ALL')
    expect(resolveReportSettings({ unclosedDisplay: 'OFF' }, 'SERVICE_QUEUE').unclosedDisplay).toBe('OFF')
    expect(resolveReportSettings({ unclosedDisplay: 'BOGUS' }, 'SERVICE_QUEUE').unclosedDisplay).toBe('CARD')
    expect(resolveReportSettings({ unclosedDisplay: 'ALL' }, 'ONLINE_SALES').unclosedDisplay).toBe('CARD')
    expect(resolveReportSettings({ unclosedDisplay: 'ALL' }, 'LODGING').unclosedDisplay).toBe('CARD')
  })
  it('[blocker] ตารางตัดสิน: OFF ไม่แสดงเลย · CARD การ์ด + แถวสรุป · ALL + กราฟ/ตารางข้างใน', () => {
    const s = (u: 'OFF' | 'CARD' | 'ALL') => ({ ...DEFAULT_REPORT_SETTINGS, unclosedDisplay: u })
    expect([showsUnclosedOnCard(s('OFF')), showsUnclosedSummary(s('OFF')), showsUnclosedInCharts(s('OFF'))]).toEqual([false, false, false])
    expect([showsUnclosedOnCard(s('CARD')), showsUnclosedSummary(s('CARD')), showsUnclosedInCharts(s('CARD'))]).toEqual([true, true, false])
    expect([showsUnclosedOnCard(s('ALL')), showsUnclosedSummary(s('ALL')), showsUnclosedInCharts(s('ALL'))]).toEqual([true, true, true])
  })
})

describe('สีตัวกลาง FINANCE_COLORS — สีเดียว ความหมายเดียว', () => {
  it('[blocker] เหลือง = ยังไม่นับ · ฟ้า = ค้างรับ · เขียว = นับแล้ว — ห้ามซ้ำกัน', () => {
    const tokens = [FINANCE_COLORS.counted.token, FINANCE_COLORS.notCounted.token, FINANCE_COLORS.outstanding.token, FINANCE_COLORS.count.token]
    expect(new Set(tokens).size).toBe(tokens.length)
    expect(FINANCE_COLORS.notCounted.token).toBe('warning')
    expect(FINANCE_COLORS.outstanding.token).not.toBe('warning')
  })
  it('[blocker] LINE ใช้เหลืองตัวเดียวกับตัวกลาง (ค่าเดิมทุกไบต์ — ข้อความกลุ่มร้านขายของไม่เปลี่ยน)', () => {
    expect(FLEX_COLORS.PENDING_YELLOW).toBe('#f5b400')
    expect(FLEX_COLORS.PENDING_TEXT).toBe('#92400e')
    expect(FLEX_COLORS.PENDING_YELLOW).toBe(FINANCE_COLORS.notCounted.lineHex)
  })
  it('[blocker] จอร้านบริการไม่เขียน "ค้างรับ" เป็นเหลืองตรง ๆ แล้ว (ต้องผ่านตัวกลาง)', () => {
    const files = [
      'src/app/(paces)/seller/(dashboard)/dashboard/components/SalesChartSheet.tsx',
      'src/app/(paces)/seller/(dashboard)/sales/components/ServiceFinanceChart.tsx',
      'src/app/(paces)/seller/(dashboard)/sales/components/SalesChart.tsx',
      'src/app/(paces)/seller/(dashboard)/dashboard/components/FinancePanels.tsx',
    ]
    for (const f of files) {
      const code = read(f)
      expect(code, f).not.toMatch(/(bg-warning|getColor\('warning'\))[^\n]{0,40}ค้างรับ|ค้างรับ[^\n]{0,60}(bg-warning|getColor\('warning'\))/)
    }
  })
})

describe('รายงานกลุ่ม LINE — ร้านบริการนับยอดแบบร้านทั่วไป', () => {
  const win = { startIso: '2026-10-05', endIso: '2026-10-05', computedAt: '2026-10-05T11:00:00.000Z' }
  const shop = (o: Partial<ShopSummary>, vertical: string): ShopSummary => ({
    shop: { id: vertical, name: vertical, vertical }, state: 'OK', orders: 5, confirmed: 1000, unconfirmed: 0, cancelled: 0, ...o,
  })
  const summary = (shops: ShopSummary[]): GroupSummary => ({
    window: win, shops, total: combineTotals(shops),
    profitSummable: canSumProfit(shops.map((s) => s.shop)), mixedFinanceRules: isMixedFinanceRules(shops.map((s) => s.shop)),
  })
  const texts = (x: unknown): string[] =>
    x && typeof x === 'object'
      ? [...((x as { type?: string; text?: string }).type === 'text' ? [(x as { text: string }).text] : []), ...Object.values(x as object).flatMap(texts)]
      : []
  const run = (s: GroupSummary) =>
    buildSummaryReportFlex({ summary: s, kind: 'DAILY', template: { v: 1, button: { show: false, label: '' }, blocks: [{ id: 's', type: 'sales' }] } })

  // user 2026-10-14: ร้านบริการในกลุ่ม LINE ไม่รอปิดงาน — ยอดขาย = ยืนยันแล้ว + รอยืนยัน · เหลืองใช้คำ "รอยืนยัน"
  it('[blocker] ร้านบริการ: ยอดขายรวมรอยืนยัน · ป้ายเหลือง "รอยืนยัน" · ไม่มีบรรทัด "ยังไม่ปิดงาน"', () => {
    const t = texts(run(summary([shop({ confirmed: 30300, unconfirmed: 18900 }, 'SERVICE_QUEUE')])))
    expect(t).toContain('49,200')
    expect(t.some((x) => x.startsWith('รอยืนยัน 18,900'))).toBe(true)
    expect(t.some((x) => x.includes('ยังไม่ปิดงาน'))).toBe(false)
  })
})

describe('รายงานยอดขาย (คอม) + แผงการเงิน — ตามตั้งค่าและสีตัวกลาง', () => {
  it('[blocker] รายงานยอดขาย: เส้นเหลืองเฉพาะเมื่อมีคีย์ unclosed · ไม่มีคีย์ = 2 ซีรีส์เดิม', async () => {
    const { buildSalesReportChart } = await import('../../app/(paces)/seller/(dashboard)/dashboard/components/SalesReport')
    const names = { revenue: 'รายได้รวม', orders: 'งานบริการ' }
    const plain = [{ label: 'ต.ค.', revenue: 3500, orderCount: 4 }]
    expect(buildSalesReportChart(plain, names).series?.length).toBe(2)
    const withU = [{ label: 'ต.ค.', revenue: 3500, orderCount: 4, unclosed: 3400 }]
    const opt = buildSalesReportChart(withU, names, true)
    expect(opt.series?.map((x) => (x as { name: string }).name)).toEqual(['รายได้รวม', 'งานบริการ', 'ยังไม่ปิดงาน'])
    expect((opt.stroke as { width: number[] }).width).toEqual([3, 2, 3])
  })
  it('[blocker] page: unclosed ใส่เฉพาะร้านบริการ + เห็นเงินเต็ม + ตั้งค่าแสดง · ร้านอื่นไม่มีคีย์', () => {
    const page = read('src/app/(paces)/seller/(dashboard)/dashboard/page.tsx')
    expect(page).toMatch(/const reportUnclosed = newRules && money\.salesReport && showsUnclosedOnCard\(reportSettings\)/)
    expect(page).toMatch(/\.\.\.\(reportUnclosed \? \{ unclosed: unclosedByMonth\.get\(k\)\?\.amount \?\? 0 \} : \{\}\)/)
  })
  it('[blocker] สีของรายงานยอดขาย: ร้านบริการใช้ตัวกลาง · ร้านอื่นสีธีมเดิม', () => {
    const code = read('src/app/(paces)/seller/(dashboard)/dashboard/components/SalesReport.tsx')
    expect(code).toMatch(/getColor\(financePalette \? FINANCE_COLORS\.counted\.token : 'chart-secondary'\)/)
    expect(code).toMatch(/buildSalesReportChart\(series, seriesNames, vertical === 'SERVICE_QUEUE'\)/)
  })
})
