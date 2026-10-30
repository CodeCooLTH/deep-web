// feature 00078 — ค่าคงที่ของ AutoNotify* ที่ต้องตรงกับ DB CHECK ใน
// prisma/migrations/20261017100100_auto_notify_settings และ 20261017100200_auto_notify_ledger
// (เทส auto-notify-db-constraint.test.ts บังคับให้ตรง) · pure module

export const AUTO_NOTIFY_KINDS = [
  'ORDER_SUMMARY',
  'TRACKING',
  'SERVICE_BOOKED',
  'SERVICE_STARTED',
  'SERVICE_CLOSED',
  // feature 00086 P3 (FR-015) — "ทำเสร็จแล้ว ดูรูปก่อน-หลัง" · CHECK ขยายที่ 20261027100700 · ไม่มีแถวสวิตช์ (IMPLICIT_KINDS)
  'SERVICE_FINISHED',
] as const
export type AutoNotifyKind = (typeof AUTO_NOTIFY_KINDS)[number]

export const AUTO_NOTIFY_LEDGER_STATUSES = ['INTENT', 'SENT', 'FAILED', 'SKIPPED'] as const
export type AutoNotifyLedgerStatus = (typeof AUTO_NOTIFY_LEDGER_STATUSES)[number]

/**
 * เหตุผลที่บันทึกลง ledger (บังคับเมื่อ FAILED/SKIPPED)
 * 🛑 ไม่ใช่ชุดเดียวกับ NotEligibleReason ของ eligibility.ts — เหตุผลตอนจองไม่ถูกบันทึก (reserveInner คืน null)
 *    ตอนส่งจริงที่ไม่ผ่านแล้วรวมเป็น 'NOT_ELIGIBLE_ANYMORE' ตัวเดียว ⇒ เพิ่มเหตุผล eligibility ใหม่ไม่ต้องขยาย CHECK นี้
 */
export const AUTO_NOTIFY_LEDGER_REASONS = [
  'DAILY_CAP',
  'EMPTY_MESSAGE',
  'WINDOW_CLOSED',
  'QUOTA_EXCEEDED',
  'REJECTED_BY_PLATFORM',
  'NOT_ELIGIBLE_ANYMORE',
  'UNCERTAIN_SEND',
  'RESEND_LIMIT',
] as const
export type AutoNotifyLedgerReason = (typeof AUTO_NOTIFY_LEDGER_REASONS)[number]

/** feature 00080 — จังหวะแจ้งเลขพัสดุส่งเอง · ตรง CHECK ใน migration 20261018100100 */
export const TRACKING_NOTICE_TIMINGS = ['ON_SAVE', 'ON_DISPATCH'] as const
export type TrackingNoticeTiming = (typeof TRACKING_NOTICE_TIMINGS)[number]

export const AUTO_NOTIFY_TEMPLATE_MAX_CHARS = 500
export const AUTO_NOTIFY_DAILY_CAP = { min: 1, max: 20, default: 5 } as const
