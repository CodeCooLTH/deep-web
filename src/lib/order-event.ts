// order-event.ts — SSOT ของ "ประวัติกิจกรรมคำสั่งซื้อ" (feature 00031)
//
// ตอบคำถาม "ใครทำอะไรกับออเดอร์นี้เมื่อไหร่" ซึ่งเป็นคนละคำถามกับ Order.status
// ("ตอนนี้ออเดอร์อยู่ขั้นไหน") — การ์ดประวัติเดิม derive จาก state machine จึงตอบผิดคำถามมาตลอด
//
// pure module — ห้าม import prisma/server-only (ใช้ทั้งฝั่ง server เขียน event และ client เรนเดอร์)

import { formatDateTimeTH } from './format-date'
import type { OrderVocab } from './seller-menu'

/** ประเภทเหตุการณ์ทั้งหมด — ต้องตรงกับ CHECK constraint `OrderEvent_type_check` ในฐานข้อมูลเป๊ะ */
export const ORDER_EVENT_TYPES = [
  'ORDER_CREATED',
  'ORDER_EDITED',
  'ORDER_CANCELLED',
  'TRACKING_ADDED',
  'SHIPMENT_CREATED',
  'SHIPMENT_CANCELLED',
  'SHIPMENT_LINKED',
  'SMS_LINK_SENT',
  'BUYER_CONFIRMED',
  'COD_SETTLED',
  'SYSTEM_CONFIRMED',
  'PAYMENT_METHOD_SYNCED',
  'ORDER_DATE_CHANGED',
  // feature 00039 — ผู้ซื้อทักท้วงว่ายังไม่ได้ของ/ของไม่ตรง (กันระบบปิดงานอัตโนมัติ)
  'ORDER_DISPUTE_OPENED',
  'ORDER_DISPUTE_RESOLVED',
  // feature 00041 — instrumentation ของ Login Completion Rate (SRS TFR-013)
  // 🛑 สองค่านี้ **ไม่แสดงในไทม์ไลน์ที่ผู้ใช้เห็น** — getOrderEvents() กรองออกที่จุดเดียว
  // (ถ้าเผลอเอาออกจากตัวกรอง ประวัติออเดอร์จะรกด้วยเหตุการณ์ที่ไม่มีความหมายกับร้าน)
  // AUTH_FLOW_STARTED เขียนโดย guest ที่ยังไม่ล็อกอิน ⇒ actorUserId เป็น null เสมอ
  'AUTH_FLOW_STARTED',
  'AUTH_FLOW_COMPLETED',
  // feature 00056 — ระบบคืนของ (ใบคืนไม่ใช่ออเดอร์ใบใหม่ ประวัติจึงต้องอยู่บนใบเดิม)
  'RETURN_REQUESTED',
  'RETURN_SHIPPED',
  'RETURN_RECEIVED',
  'RETURN_CANCELLED',
  // feature 00062 — นัดรับสินค้า + ยืนยันรับเงินโอน (U8/U9) — DB CHECK ขยายแล้วที่ migration
  // 20260828120000_order_event_pickup_payment_types (ยืนยันก่อนเพิ่มค่า 4 ตัวนี้)
  'HANDED_OVER',
  'HANDOVER_REVERTED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_CONFIRM_REVERTED',
  // feature 00073 — ร้านบริการปิดงาน / เปิดงานอีกครั้ง (ขั้น 3 ของ flow 4 ขั้น)
  // DB CHECK ขยายที่ migration 20261011120000_service_closed_at
  'SERVICE_CLOSED',
  'SERVICE_REOPENED',
  // feature 00078 — ร้านบริการกด "เริ่มงาน" + ผลแจ้งลูกค้าอัตโนมัติ (ledger เป็น SSOT ของผลส่ง · event นี้เป็นภาพบนไทม์ไลน์)
  // DB CHECK ขยายที่ migration 20261017100300_order_event_auto_notify_types
  'SERVICE_STARTED',
  'AUTO_NOTICE_SENT',
  'AUTO_NOTICE_FAILED',
  // feature 00080 — ส่งเอง: ร้านกด "จัดส่งแล้ว" / "ส่งสำเร็จ" (แยกจาก BUYER_CONFIRMED/SYSTEM_CONFIRMED — BR-MS-21)
  // DB CHECK ขยายที่ migration 20261018100200_order_event_manual_dispatch_types
  'MANUAL_DISPATCHED',
  'SELLER_DELIVERED',
  // TD-010 — เลิกทำ "จัดส่งแล้ว" ภายในหน้าต่างเวลา · DB CHECK: 20261018100300_order_event_manual_dispatch_undone
  'MANUAL_DISPATCH_UNDONE',
  // feature 00085 — ร้านปิด/เลิกปิดพัสดุที่มีปัญหา · DB CHECK: 20261026100100_00085_order_event_parcel_close_types
  'PARCEL_PROBLEM_CLOSED',
  'PARCEL_PROBLEM_REOPENED',
  // feature 00086 P3 — ผู้รับผิดชอบงาน (มอบ/รับ/ยกเลิก) + ขั้น "ทำเสร็จแล้ว" ของร้านบริการ
  // DB CHECK: 20261027100600_00086_order_event_staff_types
  'SERVICE_ASSIGNED',
  'SERVICE_CLAIMED',
  'SERVICE_UNASSIGNED',
  'SERVICE_FINISHED',
] as const

export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number]

/**
 * ข้อความ + ไอคอน + โทนสีจุดต่อประเภทเหตุการณ์
 *
 * tone ใช้กับ "จุด" บนไทม์ไลน์เท่านั้น: ธีมต้นทางระบายจุดของทุกเหตุการณ์ที่ผ่านมาแล้วเป็นเขียวหมด
 * ซึ่งผิดกฎ Verified-Means-Green ของเรา (เขียว = ยืนยันสำเร็จเท่านั้น) — ที่นี่เขียวสงวนให้
 * ผู้ซื้อยืนยันรับของ, แดงให้การยกเลิก, ที่เหลือเป็นกลาง
 */
export const ORDER_EVENT_META: Record<
  OrderEventType,
  { label: string; icon: string; tone: 'neutral' | 'success' | 'danger' }
> = {
  // instrumentation 2 ตัวนี้ถูกกรองออกก่อนถึงหน้าจอเสมอ — label มีไว้เผื่อกรณีที่มันหลุดมา
  // จริง ๆ จะได้อ่านออกว่าคืออะไร ไม่ใช่โผล่เป็นรหัสดิบ (TypeScript บังคับให้มีครบทุกค่าอยู่แล้ว)
  AUTH_FLOW_STARTED: { label: 'เริ่มเข้าสู่ระบบจากลิงก์', icon: 'login', tone: 'neutral' },
  AUTH_FLOW_COMPLETED: { label: 'เข้าสู่ระบบจากลิงก์สำเร็จ', icon: 'login', tone: 'neutral' },
  ORDER_CREATED: { label: 'สร้างคำสั่งซื้อ', icon: 'file-plus', tone: 'neutral' },
  ORDER_EDITED: { label: 'แก้ไขคำสั่งซื้อ', icon: 'edit', tone: 'neutral' },
  ORDER_CANCELLED: { label: 'ยกเลิกคำสั่งซื้อ', icon: 'ban', tone: 'danger' },
  TRACKING_ADDED: { label: 'แจ้งเลขพัสดุ', icon: 'truck', tone: 'neutral' },
  SHIPMENT_CREATED: { label: 'เปิดพัสดุกับขนส่ง', icon: 'package', tone: 'neutral' },
  SHIPMENT_CANCELLED: { label: 'ยกเลิกพัสดุ', icon: 'package-off', tone: 'danger' },
  SHIPMENT_LINKED: { label: 'ผูกพัสดุที่มีอยู่แล้ว', icon: 'link', tone: 'neutral' },
  SMS_LINK_SENT: { label: 'ส่งลิงก์ทาง SMS', icon: 'message-forward', tone: 'neutral' },
  BUYER_CONFIRMED: { label: 'ผู้ซื้อยืนยันรับของ', icon: 'circle-check', tone: 'success' },
  // เขียวได้ทั้งคู่: เงินเข้าจริงและคำสั่งซื้อจบจริง = ข้อเท็จจริงที่ตรวจสอบได้ ไม่ใช่การเดา
  // แยกจาก BUYER_CONFIRMED โดยเจตนา (BR-ISHIP-47) — ไทม์ไลน์ต้องตอบได้ว่าใครเป็นคนยืนยัน
  // ถ้าใช้ BUYER_CONFIRMED แทนจะกลายเป็นบันทึกว่าผู้ซื้อกด ทั้งที่ผู้ซื้อไม่ได้แตะอะไรเลย
  COD_SETTLED: { label: 'ขนส่งโอนเงินเก็บปลายทางแล้ว', icon: 'coin', tone: 'success' },
  SYSTEM_CONFIRMED: { label: 'ระบบยืนยันคำสั่งซื้ออัตโนมัติ', icon: 'circle-check', tone: 'success' },
  // neutral ไม่ใช่ success — นี่คือการแก้ข้อมูลให้ตรงความจริง ไม่ใช่ความสำเร็จของธุรกรรม
  PAYMENT_METHOD_SYNCED: { label: 'ปรับวิธีชำระเงินตามพัสดุ', icon: 'coin', tone: 'neutral' },
  // feature 00033 — เลื่อนวันที่คำสั่งซื้อ = ย้ายยอดข้ามงวด ผู้ตรวจสอบต้องเห็นแยกจาก ORDER_EDITED
  ORDER_DATE_CHANGED: { label: 'เปลี่ยนวันที่คำสั่งซื้อ', icon: 'calendar-event', tone: 'neutral' },
  // feature 00039 — neutral ทั้งคู่โดยเจตนา ไม่ใช่ danger
  // การที่ผู้ซื้อทักท้วงไม่ได้แปลว่าร้านผิด และไทม์ไลน์นี้เป็นหลักฐานที่ทั้งสองฝ่ายเห็น
  // ถ้าระบายแดงตั้งแต่เปิดเรื่อง = ระบบตัดสินไปแล้วก่อนใครตรวจ
  ORDER_DISPUTE_OPENED: { label: 'ผู้ซื้อแจ้งว่ายังไม่ได้รับของ', icon: 'alert-circle', tone: 'neutral' },
  ORDER_DISPUTE_RESOLVED: { label: 'ปิดเรื่องที่ผู้ซื้อแจ้งไว้', icon: 'circle-check', tone: 'neutral' },
  // feature 00056 — ระบบคืนของ · โทน: ขอคืน/ส่งคืน = neutral (ยังไม่จบ) · รับคืนแล้ว = danger
  // (มีผลทางบัญชี ยอดขายหาย) · ยกเลิกเรื่องคืน = neutral (กลับไปเหมือนไม่มีอะไรเกิดขึ้น)
  RETURN_REQUESTED: { label: 'ลูกค้าขอคืนของ', icon: 'arrow-back-up', tone: 'neutral' },
  RETURN_SHIPPED: { label: 'ส่งของคืนแล้ว', icon: 'truck-return', tone: 'neutral' },
  RETURN_RECEIVED: { label: 'ร้านรับของคืนแล้ว', icon: 'package-import', tone: 'danger' },
  RETURN_CANCELLED: { label: 'ยกเลิกเรื่องคืนของ', icon: 'circle-x', tone: 'neutral' },
  // feature 00062 — นัดรับสินค้า (FR-PKP-03) — neutral ไม่ใช่ success: มอบของแล้วยังไม่เท่ากับ
  // ปิดงาน (Order.status ยังเป็น PENDING ต่อ) เขียวสงวนให้ BUYER_CONFIRMED เท่านั้น
  HANDED_OVER: { label: 'มอบสินค้าแล้ว', icon: 'package-export', tone: 'neutral' },
  HANDOVER_REVERTED: { label: 'ยกเลิกการยืนยันมอบสินค้า', icon: 'package-off', tone: 'neutral' },
  // feature 00062 — ยืนยันรับเงินโอน (FR-PAY-01) — neutral ไม่ใช่ success โดยเจตนา: ต่างจาก
  // COD_SETTLED ตรงที่ไม่มีบุคคลที่สาม (ขนส่ง) ยืนยันเงินเข้า เป็น self-report ของร้านล้วน
  // (BRD §4.2/SRS TFR-007) — ห้าม mirror สีเขียวของ CodCard.tsx ที่จุดนี้
  PAYMENT_CONFIRMED: { label: 'ร้านยืนยันได้รับเงินแล้ว', icon: 'coin', tone: 'neutral' },
  PAYMENT_CONFIRM_REVERTED: { label: 'ยกเลิกการยืนยันรับเงิน', icon: 'coin', tone: 'neutral' },
  // feature 00073 — neutral ไม่ใช่ success: ร้านปิดงานเป็นการรายงานของร้านเอง (นับเงินภายใน)
  // เขียวสงวนให้ลูกค้ายืนยันรับบริการ (BUYER_CONFIRMED) ซึ่งเป็นหลักฐานบนโปรไฟล์สาธารณะ
  // 00082: "ปิดงาน" (เดิม "ร้านปิดงาน") — ลูกค้ากดยืนยันแล้วระบบปิดให้ได้ด้วย ⇒ ใครปิดบอกที่ผู้กระทำ + บรรทัดรายละเอียด
  SERVICE_CLOSED: { label: 'ปิดงาน', icon: 'clipboard-check', tone: 'neutral' },
  SERVICE_REOPENED: { label: 'เปิดงานอีกครั้ง', icon: 'clipboard-x', tone: 'neutral' },
  // feature 00078 — neutral ทั้งหมด: เริ่มงาน/แจ้งลูกค้าเป็นข้อเท็จจริงของร้าน ไม่ใช่ความสำเร็จของธุรกรรม
  // AUTO_NOTICE_FAILED ไม่ใช้ danger — แจ้งไม่สำเร็จไม่ได้ทำให้ออเดอร์เสีย (ผลละเอียดอยู่ที่ ledger)
  // 00086 critique P1-4 — "เริ่มงาน" ไม่ใช่ "ร้านเริ่มงาน": คนกดอาจเป็นช่างที่มีชื่ออยู่บรรทัด "โดย …" (ชุดเดียวกับ ทำเสร็จแล้ว/รับงานนี้)
  SERVICE_STARTED: { label: 'เริ่มงาน', icon: 'player-play', tone: 'neutral' },
  AUTO_NOTICE_SENT: { label: 'ระบบแจ้งลูกค้าในแชทแล้ว', icon: 'message-check', tone: 'neutral' },
  AUTO_NOTICE_FAILED: { label: 'แจ้งลูกค้าในแชทไม่สำเร็จ', icon: 'message-off', tone: 'neutral' },
  // feature 00080 — neutral ทั้งคู่: SELLER_DELIVERED เป็นคำรายงานของร้านเอง ไม่ใช่หลักฐานจากบุคคลที่สาม (เขียวสงวน BUYER_CONFIRMED)
  MANUAL_DISPATCHED: { label: 'แจ้งจัดส่งแล้ว (ส่งเอง)', icon: 'truck-delivery', tone: 'neutral' },
  SELLER_DELIVERED: { label: 'ร้านยืนยันส่งสำเร็จ', icon: 'package-import', tone: 'neutral' },
  MANUAL_DISPATCH_UNDONE: { label: 'เลิกทำแจ้งจัดส่ง (ส่งเอง)', icon: 'arrow-back-up', tone: 'neutral' },
  PARCEL_PROBLEM_CLOSED: { label: 'ปิดพัสดุที่มีปัญหา', icon: 'package-off', tone: 'neutral' },
  PARCEL_PROBLEM_REOPENED: { label: 'เลิกปิดพัสดุ', icon: 'arrow-back-up', tone: 'neutral' },
  // feature 00086 — neutral ทั้งหมด: มอบ/รับ/ทำเสร็จเป็นข้อเท็จจริงภายในร้าน ไม่ใช่หลักฐานจากลูกค้า
  // "ทำเสร็จแล้ว" ไม่ใช่ success — ยังไม่ปิดงาน ยังไม่นับเงิน (FR-010 · เขียวสงวน BUYER_CONFIRMED)
  SERVICE_ASSIGNED: { label: 'มอบงาน', icon: 'user-cog', tone: 'neutral' },
  SERVICE_CLAIMED: { label: 'รับงานนี้', icon: 'user-check', tone: 'neutral' },
  SERVICE_UNASSIGNED: { label: 'ยกเลิกผู้รับผิดชอบ', icon: 'user-x', tone: 'neutral' },
  SERVICE_FINISHED: { label: 'ทำเสร็จแล้ว', icon: 'circle-check', tone: 'neutral' },
}

/**
 * ผันเฉพาะ 3 event ที่เป็น order-lifecycle ทั่วไป (feature 00030 BR-BKU-09) — ที่เหลือ
 * (โดเมนพัสดุ/SMS/BUYER_CONFIRMED) ไม่ผัน ตาม BR-BKU-11 คืน label static เดิม
 *
 * ORDER_CREATED ใช้ vocab.createLabel ตรง ๆ ไม่ใช่ "สร้าง"+noun — LODGING ผันเป็น
 * "เปิดบิลเข้าพัก" ไม่ใช่ "สร้างบิลเข้าพัก" (UX-Copy.md §3)
 */
export function resolveOrderEventLabel(
  type: OrderEventType,
  vocab: { noun: string; createLabel: string },
  /**
   * คลังคำเต็มของร้านบริการ — ส่งเฉพาะ SERVICE_QUEUE เท่านั้น (user 2026-10-10: ร้านบริการต้องไม่เห็นคำร้านขายของ)
   * ไม่ส่ง = คำกลางเดิมเป๊ะ ทั้ง ONLINE_SALES และ LODGING (LODGING ยังไม่ได้ทบทวน)
   * ทำไมไม่เช็ก vocab.buyerNoun !== 'ผู้ซื้อ' เอา: LODGING ใช้คำเดิมเหมือนกัน แต่ noun ต่างกัน ต้องแยกด้วยธงที่ชัด
   */
  service?: OrderVocab,
): string {
  if (service) {
    switch (type) {
      case 'BUYER_CONFIRMED':
        return service.buyerConfirmedStepLabel
      case 'SYSTEM_CONFIRMED':
        return `ระบบยืนยัน${service.noun}อัตโนมัติ`
      // dateLabel ไม่ใช่ "วันที่"+noun — ห้ามชนกับวันนัด/serviceStart (ดูคอมเมนต์ที่ ORDER_VOCAB.dateLabel)
      case 'ORDER_DATE_CHANGED':
        return `เปลี่ยน${service.dateLabel}`
      case 'ORDER_DISPUTE_OPENED':
        return `${service.buyerNoun}แจ้งว่ายังไม่ได้รับบริการ`
      case 'ORDER_DISPUTE_RESOLVED':
        return `ปิดเรื่องที่${service.buyerNoun}แจ้งไว้`
    }
  }
  switch (type) {
    case 'ORDER_CREATED':
      return vocab.createLabel
    case 'ORDER_EDITED':
      return `แก้ไข${vocab.noun}`
    case 'ORDER_CANCELLED':
      return `ยกเลิก${vocab.noun}`
    default:
      return ORDER_EVENT_META[type].label
  }
}

/**
 * meta ที่หน้าจอใช้จริง — ตั้งใจแคบมาก
 * [สำคัญ] ห้ามเพิ่ม key ที่มี PII ผู้ซื้อ (เบอร์/อีเมล/ที่อยู่) เด็ดขาด ไม่ว่าเหตุการณ์ประเภทไหน
 * ร้านมีพนักงานหลายคนเปิดดูประวัติได้ และหน้า (paces) อยู่ใต้ client layout ทุก field ที่ส่งไป
 * แสดงผลจะไปโผล่ใน flight payload ที่เปิดดูได้
 */
export type OrderEventMeta = {
  /** ชื่อผู้กระทำ ณ เวลาที่เกิดเหตุการณ์ — freeze ไว้ ไม่ live-join */
  actorNameSnapshot?: string
  /** ชื่อขนส่ง (SHIPMENT_*) หรือชื่อที่ร้านกรอกเอง (TRACKING_ADDED) — ไม่ใช่ PII */
  courierName?: string
  provider?: string
  /** ผูกกลับ OrderShipment.id — กันนับซ้ำตอน backfill ออเดอร์ที่เปิดพัสดุหลายรอบ */
  shipmentId?: string
  /** 'seller' | 'buyer' — ใช้ตอนไม่รู้ว่าใครกด รู้แค่ฝั่งไหน */
  initiatorRole?: string
  /** จำนวน field ที่เปลี่ยนใน ORDER_EDITED (ไม่ส่งค่าจริงมาให้หน้าจอ) */
  changedCount?: number
  /** แถวนี้เกิดจาก backfill ย้อนหลัง ไม่ใช่บันทึกสด — ใช้บอกผู้ใช้ว่าข้อมูลอาจไม่ครบ */
  backfilled?: boolean
  /** ยอดเงินบาท (COD_SETTLED / PAYMENT_METHOD_SYNCED) */
  amount?: number
  /** วิธีชำระเงินเดิมก่อนถูกปรับ (PAYMENT_METHOD_SYNCED) — null = ไม่เคยระบุไว้ */
  paymentFrom?: string | null
  /** feature 00033 — วันที่สั่งซื้อที่ผู้ขายระบุ ใส่เฉพาะตอนที่ต่างจากเวลาจริงที่กด (ORDER_CREATED) */
  orderedAt?: string
  /** feature 00033 — วันที่สั่งซื้อเดิมก่อนแก้ (ORDER_DATE_CHANGED) */
  orderedAtFrom?: string
  /** feature 00033 — วันที่สั่งซื้อใหม่หลังแก้ (ORDER_DATE_CHANGED) */
  orderedAtTo?: string
  /** feature 00039 — เหตุผลที่ระบบยืนยันให้เอง (SYSTEM_CONFIRMED)
   *  'AUTO_CONFIRM_DELIVERED' = ส่งถึงแล้วและพ้นระยะทักท้วง · ค่าเดิมที่ไม่ระบุ = COD settled
   *  แยกด้วย meta ไม่ใช่ด้วยชนิด event เพราะ "เกิดอะไรขึ้น" เหมือนกัน ต่างแค่ "เพราะอะไร" */
  reason?: string
  /** feature 00039 — เวลาที่ขนส่งรายงานว่าส่งถึง (SYSTEM_CONFIRMED แบบ AUTO_CONFIRM_DELIVERED) */
  deliveredAt?: string | null
  /** feature 00039 — ผลของการปิดข้อพิพาท (ORDER_DISPUTE_RESOLVED)
   *  feature 00073 — ผลของการปิดงาน (SERVICE_CLOSED): 'SERVED' | 'NO_SHOW' */
  outcome?: string
  /** feature 00073 — มัดจำตอนปิดงานแบบไม่มาตามนัด (SERVICE_CLOSED): 'KEPT' | 'REFUNDED' */
  deposit?: string
  /** feature 00082 — ระบบปิดให้เพราะลูกค้ายืนยันรับบริการ (SERVICE_CLOSED): 'BUYER' · ไม่มี = ร้านกดปิด */
  closedBy?: string
  /** feature 00085 — เหตุผลปิดพัสดุ (PARCEL_PROBLEM_CLOSED): FIRE | LOST | DAMAGED | OTHER · `outcome` ใช้ร่วมกับด้านบน */
  closeReason?: string
  /** feature 00085 — หมายเหตุเฉพาะ OTHER · ไม่ใช่ PII ผู้ซื้อ (ร้านพิมพ์เอง ≤200) */
  closeNote?: string
  /** feature 00085 — ฐานเวลาที่ใช้ตัดสินยอดขาย: DELIVERED_AT | EVENT | ORDER_CONFIRMED | NONE */
  basis?: string
  /** feature 00085 — ร้านระบุว่าคืนเงินแล้ว (null/ไม่มี = ไม่ได้ถาม) */
  refunded?: boolean | null
  /**
   * feature 00086 — ชื่อผู้รับผิดชอบ ณ ตอนมอบ/รับ (SERVICE_ASSIGNED · SERVICE_CLAIMED) · ชื่อพนักงาน ไม่ใช่ PII ผู้ซื้อ
   * ผู้ซื้อไม่เห็น OrderEvent เลย (getOrderEvents เรียกฝั่งร้านเท่านั้น) ⇒ ไม่หลุดถึงลูกค้า
   */
  assigneeNameSnapshot?: string
  /** feature 00086 — ผู้รับผิดชอบคนก่อน (SERVICE_ASSIGNED แบบเปลี่ยนคน · SERVICE_UNASSIGNED) */
  previousAssigneeNameSnapshot?: string
  /** feature 00086 — จำนวนรูปที่แนบตอนเริ่ม/ทำเสร็จ (SERVICE_STARTED · SERVICE_FINISHED) — ตัวรูปอยู่ที่ ServiceJobRecord */
  photoCount?: number
  /**
   * feature 00086 — มีบันทึกไหม (SERVICE_STARTED · SERVICE_FINISHED)
   * 🛑 ตัวข้อความบันทึกอยู่ที่ ServiceJobRecord.note เท่านั้น ห้ามใส่ใน meta (ข้อความอิสระอาจมีข้อมูลลูกค้า · SDS TD-006)
   */
  hasNote?: boolean
  // SERVICE_UNASSIGNED ใช้ `reason` ด้านบนร่วมกัน: 'MANUAL' (กดยกเลิกเอง) | 'MEMBER_REMOVED' (ถูกลบออกจากร้าน)
  //   | 'ROLE_REMOVED' (ยังอยู่ในร้านแต่ไม่ได้ถือ "ช่าง" แล้ว — 00086 P3)
}

export type OrderEventView = {
  id: string
  type: OrderEventType
  meta: OrderEventMeta
  occurredAtISO: string
  /** ชื่อผู้กระทำที่พร้อมแสดง — resolve ที่ server แล้ว (null = ระบบทำเอง) */
  actorLabel: string | null
  actorAvatar: string | null
}

/**
 * describeOrderEvent — คำอธิบายบรรทัดรองของแต่ละเหตุการณ์ (null = ไม่ต้องมีบรรทัดรอง)
 * แยกจาก label เพราะ label ตอบว่า "เกิดอะไร" ส่วนอันนี้ตอบว่า "รายละเอียดคืออะไร"
 */
export function describeOrderEvent(
  e: Pick<OrderEventView, 'type' | 'meta'>,
  /** ส่งเฉพาะร้านบริการ — ดู resolveOrderEventLabel */
  service?: OrderVocab,
): string | null {
  switch (e.type) {
    case 'ORDER_CREATED':
      // บรรทัดรองโผล่เฉพาะออเดอร์ที่ลงวันที่ย้อนหลัง/ล่วงหน้า — ออเดอร์ปกติไม่มี meta.orderedAt
      return e.meta.orderedAt ? `ลง${service ? service.dateLabel : 'วันที่สั่งซื้อ'} ${formatDateTimeTH(e.meta.orderedAt)}` : null
    case 'ORDER_DATE_CHANGED':
      // มีคำว่า "จาก/เป็น" ไม่ใช่ลูกศรเปล่า — ลูกศรอย่างเดียวให้ผู้อ่านเดาทิศเอง และ screen reader
      // อ่านไม่ออกว่ามันแปลว่าอะไร (impeccable clarify 2026-08-06)
      return e.meta.orderedAtFrom && e.meta.orderedAtTo
        ? `จาก ${formatDateTimeTH(e.meta.orderedAtFrom)} เป็น ${formatDateTimeTH(e.meta.orderedAtTo)}`
        : null
    case 'TRACKING_ADDED':
      return e.meta.provider ? `ขนส่ง: ${e.meta.provider}` : null
    case 'SHIPMENT_CREATED':
    case 'SHIPMENT_CANCELLED':
    case 'SHIPMENT_LINKED':
      return e.meta.courierName ? `ขนส่ง: ${e.meta.courierName}` : null
    case 'ORDER_EDITED':
      return e.meta.changedCount ? `แก้ไข ${e.meta.changedCount} รายการ` : null
    case 'COD_SETTLED':
      return typeof e.meta.amount === 'number'
        ? `฿${e.meta.amount.toLocaleString('th-TH')}`
        : null
    case 'SYSTEM_CONFIRMED':
      // บอกเหตุผลเสมอ ไม่ใช่แค่ "ระบบยืนยัน" ลอย ๆ — ร้านต้องตรวจสอบย้อนหลังได้ว่าทำไม
      return 'ขนส่งยืนยันว่าเก็บเงินปลายทางและโอนเข้าร้านแล้ว'
    case 'PAYMENT_METHOD_SYNCED':
      // บอกทั้งค่าเดิมและเหตุผล — ร้านต้องเห็นว่าอะไรถูกเปลี่ยนไปจากที่ตัวเองกรอกไว้
      return e.meta.paymentFrom
        ? `จาก "${e.meta.paymentFrom}" เป็นเก็บเงินปลายทาง ตามยอดบนพัสดุ`
        : 'ตั้งเป็นเก็บเงินปลายทาง ตามยอดบนพัสดุ'
    case 'ORDER_CANCELLED':
      // ไม่รู้ตัวคนแต่รู้ฝั่ง — บอกเท่าที่รู้จริง ดีกว่าเว้นว่างให้เดาเอง
      if (!e.meta.actorNameSnapshot && e.meta.initiatorRole) {
        return e.meta.initiatorRole === 'buyer' ? `ยกเลิกโดย${service ? service.buyerNoun : 'ผู้ซื้อ'}` : 'ยกเลิกโดยร้าน'
      }
      return null
    case 'SERVICE_CLOSED': {
      // บอกผล + มัดจำ + ยอดที่รับตอนปิด — ร้านตรวจย้อนหลังได้ว่าปิดแบบไหน (ไม่ใช่แค่ "ปิดงาน" ลอย ๆ)
      const parts: string[] = []
      if (e.meta.outcome === 'NO_SHOW') {
        parts.push('ไม่มาตามนัด')
        if (e.meta.deposit === 'KEPT') parts.push('เก็บมัดจำ')
        if (e.meta.deposit === 'REFUNDED') parts.push('คืนมัดจำ')
      } else if (e.meta.outcome === 'SERVED') {
        parts.push('ให้บริการแล้ว')
      }
      if (e.meta.closedBy === 'BUYER') parts.unshift(`ปิดให้อัตโนมัติเมื่อ${service ? service.buyerNoun : 'ลูกค้า'}ยืนยันรับบริการ`)
      if (typeof e.meta.amount === 'number' && e.meta.amount > 0) {
        parts.push(`รับเงิน ฿${e.meta.amount.toLocaleString('th-TH')}`)
      }
      if (e.meta.backfilled) parts.push('บันทึกย้อนหลัง')
      return parts.length ? parts.join(' · ') : null
    }
    // feature 00086 — ใครทำ อยู่ที่ป้ายผู้กระทำแล้ว · บรรทัดนี้บอก "ให้ใคร/จากใคร" และ "แนบอะไรมา"
    case 'SERVICE_ASSIGNED': {
      if (!e.meta.assigneeNameSnapshot) return null
      const to = `มอบงานให้ ${e.meta.assigneeNameSnapshot}`
      return e.meta.previousAssigneeNameSnapshot ? `${to} · แทน ${e.meta.previousAssigneeNameSnapshot}` : to
    }
    case 'SERVICE_UNASSIGNED': {
      const prev = e.meta.previousAssigneeNameSnapshot
      // 00086 P3 — ยังอยู่ในร้านแต่ไม่ได้ถือ "ช่าง" แล้ว (แก้บทบาท/เลื่อนเป็นเจ้าของ) ⇒ ระบบปลดให้เอง
      // ประโยคเดียวมีชื่ออยู่แล้ว — ไม่ต่อ "เดิม {ชื่อ}" ซ้ำ
      if (e.meta.reason === 'ROLE_REMOVED') return prev ? `${prev} ไม่ได้เป็นช่างแล้ว` : 'ผู้รับผิดชอบไม่ได้เป็นช่างแล้ว'
      const parts: string[] = []
      if (prev) parts.push(`เดิม ${prev}`)
      if (e.meta.reason === 'MEMBER_REMOVED') parts.push('ถูกนำออกจากร้าน')
      return parts.length ? parts.join(' · ') : null
    }
    case 'SERVICE_STARTED':
    case 'SERVICE_FINISHED': {
      const parts: string[] = []
      if (typeof e.meta.photoCount === 'number' && e.meta.photoCount > 0) parts.push(`รูป ${e.meta.photoCount} รูป`)
      if (e.meta.hasNote) parts.push('มีบันทึก')
      return parts.length ? parts.join(' · ') : null
    }
    case 'PARCEL_PROBLEM_CLOSED': {
      const reasons: Record<string, string> = { FIRE: 'ไฟไหม้', LOST: 'สูญหาย', DAMAGED: 'เสียหาย' }
      const parts: string[] = []
      if (e.meta.closeReason === 'OTHER') parts.push(e.meta.closeNote ? `เหตุผล: ${e.meta.closeNote}` : 'เหตุผล: อื่น ๆ')
      else if (e.meta.closeReason && reasons[e.meta.closeReason]) parts.push(`เหตุผล: ${reasons[e.meta.closeReason]}`)
      if (e.meta.outcome === 'DELIVERY_FAILED') parts.push('ส่งไม่สำเร็จ')
      if (e.meta.outcome === 'LOST_ON_RETURN') parts.push('สูญหายระหว่างตีกลับ')
      if (e.meta.refunded === true) parts.push('คืนเงินแล้ว')
      return parts.length ? parts.join(' · ') : null
    }
    default:
      return null
  }
}

/** ป้ายผู้กระทำที่จะแสดง — null actor = ระบบทำเอง (ห้าม fallback เป็นเจ้าของร้าน) */
export function resolveActorLabel(
  actor: { displayName: string | null; username: string | null } | null,
  meta: OrderEventMeta,
): string | null {
  if (actor) return actor.displayName || actor.username || 'สมาชิกร้าน'
  // บัญชีถูกลบไปแล้ว แต่ชื่อที่ freeze ไว้ยังอยู่ — ต่างจาก "ระบบทำเอง" ที่ไม่มี snapshot เลย
  if (meta.actorNameSnapshot) return meta.actorNameSnapshot
  return null
}
