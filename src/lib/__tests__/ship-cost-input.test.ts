import { describe, it, expect } from 'vitest'
import { parseShipCostInput } from '../ship-cost-input'

describe('parseShipCostInput', () => {
  it('ว่าง = null ไม่ใช่ 0', () => {
    expect(parseShipCostInput('')).toEqual({ ok: true, value: null })
    expect(parseShipCostInput('  ')).toEqual({ ok: true, value: null })
    expect(parseShipCostInput(undefined)).toEqual({ ok: true, value: null })
  })
  it('รับ 0, ทศนิยม 2 ตำแหน่ง, คอมมา และขอบ 99999.99', () => {
    expect(parseShipCostInput('0')).toEqual({ ok: true, value: 0 })
    expect(parseShipCostInput('45.5')).toEqual({ ok: true, value: 45.5 })
    expect(parseShipCostInput('1,250.25')).toEqual({ ok: true, value: 1250.25 })
    expect(parseShipCostInput('99999.99')).toEqual({ ok: true, value: 99999.99 })
  })
  it('ปฏิเสธลบ/เกินเพดาน/ทศนิยม 3/ไม่ใช่ตัวเลข', () => {
    for (const bad of ['-1', '100000', '1.234', 'abc', '1e3', '0x10', '.5', '1.']) {
      expect(parseShipCostInput(bad)).toEqual({ ok: false })
    }
  })
})
