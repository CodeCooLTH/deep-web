/**
 * service-job.ts — error + ค่าคงที่ของ "ปิดงาน / เปิดงานอีกครั้ง" ของร้านบริการ (feature 00073)
 *
 * pure module — ใช้ได้ทั้ง server (service/route) และ client (ข้อความ error)
 */

/** ผลของการปิดงาน — คำที่ร้านเลือกในหน้าปิดงาน */
export const SERVICE_CLOSE_OUTCOMES = ['SERVED', 'NO_SHOW'] as const
export type ServiceCloseOutcome = (typeof SERVICE_CLOSE_OUTCOMES)[number]

/** มัดจำตอนปิดแบบไม่มาตามนัด (มติ D1): เก็บ = เป็นยอดขาย (ค่าตั้งต้น) · คืน = void ⇒ ยอด 0 */
export const SERVICE_NO_SHOW_DEPOSIT = ['KEEP', 'REFUND'] as const
export type ServiceNoShowDeposit = (typeof SERVICE_NO_SHOW_DEPOSIT)[number]

/** เหตุผลที่บันทึกลงรายการเงินที่ถูก void ตอนคืนมัดจำ — ประวัติเงินต้องอ่านออกว่าทำไมหาย */
export const NO_SHOW_REFUND_REASON = 'คืนมัดจำ — ลูกค้าไม่มาตามนัด'

/** หาไม่เจอ (token ผิดร้าน/ไม่มีจริง) */
export class ServiceJobNotFoundError extends Error {
  constructor() {
    super('SERVICE_JOB_NOT_FOUND')
    this.name = 'ServiceJobNotFoundError'
  }
}

/** ปิดไปแล้ว — ปิดซ้ำไม่ได้ (กันสองคนกดพร้อมกัน) */
export class ServiceJobAlreadyClosedError extends Error {
  constructor() {
    super('SERVICE_JOB_ALREADY_CLOSED')
    this.name = 'ServiceJobAlreadyClosedError'
  }
}

/** ยกเลิก/คืนทั้งใบ/ร่าง — ไม่ใช่งานที่ปิดได้ */
export class ServiceJobNotClosableError extends Error {
  constructor() {
    super('SERVICE_JOB_NOT_CLOSABLE')
    this.name = 'ServiceJobNotClosableError'
  }
}

/** "ไม่มาตามนัด" ใช้ได้เฉพาะงานที่มีนัด — walk-in ลูกค้ามาแล้วโดยนิยาม */
export class ServiceJobNoShowWithoutAppointmentError extends Error {
  constructor() {
    super('SERVICE_JOB_NO_SHOW_WITHOUT_APPOINTMENT')
    this.name = 'ServiceJobNoShowWithoutAppointmentError'
  }
}

/** เปิดงานอีกครั้งไม่ได้ — ยังไม่ปิด หรือ ลูกค้ายืนยันไปแล้ว (มติ D2) */
export class ServiceJobNotReopenableError extends Error {
  constructor() {
    super('SERVICE_JOB_NOT_REOPENABLE')
    this.name = 'ServiceJobNotReopenableError'
  }
}

/** งานที่ปิดแล้วถูกล็อก — ต้องเปิดงานอีกครั้งก่อนแก้ (มติ D3) / ยกเลิกไม่ได้ (PRD §3.1) */
export class ServiceJobClosedLockedError extends Error {
  constructor() {
    super('SERVICE_JOB_CLOSED_LOCKED')
    this.name = 'ServiceJobClosedLockedError'
  }
}

/** ลูกค้ายืนยันรับบริการงานที่ร้านปิดแบบไม่มาตามนัดไม่ได้ (PRD §3.1) */
export class ServiceJobNoShowConfirmError extends Error {
  constructor() {
    super('SERVICE_JOB_NO_SHOW_CONFIRM')
    this.name = 'ServiceJobNoShowConfirmError'
  }
}

/** ข้อความภาษาธุรกิจต่อ error — ใช้ทั้ง route (message) และ client (fallback) */
export const SERVICE_JOB_ERROR_MESSAGE: Record<string, string> = {
  SERVICE_JOB_NOT_FOUND: 'ไม่พบงานนี้ในร้าน',
  SERVICE_JOB_ALREADY_CLOSED: 'งานนี้ปิดไปแล้ว',
  SERVICE_JOB_NOT_CLOSABLE: 'งานนี้ถูกยกเลิกหรือยังเป็นร่าง จึงปิดงานไม่ได้',
  SERVICE_JOB_NO_SHOW_WITHOUT_APPOINTMENT: 'งานที่ไม่มีนัดบันทึกว่าไม่มาตามนัดไม่ได้',
  SERVICE_JOB_NOT_REOPENABLE: 'เปิดงานอีกครั้งได้เฉพาะงานที่ปิดแล้วและลูกค้ายังไม่ยืนยัน',
  SERVICE_JOB_CLOSED_LOCKED: 'งานนี้ปิดแล้ว — กด "เปิดงานอีกครั้ง" ก่อนถ้าต้องการแก้ไข',
  SERVICE_JOB_NO_SHOW_CONFIRM: 'ร้านบันทึกว่างานนี้ไม่ได้เข้ารับบริการ จึงยืนยันรับบริการไม่ได้',
}
