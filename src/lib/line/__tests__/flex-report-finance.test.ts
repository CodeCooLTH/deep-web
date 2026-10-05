/**
 * บล็อก expense / net_sales ในการ์ด LINE (EXT-EXP T4 · AC-EXP-03-1/2/3/4/6/7/8/9)
 * ข้อมูลตรึงตายตัว — ไม่มี random/Date.now
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildSummaryReportFlex, collectSkipped, rebuildAtLevel } from '../flex-summary-report'
import { reportCostNoun, EXPENSE_BY_RECORD_DATE_NOTE, FLEX_COLORS } from '../flex-report-blocks'
import { canSumProfit, combineTotals, isMixedFinanceRules } from '@/lib/line-report/aggregate'
import { measureTemplate } from '@/lib/line-report/template-size'
import type { Block, TemplateV1 } from '@/lib/line-report/template'
import type { GroupSummary, ShopFinance, ShopSummary } from '@/lib/line-report/types'

const win = { startIso: '2026-10-05', endIso: '2026-10-05', computedAt: '2026-10-05T14:02:00.000Z' }
const fin = (expense: number, netSales: number, expenseRecorded = true): ShopFinance => ({ expense, netSales, expenseRecorded })
const shop = (i: number, o: Partial<ShopSummary> = {}, vertical = 'ONLINE_SALES'): ShopSummary => ({
  shop: { id: `s${i}`, name: `ร้าน ${i}`, vertical },
  state: 'OK',
  orders: 10,
  confirmed: 1000,
  unconfirmed: 0,
  cancelled: 0,
  finance: fin(300, 700),
  ...o,
})
const summary = (shops: ShopSummary[]): GroupSummary => ({
  window: win,
  shops,
  total: combineTotals(shops),
  profitSummable: canSumProfit(shops.map((s) => s.shop)),
  mixedFinanceRules: isMixedFinanceRules(shops.map((s) => s.shop)),
})
const EXP: Block = { id: 'e', type: 'expense' }
const NET: Block = { id: 'n', type: 'net_sales' }
const SALES: Block = { id: 's', type: 'sales' }
const T = (blocks: Block[]): TemplateV1 => ({ v: 1, button: { show: true, label: 'เปิด Deep' }, blocks })
const build = (s: GroupSummary, blocks: Block[]) => buildSummaryReportFlex({ summary: s, kind: 'DAILY', template: T(blocks) })
const first = (s: GroupSummary, blocks: Block[]) => build(s, blocks)[0]
const json = (x: unknown) => JSON.stringify(x)
const flat = (x: unknown): Record<string, unknown>[] => (x && typeof x === 'object' ? [x as Record<string, unknown>, ...Object.values(x as object).flatMap(flat)] : [])
const texts = (x: unknown) => flat(x).filter((n) => n.type === 'text' && typeof n.text === 'string').map((n) => n.text as string)
const two = [shop(1), shop(2)]

beforeEach(() => { process.env.NEXT_PUBLIC_SELLER_URL = 'https://seller.deepthailand.app' })
afterEach(() => { delete process.env.NEXT_PUBLIC_SELLER_URL })

describe('AC-EXP-03-1 แถวรวม + เงื่อนไข', () => {
  it('2 ร้านกติกาเดียวกัน → แถวรวม ค่าใช้จ่าย ฿600 / หลังหัก ฿1,400', () => {
    const t = texts(first(summary(two), [EXP, NET]))
    expect(t).toContain('ค่าใช้จ่าย')
    expect(t).toContain('฿600')
    expect(t).toContain('ยอดขายหลังหักค่าใช้จ่าย')
    expect(t).toContain('฿1,400')
  })
  it('ติดกับ sales ใน section เดียว ตามลำดับที่เรียง', () => {
    const t = texts(first(summary(two), [NET, SALES, EXP]))
    expect(t.indexOf('ยอดขายหลังหักค่าใช้จ่าย')).toBeLessThan(t.indexOf('ยอดขาย (นับแล้ว)'))
    expect(t.indexOf('ยอดขาย (นับแล้ว)')).toBeLessThan(t.indexOf('ค่าใช้จ่าย'))
  })
  it('ผสมกติกาการเงิน → ไม่มีแถว + skipped', () => {
    const s = summary([shop(1), shop(2, {}, 'SERVICE_QUEUE')])
    const ms = build(s, [EXP, NET])
    expect(texts(ms[0])).not.toContain('฿600')
    expect(json(ms)).not.toContain('฿0')
    expect(collectSkipped(ms)).toEqual([
      { label: 'ค่าใช้จ่าย', reason: 'รวมค่าใช้จ่ายไม่ได้ในรอบนี้' },
      { label: 'ยอดขายหลังหักค่าใช้จ่าย', reason: 'รวมค่าใช้จ่ายไม่ได้ในรอบนี้' },
    ])
  })
  it('มี ERROR → ไม่มีแถวรวม + skipped', () => {
    const s = summary([shop(1), shop(2, { state: 'ERROR', finance: undefined })])
    const ms = build(s, [EXP])
    expect(texts(ms[0])).not.toContain('ค่าใช้จ่าย')
    expect(collectSkipped(ms)).toHaveLength(1)
  })
  it('ร้านเดียว → ใช้ของร้านนั้น · ร้านเดียวที่ ERROR → เงียบ', () => {
    expect(texts(first(summary([shop(1)]), [EXP]))).toContain('฿300')
    const ms = build(summary([shop(1, { state: 'ERROR', finance: undefined })]), [EXP])
    expect(collectSkipped(ms)).toEqual([])
  })
  it('12 ร้าน → รวมได้ ฿3,600', () => {
    const s = summary(Array.from({ length: 12 }, (_, i) => shop(i)))
    expect(texts(first(s, [EXP]))).toContain('฿3,600')
  })
  it('AC-EXP-03-8: ลำดับบล็อก/ร้านสลับ → ยอดรวมเท่ากัน · ร้าน EXCLUDED ไม่ถูกรวม', () => {
    const s = summary([shop(1), shop(2, { finance: fin(0.1, 10) }), shop(3, { finance: fin(0.2, 10) }), shop(4, { state: 'EXCLUDED', excludedReason: 'LOCKED' })])
    for (const bl of [[EXP, NET], [NET, EXP]]) expect(texts(first(s, bl))).toContain('฿300.30')
    expect(texts(first(summary([...s.shops].reverse()), [EXP]))).toContain('฿300.30')
  })
  it('ร้านเดียวไม่มี finance → ไม่ render ตัวเลข', () => {
    const t = texts(first(summary([shop(1, { finance: undefined })]), [EXP, NET]))
    expect(t.join('|')).not.toMatch(/฿300|ยังไม่มีบันทึก/)
  })
})

describe('ป้าย (BR-LGS-32) + ติดลบ (AC-EXP-03-2/BR-LGS-35)', () => {
  it('ยังไม่มีบันทึก ∧ 0 → "ยังไม่มีบันทึก" ไม่ใช่ ฿0 · หลังหัก "ไม่เกิน"', () => {
    const t = texts(first(summary([shop(1, { finance: fin(0, 1000, false) })]), [EXP, NET]))
    expect(t).toContain('ยังไม่มีบันทึก')
    expect(t).toContain('ยอดขายหลังหักค่าใช้จ่ายไม่เกิน')
  })
  it('ติดลบ → ป้ายใหม่ ค่าสัมบูรณ์ ไม่มี ฿- · สีเป็น INK/SLATE เท่านั้น', () => {
    const m = first(summary([shop(1, { finance: fin(1500, -500) })]), [EXP, NET])
    const t = texts(m)
    expect(t).toContain('ยอดขายต่ำกว่าค่าใช้จ่าย')
    expect(t).toContain('฿500')
    expect(json(m)).not.toMatch(/฿-|-฿/)
    const colors = new Set(flat(m).map((n) => n.color).filter(Boolean))
    expect(colors.has(FLEX_COLORS.DANGER)).toBe(false)
    expect(colors.has('#2F2B3D') || colors.has(FLEX_COLORS.INK)).toBe(true)
    for (const c of colors) expect([FLEX_COLORS.INK, FLEX_COLORS.SLATE, FLEX_COLORS.ACCENT, FLEX_COLORS.GRID_GRAY]).toContain(c)
  })
})

describe('AC-EXP-03-3 หมายเหตุต้นทุน ผันตาม vertical', () => {
  it.each([
    ['ONLINE_SALES', 'ต้นทุนสินค้า'],
    ['SERVICE_QUEUE', 'ต้นทุนอะไหล่'],
    ['LODGING', 'ต้นทุนต่อห้อง'],
  ])('%s', (v, noun) => {
    const t = texts(first(summary([shop(1, {}, v)]), [NET]))
    expect(t).toContain(`= ยอดขาย (นับแล้ว) − ค่าใช้จ่าย · ยังไม่หัก${noun}`)
  })
  it('ผสม = "ต้นทุน"', () => {
    const s = [shop(1), shop(2, {}, 'LODGING')]
    expect(reportCostNoun(s)).toBe('ต้นทุน')
  })
})

describe('AC-EXP-03-4 หมายเหตุวันที่บันทึก', () => {
  it('ขึ้นเมื่อมีบล็อกใหม่ · ไม่ขึ้นเมื่อไม่มี (golden ไม่เปลี่ยน)', () => {
    expect(texts(first(summary(two), [EXP]))).toContain(EXPENSE_BY_RECORD_DATE_NOTE)
    expect(texts(first(summary(two), [NET]))).toContain(EXPENSE_BY_RECORD_DATE_NOTE)
    expect(texts(first(summary(two), [SALES]))).not.toContain(EXPENSE_BY_RECORD_DATE_NOTE)
  })
})

describe('AC-EXP-03-6 ไม่ถูกตัดทุกระดับ + ขนาด', () => {
  it('ระดับ 0-4 ยังมีแถวและหมายเหตุ', () => {
    const [m] = build(summary(two), [EXP, NET])
    for (const lv of [0, 1, 2, 3, 4]) {
      const t = texts(rebuildAtLevel(m, lv))
      expect(t).toContain('฿600')
      expect(t).toContain(EXPENSE_BY_RECORD_DATE_NOTE)
    }
  })
  it('เทมเพลตการเงินเต็มที่ fixture เลวร้ายสุด ระดับ 3 ≤ 30KB', () => {
    expect(measureTemplate(T([SALES, EXP, NET])).bytes).toBeLessThanOrEqual(30_000)
  })
})

describe('AC-EXP-03-7 altText', () => {
  const alt = (s: GroupSummary, blocks: Block[]) => (first(s, blocks) as unknown as { altText: string }).altText
  it('มีบล็อก ∧ รวมได้ → ต่อท้ายด้วยข้อความจาก display', () => {
    const a = alt(summary(two), [EXP, NET])
    expect(a).toContain('ค่าใช้จ่าย ฿600')
    expect(a).toContain('ยอดขายหลังหักค่าใช้จ่าย ฿1,400')
  })
  it('ไม่มีบล็อก/รวมไม่ได้ → ไม่มี', () => {
    expect(alt(summary(two), [SALES])).not.toContain('ค่าใช้จ่าย')
    expect(alt(summary([shop(1), shop(2, {}, 'SERVICE_QUEUE')]), [EXP, NET])).not.toContain('ค่าใช้จ่าย')
  })
})
