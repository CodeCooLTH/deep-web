/**
 * order-return — กฎของ "ใบคืนของ" ที่ทดสอบได้โดยไม่ต้องมีฐานข้อมูล (feature 00056)
 *
 * pure module — ห้าม import prisma/server-only
 *
 * 🛑 **คืนของ ≠ ตีกลับ** (BRD §1)
 *   - ตีกลับ = ขนส่งส่งไม่สำเร็จ ผู้ซื้อ **ไม่เคยได้รับของ** (`carrierStatus ∈ RETURNED_CARRIER_STATUSES`)
 *   - คืนของ = ผู้ซื้อ **ได้รับแล้วส่งคืน**
 * ต่างกันที่ความรับผิด ค่าส่ง และการตีความสถิติผู้ซื้อ · ใบเดียวเป็นทั้งสองอย่างพร้อมกันไม่ได้
 */

import { isDeliveredCarrierStatus, isReturnedCarrierStatus } from './iship/status'

export const RETURN_STATUS = {
  REQUESTED: 'REQUESTED',
  SHIPPING: 'SHIPPING',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const

export type ReturnStatus = (typeof RETURN_STATUS)[keyof typeof RETURN_STATUS]

/** สถานะที่ถือว่าใบคืน "ยังไม่จบ" — 1 ออเดอร์มีได้ใบเดียว (BR-RT-03, partial unique ที่ฐาน) */
export const OPEN_RETURN_STATUSES: ReturnStatus[] = [RETURN_STATUS.REQUESTED, RETURN_STATUS.SHIPPING]

export type ReturnBlockReason =
  | 'ORDER_NOT_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'PARCEL_WAS_RETURNED'
  | 'RETURN_ALREADY_OPEN'
  | 'NOTHING_LEFT'

export const RETURN_BLOCK_TEXT: Record<ReturnBlockReason, string> = {
  ORDER_NOT_DELIVERED: 'คืนของได้เมื่อของถึงมือลูกค้าแล้วเท่านั้น',
  ORDER_CANCELLED: 'คำสั่งซื้อนี้ถูกยกเลิกไปแล้ว',
  // ถ้อยคำต้องแยกสองเรื่องนี้ให้ชัด ไม่งั้นร้านจะงงว่า "ก็มันตีกลับแล้วไง ทำไมคืนไม่ได้"
  PARCEL_WAS_RETURNED: 'พัสดุถูกตีกลับก่อนถึงมือลูกค้า — ใบนี้ให้ยกเลิกคำสั่งซื้อแทนการคืนของ',
  RETURN_ALREADY_OPEN: 'คำสั่งซื้อนี้มีเรื่องคืนของที่ยังไม่จบอยู่แล้ว',
  NOTHING_LEFT: 'ทุกรายการถูกคืนครบแล้ว',
}

export type ReturnEligibilityInput = {
  orderStatus: string
  /** carrierStatus ของพัสดุ **ขาไป** ใบล่าสุด (null = ร้านแจ้งเลขเอง/ยังไม่เปิดพัสดุ) */
  forwardCarrierStatus: string | null
  /** มีใบคืนที่ยังไม่จบอยู่แล้วไหม */
  hasOpenReturn: boolean
  /** จำนวนที่ยังคืนได้รวมทุกรายการ */
  remainingQty: number
}

/**
 * canCreateReturn — สร้างใบคืนได้ไหม · คืน `null` = ได้ · คืนเหตุผล = ไม่ได้
 *
 * 🛑 อยู่ที่นี่ไม่ใช่เทอร์นารีกลาง route ตาม `docs/conventions/ui-boolean-needs-a-testable-home.md`
 * — เกณฑ์คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม" ซึ่งอันนี้เขียนกลับด้านได้ง่ายมาก
 * แล้วผลคือร้านเปิดใบคืนกับออเดอร์ที่ยังไม่ได้ส่ง (ออกเลขพัสดุขากลับจากที่อยู่ที่ของยังไม่เคยไปถึง)
 */
export function canCreateReturn(input: ReturnEligibilityInput): ReturnBlockReason | null {
  if (input.orderStatus === 'CANCELLED') return 'ORDER_CANCELLED'
  if (input.hasOpenReturn) return 'RETURN_ALREADY_OPEN'
  if (input.remainingQty <= 0) return 'NOTHING_LEFT'

  /**
   * 🛑 ตีกลับต้องเช็ค **ก่อน** ด่าน "ของถึงมือแล้วหรือยัง"
   *
   * เคสที่ลำดับมีผลจริงคือ **ออเดอร์ที่ `CONFIRMED` แล้วพัสดุตีกลับทีหลัง** (ผู้ซื้อกดยืนยัน
   * ตอนเห็นเลขพัสดุ แล้วขนส่งส่งไม่สำเร็จ — `Order.status` ไม่ถอยกลับเอง) ถ้าเช็คทีหลัง
   * `CONFIRMED` จะคืน `null` ไปก่อน แล้วร้านเปิดใบคืนของที่ลูกค้าไม่เคยได้รับ
   *
   * (mutation รอบแรกย้ายบรรทัดนี้ลงไปข้างล่างแล้วเทสยังเขียว เพราะชุด input มีแต่ `SHIPPED`
   * ซึ่งไม่เข้าด่าน `CONFIRMED` อยู่แล้ว — ชุดข้อมูลอ่อน ไม่ใช่ mutation ไม่เกี่ยว
   * docs/conventions/mutation-silence-means-weak-corpus.md)
   */
  if (isReturnedCarrierStatus(input.forwardCarrierStatus)) return 'PARCEL_WAS_RETURNED'

  /**
   * "ของถึงมือลูกค้าแล้ว" มี 2 หลักฐาน — อย่างใดอย่างหนึ่งพอ:
   *   1. ผู้ซื้อกดยืนยันรับของเอง (`CONFIRMED`) — หลักฐานที่แข็งที่สุด
   *   2. ขนส่งบอกว่าส่งถึงแล้ว (`delivered`/`payment_success`)
   *
   * `SHIPPED` เฉย ๆ **ไม่พอ** — สถานะนั้นร้านตั้งเองได้ (กดแจ้งจัดส่ง) การยอมรับมันเท่ากับ
   * ให้ร้านออกเลขพัสดุขากลับของของที่ยังไม่เคยออกจากร้าน
   */
  if (input.orderStatus === 'CONFIRMED') return null
  if (isDeliveredCarrierStatus(input.forwardCarrierStatus)) return null
  return 'ORDER_NOT_DELIVERED'
}

/**
 * remainingReturnable — จำนวนที่ยังคืนได้ของรายการหนึ่ง (BR-RT-04)
 *
 * นับเฉพาะใบคืนที่ **สำเร็จแล้ว** (`RECEIVED`) และใบที่ **ยังไม่จบ** — ใบที่ถูกยกเลิกต้องคืน
 * โควตากลับมา ไม่งั้นลูกค้าที่เปลี่ยนใจครั้งเดียวจะคืนของชิ้นนั้นไม่ได้อีกตลอดไป
 */
export function remainingReturnable(orderedQty: number, claimedQty: number): number {
  return Math.max(0, orderedQty - claimedQty)
}

export type ReturnLine = { qty: number; unitPrice: number }

/** ยอดที่คืน — คิดจากราคาที่ **แช่แข็งไว้ตอนขาย** ไม่ใช่ราคาสินค้าปัจจุบัน */
export function computeRefundAmount(lines: ReturnLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
}

/**
 * isFullyReturned — คืนครบทุกรายการหรือยัง (BR-RT-06)
 *
 * ใช้ตัดสินว่า `Order.status` ควรเป็น `RETURNED` ไหม — **คืนบางส่วนไม่เปลี่ยนสถานะออเดอร์**
 * (ยอดขายหักตามจริงอยู่แล้ว แต่ใบนั้นยังเป็นการขายที่สำเร็จบางส่วน)
 *
 * 🛑 ต้องเทียบ "ทุกรายการ" ไม่ใช่ "ผลรวมจำนวน" — ซื้อ A×1 B×3 แล้วคืน A×0 B×4 ไม่มีทางเกิด
 * เพราะด่าน BR-RT-04 กันไว้ แต่ถ้าเทียบผลรวมอย่างเดียว การคืน B ครบ 3 + A 1 = 4 จะเท่ากับ
 * ผลรวมที่ซื้อพอดี ทั้งที่อาจมีรายการที่ยังไม่ถูกคืนเลย
 */
export function isFullyReturned(items: { orderedQty: number; returnedQty: number }[]): boolean {
  if (items.length === 0) return false
  return items.every((i) => i.returnedQty >= i.orderedQty)
}

// ─── รูปแบบการคืน: ใครออกค่าส่ง × ที่มาของเลขพัสดุ (หัวหน้าสั่ง 2026-08-24) ───────

export const RETURN_PAYER = { SHOP: 'SHOP', BUYER: 'BUYER' } as const
export type ReturnPayer = (typeof RETURN_PAYER)[keyof typeof RETURN_PAYER]

export const RETURN_TRACKING_SOURCE = { ISHIP: 'ISHIP', MANUAL: 'MANUAL', NONE: 'NONE' } as const
export type ReturnTrackingSource =
  (typeof RETURN_TRACKING_SOURCE)[keyof typeof RETURN_TRACKING_SOURCE]

/** คำที่ผู้ใช้เห็น — SSOT เดียว ห้ามพิมพ์ซ้ำที่จอ (HR16) */
export const RETURN_PAYER_TEXT: Record<ReturnPayer, string> = {
  SHOP: 'ร้านออกค่าส่งคืนให้',
  BUYER: 'ลูกค้าออกค่าส่งเอง',
}

export const RETURN_TRACKING_SOURCE_TEXT: Record<ReturnTrackingSource, string> = {
  ISHIP: 'ออกเลขพัสดุผ่าน iShip',
  MANUAL: 'กรอกเลขพัสดุเอง',
  NONE: 'ไม่มีเลขพัสดุ',
}

export type ReturnShippingChoice = {
  payer: ReturnPayer
  trackingSource: ReturnTrackingSource
  manualTrackingNo?: string | null
  /** ร้านเลือกเองว่าจะนับเป็นต้นทุนไหม — มีผลเฉพาะตอน payer='BUYER' (ดู resolveCountAsCost) */
  countAsCost?: boolean
}

export type ReturnShippingBlock =
  | 'MANUAL_NEEDS_TRACKING'
  | 'ISHIP_NEEDS_SHOP_PAYS'
  | 'TRACKING_NOT_ALLOWED'

export const RETURN_SHIPPING_BLOCK_TEXT: Record<ReturnShippingBlock, string> = {
  MANUAL_NEEDS_TRACKING: 'กรอกเลขพัสดุขากลับด้วย',
  // ระบบเปิดพัสดุผ่านเครดิต iShip **ของร้าน** เสมอ — ค่าส่งจึงออกโดยร้านโดยอัตโนมัติ
  // ถ้าลูกค้าจะออกเอง เขาต้องไปเปิดพัสดุเองแล้วส่งเลขมาให้กรอก (= MANUAL)
  ISHIP_NEEDS_SHOP_PAYS: 'ออกเลขผ่าน iShip ได้เฉพาะกรณีร้านออกค่าส่งให้ (ระบบตัดจากเครดิตร้าน)',
  TRACKING_NOT_ALLOWED: 'รูปแบบนี้ไม่ต้องกรอกเลขพัสดุ',
}

/**
 * validateReturnShipping — ตรวจรูปแบบการคืนก่อนบันทึก · `null` = ผ่าน
 *
 * 🛑 ที่ต้องมีด่านนี้ทั้งที่ฐานมี CHECK แล้ว: CHECK ตอบว่า "แถวนี้เป็นไปได้ไหม" แต่ไม่ได้ตอบว่า
 * "ทำไมถึงไม่ได้" — ผู้ใช้ต้องเห็นเหตุผลที่แก้ได้จริง ไม่ใช่ error 500 จาก constraint
 */
export function validateReturnShipping(c: ReturnShippingChoice): ReturnShippingBlock | null {
  if (c.trackingSource === RETURN_TRACKING_SOURCE.MANUAL) {
    if (!c.manualTrackingNo || c.manualTrackingNo.trim() === '') return 'MANUAL_NEEDS_TRACKING'
  } else if (c.manualTrackingNo && c.manualTrackingNo.trim() !== '') {
    // สองแหล่งความจริงในแถวเดียว — เลขที่กรอกเองกับเลขจาก iShip จะขัดกันวันที่ต้องใช้
    return 'TRACKING_NOT_ALLOWED'
  }

  if (c.trackingSource === RETURN_TRACKING_SOURCE.ISHIP && c.payer !== RETURN_PAYER.SHOP) {
    return 'ISHIP_NEEDS_SHOP_PAYS'
  }
  return null
}

/**
 * resolveCountAsCost — สรุปว่าจะบันทึกค่าส่งขากลับเป็นต้นทุนไหม
 *
 * 🛑 ร้านจ่ายเอง = **บังคับเป็นต้นทุนเสมอ** ห้ามให้ปิด — เงินออกจากกระเป๋าร้านไปแล้วจริง
 * การยอมให้ติ๊กออกเท่ากับให้ร้านซ่อนค่าใช้จ่ายจากตัวเอง แล้วตัวเลขกำไรจะสวยกว่าความจริง
 *
 * ลูกค้าจ่าย = ร้านเลือกได้ · ค่าตั้งต้นคือ **ไม่นับ** (เงินไม่ได้ออกจากร้าน) แต่เปิดได้เพราะ
 * บางเคสลูกค้าออกเลขเองแล้วมาเรียกเก็บร้านทีหลัง (หัวหน้าระบุเคสนี้มาเอง)
 */
export function resolveCountAsCost(payer: ReturnPayer, chosen?: boolean): boolean {
  if (payer === RETURN_PAYER.SHOP) return true
  return chosen ?? false
}
