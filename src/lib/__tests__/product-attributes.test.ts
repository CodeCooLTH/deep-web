import { describe, expect, it } from 'vitest'
import { buildOptionLabel, normalizeAttributes, splitAttributeValues } from '../product-attributes'

describe('splitAttributeValues', () => {
  it('trim + ตัดค่าว่าง', () => {
    expect(splitAttributeValues(' แดง, ,น้ำเงิน ,, ')).toEqual(['แดง', 'น้ำเงิน'])
    expect(splitAttributeValues('')).toEqual([])
  })
})

describe('normalizeAttributes', () => {
  it('object ผ่าน · อื่น ๆ เป็น {}', () => {
    expect(normalizeAttributes({ สี: 'ครีม' })).toEqual({ สี: 'ครีม' })
    expect(normalizeAttributes(null)).toEqual({})
    expect(normalizeAttributes(['a'])).toEqual({})
    expect(normalizeAttributes('x')).toEqual({})
  })
})

describe('buildOptionLabel', () => {
  const attrs = { สี: 'ครีม, ดำ', ขนาด: 'M, L' }
  it('ประกอบตามลำดับ key ของ attrs ไม่ใช่ลำดับที่เลือก', () => {
    expect(
      buildOptionLabel(attrs, [
        { key: 'ขนาด', value: 'L' },
        { key: 'สี', value: 'ครีม' },
      ]),
    ).toEqual({ ok: true, label: 'สี ครีม · ขนาด L' })
  })
  it('ไม่เลือก = ว่าง', () => {
    expect(buildOptionLabel(attrs, [])).toEqual({ ok: true, label: '' })
  })
  it('key ไม่มีจริง / value ไม่อยู่ใน split / key ซ้ำ → ไม่ ok', () => {
    expect(buildOptionLabel(attrs, [{ key: 'วัสดุ', value: 'x' }])).toEqual({ ok: false })
    expect(buildOptionLabel(attrs, [{ key: 'สี', value: 'แดง' }])).toEqual({ ok: false })
    expect(buildOptionLabel(attrs, [{ key: 'สี', value: 'ครีม, ดำ' }])).toEqual({ ok: false })
    expect(
      buildOptionLabel(attrs, [
        { key: 'สี', value: 'ครีม' },
        { key: 'สี', value: 'ดำ' },
      ]),
    ).toEqual({ ok: false })
    expect(buildOptionLabel(attrs, [{ key: 'toString', value: 'x' }])).toEqual({ ok: false })
  })
})
