/**
 * [blocker] resolveOutboundShippingCost — ต้นทุนค่าส่งขาไปตัวเดียว (00078 TC-300 · TD-009 · D-11)
 *
 * mutation ที่ต้องแดง: M-29 ถอด "iShip ชนะ" (manual มาก่อนราคา iShip) · M-30 ตี null เป็น 0 (ไม่ pending / source ผิด)
 */
import { describe, it, expect } from 'vitest'
import { resolveOutboundShippingCost as r } from '../shipping-cost'

const fwd = (carrierPrice: number | null, estimatedPrice: number | null, codFee: number | null = null) => ({
  carrierPrice, estimatedPrice, codFee,
})

describe('[blocker] resolveOutboundShippingCost', () => {
  // T-FIN-1 (00085): COD 360 · ค่าส่ง 30 · codFee 7.70 — ใบที่ร้านปิดแบบไม่นับยอดขายไม่รวม codFee
  it('T-FIN-1: dropCodFee=true → 30 · false → 37.70', () => {
    expect(r({ forward: fwd(30, null, 7.7), manual: null, dropCodFee: true }).amount).toBe(30)
    expect(r({ forward: fwd(30, null, 7.7), manual: null, dropCodFee: false }).amount).toBeCloseTo(37.7)
    expect(r({ forward: fwd(null, null, 7.7), manual: 30, dropCodFee: true }).amount).toBe(30)
  })

  // T-FIN-2: ยอด 0 · ต้นทุน 0 · ค่าส่ง 30 ⇒ กำไร −30 (ไม่ใช่ −37.70)
  it('T-FIN-2: กำไรของใบที่ปิดแบบไม่นับ = 0 − 0 − 30', () => {
    const shipping = r({ forward: fwd(30, null, 7.7), manual: null, dropCodFee: true }).amount
    expect(0 - 0 - shipping).toBe(-30)
  })

  it('iShip ราคาจริงชนะ manual เสมอ และไม่บวกซ้ำ', () => {
    expect(r({ forward: fwd(40, 30, 5), manual: 999, dropCodFee: false })).toEqual({ amount: 45, pending: false, pendingReason: null, source: 'ISHIP' })
  })

  it('iShip มีแต่ราคาประมาณ: ชนะ manual · ยัง pending', () => {
    expect(r({ forward: fwd(null, 30, 0), manual: 999, dropCodFee: false })).toEqual({ amount: 30, pending: true, pendingReason: 'ESTIMATE', source: 'ISHIP' })
  })

  it('ไม่มีราคา iShip → ใช้ manual · pending=false (D-11) · บวก codFee ที่รู้แล้ว', () => {
    expect(r({ forward: fwd(null, null, 12), manual: 50, dropCodFee: false })).toEqual({ amount: 62, pending: false, pendingReason: null, source: 'MANUAL' })
    expect(r({ forward: null, manual: 50, dropCodFee: false })).toEqual({ amount: 50, pending: false, pendingReason: null, source: 'MANUAL' })
  })

  it('manual = 0 คือ "ไม่มีค่าใช้จ่าย" ไม่ใช่ยังไม่ระบุ', () => {
    expect(r({ forward: null, manual: 0, dropCodFee: false })).toEqual({ amount: 0, pending: false, pendingReason: null, source: 'MANUAL' })
  })

  it('ไม่มีอะไรเลย → pending ไม่ใช่ศูนย์เงียบ (null ≠ 0)', () => {
    expect(r({ forward: null, manual: null, dropCodFee: false })).toEqual({ amount: 0, pending: true, pendingReason: 'MISSING', source: 'NONE' })
    // มีใบ iShip แต่ขนส่งยังไม่คิดเงิน = รอราคา (ESTIMATE) ไม่ใช่ "ยังไม่กรอก"
    expect(r({ forward: fwd(null, null, null), manual: null, dropCodFee: false })).toEqual({ amount: 0, pending: true, pendingReason: 'ESTIMATE', source: 'NONE' })
    expect(r({ forward: fwd(null, null, 8), manual: null, dropCodFee: false })).toEqual({ amount: 8, pending: true, pendingReason: 'ESTIMATE', source: 'NONE' })
  })

  it('รับ Decimal-like (toString → Number) จาก Prisma', () => {
    const dec = (n: number) => ({ toString: () => String(n), valueOf: () => n })
    expect(r({ forward: null, manual: dec(35.5), dropCodFee: false }).amount).toBe(35.5)
  })
})
