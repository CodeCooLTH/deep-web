/**
 * chat-order-progress — adapter ของ deriveShippingStage สำหรับแถบสถานะออเดอร์ในห้องแชท
 * (งาน Order Progress 2026-08-05)
 *
 * pure module (ใช้ทั้ง server enrich และ client render) — ตัวตัดสิน "ใบไหนยังเป็นงานค้าง"
 * คือ deriveShippingStage ตัวเดียวกับไทล์ Command Center และตัวกรอง /orders?stage= เสมอ
 * ห้ามเขียนเงื่อนไขซ้ำที่นี่ ไม่งั้นแถบในแชทกับไทล์หน้าแรกจะตอบไม่ตรงกัน
 */

import { deriveShippingStage, type ShippingStageKey } from './order-stage'

export interface ProgressOrderInput {
  status: string
  paymentMethod?: string | null
  codReceivedAt?: string | null
  /** พัสดุใบล่าสุดที่ไม่ถูกยกเลิก (null = ยังไม่เปิดพัสดุ) */
  shipment: { status: string; carrierStatus: string | null } | null
}

/** แปลง shape ของการ์ดในแชท → input ของ deriveShippingStage */
export function orderShippingStage(o: ProgressOrderInput): ShippingStageKey {
  // FAILED = การสร้างพัสดุล้มเหลว ยังไม่มีพัสดุจริงบนขนส่ง — เทียบเท่า "ยังไม่เปิดพัสดุ"
  const hasShipment = !!o.shipment && o.shipment.status !== 'FAILED'
  return deriveShippingStage({
    status: o.status,
    carrierStatus: hasShipment ? o.shipment!.carrierStatus : null,
    hasShipment,
    paymentMethod: o.paymentMethod,
    codReceivedAt: o.codReceivedAt,
  })
}

/** เฉพาะใบที่ยังเป็นงานค้าง (stage !== DONE) — ลำดับคงเดิมตามที่ caller เรียงมา (ล่าสุดก่อน) */
export function filterActiveOrders<T extends ProgressOrderInput>(orders: T[]): T[] {
  return orders.filter((o) => orderShippingStage(o) !== 'DONE')
}

/**
 * ชิปของแต่ละกอง — pattern เดียวกับ ORDER_STAGE_META (`bg-{tone}/15 text-{tone}-ink`)
 * เขียนเต็มคำทุกตัว (Tailwind สแกน static) · โทนล้อความหมายเดียวกับป้ายในรายการแชท:
 * ปัญหา = danger, กำลังเดินทาง = info, รอเงิน = warning, ที่เหลือ = primary (งานปกติ)
 */
export const STAGE_CHIP_CLS: Record<Exclude<ShippingStageKey, 'DONE'>, string> = {
  AWAITING_PARCEL: 'bg-primary/15 text-primary-ink',
  AWAITING_PICKUP: 'bg-primary/15 text-primary-ink',
  SHIPPING: 'bg-info/15 text-info-ink',
  AWAITING_COD: 'bg-warning/15 text-warning-ink',
  PROBLEM: 'bg-danger/15 text-danger-ink',
}
