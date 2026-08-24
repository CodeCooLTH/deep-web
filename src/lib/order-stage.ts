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

import { APPOINTMENT_STAGE_META, deriveAppointmentStage } from './appointment-stage'
import { APPOINTMENT_STATUS } from './appointments'
import { formatDayMonthShortYearTH } from './format-date'
import {
  isDeliveredCarrierStatus,
  isInTransitCarrierStatus,
  isProblemCarrierStatus,
  isReturnedCarrierStatus,
  isTerminalCarrierStatus,
} from './iship/status'
// นิยาม "เก็บเงินปลายทาง" ตัวเดียวกับที่หน้าออเดอร์/ป้ายชำระเงินใช้ — ห้ามเขียน regex ซ้ำที่นี่
// ไม่งั้นไทล์กับป้ายบนจอเดียวกันจะตัดสินคนละแบบเมื่อร้านพิมพ์วิธีชำระเป็นข้อความอิสระ
import { ORDER_STATUS_META, isCODPayment as isCodPayment, type OrderStatusTone } from './order-display'
// คลังคำตามประเภทกิจการ — SSOT เดียวของคำเหล่านี้ (HR16) ห้ามพิมพ์คำของ vertical ไว้ในไฟล์นี้เอง
import { resolveOrderVocab } from './seller-menu'

export type OrderStageKey =
  | 'PARCEL_PROBLEM'
  | 'ORDERED'
  | 'PARCEL_CREATED'
  | 'LABEL_PRINTED'
  | 'SHIPPING'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  /** feature 00056 — ลูกค้ารับของแล้วส่งคืน (คนละเรื่องกับ CANCELLED ที่แปลว่าไม่เคยส่ง) */
  | 'RETURNED'

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
  // 🛑 text-danger-ink ไม่ใช่ text-danger — ค่าที่วัดไว้เองข้างบนบอกว่า text-danger บนพื้น /15
  // ได้ 2.68:1 (ตก AA) ส่วน -ink ได้ 8.47:1 · นี่เป็นค่าเดียวใน 8 ค่าของตารางนี้ที่หลุด pattern
  // (อีก 7 ค่าใช้ -ink ครบ) — impeccable critique 2026-08-09 จับได้ ไม่มี gate อัตโนมัติตัวไหนเห็น
  PARCEL_PROBLEM: { label: 'พัสดุมีปัญหา', cls: 'bg-danger/15 text-danger-ink', icon: 'alert-triangle' },
  ORDERED: { label: 'สั่งซื้อแล้ว', cls: 'bg-primary/15 text-primary-ink', icon: 'shopping-cart' },
  PARCEL_CREATED: { label: 'สร้างพัสดุแล้ว', cls: 'bg-primary/15 text-primary-ink', icon: 'package' },
  LABEL_PRINTED: { label: 'พิมพ์เอกสารแล้ว', cls: 'bg-warning/15 text-warning-ink', icon: 'printer' },
  SHIPPING: { label: 'กำลังจัดส่ง', cls: 'bg-info/15 text-info-ink', icon: 'truck-delivery' },
  DELIVERED: { label: 'จัดส่งสำเร็จ', cls: 'bg-success/15 text-success-ink', icon: 'circle-check-filled' },
  // COMPLETED = ปิดการขายแล้วโดยไม่มีการส่งของ (ขายหน้าร้าน/สินค้าดิจิทัล/บริการ) — ห้ามใช้คำว่า
  // "จัดส่งสำเร็จ" ตรงนี้ เพราะไม่มีอะไรถูกส่งเลย
  COMPLETED: { label: 'สำเร็จ', cls: 'bg-success/15 text-success-ink', icon: 'circle-check-filled' },
  CANCELLED: { label: 'ยกเลิกแล้ว', cls: 'bg-danger/15 text-danger-ink', icon: 'circle-x' },
  // warning ไม่ใช่ danger — ของกลับมาถึงร้านเรียบร้อยแล้ว ไม่ใช่เหตุที่ต้องรีบทำอะไร
  RETURNED: { label: 'คืนของแล้ว', cls: 'bg-warning/15 text-warning-ink', icon: 'arrow-back-up' },
}

const DAY_MS = 24 * 60 * 60 * 1000
export const DELIVERED_VISIBLE_MS = 3 * DAY_MS
export const CANCELLED_VISIBLE_MS = 1 * DAY_MS

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
  /**
   * พัสดุเดินทางกลับมาหาร้าน (`return` = กำลังกลับ · `return_success` = ถึงร้านแล้ว)
   *
   * แยกออกจาก `PROBLEM` เมื่อ 2026-08-24 (user เจอบน prod): ใบที่ iShip บอก "ส่งคืนสำเร็จ"
   * ไปแล้วยังค้างอยู่ในกอง "พัสดุมีปัญหา" ซึ่งบอกร้านผิดว่า *ยังไม่รู้ว่าเกิดอะไรขึ้น ต้องไป
   * ตามขนส่ง* ทั้งที่ความจริงคือเรื่องกับขนส่งจบแล้ว เหลือแต่การตัดสินใจของร้านเอง
   * (คืนเงิน / ส่งใหม่ / ปิดงาน) — คนละงาน คนละความเร่งด่วน จึงต้องเป็นคนละกอง
   *
   * ยังเป็น "งานค้าง" อยู่ (ไม่ใช่ DONE) เพราะของอยู่ในมือร้านโดยที่ลูกค้ายังไม่ได้ของและ
   * อาจยังไม่ได้เงินคืน — ตรงกับที่หน้า order detail ชวนให้ปิดงาน (shouldPromptCloseReturnedOrder)
   */
  | 'RETURNED'
  /** จบแล้ว/ไม่ใช่งานค้าง — ไม่นับบนไทล์ และไม่ขึ้นในตัวกรอง */
  | 'DONE'

/**
 * จุดที่ไฮไลต์บนแถบพัสดุ 4 จุด (`SHIPMENT_STAGES`) ต่อ stage หนึ่งค่า
 *
 * `null` = ยังไม่มีพัสดุให้วาดแถบ · `4` = เลยจุดสุดท้ายไปแล้ว ⇒ ทุกจุดเขียวและไม่มีจุดไหน
 * เป็น "ปัจจุบัน" (แถบมี 4 จุด index 0–3 เท่านั้น ค่า 4 จึงแปลว่าจบเส้นทาง ไม่ใช่ index ที่ 5)
 * `PROBLEM` ปักที่จุดรถ (2) แล้วให้ผู้เรียกเปลี่ยนสีเอง — ไม่มีจุดแยกของ "มีปัญหา" ในแถบนี้
 *
 * 🛑 ตารางนี้เคยอยู่ใน `MiniShipmentTimeline.tsx` ฝั่งร้านที่เดียว แล้วฝั่งผู้ซื้อ
 * (`ParcelTimeline.tsx`) เขียนตรรกะของตัวเองขึ้นมาใหม่โดยไล่หา key คนละชุด
 * (`PARCEL_CREATED`/`LABEL_PRINTED`/`DELIVERED` ซึ่งเป็นค่าของ `OrderStageKey` ไม่ใช่ของนี่)
 * ⇒ ตัดกันแค่ `SHIPPING` ค่าเดียว: พัสดุที่ส่งถึงแล้วโชว์ "สร้างพัสดุ" และแถบเตือน
 * "พัสดุมีปัญหา" ไม่เคยขึ้นเลยสักครั้ง — `tsc` มองไม่เห็นเพราะ prop ตรงนั้นประกาศเป็น `string`
 * ทั้งสองจอต้องอ่านจากตารางนี้เท่านั้น และ prop ต้องพิมพ์เป็น `ShippingStageKey`
 */
export const SHIPMENT_STAGE_DOT_INDEX: Record<ShippingStageKey, number | null> = {
  AWAITING_PARCEL: null,
  AWAITING_PICKUP: 0,
  SHIPPING: 2,
  PROBLEM: 2,
  // ของเดินทาง "ย้อนกลับ" ไม่ใช่เดินหน้า — แถบ 4 จุดไม่มีจุดของทิศนี้ ปักที่จุดรถเหมือน PROBLEM
  // แล้วให้ผู้เรียกเปลี่ยนสี/ขึ้นกล่องเตือนเอง (ห้ามปัก 4 = จะกลายเป็นแถบเขียวครบว่าส่งถึงแล้ว)
  RETURNED: 2,
  AWAITING_COD: 4,
  DONE: 4,
}

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

/**
 * "จบเส้นทางแล้ว" ใช้ isTerminalCarrierStatus จาก lib/iship/status.ts — เดิมที่นี่มี
 * const TERMINAL_CARRIER เขียนรายชื่อไว้เอง แล้วมันหลุด `payment_success` (เงิน COD เข้าแล้ว
 * = ปลายทางที่ไกลกว่า delivered ด้วยซ้ำ) ทำให้ใบที่จบงานแล้วตกไปเป็น AWAITING_PICKUP
 * "รอรับเข้า" ซึ่งพาไทม์ไลน์ถอยกลับไปจุดแรก (user เจอบน prod 2026-08-06 TH069306110878)
 *
 * รายชื่อที่ถูกคัดลอกมาเขียนซ้ำจะไม่มีวันถูกแก้พร้อมกันทั้งสองที่ — ตัวตัดสินจึงต้องมีตัวเดียว
 * และอยู่ติดกับตารางสถานะที่นิยาม `terminal` เอาไว้อยู่แล้ว
 */

export function deriveShippingStage(o: ShippingStageInput): ShippingStageKey {
  /**
   * ยกเลิกทั้งใบ = ไม่ใช่งานค้าง ไม่ว่าพัสดุจะอยู่สถานะไหน
   *
   * `RETURNED` (feature 00056) อยู่ในกลุ่มเดียวกัน: ของกลับมาถึงร้านครบแล้วและร้านกดยืนยัน
   * รับคืนแล้ว = ไม่มีอะไรให้ทำต่อ ถ้าไม่ตัดตรงนี้ มันจะไปตกสาขาพัสดุข้างล่างแล้วขึ้นกอง
   * "กำลังจัดส่ง"/"รอรับเข้า" ตามสถานะของพัสดุ **ขาไป** ที่ยังค้างอยู่ในฐาน
   */
  if (o.status === 'CANCELLED' || o.status === 'RETURNED') return 'DONE'

  if (o.hasShipment) {
    // ลำดับเดียวกับ deriveOrderStage: ของที่ไม่ได้เดินหน้าตามปกติมาก่อน แล้วค่อยดูปลายทาง/ระหว่างทาง
    //
    // ตีกลับกับ "มีปัญหา" เป็นคนละกองแล้ว (2026-08-24) และสองชุดไม่ทับกันเลย (เทส [blocker]
    // ปักหมุดไว้) ลำดับระหว่างสองบรรทัดนี้จึงไม่มีผลต่อผลลัพธ์ — เรียงตีกลับไว้บนเพื่อให้อ่านโค้ด
    // แล้วเห็นว่ามันไม่ใช่สาขาย่อยของ PROBLEM
    //
    // 🛑 ต้องอยู่ **เหนือ** สาขา terminal: `return_success` เป็น terminal ตัวหนึ่ง ถ้าปล่อยให้
    // ตกลงไปข้างล่างมันจะกลายเป็น DONE (หรือ AWAITING_COD ถ้าเป็นใบ COD) = ของที่กลับมากอง
    // อยู่ที่ร้านหายจากทุกไทล์ ซึ่งคือบั๊กที่ PROBLEM_STAGE_CARRIER_STATUSES เคยถูกสร้างมาอุด
    if (isReturnedCarrierStatus(o.carrierStatus)) return 'RETURNED'
    if (isProblemCarrierStatus(o.carrierStatus)) return 'PROBLEM'
    if (isTerminalCarrierStatus(o.carrierStatus)) {
      // [สำคัญ] พัสดุจบเส้นทางแล้ว ≠ งานของร้านจบแล้ว — เดิมคืน 'DONE' ตรงนี้เลย ทำให้ออเดอร์
      // ที่ขนส่งส่งถึงแล้วแต่ร้านยังไม่ได้เงินปลายทาง หายไปจากทุกไทล์ทันที (DP2569085F97153B)
      //
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
  RETURNED: 'ตีกลับ',
}

/**
 * ─── ป้ายสถานะออเดอร์ที่ "พูดตรงกับความจริงของพัสดุ" ────────────────────────────
 *
 * บั๊กที่แก้ (user เจอบน prod 2026-08-06 — DP25690853C0FA9B): ใบ COD ที่ขนส่งส่งถึงแล้ว
 * แต่ร้านยังไม่ได้กดรับเงิน → Command Center จัดอยู่กอง "รอเงิน COD" ถูกต้องเพราะอ่านจาก
 * deriveShippingStage แต่ป้ายในหน้า /orders อ่าน Order.status ดิบ ๆ เลยขึ้น "กำลังจัดส่ง"
 * ทั้งที่ของถึงมือผู้ซื้อไปแล้ว = ใบเดียวกันพูดคนละเรื่องบนสองหน้าจอ
 *
 * [สำคัญ] ตัวนี้ไม่ใช่ SSOT ใหม่ — ไม่คำนวณ stage เอง แค่ "เลือกคำ" จากค่าที่
 * deriveShippingStage ตัดสินไว้แล้ว. Order.status ไม่ถูกแตะแม้แต่นิดเดียว: CONFIRMED
 * ต้องมาจากผู้ซื้อกดยืนยันเท่านั้น (BR-ISHIP-41) เพราะไปคิด Trust Score + สิทธิ์รีวิว
 * ถ้าปล่อยให้ขนส่งดันได้ = ปั่นคะแนนความน่าเชื่อถือด้วยพัสดุปลอมได้
 */
const STAGE_BADGE_OVERRIDE: Partial<
  Record<ShippingStageKey, { label: string; cls: string; icon: string; tone: OrderStatusTone }>
> = {
  SHIPPING: {
    label: SHIPPING_STAGE_LABEL.SHIPPING,
    cls: 'bg-info/15 text-info-ink',
    icon: 'truck',
    tone: 'info',
  },
  AWAITING_COD: {
    label: SHIPPING_STAGE_LABEL.AWAITING_COD,
    cls: 'bg-warning/15 text-warning-ink',
    icon: 'coin',
    tone: 'warning',
  },
  PROBLEM: {
    label: SHIPPING_STAGE_LABEL.PROBLEM,
    cls: 'bg-danger/15 text-danger-ink',
    icon: 'alert-triangle',
    tone: 'danger',
  },
  /**
   * warning ไม่ใช่ danger — เรื่องกับขนส่งจบแล้ว ของอยู่ในมือร้าน สิ่งที่เหลือคือการตัดสินใจ
   * ซึ่งเร่งด่วนน้อยกว่าพัสดุที่ยังลอยอยู่กลางทางแบบไม่รู้ผล (ถ้าใช้แดงเท่ากัน ร้านจะกวาดตา
   * แล้วแยกไม่ออกว่าใบไหนต้องโทรตามขนส่งเดี๋ยวนี้ ซึ่งเป็นเหตุผลทั้งหมดที่แยกกองออกมา)
   * ไอคอนใช้ตัวเดียวกับที่ตาราง CARRIER_STATUS ให้กับ return/return_success (arrow-back-up)
   */
  RETURNED: {
    label: SHIPPING_STAGE_LABEL.RETURNED,
    cls: 'bg-warning/15 text-warning-ink',
    icon: 'arrow-back-up',
    tone: 'warning',
  },
  /**
   * DONE ไม่มีคำอยู่ใน SHIPPING_STAGE_LABEL โดยตั้งใจ (type เป็น Exclude<...,'DONE'>) —
   * record นั้นเป็นของ "ตัวกรอง ?stage=" ซึ่ง OrdersList.tsx ใช้ key ของมันเป็นตัววาลิเดต
   * พารามิเตอร์ตรง ๆ (`stageParam in SHIPPING_STAGE_LABEL`) การเติม DONE เข้าไปจะทำให้
   * ?stage=DONE กลายเป็นตัวกรองที่ใช้ได้แต่ไม่มีชิปไหนพาไป จึงประกาศคำไว้ที่นี่แทน
   *
   * Verified-Means-Green: เขียวได้เพราะขนส่งยืนยันแล้วว่าถึงปลายทาง + ไม่มีเงินค้าง —
   * เป็นข้อเท็จจริงที่ตรวจสอบได้ ไม่ใช่การเดา. คนละเขียวกับ CONFIRMED (ผู้ซื้อยืนยันเอง)
   */
  DONE: {
    label: 'ส่งถึงแล้ว',
    cls: 'bg-success/15 text-success-ink',
    icon: 'circle-check-filled',
    tone: 'success',
  },
}

/**
 * resolveOrderStatusBadge — ป้ายที่ควรแสดงจริงบนแถว/การ์ด/หัวหน้ารายละเอียด
 *
 * รูปแบบที่คืนเหมือน ORDER_STATUS_META[status] ทุกฟิลด์ (drop-in) — จุดที่เรียกไม่ต้องรู้ว่า
 * มีการรวมสองชั้นเกิดขึ้น
 *
 * ไม่ override 3 กรณี:
 *   - `shippingStage` undefined = ร้านที่ไม่ใช่ ONLINE_SALES (ไม่มีพัสดุให้ไล่) → ของเดิมเป๊ะ
 *   - CANCELLED = การตัดสินใจเชิงธุรกิจ ไม่ใช่สถานะพัสดุ
 *   - CONFIRMED = ความจริงระดับสูงสุดของระบบ (ผู้ซื้อยืนยันเอง) ห้ามให้ชั้นพัสดุมาทับ
 * และไม่ override stage ต้นทาง (AWAITING_PARCEL/AWAITING_PICKUP) เพราะ "รอดำเนินการ"
 * ครอบคลุมอยู่แล้ว ส่วน "รอรับเข้า" เป็นภาษาของกองงานพัสดุ ไม่ใช่ของสถานะออเดอร์
 */
export function resolveOrderStatusBadge(
  status: string,
  shippingStage?: ShippingStageKey,
): { label: string; cls: string; icon: string; tone: OrderStatusTone } {
  const base = ORDER_STATUS_META[status] ?? {
    label: status,
    cls: 'bg-default-100 text-default-800',
    icon: 'clock',
    tone: 'warning' as OrderStatusTone,
  }
  if (!shippingStage || status === 'CANCELLED' || status === 'CONFIRMED') return base
  // ไม่รู้จัก stage = คืนของเดิม ห้ามคืน undefined — ป้ายหายทั้งแถวแย่กว่าป้ายที่ไม่ละเอียด
  return STAGE_BADGE_OVERRIDE[shippingStage] ?? base
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
  /**
   * Order.serviceStart — **ตัวนิยามว่า "ใบนี้เป็นนัดหมาย"** (เกณฑ์เดียวกับ deriveAppointmentStage)
   * ไม่ใช่ Shop.vertical: ธงของร้านเป็นภาพนิ่งที่เปลี่ยนทีหลังได้ ส่วนช่วงเวลาที่นัดไว้เป็นของ
   * ตัวออเดอร์เอง (docs/conventions/stored-flag-vs-owner-truth.md)
   */
  serviceStart?: Date | string | null
  /** Order.appointmentStatus — null/ค่าที่ไม่รู้จัก = SCHEDULED ตาม default เดียวกับปฏิทิน */
  appointmentStatus?: string | null
  /**
   * Shop.vertical ของร้านที่เป็นเจ้าของใบนี้ — ผันคำของขั้น `ORDERED` เท่านั้น
   * (`ORDER_VOCAB[vertical].stageOrderedLabel`; ไม่ส่งมา/ไม่รู้จัก → ชุด ONLINE_SALES เหมือนเดิม)
   *
   * [สำคัญ] ต่างจาก `serviceStart` ข้างบนโดยเจตนา: ตรงนั้นถามว่า "ใบนี้เป็นนัดไหม" ซึ่งเป็น
   * ข้อเท็จจริงของตัวออเดอร์ ส่วนช่องนี้ถามว่า "ร้านนี้เรียกใบแบบนี้ว่าอะไร" ซึ่งเป็นเรื่องของ
   * *คำ* ล้วน ๆ จึงต้องอ่านจากร้าน ณ ปัจจุบัน ไม่ใช่จากธงที่ค้างบนแถวออเดอร์
   * (docs/conventions/stored-flag-vs-owner-truth.md) และห้ามเอาไปตัดสิน *ตรรกะ* ใด ๆ
   */
  vertical?: string | null
  /**
   * จำนวนออเดอร์ "ที่ยังไม่ถูกยกเลิก" ของลูกค้าคนนี้ในร้านนี้ ที่พัสดุมีปัญหาอยู่ — **นับทุกใบ
   * ไม่ใช่แค่ใบล่าสุด** (user สั่ง 2026-08-20)
   *
   * 🛑 ช่องเดียวในอินพุตนี้ที่พูดถึงออเดอร์มากกว่าใบเดียว และมันจงใจ: ป้ายในแถวแชทตอบว่า
   * "ลูกค้าคนนี้ค้างอะไรกับเราอยู่" ซึ่งพัสดุที่ตีกลับ/ติดปัญหาไม่หายไปเพราะลูกค้าสั่งใบใหม่ทับ
   * ก่อนหน้านี้อ่านจากใบล่าสุดใบเดียว ⇒ ใบปัญหาที่มีใบใหม่กว่าตามมา **หายจากทั้งป้ายและตัวกรอง**
   * (ชิปกล่องแชทขึ้น 3 ขณะที่ /orders ขึ้น 10 — user เจอบน prod 2026-08-20)
   *
   * undefined = ผู้เรียกยังไม่ได้นับมาให้ → ตกกลับไปตัดสินจากใบล่าสุดใบเดียวเหมือนเดิม
   * (ห้ามตีเป็น 0 เพราะ "ไม่รู้" กับ "รู้ว่าไม่มี" ไม่เหมือนกัน)
   */
  problemOrderCount?: number | null
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
  /**
   * จำนวนใบที่พัสดุมีปัญหาพร้อมกันของลูกค้าคนนี้ — มีค่าเฉพาะขั้น PARCEL_PROBLEM และเฉพาะเมื่อ
   * **≥2** (ใบเดียวไม่ต้องบอกจำนวน คำว่า "พัสดุมีปัญหา" ก็ครบความหมายแล้ว)
   *
   * ห้ามประกอบข้อความเองที่ฝั่ง JSX — ใช้ `orderStageChipLabel()` ตัวเดียว (HR16)
   */
  problemCount?: number
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

  // จำนวนใบที่ติดปัญหาอยู่ของลูกค้าคนนี้ (ทุกใบ ไม่ใช่แค่ใบล่าสุด) — ผู้เรียกที่ไม่ได้นับมาให้
  // จะได้ 0 แล้วตกไปใช้เส้นทางเดิมที่ตัดสินจากใบล่าสุดใบเดียว
  const problemOrders = order.problemOrderCount ?? 0

  let key: OrderStageKey
  if (problemOrders > 0) {
    // 🛑 ชนะทุกขั้นรวมทั้ง CANCELLED ของใบล่าสุด: ใบที่ยกเลิกไปแล้วไม่ถูกนับอยู่แล้ว (ตัวนับ
    // ตัด status='CANCELLED' ทิ้ง) ⇒ ค่านี้ >0 แปลว่ายังมีของค้างอยู่จริงในใบอื่น ซึ่งเป็น
    // เรื่องที่ต้องเห็นมากกว่า "ใบล่าสุดถูกยกเลิก"
    key = 'PARCEL_PROBLEM'
  } else if (order.status === 'RETURNED') {
    /**
     * feature 00056 — ใช้กติกาหมดอายุชุดเดียวกับ "ยกเลิกแล้ว" (ค้าง 1 วัน) เพราะตอบคำถาม
     * เดียวกันว่า "ลูกค้าคนนี้เพิ่งมีเรื่องกับเรา" · ป้ายค้างนานกว่านั้นมีแต่ทำให้รายการรก
     */
    if (age > CANCELLED_VISIBLE_MS) return null
    key = 'RETURNED'
  } else if (order.status === 'CANCELLED') {
    if (age > CANCELLED_VISIBLE_MS) return null
    key = 'CANCELLED'
  } else if (hasShipment) {
    // สายพัสดุ — ขนส่งคือคนเดียวที่รู้จริงว่าของอยู่ไหน
    //
    // ปัญหามาก่อนทุกอย่างและไม่มีวันหมดอายุ: ก่อนหน้านี้ issue/return/cannot_pickup/
    // is_expired/cod_refund ตกลงไปเป็น "สร้างพัสดุแล้ว" ทั้งหมด — เคสที่ต้องเห็นด่วนที่สุด
    // กลับกลืนหายไปกับพัสดุปกติ (user report 2026-07-31)
    if (isReturnedCarrierStatus(order.carrierStatus)) {
      /**
       * 🛑 ตีกลับ = **ไม่ขึ้นชิปสถานะเลย** ในแถวรายการแชท (user สั่ง 2026-08-24)
       *
       * ไม่ใช่เพราะไม่สำคัญ แต่เพราะแถวนี้ *มีป้ายของเรื่องนี้อยู่แล้ว*: ชิปพฤติกรรมลูกค้า
       * "ตีกลับ N รายการ" (`customer-behavior.ts` → `behaviorBadges`) ซึ่งนับทุกใบของลูกค้า
       * คนนั้นและไม่มีวันหมดอายุ — เดิมแถวเดียวกันจึงขึ้นทั้ง "ตีกลับ 1 รายการ" และ
       * "พัสดุมีปัญหา" พร้อมกันโดยพูดถึงพัสดุใบเดียวกัน (user ส่งภาพหน้าจอมาจาก prod)
       * ชิปที่สองไม่ได้เพิ่มข้อมูล มันแค่กินพื้นที่ rail 320px และบอกความเร่งด่วนผิด
       *
       * ห้ามปล่อยให้ตกไปสาขาล่าง: `labelPrintedAt` ไม่เคยถูกล้าง ⇒ พัสดุที่ตีกลับมาแล้วจะขึ้น
       * "พิมพ์เอกสารแล้ว" ซึ่งผิดยิ่งกว่าเดิม
       */
      return null
    } else if (isProblemCarrierStatus(order.carrierStatus)) {
      key = 'PARCEL_PROBLEM'
      // ถึงมือผู้รับแล้ว = delivered หรือไกลกว่านั้น (payment_success = เงิน COD เข้าแล้ว)
      // เดิมเทียบ === 'delivered' ตรง ๆ ใบ COD ที่ได้เงินแล้วจึงตกไปเป็น "สร้างพัสดุแล้ว"
    } else if (isDeliveredCarrierStatus(order.carrierStatus)) {
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
    // ลำดับ: นัดหมาย (เจาะจงที่สุด) → คำตามประเภทกิจการ → คำกลางของระบบ
    ...(appointmentFace(key, order) ?? verticalFace(key, order) ?? ORDER_STAGE_META[key]),
    ...(printCount > 0 ? { printCount } : {}),
    // ใบเดียวไม่ต้องบอกจำนวน — "พัสดุมีปัญหา ×1" อ่านแล้วชวนสงสัยว่าอีกใบอยู่ไหน
    ...(key === 'PARCEL_PROBLEM' && problemOrders >= 2 ? { problemCount: problemOrders } : {}),
  }
}

/**
 * orderStageChipLabel — ข้อความบนชิปในแถวแชท (SSOT ของ *คำ* — HR16)
 *
 * ตัวเลขที่ผูกกับป้ายมี 2 ชนิดและทั้งคู่ "กินที่ของ label เดิม" ไม่ใช่ต่อท้ายเป็นชิปที่สอง:
 *   - `printCount` → "พิมพ์ N ครั้ง" (แทนคำว่า "พิมพ์เอกสารแล้ว" ทั้งคำ — user 2026-07-31:
 *     สองอันบอกเรื่องเดียวกัน รู้จำนวนแล้วก็ใช้จำนวนไปเลย)
 *   - `problemCount` → "พัสดุมีปัญหา ×N" (คงคำเดิมไว้แล้วต่อจำนวน เพราะคำว่า "มีปัญหา" คือ
 *     ตัวที่ต้องอ่านออกก่อน ส่วนจำนวนเป็นข้อมูลรอง — ต่างจากการพิมพ์ที่จำนวนคือเนื้อหาหลัก)
 *
 * 🛑 ห้ามประกอบข้อความพวกนี้ใน JSX: เดิม "พิมพ์ N ครั้ง" ถูกเขียนไว้ใน InboxList.tsx ที่เดียว
 * ⇒ วันที่มีจอที่สองแสดงชิปเดียวกัน คำจะแตกเป็นสองเวอร์ชันโดยไม่มี gate ไหนฟ้อง (HR16)
 * ใช้ `×` (U+00D7) ไม่ใช่ตัวอักษร x — เป็น typographic sign ไม่ใช่ emoji (HR12 ผ่าน)
 */
export function orderStageChipLabel(stage: {
  key: string
  label: string
  printCount?: number
  problemCount?: number
}): string {
  if (stage.key === 'LABEL_PRINTED' && stage.printCount) return `พิมพ์ ${stage.printCount} ครั้ง`
  if (stage.key === 'PARCEL_PROBLEM' && stage.problemCount && stage.problemCount >= 2) {
    return `${stage.label} ×${stage.problemCount}`
  }
  return stage.label
}

/**
 * verticalFace — ขั้น "ใบถูกเปิดขึ้นมาแล้ว" ต้องพูดด้วยคำของร้านนั้น
 * (user report 2026-08-12: การ์ดในแชทของร้านคิวงานขึ้น "สั่งซื้อแล้ว" ทั้งที่ไม่มีใครสั่งซื้ออะไร)
 *
 * แทนที่เฉพาะ ORDERED ขั้นเดียวด้วยเหตุผลเดียวกับ appointmentFace: ขั้นพัสดุพูดถึงพัสดุ
 * (ร้านที่ไม่ส่งของไม่มีทางไปถึงอยู่แล้ว) ส่วน CANCELLED/COMPLETED เป็นคำกลางที่ใช้ได้ทุกกิจการ
 *
 * [สำคัญ] เปลี่ยนแค่ `label` — `key`/`cls`/`icon` ต้องเหมือนเดิมทุกประการ เพราะ key คือตัวตนที่
 * โค้ดอื่น switch อยู่ และสีของขั้นเป็นเรื่องของ "อยู่ตรงไหนบนเส้นทาง" ไม่ใช่ของประเภทกิจการ
 */
function verticalFace(
  key: OrderStageKey,
  order: OrderStageInput,
): { label: string; cls: string; icon: string } | null {
  if (key !== 'ORDERED') return null
  const label = resolveOrderVocab(order.vertical ?? '').stageOrderedLabel
  if (label === ORDER_STAGE_META.ORDERED.label) return null
  return { ...ORDER_STAGE_META.ORDERED, label }
}

/**
 * appointmentFace — ออเดอร์ที่เป็น "นัดหมาย" พูดเรื่องนัด ไม่ใช่พูดว่า "สั่งซื้อแล้ว"
 * (user request 2026-08-08 บนแถวกล่องแชทของร้านคิวงาน)
 *
 * คืน null = ไม่ใช่นัด/ไม่ใช่ขั้นที่ควรแทนที่ → ผู้เรียกใช้ ORDER_STAGE_META ตามเดิม
 *
 * แทนที่เฉพาะขั้น ORDERED ขั้นเดียว ด้วยเหตุผลเดียวกับที่ resolveOrderStatusBadge ไม่ override
 * CANCELLED/CONFIRMED: สองอันนั้นเป็นความจริงระดับออเดอร์ (ยกเลิกทั้งใบ / ผู้ซื้อยืนยันแล้ว)
 * ซึ่งอยู่เหนือรายละเอียดของนัด. ขั้นพัสดุก็ไม่แตะ เพราะออเดอร์นัดไม่มีพัสดุอยู่แล้ว
 *
 * [สำคัญ] key ยังเป็น 'ORDERED' เหมือนเดิม — เปลี่ยนแค่ "หน้าตา" (label/cls/icon) ไม่ใช่ตัวตน
 * ที่โค้ดอื่น switch อยู่ ถ้าเพิ่ม key ใหม่ ทุกที่ที่รับ OrderStageKey จะต้องแก้ตามโดยไม่จำเป็น
 *
 * ทำไมนัดที่ "ขอเลื่อน/ไม่มา/ให้บริการแล้ว" ต้องโชว์คำสถานะแทนวันที่ (user เคาะ 2026-08-08):
 * setAppointmentOutcome ไม่แตะ Order.status เลย (BR-RSV-33) ป้ายจึงค้างที่ ORDERED ตลอด —
 * ถ้าโชว์วันที่อย่างเดียว นัดที่จบไปแล้ว/ถูกขอเลื่อนจะยังอ่านว่า "นัดวันนั้น" ค้างอยู่ตลอดไป
 * ซึ่งเป็นข้อมูลเก่าที่ดูเหมือนข้อมูลสด
 */
function appointmentFace(
  key: OrderStageKey,
  order: OrderStageInput,
): { label: string; cls: string; icon: string } | null {
  if (key !== 'ORDERED') return null
  const stage = deriveAppointmentStage({
    serviceStart: order.serviceStart,
    appointmentStatus: order.appointmentStatus,
  })
  if (!stage) return null

  const meta = APPOINTMENT_STAGE_META[stage]
  // นัดที่ยังเดินตามแผน → สิ่งที่ร้านต้องรู้ระหว่างคุยคือ "นัดวันไหน" ไม่ใช่ชื่อสถานะ
  // (สถานะยังสื่อผ่านสีของชิปอยู่: รอลูกค้ายืนยัน = เหลือง, ลูกค้ายืนยันแล้ว = น้ำเงิน)
  const onTrack = stage === APPOINTMENT_STATUS.SCHEDULED || stage === APPOINTMENT_STATUS.CONFIRMED_BY_BUYER
  return {
    ...meta,
    label: onTrack ? `นัด ${formatDayMonthShortYearTH(order.serviceStart)}` : meta.label,
  }
}

/**
 * shouldPromptCloseReturnedOrder — ควรชวนร้านให้ปิดงานเพราะของตีกลับมาถึงร้านแล้วไหม
 *
 * 🛑 อยู่ที่นี่ไม่ใช่ในเทอร์นารีกลาง JSX ตาม `docs/conventions/ui-boolean-needs-a-testable-home.md`
 * — เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม" แต่คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม" ซึ่งเงื่อนไขนี้
 * เขียนกลับด้านได้ง่ายมาก (`!==` แทน `===`) แล้วผลคือกล่องไปโผล่บนใบที่ปิดไปแล้ว หรือไม่โผล่เลย
 * โดย `tsc`/build ผ่านทั้งคู่เพราะเป็น boolean ที่ถูกต้องตามชนิดทุกประการ
 *
 * ที่มา (user report 2026-08-20): ของถูกตีกลับถึงร้านแล้วแต่คำสั่งซื้อค้างเป็น "จัดส่งแล้ว"
 * ตลอดไป — ทางปิดงาน (ยกเลิก) มีอยู่แล้วใน ⋯ แต่ไม่มีอะไรบอกว่าควรกด และร้านที่กลัวเสีย
 * อัตราความสำเร็จก็ไม่กล้ากด ทั้งที่ระบบหักใบแบบนี้ออกจากตัวหารให้อยู่แล้ว (BR-OSM-04)
 *
 * `CONFIRMED` ไม่ชวน: ผู้ซื้อยืนยันรับของแล้ว (หรือระบบยืนยันจากเงิน COD ที่เข้าจริง) —
 * ต่อให้พัสดุใบหนึ่งตีกลับ งานก็จบไปแล้วด้วยเส้นทางอื่น การชวนให้ยกเลิกตรงนั้นคือการชวน
 * ให้ทำลายหลักฐานที่แข็งแรงกว่า `CANCELLED` ไม่ชวนเพราะปิดไปแล้ว
 */
export function shouldPromptCloseReturnedOrder(o: {
  status: string
  /** พัสดุ "ที่มีอยู่จริง" ของออเดอร์นี้ถูกตีกลับ (isReturnedCarrierStatus) */
  parcelReturned: boolean
}): boolean {
  if (!o.parcelReturned) return false
  return o.status === 'PENDING' || o.status === 'SHIPPED'
}
