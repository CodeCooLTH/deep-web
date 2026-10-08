/**
 * กราฟในรายงาน LINE (EXT 00070 · T5 · AC-EXT-09-1..7 + AC-EXT-08-1) — ข้อมูลตรึง ไม่มี random/Date.now
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compareChart, COMPARE_ROW_LIMIT, trendChart } from '../flex-report-charts'
import { FLEX_COLORS } from '../flex-report-blocks'
import { buildSummaryReportFlex, collectSkipped, fitToLimits, bytesOf, type SummaryReportInput } from '../flex-summary-report'
import { canSumProfit, combineTotals, isMixedFinanceRules, sumTrend } from '@/lib/line-report/aggregate'
import type { Block, TemplateV1 } from '@/lib/line-report/template'
import type { GroupSummary, ShopSummary, Trend } from '@/lib/line-report/types'

type N = { type: string; text?: string; contents?: N[]; height?: string; width?: string; [k: string]: unknown }
const flat = (x: unknown): N[] => (x && typeof x === 'object' ? [x as N, ...Object.values(x as object).flatMap(flat)] : [])
const texts = (x: unknown) => flat(x).filter((n) => n.type === 'text').map((n) => n.text as string)
const bars = (x: unknown) => flat(x).filter((n) => n.type === 'box' && (n.height?.endsWith('%') || n.width?.endsWith('%')))
const colorsOf = (x: unknown) => new Set(flat(x).flatMap((n) => [n.color, n.backgroundColor].filter((c): c is string => typeof c === 'string')))
const ALLOWED = new Set([FLEX_COLORS.ACCENT, FLEX_COLORS.INK, FLEX_COLORS.SLATE, FLEX_COLORS.GRID_GRAY, FLEX_COLORS.DANGER, FLEX_COLORS.CONFIRMED_GREEN, FLEX_COLORS.PENDING_YELLOW])
const dots = (x: unknown) => flat(x).filter((n) => n.position === 'absolute')

const dates = (from: string, n = 7) => {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00Z`)
  for (let i = 0; i < n; i++, d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10))
  return out
}
const trend = (confirmed: number[], orders = confirmed.map((v) => Math.round(v / 100)), from = '2026-10-01', unconfirmed = confirmed.map(() => 0)): Trend => ({
  dates: dates(from, confirmed.length),
  confirmed,
  unconfirmed,
  orders,
})

describe('trendChart (AC-09-1/3/5)', () => {
  const t = trend([1000, 4000, 0, 800, 5600, 2200, 3100])
  const node = trendChart({ trend: t, measure: 'sales', word: 'คำสั่งซื้อ' })

  it('ยอดขาย: แท่งเขียว (ยืนยันแล้ว) · ป้ายตัวเลขเฉพาะเหนือแท่งสูงสุด ไม่มี ฿ · ไม่มีค่าใช้จ่าย = ไม่มีเส้น (ทับขอบแท่ง)', () => {
    const b = bars(node)
    expect(b).toHaveLength(6) // วันที่ 0 ไม่มีแท่ง
    expect(b.find((x) => x.height === '80%')).toBeTruthy()
    expect(colorsOf(b)).toContain(FLEX_COLORS.CONFIRMED_GREEN)
    expect(texts(node)).toContain('5.6k')
    expect(texts(node).some((s) => s.includes('฿'))).toBe(false)
    expect(texts(node)).toContain('ยอดขาย 7 วัน')
    expect(dots(node)).toHaveLength(0)
  })
  it('รอยืนยัน = ส่วนเหลืองปลายแท่ง · แท่งสูงตามยอดรวม (ยืนยัน+รอยืนยัน)', () => {
    const x = trendChart({ trend: trend([0, 0, 0, 0, 0, 0, 300], undefined, undefined, [0, 0, 0, 0, 0, 0, 100]), measure: 'sales', word: 'x' })
    expect(texts(x)).toContain('400')
    const yellow = flat(x).find((n) => n.backgroundColor === FLEX_COLORS.PENDING_YELLOW && n.type === 'box' && n.height)!
    expect(yellow.height).toBe('25%')
    expect(texts(x)).toContain('รอยืนยัน')
  })
  it('มีค่าใช้จ่าย → แท่งแดงข้างแท่งยอดขาย · เส้น = ยอดขาย − ค่าใช้จ่าย (ติดลบชิดพื้น)', () => {
    const x = trendChart({ trend: trend([1000, 1000, 1000, 1000, 1000, 1000, 1000]), measure: 'sales', word: 'x', expense: [0, 500, 1000, 2000, 0, 0, 0] })
    const line = dots(x)
    const flatSegs = line.filter((n) => n.height === '3px')
    // แท่งแดง 3 วัน + สัญลักษณ์คำอธิบาย + ช่วงเส้นวันติดลบ 1 ช่วง
    expect(flat(x).filter((n) => n.backgroundColor === FLEX_COLORS.EXPENSE_RED && !line.includes(n))).toHaveLength(3 + 1)
    expect(texts(x)).toContain('ยอดขายและค่าใช้จ่าย 7 วัน')
    expect(texts(x)).toContain('ยอดขายหลังหักค่าใช้จ่าย')
    // max = 2000 → ยอด 1000 = 40% · หลังหัก 500 = 20% · 0 = 0% · -1000 = 0% (สีแดง = ขาดทุน)
    expect(flatSegs.map((n) => n.offsetBottom)).toEqual(['40%', '20%', '0%', '0%', '40%', '40%', '40%'])
    expect(flatSegs.map((n) => n.backgroundColor)).toEqual([...Array(3).fill(FLEX_COLORS.ACCENT), FLEX_COLORS.EXPENSE_RED, ...Array(3).fill(FLEX_COLORS.ACCENT)])
    // ช่วงแนวนอนต่อกันไม่ขาด: ขอบขวาของวัน i = ขอบซ้ายของวัน i+1 · ครบ 100%
    const w = flatSegs.map((n) => [parseInt(n.offsetStart as string), parseInt(n.width as string)])
    for (let i = 1; i < w.length; i++) expect(w[i][0]).toBe(w[i - 1][0] + w[i - 1][1])
    expect(w.at(-1)![0] + w.at(-1)![1]).toBe(100)
    // ช่วงแนวตั้งเฉพาะวันที่ระดับเปลี่ยน: 40→20, 20→0, 0→40 (0→0 และ 40→40 ไม่มี)
    expect(line.filter((n) => n.width === '3px').map((n) => n.height)).toEqual(['20%', '20%', '40%'])
  })
  it('ป้ายใต้แท่ง = วันย่อไทย + วันที่ · คร่อมเดือนวันที่ไม่ค้าง', () => {
    const x = trendChart({ trend: trend([1000, 2000, 3000, 4000, 5000, 6000, 7000], undefined, '2026-09-28'), measure: 'sales', word: 'x' })
    expect(texts(x).filter((s) => /^\d+$/.test(s))).toEqual(['28', '29', '30', '1', '2', '3', '4'])
    expect(texts(x)).toContain('จ') // 2026-09-28 = จันทร์
  })
  it('ล้านบาท: ป้ายย่อ ไม่ยาวเกินแท่งหนึ่งแท่ง', () => {
    const x = trendChart({ trend: trend([0, 0, 0, 0, 0, 0, 18_902_340]), measure: 'sales', word: 'x' })
    expect(texts(x)).toContain('18.9M')
  })
  it('ค่าเดียว: แท่งเดียว + ป้ายเดียว', () => {
    const x = trendChart({ trend: trend([0, 0, 0, 5000, 0, 0, 0]), measure: 'sales', word: 'x' })
    expect(bars(x)).toHaveLength(1)
    expect(texts(x)).toContain('5k')
  })
  it('ค่าที่เล็กจนปัดเป็น 0% ยังสูง ≥2% (>0 ต้องเห็น) · 0 = ไม่มีแท่ง', () => {
    const x = trendChart({ trend: trend([1, 0, 0, 0, 0, 0, 1_000_000]), measure: 'sales', word: 'x' })
    expect(bars(x).map((b) => b.height)).toContain('2%')
  })
  it('0 ทั้งหมด: เส้นฐานแบน + ข้อความ (ยอดขาย/ตามคำของ vertical) ไม่มีแท่ง', () => {
    const z = trend([0, 0, 0, 0, 0, 0, 0])
    const s = trendChart({ trend: z, measure: 'sales', word: 'x' })
    expect(bars(s)).toHaveLength(0)
    expect(texts(s)).toContain('ยังไม่มียอดขายใน 7 วันนี้')
    expect(flat(s).some((n) => n.height === '2px' && n.backgroundColor === FLEX_COLORS.GRID_GRAY)).toBe(true)
    expect(texts(trendChart({ trend: z, measure: 'orders', word: 'บริการ' }))).toContain('ยังไม่มีบริการใน 7 วันนี้')
  })
  it('measure=orders ใช้จำนวนใบ ไม่ใช่ยอดเงิน', () => {
    const x = trendChart({ trend: trend([9_000_000, 1, 1, 1, 1, 1, 1], [3, 12, 0, 0, 0, 0, 0]), measure: 'orders', word: 'บิลเข้าพัก' })
    expect(texts(x)).toContain('12')
    expect(texts(x).some((s) => s.startsWith('฿'))).toBe(false)
    expect(texts(x)).toContain('บิลเข้าพัก 7 วัน')
    expect(dots(x)).toHaveLength(0)
  })
  it('ไม่มีหมายเหตุแท่งสุดท้าย (หัวรายงานบอกเวลาแล้ว) · ยอดไม่ครบยังต้องบอก', () => {
    expect(texts(node).some((s) => s.includes('แท่งสุดท้าย'))).toBe(false)
    expect(texts(trendChart({ trend: t, measure: 'sales', word: 'x', incomplete: true })).some((s) => s.includes('ยอดรวมยังไม่ครบ'))).toBe(true)
    expect(texts(node).some((s) => s.includes('ยังไม่ครบ'))).toBe(false)
  })
})

const shop = (name: string, o: Partial<ShopSummary> = {}, vertical = 'ONLINE_SALES'): ShopSummary => ({
  shop: { id: name, name, vertical },
  state: 'OK',
  orders: 10,
  confirmed: 1000,
  unconfirmed: 0,
  cancelled: 0,
  ...o,
})

describe('compareChart (AC-09-4/5)', () => {
  it('ร้าน OK < 2 → null (ร้านล้มทำให้เหลือ 1 ก็ข้าม)', () => {
    expect(compareChart([shop('ก'), shop('ข', { state: 'ERROR' })], 'sales', 'x')).toBeNull()
    expect(compareChart([shop('ก')], 'sales', 'x')).toBeNull()
  })
  it('เรียงมาก→น้อย · เท่ากันเรียงชื่อ ก→ฮ · แท่งเขียว/เหลือง · ERROR/EXCLUDED ไม่เข้า', () => {
    const n = compareChart(
      [shop('ฮ', { confirmed: 500 }), shop('ข', { confirmed: 500 }), shop('ค', { confirmed: 9000 }), shop('x', { state: 'EXCLUDED', confirmed: 99999 })],
      'sales',
      'x',
    )!
    const names = texts(n).filter((s) => ['ฮ', 'ข', 'ค', 'x'].includes(s))
    expect(names).toEqual(['ค', 'ข', 'ฮ'])
    expect(bars(n).map((b) => b.width)).toEqual(['100%', '6%', '6%'])
    expect(colorsOf(n)).toContain(FLEX_COLORS.CONFIRMED_GREEN)
    expect(texts(n)).toContain('9k')
  })
  it('ชื่อ 50 ตัวอักษร: maxLines 1 ที่ ~38% · JSON ไม่พัง', () => {
    const long = 'ก็'.repeat(25)
    const n = compareChart([shop(long, { confirmed: 5 }), shop('ข', { confirmed: 3 })], 'sales', 'x')!
    const nm = flat(n).find((x) => x.text === long)!
    expect(nm.maxLines).toBe(1)
    expect(nm.flex).toBe(38)
    expect(() => JSON.parse(JSON.stringify(n))).not.toThrow()
  })
  it('ค่า 0 ไม่มีแท่ง · ทุกร้าน 0 = ไม่มีแท่งเลย (ไม่ขีดเส้น accent)', () => {
    expect(bars(compareChart([shop('ก', { confirmed: 0 }), shop('ข', { confirmed: 0 })], 'sales', 'x')!)).toHaveLength(0)
  })
  it('orders: เลขจำนวน ไม่มี ฿ · ป้ายใช้คำของ vertical', () => {
    const n = compareChart([shop('ก', { orders: 7 }), shop('ข', { orders: 3 })], 'orders', 'บริการ')!
    expect(texts(n)).toContain('เทียบรายร้าน · บริการ')
    expect(texts(n).some((s) => s.startsWith('฿'))).toBe(false)
  })
  it('ร้านเยอะ: ตัดที่ 10 แถว + "…และอีก N ร้าน"', () => {
    const many = Array.from({ length: 13 }, (_, i) => shop(`ร้าน${String(i).padStart(2, '0')}`, { confirmed: 100 + i }))
    const n = compareChart(many, 'sales', 'x')!
    expect(bars(n)).toHaveLength(COMPARE_ROW_LIMIT)
    expect(texts(n)).toContain('…และอีก 3 ร้าน')
  })
})

// ─── ผ่าน composer (ต่อเข้าเทมเพลต) ────────────────────────────────────────────
const win = { startIso: '2026-10-05', endIso: '2026-10-05', computedAt: '2026-10-05T11:00:00.000Z' } // 18:00 ไทย
const mkSummary = (shops: ShopSummary[], o: Partial<GroupSummary> = {}): GroupSummary => ({
  window: win,
  shops,
  total: combineTotals(shops),
  profitSummable: canSumProfit(shops.map((s) => s.shop)),
  mixedFinanceRules: isMixedFinanceRules(shops.map((s) => s.shop)),
  ...o,
})
const withTrend = (shops: ShopSummary[], o: Partial<GroupSummary> = {}) => {
  const t = trend([100, 200, 300, 400, 500, 600, 700], [1, 2, 3, 4, 5, 6, 7], '2026-09-29')
  const sh = shops.map((s) => (s.state === 'OK' ? { ...s, trend: t } : s))
  return mkSummary(sh, { trend: sumTrend(sh), ...o })
}
const block = (type: 'chart_trend' | 'chart_compare', measure: 'sales' | 'orders' = 'sales'): Block => ({ id: type, type, measure })
const T = (blocks: Block[]): TemplateV1 => ({ v: 1, button: { show: true, label: 'เปิด Deep' }, blocks })
const run = (t: TemplateV1, s: GroupSummary, o: Partial<SummaryReportInput> = {}) => buildSummaryReportFlex({ summary: s, kind: 'DAILY', template: t, ...o })
const orders: Block = { id: 'o', type: 'orders' }

beforeEach(() => {
  process.env.NEXT_PUBLIC_SELLER_URL = 'https://seller.deepthailand.app'
})
afterEach(() => {
  delete process.env.NEXT_PUBLIC_SELLER_URL
})

describe('ต่อเข้า composer', () => {
  it('สีทุกจุดอยู่ในชุดที่รู้จัก · ไม่มี image (AC-09-7)', () => {
    for (const s of [withTrend([shop('ก'), shop('ข', { confirmed: 7 })]), withTrend([shop('ก'), shop('ข', { state: 'ERROR' })], { trendPartial: true })]) {
      const m = run(T([orders, block('chart_trend'), block('chart_compare', 'orders')]), s)
      for (const c of colorsOf(m)) expect(ALLOWED.has(c as never)).toBe(true)
      expect(JSON.stringify(m)).not.toContain('"image"')
    }
    // กราฟล้วน (ไม่รวมหมายเหตุ/ปุ่ม) ไม่มีสีเตือน
    const only = trendChart({ trend: trend([1, 2, 3, 4, 5, 6, 7]), measure: 'sales', word: 'x' })
    for (const c of colorsOf(only)) expect([FLEX_COLORS.ACCENT, FLEX_COLORS.INK, FLEX_COLORS.SLATE, FLEX_COLORS.GRID_GRAY, FLEX_COLORS.CONFIRMED_GREEN, FLEX_COLORS.PENDING_YELLOW]).toContain(c)
  })
  it('ไม่มีหมายเหตุแท่งสุดท้ายทุกรอบ (หัวรายงานมี "ข้อมูล ณ" แล้ว)', () => {
    const s = withTrend([shop('ก'), shop('ข')])
    expect(texts(run(T([orders, block('chart_trend')]), s)[0].contents).some((x) => x.includes('แท่งสุดท้าย'))).toBe(false)
    const full = { ...s, window: { ...win, fullDay: true } }
    expect(texts(run(T([orders, block('chart_trend')]), full)[0].contents).some((x) => x.includes('แท่งสุดท้าย'))).toBe(false)
    const yest = { ...s, window: { ...win, endIso: '2026-10-04' } }
    expect(texts(run(T([orders, block('chart_trend')]), yest)[0].contents).some((x) => x.includes('แท่งสุดท้าย'))).toBe(false)
  })
  it('ไม่มี trend → ข้าม + skipped · compare ร้าน OK เหลือ 1 → ข้าม + skipped', () => {
    const m = run(T([orders, block('chart_trend'), block('chart_compare')]), mkSummary([shop('ก'), shop('ข', { state: 'ERROR' })]))
    expect(collectSkipped(m).map((s) => s.label)).toEqual(['กราฟ 7 วัน', 'กราฟเทียบรายร้าน'])
    expect(JSON.stringify(m[0].contents)).not.toContain('เทียบรายร้าน')
  })
  it('trendPartial → หมายเหตุยอดไม่ครบใต้กราฟ', () => {
    const m = run(T([orders, block('chart_trend')]), withTrend([shop('ก'), shop('ข', { state: 'ERROR' })], { trendPartial: true }))
    expect(texts(m[0].contents).filter((x) => x.includes('ยอดรวมยังไม่ครบ')).length).toBeGreaterThanOrEqual(2) // ของยอดรวมเดิม + ใต้กราฟ
  })
  it('ป้ายจำนวนต่อ vertical: ONLINE / SERVICE / LODGING / ผสม', () => {
    const word = (v1: string, v2: string) => {
      const s = withTrend([shop('ก', {}, v1), shop('ข', {}, v2)])
      return texts(run(T([orders, block('chart_trend', 'orders')]), s)[0].contents).find((x) => x.endsWith(' 7 วัน'))
    }
    expect(word('ONLINE_SALES', 'ONLINE_SALES')).toBe('คำสั่งซื้อ 7 วัน')
    expect(word('SERVICE_QUEUE', 'SERVICE_QUEUE')).toBe('บริการ 7 วัน')
    expect(word('LODGING', 'LODGING')).toBe('บิลเข้าพัก 7 วัน')
    expect(word('ONLINE_SALES', 'LODGING')).toBe('รายการ 7 วัน')
  })
})

describe('{ยอดสะสมรอบ} ดึงสำเร็จบางร้าน (partial-data)', () => {
  const cyc = (failedShops: number) => ({ startIso: '2026-10-01', endIso: '2026-10-05', totals: { orders: 5, confirmed: 777, unconfirmed: 0, cancelled: 0 }, failedShops })
  const tpl = T([orders, { id: 'tx', type: 'text', style: { bold: false, size: 'm', color: 'ink' }, runs: [{ t: 'สะสม ' }, { tok: 'cycle_sales' }] }])
  const s = mkSummary([shop('ก'), shop('ข')])
  it('มีร้านล้ม → หมายเหตุไม่ครบใต้ข้อความ · ไม่มีร้านล้ม → ไม่มี', () => {
    expect(texts(run(tpl, s, { cycleToDate: cyc(1) })[0].contents)).toContain('ยอดสะสมรอบยังไม่ครบ เพราะดึงข้อมูลบางร้านไม่สำเร็จ')
    expect(texts(run(tpl, s, { cycleToDate: cyc(0) })[0].contents).some((x) => x.includes('ยอดสะสมรอบยังไม่ครบ'))).toBe(false)
  })
})

describe('ลำดับตัดทอน (AC-EXT-08-1 · FR-EXT-08)', () => {
  const free: Block = { id: 'tx', type: 'text', style: { bold: true, size: 'm', color: 'accent' }, runs: [{ t: 'ข้อความอิสระต้องอยู่ครบทุกตัวอักษร' }] }
  const big = () =>
    withTrend(
      Array.from({ length: 80 }, (_, i) =>
        shop(`ร้านชื่อยาวมากเลย${i}`.padEnd(50, 'ก'), { orders: 100 + i, confirmed: 5000 + i, top3: [0, 1, 2].map((k) => ({ name: 'ส'.repeat(60) + k, qty: 9, amount: 9 })) }),
      ),
    )
  const tpl = T([free, orders, { id: 's', type: 'shops', top3: true, profit: false }, block('chart_trend'), block('chart_compare')])

  it('ล้นเพดาน → ตัดตามลำดับ Top3 → กราฟ(+หมายเหตุ) → ย่อรายร้าน · ข้อความอิสระ/หัว/ยอดรวมไม่ถูกตัด', () => {
    const m = run(tpl, big())
    const before = JSON.stringify(m[0].contents)
    expect(before).toContain('เทียบรายร้าน')
    const fitted = fitToLimits(m)
    const after = JSON.stringify(fitted[0].contents)
    expect(after).not.toContain('เทียบรายร้าน')
    expect(after).not.toContain('ยอดขาย 7 วัน')
    expect(after).toContain('กราฟถูกตัดเพราะข้อความยาวเกินที่ LINE รับได้')
    expect(after).toContain('ข้อความอิสระต้องอยู่ครบทุกตัวอักษร')
    expect(after).toContain('…และอีก 70 ร้าน') // ถึงระดับ 3
    expect(collectSkipped(fitted).some((s) => s.reason.includes('ถูกตัด'))).toBe(true)
    expect(bytesOf(after)).toBeLessThanOrEqual(30_000)
  })
  it('ตัดแค่พอ: จำนวนร้านที่ตัด Top3 แล้วยังล้นแต่ตัดกราฟแล้วพอดี → หยุดที่ระดับ 2 (ไม่ย่อรายร้าน)', () => {
    const t = T([orders, { id: 's', type: 'shops', top3: true, profit: false }, block('chart_trend'), block('chart_compare')])
    const mk = (n: number) => withTrend(Array.from({ length: n }, (_, i) => shop(`ร้านทดสอบ${i}`, { top3: [{ name: 'ส'.repeat(60), qty: 9, amount: 9 }] })))
    const sizeAt = (n: number, noChart: boolean) => bytesOf(JSON.stringify(fitToLimits(run(noChart ? T([orders, { id: 's', type: 'shops', top3: false, profit: false }]) : t, mk(n)))[0].contents))
    // หา n ที่เมื่อไม่ตัดกราฟยังเกิน แต่ไม่มีกราฟแล้วพอดี
    const n = Array.from({ length: 200 }, (_, i) => i + 20).find((k) => sizeAt(k, true) <= 30_000 && bytesOf(JSON.stringify(run(T([orders, { id: 's', type: 'shops', top3: false, profit: false }, block('chart_trend'), block('chart_compare')]), mk(k))[0].contents)) > 30_000)
    expect(n).toBeDefined()
    const out = JSON.stringify(fitToLimits(run(t, mk(n!)))[0].contents)
    expect(out).toContain('กราฟถูกตัดเพราะข้อความยาวเกินที่ LINE รับได้')
    expect(out).toContain(`ร้านทดสอบ${n! - 1}`) // ยังมีรายร้านครบ = ไม่ย่อรายร้าน
  })
  it('ไม่มีกราฟ → ข้ามระดับกราฟ (ไม่มีหมายเหตุกราฟ)', () => {
    const fitted = fitToLimits(run(T([orders, { id: 's', type: 'shops', top3: true, profit: false }]), big()))
    expect(JSON.stringify(fitted[0].contents)).not.toContain('กราฟถูกตัด')
  })
})
