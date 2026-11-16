import { describe, expect, it } from 'vitest'

import { DEFAULT_VARIABLE_COSTS, hasVariableCosts, orderVariableCost, resolveVariableCosts } from './variable-cost'

const s = { packagingPerOrder: 10, codFeePct: 3, paymentFeePct: 1.5, commissionPct: 2 }

describe('resolveVariableCosts', () => {
  it('null = ค่าตั้งต้น 0 ทุกช่อง', () => {
    expect(resolveVariableCosts(null)).toEqual(DEFAULT_VARIABLE_COSTS)
    expect(hasVariableCosts(resolveVariableCosts(null))).toBe(false)
  })
  it('ช่องเสีย (ติดลบ/เกิน 100%/ไม่ใช่ตัวเลข) ถอยเป็น 0 เฉพาะช่องนั้น', () => {
    expect(resolveVariableCosts({ packagingPerOrder: 5, codFeePct: -1, paymentFeePct: 120, commissionPct: '2' })).toEqual({
      packagingPerOrder: 5, codFeePct: 0, paymentFeePct: 0, commissionPct: 0,
    })
  })
})

describe('orderVariableCost', () => {
  it('ไม่ตั้งค่า = 0 (ตัวเลขทุกหน้าเท่าเดิม)', () => {
    expect(orderVariableCost(DEFAULT_VARIABLE_COSTS, { revenue: 1000, paymentMethod: 'COD', ishipCodFee: null })).toBe(0)
  })
  it('COD ไม่มี codFee จาก iShip: แพ็ก + (COD% + คอม%)', () => {
    expect(orderVariableCost(s, { revenue: 1000, paymentMethod: 'COD', ishipCodFee: null })).toBe(60)
  })
  it('COD ที่ iShip คิด codFee แล้ว ไม่คิด % COD ซ้ำ', () => {
    expect(orderVariableCost(s, { revenue: 1000, paymentMethod: 'COD', ishipCodFee: 30 })).toBe(30)
  })
  it('โอน: แพ็ก + (ค่ารับชำระ% + คอม%)', () => {
    expect(orderVariableCost(s, { revenue: 1000, paymentMethod: 'TRANSFER', ishipCodFee: null })).toBe(45)
  })
  it('เงินสด: ไม่มีค่ารับชำระ', () => {
    expect(orderVariableCost(s, { revenue: 1000, paymentMethod: 'CASH', ishipCodFee: null })).toBe(30)
  })
})
