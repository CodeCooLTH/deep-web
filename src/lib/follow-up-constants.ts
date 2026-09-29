// 00066 ติดตามลูกค้า — ค่าคงที่ที่ใช้ร่วม (เพดาน/ค่า enum) ที่เดียว ห้าม hardcode ที่อื่น
export const TITLE_MAX = 200
export const NOTE_MAX = 1000
export const LIST_MAX = 200
export const DONE_IN_PANEL = 3
export const CAL_MAX = 1000
export const OPEN_SCAN_MAX = 2000
export const BUBBLE_MAX = 8
export const REMINDER_HOUR_ALLDAY = 9
export const REMIND_WINDOW_MS = 6 * 60 * 60 * 1000
/** ช่วงวันที่ยอมรับ นับจากวันนี้ไทย (ข้อเสนอ A-FU-5) */
export const DUE_MIN_DAYS = -365
export const DUE_MAX_DAYS = 730
/** body ของ push ตัดที่กี่ตัวอักษร (BR-ACT-13.7) */
export const PUSH_TITLE_MAX = 60

export const FOLLOW_UP_TYPES = ['FOLLOW_UP', 'MEET_CUSTOMER', 'OTHER'] as const
export const FOLLOW_UP_STATUSES = ['OPEN', 'DONE'] as const
export const FOLLOW_UP_OUTCOMES = ['REACHED', 'NO_ANSWER', 'CALL_LATER', 'NOT_INTERESTED'] as const
export const SNOOZE_PRESETS = ['TOMORROW_9', 'IN_3_DAYS', 'NEXT_WEEK'] as const

export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number]
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number]
export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number]
export type SnoozePreset = (typeof SNOOZE_PRESETS)[number]
