/**
 * date-range.ts — pure date-math สำหรับ Expense & Cost Tracking (feature 00016)
 * SSOT: docs/20 - Features/00016 - Expense & Cost Tracking/SDS.md §4.0 (copy เป๊ะ)
 *
 * 🛑 Dual Boundary Design (TD-002): `Order.createdAt` เป็น timestamptz (event-time จริง) ต้อง shift
 * เข้า Thai TZ ก่อน bucket (`orderRange`) แต่ `Expense.expenseDate` เป็น TIMESTAMP(3) ที่ WRITE ถูก
 * normalize เป็น UTC-midnight-of-calendar-date เสมอ (`parseIsoDateToUtcMidnight`) — query ฝั่งนี้ต้องใช้
 * `dateOnlyUtc` (UTC midnight ไม่ shift TZ) ให้ boundary ตรงกับค่าที่เขียนพอดี ไม่ off-by-one
 */

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000 // Asia/Bangkok, UTC+7 คงที่ (ไม่มี DST) — pattern เดียวกับ dashboard.service.ts

export type DateRangePreset = 'today' | '7d' | '30d' | 'month' | 'custom'

export interface ResolvedDateRange {
  /** สำหรับ query field timestamptz (Order.createdAt) — ต้อง shift เข้า Thai TZ ก่อน bucket */
  orderRange: { gte: Date; lt: Date }
  /** สำหรับ query field Expense.expenseDate (TIMESTAMP(3) ตาม DATABASE.md — ไม่ใช่ @db.Date)
   *  🛑 expenseDate ต้องถูก NORMALIZE เป็น UTC-midnight-of-calendar-date เสมอตอน WRITE
   *  (parseIsoDateToUtcMidnight) — ห้ามเก็บ time component. boundary นี้ใช้ dateOnlyUtc (UTC midnight
   *  ไม่ shift TZ) ให้ match กับค่าที่เขียน — ถ้า write เก็บ time จะ off-by-one ทันที */
  expenseRange: { gte: Date; lt: Date }
  /** สำหรับ echo กลับ response/label UI — "YYYY-MM-DD" */
  label: { start: string; end: string }
}

function thaiMidnightUtc(y: number, m0: number, d: number): Date {
  return new Date(Date.UTC(y, m0, d) - TZ_OFFSET_MS)
}
function dateOnlyUtc(y: number, m0: number, d: number): Date {
  return new Date(Date.UTC(y, m0, d))
}
function isoOf(y: number, m0: number, d: number): string {
  const dt = dateOnlyUtc(y, m0, d)
  return dt.toISOString().slice(0, 10)
}
export function parseIsoDateToUtcMidnight(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return dateOnlyUtc(y, m - 1, d)
}
export function todayThaiIsoDate(): string {
  const t = new Date(Date.now() + TZ_OFFSET_MS)
  return isoOf(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
}

export function resolveDateRange(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string,
): ResolvedDateRange {
  const thaiNow = new Date(Date.now() + TZ_OFFSET_MS)
  const y = thaiNow.getUTCFullYear(), m0 = thaiNow.getUTCMonth(), d = thaiNow.getUTCDate()

  let sy: number, sm0: number, sd: number, ey: number, em0: number, ed: number // ed = last day INCLUSIVE

  if (preset === 'today') { [sy, sm0, sd] = [y, m0, d]; [ey, em0, ed] = [y, m0, d] }
  else if (preset === '7d') { [sy, sm0, sd] = [y, m0, d - 6]; [ey, em0, ed] = [y, m0, d] }
  else if (preset === '30d') { [sy, sm0, sd] = [y, m0, d - 29]; [ey, em0, ed] = [y, m0, d] }
  else if (preset === 'month') { [sy, sm0, sd] = [y, m0, 1]; [ey, em0, ed] = [y, m0, d] }
  else {
    if (!customStart || !customEnd) throw new Error('CUSTOM_RANGE_REQUIRES_START_END')
    const s = customStart.split('-').map(Number); const e = customEnd.split('-').map(Number)
    ;[sy, sm0, sd] = [s[0], s[1] - 1, s[2]]; [ey, em0, ed] = [e[0], e[1] - 1, e[2]]
  }

  return {
    orderRange: { gte: thaiMidnightUtc(sy, sm0, sd), lt: thaiMidnightUtc(ey, em0, ed + 1) },
    expenseRange: { gte: dateOnlyUtc(sy, sm0, sd), lt: dateOnlyUtc(ey, em0, ed + 1) },
    label: { start: isoOf(sy, sm0, sd), end: isoOf(ey, em0, ed) },
  }
}
