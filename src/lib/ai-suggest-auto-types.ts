/**
 * สัญญา (contract) ของคำแนะนำคำตอบอัตโนมัติ — 00019-ext Typhoon auto-suggest
 *
 * ไฟล์นี้ไม่มี server-only เพราะฝั่ง client (useAutoSuggest / AiSuggestInline) import ชนิดเดียวกัน
 * ค่าในอาร์เรย์คือค่าที่เก็บจริงใน AiSuggestRun (คอลัมน์ String) — เพิ่ม/ลบค่าต้อง sync docs/SRS.md ส่วน enums
 * อ้างอิง: docs/superpowers/plans/2026-10-09-00019-ext-typhoon-auto-suggest-plan.md หัวข้อ 2
 */

export const AUTO_SUGGEST_OUTCOMES = [
  'OK',
  'RATE_LIMITED',
  'TIMEOUT',
  'ERROR',
  'UNRESOLVED_TOKEN',
  'SKIPPED_NOT_BUYER',
  'SKIPPED_BOT',
  'SKIPPED_SPAM',
  'SKIPPED_NOT_ALLOWED',
  'SKIPPED_EMPTY',
] as const
export type AutoSuggestOutcome = (typeof AUTO_SUGGEST_OUTCOMES)[number]

export const AUTO_SUGGEST_TRIGGERS = ['AUTO_NEW_MESSAGE', 'AUTO_OPEN', 'MANUAL'] as const
export type AutoSuggestTrigger = (typeof AUTO_SUGGEST_TRIGGERS)[number]

export const AUTO_SUGGEST_STATUSES = ['THINKING', 'READY', 'NONE'] as const
export type AutoSuggestStatus = (typeof AUTO_SUGGEST_STATUSES)[number]

export const AUTO_SUGGEST_FEEDBACKS = ['UP', 'DOWN'] as const
export type AutoSuggestFeedback = (typeof AUTO_SUGGEST_FEEDBACKS)[number]

export const AUTO_SUGGEST_FEEDBACK_REASONS = ['WRONG_INFO', 'OFF_TOPIC', 'BAD_TONE', 'LENGTH'] as const
export type AutoSuggestFeedbackReason = (typeof AUTO_SUGGEST_FEEDBACK_REASONS)[number]

export const AUTO_SUGGEST_NOTE_MAX = 120

/** reason ฝั่ง client = outcome ที่ไม่ใช่ OK + เหตุที่ไม่มีแถวผลลัพธ์ */
export type AutoSuggestReason =
  | Exclude<AutoSuggestOutcome, 'OK'>
  | 'NO_RUN' // ยังไม่เคยมีแถวของ anchor นี้ → client ควร POST (กฎ ข)
  | 'STALE_ANCHOR' // anchor ไม่ใช่ข้อความล่าสุดของห้อง
  | 'NOT_CONFIGURED' // ร้านอยู่ใน allow-list แต่ไม่มีกุญแจ (E-13)
  | 'NOT_ENABLED' // ร้านใช้ gemini (ไม่ใช่ typhoon)

export type AutoSuggestProvider = 'typhoon' | 'gemini' | 'none'

export type AutoSuggestState =
  | {
      status: 'READY'
      anchorMessageId: string
      attempt: number
      suggestion: string
      feedback: AutoSuggestFeedback | null
    }
  | { status: 'THINKING'; anchorMessageId: string; attempt: number }
  | { status: 'NONE'; anchorMessageId: string | null; attempt: number | null; reason: AutoSuggestReason }

export type AutoSuggestPostBody = {
  anchorMessageId: string
  manual: boolean
  trigger?: 'AUTO_NEW_MESSAGE' | 'AUTO_OPEN'
}
export type AutoSuggestPostResponse = AutoSuggestState
export type AutoSuggestGetResponse = AutoSuggestState & { provider: AutoSuggestProvider }
export type AutoSuggestPatchBody = {
  anchorMessageId: string
  attempt: number
  feedback: AutoSuggestFeedback
  reason?: AutoSuggestFeedbackReason
  note?: string // ≤ AUTO_SUGGEST_NOTE_MAX
}
export type AutoSuggestPatchResponse = { ok: true }
