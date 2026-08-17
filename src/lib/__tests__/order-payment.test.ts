import { describe, expect, it } from 'vitest'

import {
  computeOrderMoney,
  completionWarning,
  hasMoneyStory,
  suggestedPayment,
  type PaymentRow,
} from '@/lib/order-payment'

/**
 * ตรรกะเรื่องเงิน — ผิดแล้วผู้ใช้เก็บเงินขาดหรือเก็บซ้ำ ทุกเคสต้องพิสูจน์ด้วย mutation
 * ไม่ใช่แค่เขียนให้เขียว
 */

const p = (kind: 'DEPOSIT' | 'BALANCE', amount: number, voided = false): PaymentRow => ({
  kind,
  amount,
  voidedAt: voided ? new Date('2026-08-15') : null,
})

describe('computeOrderMoney', () => {
  it('[blocker] ยังไม่จ่ายอะไรเลย → ค้างเต็มยอด', () => {
    const m = computeOrderMoney({ totalAmount: 1000, depositAgreed: 300, payments: [] })
    expect(m.totalReceived).toBe(0)
    expect(m.outstanding).toBe(1000)
    expect(m.unpaid).toBe(true)
    expect(m.fullyPaid).toBe(false)
    expect(m.depositSettled).toBe(false)
  })

  it('[blocker] มัดจำที่ "ตกลงไว้" แต่ยังไม่ได้รับ ต้องไม่ลดยอดค้าง', () => {
    /**
     * 🛑 หัวใจของ BR-SQ-02/03 — นี่คือความกำกวมที่ทำให้ระบบเดิมต้องเลี่ยงไปใช้คำว่า
     * "มัดจำที่ตกลงไว้" บนการ์ดที่ส่งให้ลูกค้า ถ้าเผลอเอา depositAgreed มาหัก
     * ลูกค้าที่ยังไม่จ่ายสักบาทจะดูเหมือนค้างแค่ 700 ทั้งที่ค้าง 1000
     */
    const m = computeOrderMoney({ totalAmount: 1000, depositAgreed: 300, payments: [] })
    expect(m.outstanding).toBe(1000)
  })

  it('[blocker] รับมัดจำแล้ว → ค้างลดตามเงินที่รับจริง', () => {
    const m = computeOrderMoney({ totalAmount: 1000, depositAgreed: 300, payments: [p('DEPOSIT', 300)] })
    expect(m.depositReceived).toBe(300)
    expect(m.outstanding).toBe(700)
    expect(m.depositSettled).toBe(true)
    expect(m.unpaid).toBe(false)
    expect(m.fullyPaid).toBe(false)
  })

  it('[blocker] แถวที่ถูกยกเลิกต้องไม่ถูกนับ', () => {
    // กรอกผิดแล้วยกเลิก — เงินไม่เคยเข้า ยอดค้างต้องกลับไปเต็ม
    const m = computeOrderMoney({
      totalAmount: 1000,
      depositAgreed: 300,
      payments: [p('DEPOSIT', 300, true)],
    })
    expect(m.depositReceived).toBe(0)
    expect(m.outstanding).toBe(1000)
  })

  it('[blocker] จ่ายครบ → fullyPaid และไม่ค้าง', () => {
    const m = computeOrderMoney({
      totalAmount: 1000,
      depositAgreed: 300,
      payments: [p('DEPOSIT', 300), p('BALANCE', 700)],
    })
    expect(m.totalReceived).toBe(1000)
    expect(m.outstanding).toBe(0)
    expect(m.fullyPaid).toBe(true)
  })

  it('[blocker] จ่ายเกิน (โอนเกิน/ทิป) → ค้าง 0 ห้ามติดลบ', () => {
    const m = computeOrderMoney({ totalAmount: 1000, depositAgreed: 0, payments: [p('BALANCE', 1200)] })
    expect(m.outstanding).toBe(0)
    expect(m.fullyPaid).toBe(true)
  })

  it('[blocker] ยอดรวมเพิ่มหลังรับมัดจำ → ส่วนต่างไปโผล่ที่ยอดค้าง ไม่แตะเงินที่รับแล้ว', () => {
    /**
     * 🛑 BR-SQ-32 · หัวหน้ายืนยันเอง 2026-08-15: "จ่ายมาแล้ว แก้ไม่ได้"
     * ลูกค้าจ่ายมัดจำ 30% ของ 1000 = 300 แล้วเพิ่มของจนบิลเป็น 2000
     * → เงินที่รับยังเป็น 300 (ไม่ใช่คิดใหม่เป็น 600) → ค้าง 1700
     */
    const m = computeOrderMoney({ totalAmount: 2000, depositAgreed: 300, payments: [p('DEPOSIT', 300)] })
    expect(m.depositReceived).toBe(300)
    expect(m.outstanding).toBe(1700)
  })

  it('[blocker] ไม่เก็บมัดจำ (0) → hasDeposit=false เพื่อซ่อนส่วนมัดจำทุกจอ', () => {
    const m = computeOrderMoney({ totalAmount: 500, depositAgreed: 0, payments: [] })
    expect(m.hasDeposit).toBe(false)
    // depositSettled ต้องไม่เป็น true ทั้งที่ไม่มีมัดจำ — ไม่งั้นจอจะขึ้นว่า "รับมัดจำแล้ว"
    expect(m.depositSettled).toBe(false)
  })

  it('depositAgreed = null (ไม่เคยตั้ง) ทำงานเหมือน 0', () => {
    const m = computeOrderMoney({ totalAmount: 500, depositAgreed: null, payments: [] })
    expect(m.depositAgreed).toBe(0)
    expect(m.hasDeposit).toBe(false)
  })

  it('เศษทศนิยมต้องไม่ทำให้ค้างเป็นเลขหางยาว', () => {
    // 0.1 + 0.2 = 0.30000000000000004 ถ้าไม่ปัด
    const m = computeOrderMoney({ totalAmount: 0.3, depositAgreed: 0, payments: [p('BALANCE', 0.1), p('BALANCE', 0.2)] })
    expect(m.outstanding).toBe(0)
    expect(m.totalReceived).toBe(0.3)
  })
})

describe('completionWarning — ปิดงานทั้งที่ค้างเงิน', () => {
  it('[blocker] ยังค้าง → ต้องมีข้อความเตือน (ห้ามเงียบ)', () => {
    const m = computeOrderMoney({ totalAmount: 1000, depositAgreed: 0, payments: [p('BALANCE', 400)] })
    expect(completionWarning(m)).toContain('600')
  })

  it('จ่ายครบ → ไม่ต้องเตือน', () => {
    const m = computeOrderMoney({ totalAmount: 1000, depositAgreed: 0, payments: [p('BALANCE', 1000)] })
    expect(completionWarning(m)).toBeNull()
  })
})

describe('suggestedPayment — ค่าตั้งต้นตอนกดรับเงิน', () => {
  it('ยังไม่ได้รับมัดจำ → เสนอยอดมัดจำ', () => {
    const m = computeOrderMoney({ totalAmount: 1000, depositAgreed: 300, payments: [] })
    expect(suggestedPayment(m)).toEqual({ kind: 'DEPOSIT', amount: 300 })
  })

  it('รับมัดจำแล้ว → เสนอยอดค้างเป็น BALANCE', () => {
    const m = computeOrderMoney({ totalAmount: 1000, depositAgreed: 300, payments: [p('DEPOSIT', 300)] })
    expect(suggestedPayment(m)).toEqual({ kind: 'BALANCE', amount: 700 })
  })

  it('[blocker] ไม่เก็บมัดจำ → เสนอยอดค้างทั้งหมด ไม่ใช่ 0', () => {
    const m = computeOrderMoney({ totalAmount: 500, depositAgreed: 0, payments: [] })
    expect(suggestedPayment(m)).toEqual({ kind: 'BALANCE', amount: 500 })
  })

  it('[blocker] บิลถูกลดจนต่ำกว่ายอดมัดจำ → ห้ามเสนอเกินยอดค้าง', () => {
    // ตกลงมัดจำ 300 แต่บิลเหลือ 200 → เสนอ 200 ไม่ใช่ 300
    const m = computeOrderMoney({ totalAmount: 200, depositAgreed: 300, payments: [] })
    expect(suggestedPayment(m).amount).toBeLessThanOrEqual(200)
  })

  it('[blocker] เคยรับก้อน DEPOSIT ทั้งที่ไม่เคยตั้งยอดมัดจำ → ก้อนถัดไปต้องเป็น BALANCE', () => {
    /**
     * 🛑 เคส walk-in ที่เกิดเป็นปกติ: ลูกค้าเดินเข้าร้าน จ่ายมัดจำหน้าร้าน 200 โดยที่บิลไม่เคย
     * ตั้ง `depositAmount` ไว้ (`depositAgreed = 0`) — ก้อนที่เหลืออีก 800 คือ **ยอดที่เหลือ**
     * ไม่ใช่มัดจำ ถ้าเสนอเป็น DEPOSIT ยอดจะไปโผล่ผิดช่องใน dashboard (AC-SQ-04)
     * และไม่มีอะไรฟ้อง เพราะ 800 เป็นเลขที่ถูกทั้งสองทาง
     */
    const m = computeOrderMoney({ totalAmount: 1000, depositAgreed: 0, payments: [p('DEPOSIT', 200)] })
    expect(m.hasDeposit, 'hasDeposit เป็น true เพราะเคยรับก้อน DEPOSIT — จึงห้ามใช้ตัวนี้ตัดสิน').toBe(true)
    expect(suggestedPayment(m)).toEqual({ kind: 'BALANCE', amount: 800 })
  })

  it('[blocker] รับมัดจำมาบางส่วน → เสนอเฉพาะส่วนที่ยังขาด ไม่ใช่ยอดมัดจำเต็ม', () => {
    // ตกลง 300 รับมาแล้ว 100 → เสนอ 200 (ไม่ใช่ 300 และไม่ใช่ยอดค้าง 900)
    const m = computeOrderMoney({ totalAmount: 1000, depositAgreed: 300, payments: [p('DEPOSIT', 100)] })
    expect(suggestedPayment(m)).toEqual({ kind: 'DEPOSIT', amount: 200 })
  })

  it('จ่ายครบแล้วแต่ไม่เคยแยกก้อนมัดจำ → เสนอ BALANCE 0 ไม่ค้างอยู่ในกิ่งมัดจำ', () => {
    const m = computeOrderMoney({ totalAmount: 1000, depositAgreed: 300, payments: [p('BALANCE', 1000)] })
    expect(suggestedPayment(m)).toEqual({ kind: 'BALANCE', amount: 0 })
  })
})

/**
 * hasMoneyStory — "ใบนี้มีเรื่องเงินให้พูดถึงไหม" (feature 00050)
 *
 * 🛑 เกณฑ์นี้ตัดสิน **3 จอพร้อมกัน** (รายการ /orders · หน้ารายละเอียดฝั่งร้าน · หน้าลูกค้า /o)
 * เพี้ยนที่เดียวแปลว่าใบเดียวกันขึ้นป้ายคนละคำในสองจอ ห่างกันหนึ่งคลิก — อาการที่หัวหน้า
 * รายงานมาเองตั้งแต่ต้น. เดิมเป็นนิพจน์ดิบเขียนซ้ำ 2 ที่ ไม่มีเทสผูกไว้เลย
 */
describe('[blocker] hasMoneyStory', () => {
  const m = (totalReceived: number, hasDeposit: boolean) => ({ totalReceived, hasDeposit })

  it('ยังไม่ตกลงมัดจำ และยังไม่รับเงิน → ไม่มีเรื่องให้เล่า', () => {
    expect(hasMoneyStory(m(0, false))).toBe(false)
  })

  it('ตกลงมัดจำไว้แล้วแต่ยังไม่ได้รับสักบาท → มี (นี่คือใบที่ต้องขึ้นป้าย "จอง")', () => {
    expect(hasMoneyStory(m(0, true))).toBe(true)
  })

  /**
   * เคสที่กลืนง่ายที่สุด: ร้านไม่ได้ตกลงมัดจำไว้ ลูกค้าจ่ายสดหน้าร้าน
   * ถ้าเกณฑ์เป็น AND หรือดูแต่ `hasDeposit` ใบนี้จะกลับไปใช้ป้ายเดิมทั้งที่เก็บเงินครบแล้ว
   */
  it('ไม่มีมัดจำ แต่รับเงินมาแล้ว → มี', () => {
    expect(hasMoneyStory(m(1500, false))).toBe(true)
  })

  it('มีทั้งสองอย่าง → มี', () => {
    expect(hasMoneyStory(m(500, true))).toBe(true)
  })

  /** ผลของ computeOrderMoney ต้องเสียบเข้าได้ตรง ๆ ไม่ต้องแปลงอะไรก่อน */
  it('ต่อกับ computeOrderMoney ได้โดยตรง', () => {
    const noStory = computeOrderMoney({ totalAmount: 900, depositAgreed: null, payments: [] })
    expect(hasMoneyStory(noStory)).toBe(false)

    const booked = computeOrderMoney({ totalAmount: 900, depositAgreed: 900, payments: [] })
    expect(hasMoneyStory(booked)).toBe(true)
  })
})
