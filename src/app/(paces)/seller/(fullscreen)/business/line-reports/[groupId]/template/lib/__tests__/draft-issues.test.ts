import { describe, expect, it } from 'vitest'
import { defaultTemplateFromFlags, type TemplateV1 } from '@/lib/line-report/template'
import { METRIC_REQUIRED_HELPER } from '@/lib/line-report/settings-guards'
import { analyzeDraft, EMPTY_TEXT_HINT, PROFIT_TOKEN_HINT } from '../draft-issues'
import { initState, reducer } from '../reducer'

const saved = (): TemplateV1 => defaultTemplateFromFlags({ showOrders: true, showSales: true, showCancelled: false, showTopProducts: false, showProfit: false, attachCycleToDaily: false, monthlyEnabled: false })
const run = (draft: TemplateV1, markup: Record<string, string> = {}, over: Partial<Parameters<typeof analyzeDraft>[0]> = {}) =>
  analyzeDraft({ draft, markupById: markup, saved: saved(), profitConfirmed: false, tooLarge: false, tooLargeReason: null, ...over })
const txt = (id: string, runs: TemplateV1['blocks'][number] extends infer B ? any : never) => ({ id, type: 'text' as const, style: { bold: false, size: 'm' as const, color: 'ink' as const }, runs })

describe('analyzeDraft', () => {
  it('แบบมาตรฐานผ่านทุกด่าน', () => {
    expect(run(saved()).firstReason).toBeNull()
  })
  it('markup ผิด → เหตุแรกเป็นข้อความของ parser', () => {
    const d: TemplateV1 = { ...saved(), blocks: [...saved().blocks, txt('t1', [{ t: 'x' }])] }
    const r = run(d, { t1: 'x **' })
    expect(r.textErrors.t1).toBe('ปิดเครื่องหมาย ** ให้ครบ')
    expect(r.firstReason).toBe('ปิดเครื่องหมาย ** ให้ครบ')
  })
  it('ข้อความว่าง → hint · เกิน 120 → "เกิน N ตัวอักษร"', () => {
    const empty: TemplateV1 = { ...saved(), blocks: [...saved().blocks, txt('t1', [])] }
    expect(run(empty, { t1: '' })).toMatchObject({ emptyTextIds: ['t1'], firstReason: EMPTY_TEXT_HINT })
    const long = 'ก'.repeat(124)
    const d: TemplateV1 = { ...saved(), blocks: [...saved().blocks, txt('t1', [{ t: long }])] }
    expect(run(d, { t1: long }).textErrors.t1).toBe('เกิน 4 ตัวอักษร')
  })
  it('ไม่มีตัวเลขเลย (กราฟอย่างเดียว) → METRIC_REQUIRED_HELPER', () => {
    const d: TemplateV1 = { ...saved(), blocks: [{ id: 'c1', type: 'chart_trend', measure: 'sales' }] }
    expect(run(d)).toMatchObject({ metricMissing: true, firstReason: METRIC_REQUIRED_HELPER })
  })
  it('{กำไร} ที่พิมพ์เองยังไม่ยืนยัน → บล็อก · ยืนยันแล้ว → ผ่าน', () => {
    const d: TemplateV1 = { ...saved(), blocks: [...saved().blocks, txt('t1', [{ tok: 'profit' }])] }
    expect(run(d, { t1: '{กำไร}' })).toMatchObject({ profitUnconfirmed: true, firstReason: PROFIT_TOKEN_HINT })
    expect(run(d, { t1: '{กำไร}' }, { profitConfirmed: true }).firstReason).toBeNull()
  })
  it('ใหญ่เกิน → เหตุจากเกจ · ป้ายปุ่มว่าง → เหตุป้ายปุ่ม', () => {
    expect(run(saved(), {}, { tooLarge: true, tooLargeReason: 'ยาวเกิน' }).firstReason).toBe('ยาวเกิน')
    expect(run({ ...saved(), button: { show: true, label: ' ' } }).firstReason).toMatch(/ป้ายปุ่ม/)
  })
  it('ใช้ร่วมกับ reducer: เพิ่มบล็อกข้อความว่างใหม่ → ยังไม่แดง (touched ว่าง) แต่บันทึกปิด', () => {
    let s = initState(saved(), 0, false)
    s = reducer(s, { type: 'add', block: txt('t1', []) as never })
    const r = run(s.draft, s.markupById)
    expect(r.firstReason).toBe(EMPTY_TEXT_HINT)
    expect(s.touched.t1).toBeUndefined()
  })
})
