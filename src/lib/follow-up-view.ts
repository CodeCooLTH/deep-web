// 00066 — ตัวตัดสินฝั่งหน้าจอของ "ติดตามลูกค้า" (การ์ด/ฟอร์ม/แผง) เป็นฟังก์ชันบริสุทธิ์ทั้งหมด
// เพื่อให้ boolean ที่ตัดสิน UI มีที่ให้เทสจับ (ui-boolean-needs-a-testable-home.md) — ห้ามย้ายกลับไปเป็น ternary ใน JSX
import { thaiTodayBounds, todayThaiIsoDate, shiftIsoDate } from '@/lib/date-range'
import { DUE_MAX_DAYS, DUE_MIN_DAYS, NOTE_MAX, TITLE_MAX, type FollowUpOutcome, type FollowUpType } from '@/lib/follow-up-constants'
import { resolveDue } from '@/lib/follow-up-time'
import { isOverdue } from '@/lib/follow-up-rules'
import { formatTimeHM, thaiDayKey } from '@/lib/format-date'
import type { Dictionary } from '@/i18n/dictionaries/th'
import { fmt } from '@/i18n/fmt'

type T = Dictionary['followUps']

/** โน้ตยาวเกินนี้ถึงมีปุ่ม "เพิ่มเติม" — นับตัวอักษร ไม่วัด DOM (กันวงจรวัด→เปลี่ยน สิ่งที่วัด) */
export const NOTE_CLAMP_CHARS = 80

export function needsNoteToggle(note: string | null | undefined): boolean {
  return note != null && Array.from(note).length > NOTE_CLAMP_CHARS
}

/** ตัวเลขนับทุกที่: ≥100 = "99+" (LIST_MAX = 200 จึงต้องไม่โชว์ 200) */
export function formatCount(n: number): string {
  return n >= 100 ? '99+' : String(n)
}

/** ไอคอนของชนิด — ตามมติ user 2026-09-29 */
export function typeIcon(type: FollowUpType): string {
  return type === 'MEET_CUSTOMER' ? 'phone-call' : type === 'OTHER' ? 'list-check' : 'message-circle'
}

export function typeLabel(t: T, type: FollowUpType): string {
  return type === 'MEET_CUSTOMER' ? t.typeTalk : type === 'OTHER' ? t.typeOther : t.typeFollowUp
}

/** ป้ายของการ์ด — สถานะ → ป้ายเดียวทุกพื้นผิว (UX §0.2): เลยกำหนดชนะครบวันนี้ · เลื่อนซ้ำ ≥2 เป็นป้ายแยก */
export interface BadgeInput {
  status: string
  overdue: boolean
  bucket: string
  snoozeCount: number
}
export function cardBadges(i: BadgeInput): { overdue: boolean; dueToday: boolean; snoozed: number | null } {
  const open = i.status === 'OPEN'
  return {
    overdue: open && i.overdue,
    dueToday: open && !i.overdue && i.bucket === 'today',
    snoozed: open && i.snoozeCount >= 2 ? i.snoozeCount : null,
  }
}

/** ปุ่ม "ทำแล้ว" ทึบเฉพาะการ์ดเลยกำหนด (One Voice) */
export function doneButtonIsSolid(i: Pick<BadgeInput, 'status' | 'overdue'>): boolean {
  return i.status === 'OPEN' && i.overdue
}

/** วันนี้/พรุ่งนี้/เมื่อวาน (ตามปฏิทินไทย) ไม่ใช่ 24 ชม. — คืน null = วันอื่น ให้ผู้เรียกใช้ formatDateTH */
export function relativeDay(dueAt: Date | string, now: Date): 'today' | 'tomorrow' | 'yesterday' | null {
  const { from, to } = thaiTodayBounds(now)
  const ms = new Date(dueAt).getTime()
  const day = 24 * 3600_000
  if (ms >= from.getTime() && ms < to.getTime()) return 'today'
  if (ms >= to.getTime() && ms < to.getTime() + day) return 'tomorrow'
  if (ms >= from.getTime() - day && ms < from.getTime()) return 'yesterday'
  return null
}

/** ป้ายกำหนด: ทั้งวัน "ไม่แสดงเวลาที่ใดเลย" (BR-ACT-03) · วันอื่นให้ผู้เรียกส่ง formatter วันที่เข้ามา (format-date.ts) */
export function formatDueLabel(
  t: T,
  f: { dueAt: Date | string; allDay: boolean },
  now: Date,
  formatDay: (d: Date | string) => string,
): string {
  const rel = relativeDay(f.dueAt, now)
  const time = formatTimeHM(f.dueAt)
  if (rel === 'today') return f.allDay ? t.dueTodayAllDay : fmt(t.dueToday, { time })
  if (rel === 'tomorrow') return f.allDay ? t.dueTomorrowAllDay : fmt(t.dueTomorrow, { time })
  if (rel === 'yesterday') return f.allDay ? t.dueYesterdayAllDay : fmt(t.dueYesterday, { time })
  return f.allDay ? `${formatDay(f.dueAt)} · ${t.allDay}` : `${formatDay(f.dueAt)} ${time}`
}

// ---------- ฟอร์ม ----------
export interface FormValues {
  title: string
  type: FollowUpType
  /** YYYY-MM-DD เวลาไทย */
  date: string
  /** HH:mm */
  time: string
  allDay: boolean
  /** '' = ไม่ส่ง (server ใช้ผู้สร้าง / คงผู้รับเดิม) */
  assigneeUserId: string
  note: string
}

/** ค่าตั้งต้น = พรุ่งนี้ 09:00 เวลาไทย (จดได้ = พิมพ์หัวข้อ + บันทึก) */
export function defaultFormValues(now: Date): FormValues {
  return {
    title: '',
    type: 'FOLLOW_UP',
    date: shiftIsoDate(todayThaiIsoDate(now), 1),
    time: '09:00',
    allDay: false,
    assigneeUserId: '',
    note: '',
  }
}

export interface FormErrors {
  title?: 'errTitleRequired' | 'errTitleMax'
  note?: 'errNoteMax'
  date?: 'errDateRequired' | 'errDateRange'
  time?: 'errTimeRequired'
}

/** ช่วงวันที่ที่ server ยอมรับ (ISO เวลาไทย) — SSOT เดียวกับ resolveDue: ใช้ตั้ง min/max ของช่องวันที่ + ข้อความ error */
export function dueDateBounds(now: Date): { min: string; max: string } {
  const today = todayThaiIsoDate(now)
  return { min: shiftIsoDate(today, DUE_MIN_DAYS), max: shiftIsoDate(today, DUE_MAX_DAYS) }
}

/** ช่วงของ "เลื่อน → เลือกเอง": ไม่ให้เลื่อนไปอดีต (เริ่มที่วันนี้ไทย) ปลายเท่ากับฟอร์ม */
export function snoozeDateBounds(now: Date): { min: string; max: string } {
  return { min: todayThaiIsoDate(now), max: dueDateBounds(now).max }
}

/**
 * ตรวจช่องวัน: รูปแบบผิด/ว่าง = errDateRequired · นอกช่วง = errDateRange
 * (เดิมนอกช่วงถูกแมปเป็น "เลือกวันที่" ซึ่งบอกไม่ตรงกับปัญหา)
 */
function dateError(date: string, b: { min: string; max: string }): 'errDateRequired' | 'errDateRange' | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'errDateRequired'
  return date < b.min || date > b.max ? 'errDateRange' : null
}

/** ตรวจก่อนยิง — รายการที่ปิดแล้ว (closed) แก้ได้แค่หัวข้อ/โน้ต จึงไม่ตรวจวัน/เวลา */
export function validateForm(v: FormValues, closed: boolean, now: Date = new Date()): FormErrors {
  const e: FormErrors = {}
  const title = v.title.trim()
  if (title.length === 0) e.title = 'errTitleRequired'
  else if (Array.from(title).length > TITLE_MAX) e.title = 'errTitleMax'
  if (Array.from(v.note).length > NOTE_MAX) e.note = 'errNoteMax'
  if (!closed) {
    const de = dateError(v.date, dueDateBounds(now))
    if (de) e.date = de
    if (!v.allDay && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) e.time = 'errTimeRequired'
  }
  return e
}

/** "เลื่อน → เลือกเอง": ใช้กฎวัน/เวลาชุดเดียวกับฟอร์ม (ไม่เขียนซ้ำ) — คืนคีย์ error ของช่องแรกที่ผิด */
export function validateSnoozeCustom(
  date: string,
  time: string,
  allDay: boolean,
  now: Date = new Date(),
): 'errDateRequired' | 'errDateRange' | 'errTimeRequired' | null {
  const e = validateForm({ ...defaultFormValues(now), title: 'x', date, time, allDay }, false, now)
  // เลื่อนไปอดีตไม่ได้ — ตีกรอบแคบกว่าฟอร์ม (ฟอร์มยังจดย้อนหลังได้)
  const d = e.date ?? (dateError(date, snoozeDateBounds(now)))
  return d ?? e.time ?? null
}

/**
 * คำเตือน (ไม่บล็อก) ตอนสร้าง: วัน/เวลาที่เลือกผ่านไปแล้ว → รายการจะขึ้นเป็นเลยกำหนดทันที
 * ใช้ resolveDue + isOverdue ชุดเดียวกับ server จึงตัดสินตรงกัน (ทั้งวัน = เลยเมื่อขึ้นวันใหม่ไทย)
 */
export function pastDueWarning(v: Pick<FormValues, 'date' | 'time' | 'allDay'>, now: Date): boolean {
  try {
    const due = resolveDue({ date: v.date, time: v.allDay ? null : v.time }, now)
    return isOverdue({ status: 'OPEN', dueAt: due.dueAt, allDay: due.allDay }, now)
  } catch {
    return false
  }
}

/** ใส่ผลให้ทีหลังได้เฉพาะรายการที่ปิดแล้วและยังไม่มีผล */
export function canSetOutcome(i: { status: string; outcome: FollowUpOutcome | null }): boolean {
  return i.status === 'DONE' && i.outcome === null
}

/** ป้ายปุ่มลอย: เต็ม (เดสก์ท็อป) + สั้น (มือถือ — เลยกำหนดเป็น "เลย {n}" ไม่ใช่เลขเปล่า) */
export function bubbleLabels(
  t: T,
  tone: 'late' | 'normal',
  counts: { late: number; total: number },
): { full: string; short: string } {
  if (tone === 'late') {
    const n = formatCount(counts.late)
    return { full: fmt(t.bubbleLate, { n }), short: fmt(t.bubbleLateShort, { n }) }
  }
  const label = fmt(t.bubbleToday, { n: formatCount(counts.total) })
  return { full: label, short: label }
}

/** aria ของช่องปฏิทิน: อ่านเฉพาะสถานะที่มีจริง — ไม่อ่าน "0" ทุกช่อง */
export function calCellAriaText(
  t: T,
  date: string,
  n: { late: number; today: number; normal: number; done: number } | undefined,
): string {
  const parts = [
    n && n.late > 0 ? fmt(t.calAriaLate, { n: n.late }) : null,
    n && n.today > 0 ? fmt(t.calAriaToday, { n: n.today }) : null,
    n && n.normal > 0 ? fmt(t.calAriaNormal, { n: n.normal }) : null,
    n && n.done > 0 ? fmt(t.calAriaDone, { n: n.done }) : null,
  ].filter((x): x is string => x !== null)
  return `${date}: ${parts.length ? parts.join(' ') : t.calAriaNone}`
}

/**
 * body ของ POST/PATCH — ติ๊กทั้งวัน = time:null (ไม่ส่งเวลา) · ปิดแล้ว = เฉพาะ title/note (PATCH ปฏิเสธฟิลด์อื่น)
 * PATCH ส่งเฉพาะฟิลด์ที่ผู้ใช้เห็นเปลี่ยนไม่ได้ทราบ จึงส่งครบชุดที่แก้ได้ · assignee ว่าง = ไม่ส่ง (ห้าม null)
 */
export function buildPayload(v: FormValues, mode: 'create' | 'edit', closed: boolean) {
  const note = v.note.trim() === '' ? null : v.note
  if (mode === 'edit' && closed) return { title: v.title.trim(), note }
  return {
    title: v.title.trim(),
    type: v.type,
    date: v.date,
    time: v.allDay ? null : v.time,
    note,
    ...(v.assigneeUserId ? { assigneeUserId: v.assigneeUserId } : {}),
  }
}

/** รหัส error ของ API → ข้อความ inline ใต้ฟอร์ม */
export function saveErrorKey(code: string | undefined): 'errDateRange' | 'errAssignee' | 'errNotFound' | 'errSaveFailed' {
  if (code === 'INVALID_DUE') return 'errDateRange'
  if (code === 'ASSIGNEE_NOT_MEMBER') return 'errAssignee'
  if (code === 'NOT_FOUND') return 'errNotFound'
  return 'errSaveFailed'
}

/** ค่าของช่องแก้ไขจากรายการเดิม (dueAt → วัน/เวลาไทย ผ่าน format-date ไม่ใช่ TZ เครื่อง) */
export function valuesFromItem(f: {
  title: string
  type: FollowUpType
  note: string | null
  dueAt: string
  allDay: boolean
  assignee: { userId: string } | null
}): FormValues {
  return {
    title: f.title,
    type: f.type,
    date: thaiDayKey(f.dueAt),
    time: f.allDay ? '09:00' : formatTimeHM(f.dueAt),
    allDay: f.allDay,
    assigneeUserId: f.assignee?.userId ?? '',
    note: f.note ?? '',
  }
}

/** "การกระทำของการ์ดเปลี่ยนรายการ" — contract ที่ T9–T11 ใช้ร่วม */
export type FollowUpChange<T> = { kind: 'upsert'; item: T } | { kind: 'remove'; id: string } | { kind: 'refresh' }
