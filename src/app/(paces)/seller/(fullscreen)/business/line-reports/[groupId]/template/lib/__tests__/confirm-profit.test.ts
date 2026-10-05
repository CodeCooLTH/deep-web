import { describe, expect, it } from 'vitest'
import { needsProfitConfirm, profitNeedsConfirmation } from '../confirm-profit'

const f = (showProfit: boolean) => ({ showProfit })
describe('needsProfitConfirm', () => {
  it('false→true และยังไม่ยืนยัน = ต้องถาม', () => {
    expect(needsProfitConfirm(f(false), f(true), false)).toBe(true)
  })
  it('ยืนยันแล้วในเซสชัน = ไม่ถามซ้ำ', () => {
    expect(needsProfitConfirm(f(false), f(true), true)).toBe(false)
  })
  it('กำไรเปิดอยู่แล้ว / ไม่เปลี่ยน / ปิด = ไม่ถาม', () => {
    expect(needsProfitConfirm(f(true), f(true), false)).toBe(false)
    expect(needsProfitConfirm(f(false), f(false), false)).toBe(false)
    expect(needsProfitConfirm(f(true), f(false), false)).toBe(false)
  })
})
describe('profitNeedsConfirmation (พิมพ์ {กำไร} เอง)', () => {
  it('ฉบับร่างมีกำไร · ของที่บันทึกไม่มี · ยังไม่ยืนยัน = บล็อกการบันทึก', () => {
    expect(profitNeedsConfirmation(f(false), f(true), false)).toBe(true)
  })
  it('ยืนยันแล้ว หรือของที่บันทึกมีกำไรอยู่แล้ว หรือฉบับร่างไม่มีกำไร = ไม่บล็อก', () => {
    expect(profitNeedsConfirmation(f(false), f(true), true)).toBe(false)
    expect(profitNeedsConfirmation(f(true), f(true), false)).toBe(false)
    expect(profitNeedsConfirmation(f(false), f(false), false)).toBe(false)
  })
})
