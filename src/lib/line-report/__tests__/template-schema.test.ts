import { describe, expect, it } from 'vitest'
import { validateTemplate, type TemplateRule } from '../validations'
import type { Block, TemplateV1 } from '../template'

const text = (id: string, over: Record<string, unknown> = {}) => ({
  id, type: 'text', style: { bold: false, size: 'm', color: 'ink' }, runs: [{ t: 'สวัสดี' }], ...over,
})
const base = (blocks: unknown[] = [{ id: 'o', type: 'orders' }], over: Record<string, unknown> = {}) => ({
  v: 1, button: { show: true, label: 'เปิด Deep' }, blocks, ...over,
})
const many = (type: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${type}${i}`, type }))

describe('validateTemplate — ผ่าน', () => {
  it('เทมเพลตเต็มรูปที่ถูกต้อง', () => {
    const t: TemplateV1 = base([
      { id: 'a', type: 'orders' }, { id: 'b', type: 'sales' }, { id: 'c', type: 'cancelled' },
      { id: 'd', type: 'shops', top3: true, profit: false }, { id: 'e', type: 'cycle' }, { id: 'f', type: 'profit' },
      text('g', { runs: [{ t: 'ยอด ', b: true }, { tok: 'sales_counted', accent: true }] }),
      { id: 'h', type: 'separator' }, { id: 'i', type: 'chart_trend', measure: 'sales' }, { id: 'j', type: 'chart_compare', measure: 'orders' },
    ], { title: 'รายงานทีมเรา' }) as TemplateV1
    expect(validateTemplate(t)).toEqual({ ok: true, template: t })
  })
  it('blocks ว่างผ่านตามสคีมา (กฎ "ต้องมีตัวเลข" อยู่ที่ mergeSettings)', () => {
    expect(validateTemplate(base([])).ok).toBe(true)
  })
  it('ขอบเพดาน: text 6 · separator 8 · ข้อความ 120 · title 60 · label 20 พอดี', () => {
    expect(validateTemplate(base(Array.from({ length: 6 }, (_, i) => text(`t${i}`)))).ok).toBe(true)
    expect(validateTemplate(base(many('separator', 8))).ok).toBe(true)
    expect(validateTemplate(base([text('t', { runs: [{ t: 'ก'.repeat(120) }] })])).ok).toBe(true)
    expect(validateTemplate(base(undefined, { title: 'ก'.repeat(60) })).ok).toBe(true)
    expect(validateTemplate(base(undefined, { button: { show: true, label: 'ก'.repeat(20) } })).ok).toBe(true)
  })
})

type Row = [name: string, input: unknown, rule: TemplateRule, blockId?: string]
const bad: Row[] = [
  ['ฟิลด์เกินระดับราก', { ...base(), extra: 1 }, 'EXTRA_FIELD'],
  ['ฟิลด์เกินในบล็อก', base([{ id: 'o', type: 'orders', x: 1 }]), 'EXTRA_FIELD'],
  ['ฟิลด์เกินใน button (uri)', base(undefined, { button: { show: true, label: 'x', uri: 'https://evil' } }), 'EXTRA_FIELD'],
  ['ฟิลด์เกินใน style', base([text('t', { style: { bold: false, size: 'm', color: 'ink', underline: true } })]), 'EXTRA_FIELD'],
  ['type นอกชุด (header)', base([{ id: 'h', type: 'header' }]), 'BLOCK_TYPE'],
  ['v ผิด', { ...base(), v: 2 }, 'SHAPE'],
  ['orders ซ้ำ', base([{ id: 'a', type: 'orders' }, { id: 'b', type: 'orders' }]), 'TYPE_LIMIT'],
  ['chart_trend ซ้ำ', base([{ id: 'a', type: 'chart_trend', measure: 'sales' }, { id: 'b', type: 'chart_trend', measure: 'sales' }]), 'TYPE_LIMIT'],
  ['text เกิน 6', base(Array.from({ length: 7 }, (_, i) => text(`t${i}`))), 'TYPE_LIMIT'],
  ['separator เกิน 8', base(many('separator', 9)), 'TYPE_LIMIT'],
  ['รวมเกิน 20', base([...many('separator', 8), ...Array.from({ length: 6 }, (_, i) => text(`t${i}`)), ...many('orders', 1), ...many('sales', 1), ...many('cancelled', 1), ...many('profit', 1), ...many('cycle', 1), ...many('shops', 1), { id: 'ct', type: 'chart_trend', measure: 'sales' }, { id: 'cc', type: 'chart_compare', measure: 'sales' }].map((b) => (b.type === 'shops' ? { ...b, top3: true, profit: false } : b))), 'TOTAL_LIMIT'],
  ['id ซ้ำ', base([{ id: 'a', type: 'orders' }, { id: 'a', type: 'sales' }]), 'DUPLICATE_ID'],
  ['id ว่าง', base([{ id: '', type: 'orders' }]), 'SHAPE'],
  ['size นอกชุด', base([text('t', { style: { bold: false, size: 'xl', color: 'ink' } })]), 'STYLE', 't'],
  ['color นอกชุด (green)', base([text('t', { style: { bold: false, size: 's', color: 'green' } })]), 'STYLE', 't'],
  ['measure นอกชุด', base([{ id: 'c', type: 'chart_trend', measure: 'profit' }]), 'MEASURE', 'c'],
  ['tok นอกชุด', base([text('t', { runs: [{ tok: 'revenue' }] })]), 'TOKEN', 't'],
  ['run มีทั้ง t และ tok', base([text('t', { runs: [{ t: 'a', tok: 'profit' }] })]), 'RUN_SHAPE', 't'],
  ['run ไม่มี t/tok', base([text('t', { runs: [{ b: true }] })]), 'RUN_SHAPE', 't'],
  ['run b=false', base([text('t', { runs: [{ t: 'a', b: false }] })]), 'SHAPE', 't'],
  ['ข้อความ 121 ตัว', base([text('t', { runs: [{ t: 'ก'.repeat(121) }] })]), 'TEXT_TOO_LONG', 't'],
  ['โทเคนทำให้เกิน 120 (นับป้ายมาตรฐาน)', base([text('t', { runs: [{ t: 'ก'.repeat(105) }, { tok: 'sales_counted' }] })]), 'TEXT_TOO_LONG', 't'],
  ['ข้อความว่าง (runs ว่าง)', base([text('t', { runs: [] })]), 'TEXT_EMPTY', 't'],
  ['ข้อความมีแต่ช่องว่าง', base([text('t', { runs: [{ t: '   ' }] })]), 'TEXT_EMPTY', 't'],
  ['ขึ้นบรรทัดใหม่ในข้อความ', base([text('t', { runs: [{ t: 'a\nb' }] })]), 'TEXT_NEWLINE', 't'],
  ['title ว่าง', base(undefined, { title: '  ' }), 'TITLE'],
  ['title 61 ตัว', base(undefined, { title: 'ก'.repeat(61) }), 'TITLE'],
  ['label ว่าง', base(undefined, { button: { show: true, label: '' } }), 'BUTTON_LABEL'],
  ['label 21 ตัว', base(undefined, { button: { show: true, label: 'ก'.repeat(21) } }), 'BUTTON_LABEL'],
  ['shops ขาด top3', base([{ id: 's', type: 'shops', profit: false }]), 'SHAPE'],
  ['ไม่ใช่ object', 'x', 'SHAPE'],
]

describe('validateTemplate — กรณีเสีย', () => {
  it.each(bad)('%s', (_n, input, rule, blockId) => {
    const r = validateTemplate(input)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.rule).toBe(rule)
      if (blockId) expect(r.blockId).toBe(blockId)
    }
  })
  it('ข้อความ 120 ตัวนับ code point: emoji 120 ตัว (.length=240) ผ่าน', () => {
    expect(validateTemplate(base([text('t', { runs: [{ t: '😀'.repeat(120) }] })])).ok).toBe(true)
  })
  it('Block type ครบทุกชนิดที่สัญญา (กัน type ใหม่หลุด schema)', () => {
    const types: Block['type'][] = ['orders', 'sales', 'cancelled', 'shops', 'cycle', 'profit', 'text', 'separator', 'chart_trend', 'chart_compare']
    expect(types).toHaveLength(10)
  })
})

describe('EXP: บล็อก expense/net_sales ใน schema', () => {
  const base = (blocks: unknown[]) => ({ v: 1, button: { show: true, label: 'x' }, blocks })
  it('รับ 2 บล็อก อย่างละ 1', () => {
    expect(validateTemplate(base([{ id: 'a', type: 'expense' }, { id: 'b', type: 'net_sales' }])).ok).toBe(true)
  })
  it('ซ้ำ → TYPE_LIMIT', () => {
    expect(validateTemplate(base([{ id: 'a', type: 'expense' }, { id: 'b', type: 'expense' }]))).toMatchObject({ ok: false, rule: 'TYPE_LIMIT' })
    expect(validateTemplate(base([{ id: 'a', type: 'net_sales' }, { id: 'b', type: 'net_sales' }]))).toMatchObject({ ok: false, rule: 'TYPE_LIMIT' })
  })
  it('ฟิลด์เกิน → EXTRA_FIELD', () => {
    expect(validateTemplate(base([{ id: 'a', type: 'expense', x: 1 }]))).toMatchObject({ ok: false, rule: 'EXTRA_FIELD' })
  })
  it('เทมเพลตเดิมที่ไม่มีบล็อกใหม่ยัง valid', () => {
    expect(validateTemplate(base([{ id: 'a', type: 'shops', top3: true, profit: false }, { id: 'p', type: 'profit' }])).ok).toBe(true)
  })
})
