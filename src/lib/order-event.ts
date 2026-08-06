// order-event.ts — SSOT ของ "ประวัติกิจกรรมคำสั่งซื้อ" (feature 00031)
//
// ตอบคำถาม "ใครทำอะไรกับออเดอร์นี้เมื่อไหร่" ซึ่งเป็นคนละคำถามกับ Order.status
// ("ตอนนี้ออเดอร์อยู่ขั้นไหน") — การ์ดประวัติเดิม derive จาก state machine จึงตอบผิดคำถามมาตลอด
//
// pure module — ห้าม import prisma/server-only (ใช้ทั้งฝั่ง server เขียน event และ client เรนเดอร์)

import { formatDateTimeTH } from './format-date'

/** 13 ประเภทเหตุการณ์ — ต้องตรงกับ CHECK constraint `OrderEvent_type_check` ในฐานข้อมูลเป๊ะ */
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
): string {
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
export function describeOrderEvent(e: Pick<OrderEventView, 'type' | 'meta'>): string | null {
  switch (e.type) {
    case 'ORDER_CREATED':
      // บรรทัดรองโผล่เฉพาะออเดอร์ที่ลงวันที่ย้อนหลัง/ล่วงหน้า — ออเดอร์ปกติไม่มี meta.orderedAt
      return e.meta.orderedAt ? `ลงวันที่สั่งซื้อ ${formatDateTimeTH(e.meta.orderedAt)}` : null
    case 'ORDER_DATE_CHANGED':
      return e.meta.orderedAtFrom && e.meta.orderedAtTo
        ? `${formatDateTimeTH(e.meta.orderedAtFrom)} → ${formatDateTimeTH(e.meta.orderedAtTo)}`
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
        return e.meta.initiatorRole === 'buyer' ? 'ยกเลิกโดยผู้ซื้อ' : 'ยกเลิกโดยร้าน'
      }
      return null
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
