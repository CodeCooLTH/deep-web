/**
 * parcel-close — SSOT ของ "ร้านยืนยันปิดพัสดุขาไปที่มีปัญหา" (feature 00085)
 *
 * pure ไม่ import prisma: ทั้ง TS (stage/revenue), service, route และ UI เรียกชุดเดียวกัน (HR16)
 * ส่วนฉบับ SQL ต้องดึงค่า literal จากค่าคงที่ในไฟล์นี้ผ่าน lit() ห้ามพิมพ์เอง
 */
import { isCODPayment } from '@/lib/order-display'
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import {
  DELIVERED_CARRIER_STATUSES,
  IN_TRANSIT_CARRIER_STATUSES,
  RETURNED_CARRIER_STATUSES,
  holdsParcelProblem,
} from '@/lib/iship/status'

export const PARCEL_CLOSE_OUTCOMES = ['DELIVERY_FAILED', 'LOST_ON_RETURN'] as const
export type ParcelCloseOutcome = (typeof PARCEL_CLOSE_OUTCOMES)[number]

export const PARCEL_CLOSE_BASES = ['DELIVERED_AT', 'EVENT', 'ORDER_CONFIRMED', 'NONE'] as const
export type ParcelCloseBasis = (typeof PARCEL_CLOSE_BASES)[number]

export const PARCEL_CLOSE_REASONS = ['FIRE', 'LOST', 'DAMAGED', 'OTHER'] as const
export type ParcelCloseReason = (typeof PARCEL_CLOSE_REASONS)[number]

export const PARCEL_CLOSE_REASON_LABEL: Record<ParcelCloseReason, string> = {
  FIRE: 'ไฟไหม้',
  LOST: 'ของหาย',
  DAMAGED: 'สินค้าเสียหาย',
  OTHER: 'อื่น ๆ',
}

export const PARCEL_CLOSE_META: Record<
  ParcelCloseOutcome,
  { label: string; icon: string; buyerMessage: string }
> = {
  DELIVERY_FAILED: {
    label: 'ส่งไม่สำเร็จ',
    icon: 'package-off',
    buyerMessage: 'ส่งไม่สำเร็จ — ร้านบันทึกว่าพัสดุนี้ไม่ถึงมือคุณ ติดต่อร้านเพื่อสอบถามขั้นตอนต่อไป',
  },
  LOST_ON_RETURN: {
    label: 'ส่งสำเร็จ · คืนไม่สำเร็จ',
    icon: 'arrow-back-up',
    buyerMessage: 'พัสดุถึงปลายทางแล้ว แต่การส่งคืนร้านไม่สำเร็จ ติดต่อร้านหากต้องการสอบถามเพิ่มเติม',
  },
}

/**
 * ตัดสินว่าพัสดุหายช่วงไปหรือช่วงกลับ — เรียงหลักฐานแรง→อ่อน; ไม่มีหลักฐานเลย = ถือว่าไม่ถึงผู้รับ
 * (ผลที่เสียหายต่อร้านน้อยกว่าไม่ได้ ไม่ใช่การเดาว่าลูกค้าได้ของ)
 */
export function decideLossPhase(i: {
  deliveredAt: Date | string | null | undefined
  hasDeliveredEvent: boolean
  orderStatus: string
}): { outcome: ParcelCloseOutcome; basis: ParcelCloseBasis } {
  if (i.deliveredAt) return { outcome: 'LOST_ON_RETURN', basis: 'DELIVERED_AT' }
  if (i.hasDeliveredEvent) return { outcome: 'LOST_ON_RETURN', basis: 'EVENT' }
  if (i.orderStatus === 'CONFIRMED') return { outcome: 'LOST_ON_RETURN', basis: 'ORDER_CONFIRMED' }
  return { outcome: 'DELIVERY_FAILED', basis: 'NONE' }
}

export type ParcelCloseBlockCode =
  | 'NOT_FORWARD'
  | 'NOT_ACTIVE'
  | 'ALREADY_CLOSED'
  | 'NOT_IN_PROBLEM'
  | 'ORDER_FINISHED'
  | 'NOT_SHIPPED_MODE'
  | 'SERVICE_SHOP_UNSUPPORTED'

export interface CanCloseInput {
  shipment: {
    status: string
    isDryRun: boolean
    direction: string
    carrierStatus: string | null | undefined
    problemAt: Date | string | null | undefined
    problemClosedAt: Date | string | null | undefined
  }
  order: { status: string; fulfillmentMode: string; vertical: string | null | undefined }
}

/** ปุ่มปิดแสดงเมื่อไหร่ — UI และ service อ่านตัวนี้ตัวเดียว */
export function canCloseParcelProblem(f: CanCloseInput): { ok: true } | { ok: false; code: ParcelCloseBlockCode } {
  const { shipment: s, order: o } = f
  const no = (code: ParcelCloseBlockCode) => ({ ok: false as const, code })
  if (s.direction !== 'FORWARD') return no('NOT_FORWARD')
  if (s.status !== 'CREATED' || s.isDryRun) return no('NOT_ACTIVE')
  if (s.problemClosedAt) return no('ALREADY_CLOSED')
  if (['CANCELLED', 'RETURNED', 'DRAFTED'].includes(o.status)) return no('ORDER_FINISHED')
  if (o.fulfillmentMode !== 'SHIPPED') return no('NOT_SHIPPED_MODE')
  if (usesServiceFinanceRules(o.vertical)) return no('SERVICE_SHOP_UNSUPPORTED')
  // TODO(T3): holdsParcelProblem จะรับ arg ที่ 3 (parcelClosed)
  if (!holdsParcelProblem(s.carrierStatus, s.problemAt)) return no('NOT_IN_PROBLEM')
  return { ok: true }
}

/** ผล B + โอนเงิน เท่านั้นที่ต้องถามว่าคืนเงินลูกค้าแล้วหรือยัง (COD ไม่เคยได้เงิน) */
export function needsRefundAnswer(outcome: ParcelCloseOutcome, isCod: boolean): boolean {
  return outcome === 'LOST_ON_RETURN' && !isCod
}

/** ใบนี้ไม่นับเป็นยอดขายไหม — แช่แข็งลงคอลัมน์ตอนปิด */
export function parcelCloseExcludesRevenue(
  outcome: ParcelCloseOutcome,
  isCod: boolean,
  refunded: boolean | null | undefined,
): boolean {
  return outcome === 'DELIVERY_FAILED' || isCod || refunded === true
}

/** ใช้คำตัดสิน COD เดียวกับ order-stage (ห้ามเขียน regex ซ้ำ) */
export function isCodForParcelClose(paymentMethod: string | null | undefined): boolean {
  return isCODPayment(paymentMethod)
}

export function excludedFromRevenueByParcelClose(order: {
  shipments?: ReadonlyArray<{
    status: string
    isDryRun: boolean
    direction: string
    problemCloseExcludesRevenue: boolean | null | undefined
  }>
}): boolean {
  return (order.shipments ?? []).some(
    (s) => s.status === 'CREATED' && !s.isDryRun && s.direction === 'FORWARD' && s.problemCloseExcludesRevenue === true,
  )
}

const inSet = (set: readonly string[], c: string | null | undefined) => !!c && set.includes(c)

/**
 * สถานะขนส่งที่มาหลังปิดขัดกับที่ร้านบันทึกไหม — แค่เตือน ไม่พลิกเงิน/กองเอง
 * ไม่มีข้อมูลใหม่หลังปิด (carrierStatusAt <= closedAt) = ไม่ขัด
 */
export function hasParcelCloseConflict(i: {
  outcome: ParcelCloseOutcome
  carrierStatus: string | null | undefined
  carrierStatusAt: Date | string | null | undefined
  closedAt: Date | string
}): boolean {
  if (!i.carrierStatusAt) return false
  if (new Date(i.carrierStatusAt).getTime() <= new Date(i.closedAt).getTime()) return false
  if (i.outcome === 'DELIVERY_FAILED') {
    return (
      inSet(DELIVERED_CARRIER_STATUSES, i.carrierStatus) ||
      inSet(RETURNED_CARRIER_STATUSES, i.carrierStatus) ||
      inSet(IN_TRANSIT_CARRIER_STATUSES, i.carrierStatus)
    )
  }
  return i.carrierStatus === 'return_success'
}
