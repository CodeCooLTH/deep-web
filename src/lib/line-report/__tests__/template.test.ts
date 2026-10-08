import { describe, expect, it } from 'vitest'
import {
  TOKENS, TOKEN_KEYS, authoredLength, defaultTemplateFromFlags, deriveFlags, deriveNeeds, parseMarkup, resolveTemplate, serializeMarkup,
  type Run, type TemplateGroup, type TemplateV1,
} from '../template'
import { validateTemplate } from '../validations'

const KEYS = ['showOrders', 'showSales', 'showCancelled', 'showTopProducts', 'showProfit'] as const
const group = (mask: number, over: Partial<TemplateGroup> = {}): TemplateGroup => ({
  showOrders: !!(mask & 1), showSales: !!(mask & 2), showCancelled: !!(mask & 4), showTopProducts: !!(mask & 8), showProfit: !!(mask & 16),
  attachCycleToDaily: false, monthlyEnabled: false, ...over,
})

describe('defaultTemplateFromFlags ∘ deriveFlags', () => {
  it('= identity ครบ 31 ชุด flag (× attach/monthly ทุกชุด) และแบบมาตรฐานผ่าน schema', () => {
    for (let mask = 1; mask < 32; mask++) {
      for (const attach of [false, true]) {
        for (const monthly of [false, true]) {
          const g = group(mask, { attachCycleToDaily: attach, monthlyEnabled: monthly })
          const t = defaultTemplateFromFlags(g)
          const d = deriveFlags(t)
          for (const k of KEYS) expect(d[k], `${k} mask=${mask}`).toBe(g[k])
          // cycle เข้าเทมเพลตเฉพาะ showSales ∧ attach ∧ monthly (FR-EXT-01) — ที่เหลือ derive = false
          expect(d.attachCycleToDaily).toBe(g.showSales && attach && monthly)
          expect(validateTemplate(t).ok).toBe(true)
        }
      }
    }
  })
  it('ลำดับตาม FR-EXT-01 + ปุ่มค่าเริ่มต้น', () => {
    const t = defaultTemplateFromFlags(group(31, { attachCycleToDaily: true, monthlyEnabled: true }))
    expect(t.blocks.map((b) => b.type)).toEqual(['orders', 'sales', 'cancelled', 'profit', 'separator', 'shops', 'separator', 'cycle'])
    expect(t.button).toEqual({ show: true, label: 'เปิด Deep' })
    expect(t.title).toBeUndefined()
    expect(t.blocks.find((b) => b.type === 'shops')).toMatchObject({ top3: true, profit: true })
  })
})

describe('resolveTemplate', () => {
  it('template ที่บันทึกไว้ชนะ · null → แบบมาตรฐาน', () => {
    const saved: TemplateV1 = { v: 1, button: { show: false, label: 'x' }, blocks: [{ id: 'a', type: 'orders' }] }
    expect(resolveTemplate({ ...group(31), template: saved })).toBe(saved)
    expect(resolveTemplate({ ...group(3), template: null })).toEqual(defaultTemplateFromFlags(group(3)))
  })
})

describe('deriveFlags / deriveNeeds จากโทเคน', () => {
  const text = (...runs: Run[]): TemplateV1 => ({
    v: 1, button: { show: true, label: 'x' },
    blocks: [{ id: 't', type: 'text', style: { bold: false, size: 'm', color: 'ink' }, runs }],
  })
  it('{กำไร} พลิก showProfit · {ยอดสะสมรอบ} พลิก attach · โทเคนอื่นไม่พลิก flag', () => {
    expect(deriveFlags(text({ tok: 'profit' })).showProfit).toBe(true)
    expect(deriveFlags(text({ tok: 'cycle_sales' })).attachCycleToDaily).toBe(true)
    const f = deriveFlags(text({ tok: 'sales_counted' }, { tok: 'orders_count' }, { tok: 'cancelled_count' }))
    expect(KEYS.some((k) => f[k])).toBe(false)
  })
  it('needs: โทเคน/กราฟขอข้อมูลได้แม้ไม่มีบล็อกตัวเลข', () => {
    expect(deriveNeeds(text({ tok: 'sales_pending' }))).toMatchObject({ needSeries: true, showSales: false })
    expect(deriveNeeds(text({ tok: 'cancelled_count' }))).toMatchObject({ needCancelled: true, showCancelled: false })
    const chart: TemplateV1 = { v: 1, button: { show: true, label: 'x' }, blocks: [{ id: 'c', type: 'chart_trend', measure: 'sales' }, { id: 'd', type: 'chart_compare', measure: 'orders' }] }
    expect(deriveNeeds(chart)).toMatchObject({ needTrend7: true, needCompare: true, needSeries: true, needPnl: false, needTop3: false })
  })
})

describe('markup', () => {
  it('ตัวอย่างพื้นฐาน', () => {
    expect(parseMarkup('สวัสดี **ทีม** ยอด {ยอดขาย} ^^วันนี้^^')).toEqual({
      ok: true,
      runs: [{ t: 'สวัสดี ' }, { t: 'ทีม', b: true }, { t: ' ยอด ' }, { tok: 'sales_counted' }, { t: ' ' }, { t: 'วันนี้', accent: true }],
    })
    expect(parseMarkup('**^^ทั้งคู่^^**')).toEqual({ ok: true, runs: [{ t: 'ทั้งคู่', b: true, accent: true }] })
  })
  it.each([
    ['**ไม่ปิด', 'UNCLOSED_BOLD'],
    ['^^ไม่ปิด', 'UNCLOSED_ACCENT'],
    ['{ชื่อร้าน', 'UNCLOSED_TOKEN'],
    ['{ตัวแปรลอย}', 'UNKNOWN_TOKEN'],
    ['**a^^b**c^^', 'BAD_NESTING'],
  ])('error ที่อธิบายได้: %s', (src, code) => {
    const r = parseMarkup(src)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe(code)
      expect(r.message.length).toBeGreaterThan(0)
    }
  })
  it('roundtrip 500 ตัวอย่างสุ่ม (seed คงที่): parse(serialize(runs)) = runs', () => {
    let seed = 20261005
    const rnd = (n: number) => ((seed = (seed * 1664525 + 1013904223) % 4294967296), Math.floor((seed / 4294967296) * n))
    const words = ['สวัสดี', 'ทีม ', 'เก่ง', ' ', 'ab', 'ก็', '😀', 'ผู้ที่']
    for (let i = 0; i < 500; i++) {
      const runs: Run[] = []
      for (let n = rnd(6); n >= 0; n--) {
        const flags = { ...(rnd(2) ? { b: true as const } : {}), ...(rnd(2) ? { accent: true as const } : {}) }
        const run: Run = rnd(4) === 0 ? { tok: TOKEN_KEYS[rnd(TOKEN_KEYS.length)], ...flags } : { t: words[rnd(words.length)], ...flags }
        const last = runs[runs.length - 1]
        // normalize: text ติดกันสไตล์เท่ากันรวมเป็นก้อนเดียว
        if (last && 't' in last && 't' in run && !!last.b === !!run.b && !!last.accent === !!run.accent) last.t += run.t
        else runs.push(run)
      }
      expect(parseMarkup(serializeMarkup(runs)), serializeMarkup(runs)).toEqual({ ok: true, runs })
    }
  })
})

describe('authoredLength', () => {
  it('นับ code point ไม่ใช่ .length: emoji + สระ/วรรณยุกต์ไทยซ้อน', () => {
    expect(authoredLength([{ t: '😀😀' }])).toBe(2) // .length = 4
    expect(authoredLength([{ t: '👨‍👩‍👧' }])).toBe(5) // ZWJ sequence = 5 code point (.length = 8)
    expect(authoredLength([{ t: 'ที่' }])).toBe(3) // ท + ี + ่
    expect(authoredLength([{ t: 'ก' }, { t: '😀', b: true }])).toBe(2)
  })
  it('โทเคนนับเป็นป้ายมาตรฐาน (รวมปีกกา)', () => {
    expect(authoredLength([{ tok: 'shop_name' }])).toBe(Array.from(TOKENS.shop_name).length)
    expect(authoredLength([{ tok: 'sales_counted' }, { t: 'x' }])).toBe(Array.from('{ยอดขาย}').length + 1)
  })
  it('ป้ายเก่าก่อน 2026-10-08 ยัง parse เป็นโทเคนเดิม', () => {
    expect(parseMarkup('{ยอดขาย (นับแล้ว)} {ยังไม่นับ}')).toEqual({ ok: true, runs: [{ tok: 'sales_counted' }, { t: ' ' }, { tok: 'sales_pending' }] })
  })
})

// ─── EXT-EXP: บล็อกค่าใช้จ่าย/ยอดหลังหักค่าใช้จ่าย ────────────────────────────────
import { deriveExposure, needsExpenseConfirm } from '../template'
const tpl = (...types: ('expense' | 'net_sales' | 'orders' | 'sales')[]): TemplateV1 => ({
  v: 1, button: { show: true, label: 'x' }, blocks: types.map((type, i) => ({ id: `b${i}`, type })),
})
describe('EXP: deriveExposure / needsExpenseConfirm / deriveFlags', () => {
  it('deriveExposure ครบทุกทางเข้า (รอบนี้ 2 ทาง) + ไม่มีสักทาง', () => {
    expect(deriveExposure(tpl('expense')).expense).toBe(true)
    expect(deriveExposure(tpl('net_sales')).expense).toBe(true)
    expect(deriveExposure(tpl('orders', 'sales')).expense).toBe(false)
    expect(deriveNeeds(tpl('sales', 'net_sales')).needExpense).toBe(true)
    expect(deriveNeeds(tpl('sales')).needExpense).toBe(false)
    expect(deriveNeeds(tpl('expense')).needPnl).toBe(false)
  })
  it('deriveFlags คืน key เดิม 6 ตัวเท่านั้น (AC-EXP-02-3 — กันรั่วลง prisma.update)', () => {
    expect(Object.keys(deriveFlags(tpl('sales', 'expense', 'net_sales'))).sort()).toEqual(
      ['attachCycleToDaily', 'showCancelled', 'showOrders', 'showProfit', 'showSales', 'showTopProducts'],
    )
  })
  it('2 บล็อกใหม่ไม่พลิก show* ตัวไหน (METRIC_REQUIRED ยังทำงาน)', () => {
    const f = deriveFlags(tpl('expense', 'net_sales'))
    expect([f.showOrders, f.showSales, f.showCancelled, f.showTopProducts, f.showProfit]).toEqual([false, false, false, false, false])
  })
  it('needsExpenseConfirm: null→มี ถาม · มีอยู่แล้ว ไม่ถาม · ปิด ไม่ถาม · สลับ expense↔net_sales ไม่ถาม', () => {
    expect(needsExpenseConfirm(null, tpl('sales', 'expense'))).toBe(true)
    expect(needsExpenseConfirm(tpl('sales'), tpl('sales', 'net_sales'))).toBe(true)
    expect(needsExpenseConfirm(tpl('expense'), tpl('expense', 'sales'))).toBe(false)
    expect(needsExpenseConfirm(tpl('expense'), tpl('net_sales'))).toBe(false)
    expect(needsExpenseConfirm(tpl('expense'), tpl('sales'))).toBe(false)
    expect(needsExpenseConfirm(null, tpl('sales'))).toBe(false)
  })
  it('defaultTemplateFromFlags ไม่ปล่อยบล็อกใหม่เลยทั้ง 31 ชุด', () => {
    for (let m = 1; m < 32; m++) {
      const types = defaultTemplateFromFlags(group(m, { attachCycleToDaily: true, monthlyEnabled: true })).blocks.map((b) => b.type)
      expect(types).not.toContain('expense')
      expect(types).not.toContain('net_sales')
    }
  })
})
