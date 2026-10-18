import { describe, expect, it } from 'vitest'
import { rowChipOverflow } from '../inbox-row-chips'

describe('rowChipOverflow', () => {
  it('ไม่เกิน 2 ใบ = แสดงครบ ไม่มี +N', () => {
    expect(rowChipOverflow([])).toEqual({ visible: 0, more: null })
    expect(rowChipOverflow(['a', 'b'])).toEqual({ visible: 2, more: null })
  })
  it('เกิน 2 ใบ = แสดง 2 ที่เหลือเป็น +N พร้อมชื่อที่ซ่อน', () => {
    expect(rowChipOverflow(['a', 'b', 'c', 'd'])).toEqual({ visible: 2, more: { text: '+2', names: ['c', 'd'] } })
  })
  it('ซ่อน ≥100 ใบ = 99+', () => {
    const names = Array.from({ length: 102 }, (_, i) => `t${i}`)
    expect(rowChipOverflow(names).more?.text).toBe('99+')
  })
})
