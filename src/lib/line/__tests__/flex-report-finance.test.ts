/**
 * บล็อก expense / net_sales ในการ์ด LINE (EXT-EXP T4 · AC-EXP-03-1/2/3/4/6/7/8/9)
 * ข้อมูลตรึงตายตัว — ไม่มี random/Date.now
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildSummaryReportFlex, collectSkipped, rebuildAtLevel } from '../flex-summary-report'
import { reportCostNoun, FLEX_COLORS } from '../flex-report-blocks'
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
  it('2 ร้านกติกาเดียวกัน → แถวรวม ค่าใช้จ่าย 600 / หลังหัก 1,400', () => {
    const t = texts(first(summary(two), [EXP, NET]))
    expect(t).toContain('ค่าใช้จ่าย')
    expect(t).toContain('600')
    expect(t).toContain('ยอดขายหลังหักค่าใช้จ่าย')
    expect(t).toContain('1,400')
  })
  it('ติดกับ sales ใน section เดียว ตามลำดับที่เรียง', () => {
    const t = texts(first(summary(two), [NET, SALES, EXP]))
    // ยอดขาย = ตัวเด่นใต้หัวเสมอ · แถวการเงินเรียงตามเทมเพลต
    expect(t.indexOf('ยอดขาย')).toBeLessThan(t.indexOf('ยอดขายหลังหักค่าใช้จ่าย'))
    expect(t.indexOf('ยอดขายหลังหักค่าใช้จ่าย')).toBeLessThan(t.indexOf('ค่าใช้จ่าย'))
  })
  it('ผสมกติกาการเงิน → ไม่มีแถว + skipped', () => {
    const s = summary([shop(1), shop(2, {}, 'SERVICE_QUEUE')])
    const ms = build(s, [EXP, NET])
    expect(texts(ms[0])).not.toContain('600')
    expect(json(ms)).not.toContain('"text":"0"')
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
    expect(texts(first(summary([shop(1)]), [EXP]))).toContain('300')
    const ms = build(summary([shop(1, { state: 'ERROR', finance: undefined })]), [EXP])
    expect(collectSkipped(ms)).toEqual([])
  })
  it('12 ร้าน → รวมได้ 3,600', () => {
    const s = summary(Array.from({ length: 12 }, (_, i) => shop(i)))
    expect(texts(first(s, [EXP]))).toContain('3,600')
  })
  it('AC-EXP-03-8: ลำดับบล็อก/ร้านสลับ → ยอดรวมเท่ากัน · ร้าน EXCLUDED ไม่ถูกรวม', () => {
    const s = summary([shop(1), shop(2, { finance: fin(0.1, 10) }), shop(3, { finance: fin(0.2, 10) }), shop(4, { state: 'EXCLUDED', excludedReason: 'LOCKED' })])
    for (const bl of [[EXP, NET], [NET, EXP]]) expect(texts(first(s, bl))).toContain('300.30')
    expect(texts(first(summary([...s.shops].reverse()), [EXP]))).toContain('300.30')
  })
  it('ร้านเดียวไม่มี finance → ไม่ render ตัวเลข', () => {
    const t = texts(first(summary([shop(1, { finance: undefined })]), [EXP, NET]))
    expect(t.join('|')).not.toMatch(/300|ยังไม่มีบันทึก/)
  })
})

describe('ป้าย (BR-LGS-32) + ติดลบ (AC-EXP-03-2/BR-LGS-35)', () => {
  it('ยังไม่มีบันทึก ∧ 0 → "ยังไม่มีบันทึก" ไม่ใช่ 0 · หลังหัก "ไม่เกิน"', () => {
    const t = texts(first(summary([shop(1, { finance: fin(0, 1000, false) })]), [EXP, NET]))
    expect(t).toContain('ยังไม่มีบันทึก')
    expect(t).toContain('ยอดขายหลังหักค่าใช้จ่ายไม่เกิน')
  })
  it('ติดลบ → ป้ายใหม่ ค่าสัมบูรณ์ ไม่มี - · สีเป็น INK/SLATE เท่านั้น', () => {
    const m = first(summary([shop(1, { finance: fin(1500, -500) })]), [EXP, NET])
    const t = texts(m)
    expect(t).toContain('ยอดขายต่ำกว่าค่าใช้จ่าย')
    expect(t).toContain('500')
    expect(json(m)).not.toMatch(/"-\d/)
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
    expect(t).toContain(`ยังไม่หัก${noun}`)
  })
  it('ผสม = "ต้นทุน"', () => {
    const s = [shop(1), shop(2, {}, 'LODGING')]
    expect(reportCostNoun(s)).toBe('ต้นทุน')
  })
})

describe('หมายเหตุวันที่บันทึก ถอดออก (user 2026-10-08: คำอธิบายรก)', () => {
  it('ไม่มีหมายเหตุ "ลงตามวันที่บันทึก" ทุกบล็อก', () => {
    for (const b of [[EXP], [NET], [SALES]]) expect(texts(first(summary(two), b)).some((x) => x.includes('วันที่บันทึก'))).toBe(false)
  })
})

describe('AC-EXP-03-6 ไม่ถูกตัดทุกระดับ + ขนาด', () => {
  it('ระดับ 0-4 ยังมีแถวและหมายเหตุ', () => {
    const [m] = build(summary(two), [EXP, NET])
    for (const lv of [0, 1, 2, 3, 4]) {
      const t = texts(rebuildAtLevel(m, lv))
      expect(t).toContain('600')
      expect(t).toContain('ยอดขายหลังหักค่าใช้จ่าย')
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
    expect(a).toContain('ค่าใช้จ่าย 600')
    expect(a).toContain('ยอดขายหลังหักค่าใช้จ่าย 1,400')
  })
  it('ไม่มีบล็อก/รวมไม่ได้ → ไม่มี', () => {
    expect(alt(summary(two), [SALES])).not.toContain('ค่าใช้จ่าย')
    expect(alt(summary([shop(1), shop(2, {}, 'SERVICE_QUEUE')]), [EXP, NET])).not.toContain('ค่าใช้จ่าย')
  })
})

describe('ITEMS §17: รายการย่อยค่าใช้จ่าย', () => {
  const ITEMS = [
    { key: 'RENT', label: 'ค่าเช่า', amount: 200 },
    { key: 'ADVERTISING', label: 'ค่าโฆษณา', amount: 100 },
  ]
  const withItems = (n = 1) => Array.from({ length: n }, (_, i) => shop(i + 1, { finance: { ...fin(300, 700), items: ITEMS } }))
  const EXP_I: Block = { id: 'e', type: 'expense', items: true }

  it('items=true → แถวรวมก่อน แล้วรายการย่อยตามลำดับ (ร้านเดียวและรวมหลายร้าน)', () => {
    const t1 = texts(first(summary(withItems(1)), [EXP_I]))
    expect(t1.slice(t1.indexOf('ค่าใช้จ่าย'), t1.indexOf('ค่าใช้จ่าย') + 5)).toEqual(['ค่าใช้จ่าย', '300', 'ค่าเช่า', '200', 'ค่าโฆษณา'])
    const t2 = texts(first(summary(withItems(2)), [EXP_I]))
    expect(t2).toContain('400') // ค่าเช่ารวม 2 ร้าน
    expect(t2).toContain('200')
  })
  it('items ไม่ตั้ง/false → ไม่มีรายการย่อย', () => {
    expect(texts(first(summary(withItems(1)), [EXP]))).not.toContain('ค่าเช่า')
    expect(texts(first(summary(withItems(1)), [{ id: 'e', type: 'expense', items: false }]))).not.toContain('ค่าเช่า')
  })
  it('เงื่อนไขเดียวกับแถวรวม: ผสมกติกา → ไม่มีทั้งแถวรวมและรายการย่อย', () => {
    const s = summary([withItems(1)[0], shop(2, { finance: { ...fin(300, 700), items: ITEMS } }, 'SERVICE_QUEUE')])
    expect(texts(first(s, [EXP_I]))).not.toContain('ค่าเช่า')
  })
  it('ระดับ ≥1 ตัดรายการย่อย แต่แถวรวมอยู่', () => {
    const m = first(summary(withItems(1)), [EXP_I])
    const t = texts(rebuildAtLevel(m, 1))
    expect(t).not.toContain('ค่าเช่า')
    expect(t).toContain('300')
  })
  it('โน้ตไม่หลุดลง JSON (ไม่มีทางผ่านชนิดข้อมูล)', () => {
    const s = summary(withItems(1))
    expect(json(build(s, [EXP_I]))).not.toMatch(/โน้ตลับ/)
  })
})

describe('กราฟ 7 วัน + ค่าใช้จ่าย (user 2026-10-08)', () => {
  const CH: Block = { id: 'c', type: 'chart_trend', measure: 'sales' }
  const tr = { dates: ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'], confirmed: [9, 9, 9, 9, 9, 9, 900], unconfirmed: [0, 0, 0, 0, 0, 0, 100], orders: [1, 1, 1, 1, 1, 1, 1], expense: [0, 0, 0, 0, 0, 0, 400] }
  const withTr = (shops: ShopSummary[]) => ({ ...summary(shops), trend: tr })
  const reds = (blocks: Block[], s: GroupSummary) => flat(first(s, blocks)).filter((n) => n.backgroundColor === FLEX_COLORS.EXPENSE_RED)
  it('เปิดเผยค่าใช้จ่าย ∧ รวมได้ → แท่งแดง + เส้นหลังหักค่าใช้จ่าย', () => {
    const s = withTr([shop(1), shop(2)])
    expect(reds([CH, EXP], s).length).toBeGreaterThan(0)
    expect(json(first(s, [CH, NET]))).toContain('ยอดขายหลังหักค่าใช้จ่าย')
  })
  it('ไม่มีบล็อกค่าใช้จ่าย หรือ รวมไม่ได้ (ผสมกติกา) → ไม่มีแท่งแดง แม้ trend มีค่าใช้จ่าย', () => {
    expect(reds([CH], withTr([shop(1), shop(2)]))).toHaveLength(0)
    expect(reds([CH, EXP], withTr([shop(1), shop(2, {}, 'SERVICE_QUEUE')]))).toHaveLength(0)
  })
})

describe('Top 3 มีรูป (user 2026-10-08: [รูป] ชื่อ จำนวน)', () => {
  const SH: Block = { id: 'sh', type: 'shops', top3: true, profit: false }
  const row = (n: Record<string, unknown>) => (n.contents as Record<string, unknown>[]).map((c) => c.type)
  it('มีรูปอย่างน้อยหนึ่งแถว → ทุกแถวมีช่องรูป 40px (ไม่มีรูป = กล่องเทา) · ไม่มีรูปเลย → แถวเดิม', () => {
    const top3 = [{ name: 'ก', qty: 3, amount: 30, imageUrl: 'https://x.app/img?k=a&s=b' }, { name: 'ข', qty: 2, amount: 20 }]
    const m = first(summary([shop(1, { top3 })]), [SH])
    const rows = flat(m).filter((n) => n.layout === 'horizontal' && (n.contents as unknown[] | undefined)?.length === 3 && json(n).includes('ชิ้น'))
    expect(rows.map(row)).toEqual([['box', 'text', 'text'], ['box', 'text', 'text']])
    // หัวมีไอคอนเปลวไฟ (asset บนโดเมนผู้ขาย) + รูปสินค้า · ชื่อไม่มีเลขลำดับนำหน้า
    expect(flat(m).filter((n) => n.type === 'image').map((n) => n.url)).toEqual(['https://seller.deepthailand.app/images/line-report/bestseller.png', 'https://x.app/img?k=a&s=b'])
    expect(texts(m)).toContain('ก')
    expect(texts(m)).not.toContain('1 ก')
    const plain = first(summary([shop(1, { top3: [{ name: 'ก', qty: 3, amount: 30 }] })]), [SH])
    expect(flat(plain).some((n) => n.width === '40px')).toBe(false)
  })
})
