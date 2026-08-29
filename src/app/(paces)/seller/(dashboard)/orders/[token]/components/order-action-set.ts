/**
 * order-action-set.ts — pure logic: ชุด action (primary/ghost/menu) ของหน้ารายละเอียดคำสั่งซื้อ
 *
 * ทำไม: T5 contract กลาง — task การ์ดใบสั่งซื้อ/แถบ action/หัวหน้า (S-2, S-5, S-6) import
 * ฟังก์ชันนี้ตัวเดียว แทนเขียน matrix สถานะซ้ำ 3 ที่ (บทเรียน feedback_lock_contract_before_parallel)
 * ไม่มี JSX/markup — ฝั่ง UI เป็นคนแปลง ActionItem[] เป็นปุ่มเอง
 *
 * อ้างอิง:
 *   - docs/superpowers/specs/2026-07-31-seller-order-detail-v5-design.md §3 (per-state matrix)
 *   - docs/scope/2026-07-31-seller-order-detail-v5-scope-baseline.md Change Log
 *     (S-5/S-6: ตัด "แก้ไขคำสั่งซื้อ" ออกจากเมนู ⋮ ของ SHIPPED — หน้า edit บล็อก non-PENDING
 *     อยู่แล้ว กดไปเจอ dead-end)
 */

import type { OrderStatus } from '@/lib/order-display'

export type ActionItem = { key: string; label: string; icon: string }

export type OrderActionSet = {
  primary: ActionItem | null
  ghosts: ActionItem[]
  menu: ActionItem[] // action รองใน ⋮
}

export type ShipmentSource = 'MANUAL' | 'ISHIP' | null

export type GetOrderActionSetInput = {
  status: OrderStatus
  /**
   * ค่าที่พบจริงในฐาน (String ไม่ใช่ enum): 'SHIPPED' | 'NO_SHIPPING' | 'PICKUP'
   * (PICKUP มาจาก booking.service.ts feat 00017 — ออเดอร์จองที่พัก)
   * เฉพาะ 'SHIPPED' เท่านั้นที่ถือว่า "ต้องส่งของ" — NO_SHIPPING (digital/service/subscription)
   * และ PICKUP (จองที่พัก มติ user: ปฏิบัติเหมือนสินค้าดิจิทัล) ไม่มี action ที่เกี่ยวกับพัสดุ/ที่อยู่จัดส่ง
   */
  fulfillmentMode: string
  /**
   * ชื่อของสิ่งนั้นตามประเภทกิจการ (feature 00030 — resolveOrderVocab().noun)
   * ไม่ส่ง → 'คำสั่งซื้อ' (ชุดของ ONLINE_SALES ตาม fail-safe ของ SSOT)
   */
  orderNoun?: string
  /**
   * แหล่งที่มาของพัสดุ — null เมื่อยังไม่แจ้งเลขพัสดุเลย
   * 'ISHIP' = ระบบสร้างพัสดุให้ (feat 00022) ห้ามเขียน ShipmentTracking เอง →
   * "แก้ไขเลขพัสดุ" ต้องหายไปทั้งปุ่ม ไม่ใช่ปุ่มที่กดไม่ได้
   */
  shipmentSource: ShipmentSource
  /**
   * ออเดอร์นี้เก็บเงินปลายทาง และร้านยังไม่ได้กดว่าได้เงิน (2026-08-04)
   * true → มีปุ่ม "ได้รับเงินแล้ว" ให้กดเคลียร์ไทล์ "รอเงิน COD" บนหน้าแรก
   * ต้องเป็น 2 ค่าแยกกัน ไม่ใช่ derive จาก paymentMethod ที่นี่ เพราะ pure module นี้ห้ามรู้จัก
   * รูปแบบข้อความวิธีชำระ (SSOT อยู่ที่ isCODPayment ใน lib/order-display)
   */
  isCodUnpaid?: boolean
  /**
   * feature 00062 — ออเดอร์นัดรับ (fulfillmentMode='PICKUP') ที่ยังไม่ได้รับเงินโอน/พร้อมเพย์/เงินสด
   * (caller คำนวณจาก `canSellerConfirmPayment(paymentMethod) && !paymentConfirmedAt` — ห้าม derive
   * ที่นี่ด้วยเหตุผลเดียวกับ isCodUnpaid) มีผลเฉพาะตอน status==='PENDING' เท่านั้น (ตาราง UX §A2)
   * 🛑 ห้ามทับ/ปนกับ isCodUnpaid — COD กับ PICKUP+TRANSFER เป็นคนละ paymentMethod เสมอ ไม่มีวันชนกัน
   */
  isPickupPaymentUnpaid?: boolean
  /**
   * feature 00062 — ร้านกด "มอบสินค้าแล้ว" ในออเดอร์นัดรับนี้แล้วหรือยัง (handedOverAt != null)
   * มีผลเฉพาะตอน status==='PENDING' เช่นกัน — SHIPPED/CONFIRMED/CANCELLED ของ PICKUP ยังให้ผล
   * เหมือน NO_SHIPPING เป๊ะ (ไม่แตะ — regression test เดิมยังต้องผ่าน)
   */
  isPickupHandedOver?: boolean
}

// ── action item catalog — key เดียว ใช้ซ้ำได้ทุกสถานะ ──────────────────────────
// feature 00030: 2 ตัว (editOrder/cancelOrder) ผันคำตามประเภทกิจการ จึงเป็นฟังก์ชันไม่ใช่ constant
// ตัวที่เหลือพูดถึงพัสดุ/ลิงก์/SMS ซึ่งเป็นคำกลางอยู่แล้ว ไม่ผูกกับประเภทร้าน
const buildActions = (orderNoun: string) =>
  ({
    sendSms: { key: 'send-sms', label: 'ส่งลิงก์ทาง SMS (฿1)', icon: 'message-forward' },
    reportTracking: { key: 'report-tracking', label: 'แจ้งเลขพัสดุ', icon: 'truck' },
    copyLink: { key: 'copy-link', label: 'คัดลอกลิงก์', icon: 'copy' },
    copyAddress: { key: 'copy-address', label: 'คัดลอกที่อยู่จัดส่ง', icon: 'map-pin' },
    editOrder: { key: 'edit-order', label: `แก้ไข${orderNoun}`, icon: 'edit' },
    cancelOrder: { key: 'cancel-order', label: `ยกเลิก${orderNoun}`, icon: 'ban' },
    editTracking: { key: 'edit-tracking', label: 'แก้ไขเลขพัสดุ', icon: 'pencil' },
    copyTracking: { key: 'copy-tracking', label: 'คัดลอกเลขพัสดุ', icon: 'copy' },
    // ปุ่มเดียวที่เคลียร์ไทล์ "รอเงิน COD" ได้ — iShip ไม่มีสถานะไหนบอกว่าโอนเข้าร้านแล้ว
    // (ยืนยันจากรายการ order_statuses เต็ม ๆ 2026-08-04) จึงต้องมาจากคนที่เห็นเงินจริง
    codReceived: { key: 'cod-received', label: 'ได้รับเงินปลายทางแล้ว', icon: 'cash' },
    // feature 00062 — คนละคีย์กับ codReceived โดยตั้งใจ (COD vs โอน/พร้อมเพย์/เงินสดของออเดอร์นัดรับ
    // เป็นคนละแกน — ดูคอมเมนต์ isPickupPaymentUnpaid ด้านบน) label สั้นกว่าเพราะไม่มี "ปลายทาง"
    pickupPaymentReceived: { key: 'pickup-payment-received', label: 'ได้รับเงินแล้ว', icon: 'cash' },
    pickupHandedOver: { key: 'pickup-handed-over', label: 'มอบสินค้าแล้ว', icon: 'package-check' },
  }) as const satisfies Record<string, ActionItem>

/**
 * getOrderActionSet — คืนชุด action (primary/ghosts/menu) ของหน้าตามสถานะ + fulfillment + shipment source
 *
 * matrix อ้างอิง design §3 (แก้ตาม Change Log 2026-07-31):
 *   PENDING:   primary=reportTracking · ghost=[] · menu=[sendSms,copyLink,copyAddress,editOrder,cancelOrder]
 *              (2026-08-04 user request — เดิม primary=sendSms · ghost=[reportTracking])
 *   SHIPPED:   primary=null    · ghost=[copyLink,editTracking(MANUAL only)] · menu=[copyTracking,copyAddress,cancelOrder]
 *   CONFIRMED: primary=null    · ghost=[copyLink]  · menu=[copyTracking,copyAddress]
 *   CANCELLED: primary=null    · ghost=[]           · menu=[]  (ไม่มีแถบเลย)
 *
 * fulfillmentMode !== 'SHIPPED' → ตัด action ที่เกี่ยวกับพัสดุ/ที่อยู่จัดส่งออกทั้งหมด
 * (reportTracking, editTracking, copyTracking, copyAddress) — คงเหลือ action อื่นตามปกติ
 * ครอบคลุมทั้ง 'NO_SHIPPING' และ 'PICKUP' (G-1: จองที่พักไม่ใช่ NO_SHIPPING แต่ต้องไม่มี action พัสดุเหมือนกัน)
 */
export function getOrderActionSet(input: GetOrderActionSetInput): OrderActionSet {
  const { status, fulfillmentMode, shipmentSource, isCodUnpaid } = input
  // optional โดยตั้งใจ — caller ที่ยังไม่รู้จัก vertical (และเทสเดิม) ได้คำของ ONLINE_SALES
  const ACTIONS = buildActions(input.orderNoun ?? 'คำสั่งซื้อ')
  // allow-list ไม่ใช่ deny-list โดยตั้งใจ — fulfillmentMode เป็น String ไม่ใช่ enum
  // ค่าใหม่ในอนาคต (เช่น PICKUP ที่หลุดมารอบนี้ — G-1) จะได้ไม่ถูกนับเป็น "ต้องส่งของ" เองโดยอัตโนมัติ
  const hasShipping = fulfillmentMode === 'SHIPPED'
  const isManualShipment = shipmentSource === 'MANUAL'

  if (status === 'CANCELLED') {
    // "ไม่มีแถบเลย" ตาม design §3 — ครอบทั้ง primary/ghost/menu
    return { primary: null, ghosts: [], menu: [] }
  }

  if (status === 'PENDING') {
    /**
     * feature 00062 — ออเดอร์นัดรับ (PICKUP) มีลำดับ primary ของตัวเอง (เงินก่อน → ส่งมอบทีหลัง)
     * แยกออกจาก branch ด้านล่างทั้งหมดตั้งแต่ต้น เพราะ PICKUP ไม่มีคอนเซปต์ "แจ้งเลขพัสดุ"/
     * "ส่ง SMS" เป็น primary เหมือน NO_SHIPPING อีกต่อไป — มีขั้นตอนเงิน+ส่งมอบเป็นของตัวเอง
     * ตามตาราง UX-Design-Spec §A2 (เฉพาะ PENDING เท่านั้น — SHIPPED/CONFIRMED/CANCELLED ของ
     * PICKUP ยังให้ผลเหมือน NO_SHIPPING เป๊ะตาม regression test เดิม ไม่แตะ)
     */
    if (fulfillmentMode === 'PICKUP') {
      // มอบของแล้ว รอ grace period — undo อยู่ในการ์ดเท่านั้น (hidden lg:flex) ไม่ใช่แถบล่าง
      // เพราะไม่ใช่ action ที่ควรกดพลาดง่ายบนแถบล่าง (UX §A2 ตาราง แถวที่ 3)
      if (input.isPickupHandedOver) {
        return { primary: null, ghosts: [ACTIONS.copyLink], menu: [ACTIONS.editOrder, ACTIONS.cancelOrder] }
      }
      const menu: ActionItem[] = [ACTIONS.copyLink, ACTIONS.editOrder, ACTIONS.cancelOrder]
      if (input.isPickupPaymentUnpaid) {
        // ยังไม่ได้เงิน + ยังไม่มอบของ — เก็บเงินก่อนมอบของคือลำดับที่ปลอดภัยกว่า (UX §A2 D-3)
        return { primary: ACTIONS.pickupPaymentReceived, ghosts: [ACTIONS.pickupHandedOver], menu }
      }
      // ได้เงินแล้ว (หรือวิธีชำระไม่เข้าเงื่อนไขให้ร้านยืนยันเอง) + ยังไม่มอบของ
      return { primary: ACTIONS.pickupHandedOver, ghosts: [], menu }
    }

    /**
     * 2026-08-04 (user request): "ส่งลิงก์ทาง SMS" ย้ายลงไปอยู่ใน ⋮ แทนที่จะเป็นปุ่มหลัก
     *
     * เหตุผลฝั่งผู้ใช้: มันเป็น action ที่เสียเงินจริง (฿1/ครั้ง) และร้านไม่ได้ใช้ทุกใบ แต่เดิม
     * มันกินความกว้างเกือบทั้งแถบล่างบนมือถือจนปุ่ม "แจ้งเลขพัสดุ" ถูกบีบเหลือแค่ไอคอน
     *
     * "แจ้งเลขพัสดุ" ขึ้นมาเป็น primary แทน — เป็น action ที่ร้านกดจริงบ่อยที่สุดในสถานะนี้
     * และเป็นตัวเดียวที่ขยับสถานะออเดอร์ไปข้างหน้าได้จากหน้านี้
     *
     * ถ้าออเดอร์ไม่ต้องส่งของ (NO_SHIPPING/PICKUP) จะไม่มี "แจ้งเลขพัสดุ" ให้ promote —
     * กรณีนั้น sendSms ยังเป็น primary เหมือนเดิม เพราะไม่มี action อื่นเหลือให้เป็นปุ่มหลัก
     * (ปล่อยว่างแล้วแถบจะเหลือแค่ปุ่ม ⋮ อันเดียว)
     */
    /**
     * PENDING + มีพัสดุ iShip แล้ว = เปิดพัสดุไปแล้วแต่ขนส่งยังไม่เข้ารับ (ออเดอร์ยังไม่ขยับ
     * เป็น SHIPPED จนกว่าขนส่งจะสแกนจริง) — ปุ่ม "แจ้งเลขพัสดุ" จะโกหกว่ายังไม่มีเลข
     * (user เจอจริง 2026-08-06) กดแล้วโมดัลก็เปิดหน้าสถานะอยู่แล้ว → label ต้องตรงกับ
     * สิ่งที่จะเห็น: "สถานะพัสดุ" + มีคัดลอกเลขให้ใน ⋮ เหมือนสถานะที่มีเลขแล้วตัวอื่น
     */
    const hasIshipParcel = hasShipping && shipmentSource === 'ISHIP'
    const primary = hasIshipParcel
      ? { ...ACTIONS.reportTracking, label: 'สถานะพัสดุ' }
      : hasShipping
        ? ACTIONS.reportTracking
        : ACTIONS.sendSms

    const menu: ActionItem[] = []
    if (hasIshipParcel) menu.push(ACTIONS.copyTracking)
    if (hasShipping) menu.push(ACTIONS.sendSms)
    menu.push(ACTIONS.copyLink)
    if (hasShipping) menu.push(ACTIONS.copyAddress)
    menu.push(ACTIONS.editOrder, ACTIONS.cancelOrder)

    return { primary, ghosts: [], menu }
  }

  if (status === 'SHIPPED') {
    const ghosts: ActionItem[] = [ACTIONS.copyLink]
    // "แก้ไขเลขพัสดุ" เฉพาะ MANUAL — ISHIP ต้องไม่มีปุ่มนี้เลย (system-generated, ห้ามเขียน
    // ShipmentTracking ตาม feat 00022)
    if (hasShipping && isManualShipment) ghosts.push(ACTIONS.editTracking)

    // Change Log 2026-07-31: SHIPPED ไม่มี "แก้ไขคำสั่งซื้อ" ใน ⋮ (edit page บล็อก non-PENDING)
    const menu: ActionItem[] = []
    if (hasShipping) menu.push(ACTIONS.copyTracking, ACTIONS.copyAddress)
    menu.push(ACTIONS.cancelOrder)

    // ของออกไปแล้ว งานเดียวที่เหลือของร้านคือตามเงินปลายทาง → ยกขึ้นเป็นปุ่มหลัก
    // ไม่ใช่ซ่อนใน ⋮ เพราะเป็นตัวเดียวที่ทำให้ใบนี้ออกจากกอง "รอเงิน COD" ได้
    return { primary: isCodUnpaid ? ACTIONS.codReceived : null, ghosts, menu }
  }

  // CONFIRMED — ผู้ซื้อยืนยันรับของแล้วไม่ได้แปลว่าเงินปลายทางเข้าร้านแล้ว (คนละแกน)
  // ปุ่มจึงต้องยังอยู่ ไม่งั้นใบที่ผู้ซื้อกดยืนยันไวกว่ารอบโอนของขนส่ง จะไม่มีทางบันทึกว่าได้เงิน
  const menu: ActionItem[] = []
  if (hasShipping) menu.push(ACTIONS.copyTracking, ACTIONS.copyAddress)

  return { primary: isCodUnpaid ? ACTIONS.codReceived : null, ghosts: [ACTIONS.copyLink], menu }
}
