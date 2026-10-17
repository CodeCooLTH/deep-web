// feature 00078 — กฎของ ledger การส่งอัตโนมัติ (key / เพดานวัน / map error) · pure module
import { AUTO_NOTIFY_DAILY_CAP, type AutoNotifyLedgerReason } from './ledger-constants'

export const LEDGER_FIXED_KEY = '-'
/** เลขพัสดุเปลี่ยนแจ้งซ้ำได้สูงสุด 3 ครั้งต่อใบ — ครั้งที่ 4 = SKIPPED/RESEND_LIMIT (D-4) */
export const TRACKING_NOTICE_MAX = 3
export const DAILY_CAP_MIN = AUTO_NOTIFY_DAILY_CAP.min
export const DAILY_CAP_MAX = AUTO_NOTIFY_DAILY_CAP.max
export const DAILY_CAP_DEFAULT = AUTO_NOTIFY_DAILY_CAP.default

/** key กันซ้ำของ TRACKING — "th123" กับ " TH123 " ต้องเป็นเลขเดียวกัน (TD-008) */
export const normalizeTrackingKey = (no: string): string => no.trim().toUpperCase()

const THAI_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** วันปฏิทินไทย (UTC+7 ไม่มี DST) เป็นเลขวัน — ใช้เทียบ "คนละวัน" */
export const thaiDayIndex = (ms: number): number => Math.floor((ms + THAI_OFFSET_MS) / DAY_MS)

/** 00:00 ไทยของวันที่ nowMs อยู่ — ขอบล่างของ `createdAt >= …` ตอนนับเพดานต่อวัน (TFR-017) */
export const thaiDayStart = (nowMs: number | Date): Date =>
  new Date(thaiDayIndex(+nowMs) * DAY_MS - THAI_OFFSET_MS)

/** SDS §7.4 — ตารางเดียวของการแปลงรหัสล้มเหลวของตัวส่ง → เหตุผลใน ledger */
const NOT_ELIGIBLE_CODES = new Set(['CONVERSATION_NOT_FOUND', 'FORBIDDEN', 'INVALID_ACTOR'])
export const isNotEligibleFailureCode = (code: string | null | undefined): boolean =>
  !!code && NOT_ELIGIBLE_CODES.has(code)

export function mapFailureToLedgerReason(code: string | null | undefined): AutoNotifyLedgerReason {
  if (code === 'WINDOW_CLOSED') return 'WINDOW_CLOSED'
  if (code === 'QUOTA_EXCEEDED') return 'QUOTA_EXCEEDED'
  if (isNotEligibleFailureCode(code)) return 'NOT_ELIGIBLE_ANYMORE' // ผู้เรียกต้อง log เตือน (สถานะที่ไม่ควรเกิด)
  return 'REJECTED_BY_PLATFORM' // CONTACT_BLOCKED/CHANNEL_NOT_ACTIVE/TOKEN_INVALID/LINE_UNAVAILABLE/SEND_FAILED:*/อื่น ๆ
}
