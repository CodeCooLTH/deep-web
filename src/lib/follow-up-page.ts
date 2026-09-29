// 00066 พื้นผิว (c) หน้ารวม /follow-ups — ตัวตัดสินฝั่งหน้าจอเป็นฟังก์ชันบริสุทธิ์
// (boolean ที่ตัดสิน UI ต้องมีที่ให้เทสจับ — ui-boolean-needs-a-testable-home.md; ห้ามย้ายกลับเป็น ternary ใน JSX)
import { thaiDayKey } from '@/lib/format-date'

export const BOARD_COLUMNS = ['late', 'today', 'week', 'later', 'done7d'] as const
export type BoardColumn = (typeof BOARD_COLUMNS)[number]

export interface BoardCounts {
  late: number
  today: number
  week: number
  later: number
  done7d: number
  byUser: Record<string, number>
  unassigned: number
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export interface PageQuery {
  view: 'board' | 'calendar'
  mine: boolean
  /** userId | 'unassigned' | null (ไม่กรอง) — ไม่ใช้เมื่อ mine */
  assignee: string | null
  tags: string[]
  q: string
  /** YYYY-MM */
  month: string
}

/**
 * URL → ตัวกรอง — "ค่าแปลก = ไม่กรอง" (AC-ACT-25) ไม่ 400 ไม่ throw
 * ค่าตั้งต้น = ทั้งร้าน (mine=false); ?mine=1 เท่านั้นที่เป็น "ของฉัน"
 */
export function parsePageQuery(get: (k: string) => string | null, currentMonth: string): PageQuery {
  const mine = get('mine') === '1'
  const a = get('assignee')
  const assignee = !mine && a && (a === 'unassigned' || UUID_RE.test(a)) ? a : null
  const tags = (get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const m = get('month')
  return {
    view: get('view') === 'calendar' ? 'calendar' : 'board',
    mine,
    assignee,
    tags,
    q: (get('q') ?? '').trim().slice(0, 100),
    month: m && MONTH_RE.test(m) ? m : currentMonth,
  }
}

/** ตัวกรองที่ไม่ใช่ค่าตั้งต้น (ไม่นับ view/month/mine — mine มีปุ่มของตัวเอง) ใช้เป็นเลขบนปุ่ม "ตัวกรอง" + ตัดสินว่าจะขึ้น "ล้างตัวกรอง" */
export function countActiveFilters(q: PageQuery): number {
  return (q.assignee ? 1 : 0) + (q.tags.length > 0 ? 1 : 0) + (q.q ? 1 : 0)
}

/** query ของ URL หน้าเรา — ค่าตั้งต้นไม่เขียนลง URL (URL สั้น + ลิงก์เก่ายังใช้ได้) */
export function toPageSearch(q: PageQuery, currentMonth: string): string {
  const p = new URLSearchParams()
  if (q.view === 'calendar') p.set('view', 'calendar')
  if (q.mine) p.set('mine', '1')
  if (q.assignee) p.set('assignee', q.assignee)
  if (q.tags.length > 0) p.set('tags', q.tags.join(','))
  if (q.q) p.set('q', q.q)
  if (q.view === 'calendar' && q.month !== currentMonth) p.set('month', q.month)
  return p.toString()
}

/** query ของ GET /api/follow-ups/board — filters เท่านั้น (view/month ใส่ตามผู้เรียก) */
export function toApiSearch(q: PageQuery, view: 'board' | 'calendar', shopId?: string | null): string {
  const p = new URLSearchParams({ view })
  if (q.mine) p.set('mine', '1')
  if (q.assignee) p.set('assignee', q.assignee)
  if (q.tags.length > 0) p.set('tags', q.tags.join(','))
  if (q.q) p.set('q', q.q)
  if (shopId) p.set('shopId', shopId)
  if (view === 'calendar') p.set('month', q.month)
  return p.toString()
}

/** แท็บตั้งต้นบนมือถือ = คอลัมน์แรกที่ไม่ว่าง ตามลำดับ เลยกำหนด → วันนี้ → 7วัน → ภายหลัง → ทำแล้ว · ว่างหมด = เลยกำหนด */
export function defaultBoardTab(c: Pick<BoardCounts, BoardColumn>): BoardColumn {
  return BOARD_COLUMNS.find((k) => c[k] > 0) ?? 'late'
}

/** ตัวเลขบน segmented: ของฉัน = ที่ยังเปิดและมอบให้ฉัน · ทั้งร้าน = ที่ยังเปิดทั้งหมด (ไม่นับที่ทำแล้ว) — ไม่ขึ้นกับตัวกรอง (AC-ACT-26) */
export function scopeCounts(c: BoardCounts, userId: string): { mine: number; all: number } {
  return { mine: c.byUser[userId] ?? 0, all: c.late + c.today + c.week + c.later }
}

/** ร้านไม่มีรายการเลยสักใบ (ตัวเลขทั้งร้าน ไม่ใช่ผลกรอง) → ขึ้นหน้าว่างแทนกระดาน */
export function shopHasNoFollowUps(c: BoardCounts): boolean {
  return c.late + c.today + c.week + c.later + c.done7d === 0
}

// ---------- ปฏิทิน ----------
/** YYYY-MM ± n เดือน */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const idx = y * 12 + (m - 1) + delta
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

export interface GridCell {
  /** YYYY-MM-DD */
  key: string
  day: number
  inMonth: boolean
}

/** ตารางเดือนเริ่มวันจันทร์ (ตรงกับ firstDay=1 ของ FullCalendar และหัว "จ อ พ พฤ ศ ส อา") — คืนสัปดาห์ละ 7 ช่อง */
export function buildMonthGrid(month: string): GridCell[][] {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const first = new Date(Date.UTC(y, m - 1, 1))
  const lead = (first.getUTCDay() + 6) % 7 // จันทร์=0
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const total = Math.ceil((lead + daysInMonth) / 7) * 7
  const weeks: GridCell[][] = []
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(y, m - 1, 1 - lead + i))
    const cell: GridCell = {
      key: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === m - 1,
    }
    if (i % 7 === 0) weeks.push([])
    weeks[weeks.length - 1]!.push(cell)
  }
  return weeks
}

export type DayTone = 'late' | 'today' | 'normal' | 'done'

/** สถานะ → โทนสีเดียวทุกที่ (UX §0.2): ทำแล้ว · เลยกำหนด · ครบวันนี้ · ปกติ */
export function itemTone(i: { status: string; overdue: boolean; bucket: string }): DayTone {
  if (i.status !== 'OPEN') return 'done'
  if (i.overdue) return 'late'
  return i.bucket === 'today' ? 'today' : 'normal'
}

export type DayTally = Record<DayTone, number>

/** จัดกลุ่มรายการเข้า "วันไทย" ของ dueAt + นับต่อโทน — ปฏิทินมือถือ/ชีตวันใช้ตัวเดียวกัน */
export function groupByDay<T extends { dueAt: string; status: string; overdue: boolean; bucket: string }>(
  items: T[],
): { byDay: Map<string, T[]>; tally: Map<string, DayTally> } {
  const byDay = new Map<string, T[]>()
  const tally = new Map<string, DayTally>()
  for (const it of items) {
    const k = thaiDayKey(it.dueAt)
    if (!k) continue
    const list = byDay.get(k) ?? []
    list.push(it)
    byDay.set(k, list)
    const t = tally.get(k) ?? { late: 0, today: 0, normal: 0, done: 0 }
    t[itemTone(it)]++
    tally.set(k, t)
  }
  return { byDay, tally }
}

/** เดือนของวัน YYYY-MM-DD */
export const monthOfDay = (dayKey: string): string => dayKey.slice(0, 7)

/** เลื่อนวัน YYYY-MM-DD ± n วัน (UTC ล้วน ไม่พึ่ง TZ เครื่อง) */
export function shiftDay(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}
