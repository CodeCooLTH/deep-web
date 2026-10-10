/**
 * order-payment-state — "บิลนี้ยังไม่ชำระ" ตามเกณฑ์ที่ใช้ล็อกการแก้ไขของ BILLING (00071 P3 · มติ C-7)
 *
 * ทำไมไม่เขียนนิพจน์ใหม่: "รับเงินแล้วเท่าไร" มีนิยามเดียวใน `computeOrderMoney` (order-payment.ts · HR16) —
 * ขา OrderPayment ใช้ `.unpaid` ของมัน (แถวที่ยกเลิกแล้วไม่นับ) ที่นี่เพิ่มแค่สองขาที่ตัวนั้นไม่รู้จัก:
 * ร้านกดยืนยันรับเงิน (`paymentConfirmedAt`) กับรับเงินปลายทาง (`codReceivedAt`)
 * ขาไหนขาดไป = บิลที่รับเงินแล้วถูกมองว่ายังไม่ชำระ ⇒ BILLING แก้ย้อนหลังได้ (เทสตารางกันทุกขา)
 */
import { computeOrderMoney, type OrderPaymentKind } from '@/lib/order-payment'

export interface OrderPaymentStateInput {
  totalAmount: number | string | { toString(): string }
  payments: readonly { kind: string; amount: number | string | { toString(): string }; voidedAt: Date | null }[]
  paymentConfirmedAt: Date | string | null
  codReceivedAt: Date | string | null
}

export function isOrderUnpaid(o: OrderPaymentStateInput): boolean {
  const money = computeOrderMoney({
    totalAmount: Number(o.totalAmount.toString()),
    depositAgreed: null,
    payments: o.payments.map((p) => ({
      kind: p.kind as OrderPaymentKind,
      amount: Number(p.amount.toString()),
      voidedAt: p.voidedAt,
    })),
  })
  return money.unpaid && !o.paymentConfirmedAt && !o.codReceivedAt
}
