import { describe, it, expect } from 'vitest'
import { shouldRelinkThreadCustomer } from './thread-customer-link'

describe('shouldRelinkThreadCustomer — [blocker] เธรดต้องตามเบอร์ที่แอดมินแก้', () => {
  // 🛑 เคสที่ทำให้ฟังก์ชันนี้เกิดขึ้น (user report 2026-08-10): แก้เบอร์ในโมดัลของแชท
  // แล้วออเดอร์หายไปจากห้องนั้นทั้งใบ เพราะเธรดยังชี้ Customer คนเก่า
  it('[blocker] เธรดผูกด้วยมือไว้ + แก้เบอร์เป็นคนใหม่ → ต้องย้ายเธรดตาม', () => {
    expect(
      shouldRelinkThreadCustomer({
        linkedCustomerId: 'cust-เก่า',
        linkedCustomerUserId: null,
        newCustomerId: 'cust-ใหม่',
      }),
    ).toBe(true)
  })

  it('[blocker] เธรดผูกจากผู้ซื้อที่ login แล้ว → ห้ามทับ (login ชนะ manual)', () => {
    expect(
      shouldRelinkThreadCustomer({
        linkedCustomerId: 'cust-เก่า',
        linkedCustomerUserId: 'user-1',
        newCustomerId: 'cust-ใหม่',
      }),
    ).toBe(false)
  })

  it('[blocker] ยังไม่เคยผูก → ผูกเลย (พฤติกรรมเดิมของ createOrder ต้องไม่หาย)', () => {
    expect(
      shouldRelinkThreadCustomer({
        linkedCustomerId: null,
        linkedCustomerUserId: null,
        newCustomerId: 'cust-ใหม่',
      }),
    ).toBe(true)
  })

  it('คนเดิมอยู่แล้ว → ไม่เขียนซ้ำ', () => {
    expect(
      shouldRelinkThreadCustomer({
        linkedCustomerId: 'cust-1',
        linkedCustomerUserId: null,
        newCustomerId: 'cust-1',
      }),
    ).toBe(false)
  })

  // เธรดที่ยังไม่ผูก แต่ค่า userId ติดมาเป็น undefined (select ไม่ครบ) ต้องไม่ทำให้ผูกไม่ได้
  it('ยังไม่เคยผูก + userId เป็น undefined → ยังผูกได้', () => {
    expect(
      shouldRelinkThreadCustomer({
        linkedCustomerId: undefined,
        linkedCustomerUserId: undefined,
        newCustomerId: 'cust-ใหม่',
      }),
    ).toBe(true)
  })
})
