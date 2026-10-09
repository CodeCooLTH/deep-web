import { describe, it, expect } from 'vitest'
import { attachEscapeAction, buildAttachPicks, optionGroupsOf, toggleOptionPick } from '@/lib/product-picker-attach'

describe('product-picker-attach', () => {
  it('optionGroupsOf แยกค่า trim และตัดหัวข้อว่าง', () => {
    expect(optionGroupsOf({ สี: 'ครีม, ดำ', ขนาด: ' , ' })).toEqual([{ key: 'สี', values: ['ครีม', 'ดำ'] }])
    expect(optionGroupsOf(null)).toEqual([])
  })
  it('toggleOptionPick: 1 ค่าต่อหัวข้อ · กดซ้ำยกเลิก · ไม่แก้ของเดิม', () => {
    const a = toggleOptionPick({}, 'p', 'สี', 'ครีม')
    const b = toggleOptionPick(a, 'p', 'สี', 'ดำ')
    expect(b.p).toEqual({ สี: 'ดำ' })
    expect(a.p).toEqual({ สี: 'ครีม' })
    expect(toggleOptionPick(b, 'p', 'สี', 'ดำ').p).toEqual({})
  })
  it('buildAttachPicks ตามลำดับที่ติ๊ก และทิ้ง option ของตัวที่ไม่ได้ติ๊ก', () => {
    const picks = { a: { สี: 'ครีม' }, z: { สี: 'ดำ' } }
    expect(buildAttachPicks(['b', 'a'], picks)).toEqual([
      { productId: 'b', selections: [] },
      { productId: 'a', selections: [{ key: 'สี', value: 'ครีม' }] },
    ])
  })
  it('attachEscapeAction ถอยทีละชั้น', () => {
    expect(attachEscapeAction('options', 2)).toBe('back-options')
    expect(attachEscapeAction('pick', 2)).toBe('clear')
    expect(attachEscapeAction('pick', 0)).toBe('close')
  })
})
