/**
 * chat-order-progress — adapter ของ deriveShippingStage สำหรับแถบสถานะออเดอร์ในห้องแชท
 * (งาน Order Progress 2026-08-05)
 *
 * pure module (ใช้ทั้ง server enrich และ client render) — ตัวตัดสิน "ใบไหนยังเป็นงานค้าง"
 * คือ deriveShippingStage ตัวเดียวกับไทล์ Command Center และตัวกรอง /orders?stage= เสมอ
 * ห้ามเขียนเงื่อนไขซ้ำที่นี่ ไม่งั้นแถบในแชทกับไทล์หน้าแรกจะตอบไม่ตรงกัน
 */

import { isProblemCarrierStatus } from './iship/status'
import { hasUsableShipment } from './shipping/provider'
import { PARCEL_CLOSE_META, type ParcelCloseOutcome } from './parcel-close'
import {
  deriveShippingStage,
  isActionableShippingStage,
  PROBLEM_RETRY_LABEL_SHORT,
  SHIPPING_STAGE_LABEL,
  type ShippingStageKey,
} from './order-stage'

export interface ProgressOrderInput {
  status: string
  paymentMethod?: string | null
  codReceivedAt?: string | null
  /**
   * `Order.fulfillmentMode` (feature 00062) — บังคับ เพราะ `deriveShippingStage()` ต้องใช้
   * ตัดสินก่อนทุกกิ่ง ถ้าเป็น optional แล้วผู้เรียกลืมส่ง ออเดอร์นัดรับจะกลับไปตกกอง
   * "รอเลขพัสดุ" เงียบ ๆ เหมือนบั๊กเดิม
   */
  fulfillmentMode: string
  /**
   * มีแถว ShipmentTracking (เลขส่งเอง) ไหม (feature 00080) — บังคับด้วยเหตุผลเดียวกับ `fulfillmentMode`
   * และเพราะการ์ดแชทมี 2 ตัว serialize (20 ใบแรกใน page.tsx · ใบที่ 21+ ใน order.service.ts) ที่ต้องตรงกัน
   */
  hasManualTracking: boolean
  /** พัสดุใบล่าสุดที่ไม่ถูกยกเลิก (null/ไม่ส่งมา = ยังไม่เปิดพัสดุ) — optional เพื่อรับ
   *  CustomerPanelOrder ตรง ๆ ได้โดยไม่ต้อง remap (field เกินผ่าน structural typing) */
  shipment?: {
    status: string
    carrierStatus: string | null
    /**
     * "เคยมีปัญหาครั้งแรกเมื่อไร" — ตัวทำให้กอง "พัสดุมีปัญหา" ค้างเหนียว (2026-09-14)
     *
     * 🛑 **บังคับ ไม่ใช่ optional** เพราะการ์ดในแชทมี *สอง* ตัว serialize ที่ต้องตรงกัน
     * (20 ใบแรกที่ `inbox/[conversationId]/page.tsx` · ใบที่ 21+ ที่ `order.service.ts`)
     * ถ้าเป็น optional แล้วมีที่ไหนลืมส่ง การ์ดจะสลับกองระหว่างเลื่อนดูรายการเดียวกัน
     */
    problemAt: string | Date | null
    /**
     * OrderShipment.problemCloseOutcome (00085) — บังคับด้วยเหตุผลเดียวกับ `problemAt`:
     * การ์ดแชทมี 2 ตัว serialize ถ้าตัวใดลืม ใบที่ร้านปิดแล้วจะกลับไปอยู่กองปัญหาเฉพาะจอนั้น
     */
    problemCloseOutcome: ParcelCloseOutcome | null
  } | null
}

/** แปลง shape ของการ์ดในแชท → input ของ deriveShippingStage */
export function orderShippingStage(o: ProgressOrderInput): ShippingStageKey {
  const sh = o.shipment ?? null
  // FAILED = การสร้างพัสดุล้มเหลว ยังไม่มีพัสดุจริงบนขนส่ง — เทียบเท่า "ยังไม่เปิดพัสดุ"
  const hasShipment = !!sh && hasUsableShipment(sh.status)
  return deriveShippingStage({
    status: o.status,
    carrierStatus: hasShipment ? sh.carrierStatus : null,
    hasShipment,
    paymentMethod: o.paymentMethod,
    codReceivedAt: o.codReceivedAt,
    fulfillmentMode: o.fulfillmentMode,
    problemAt: hasShipment ? (sh.problemAt ?? null) : null,
    hasManualTracking: o.hasManualTracking,
    parcelClose: hasShipment ? (sh.problemCloseOutcome ?? null) : null,
  })
}

/** เฉพาะใบที่ยังเป็นงานค้าง (isActionableShippingStage — ไม่รวมใบที่ร้านปิดแล้ว) — ลำดับคงเดิมตามที่ caller เรียงมา (ล่าสุดก่อน) */
export function filterActiveOrders<T extends ProgressOrderInput>(orders: T[]): T[] {
  return orders.filter((o) => isActionableShippingStage(orderShippingStage(o)))
}

/**
 * ชิปของแต่ละกอง — pattern เดียวกับ ORDER_STAGE_META (`bg-{tone}/15 text-{tone}-ink`)
 * เขียนเต็มคำทุกตัว (Tailwind สแกน static) · โทนล้อความหมายเดียวกับป้ายในรายการแชท:
 * ปัญหา = danger, กำลังเดินทาง = info, รอเงิน = warning, ที่เหลือ = primary (งานปกติ)
 */
export const STAGE_CHIP_CLS: Record<Exclude<ShippingStageKey, 'DONE' | 'NOT_SHIPPING' | 'DELIVERY_FAILED'>, string> = {
  // feature 00061 — warning ตรงกับ `ORDER_STATUS_META.DRAFTED` (ใบเดียวกันสามจอต้องโทนเดียวกัน)
  DRAFT: 'bg-warning/15 text-warning-ink',
  AWAITING_PARCEL: 'bg-primary/15 text-primary-ink',
  // feature 00080 — warning ตรงกับ STAGE_BADGE_OVERRIDE.AWAITING_DISPATCH (ใบเดียวกันทุกจอโทนเดียวกัน)
  AWAITING_DISPATCH: 'bg-warning/15 text-warning-ink',
  AWAITING_PICKUP: 'bg-primary/15 text-primary-ink',
  SHIPPING: 'bg-info/15 text-info-ink',
  AWAITING_COD: 'bg-warning/15 text-warning-ink',
  PROBLEM: 'bg-danger/15 text-danger-ink',
  // ตีกลับ = warning ตรงกับ STAGE_BADGE_OVERRIDE.RETURNED และไทล์หน้าแรก (ใบเดียวกันสามจอ
  // ต้องโทนเดียวกัน) ไม่ใช่ danger เพราะเรื่องกับขนส่งจบแล้ว
  RETURNED: 'bg-warning/15 text-warning-ink',
}

/**
 * ชิปสถานะพัสดุของ stage หนึ่งค่า — **`null` = ใบนี้ไม่มีอะไรเรื่องพัสดุให้พูดถึง**
 *
 * 🛑 มีไว้เพื่อให้ "กองที่ไม่มีคำ" ถูกจัดการที่เดียว ไม่ใช่ให้แต่ละจอเขียน `stage !== 'DONE'`
 * เองแล้วลืมเคสใหม่ (feature 00062 เพิ่ม `NOT_SHIPPING` เข้ามาเป็นกองที่สองที่ไม่มีคำ —
 * จอที่เช็คแค่ `!== 'DONE'` จะพังทันทีที่มีออเดอร์นัดรับใบแรก)
 *
 * `DONE` = จบแล้ว · `NOT_SHIPPING` = ไม่เคยมีการส่งของเลย (นัดรับ/ดิจิทัล) — คนละเหตุผล
 * แต่ผลลัพธ์บนจอเหมือนกันคือ **ไม่แสดงชิปพัสดุ** เพราะทั้งคู่ไม่มีคำใน `SHIPPING_STAGE_LABEL`
 * โดยตั้งใจ (ดูคอมเมนต์ที่ `ShippingStageKey` ใน src/lib/order-stage.ts)
 */
export function shippingChipFor(
  stage: ShippingStageKey,
  carrierStatus?: string | null,
): { cls: string; label: string } | null {
  if (stage === 'DELIVERY_FAILED') {
    // ใบที่ร้านปิดแล้ว (00085) — เทากับ STAGE_BADGE_OVERRIDE.DELIVERY_FAILED ใบเดียวกันทุกจอโทนเดียวกัน
    return { cls: 'bg-default-100 text-default-800', label: PARCEL_CLOSE_META.DELIVERY_FAILED.label }
  }
  if (stage === 'DONE' || stage === 'NOT_SHIPPING') return null
  /**
   * กอง PROBLEM ที่ค้างเหนียว (2026-09-14) — ชิปนี้ถูกวางไว้ **เหนือ `ShipmentStepper` ในการ์ด
   * ใบเดียวกัน ห่างกันไม่กี่สิบพิกเซล** และ stepper อ่าน `carrierStatus` สด ๆ ⇒ ถ้าไม่แยกคำ
   * ชิปแดง "พัสดุมีปัญหา" จะอยู่เหนือแถบฟ้า "อยู่ระหว่างจัดส่ง" ในการ์ดเดียวกัน
   *
   * ใช้คำสั้น (ไม่พ่วง "· ส่งใหม่") เพราะ stepper ข้างล่างบอกอยู่แล้วว่าขนส่งกำลังทำอะไร
   */
  if (stage === 'PROBLEM' && carrierStatus != null && !isProblemCarrierStatus(carrierStatus)) {
    return { cls: 'bg-warning/15 text-warning-ink', label: PROBLEM_RETRY_LABEL_SHORT }
  }
  return { cls: STAGE_CHIP_CLS[stage], label: SHIPPING_STAGE_LABEL[stage] }
}
