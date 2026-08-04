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

import { isInTransitCarrierStatus, isProblemCarrierStatus } from './iship/status'
// นิยาม "เก็บเงินปลายทาง" ตัวเดียวกับที่หน้าออเดอร์/ป้ายชำระเงินใช้ — ห้ามเขียน regex ซ้ำที่นี่
// ไม่งั้นไทล์กับป้ายบนจอเดียวกันจะตัดสินคนละแบบเมื่อร้านพิมพ์วิธีชำระเป็นข้อความอิสระ
import { isCODPayment as isCodPayment } from './order-display'

export type OrderStageKey =
  | 'PARCEL_PROBLEM'
  | 'ORDERED'
  | 'PARCEL_CREATED'
  | 'LABEL_PRINTED'
  | 'SHIPPING'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'

/**
 * cls ใช้ pattern เดียวกับ ORDER_STATUS_META (`bg-{semantic}/15 text-{semantic}-ink`) — Paces token ล้วน
 *
 * เดิมใช้ `text-{semantic}` ตรงตัว ซึ่งตกคอนทราสต์ AA 4.5:1 ทุกช่อง เพราะสี semantic ของ Paces
 * ถูกเลือกมาให้เป็น *พื้น* ไม่ใช่ *หมึก* (วัดบนพื้นชิปจริง = {semantic}/15 บนการ์ดขาว):
 *   warning 1.54:1 · info 1.84:1 · success 2.11:1 · danger 2.68:1 · primary 4.17:1
 * เปลี่ยนมาใช้ token "หมึก" (`--color-{semantic}-ink`, src/assets/css/config/_root.css) ผ่านทุกช่อง:
 *   warning 6.56:1 · info 7.88:1 · success 6.68:1 · danger 8.47:1 · primary 8.44:1
 * ตัวเลขทั้งสองชุดวัดจากจอจริง (computed color + พื้นหลังที่ composite แล้ว บนแถวรายการแชท
 * seller.deepth.local/inbox) ไม่ใช่คำนวณบนกระดาษ — ดู docs/qa/2026-07-31-ink-token-contrast.md
 * token มี override ฝั่ง [data-theme="dark"] แล้ว (วัดแล้วเช่นกัน ต่ำสุด 7.19:1) จึงไม่พังตอนเปิด dark mode
 */
export const ORDER_STAGE_META: Record<OrderStageKey, { label: string; cls: string; icon: string }> = {
  // พัสดุไม่ได้เดินหน้าตามปกติและมีคนต้องลงมือทำอะไร — ขั้นเดียวที่ "แย่งความสนใจ" ได้
  // ป้ายบอกแค่ว่ามีปัญหา ไม่แยกคำต่อสถานะ เพราะ rail แชทแคบและร้านต้องเปิดดูรายละเอียดอยู่ดี
  PARCEL_PROBLEM: { label: 'พัสดุมีปัญหา', cls: 'bg-danger/15 text-danger', icon: 'alert-triangle' },
  ORDERED: { label: 'สั่งซื้อแล้ว', cls: 'bg-primary/15 text-primary-ink', icon: 'shopping-cart' },
  PARCEL_CREATED: { label: 'สร้างพัสดุแล้ว', cls: 'bg-primary/15 text-primary-ink', icon: 'package' },
  LABEL_PRINTED: { label: 'พิมพ์เอกสารแล้ว', cls: 'bg-warning/15 text-warning-ink', icon: 'printer' },
  SHIPPING: { label: 'กำลังจัดส่ง', cls: 'bg-info/15 text-info-ink', icon: 'truck-delivery' },
  DELIVERED: { label: 'จัดส่งสำเร็จ', cls: 'bg-success/15 text-success-ink', icon: 'circle-check-filled' },
  // COMPLETED = ปิดการขายแล้วโดยไม่มีการส่งของ (ขายหน้าร้าน/สินค้าดิจิทัล/บริการ) — ห้ามใช้คำว่า
  // "จัดส่งสำเร็จ" ตรงนี้ เพราะไม่มีอะไรถูกส่งเลย
  COMPLETED: { label: 'สำเร็จ', cls: 'bg-success/15 text-success-ink', icon: 'circle-check-filled' },
  CANCELLED: { label: 'ยกเลิกแล้ว', cls: 'bg-danger/15 text-danger-ink', icon: 'circle-x' },
}

const DAY_MS = 24 * 60 * 60 * 1000
export const DELIVERED_VISIBLE_MS = 3 * DAY_MS
export const CANCELLED_VISIBLE_MS = 1 * DAY_MS

/**
 * สถานะที่ร้านต้องรู้ทันที — นิยามเดียวกับ PROBLEM_CARRIER_STATUSES ใน lib/iship/status.ts
 *
 * import มาใช้แทนการเขียนซ้ำ เพราะถ้าสองที่นิยาม "มีปัญหา" ไม่ตรงกัน ตัวกรองจะกรองแล้วได้ผล
 * ไม่ตรงกับป้ายที่เห็น ซึ่งเป็นบั๊กที่หาสาเหตุยากมาก
 */

/**
 * ─── สถานะ "ของอยู่ไหน" สำหรับ Command Center + ตัวกรองหน้า /orders (user สั่ง 2026-08-04) ───
 *
 * แยกจาก OrderStageKey (ป้ายในรายการแชท) เพราะคนละคำถาม: ป้ายตอบว่า "ออเดอร์ใบนี้ถึงขั้นไหน"
 * ส่วนชุดนี้ตอบว่า "ใบนี้อยู่ในกองงานไหนของวันนี้" — LABEL_PRINTED/PARCEL_CREATED เป็นกองเดียวกัน
 * (รอขนส่งมารับ) และของที่จบแล้วถูกยุบเป็น DONE ก้อนเดียวเพราะไม่ต้องทำอะไรต่อ
 *
 * [สำคัญ] ฟังก์ชันนี้ต้องเป็นตัวเดียวที่ทั้ง "ตัวนับบนไทล์" และ "ตัวกรองในหน้ารายการ" เรียกใช้
 * ถ้าแยกกันเขียน (เช่นนับด้วย SQL แล้วกรองด้วย TS) วันหนึ่งจะกดไทล์ที่บอก 5 แล้วเข้าไปเจอ 4 ใบ
 * โดยไม่มีอะไรเตือน — บั๊กแบบนั้นหาสาเหตุยากมากและทำให้ทั้งหน้าจอเชื่อไม่ได้
 */
export type ShippingStageKey =
  | 'AWAITING_PARCEL'
  | 'AWAITING_PICKUP'
  | 'SHIPPING'
  /**
   * ของถึงปลายทางแล้ว แต่เป็นออเดอร์เก็บเงินปลายทางที่ร้านยังไม่ได้กดว่าได้เงิน
   *
   * เพิ่ม 2026-08-04 หลัง user เจอออเดอร์หายจากทุกไทล์ทันทีที่ผูกพัสดุ iShip ที่ส่งถึงไปแล้ว
   * (DP2569085F97153B, COD) — พัสดุจบเส้นทางแล้วจริง แต่ "งานของร้าน" ยังไม่จบเพราะเงินยังไม่เข้า
   */
  | 'AWAITING_COD'
  | 'PROBLEM'
  /** จบแล้ว/ไม่ใช่งานค้าง — ไม่นับบนไทล์ และไม่ขึ้นในตัวกรอง */
  | 'DONE'

export interface ShippingStageInput {
  status: string
  /** carrierStatus ของพัสดุใบล่าสุดที่ยัง active (status='CREATED', ไม่ใช่ dry-run) */
  carrierStatus: string | null
  /** มีพัสดุ active อยู่ไหม — null carrierStatus ยังแปลว่า "มีพัสดุแต่ขนส่งยังไม่อัปเดต" ได้ */
  hasShipment: boolean
  /** วิธีชำระเงินของออเดอร์ — ตัดสินว่าของที่ส่งถึงแล้วยังมีเรื่องเงินค้างอยู่ไหม */
  paymentMethod?: string | null
  /** ร้านกดยืนยันรับเงินปลายทางแล้วหรือยัง (Order.codReceivedAt) — null = ยังไม่ได้รับ */
  codReceivedAt?: Date | string | null
}

/** carrierStatus ที่แปลว่าจบเส้นทางแล้ว ไม่ต้องตามต่อ */
const TERMINAL_CARRIER = ['delivered', 'return_success', 'is_expired', 'cancelled']

export function deriveShippingStage(o: ShippingStageInput): ShippingStageKey {
  // ยกเลิกทั้งใบ = ไม่ใช่งานค้าง ไม่ว่าพัสดุจะอยู่สถานะไหน
  if (o.status === 'CANCELLED') return 'DONE'

  if (o.hasShipment) {
    // ลำดับเดียวกับ deriveOrderStage: ปัญหามาก่อน แล้วค่อยดูปลายทาง/ระหว่างทาง
    if (isProblemCarrierStatus(o.carrierStatus)) return 'PROBLEM'
    if (o.carrierStatus && TERMINAL_CARRIER.includes(o.carrierStatus)) {
      // [สำคัญ] พัสดุจบเส้นทางแล้ว ≠ งานของร้านจบแล้ว — เดิมคืน 'DONE' ตรงนี้เลย ทำให้ออเดอร์
      // ที่ขนส่งส่งถึงแล้วแต่ร้านยังไม่ได้เงินปลายทาง หายไปจากทุกไทล์ทันที (DP2569085F97153B)
      //
      // ของตีกลับถึงร้าน = ร้านต้องตัดสินใจคืนเงิน/ส่งใหม่ → ไปรวมกับ "พัสดุมีปัญหา"
      // ซึ่ง 'return' (กำลังตีกลับ) อยู่ก่อนแล้ว จึงเป็นกองเดียวกันทั้งเส้น ไม่ใช่กองใหม่
      if (o.carrierStatus === 'return_success') return 'PROBLEM'
      // เก็บเงินปลายทางที่ร้านยังไม่กดว่าได้เงิน = ยังมีงานค้างจริง (ตามเงิน) แม้ของถึงแล้ว
      if (isCodPayment(o.paymentMethod) && !o.codReceivedAt) return 'AWAITING_COD'
      // ที่เหลือ (โอนล่วงหน้า/ได้เงินแล้ว) ของถึงแล้ว + เงินอยู่ในมือ = ไม่มีงานเหลือให้ร้านทำ
      return 'DONE'
    }
    // SHIPPED = ร้านยืนยันเองว่าของออกไปแล้ว เชื่อได้และชนะการที่ขนส่งยังไม่อัปเดต
    if (isInTransitCarrierStatus(o.carrierStatus) || o.status === 'SHIPPED') return 'SHIPPING'
    return 'AWAITING_PICKUP'
  }

  // ไม่มีพัสดุ — ร้านแจ้งส่งเองก็ถือว่ากำลังส่ง, ปิดการขายแล้วก็จบ, ที่เหลือคือยังไม่ได้เปิดพัสดุ
  if (o.status === 'SHIPPED') return 'SHIPPING'
  if (o.status === 'CONFIRMED') return 'DONE'
  return 'AWAITING_PARCEL'
}

/** ป้ายไทยของแต่ละกอง — ใช้ทั้งไทล์บน Command Center และชิปตัวกรองในหน้า /orders */
export const SHIPPING_STAGE_LABEL: Record<Exclude<ShippingStageKey, 'DONE'>, string> = {
  AWAITING_PARCEL: 'รอเลขพัสดุ',
  AWAITING_PICKUP: 'รอรับเข้า',
  SHIPPING: 'กำลังจัดส่ง',
  AWAITING_COD: 'รอเงิน COD',
  PROBLEM: 'พัสดุมีปัญหา',
}

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
    //
    // ปัญหามาก่อนทุกอย่างและไม่มีวันหมดอายุ: ก่อนหน้านี้ issue/return/cannot_pickup/
    // is_expired/cod_refund ตกลงไปเป็น "สร้างพัสดุแล้ว" ทั้งหมด — เคสที่ต้องเห็นด่วนที่สุด
    // กลับกลืนหายไปกับพัสดุปกติ (user report 2026-07-31)
    if (isProblemCarrierStatus(order.carrierStatus)) {
      key = 'PARCEL_PROBLEM'
    } else if (order.carrierStatus === 'delivered') {
      if (age > DELIVERED_VISIBLE_MS) return null
      key = 'DELIVERED'
    } else if (
      isInTransitCarrierStatus(order.carrierStatus) ||
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
