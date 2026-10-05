// ตัดสินว่ากล่อง "ขั้นถัดไป" ของผู้ซื้อ (หน้า /o/{token} ฉบับล็อกอิน) แสดงอะไร
// ฟังก์ชันบริสุทธิ์ — ห้าม import React/prisma (SRS 00068 TFR-003, SDS TD-002)
// เป็นที่เดียวที่ตัดสินเรื่องนี้ ห้ามมีเงื่อนไขเดียวกันซ้ำใน JSX (HR16)
import { formatBaht } from './format-money'
import { formatDateTimeTH } from './format-date'
import {
  PAYMENT_STATE_LABEL,
  isCODPayment,
  isCashPayment,
  paymentMethodDetail,
  paymentMethodLabel,
} from './order-display'
import { deriveShippingStage, resolveOrderStatusBadge, type ShippingStageKey } from './order-stage'
import { resolveOrderStatusHeadline } from './order-status-headline'
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
  /** ร้านมีบัญชีรับเงิน (payoutSnapshot) ไหม — บังคับ ไม่มี default (R-7 · AC-BOP-05-3) */
  hasPayoutAccount: boolean
}

export type BuyerNextAction = {
  primary: 'NONE' | 'APPOINTMENT' | 'TRANSFER' | 'PICKUP' | 'SHIPMENT' | 'STATUS'
  /** non-null ก็ต่อเมื่อ primary === 'STATUS' */
  statusVariant: 'COD' | 'CASH' | 'DIGITAL' | 'PLAIN' | null
  /** ต้องแสดงบล็อกโอน + ที่แนบสลิป */
  transfer: boolean
  /** ต้องโอนแต่ร้านยังไม่ตั้งบัญชี — กล่องโอนต้องบอกให้ติดต่อร้าน ไม่ใช่ QR ว่าง (R-7) */
  transferNoAccount: boolean
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
    transferNoAccount: transfer && !i.hasPayoutAccount,
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

// ── ส่วนที่ NextActionCard ใช้ (00068 B4-L3) — ยังเป็นฟังก์ชันบริสุทธิ์ทั้งหมด ──

export type NextActionCardKind = 'TRANSFER' | 'PAYOUT' | 'PICKUP' | 'APPOINTMENT'

/**
 * วางการ์ด: hero (ตาม primary) + การ์ดตามติดที่ธงบอกว่าต้องมีแต่ไม่ใช่ตัวหลัก
 * ทำเป็นฟังก์ชันแทนเทอร์นารีใน JSX — "การ์ดนี้ซ้ำกับ hero ไหม" ถ้าเขียนกลับด้านจะได้การ์ดซ้อนกันสองใบ
 * หรือหายไปทั้งคู่ ซึ่งผ่าน tsc (ui-boolean-needs-a-testable-home)
 */
export function planNextActionCards(a: BuyerNextAction): {
  hero: 'APPOINTMENT' | 'TRANSFER' | 'PICKUP' | 'SHIPMENT' | 'STATUS' | null
  followUps: NextActionCardKind[]
} {
  const followUps: NextActionCardKind[] = []
  if (a.transfer && a.primary !== 'TRANSFER') followUps.push('TRANSFER')
  if (a.payoutCard) followUps.push('PAYOUT')
  if (a.pickupCard && a.primary !== 'PICKUP') followUps.push('PICKUP')
  if (a.appointmentCard && a.primary !== 'APPOINTMENT') followUps.push('APPOINTMENT')
  return { hero: a.primary === 'NONE' ? null : a.primary, followUps }
}

/**
 * หัวข้อ+ป้ายของกล่องพัสดุ — อาร์กิวเมนต์รูปเดียวกับ GuestOrderView ทุกตัว (`codReceivedAt: null`)
 * stage ตัวเดียว (`deriveShippingStage`) ป้อนทั้ง headline และ pill ⇒ ไม่มีทาง "ส่งถึงแล้ว" คู่ "กำลังจัดส่ง" (R-6)
 */
export function buyerShipmentStatus(i: {
  status: string
  carrierStatus: string | null
  hasShipment: boolean
  paymentMethod: string | null
  fulfillmentMode: string
  problemAt: string | null
}): {
  hasShipment: boolean
  stage: ShippingStageKey
  headline: string
  statusPill: string | null
  /** ของถึงปลายทางแล้ว — กล่องพัสดุชวนให้ตรวจของแล้วกดยืนยัน (ปุ่มล่างจอเป็นทึบในขั้นนี้) */
  delivered: boolean
} {
  const stage = deriveShippingStage({ ...i, codReceivedAt: null })
  const { headline, statusPill } = resolveOrderStatusHeadline({
    status: i.status,
    stage,
    hasShipment: i.hasShipment,
    carrierStatus: i.carrierStatus,
  })
  return { hasShipment: i.hasShipment, stage, headline, statusPill, delivered: i.hasShipment && (stage === 'DONE' || stage === 'AWAITING_COD') }
}

/** บรรทัดท้ายของกล่อง STATUS ที่บอกพฤติกรรมของหน้านี้ (มีเงื่อนไข ไม่ใช่คำสัญญา) */
export const STATUS_TRACKING_HINT = 'ถ้ามีเลขพัสดุ สถานะการจัดส่งจะขึ้นที่นี่'
export const STATUS_NO_TRACKING_COPY = 'ยังไม่มีเลขพัสดุในระบบ — สอบถามร้านได้ในแชท'
export const STATUS_NO_SHIPPING_COPY = 'สินค้านี้ไม่มีการจัดส่ง'

/** หัวข้อ + บรรทัดรองของกล่อง STATUS (UX-Design-Spec §2 ตาราง copy) */
export function buildStatusBoxView(i: {
  variant: NonNullable<BuyerNextAction['statusVariant']>
  status: string
  fulfillmentMode: string
  paymentMethod: string | null
  paymentConfirmedAt: string | null
  totalAmount: number
  /** ร้านขายของ = null */
  serviceMoney: { totalAmount: number; totalReceived: number; outstanding: number } | null
}): { headline: string; lines: string[]; chatCta: boolean } {
  // บรรทัด "เลขพัสดุจะขึ้นที่นี่" พูดได้เฉพาะออเดอร์ที่ยังมีเรื่องจัดส่ง
  const hint = i.fulfillmentMode === 'SHIPPED' ? [STATUS_TRACKING_HINT] : []
  const badgeLabel = resolveOrderStatusBadge(i.status).label

  if (i.variant === 'COD' || i.variant === 'CASH') {
    const detail = paymentMethodDetail(i.paymentMethod)
    return {
      headline: badgeLabel,
      lines: [`${paymentMethodLabel(i.paymentMethod)} · ${formatBaht(i.totalAmount)}`, ...(detail ? [detail] : []), ...hint],
      chatCta: false,
    }
  }
  if (i.paymentConfirmedAt) {
    return {
      headline: badgeLabel,
      lines: [`ร้านยืนยันรับเงินแล้วเมื่อ ${formatDateTimeTH(i.paymentConfirmedAt)}`, ...hint],
      chatCta: false,
    }
  }
  const m = i.serviceMoney
  if (m && m.totalAmount > 0 && m.outstanding <= 0) {
    return {
      headline: PAYMENT_STATE_LABEL.paid,
      lines: [`ร้านยืนยันรับครบ ${formatBaht(m.totalReceived)}`],
      chatCta: false,
    }
  }
  if (i.variant === 'DIGITAL') return { headline: badgeLabel, lines: [STATUS_NO_SHIPPING_COPY], chatCta: false }
  // PLAIN + ร้านแจ้งว่าส่งแล้วแต่ไม่มีพัสดุในระบบ (AC-BOP-06-6) — ต้องมีทางไปต่อ (แชท)
  if (i.status === 'SHIPPED') return { headline: badgeLabel, lines: [STATUS_NO_TRACKING_COPY], chatCta: true }
  return { headline: badgeLabel, lines: hint, chatCta: false }
}

export const TRANSFER_NO_ACCOUNT_TITLE = 'ร้านยังไม่ได้แจ้งเลขบัญชี'
export const TRANSFER_NO_ACCOUNT_BODY = 'ทักแชทกับร้านเพื่อสอบถามวิธีโอนเงินได้เลย'

/**
 * หัวเรื่อง+บรรทัดรองของกล่องโอน (UX §2) — ยอดมาจาก `resolveTransferAmount` ที่ผู้เรียกส่งมาเป็น `amountDue`
 * - แนบสลิปแล้ว: พูดแค่ข้อเท็จจริงที่ระบบรู้ ("ร้านยังไม่ได้ยืนยันรับเงิน") ไม่สัญญาแทนร้าน
 * - ร้านบริการที่ร้านรับมัดจำไปแล้วบางส่วน (D-4/R-3): "โอนส่วนที่ค้าง"
 */
export function buildTransferView(i: {
  amountDue: number
  /** ยอดที่ร้านยืนยันรับแล้ว — ร้านขายของ = 0 */
  totalReceived: number
  slipAttached: boolean
}): { title: string; subtitle: string } {
  if (i.slipAttached) return { title: 'แนบสลิปแล้ว', subtitle: 'ร้านยังไม่ได้ยืนยันรับเงิน' }
  const lead = i.totalReceived > 0 ? 'โอนส่วนที่ค้าง' : 'โอน'
  return { title: `${lead} ${formatBaht(i.amountDue)} ให้ร้าน`, subtitle: 'โอนแล้วแนบสลิปเพื่อแจ้งร้าน' }
}
