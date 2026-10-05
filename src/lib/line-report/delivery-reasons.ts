/**
 * delivery-reasons.ts — SSOT ชุด `reason` ของประวัติการส่ง + ป้ายไทย (SRS §5.3 · API §5)
 * 🛑 ห้ามมี token/secret ในค่า reason
 */

export const FIXED_DELIVERY_REASONS = [
  'TIMEOUT',
  'NETWORK',
  'TOKEN_INVALID',
  'BOT_NOT_IN_GROUP',
  'NO_SENDABLE_SHOPS',
  'ALL_SHOPS_FAILED',
  'NO_ORDERS',
  'PACKAGE_PAUSED',
  'REPLY_TOKEN_EXPIRED',
  'REPLY_REJECTED',
  'IN_DAILY_PUSH',
  'PAYLOAD_TOO_LARGE',
  'STALE_CLAIM',
  'INTERNAL',
] as const

export type DeliveryReason = (typeof FIXED_DELIVERY_REASONS)[number] | `HTTP_${number}`

export const httpReason = (status: number): DeliveryReason => `HTTP_${status}`

const RETRY_LATER = 'LINE ไม่พร้อมรับข้อความ ระบบจะลองใหม่ในรอบถัดไป'
const FIXED_LABEL: Record<(typeof FIXED_DELIVERY_REASONS)[number], string> = {
  TIMEOUT: RETRY_LATER,
  NETWORK: RETRY_LATER,
  TOKEN_INVALID: 'ระบบส่งข้อความขัดข้อง ทีมงานกำลังตรวจสอบ',
  BOT_NOT_IN_GROUP: 'บอทไม่อยู่ในกลุ่มแล้ว',
  NO_SENDABLE_SHOPS: 'ทุกร้านถูกล็อกหรือถูกลบ',
  ALL_SHOPS_FAILED: 'ดึงข้อมูลร้านไม่สำเร็จ',
  NO_ORDERS: 'ไม่มีออเดอร์ในช่วงนั้น',
  PACKAGE_PAUSED: 'แพ็กเกจหยุดใช้งาน',
  REPLY_TOKEN_EXPIRED: 'ตอบไม่ทันเวลา',
  REPLY_REJECTED: 'LINE ปฏิเสธข้อความตอบกลับ',
  IN_DAILY_PUSH: 'ส่งรวมกับรายงานรายวัน',
  PAYLOAD_TOO_LARGE: 'ข้อความยาวเกินที่ LINE รับได้',
  STALE_CLAIM: 'การส่งค้างกลางทาง ระบบจะลองใหม่',
  INTERNAL: 'เกิดข้อผิดพลาดในระบบ',
}

/** ป้ายของ status MISSED (ไม่ใช่ reason แต่แสดงในตารางเดียวกัน) */
export const MISSED_STATUS_LABEL = 'พลาดรอบส่ง ไม่ส่งย้อนหลัง'

/** ป้ายไทยของ reason — HTTP_5xx/429 = ลองใหม่ · HTTP_อื่น = LINE ปฏิเสธ · ไม่รู้จัก/ว่าง = ข้อความกลาง */
export function describeReason(reason: string | null | undefined): string {
  if (!reason) return '-'
  if (reason in FIXED_LABEL) return FIXED_LABEL[reason as keyof typeof FIXED_LABEL]
  const m = /^HTTP_(\d{3})$/.exec(reason)
  if (m) return m[1] === '429' || m[1].startsWith('5') ? RETRY_LATER : 'LINE ปฏิเสธข้อความ'
  return 'ไม่ทราบสาเหตุ'
}
