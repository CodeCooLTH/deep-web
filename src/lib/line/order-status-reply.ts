/**
 * order-status-reply — เลือกออเดอร์และประกอบข้อความตอบสถานะพัสดุ (feature 00045 FR-RM-09, pure)
 *
 * 🛑 สถานะต้องมาจาก `deriveShippingStage()` + `SHIPPING_STAGE_LABEL` ของ `lib/order-stage.ts`
 * ตัวเดียวกับหน้า `/orders` — ห้ามเขียนคำสถานะใหม่ที่นี่ ไม่งั้นลูกค้ากับผู้ขายจะเห็นคนละคำ
 * สำหรับออเดอร์ใบเดียวกัน โดยไม่มี tsc/เทสตัวไหนฟ้อง เพราะทั้งสองคำ "ถูก" ในตัวเอง (HR16)
 */

import { deriveShippingStage, SHIPPING_STAGE_LABEL, type ShippingStageInput } from '@/lib/order-stage'

export type OrderStatusCandidate = ShippingStageInput & {
  /** เลขออเดอร์ที่ผู้ใช้อ่านได้ — ต้องบอกในข้อความเสมอ ลูกค้าที่มีหลายใบจะได้ตรวจเองได้ */
  orderNo: string
  /** ใหม่→เก่า ผู้เรียกต้องเรียงมาให้แล้ว */
}

/**
 * เลือกออเดอร์ที่จะตอบ = **ใบล่าสุดที่ยังไม่จบเส้นทาง**
 *
 * "ยังไม่จบ" ตัดสินด้วย `deriveShippingStage() !== 'DONE'` ไม่ใช่ `Order.status` ดิบ — เพราะใบ COD
 * ที่ของถึงแล้วแต่ร้านยังไม่กดรับเงิน ยังเป็นงานค้างอยู่ (บทเรียน DP2569085F97153B) และนั่นคือ
 * ใบที่ลูกค้าน่าจะกำลังถามถึงที่สุด
 *
 * @param newestFirst ออเดอร์ของลูกค้ารายนั้นในร้านนั้น เรียงใหม่→เก่า
 */
export function pickOrderForStatusReply<T extends OrderStatusCandidate>(newestFirst: T[]): T | null {
  for (const o of newestFirst) {
    if (deriveShippingStage(o) !== 'DONE') return o
  }
  return null
}

/**
 * ข้อความที่ตอบลูกค้าเมื่อพบออเดอร์
 *
 * 🛑 ต้องมี **เลขออเดอร์** เสมอ — ลูกค้าที่สั่งหลายใบต้องตรวจได้เองว่าระบบตอบถึงใบไหน ไม่งั้น
 * "กำลังจัดส่ง" ลอย ๆ จะทำให้เข้าใจผิดว่าเป็นใบที่เพิ่งสั่ง (FR-RM-09 AC)
 */
export function buildOrderStatusText(order: OrderStatusCandidate): string {
  const stage = deriveShippingStage(order)
  if (stage === 'DONE') {
    // ไม่ควรถูกเรียกด้วยใบที่จบแล้ว (pickOrder กรองออกไปแล้ว) — กันไว้ไม่ให้คืนข้อความว่าง
    return `คำสั่งซื้อ ${order.orderNo}: จัดส่งเรียบร้อยแล้ว`
  }
  return `คำสั่งซื้อ ${order.orderNo}: ${SHIPPING_STAGE_LABEL[stage]}`
}

/**
 * ข้อความเมื่อไม่พบออเดอร์ที่ยังไม่จบ
 *
 * 🛑 ห้ามตอบ "ไม่พบข้อมูล" เฉย ๆ (FR-RM-09 AC) — ต้องบอกทางออกที่ลูกค้าทำต่อได้จริง
 * เคสนี้จะเจอบ่อยกว่าที่คิดในช่วงแรก เพราะลูกค้า LINE จำนวนมากยังไม่ถูกผูกกับ `Customer`
 * (ผูกได้ต่อเมื่อรู้เบอร์) ⇒ ระบบมองไม่เห็นออเดอร์ของเขาแม้จะมีอยู่จริง
 */
export const NO_ORDER_REPLY_TEXT =
  'ยังไม่พบคำสั่งซื้อที่กำลังจัดส่งของคุณในระบบ — พิมพ์เลขคำสั่งซื้อหรือรอสักครู่ ทางร้านจะตรวจสอบให้ครับ/ค่ะ'
