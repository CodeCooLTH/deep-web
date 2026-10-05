import { describe, expect, it } from 'vitest'
import { defaultTemplateFromFlags, type Block, type TemplateV1 } from '@/lib/line-report/template'
import { canAddStructurally, initState, isDirty, reducer, type State } from '../reducer'

const base = (): TemplateV1 => defaultTemplateFromFlags({ showOrders: true, showSales: true, showCancelled: false, showTopProducts: false, showProfit: false, attachCycleToDaily: false, monthlyEnabled: false })
const fresh = (): State => initState(base(), 3, false)
const text = (id: string): Block => ({ id, type: 'text', style: { bold: false, size: 'm', color: 'ink' }, runs: [] })
const ids = (s: State) => s.draft.blocks.map((b) => b.id)

describe('reducer', () => {
  it('เริ่มต้นไม่ dirty · markup ของข้อความถูก serialize ไว้', () => {
    expect(isDirty(fresh())).toBe(false)
    const t: TemplateV1 = { ...base(), blocks: [{ id: 't1', type: 'text', style: { bold: false, size: 'm', color: 'ink' }, runs: [{ t: 'a', b: true }] }] }
    expect(initState(t, 1, true).markupById).toEqual({ t1: '**a**' })
  })
  it('add ต่อท้าย/แทรกตำแหน่ง + เปิดแถวใหม่ + dirty', () => {
    let s = reducer(fresh(), { type: 'add', block: { id: 'n1', type: 'cancelled' } })
    expect(ids(s).at(-1)).toBe('n1')
    expect(s.openId).toBe('n1')
    expect(isDirty(s)).toBe(true)
    s = reducer(s, { type: 'add', block: text('t1'), index: 0 })
    expect(ids(s)[0]).toBe('t1')
    expect(s.markupById.t1).toBe('')
  })
  it('add ชนิดที่เต็มโควตา/เกิน 20 = ไม่เปลี่ยน', () => {
    const s = fresh()
    expect(reducer(s, { type: 'add', block: { id: 'dup', type: 'orders' } })).toBe(s)
    // เติมให้ครบ 20: ชนิดเดี่ยวที่เหลือ 5 + เส้นคั่นอีก 6 (รวม 8) + ข้อความ 4 (ต้องจบที่ 20 พอดี ไม่วนลูป)
    const adds: Block[] = [
      { id: 'a1', type: 'cancelled' }, { id: 'a2', type: 'profit' }, { id: 'a3', type: 'cycle' },
      { id: 'a4', type: 'chart_trend', measure: 'sales' }, { id: 'a5', type: 'chart_compare', measure: 'sales' },
      ...Array.from({ length: 6 }, (_, i): Block => ({ id: `sep${i}`, type: 'separator' })),
      ...Array.from({ length: 4 }, (_, i) => text(`tx${i}`)),
    ]
    const big = adds.reduce((st, block) => reducer(st, { type: 'add', block }), s)
    expect(big.draft.blocks).toHaveLength(20)
    expect(canAddStructurally(big.draft.blocks, 'text')).toBe(false)
    expect(reducer(big, { type: 'add', block: text('tx9') })).toBe(big)
  })
  it('remove แล้ว restore ที่ index เดิม = กลับเป็นเทมเพลตเดิม (ไม่ dirty)', () => {
    const s0 = fresh()
    const idx = 1
    const block = s0.draft.blocks[idx]
    const s1 = reducer(s0, { type: 'remove', id: block.id })
    expect(ids(s1)).not.toContain(block.id)
    const s2 = reducer(s1, { type: 'restore', block, index: idx })
    expect(ids(s2)).toEqual(ids(s0))
    expect(isDirty(s2)).toBe(false)
  })
  it('restore ไม่ใส่ซ้ำเมื่อชนิดนั้นถูกเพิ่มใหม่ไปแล้ว', () => {
    const s0 = fresh()
    const block = s0.draft.blocks[0] // orders
    let s = reducer(s0, { type: 'remove', id: block.id })
    s = reducer(s, { type: 'add', block: { id: 'again', type: 'orders' } })
    expect(reducer(s, { type: 'restore', block, index: 0 })).toBe(s)
  })
  it('remove ล้าง markup + ปิดแถวที่เปิด', () => {
    let s = reducer(fresh(), { type: 'add', block: text('t1') })
    s = reducer(s, { type: 'remove', id: 't1' })
    expect(s.markupById.t1).toBeUndefined()
    expect(s.openId).toBeNull()
  })
  it('move/step ย้ายลำดับ · ขอบเขตผิด = ไม่เปลี่ยน', () => {
    const s0 = fresh()
    const [a, b] = ids(s0)
    expect(ids(reducer(s0, { type: 'move', from: 0, to: 1 })).slice(0, 2)).toEqual([b, a])
    expect(ids(reducer(s0, { type: 'step', id: b, dir: -1 })).slice(0, 2)).toEqual([b, a])
    expect(reducer(s0, { type: 'step', id: a, dir: -1 }).draft.blocks.map((x) => x.id)).toEqual(ids(s0))
    expect(reducer(s0, { type: 'move', from: 0, to: 99 })).toBe(s0)
  })
  it('setMarkup: ผ่าน → อัปเดต runs · ผิด → เก็บ runs ล่าสุดที่ถูก แต่ยังนับว่า dirty', () => {
    let s = reducer(fresh(), { type: 'add', block: text('t1') })
    s = reducer(s, { type: 'setMarkup', id: 't1', src: 'สวัสดี **ทีม**' })
    const runsOk = (s.draft.blocks.find((b) => b.id === 't1') as Extract<Block, { type: 'text' }>).runs
    expect(runsOk).toEqual([{ t: 'สวัสดี ' }, { t: 'ทีม', b: true }])
    s = reducer(s, { type: 'setMarkup', id: 't1', src: 'สวัสดี **ทีม' })
    const runsAfter = (s.draft.blocks.find((b) => b.id === 't1') as Extract<Block, { type: 'text' }>).runs
    expect(runsAfter).toEqual(runsOk)
    expect(s.markupById.t1).toBe('สวัสดี **ทีม')
  })
  it('setMarkup: บรรทัดใหม่กลายเป็นช่องว่าง', () => {
    let s = reducer(fresh(), { type: 'add', block: text('t1') })
    s = reducer(s, { type: 'setMarkup', id: 't1', src: 'a\nb' })
    expect(s.markupById.t1).toBe('a b')
  })
  it('setTitle ว่าง = เอา title ออก (schema ไม่รับสตริงว่าง)', () => {
    let s = reducer(fresh(), { type: 'setTitle', title: 'ยอดประจำวัน' })
    expect(s.draft.title).toBe('ยอดประจำวัน')
    s = reducer(s, { type: 'setTitle', title: '   ' })
    expect('title' in s.draft).toBe(false)
  })
  it('saveOk ทำให้ไม่ dirty (รวม markup ดิบ) + custom=true · แล้วแก้ต่อ = dirty อีก', () => {
    let s = reducer(fresh(), { type: 'add', block: text('t1') })
    s = reducer(s, { type: 'setMarkup', id: 't1', src: 'a **b****c**' })
    expect(isDirty(s)).toBe(true)
    s = reducer(reducer(s, { type: 'saveStart' }), { type: 'saveOk', version: 4 })
    expect(isDirty(s)).toBe(false)
    expect(s.saved).toMatchObject({ version: 4, custom: true })
    expect(s.saving).toBe(false)
    expect(isDirty(reducer(s, { type: 'setMarkup', id: 't1', src: 'x' }))).toBe(true)
  })
  it('saveFail ไม่ revert ฉบับร่าง', () => {
    let s = reducer(fresh(), { type: 'add', block: { id: 'n1', type: 'cancelled' } })
    s = reducer(reducer(s, { type: 'saveStart' }), { type: 'saveFail' })
    expect(ids(s)).toContain('n1')
    expect(s.saving).toBe(false)
  })
  it('markStale ไม่ทิ้งฉบับร่าง · load ทิ้งแล้วใช้ฉบับใหม่ (คงชนิดพรีวิว/ยืนยันกำไร)', () => {
    let s = reducer(fresh(), { type: 'add', block: { id: 'n1', type: 'cancelled' } })
    s = reducer(s, { type: 'setPreviewKind', kind: 'MONTHLY' })
    s = reducer(s, { type: 'confirmProfit' })
    s = reducer(s, { type: 'markStale' })
    expect(s.stale).toBe(true)
    expect(ids(s)).toContain('n1')
    const server = { ...base(), title: 'จากที่อื่น' }
    s = reducer(s, { type: 'load', template: server, version: 9, custom: true })
    expect(s).toMatchObject({ stale: false, previewKind: 'MONTHLY', profitConfirmed: true, saved: { version: 9, custom: true } })
    expect(s.draft.title).toBe('จากที่อื่น')
    expect(isDirty(s)).toBe(false)
  })
  it('setShops/setMeasure แก้เฉพาะบล็อกชนิดที่ตรง', () => {
    let s = fresh()
    const shops = s.draft.blocks.find((b) => b.type === 'shops')!
    s = reducer(s, { type: 'setShops', id: shops.id, patch: { top3: true } })
    expect(s.draft.blocks.find((b) => b.id === shops.id)).toMatchObject({ top3: true })
    s = reducer(s, { type: 'add', block: { id: 'c1', type: 'chart_trend', measure: 'sales' } })
    s = reducer(s, { type: 'setMeasure', id: 'c1', measure: 'orders' })
    expect(s.draft.blocks.find((b) => b.id === 'c1')).toMatchObject({ measure: 'orders' })
  })
})
