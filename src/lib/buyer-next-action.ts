// ตัดสินว่ากล่อง "ขั้นถัดไป" ของผู้ซื้อ (หน้า /o/{token} ฉบับล็อกอิน) แสดงอะไร
// ฟังก์ชันบริสุทธิ์ — ห้าม import React/prisma (SRS 00068 TFR-003, SDS TD-002)
// เป็นที่เดียวที่ตัดสินเรื่องนี้ ห้ามมีเงื่อนไขเดียวกันซ้ำใน JSX (HR16)
import { isCODPayment, isCashPayment } from './order-display'
import { isPickupOrder } from './order-pickup'
import { needsPayoutAccount } from './shop-payout'

export type BuyerNextActionInput = {
  /** ค่านอก allow-list ถือว่า "ปิด" (fail-closed) */
  status: string
  isServiceShop: boolean
  hasAppointment: boolean
  paymentMethod: string | null
  paymentConfirmedAt: string | null
  fulfillmentMode: string
  hasShipment: boolean
  totalAmount: number
  /** order.serviceMoney?.outstanding ?? null (ร้านขายของ = null) */
  outstanding: number | null
}

export type BuyerNextAction = {
  primary: 'NONE' | 'APPOINTMENT' | 'TRANSFER' | 'PICKUP' | 'SHIPMENT' | 'STATUS'
  /** non-null ก็ต่อเมื่อ primary === 'STATUS' */
  statusVariant: 'COD' | 'CASH' | 'DIGITAL' | 'PLAIN' | null
  /** ต้องแสดงบล็อกโอน + ที่แนบสลิป */
  transfer: boolean
  /** การ์ดบัญชีรับเงินแบบสรุป (ถอด QR เมื่อ settled) — ด่าน P0-2 */
  payoutCard: boolean
  pickupCard: boolean
  appointmentCard: boolean
}

/** ยอดที่ผู้ซื้อต้องโอน: ร้านบริการ = ยอดค้าง (D-4) · ร้านขายของ = ยอดเต็ม */
export function resolveTransferAmount(i: { totalAmount: number; outstanding: number | null }): number {
  return i.outstanding ?? i.totalAmount
}

export function resolveBuyerNextAction(i: BuyerNextActionInput): BuyerNextAction {
  // allow-list ไม่ใช่ deny-list: สถานะใหม่ในอนาคตต้องไม่ถูกเดาว่า "ยังเปิด"
  const open = i.status === 'PENDING' || i.status === 'SHIPPED'
  const needsPay = needsPayoutAccount(i.paymentMethod)
  const amountDue = resolveTransferAmount(i)
  // ร้านบริการไม่มี paymentConfirmedAt เลย (setPaymentConfirmed throw) → ตัวตัดสินจริงคือ amountDue > 0
  const transfer =
    open && i.status === 'PENDING' && needsPay && !i.paymentConfirmedAt && amountDue > 0
  const base = {
    transfer,
    payoutCard: needsPay && !transfer,
    pickupCard: isPickupOrder(i.fulfillmentMode),
    appointmentCard: i.hasAppointment,
  }
  const out = (primary: BuyerNextAction['primary'], statusVariant: BuyerNextAction['statusVariant'] = null): BuyerNextAction =>
    ({ ...base, primary, statusVariant })

  if (!open) return out('NONE')
  if (i.isServiceShop && i.hasAppointment) return out('APPOINTMENT')
  if (transfer) return out('TRANSFER')
  if (base.pickupCard) return out('PICKUP')
  if (i.fulfillmentMode === 'SHIPPED' && i.hasShipment) return out('SHIPMENT')
  if (isCODPayment(i.paymentMethod)) return out('STATUS', 'COD')
  if (isCashPayment(i.paymentMethod)) return out('STATUS', 'CASH')
  if (i.fulfillmentMode === 'NO_SHIPPING') return out('STATUS', 'DIGITAL')
  return out('STATUS', 'PLAIN')
}
