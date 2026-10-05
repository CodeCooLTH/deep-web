/**
 * composer ขับด้วยเทมเพลต (EXT 00070 · T3 · FR-EXT-03/04/05/06/13/14)
 * ข้อมูลตรึงตายตัว — ไม่มี random/Date.now
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildSummaryReportFlex, collectSkipped, fitToLimits, FLEX_COLORS, type ReportFlags, type SummaryReportInput } from '../flex-summary-report'
import { canSumProfit, combineTotals, isMixedFinanceRules } from '@/lib/line-report/aggregate'
import { defaultTemplateFromFlags, TOKENS, type Block, type Run, type TemplateV1, type TokenKey } from '@/lib/line-report/template'
import type { GroupSummary, ShopSummary } from '@/lib/line-report/types'

const win = { startIso: '2026-10-05', endIso: '2026-10-05', computedAt: '2026-10-05T14:02:00.000Z' } // 21:02 ไทย
const shop = (i: number, o: Partial<ShopSummary> = {}, vertical = 'ONLINE_SALES'): ShopSummary => ({
  shop: { id: `s${i}`, name: `ร้าน ${i}`, vertical },
  state: 'OK',
  orders: 10 + i,
  confirmed: 1000 * (i + 1),
  unconfirmed: 50 * i,
  cancelled: i,
  top3: [{ name: `สินค้า ${i}`, qty: 5, amount: 500 }],
  profit: { netProfit: 100 * (i + 1), capped: false },
  ...o,
})
const summary = (shops: ShopSummary[], o: Partial<GroupSummary> = {}): GroupSummary => ({
  window: win,
  shops,
  total: combineTotals(shops),
  profitSummable: canSumProfit(shops.map((s) => s.shop)),
  mixedFinanceRules: isMixedFinanceRules(shops.map((s) => s.shop)),
  ...o,
})
const two = [shop(1), shop(2)]
let n = 0
const id = () => `b${n++}`
const B = {
  orders: (): Block => ({ id: id(), type: 'orders' }),
  sales: (): Block => ({ id: id(), type: 'sales' }),
  cancelled: (): Block => ({ id: id(), type: 'cancelled' }),
  profit: (): Block => ({ id: id(), type: 'profit' }),
  cycle: (): Block => ({ id: id(), type: 'cycle' }),
  sep: (): Block => ({ id: id(), type: 'separator' }),
  shops: (top3 = false, profit = false): Block => ({ id: id(), type: 'shops', top3, profit }),
  text: (runs: Run[], style: Partial<Extract<Block, { type: 'text' }>['style']> = {}): Block => ({
    id: id(),
    type: 'text',
    style: { bold: false, size: 'm', color: 'ink', ...style },
    runs,
  }),
}
const T = (blocks: Block[], o: Partial<TemplateV1> = {}): TemplateV1 => ({ v: 1, button: { show: true, label: 'เปิด Deep' }, blocks, ...o })
const run = (template: TemplateV1, s: GroupSummary = summary(two), o: Partial<SummaryReportInput> = {}) =>
  buildSummaryReportFlex({ summary: s, kind: 'DAILY', template, ...o })
const json = (m: unknown) => JSON.stringify(m)
const tok = (t: TokenKey): Run => ({ tok: t })
type N = { type: string; text?: string; contents?: N[]; [k: string]: unknown }
const bodyOf = (m: { contents: unknown }) => (m.contents as { body: { contents: N[] } }).body.contents
const kinds = (m: { contents: unknown }) => bodyOf(m).map((x) => (x.type === 'separator' ? 'sep' : 'box'))
const flat = (x: unknown): N[] => (x && typeof x === 'object' ? [x as N, ...Object.values(x as object).flatMap(flat)] : [])

beforeEach(() => {
  process.env.NEXT_PUBLIC_SELLER_URL = 'https://seller.deepthailand.app'
})
afterEach(() => {
  delete process.env.NEXT_PUBLIC_SELLER_URL
})

describe('template = แบบมาตรฐาน ≡ flags (AC-EXT-01-1 ฝั่งเทสสด)', () => {
  it('template จาก defaultTemplateFromFlags ให้ JSON เดียวกับเส้นทาง flags ทุก 31 ชุด', () => {
    const base = { attachCycleToDaily: true, monthlyEnabled: true }
    for (let m = 1; m < 32; m++) {
      const f: ReportFlags = { showOrders: !!(m & 1), showSales: !!(m & 2), showCancelled: !!(m & 4), showTopProducts: !!(m & 8), showProfit: !!(m & 16) }
      const cyc = { startIso: '2026-10-01', endIso: '2026-10-05', totals: { orders: 1, confirmed: 5, unconfirmed: 0, cancelled: 0 } }
      const a = buildSummaryReportFlex({ summary: summary(two), kind: 'DAILY', flags: f, cycleToDate: cyc })
      const b = buildSummaryReportFlex({ summary: summary(two), kind: 'DAILY', template: defaultTemplateFromFlags({ ...f, ...base }), cycleToDate: cyc })
      expect(json(b)).toBe(json(a))
    }
  })
})

describe('ลำดับตามเทมเพลต (FR-EXT-06)', () => {
  it('ยอดขายมาก่อนจำนวนใบ ถ้าเทมเพลตเรียงอย่างนั้น', () => {
    const [m] = run(T([B.sales(), B.orders()]))
    const s = json(bodyOf(m)[2])
    expect(s.indexOf('ยอดขาย (นับแล้ว)')).toBeGreaterThan(-1)
    expect(s.indexOf('ยอดขาย (นับแล้ว)')).toBeLessThan(s.indexOf('23 รายการ'))
  })
  it('ข้อความอิสระคั่นระหว่างบล็อก → section ตัวเลขแยกสองก้อน หมายเหตุอยู่ก้อนท้าย', () => {
    const s = summary([shop(1), shop(2, { state: 'ERROR' })])
    const [m] = run(T([B.orders(), B.text([{ t: 'คั่น' }]), B.sales()]), s)
    const j = bodyOf(m).map((x) => json(x))
    expect(j[2]).toContain('คำสั่งซื้อ')
    expect(j[3]).toContain('คั่น')
    expect(j[4]).toContain('ยอดขาย')
    expect(j[4]).toContain('ยอดรวมยังไม่ครบ')
    expect(j[2]).not.toContain('ยอดรวมยังไม่ครบ')
  })
  it('ผลบวกรายร้านเท่ายอดรวมไม่ว่าบล็อกลำดับใด (AC-EXT-06-3)', () => {
    const s = summary(two, { total: { orders: 999, confirmed: 999, unconfirmed: 0, cancelled: 0 } })
    for (const order of [[B.shops(), B.sales()], [B.sales(), B.shops()]]) {
      const j = json(run(T(order), s))
      expect(j).toContain('฿5,000') // 2000+3000 ไม่ใช่ total ปลอม
      expect(j).not.toContain('999')
    }
  })
})

describe('หัวรายงานล็อก (AC-EXT-03-1/2)', () => {
  it('blocks=[] → ยังมีชื่อ ช่วงวันที่ ข้อมูล ณ รวม N ร้าน · ไม่มี separator ลอย', () => {
    const [m] = run(T([]))
    expect(bodyOf(m)).toHaveLength(1)
    const j = json(m.contents)
    expect(j).toContain('5 ต.ค. 2569')
    expect(j).toContain('ข้อมูล ณ 21:02 น. · รวม 2 ร้าน')
    expect(j).not.toContain('"separator"')
  })
  it('blocks=[] แต่มีร้านถูกตัด → หมายเหตุ ไม่รวมร้าน ยังอยู่ (AC-EXT-13-1)', () => {
    const [m] = run(T([]), summary([shop(1), shop(2, { state: 'EXCLUDED', excludedReason: 'LOCKED' })]))
    expect(json(m.contents)).toContain('ไม่รวมร้าน ร้าน 2 (ถูกล็อก)')
  })
  it('title ใช้กับข้อความแรกเท่านั้น · รายเดือนที่ติดมาใช้ชื่อมาตรฐาน', () => {
    const [a, b] = run(T([B.orders()], { title: 'สรุปทีมขาย' }), summary(two), { monthly: summary(two) })
    expect(json(a.contents)).toContain('สรุปทีมขาย')
    expect(json(b.contents)).not.toContain('สรุปทีมขาย')
    expect(json(b.contents)).toContain('รายงานยอดรายเดือน')
    expect(a.altText).toContain('สรุปทีมขาย')
  })
  it('titleOverride ชนะ template.title · TEST ใส่ป้ายทดสอบเองเสมอ', () => {
    const [m] = run(T([B.orders()], { title: 'จากเทมเพลต' }), summary(two), { titleOverride: 'จาก override', kind: 'TEST' })
    expect(json(m.contents)).toContain('จาก override')
    expect(json(m.contents)).not.toContain('จากเทมเพลต')
    expect(json(m.contents)).toContain('"text":"ทดสอบ"')
  })
  it('หมายเหตุอัตโนมัติติดบล็อกแม่ แม้ไม่มีบล็อกตัวเลข (มีแต่ shops)', () => {
    const [m] = run(T([B.shops()]), summary([shop(1), shop(2, { state: 'ERROR' })]))
    const j = json(m.contents)
    expect(j).toContain('ยอดรวมยังไม่ครบ')
    expect(j).toContain('ดึงข้อมูลไม่สำเร็จ')
  })
})

describe('ข้อความอิสระ (FR-EXT-04)', () => {
  const sizes = { s: 'xs', m: 'sm', l: 'md' } as const
  const colors = { ink: FLEX_COLORS.INK, slate: FLEX_COLORS.SLATE, accent: FLEX_COLORS.ACCENT } as const
  const cases = (['s', 'm', 'l'] as const).flatMap((size) =>
    (['ink', 'slate', 'accent'] as const).flatMap((color) => [true, false].map((bold) => [size, color, bold] as const)),
  )
  it.each(cases)('สไตล์ size=%s color=%s bold=%s', (size, color, bold) => {
    const [m] = run(T([B.orders(), B.text([{ t: 'สวัสดี' }], { size, color, bold })]))
    const node = flat(m.contents).find((x) => x.type === 'text' && x.text === 'สวัสดี')!
    expect(node).toMatchObject({ size: sizes[size], color: colors[color], weight: bold ? 'bold' : 'regular', wrap: true })
  })
  it('span: มี contents ไม่มี text บนแม่ · b→weight · accent→สี · ไม่มี decoration/size/style ใน span', () => {
    const [m] = run(T([B.orders(), B.text([{ t: 'ก' }, { t: 'ข', b: true }, { t: 'ค', accent: true }, { t: 'ง', b: true, accent: true }])]))
    const parent = flat(m.contents).find((x) => Array.isArray(x.contents) && x.contents.every((c) => c.type === 'span'))!
    expect('text' in parent).toBe(false)
    expect(parent.contents).toEqual([
      { type: 'span', text: 'ก' },
      { type: 'span', text: 'ข', weight: 'bold' },
      { type: 'span', text: 'ค', color: FLEX_COLORS.ACCENT },
      { type: 'span', text: 'ง', weight: 'bold', color: FLEX_COLORS.ACCENT },
    ])
  })
  it('ไม่มี decoration ใน output ของทุก fixture', () => {
    const fx = [
      T([B.orders(), B.text([{ t: 'a', b: true }, tok('profit')])]),
      T([B.sales(), B.shops(true, true), B.text([{ t: 'a', accent: true }])]),
      T([]),
    ]
    for (const t of fx) for (const m of run(t, summary(two), { monthly: summary(two) })) expect(json(m)).not.toContain('decoration')
  })
  it('ไม่มี fallback "-" สำหรับข้อความอิสระ', () => {
    const [m] = run(T([B.orders(), B.text([tok('profit')])]), summary([shop(1), shop(2, {}, 'SERVICE_QUEUE')]))
    expect(json(m.contents)).not.toContain('"text":"-"')
  })
})

describe('โทเคน (FR-EXT-05)', () => {
  const one = (t: TokenKey, s = summary(two), o: Partial<SummaryReportInput> = {}) => {
    const msgs = run(T([B.orders(), B.text([{ t: '<' }, tok(t), { t: '>' }])]), s, o)
    const hit = flat(msgs[0].contents).find((x) => typeof x.text === 'string' && x.text.startsWith('<'))
    return { v: hit ? hit.text!.slice(1, -1) : null, msgs }
  }
  const cyc = { startIso: '2026-10-01', endIso: '2026-10-05', totals: { orders: 1, confirmed: 7777, unconfirmed: 0, cancelled: 0 } }
  it.each<[TokenKey, string]>([
    ['shop_name', '2 ร้าน'],
    ['shop_count', '2'],
    ['date_range', '5 ต.ค. 2569'],
    ['computed_at', '21:02 น.'],
    ['orders_count', '23'],
    ['sales_counted', '฿5,000'],
    ['sales_pending', '฿150'],
    ['cancelled_count', '3'],
  ])('%s → %s', (t, want) => expect(one(t).v).toBe(want))
  it('{ชื่อร้าน} ร้านเดียว = ชื่อร้านจริง', () => expect(one('shop_name', summary([shop(1)])).v).toBe('ร้าน 1'))
  it('{ยอดสะสมรอบ} มีค่าเมื่อรายวันมี cycleToDate · ไม่มี/ครบทั้งวัน/MONTHLY/ทุกร้านล้ม → ตัดบล็อก', () => {
    expect(one('cycle_sales', summary(two), { cycleToDate: cyc }).v).toBe('฿7,777')
    expect(one('cycle_sales').v).toBeNull()
    expect(one('cycle_sales', summary(two, { window: { ...win, fullDay: true } }), { cycleToDate: cyc }).v).toBeNull()
    expect(one('cycle_sales', summary(two), { cycleToDate: cyc, kind: 'MONTHLY' }).v).toBeNull()
    expect(one('cycle_sales', summary(two), { cycleToDate: { ...cyc, failedShops: 2 } }).v).toBeNull()
  })
  it('{กำไร}: รวมได้ = ผลบวก · ต่างกติกา/มี ERROR → ตัดบล็อก + บันทึก skipped', () => {
    expect(one('profit').v).toBe('฿500')
    const mixed = one('profit', summary([shop(1), shop(2, {}, 'SERVICE_QUEUE')]))
    expect(mixed.v).toBeNull()
    expect(collectSkipped(mixed.msgs)).toContainEqual({ label: '{กำไร}', reason: 'คำนวณไม่ได้ในรอบนี้' })
    expect(one('profit', summary([shop(1), shop(2, { state: 'ERROR', profit: undefined })])).v).toBeNull()
  })
  it('{กำไร} ร้านเดียวที่มีกำไร = กำไรร้านนั้น (A-3)', () => expect(one('profit', summary([shop(1)])).v).toBe('฿200'))
  it('ทุกร้านล้ม → โทเคนตัวเลขเป็น null', () => {
    const dead = summary([shop(1, { state: 'ERROR' }), shop(2, { state: 'ERROR' })])
    for (const t of ['orders_count', 'sales_counted', 'sales_pending', 'cancelled_count'] as const) expect(one(t, dead).v).toBeNull()
  })
  it('ป้าย {จำนวนรายการ} ใน skipped ผันตาม vertical', () => {
    const dead = summary([shop(1, { state: 'ERROR' }, 'SERVICE_QUEUE')])
    expect(collectSkipped(one('orders_count', dead).msgs)[0].label).toBe('{จำนวนบริการ}')
  })
  it('ข้อความที่ทุกบรรทัดถูกตัดยังส่งหัว+ตัวเลขได้ (E-19)', () => {
    const msgs = run(T([B.orders(), B.text([tok('cycle_sales')])]))
    expect(json(msgs[0].contents)).toContain('คำสั่งซื้อ')
  })
  it('TOKENS ครบ 10 ตัวมีค่าในตาราง (กัน key ใหม่ที่ switch ไม่รู้จัก)', () => {
    for (const k of Object.keys(TOKENS) as TokenKey[]) expect(() => one(k)).not.toThrow()
  })
})

describe('ยุบ separator (FR-EXT-06)', () => {
  const k = (blocks: Block[], s = summary(two)) => kinds(run(T(blocks), s)[0])
  it('ต้น/ท้าย/ติดกัน → ยุบ', () => {
    expect(k([B.sep(), B.orders(), B.sep(), B.sep(), B.sales(), B.sep()])).toEqual(['box', 'sep', 'box', 'sep', 'box', 'box'].slice(0, 5))
  })
  it('ชิดบล็อกที่ไม่ render (shops ร้านเดียวไม่มีอะไรแสดง) → ยุบ', () => {
    expect(k([B.orders(), B.sep(), B.shops(), B.sep(), B.cycle()], summary([shop(1)]))).toEqual(['box', 'sep', 'box'])
  })
  it('separator ล้วน → ไม่มีเนื้อหา มีแต่หัว', () => {
    expect(k([B.sep(), B.sep()])).toEqual(['box'])
  })
})

describe('ชนิดกราฟ + ปุ่ม + diagnostics', () => {
  it('chart_* ข้ามเงียบ ๆ ใน JSON + บันทึก skipped (T5 จะเติม)', () => {
    const msgs = run(T([B.orders(), { id: 'c1', type: 'chart_trend', measure: 'sales' }, { id: 'c2', type: 'chart_compare', measure: 'orders' }]))
    expect(collectSkipped(msgs).map((s) => s.label)).toEqual(['กราฟแนวโน้ม 7 วัน', 'กราฟเทียบรายร้าน'])
    expect(json(msgs[0].contents)).not.toContain('"image"')
  })
  it('cycle: DAILY ไม่มี cycleToDate → log · MONTHLY/ครบทั้งวัน → เงียบ', () => {
    expect(collectSkipped(run(T([B.orders(), B.cycle()])))).toHaveLength(1)
    expect(collectSkipped(run(T([B.orders(), B.cycle()]), summary(two), { kind: 'MONTHLY' }))).toHaveLength(0)
    expect(collectSkipped(run(T([B.orders(), B.cycle()]), summary(two, { window: { ...win, fullDay: true } })))).toHaveLength(0)
  })
  it('skipped รอดผ่าน fitToLimits และไม่โผล่ใน JSON ที่ส่ง', () => {
    const msgs = run(T([B.orders(), { id: 'c1', type: 'chart_trend', measure: 'sales' }]))
    const fitted = fitToLimits(msgs)
    expect(collectSkipped(fitted)).toHaveLength(1)
    expect(json(fitted)).not.toContain('skipped')
  })
  it('ปุ่ม: label จากเทมเพลต · show=false/ไม่มี URL → ไม่มี footer', () => {
    const f = (m: { contents: unknown }) => (m.contents as { footer?: { contents: { action: { label: string; uri: string } }[] } }).footer
    expect(f(run(T([B.orders()], { button: { show: true, label: 'ดูในแอป' } }))[0])?.contents[0].action).toEqual({
      type: 'uri',
      label: 'ดูในแอป',
      uri: 'https://seller.deepthailand.app/dashboard',
    })
    expect(f(run(T([B.orders()], { button: { show: false, label: 'x' } }))[0])).toBeUndefined()
    delete process.env.NEXT_PUBLIC_SELLER_URL
    expect(f(run(T([B.orders()]))[0])).toBeUndefined()
  })
})
