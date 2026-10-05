import { describe, expect, it } from 'vitest'
import { expenseDisplay, netSalesDisplay } from '../format-money'

describe('expenseDisplay (FR-EXP-03)', () => {
  it('ตามตารางรูปแถว', () => {
    expect(expenseDisplay(300, { recorded: true })).toMatchObject({ label: 'ค่าใช้จ่าย', text: '฿300' })
    expect(expenseDisplay(0, { recorded: true })).toMatchObject({ label: 'ค่าใช้จ่าย', text: '฿0' })
    expect(expenseDisplay(50, { recorded: false })).toMatchObject({ label: 'ค่าใช้จ่ายอย่างน้อย', text: '฿50' })
    expect(expenseDisplay(0, { recorded: false })).toMatchObject({ label: 'ค่าใช้จ่าย', text: 'ยังไม่มีบันทึก' })
  })
  it('ไม่มีบันทึก+0 ห้ามเขียน ฿0', () => {
    expect(expenseDisplay(0, { recorded: false }).text).not.toContain('฿')
  })
})
describe('netSalesDisplay (FR-EXP-03)', () => {
  it('4 สถานะ + ค่าสัมบูรณ์ไม่มี ฿-', () => {
    expect(netSalesDisplay(700, { capped: false })).toMatchObject({ label: 'ยอดขายหลังหักค่าใช้จ่าย', text: '฿700' })
    expect(netSalesDisplay(700, { capped: true })).toMatchObject({ label: 'ยอดขายหลังหักค่าใช้จ่ายไม่เกิน', text: '฿700' })
    expect(netSalesDisplay(-500, { capped: false })).toMatchObject({ label: 'ยอดขายต่ำกว่าค่าใช้จ่าย', text: '฿500' })
    expect(netSalesDisplay(-500, { capped: true })).toMatchObject({ label: 'ยอดขายต่ำกว่าค่าใช้จ่ายอย่างน้อย', text: '฿500' })
    expect(netSalesDisplay(-500, { capped: false }).text).not.toContain('-')
  })
  it('฿0 พอดี = บวก (E-10)', () => {
    expect(netSalesDisplay(0, { capped: false })).toMatchObject({ positive: true, label: 'ยอดขายหลังหักค่าใช้จ่าย', text: '฿0' })
  })
})
