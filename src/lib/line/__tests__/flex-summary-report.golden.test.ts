/**
 * golden ของ builder รายงาน LINE ก่อน refactor ตัวจัดข้อความ (EXT 00070 · T1 · AC-EXT-01-1)
 * เทียบด้วยสตริง JSON.stringify — ลำดับ key ก็นับ · ข้อมูลทุกตัวตรึงตายตัว (ไม่มี Date.now/random)
 * สร้างใหม่: UPDATE_GOLDEN=1 (ทำเฉพาะเมื่อตั้งใจเปลี่ยนข้อความ ไม่ใช่ตอน refactor)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildSummaryReportFlex, fitToLimits, type ReportFlags, type SummaryReportInput } from '../flex-summary-report'
import { canSumProfit, combineTotals, isMixedFinanceRules } from '@/lib/line-report/aggregate'
import type { GroupSummary, ShopSummary } from '@/lib/line-report/types'

const DIR = join(__dirname, '__golden__')
const win = { startIso: '2026-10-05', endIso: '2026-10-05', computedAt: '2026-10-05T14:02:00.000Z' }
const winMonth = { startIso: '2026-10-01', endIso: '2026-10-05', computedAt: '2026-10-05T14:02:00.000Z' }

const shop = (i: number, o: Partial<ShopSummary> = {}, vertical: string | null = 'ONLINE_SALES'): ShopSummary => ({
  shop: { id: `s${i}`, name: `ร้าน ${i}`, vertical },
  state: 'OK',
  orders: 10 + i,
  confirmed: 1000 * (i + 1),
  unconfirmed: 50 * i,
  cancelled: i,
  top3: [
    { name: `สินค้า ${i} A`, qty: 5, amount: 500 },
    { name: `สินค้า ${i} B`, qty: 3, amount: 300 },
    { name: `สินค้า ${i} C`, qty: 1, amount: 100 },
  ],
  profit: { netProfit: 100 * (i + 1), capped: false },
  ...o,
})
const summary = (shops: ShopSummary[], o: Partial<GroupSummary> = {}, w: GroupSummary['window'] = win): GroupSummary => ({
  window: w,
  shops,
  total: combineTotals(shops),
  profitSummable: canSumProfit(shops.map((s) => s.shop)),
  mixedFinanceRules: isMixedFinanceRules(shops.map((s) => s.shop)),
  ...o,
})
const F = (o: Partial<ReportFlags> = {}): ReportFlags => ({ showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: true, ...o })
const none: ReportFlags = { showOrders: false, showSales: false, showCancelled: false, showTopProducts: false, showProfit: false }
const cyc = { startIso: '2026-10-01', endIso: '2026-10-05', totals: { orders: 40, confirmed: 12345, unconfirmed: 0, cancelled: 2 } }
const many = (n: number, nameLen = 0, o: Partial<ShopSummary> = {}) =>
  Array.from({ length: n }, (_, i) => shop(i + 1, { ...o, shop: { id: `s${i + 1}`, name: `ร้าน ${i + 1}${'ก'.repeat(nameLen)}`, vertical: 'ONLINE_SALES' } }))
const bigTop = (i: number) => ({ top3: [1, 2, 3].map((k) => ({ name: `สินค้าชื่อยาวมากสำหรับทดสอบเพดานขนาด ${i}-${k} ${'ข'.repeat(60)}`, qty: 99999, amount: 1 })) })

type Case = { input: SummaryReportInput; env?: string; mustTrim?: boolean }
const two = [shop(1), shop(2)]
const CASES: Record<string, Case> = {
  single_all_flags: { input: { summary: summary([shop(1)]), kind: 'DAILY', flags: F() } },
  single_orders_only: { input: { summary: summary([shop(1)]), kind: 'DAILY', flags: F({ ...none, showOrders: true }) } },
  multi_all_summable: { input: { summary: summary(two), kind: 'DAILY', flags: F() } },
  multi_sales_only_no_footer_url: { input: { summary: summary(two), kind: 'DAILY', flags: F({ ...none, showSales: true }) }, env: '' },
  multi_cancelled_only: { input: { summary: summary(two), kind: 'DAILY', flags: F({ ...none, showCancelled: true }) } },
  multi_top3_only: { input: { summary: summary(two), kind: 'DAILY', flags: F({ ...none, showTopProducts: true }) } },
  multi_profit_only: { input: { summary: summary(two), kind: 'DAILY', flags: F({ ...none, showProfit: true }) } },
  multi_all_off_fallback: { input: { summary: summary(two), kind: 'DAILY', flags: none } },
  profit_not_summable_mixed_rules: { input: { summary: summary([shop(1), shop(2, {}, 'SERVICE_QUEUE')]), kind: 'DAILY', flags: F() } },
  profit_capped: { input: { summary: summary([shop(1, { profit: { netProfit: -500, capped: true } }), shop(2)]), kind: 'DAILY', flags: F() } },
  kind_monthly: { input: { summary: summary(two, {}, winMonth), kind: 'MONTHLY', flags: F() } },
  kind_test: { input: { summary: summary(two), kind: 'TEST', flags: F() } },
  kind_command: { input: { summary: summary(two), kind: 'COMMAND', flags: F() } },
  daily_cycle_and_monthly: { input: { summary: summary(two), kind: 'DAILY', flags: F(), cycleToDate: cyc, monthly: summary(two, {}, winMonth) } },
  daily_cycle_failed_partial: { input: { summary: summary(two), kind: 'DAILY', flags: F(), cycleToDate: { ...cyc, failedShops: 1 } } },
  daily_cycle_all_failed: { input: { summary: summary(two), kind: 'DAILY', flags: F(), cycleToDate: { ...cyc, failedShops: 2 } } },
  fullday_with_cycle_ignored: { input: { summary: summary(two, {}, { ...win, fullDay: true }), kind: 'DAILY', flags: F(), cycleToDate: cyc } },
  title_override_with_monthly: { input: { summary: summary(two), kind: 'DAILY', flags: F(), titleOverride: 'สรุปยอดทีมขาย', monthly: summary(two, {}, winMonth) } },
  title_override_test_fullday: { input: { summary: summary(two, {}, { ...win, fullDay: true }), kind: 'TEST', flags: F(), titleOverride: 'ชื่อกำหนดเอง' } },
  shop_error: { input: { summary: summary([shop(1), shop(2, { state: 'ERROR', orders: 0, confirmed: 0, unconfirmed: 0, cancelled: 0, top3: undefined, profit: undefined })]), kind: 'DAILY', flags: F() } },
  shop_excluded_reasons: {
    input: {
      summary: summary([
        shop(1),
        shop(2),
        shop(3, { state: 'EXCLUDED', excludedReason: 'LOCKED' }),
        shop(4, { state: 'EXCLUDED', excludedReason: 'DELETED' }),
        shop(5, { state: 'EXCLUDED', excludedReason: 'OTHER' }),
      ]),
      kind: 'DAILY',
      flags: F(),
    },
  },
  top3_truncated_and_empty: { input: { summary: summary([shop(1, { top3Truncated: true }), shop(2, { top3: [] })]), kind: 'DAILY', flags: F() } },
  lodging_and_mixed_vertical: { input: { summary: summary([shop(1, {}, 'LODGING'), shop(2), shop(3, {}, 'SERVICE_QUEUE')]), kind: 'DAILY', flags: F() } },
  lodging_only: { input: { summary: summary([shop(1, {}, 'LODGING'), shop(2, {}, 'LODGING')]), kind: 'DAILY', flags: F() } },
  service_only_single: { input: { summary: summary([shop(1, {}, 'SERVICE_QUEUE')]), kind: 'DAILY', flags: F() } },
  // ลำดับบล็อกท้าย: ยอดสะสมรอบ ต้องมาก่อน ไม่รวมร้าน
  cycle_and_excluded_order: { input: { summary: summary([shop(1), shop(2), shop(3, { state: 'EXCLUDED', excludedReason: 'LOCKED' })]), kind: 'DAILY', flags: F(), cycleToDate: cyc } },
  // fitToLimits ต้องตัด: level1 (Top3) · level2-3 (ย่อรายร้าน) · altText เกิน 1500
  fit_level1_top3_trimmed: { input: { summary: summary(many(40, 0, bigTop(0)).map((s, i) => ({ ...s, ...bigTop(i) }))), kind: 'DAILY', flags: F() }, mustTrim: true },
  fit_compact_many_long_names: { input: { summary: summary(many(80, 80)), kind: 'DAILY', flags: F(), monthly: summary(many(80, 80), {}, winMonth) }, mustTrim: true },
  fit_alttext_over_1500: { input: { summary: summary(many(120, 20), {}), kind: 'DAILY', flags: F({ showTopProducts: false }) }, mustTrim: true },
}

const sha = (s: string) => require('node:crypto').createHash('sha256').update(s).digest('hex') as string

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SELLER_URL
})

const run = (c: Case) => {
  process.env.NEXT_PUBLIC_SELLER_URL = c.env ?? 'https://seller.deepthailand.app'
  const raw = buildSummaryReportFlex(c.input)
  return { raw, out: fitToLimits(raw) }
}

describe('golden: builder ปัจจุบัน (template=null) ต้องออกไบต์เดิม', () => {
  for (const [name, c] of Object.entries(CASES)) {
    it(name, () => {
      const { raw, out } = run(c)
      const actual = JSON.stringify(out, null, 1)
      if (c.mustTrim) expect(JSON.stringify(out)).not.toBe(JSON.stringify(raw)) // เคสนี้ต้องเข้าทางตัดจริง ไม่งั้นไม่ได้ครอบ
      const file = join(DIR, `${name}.json`)
      if (process.env.UPDATE_GOLDEN === '1') {
        mkdirSync(DIR, { recursive: true })
        writeFileSync(file, actual + '\n')
      }
      expect(existsSync(file), `ไม่มี golden ${name} (รัน UPDATE_GOLDEN=1)`).toBe(true)
      // เทียบสตริง ไม่ใช่ toEqual — ลำดับ key นับ
      expect(actual + '\n').toBe(readFileSync(file, 'utf8'))
    })
  }

  it('manifest sha256 ตรงกับผลปัจจุบัน (ครอบทั้งชุด)', () => {
    const m: Record<string, string> = {}
    for (const [name, c] of Object.entries(CASES)) m[name] = sha(JSON.stringify(run(c).out))
    const file = join(DIR, 'manifest.sha256.json')
    if (process.env.UPDATE_GOLDEN === '1') writeFileSync(file, JSON.stringify(m, null, 1) + '\n')
    expect(JSON.stringify(m, null, 1) + '\n').toBe(readFileSync(file, 'utf8'))
  })
})
