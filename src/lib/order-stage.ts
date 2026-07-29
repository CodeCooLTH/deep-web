/**
 * order-stage — ป้าย "ขั้นตอนล่าสุดของออเดอร์" ที่โชว์ในแถวรายการแชท (user request 2026-07-29)
 *
 * แทนชิปเดิม (ไอคอนตะกร้า + จำนวนออเดอร์) ที่บอกแค่ "ลูกค้าคนนี้เคยซื้อกี่ครั้ง" — ไม่ได้บอกสิ่งที่
 * แอดมินต้องรู้ตอนกำลังคุยอยู่ว่า "ตอนนี้ของถึงไหนแล้ว" user เลือกให้ทิ้งตัวเลขจำนวนไป เหลือแค่ป้ายสถานะ
 *
 * pure module — ห้าม import prisma/server-only ที่นี่ (ใช้ทั้งฝั่ง server enrich และ client render)
 *
 * กติกาการหมดอายุ (เลือกโดย user):
 *   - จัดส่งสำเร็จ → แสดง 3 วันแล้วหายไปเลย (ไม่กลับไปเป็นชิปอย่างอื่น) เพราะงานจบแล้ว
 *     ป้ายค้างอยู่มีแต่ทำให้รายการรก
 *   - ยกเลิกแล้ว → ค้าง 1 วัน "หรือจนกว่าจะมีออเดอร์ใหม่" เพื่อเตือนแอดมินว่าลูกค้าคนนี้เพิ่งยกเลิก
 *     ("จนกว่าจะมีออเดอร์ใหม่" ได้มาฟรีจากการที่เราหยิบ *ออเดอร์ล่าสุด* เสมอ — ออเดอร์ใหม่กว่า
 *     เข้ามาก็แทนที่ใบที่ยกเลิกไปเอง ไม่ต้องมีเงื่อนไขพิเศษ)
 */

export type OrderStageKey =
  | 'ORDERED'
  | 'PARCEL_CREATED'
  | 'LABEL_PRINTED'
  | 'SHIPPING'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'

/** cls ใช้ pattern เดียวกับ ORDER_STATUS_META (bg-{semantic}/15 text-{semantic}) — Paces token ล้วน */
export const ORDER_STAGE_META: Record<OrderStageKey, { label: string; cls: string; icon: string }> = {
  ORDERED: { label: 'สั่งซื้อแล้ว', cls: 'bg-primary/15 text-primary', icon: 'shopping-cart' },
  PARCEL_CREATED: { label: 'สร้างพัสดุแล้ว', cls: 'bg-primary/15 text-primary', icon: 'package' },
  LABEL_PRINTED: { label: 'พิมพ์เอกสารแล้ว', cls: 'bg-warning/15 text-warning', icon: 'printer' },
  SHIPPING: { label: 'กำลังจัดส่ง', cls: 'bg-info/15 text-info', icon: 'truck-delivery' },
  DELIVERED: { label: 'จัดส่งสำเร็จ', cls: 'bg-success/15 text-success', icon: 'circle-check-filled' },
  // COMPLETED = ปิดการขายแล้วโดยไม่มีการส่งของ (ขายหน้าร้าน/สินค้าดิจิทัล/บริการ) — ห้ามใช้คำว่า
  // "จัดส่งสำเร็จ" ตรงนี้ เพราะไม่มีอะไรถูกส่งเลย
  COMPLETED: { label: 'สำเร็จ', cls: 'bg-success/15 text-success', icon: 'circle-check-filled' },
  CANCELLED: { label: 'ยกเลิกแล้ว', cls: 'bg-danger/15 text-danger', icon: 'circle-x' },
}

const DAY_MS = 24 * 60 * 60 * 1000
export const DELIVERED_VISIBLE_MS = 3 * DAY_MS
export const CANCELLED_VISIBLE_MS = 1 * DAY_MS

/** carrierStatus ที่ถือว่า "ของอยู่ระหว่างทาง" — ชุดเดียวกับ isInTransit ใน src/lib/iship/status.ts */
const IN_TRANSIT = ['picked_up', 'with_branch', 'in_transit', 'progress']

export interface OrderStageInput {
  status: string
  /** เวลาที่สถานะล่าสุดเกิดขึ้น — ใช้ตัดสินว่าป้ายหมดอายุหรือยัง */
  statusAt: Date | string
  /** OrderShipment.labelPrintedAt ของพัสดุใบที่ยัง active (null = ยังไม่พิมพ์/ไม่มีพัสดุ) */
  labelPrintedAt: Date | string | null
  /** OrderShipment.carrierStatus ของพัสดุใบที่ยัง active */
  carrierStatus: string | null
  /** OrderShipment.labelPrintCount — จำนวนครั้งที่กดพิมพ์ใบปะหน้าใบนี้ */
  labelPrintCount?: number | null
  /** มีพัสดุที่ยัง active อยู่หรือไม่ — ตัวตัดสินว่าจะอ่านสถานะจาก "พัสดุ" หรือจาก "ออเดอร์" */
  hasShipment?: boolean
}

export interface OrderStageResult {
  key: OrderStageKey
  label: string
  cls: string
  icon: string
  /**
   * ป้ายเสริม "พิมพ์ N ครั้ง" (user request 2026-07-29) — มีเฉพาะขั้น "พิมพ์เอกสารแล้ว"
   * ประโยชน์คือเห็นใบที่ถูกพิมพ์ซ้ำหลายรอบ (พิมพ์พลาด/กระดาษติด/ทำหาย) ซึ่งเป็นสัญญาณว่ามีอะไรผิดปกติ
   * ที่หน้างาน — ขั้นอื่นไม่ต้องมี เพราะจำนวนการพิมพ์ไม่ใช่ข้อมูลที่ต้องรู้ตอนของออกไปแล้ว
   */
  printCount?: number
}

/**
 * deriveOrderStage — แปลงออเดอร์ล่าสุด 1 ใบเป็นป้าย (null = ไม่ต้องแสดงชิป)
 *
 * กติกาแกนกลาง (แก้ 2026-07-29 หลัง user เจอบั๊ก): **ถ้ามีพัสดุ ให้พัสดุเป็นตัวกำหนดสถานะการส่ง
 * ห้ามให้ Order.status มาทับ**
 *
 * ทำไม: `Order.status='CONFIRMED'` ในระบบนี้แปลว่า "ปิดการขายแล้ว" ไม่ได้แปลว่า "ของถึงมือลูกค้า" —
 * ร้านขายหน้าร้าน/เก็บเงินเสร็จก็กดปิดงานได้ทันทีตั้งแต่ขนส่งยังไม่มารับพัสดุด้วยซ้ำ. โค้ดเดิมแมป
 * CONFIRMED → "จัดส่งสำเร็จ" ตรง ๆ ทำให้ออเดอร์ที่เพิ่งสร้างขึ้นป้าย "จัดส่งสำเร็จ" ทันที
 * (ยืนยันกับข้อมูลจริง 2026-07-29: 2 เธรดขึ้น "จัดส่งสำเร็จ" ทั้งที่ carrierStatus ยังเป็น null
 * = ขนส่งยังไม่แตะพัสดุเลย) ซึ่งตรงกับ BR-ISHIP-40/41 ที่ระบุว่าสถานะขนส่งเป็นคนละชุดกับ Order.status
 *
 * ลำดับ: ยกเลิก → [มีพัสดุ: ส่งถึง → กำลังส่ง → พิมพ์แล้ว → สร้างพัสดุแล้ว]
 *                → [ไม่มีพัสดุ: กำลังส่ง → ปิดการขาย → สั่งซื้อแล้ว]
 *
 * ในสายพัสดุยังต้องตรวจสถานะปลายทางก่อน labelPrintedAt เสมอ เพราะ labelPrintedAt ไม่เคยถูกล้าง —
 * ถ้าเช็คการพิมพ์ก่อน ของที่ส่งถึงแล้วจะค้างป้าย "พิมพ์เอกสารแล้ว" ตลอดไป
 */
export function deriveOrderStage(
  order: OrderStageInput | null,
  now: number = Date.now(),
): OrderStageResult | null {
  if (!order) return null

  const statusAt = new Date(order.statusAt).getTime()
  const age = now - statusAt
  // มีพัสดุจริงเมื่อ hasShipment บอกมา หรืออนุมานจากร่องรอยของพัสดุ (รองรับ caller เก่าที่ยังไม่ส่ง flag)
  const hasShipment = order.hasShipment ?? (order.labelPrintedAt != null || order.carrierStatus != null)

  let key: OrderStageKey
  if (order.status === 'CANCELLED') {
    if (age > CANCELLED_VISIBLE_MS) return null
    key = 'CANCELLED'
  } else if (hasShipment) {
    // สายพัสดุ — ขนส่งคือคนเดียวที่รู้จริงว่าของอยู่ไหน
    if (order.carrierStatus === 'delivered') {
      if (age > DELIVERED_VISIBLE_MS) return null
      key = 'DELIVERED'
    } else if (
      (order.carrierStatus && IN_TRANSIT.includes(order.carrierStatus)) ||
      // SHIPPED ต่างจาก CONFIRMED: มันคือคำยืนยันของร้านว่า "ของออกไปแล้ว" ซึ่งพูดถึงตัวพัสดุตรง ๆ
      // ไม่ใช่การปิดการขาย จึงเชื่อได้และต้องชนะ labelPrintedAt (ขนส่งมักอัปเดตช้ากว่าความจริง)
      order.status === 'SHIPPED'
    ) {
      key = 'SHIPPING'
    } else if (order.labelPrintedAt) {
      key = 'LABEL_PRINTED'
    } else {
      key = 'PARCEL_CREATED'
    }
  } else if (order.status === 'SHIPPED') {
    // ร้านกดแจ้งจัดส่งเองโดยไม่ได้เปิดพัสดุผ่านระบบขนส่ง
    key = 'SHIPPING'
  } else if (order.status === 'CONFIRMED') {
    if (age > DELIVERED_VISIBLE_MS) return null
    key = 'COMPLETED'
  } else {
    key = 'ORDERED'
  }

  // นับจากข้อมูลจริงเท่านั้น — พัสดุที่มี labelPrintedAt แต่ labelPrintCount ยังเป็น 0/null
  // (แถวเก่าก่อนมีคอลัมน์นับ) ถือว่า "ไม่รู้จำนวน" → ไม่แสดงป้าย ดีกว่าเดาว่า 1
  const printCount = key === 'LABEL_PRINTED' ? order.labelPrintCount ?? 0 : 0

  return {
    key,
    ...ORDER_STAGE_META[key],
    ...(printCount > 0 ? { printCount } : {}),
  }
}
