// 00066 — เวลาไทยล้วน (BR-ACT-12) ใช้ helper ของ date-range.ts เท่านั้น ห้ามคำนวณ offset/ใช้ TZ เครื่อง
import { thaiMidnightUtc, thaiTodayBounds, todayThaiIsoDate, shiftIsoDate } from '@/lib/date-range'
import {
  DUE_MAX_DAYS,
  DUE_MIN_DAYS,
  REMIND_WINDOW_MS,
  REMINDER_HOUR_ALLDAY,
  type SnoozePreset,
} from '@/lib/follow-up-constants'

const HOUR_MS = 3600_000
const DAY_MS = 24 * HOUR_MS

export class FollowUpDueError extends Error {
  constructor(message = 'INVALID_DUE') {
    super(message)
    this.name = 'FollowUpDueError'
  }
}

export interface DueInput {
  /** YYYY-MM-DD เวลาไทย */
  date: string
  /** HH:mm เวลาไทย · null = ทั้งวัน */
  time: string | null
}

/** เวลาที่ "ควรเตือน" — ทั้งวันเตือน 09:00 ไทย (dueAt ของทั้งวัน = เที่ยงคืนไทย) */
export function reminderFireAt(f: { dueAt: Date; allDay: boolean }): Date {
  return f.allDay ? new Date(f.dueAt.getTime() + REMINDER_HOUR_ALLDAY * HOUR_MS) : f.dueAt
}

/** ปลายหน้าต่างชดเชย (รวมปลาย): มีเวลา = fireAt+6ชม. · ทั้งวัน = มิลลิวินาทีสุดท้ายของวันเดียวกัน (00:00 วันถัดไปไม่ถูกนับ) */
export function reminderWindowEnd(f: { dueAt: Date; allDay: boolean }): Date {
  return f.allDay
    ? new Date(f.dueAt.getTime() + DAY_MS - 1)
    : new Date(f.dueAt.getTime() + REMIND_WINDOW_MS)
}

/** แปลง {date,time} (เวลาไทย) → dueAt/allDay · throw FollowUpDueError ถ้าวันไม่มีจริง/นอกช่วง/รูปแบบผิด */
export function resolveDue(input: DueInput, now: Date): { dueAt: Date; allDay: boolean } {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.date)
  if (!dm) throw new FollowUpDueError()
  const [y, m, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])]
  // วันไม่มีจริง (2026-02-30) — Date.UTC ล้นเดือน จึงเทียบกลับ
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new FollowUpDueError()
  }
  const today = todayThaiIsoDate(now)
  // ISO เรียงตัวอักษร = เรียงวัน
  if (input.date < shiftIsoDate(today, DUE_MIN_DAYS) || input.date > shiftIsoDate(today, DUE_MAX_DAYS)) {
    throw new FollowUpDueError()
  }
  const midnight = thaiMidnightUtc(y, m - 1, d)
  if (input.time === null) return { dueAt: midnight, allDay: true }
  const tm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(input.time)
  if (!tm) throw new FollowUpDueError()
  return { dueAt: new Date(midnight.getTime() + Number(tm[1]) * HOUR_MS + Number(tm[2]) * 60_000), allDay: false }
}

/** ปุ่มลัดเลื่อน — คำนวณจาก now ฝั่ง server (ไทยไม่มี DST จึงบวกเป็น ms ของวันได้) */
export function quickSnooze(preset: SnoozePreset, now: Date): { dueAt: Date; allDay: boolean } {
  const { from, to } = thaiTodayBounds(now)
  switch (preset) {
    case 'TOMORROW_9':
      return { dueAt: new Date(to.getTime() + REMINDER_HOUR_ALLDAY * HOUR_MS), allDay: false }
    case 'IN_3_DAYS':
      return { dueAt: new Date(from.getTime() + 3 * DAY_MS), allDay: true }
    case 'NEXT_WEEK':
      return { dueAt: new Date(from.getTime() + 7 * DAY_MS), allDay: true }
  }
}
