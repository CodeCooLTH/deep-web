/**
 * service-status.ts — ป้ายสถานะชุดเดียวของ "งานร้านบริการ" (feature 00073 · PRD §3.3)
 *
 * แทนชุดเดิม 4 ชุดที่พูดคนละคำ (resolveServiceOrderBadge · getServiceTimeline ·
 * APPOINTMENT_STATUS_LABEL · ไทล์ #141) — ทุกจอของร้านบริการ ทั้งฝั่งร้านและฝั่งลูกค้า อ่านจากที่นี่
 *
 * 🛑 ใช้กับร้าน SERVICE_QUEUE เท่านั้น — ผู้เรียกต้องเช็ก `usesServiceFinanceRules(vertical)` ก่อน
 *    ร้านขายของ/ที่พักใช้ ORDER_STATUS_META เดิม (มติ user 2026-10-11: กติกาเดิมคือค่าตั้งต้นถาวร)
 * 🛑 คำของงานบริการ (งาน/นัด/ปิดงาน/รับบริการ) — ห้ามคำของร้านขายของ (จัดส่ง/ได้รับสินค้า)
 *
 * pure module — ใช้ได้ทั้ง server และ client
 */
import { ORDER_STATUS_META, type OrderStatusTone } from './order-display'
import { usesServiceFinanceRules } from './finance-rules'

/** 10 ป้ายตาม PRD + 2 สถานะหายากที่ยังต้องมีคำ (ร่างจากแชท · คืนเงินทั้งใบ) */
export const SERVICE_STATUS_KEYS = [
  'BOOKED', // 1 จองแล้ว (มีนัด)
  'WALK_IN', // 1 รับงานแล้ว (ไม่มีนัด)
  'RESCHEDULE_REQUESTED', // 2 ลูกค้าขอเลื่อน
  'APPOINTMENT_CONFIRMED', // 2 ลูกค้ายืนยันนัด
  'CLOSED_PAID', // 3 ปิดงานแล้ว · ชำระครบ
  'CLOSED_OUTSTANDING', // 3 ปิดงานแล้ว · ค้าง ฿X
  'NO_SHOW', // 3 ไม่มาตามนัด
  'BUYER_CONFIRMED_AWAITING_CLOSE', // 4 ก่อน 3 — ลูกค้ายืนยันแล้ว รอร้านปิดงาน
  'DONE', // 4 สำเร็จ
  'CANCELLED', // ยกเลิก (ก่อนปิดงานเท่านั้น)
  'RETURNED', // คืนเงินทั้งใบ (00067)
  'DRAFTED', // ร่างจากแชท (00061)
] as const

export type ServiceStatusKey = (typeof SERVICE_STATUS_KEYS)[number]

export type ServiceStatusMeta = {
  /** คำฝั่งร้าน */
  seller: string
  /** คำฝั่งลูกค้า (หน้า /o/{token} และรายการคำสั่งของลูกค้า) */
  buyer: string
  cls: string
  icon: string
  tone: OrderStatusTone
}

/**
 * สี: เขียว = ข้อเท็จจริงที่ยืนยันแล้วเท่านั้น (สำเร็จ · รับเงินครบ) · ฟ้า/primary = เดินหน้าอยู่
 * เหลือง = รอใครสักคนทำอะไร · แดง = จบแบบไม่ได้ให้บริการ
 * ไอคอน: ใช้ชุดที่ระบบใช้อยู่แล้วกับสถานะเดียวกัน (HR12 — ไม่คิดไอคอนใหม่เอง)
 */
export const SERVICE_STATUS_META: Record<ServiceStatusKey, ServiceStatusMeta> = {
  BOOKED: { seller: 'จองแล้ว', buyer: 'จองบริการแล้ว', cls: 'bg-warning/15 text-warning-ink', icon: 'calendar-event', tone: 'warning' },
  WALK_IN: { seller: 'รับงานแล้ว', buyer: 'รับงานแล้ว', cls: 'bg-warning/15 text-warning-ink', icon: 'clock', tone: 'warning' },
  RESCHEDULE_REQUESTED: { seller: 'ลูกค้าขอเลื่อน', buyer: 'ขอเลื่อนนัดแล้ว', cls: 'bg-info/15 text-info-ink', icon: 'repeat', tone: 'info' },
  APPOINTMENT_CONFIRMED: { seller: 'ลูกค้ายืนยันนัด', buyer: 'ยืนยันนัดแล้ว', cls: 'bg-primary/15 text-primary-ink', icon: 'calendar-check', tone: 'info' },
  CLOSED_PAID: { seller: 'ปิดงานแล้ว · ชำระครบ', buyer: 'ร้านให้บริการแล้ว', cls: 'bg-success/15 text-success-ink', icon: 'circle-check', tone: 'success' },
  // seller ของตัวนี้มียอดค้างต่อท้าย — ใช้ serviceStatusLabel() เสมอ ห้ามอ่าน .seller ตรง ๆ
  CLOSED_OUTSTANDING: { seller: 'ปิดงานแล้ว · ค้างชำระ', buyer: 'ร้านให้บริการแล้ว', cls: 'bg-warning/15 text-warning-ink', icon: 'cash-banknote', tone: 'warning' },
  NO_SHOW: { seller: 'ไม่มาตามนัด', buyer: 'ไม่ได้เข้ารับบริการ', cls: 'bg-danger/15 text-danger-ink', icon: 'clock-off', tone: 'danger' },
  BUYER_CONFIRMED_AWAITING_CLOSE: { seller: 'ลูกค้ายืนยันแล้ว · รอร้านปิดงาน', buyer: 'ยืนยันรับบริการแล้ว', cls: 'bg-info/15 text-info-ink', icon: 'clock', tone: 'info' },
  DONE: { seller: 'สำเร็จ', buyer: 'สำเร็จ', cls: 'bg-success/15 text-success-ink', icon: 'circle-check-filled', tone: 'success' },
  CANCELLED: { seller: 'ยกเลิก', buyer: 'ยกเลิก', cls: ORDER_STATUS_META.CANCELLED.cls, icon: ORDER_STATUS_META.CANCELLED.icon, tone: 'danger' },
  RETURNED: { seller: 'คืนเงินทั้งใบ', buyer: 'คืนเงินแล้ว', cls: ORDER_STATUS_META.RETURNED.cls, icon: ORDER_STATUS_META.RETURNED.icon, tone: 'warning' },
  DRAFTED: { seller: ORDER_STATUS_META.DRAFTED.label, buyer: ORDER_STATUS_META.DRAFTED.label, cls: ORDER_STATUS_META.DRAFTED.cls, icon: ORDER_STATUS_META.DRAFTED.icon, tone: 'warning' },
}

export type ServiceStatusInput = {
  /** Order.status */
  status: string
  /** Order.appointmentStatus — null = ไม่มีนัด (walk-in) หรือยังไม่เคยตั้ง */
  appointmentStatus: string | null
  /** มีนัดผูกอยู่ไหม (Order.serviceStart != null) */
  hasAppointment: boolean
  /** Order.serviceClosedAt — ร้านปิดงานแล้วเมื่อไร */
  serviceClosedAt: Date | string | null
  /**
   * ยอดค้าง (จาก computeOrderMoney().outstanding) — ไม่ส่ง/null = ผู้ดูไม่มีสิทธิ์เห็นเงิน
   * (เช่น ช่าง — 00071) ⇒ ป้ายปิดงานไม่บอกเรื่องเงิน ("ปิดงานแล้ว")
   */
  outstanding?: number | null
}

/** สถานะเดียวของงานบริการ — ลำดับการตัดสินมีความหมาย อย่าสลับ */
export function deriveServiceStatus(o: ServiceStatusInput): ServiceStatusKey {
  if (o.status === 'DRAFTED') return 'DRAFTED'
  if (o.status === 'CANCELLED') return 'CANCELLED'
  if (o.status === 'RETURNED') return 'RETURNED'

  const closed = o.serviceClosedAt != null
  // ไม่มาตามนัดมาก่อนสถานะลูกค้า — ลูกค้ายืนยันงานที่ไม่มาไม่ได้ (ด่านใน confirmOrder) แต่ข้อมูลเก่าอาจมี
  if (o.appointmentStatus === 'NO_SHOW') return 'NO_SHOW'

  if (o.status === 'CONFIRMED') return closed ? 'DONE' : 'BUYER_CONFIRMED_AWAITING_CLOSE'

  if (closed || o.appointmentStatus === 'COMPLETED') {
    return o.outstanding != null && o.outstanding > 0 ? 'CLOSED_OUTSTANDING' : 'CLOSED_PAID'
  }

  if (!o.hasAppointment) return 'WALK_IN'
  if (o.appointmentStatus === 'RESCHEDULE_REQUESTED') return 'RESCHEDULE_REQUESTED'
  if (o.appointmentStatus === 'CONFIRMED_BY_BUYER') return 'APPOINTMENT_CONFIRMED'
  return 'BOOKED'
}

/** คำที่พร้อมแสดง — ใส่ยอดค้างให้ป้าย "ปิดงานแล้ว · ค้าง ฿X" */
export function serviceStatusLabel(
  key: ServiceStatusKey,
  side: 'seller' | 'buyer',
  outstanding?: number | null,
): string {
  if (side === 'seller' && key === 'CLOSED_OUTSTANDING' && outstanding != null && outstanding > 0) {
    return `ปิดงานแล้ว · ค้าง ฿${outstanding.toLocaleString('th-TH')}`
  }
  // ผู้ดูที่ไม่เห็นเงิน: "ปิดงานแล้ว" เฉย ๆ ไม่อ้างว่าชำระครบ
  if (side === 'seller' && key === 'CLOSED_PAID' && outstanding == null) return 'ปิดงานแล้ว'
  return SERVICE_STATUS_META[key][side]
}

/** badge ครบชุดในรูปเดียวกับ ORDER_STATUS_META — ใช้แทน resolveOrderStatusBadge ในจอร้านบริการ */
export function resolveServiceStatusBadge(
  o: ServiceStatusInput,
  side: 'seller' | 'buyer',
): { key: ServiceStatusKey; label: string; cls: string; icon: string; tone: OrderStatusTone } {
  const key = deriveServiceStatus(o)
  const meta = SERVICE_STATUS_META[key]
  // ปิดงานแบบไม่เห็นเงิน: โทนกลาง ไม่เขียว (ไม่รู้ว่ารับเงินครบหรือยัง)
  const neutralClosed = side === 'seller' && key === 'CLOSED_PAID' && o.outstanding == null
  return {
    key,
    label: serviceStatusLabel(key, side, o.outstanding),
    cls: neutralClosed ? 'bg-info/15 text-info-ink' : meta.cls,
    icon: meta.icon,
    tone: neutralClosed ? 'info' : meta.tone,
  }
}

/** งานนี้ร้านปิดได้ไหม (ยังไม่ปิด · ไม่ใช่ยกเลิก/คืน/ร่าง) */
export function canCloseServiceJob(o: { status: string; serviceClosedAt: Date | string | null }): boolean {
  return o.serviceClosedAt == null && (o.status === 'PENDING' || o.status === 'CONFIRMED' || o.status === 'SHIPPED')
}

/** เปิดงานอีกครั้งได้ไหม (มติ D2): ปิดแล้ว และลูกค้ายังไม่ยืนยัน */
export function canReopenServiceJob(o: { status: string; serviceClosedAt: Date | string | null }): boolean {
  return o.serviceClosedAt != null && o.status !== 'CONFIRMED' && o.status !== 'CANCELLED' && o.status !== 'RETURNED'
}

/**
 * feature 00073 (FR-012 · มติ user 2026-10-11 รอบ 2) — ส่งคะแนน = ยืนยันรับบริการ ได้ไหม
 *
 * ร้านปิดงานว่าให้บริการแล้ว + ลูกค้ายังไม่ยืนยัน ⇒ ลูกค้าให้คะแนนได้ทันที และการส่งคะแนน
 * คือการยืนยันรับบริการ (ขั้น 4) ในคำขอเดียว · โปรไฟล์สาธารณะยังนับตอนยืนยันเหมือนเดิม
 * 🛑 รับ `vertical` เข้ามาเอง (ไม่ default เปิด — permission-gate-follows-the-row) ร้านอื่นได้ false เสมอ
 */
export function reviewConfirmsServiceJob(o: {
  vertical: string
  status: string
  serviceClosedAt: Date | string | null
  appointmentStatus: string | null
}): boolean {
  if (!usesServiceFinanceRules(o.vertical)) return false
  if (o.serviceClosedAt == null) return false
  if (o.appointmentStatus === 'NO_SHOW') return false
  return o.status === 'PENDING' || o.status === 'SHIPPED'
}
