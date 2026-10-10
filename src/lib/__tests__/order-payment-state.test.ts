import { describe, expect, it } from 'vitest'
import { isOrderUnpaid, type OrderPaymentStateInput } from '@/lib/order-payment-state'

/**
 * isOrderUnpaid — ล็อกการแก้ไขของ BILLING (00071 P3 · C-7 / O3 เงื่อนไขต่อใบ)
 * ตารางครบทุกขาของ "ได้รับเงินแล้ว": แถว OrderPayment (มัดจำ/เต็ม/ยกเลิก) · ยืนยันรับเงิน · COD
 * ขาไหนขาด = บิลที่รับเงินแล้วถูกมองว่ายังไม่ชำระ ⇒ BILLING แก้ย้อนหลังได้
 */
const T = new Date('2026-10-10T03:00:00Z')
const base: OrderPaymentStateInput = { totalAmount: 1000, payments: [], paymentConfirmedAt: null, codReceivedAt: null }

describe('isOrderUnpaid', () => {
  it.each<[string, Partial<OrderPaymentStateInput>, boolean]>([
    ['ยังไม่มีอะไรเลย', {}, true],
    ['รับมัดจำ 300 แล้ว', { payments: [{ kind: 'DEPOSIT', amount: 300, voidedAt: null }] }, false],
    ['รับเต็มจำนวน', { payments: [{ kind: 'BALANCE', amount: '1000.00', voidedAt: null }] }, false],
    ['ยอดรับถูกยกเลิกแล้ว (voided) = ยังไม่ชำระ', { payments: [{ kind: 'DEPOSIT', amount: 300, voidedAt: T }] }, true],
    ['ยกเลิกใบหนึ่งแต่ยังมีอีกใบ', { payments: [{ kind: 'DEPOSIT', amount: 300, voidedAt: T }, { kind: 'BALANCE', amount: 500, voidedAt: null }] }, false],
    ['ร้านกดยืนยันรับเงินเอง (paymentConfirmedAt)', { paymentConfirmedAt: T }, false],
    ['รับเงินปลายทางแล้ว (codReceivedAt)', { codReceivedAt: T }, false],
    ['ISO string ก็นับ (ผ่าน RSC boundary)', { paymentConfirmedAt: '2026-10-10T03:00:00.000Z' }, false],
  ])('%s', (_name, patch, expected) => {
    expect(isOrderUnpaid({ ...base, ...patch })).toBe(expected)
  })
})
