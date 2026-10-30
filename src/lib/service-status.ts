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
import { arrivalModeOf, isStoredArrivalMode, type ArrivalMode } from './arrival-mode'

/** 10 ป้ายตาม PRD + 2 สถานะหายากที่ยังต้องมีคำ (ร่างจากแชท · คืนเงินทั้งใบ) */
export const SERVICE_STATUS_KEYS = [
  'BOOKED', // 1 จองแล้ว (มีนัด)
  'WALK_IN', // 1 งานหน้าร้าน ยังไม่เริ่ม — ร้าน "รอเริ่มงาน" · ลูกค้า "รับงานแล้ว"
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
  // feature 00086 P3 — ขั้นระหว่างทำงาน (ฝั่งร้านเท่านั้น: ผู้เรียกฝั่งลูกค้าไม่ส่ง serviceStartedAt/serviceFinishedAt)
  'IN_SERVICE', // เริ่มงานแล้ว ยังไม่ทำเสร็จ
  'FINISHED_AWAITING_CLOSE', // ทำเสร็จแล้ว รอคนที่มีสิทธิ์ปิดงาน
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
  // 00086 (มติ user 2026-10-30): ฝั่งร้าน "รอเริ่มงาน" ไม่ใช่ "รับงานแล้ว" — ชนกับปุ่ม "รับงานนี้" (ช่างรับงาน)
  //   ทั้งที่ยังไม่มีใครรับ · ฝั่งลูกค้าคง "รับงานแล้ว" (= ร้านรับเรื่องแล้ว · ลูกค้าไม่มีปุ่มรับงาน)
  WALK_IN: { seller: 'รอเริ่มงาน', buyer: 'รับงานแล้ว', cls: 'bg-warning/15 text-warning-ink', icon: 'clock', tone: 'warning' },
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
  // 00086 — ฟ้า = เดินหน้าอยู่ · ทำเสร็จยังไม่ใช่เขียว (ยังไม่ปิดงาน ยังไม่นับเงิน · FR-010) → เหลือง "รอใครสักคน" ปิด
  // buyer: ไม่ถูกใช้จริง (หน้าลูกค้าไม่ส่งสองค่านี้) แต่ใส่คำงานบริการไว้กันคำร้านขายของหลุด ถ้ามีคนเผลอส่ง
  IN_SERVICE: { seller: 'กำลังให้บริการ', buyer: 'กำลังให้บริการ', cls: 'bg-primary/15 text-primary-ink', icon: 'player-play', tone: 'info' },
  FINISHED_AWAITING_CLOSE: { seller: 'ทำเสร็จ · รอปิดงาน', buyer: 'กำลังให้บริการ', cls: 'bg-warning/15 text-warning-ink', icon: 'clock', tone: 'warning' },
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
  /**
   * feature 00086 — Order.serviceStartedAt / serviceFinishedAt · ส่งเฉพาะจอฝั่งร้าน
   * ไม่ส่ง (undefined) = ผลเดิมก่อน 00086 ทุกตัวเป๊ะ (หน้าลูกค้า/รายการลูกค้าไม่ส่ง ⇒ ไม่เห็นขั้นภายในร้าน)
   */
  serviceStartedAt?: Date | string | null
  serviceFinishedAt?: Date | string | null
  /**
   * feature 00086 FR-001 — แบบการมาที่ตัดสินแล้ว (`serviceArrivalOf` / `arrivalModeOf`: ค่าที่ร้านเลือก → สูตรเดิม)
   * งานหน้าร้านตอนนี้มีเวลาเริ่ม (serviceStart) ตั้งแต่สร้าง ⇒ `hasAppointment` อย่างเดียวจะตกเป็น "จองแล้ว"
   * ส่ง 'WALK_IN' = ป้ายงานหน้าร้าน (ร้าน "รอเริ่มงาน" · ลูกค้า "รับงานแล้ว") แม้มีเวลา · ไม่ส่ง (undefined) = ผลเดิมก่อน 00086 ทุกตัวเป๊ะ
   */
  arrivalMode?: ArrivalMode | null
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

  // 00086: ขั้นระหว่างทำงานชนะป้ายนัด (จองแล้ว/ลูกค้าขอเลื่อน/ยืนยันนัด) — ลูกค้าอยู่ที่ร้านแล้ว ป้ายนัดหมดความหมาย
  //   แต่แพ้ปิดงาน/ไม่มาตามนัด/ลูกค้ายืนยัน (ข้างบน) — ปิดแล้วคือข้อเท็จจริงสุดท้าย
  if (o.serviceFinishedAt != null) return 'FINISHED_AWAITING_CLOSE'
  if (o.serviceStartedAt != null) return 'IN_SERVICE'

  if (!o.hasAppointment) return 'WALK_IN'
  // คำขอเลื่อน/ยืนยันนัดจากลูกค้าชนะป้ายแบบการมา — เป็นเรื่องที่ร้านต้องเห็น (ลูกค้าเปิดหน้า /o กดได้แม้งานหน้าร้าน)
  if (o.appointmentStatus === 'RESCHEDULE_REQUESTED') return 'RESCHEDULE_REQUESTED'
  if (o.appointmentStatus === 'CONFIRMED_BY_BUYER') return 'APPOINTMENT_CONFIRMED'
  // 00086 FR-001: งานหน้าร้าน = ป้าย WALK_IN แม้มีเวลาเริ่ม — แทนเฉพาะ "จองแล้ว" ไม่ใช่การจอง
  if (o.arrivalMode === 'WALK_IN') return 'WALK_IN'
  return 'BOOKED'
}

/**
 * แบบการมาสำหรับ `ServiceStatusInput.arrivalMode` จากแถวออเดอร์ (00086 FR-001)
 *
 * มี createdAt ⇒ `arrivalModeOf` เต็ม (ค่าที่เก็บ → สูตรเดิม → ยังไม่ระบุเวลา)
 * ไม่มี createdAt (ผู้เรียกที่ไม่ได้ส่งมา) ⇒ เชื่อได้แค่ค่าที่เก็บ · ไม่มีอะไรเลย = undefined (ผลเดิม)
 */
export function serviceArrivalOf(o: {
  arrivalMode?: string | null
  serviceStart?: Date | string | null
  createdAt?: Date | string | null
}): ArrivalMode | undefined {
  if (o.createdAt != null) {
    return arrivalModeOf({ arrivalMode: o.arrivalMode, serviceStart: o.serviceStart ?? null, createdAt: o.createdAt })
  }
  return isStoredArrivalMode(o.arrivalMode) ? o.arrivalMode : undefined
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

/**
 * 00086 P3 — งานกดเริ่มงานแล้วหรือยัง (Order.serviceStartedAt) · ตัวตัดสินเดียวของทุกจอที่เปิด ServiceCloseSheet
 * (หน้างาน · แชทมือถือ · แผงขวาเดสก์ท็อป · การ์ดคิวรายวัน) ⇒ ส่งเป็น `serviceStarted` ให้ชีตซ่อน "ไม่มาตามนัด"
 * เริ่มงาน = ลูกค้ามาแล้ว (Controller decision 2026-10-29) · server ตอบ 409 SERVICE_JOB_NO_SHOW_AFTER_START อีกชั้น
 * ไม่มีคีย์ (payload เก่า) = ยังไม่เริ่ม = พฤติกรรมเดิม
 */
export function isServiceJobStarted(o: { serviceStartedAt?: Date | string | null }): boolean {
  return o.serviceStartedAt != null
}

/**
 * 00086 P3 — ป้าย "ระหว่างทำงาน" ของแถวนัดรายวัน (ตารางงาน · หน้าแรกช่าง · งานของฉัน)
 *
 * แถวนัดรายวันไม่มี `Order.status` (endpoint /appointments/day ไม่คืน) จึงเรียก `resolveServiceStatusBadge`
 * ด้วยสถานะกลาง ๆ แล้วรับผลเฉพาะสองขั้นระหว่างทำงาน — ป้าย/สี/ไอคอนจึงมาจากตัวตัดสินเดียวกับการ์ด "งานนี้"
 * ที่อื่น (ปิดแล้ว · ไม่มาตามนัด · ยังไม่เริ่ม) = null ⇒ ผู้เรียกใช้ป้ายนัดเดิม (appointmentStageBadge)
 */
export function serviceProgressBadge(o: {
  appointmentStatus: string | null
  serviceStartedAt?: Date | string | null
  serviceFinishedAt?: Date | string | null
  serviceClosedAt?: Date | string | null
}): { key: ServiceStatusKey; label: string; cls: string; icon: string } | null {
  if (o.serviceStartedAt == null) return null
  const b = resolveServiceStatusBadge(
    {
      status: 'PENDING',
      appointmentStatus: o.appointmentStatus,
      hasAppointment: true,
      serviceClosedAt: o.serviceClosedAt ?? null,
      serviceStartedAt: o.serviceStartedAt,
      serviceFinishedAt: o.serviceFinishedAt ?? null,
    },
    'seller',
  )
  return b.key === 'IN_SERVICE' || b.key === 'FINISHED_AWAITING_CLOSE'
    ? { key: b.key, label: b.label, cls: b.cls, icon: b.icon }
    : null
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
