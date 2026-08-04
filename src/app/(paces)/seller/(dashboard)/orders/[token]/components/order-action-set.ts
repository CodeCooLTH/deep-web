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
  const { status, fulfillmentMode, shipmentSource } = input
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
    const primary = hasShipping ? ACTIONS.reportTracking : ACTIONS.sendSms

    const menu: ActionItem[] = []
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

    return { primary: null, ghosts, menu }
  }

  // CONFIRMED
  const menu: ActionItem[] = []
  if (hasShipping) menu.push(ACTIONS.copyTracking, ACTIONS.copyAddress)

  return { primary: null, ghosts: [ACTIONS.copyLink], menu }
}
