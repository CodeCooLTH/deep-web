/**
 * buyer-order-summary.ts — ฟังก์ชันบริสุทธิ์ของหน้าคำสั่งซื้อฝั่งผู้ซื้อ (feature 00068 · TFR-001/TFR-009)
 *
 * ไม่ import prisma/React — ตัดสิน "อะไรแสดง/พูดว่าอะไร" ไว้ที่เดียวให้เทสจับได้
 * (docs/conventions/ui-boolean-needs-a-testable-home.md)
 *
 * 🛑 null ≠ 0 (partial-data-must-be-labeled-or-filled.md): "ไม่รู้" ห้ามถูกพิมพ์เป็นเลข 0
 */
import { PAYMENT_STATE_LABEL, SELLER_CONFIRMED_PAID_LABEL, canSellerConfirmPayment } from '@/lib/order-display'

/** หน่วยของคะแนนรีวิว — ค่าเดียว (มติ D-8: "คะแนนรีวิว" คือชื่อ, "ดาว" คือหน่วย) */
export const SHOP_RATING_UNIT = 'ดาว'

/**
 * บรรทัดย่อหลักฐานร้านบนหัว — คืน null เมื่อไม่มีอะไรจะพูด (ไม่แสดงบรรทัดเลย)
 * avgRating ≤ 0/NaN = "ยังไม่มีรีวิว" ไม่ใช่ "0 ดาว" ; completedOrders null = ไม่รู้
 * completedOrders 0 = ไม่เขียน (มติ D-11 — ป้าย "ร้านใหม่" ในการ์ดหลักฐานเป็นคนบอกแทน)
 */
export function buildShopSummaryLine(input: {
  avgRating: number | null
  completedOrders: number | null
}): string | null {
  const { avgRating, completedOrders } = input
  const rating =
    avgRating != null && Number.isFinite(avgRating) && avgRating > 0
      ? `${avgRating.toFixed(1)} ${SHOP_RATING_UNIT}`
      : null
  const orders =
    completedOrders != null && Number.isFinite(completedOrders) && completedOrders > 0
      ? `ออเดอร์สำเร็จ ${completedOrders.toLocaleString('th-TH')} ครั้ง`
      : null
  const parts = [rating, orders].filter((x): x is string => x !== null)
  return parts.length ? parts.join(' · ') : null
}

/** ป้ายแถวเงินร้านบริการ — คำชุดเดียวกับ PaymentSummaryCard / completionWarning (BR-SQ-02) */
export const SLIP_DEPOSIT_RECEIVED_LABEL = 'ร้านยืนยันรับแล้ว'
export const SLIP_DEPOSIT_AGREED_LABEL = 'มัดจำที่ตกลงไว้'
export const SLIP_OUTSTANDING_LABEL = 'ยังค้างชำระ'

export interface SlipServiceLines {
  total: number
  /** null = ใบนี้ไม่มีมัดจำให้พูดถึง (BR-SQ-07) */
  deposit: { amount: number; received: boolean; label: string } | null
  outstanding: number
  /** ชำระครบจริง (ยอด > 0 และไม่เหลือค้าง) — จอเขียน outstandingLabel พร้อมไอคอนติ๊ก ไม่พิมพ์ ฿0 (R-9) */
  settled: boolean
  outstandingLabel: string
}

export interface SlipMoneyView {
  /** ยอดรวมของใบ — จอสลิปพิมพ์ค่านี้ ไม่อ่าน totalAmount เอง */
  total: number
  totalLabel: 'ยอดที่ต้องชำระ' | 'ยอดรวม'
  /** ป้าย "ร้านยืนยันรับเงินแล้ว" — เฉพาะร้านที่ไม่ใช่บริการ (money == null) · ห้ามคำว่า "ชำระแล้ว" */
  paidChip: string | null
  /** เฉพาะร้านบริการที่มี money */
  serviceLines: SlipServiceLines | null
}

export function buildSlipMoneyView(input: {
  totalAmount: number
  paymentConfirmedAt: string | Date | null
  /** เงื่อนไขชุดเดียวกับกิ่ง 'ร้านยืนยันรับเงินแล้ว' ของ getPaymentBadge — COD ไม่มีป้ายนี้ (HR16) */
  paymentMethod: string | null
  status: string
  money: {
    totalAmount: number
    depositAgreed: number
    /** จาก computeOrderMoney.depositReceived — ห้ามบวก entries เองหน้าจอ */
    depositReceived: number
    outstanding: number
    hasDeposit: boolean
  } | null
}): SlipMoneyView {
  const { money, status, paymentConfirmedAt, paymentMethod, totalAmount } = input
  const confirmed = paymentConfirmedAt != null
  // ใบที่ร้านรับเงินแล้วแต่ยัง PENDING ห้ามขึ้น "ยอดที่ต้องชำระ" คู่ป้ายรับแล้ว (UX §3 · SRS ขาด !confirmed)
  const totalLabel = status === 'PENDING' && money == null && !confirmed ? 'ยอดที่ต้องชำระ' : 'ยอดรวม'
  const paidChip =
    money == null && confirmed && status !== 'CANCELLED' && canSellerConfirmPayment(paymentMethod) ? SELLER_CONFIRMED_PAID_LABEL : null

  if (money == null) return { total: totalAmount, totalLabel, paidChip, serviceLines: null }

  const received = money.depositReceived > 0
  // บิลยอด 0 ห้ามอ้างว่าชำระแล้ว (กติกาเดียวกับ PaymentSummaryCard.paidPercentOf)
  const settled = money.totalAmount > 0 && money.outstanding <= 0
  return {
    total: totalAmount,
    totalLabel,
    paidChip,
    serviceLines: {
      total: money.totalAmount,
      deposit: money.hasDeposit
        ? {
            // ป้าย "รับแล้ว" ขึ้นเฉพาะเงินที่ร้านบันทึกรับจริง ไม่ใช่ยอดที่ตกลงไว้ (AC-BOP-10-7)
            amount: received ? money.depositReceived : money.depositAgreed,
            received,
            label: received ? SLIP_DEPOSIT_RECEIVED_LABEL : SLIP_DEPOSIT_AGREED_LABEL,
          }
        : null,
      outstanding: money.outstanding,
      settled,
      outstandingLabel: settled ? PAYMENT_STATE_LABEL.paid : SLIP_OUTSTANDING_LABEL,
    },
  }
}

/**
 * คำบนตราประทับ — ผู้ซื้อกดปิดเอง = "ได้รับแล้ว"/"รับบริการแล้ว" · อื่น ๆ (COD/ระบบปิดเอง/ใบเก่าไม่มี event) = "สำเร็จ"
 * (ความหมายเดียวกับ OrderDetailMobile เดิม — ตราต้องตรงกับคนที่ปิดใบจริง)
 */
export function resolveStampLabel(byBuyer: boolean, isServiceShop: boolean): string {
  if (!byBuyer) return 'สำเร็จ'
  return isServiceShop ? 'รับบริการแล้ว' : 'ได้รับแล้ว'
}
