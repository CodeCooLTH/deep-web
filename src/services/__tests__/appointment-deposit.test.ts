/**
 * appointment-deposit.test.ts — unit tests ของ computeAppointmentDeposit (feature 00024, FR-RSV-12)
 *
 * ครอบกฎมัดจำที่เป็นฟังก์ชันบริสุทธิ์ล้วน (ไม่แตะ DB):
 *   BR-RSV-43  รูปแบบมัดจำ 2 แบบ (FIXED / PERCENT)
 *   BR-RSV-44  ค่า 0 = ไม่เก็บมัดจำ
 *   BR-RSV-47  ยอดมัดจำต้องไม่เกินยอดรวมของออเดอร์
 *   BR-RSV-48  ยอดที่ร้านกรอกเองชนะค่าเริ่มต้นของทรัพยากรเสมอ
 *
 * ที่ไม่ได้ครอบที่นี่เพราะต้องมี DB จริง: การ snapshot ลง Order.depositAmount (BR-RSV-46)
 * และการที่มัดจำไม่กั้นการกันคิว (BR-RSV-49) — เป็นขอบเขตของ E2E/integration
 */

import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { computeAppointmentDeposit } from '@/services/appointment.service'

const dec = (n: string | number) => new Prisma.Decimal(n)

const resource = (depositMode: 'FIXED' | 'PERCENT', depositValue: string) => ({
  depositMode,
  depositValue: dec(depositValue),
})

describe('computeAppointmentDeposit — BR-RSV-43 รูปแบบมัดจำ', () => {
  it('FIXED คืนจำนวนเงินตามที่ตั้งไว้ ไม่สนใจยอดรวม', () => {
    const got = computeAppointmentDeposit({
      resource: resource('FIXED', '200'),
      totalAmount: dec('500'),
    })
    expect(got.toFixed(2)).toBe('200.00')
  })

  it('PERCENT คิดเป็นสัดส่วนของยอดรวม — 30% ของ 1,000 = 300', () => {
    const got = computeAppointmentDeposit({
      resource: resource('PERCENT', '30'),
      totalAmount: dec('1000'),
    })
    expect(got.toFixed(2)).toBe('300.00')
  })

  it('PERCENT ที่หารไม่ลงตัวถูกปัดเป็น 2 ตำแหน่งให้ตรงกับ Decimal(12,2)', () => {
    // 33.33% ของ 100 = 33.33 พอดี; ใช้ 1/3 ที่ลงท้ายไม่รู้จบเพื่อพิสูจน์การปัด
    const got = computeAppointmentDeposit({
      resource: resource('PERCENT', '33.33'),
      totalAmount: dec('99.99'),
    })
    // 99.99 * 33.33 / 100 = 33.326667 → ปัดเป็น 33.33
    expect(got.toFixed(2)).toBe('33.33')
  })
})

describe('computeAppointmentDeposit — BR-RSV-44 ศูนย์ = ไม่เก็บมัดจำ', () => {
  it('FIXED 0 คืน 0', () => {
    const got = computeAppointmentDeposit({
      resource: resource('FIXED', '0'),
      totalAmount: dec('800'),
    })
    expect(got.toFixed(2)).toBe('0.00')
  })

  it('PERCENT 0 คืน 0', () => {
    const got = computeAppointmentDeposit({
      resource: resource('PERCENT', '0'),
      totalAmount: dec('800'),
    })
    expect(got.toFixed(2)).toBe('0.00')
  })
})

describe('computeAppointmentDeposit — BR-RSV-47 ห้ามเกินยอดรวม', () => {
  it('FIXED ที่มากกว่ายอดรวม ถูกตัดให้เท่ากับยอดรวม', () => {
    const got = computeAppointmentDeposit({
      resource: resource('FIXED', '200'),
      totalAmount: dec('150'),
    })
    expect(got.toFixed(2)).toBe('150.00')
  })

  it('PERCENT 100 ได้เท่ากับยอดรวมพอดี ไม่เกิน', () => {
    const got = computeAppointmentDeposit({
      resource: resource('PERCENT', '100'),
      totalAmount: dec('420.50'),
    })
    expect(got.toFixed(2)).toBe('420.50')
  })

  it('ยอดที่ร้านกรอกเองเกินยอดรวม ก็ยังถูกตัดเช่นกัน', () => {
    const got = computeAppointmentDeposit({
      resource: resource('FIXED', '0'),
      totalAmount: dec('300'),
      override: '999999',
    })
    expect(got.toFixed(2)).toBe('300.00')
  })

  it('ยอดรวม 0 ทำให้มัดจำเป็น 0 เสมอ', () => {
    const got = computeAppointmentDeposit({
      resource: resource('PERCENT', '30'),
      totalAmount: dec('0'),
      override: '500',
    })
    expect(got.toFixed(2)).toBe('0.00')
  })
})

describe('computeAppointmentDeposit — BR-RSV-48 ยอดที่ร้านกรอกชนะค่าเริ่มต้น', () => {
  it('override ชนะค่า PERCENT ของทรัพยากร', () => {
    const got = computeAppointmentDeposit({
      resource: resource('PERCENT', '30'),
      totalAmount: dec('1000'),
      override: '500',
    })
    expect(got.toFixed(2)).toBe('500.00')
  })

  it('override เป็น "0" แปลว่าไม่เก็บมัดจำ — ต้องไม่ตกกลับไปใช้ค่าเริ่มต้น', () => {
    // จุดที่พลาดง่าย: ถ้าเช็คด้วย falsy ("0" || default) จะได้ 300 แทนที่จะเป็น 0
    const got = computeAppointmentDeposit({
      resource: resource('PERCENT', '30'),
      totalAmount: dec('1000'),
      override: '0',
    })
    expect(got.toFixed(2)).toBe('0.00')
  })

  it('override เป็น null/undefined = ไม่ได้กรอก → ใช้ค่าเริ่มต้นของทรัพยากร', () => {
    const fromNull = computeAppointmentDeposit({
      resource: resource('PERCENT', '30'),
      totalAmount: dec('1000'),
      override: null,
    })
    const fromUndefined = computeAppointmentDeposit({
      resource: resource('PERCENT', '30'),
      totalAmount: dec('1000'),
      override: undefined,
    })
    expect(fromNull.toFixed(2)).toBe('300.00')
    expect(fromUndefined.toFixed(2)).toBe('300.00')
  })
})

describe('computeAppointmentDeposit — ยอดคงเหลือจ่ายหน้างาน (BR-RSV-51)', () => {
  it('ยอดคงเหลือคำนวณจาก ยอดรวม ลบ มัดจำ ได้ตรงเสมอ', () => {
    const total = dec('1000')
    const deposit = computeAppointmentDeposit({
      resource: resource('PERCENT', '30'),
      totalAmount: total,
    })
    expect(total.minus(deposit).toFixed(2)).toBe('700.00')
  })

  it('มัดจำเต็มจำนวน → เหลือจ่ายหน้างาน 0', () => {
    const total = dec('150')
    const deposit = computeAppointmentDeposit({
      resource: resource('FIXED', '200'),
      totalAmount: total,
    })
    expect(total.minus(deposit).toFixed(2)).toBe('0.00')
  })
})
