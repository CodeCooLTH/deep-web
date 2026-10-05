/**
 * errors.ts — error ของฟีเจอร์ + ตาราง code→HTTP (SRS §4.3 · API §5)
 * เพิ่มโค้ดใน LINE_REPORT_ERROR_CODES แล้วลืม map = tsc แดงที่ Record ด้านล่าง
 */

export const LINE_REPORT_ERROR_CODES = [
  'UNAUTHORIZED',
  'NOT_OWNER',
  'PACKAGE_REQUIRED',
  'VALIDATION',
  'SHOP_NOT_ALLOWED',
  'SHOP_COUNT_OUT_OF_RANGE',
  'INVALID_SETTINGS',
  'PROFIT_CONFIRM_REQUIRED',
  'GROUP_NOT_FOUND',
  'GROUP_LIMIT_REACHED',
  'INVALID_STATE',
  'SHOPS_INVALID',
  'GROUP_NOT_ACTIVE',
  'NO_SENDABLE_SHOPS',
  'BOT_NOT_IN_GROUP',
  'TEST_QUOTA_EXCEEDED',
  'LINE_UNAVAILABLE',
  'BOT_UNAVAILABLE',
  'BOT_NOT_CONFIGURED',
  'INTERNAL',
  'INVALID_SIGNATURE',
] as const

export type LineReportErrorCode = (typeof LINE_REPORT_ERROR_CODES)[number]

export const LINE_REPORT_ERROR_STATUS: Record<LineReportErrorCode, number> = {
  UNAUTHORIZED: 401,
  NOT_OWNER: 403,
  PACKAGE_REQUIRED: 403,
  VALIDATION: 400,
  SHOP_NOT_ALLOWED: 400,
  SHOP_COUNT_OUT_OF_RANGE: 400,
  INVALID_SETTINGS: 400,
  PROFIT_CONFIRM_REQUIRED: 400,
  GROUP_NOT_FOUND: 404,
  GROUP_LIMIT_REACHED: 409,
  INVALID_STATE: 409,
  SHOPS_INVALID: 409,
  GROUP_NOT_ACTIVE: 409,
  NO_SENDABLE_SHOPS: 409,
  BOT_NOT_IN_GROUP: 409,
  TEST_QUOTA_EXCEEDED: 429,
  LINE_UNAVAILABLE: 502,
  BOT_UNAVAILABLE: 502,
  BOT_NOT_CONFIGURED: 503,
  INTERNAL: 500,
  INVALID_SIGNATURE: 401,
}

/** ข้อความไทยที่ UI ใช้ (API.md §5) */
export const LINE_REPORT_ERROR_MESSAGE: Record<LineReportErrorCode, string> = {
  UNAUTHORIZED: 'กรุณาเข้าสู่ระบบ',
  NOT_OWNER: 'ฟีเจอร์นี้สำหรับเจ้าของร้านเท่านั้น',
  PACKAGE_REQUIRED: 'ต้องมีแพ็กเกจธุรกิจที่ใช้งานอยู่',
  VALIDATION: 'ข้อมูลไม่ถูกต้อง',
  SHOP_NOT_ALLOWED: 'เลือกได้เฉพาะร้านที่คุณเป็นเจ้าของและยังใช้งานอยู่',
  SHOP_COUNT_OUT_OF_RANGE: 'เลือกร้านได้ 1–10 ร้าน',
  INVALID_SETTINGS: 'ตั้งค่านี้ไม่ได้',
  PROFIT_CONFIRM_REQUIRED: 'ต้องยืนยันก่อนแสดงกำไรในกลุ่ม LINE',
  GROUP_NOT_FOUND: 'ไม่พบกลุ่มนี้',
  GROUP_LIMIT_REACHED: 'ครบ 10 กลุ่มแล้ว ยกเลิกการผูกกลุ่มที่ไม่ได้ใช้ก่อน แล้วค่อยเพิ่มกลุ่มใหม่',
  INVALID_STATE: 'กลุ่มนี้อยู่ในสถานะที่ทำรายการนี้ไม่ได้',
  SHOPS_INVALID: 'ร้านในกลุ่มบางร้านไม่พร้อมใช้งาน แก้รายการร้านก่อน',
  GROUP_NOT_ACTIVE: 'ส่งทดสอบไม่ได้จนกว่ากลุ่มจะผูกใหม่',
  NO_SENDABLE_SHOPS: 'ทุกร้านในกลุ่มนี้ถูกล็อกหรือถูกลบ รายงานจึงยังไม่ถูกส่ง',
  BOT_NOT_IN_GROUP: 'บอทไม่อยู่ในกลุ่มแล้ว เชิญบอทกลับเข้ากลุ่มแล้วกดผูกใหม่',
  TEST_QUOTA_EXCEEDED: 'ครบ 5 ครั้งวันนี้แล้ว ส่งทดสอบได้อีกครั้งพรุ่งนี้',
  LINE_UNAVAILABLE: 'LINE ไม่พร้อมรับข้อความตอนนี้ ลองอีกครั้ง',
  BOT_UNAVAILABLE: 'ระบบส่งข้อความขัดข้อง แจ้งทีมงาน Deep',
  BOT_NOT_CONFIGURED: 'ฟีเจอร์ยังไม่พร้อมใช้งาน',
  INTERNAL: 'เกิดข้อผิดพลาด ลองอีกครั้ง',
  INVALID_SIGNATURE: 'ลายเซ็นไม่ถูกต้อง',
}

/** `details.rule` ของ INVALID_SETTINGS */
export type InvalidSettingsRule = 'NEEDS_TIME' | 'METRIC_REQUIRED'
export const INVALID_SETTINGS_RULE_MESSAGE: Record<InvalidSettingsRule, string> = {
  NEEDS_TIME: 'ต้องมีอย่างน้อย 1 เวลา ปิดรายวันถ้าไม่ต้องการส่ง',
  METRIC_REQUIRED: 'ต้องแสดงตัวเลขอย่างน้อย 1 รายการ',
}

export class LineReportError extends Error {
  readonly status: number
  constructor(
    readonly code: LineReportErrorCode,
    readonly details: Record<string, unknown> = {},
  ) {
    super(LINE_REPORT_ERROR_MESSAGE[code])
    this.name = 'LineReportError'
    this.status = LINE_REPORT_ERROR_STATUS[code]
  }
}
