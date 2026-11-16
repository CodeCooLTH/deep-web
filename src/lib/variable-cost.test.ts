import { describe, expect, it } from 'vitest'

import * as v from 'valibot'

import { DEFAULT_VARIABLE_COSTS, VariableCostSchema, hasVariableCosts, orderVariableCost, resolveVariableCosts } from './variable-cost'

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
    expect(orderVariableCost(DEFAULT_VARIABLE_COSTS, { revenue: 1000, paymentMethod: 'COD', ishipCodFee: null, codFeeInShipping: false })).toBe(0)
  })
  it('COD ไม่มี codFee จาก iShip: แพ็ก + (COD% + คอม%)', () => {
    expect(orderVariableCost(s, { revenue: 1000, paymentMethod: 'COD', ishipCodFee: null, codFeeInShipping: false })).toBe(60)
  })
  it('COD ที่ iShip คิด codFee แล้ว + ค่าส่งถูกหักอยู่แล้ว (ร้านบริการ): ไม่คิดซ้ำ', () => {
    expect(orderVariableCost(s, { revenue: 1000, paymentMethod: 'COD', ishipCodFee: 30, codFeeInShipping: true })).toBe(30)
  })
  it('COD ที่ iShip คิด codFee แต่ค่าส่งไม่ถูกหัก (ร้านขายของ): ใช้ codFee จริงแทน %', () => {
    expect(orderVariableCost(s, { revenue: 1000, paymentMethod: 'COD', ishipCodFee: 25, codFeeInShipping: false })).toBe(55)
  })
  it('% รวมเกิน 100 ไม่ผ่านการตรวจ', () => {
    expect(v.safeParse(VariableCostSchema, { packagingPerOrder: 0, codFeePct: 60, paymentFeePct: 0, commissionPct: 50 }).success).toBe(false)
  })
  it('โอน: แพ็ก + (ค่ารับชำระ% + คอม%)', () => {
    expect(orderVariableCost(s, { revenue: 1000, paymentMethod: 'TRANSFER', ishipCodFee: null, codFeeInShipping: false })).toBe(45)
  })
  it('เงินสด: ไม่มีค่ารับชำระ', () => {
    expect(orderVariableCost(s, { revenue: 1000, paymentMethod: 'CASH', ishipCodFee: null, codFeeInShipping: false })).toBe(30)
  })
})
