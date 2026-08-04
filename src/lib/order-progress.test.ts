// order-progress.test.ts — ล็อกพฤติกรรมของลำดับขั้นคำสั่งซื้อ (โดยเฉพาะเส้นทาง COD)
//
// เทสชุดนี้มีอยู่เพราะบั๊กเดิมไม่ทำให้อะไรพัง มันแค่ "พูดผิด": ออเดอร์เก็บเงินปลายทางขึ้นว่า
// "ชำระเงินแล้ว" ตั้งแต่ร้านกดแจ้งเลขพัสดุ ซึ่ง type-check จับไม่ได้และหน้าจอก็ไม่แดง
// ถ้าใครกลับไปรวม 2 เส้นทางเป็นเส้นเดียวอีกครั้ง เทสพวกนี้ต้องเป็นตัวที่ส่งเสียง

import { describe, it, expect } from 'vitest'
import { getOrderProgress, type ProgressStepKey, type ProgressState } from './order-progress'

const base = {
  fulfillmentMode: 'SHIPPED',
  slipFileId: null,
  totalAmount: 590,
  carrierStatus: null,
  createdAtLabel: '2569-08-04 13:55:23',
  updatedAtLabel: '2569-08-04 15:20:00',
}

/** ย่อผลลัพธ์เป็น [key, state] เพื่อให้ assertion อ่านออกว่า "ลำดับควรเป็นอะไร" */
const shape = (steps: ReturnType<typeof getOrderProgress>): [ProgressStepKey, ProgressState][] =>
  steps.map((s) => [s.key, s.state])

describe('getOrderProgress — เส้นทาง COD (เงินอยู่ท้ายสุด)', () => {
  it('PENDING: ไม่มีขั้นชำระเงินก่อนจัดส่งเลย และขั้นที่รออยู่คือจัดส่ง', () => {
    const steps = getOrderProgress({ ...base, status: 'PENDING', paymentMethod: 'COD' })
    expect(shape(steps)).toEqual([
      ['PLACED', 'done'],
      ['SHIPPED', 'current'],
      ['CONFIRMED', 'upcoming'],
      ['COD_MONEY', 'upcoming'],
    ])
    // สิ่งที่บั๊กเดิมทำ: ขึ้น "รอผู้ซื้อชำระเงิน" ทั้งที่ COD ไม่มีการชำระล่วงหน้า
    expect(steps.some((s) => s.key === 'PAYMENT')).toBe(false)
  })

  it('SHIPPED: ห้ามบอกว่าเก็บเงินแล้ว (บั๊กต้นเรื่อง — เดิมขึ้น "ชำระเงินแล้ว" ทันทีที่แจ้งเลขพัสดุ)', () => {
    const steps = getOrderProgress({ ...base, status: 'SHIPPED', paymentMethod: 'เก็บเงินปลายทาง (COD)' })
    expect(shape(steps)).toEqual([
      ['PLACED', 'done'],
      ['SHIPPED', 'done'],
      ['CONFIRMED', 'current'],
      ['COD_MONEY', 'upcoming'],
    ])
    const money = steps.find((s) => s.key === 'COD_MONEY')!
    expect(money.label).toBe('รอเก็บเงินปลายทาง')
    expect(money.note).toContain('฿590')
  })

  it('SHIPPED + ขนส่งส่งถึงแล้ว (iShip delivered): เก็บเงินแล้ว แม้ผู้ซื้อยังไม่กดยืนยันรับของ', () => {
    const steps = getOrderProgress({
      ...base,
      status: 'SHIPPED',
      paymentMethod: 'COD',
      carrierStatus: 'delivered',
    })
    expect(shape(steps)).toEqual([
      ['PLACED', 'done'],
      ['SHIPPED', 'done'],
      ['CONFIRMED', 'current'],
      ['COD_MONEY', 'done'],
    ])
  })

  it('เก็บเงินแล้ว: ข้อความต้องไม่ยืนยันว่าเงินเข้าร้าน (DB ไม่มี paidAt)', () => {
    const steps = getOrderProgress({ ...base, status: 'CONFIRMED', paymentMethod: 'COD' })
    const money = steps.find((s) => s.key === 'COD_MONEY')!
    expect(money.state).toBe('done')
    expect(money.note).toBe('ขนส่งเก็บเงินให้แล้ว · รอโอนเข้าร้านตามรอบของขนส่ง')
    expect(money.note).not.toContain('เงินเข้าร้าน')
  })

  it('ไม่มีการจัดส่ง (บริการ/ดิจิทัล): ตัดขั้นจัดส่งออก เงินยังอยู่ท้ายสุด', () => {
    const steps = getOrderProgress({
      ...base,
      fulfillmentMode: 'NO_SHIPPING',
      status: 'PENDING',
      paymentMethod: 'ชำระปลายทาง',
    })
    expect(shape(steps)).toEqual([
      ['PLACED', 'done'],
      ['CONFIRMED', 'current'],
      ['COD_MONEY', 'upcoming'],
    ])
  })
})

describe('getOrderProgress — เส้นทางโอน/พร้อมเพย์ (เงินมาก่อนของออก)', () => {
  it('PENDING ไม่มีสลิป: รอผู้ซื้อชำระเงินเป็นขั้นปัจจุบัน', () => {
    const steps = getOrderProgress({ ...base, status: 'PENDING', paymentMethod: 'TRANSFER' })
    expect(shape(steps)).toEqual([
      ['PLACED', 'done'],
      ['PAYMENT', 'current'],
      ['SHIPPED', 'upcoming'],
      ['CONFIRMED', 'upcoming'],
    ])
    expect(steps[1].label).toBe('รอผู้ซื้อชำระเงิน')
  })

  it('PENDING มีสลิปแล้ว: ต้องไม่ค้างคำว่า "รอผู้ซื้อชำระเงิน" แต่ก็ยังไม่ใช่ done', () => {
    const steps = getOrderProgress({
      ...base,
      status: 'PENDING',
      paymentMethod: 'PROMPTPAY',
      slipFileId: 'file-123',
    })
    expect(steps[1].key).toBe('PAYMENT')
    expect(steps[1].state).toBe('current') // Verified-Means-Green: ยังไม่ตรวจ = ยังไม่เขียว
    expect(steps[1].label).toBe('แนบสลิปแล้ว')
    expect(steps[1].note).toBe('รอตรวจสอบสลิป')
  })

  it('SHIPPED: ชำระเงิน+จัดส่ง done ขั้นที่รออยู่คือผู้ซื้อยืนยันรับของ', () => {
    const steps = getOrderProgress({ ...base, status: 'SHIPPED', paymentMethod: 'TRANSFER' })
    expect(shape(steps)).toEqual([
      ['PLACED', 'done'],
      ['PAYMENT', 'done'],
      ['SHIPPED', 'done'],
      ['CONFIRMED', 'current'],
    ])
  })

  it('CONFIRMED: done ทุกขั้น', () => {
    const steps = getOrderProgress({ ...base, status: 'CONFIRMED', paymentMethod: 'TRANSFER' })
    expect(steps.every((s) => s.state === 'done')).toBe(true)
  })

  it('วิธีชำระที่ระบบไม่รู้จัก (ร้านพิมพ์เอง) ตกเข้าเส้นทางโอน ไม่ใช่ COD — allow-list ไม่ใช่ deny-list', () => {
    const steps = getOrderProgress({
      ...base,
      status: 'PENDING',
      paymentMethod: 'พร้อมเพย์ 081-234-5678',
    })
    expect(steps.map((s) => s.key)).toContain('PAYMENT')
    expect(steps.map((s) => s.key)).not.toContain('COD_MONEY')
  })
})

describe('getOrderProgress — ยกเลิก', () => {
  it('เหลือ 2 ขั้น: สิ่งที่เกิดจริง + สิ่งที่จบเรื่อง (ไม่ลากขั้นที่ไม่มีวันเกิดมาโชว์)', () => {
    for (const paymentMethod of ['COD', 'TRANSFER', null]) {
      const steps = getOrderProgress({ ...base, status: 'CANCELLED', paymentMethod })
      expect(shape(steps)).toEqual([
        ['PLACED', 'done'],
        ['CANCELLED', 'cancelled'],
      ])
    }
  })
})

describe('getOrderProgress — เวลา', () => {
  it('ขั้นแรกใช้เวลาสร้าง ขั้นที่ยังไม่ถึงต้องไม่มีเวลา (กันดูเหมือนเกิดไปแล้ว)', () => {
    const steps = getOrderProgress({ ...base, status: 'PENDING', paymentMethod: 'TRANSFER' })
    expect(steps[0].note).toBe('2569-08-04 13:55:23')
    expect(steps.find((s) => s.key === 'SHIPPED')!.note).toBeUndefined()
    expect(steps.find((s) => s.key === 'CONFIRMED')!.note).toBeUndefined()
  })
})
