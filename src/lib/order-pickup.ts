/**
 * order-pickup — SSOT ของ "ออเดอร์นัดรับ" (feature 00062)
 *
 * ## ทำไมต้องมีไฟล์นี้
 *
 * `deriveShippingStage()` (`src/lib/order-stage.ts`) ตอบคำถาม "ของอยู่ไหนในเส้นทางขนส่ง"
 * ออเดอร์นัดรับ (`fulfillmentMode === 'PICKUP'`) ไม่มีพัสดุเลย จึงไม่มีคำตอบที่มีความหมาย
 * ในตระกูล `ShippingStageKey` — SDS §3.4 ตัดสินใจแยกฟังก์ชันใหม่แทนการยัดเข้าตระกูลเดิม
 * (UX-Design-Spec A5 ปฏิเสธการเพิ่ม `ShippingStageKey` ตัวที่ 8 ไปแล้ว)
 *
 * ทุกฟังก์ชันในไฟล์นี้เป็น **ฟังก์ชันบริสุทธิ์** — ห้าม import prisma/React
 * (`docs/conventions/ui-boolean-needs-a-testable-home.md`)
 */

import type { OrderStatusTone } from '@/lib/order-display'

/**
 * ระยะเวลา grace period ก่อนระบบปิดออเดอร์นัดรับอัตโนมัติ (ชั่วโมง)
 *
 * 🛑 SSOT ตัวเดียว — ห้าม hardcode `48` ที่อื่นทั้งระบบ (`order-pickup-auto-confirm.service.ts`,
 * บรรทัด grace period บนการ์ด A2 ต้องอ่านค่านี้ ไม่ใช่พิมพ์เลขซ้ำ)
 */
export const PICKUP_AUTOCONFIRM_HOURS = 48

const HOUR_MS = 60 * 60 * 1000

/** ออเดอร์นี้เป็นนัดรับไหม — ตัวเช็คกลางที่เดียว กัน string literal `'PICKUP'` กระจายไปทั่วโค้ด */
export function isPickupOrder(fulfillmentMode: string | null | undefined): boolean {
  return fulfillmentMode === 'PICKUP'
}

/** เวลาที่ระบบจะปิดออเดอร์อัตโนมัติ = เวลามอบของ + `PICKUP_AUTOCONFIRM_HOURS` ชั่วโมง */
export function computeAutoConfirmDeadline(handedOverAt: Date): Date {
  return new Date(handedOverAt.getTime() + PICKUP_AUTOCONFIRM_HOURS * HOUR_MS)
}

export type PickupStageKey =
  | 'AWAITING_HANDOVER' // ยังไม่กด "มอบสินค้าแล้ว"
  | 'AWAITING_BUYER_ACK' // มอบของแล้ว รอ grace period / ผู้ซื้อยืนยัน
  | 'DISPUTED' // มีข้อพิพาทค้างระหว่างรอ grace period
  | 'DONE' // CONFIRMED แล้ว (ไม่ว่าทางไหน) หรือ CANCELLED

export interface PickupStageInput {
  status: string
  handedOverAt: Date | string | null
  disputeOpenedAt: Date | string | null
  disputeResolvedAt: Date | string | null
}

/**
 * สถานะกองนัดรับ — SSOT เดียวของทั้ง badge การ์ด A2/A4 และคอลัมน์ย่อในตาราง `/orders` (A5, HR16)
 *
 * ลำดับการเช็คสำคัญ (ตาม UX-Design-Spec §"มีข้อพิพาทค้าง"):
 * 1. CONFIRMED/CANCELLED ชนะทุกกรณี (ปิดงานแล้วไม่สนข้อพิพาทเก่า)
 * 2. ข้อพิพาทที่ยังไม่ resolve ชนะ "มอบของแล้ว" — ห้ามโชว์ grace period ที่ระบบจะไม่ปิดจริง
 * 3. ที่เหลือแยกด้วยว่ามอบของหรือยัง
 */
export function derivePickupStage(o: PickupStageInput): PickupStageKey {
  if (o.status === 'CONFIRMED' || o.status === 'CANCELLED') return 'DONE'

  const hasOpenDispute = o.disputeOpenedAt != null && o.disputeResolvedAt == null
  if (hasOpenDispute) return 'DISPUTED'

  return o.handedOverAt != null ? 'AWAITING_BUYER_ACK' : 'AWAITING_HANDOVER'
}

/**
 * คำไทย + tone ของแต่ละสถานะ — badge การ์ด A2/A4 และคอลัมน์ย่อ A5 ต้องอ่านจากตารางนี้
 * เท่านั้น (คำต้องเหมือนกันทุกตัวอักษรทั้งสองจอ — HR16)
 *
 * 🛑 `รอผู้ซื้อยืนยัน` = tone `info` ไม่ใช่ `success` — งานยังไม่ปิดจริง (UX-Design-Spec A2
 * ย้ำห้ามเขียวก่อน CONFIRMED)
 */
export const PICKUP_STAGE_LABEL: Record<PickupStageKey, { label: string; tone: OrderStatusTone }> = {
  AWAITING_HANDOVER: { label: 'รอมอบของ', tone: 'warning' },
  AWAITING_BUYER_ACK: { label: 'รอผู้ซื้อยืนยัน', tone: 'info' },
  DISPUTED: { label: 'มีข้อทักท้วง', tone: 'warning' },
  DONE: { label: 'เสร็จสิ้น', tone: 'success' },
}
