// 00066 — กติกาบริสุทธิ์ (ไม่แตะ DB/นาฬิกา รับ now จากภายนอก) · นิยาม "เลยกำหนด/bucket" อยู่ที่นี่ที่เดียว (TD-FU-2)
import { thaiTodayBounds } from '@/lib/date-range'
import { BUBBLE_MAX, PUSH_TITLE_MAX } from '@/lib/follow-up-constants'
import { PUSH_TITLE, pushMultiBody } from '@/lib/follow-up-copy'
import { reminderFireAt, reminderWindowEnd } from '@/lib/follow-up-time'

const DAY_MS = 24 * 3600_000

export interface DueRow {
  status: string
  dueAt: Date
  allDay: boolean
}
export type Bucket = 'late' | 'today' | 'week' | 'later' | 'done'

/** เลยกำหนด: ต้อง OPEN ก่อนเสมอ · ทั้งวัน = ขึ้นวันใหม่ไทย · มีเวลา = dueAt < now (10:00:00 พอดียังไม่เลย) */
export function isOverdue(f: DueRow, now: Date): boolean {
  if (f.status !== 'OPEN') return false
  return f.allDay ? now.getTime() >= f.dueAt.getTime() + DAY_MS : f.dueAt.getTime() < now.getTime()
}

export function bucketOf(f: DueRow, now: Date): Bucket {
  if (f.status !== 'OPEN') return 'done'
  if (isOverdue(f, now)) return 'late'
  const to = thaiTodayBounds(now).to.getTime()
  const t = f.dueAt.getTime()
  if (t < to) return 'today'
  if (t < to + 7 * DAY_MS) return 'week'
  return 'later'
}

/** ตัวเลขเดียวของ "งานค้าง/เลยกำหนด" ทุกจอ (AC-ACT-22) */
export function countOpenAndLate(rows: DueRow[], now: Date): { open: number; late: number } {
  let open = 0
  let late = 0
  for (const r of rows) {
    if (r.status !== 'OPEN') continue
    open++
    if (isOverdue(r, now)) late++
  }
  return { open, late }
}

export type FilterState = 'late' | 'upcoming' | 'done'
/** สถานะต่อ cluster สำหรับตัวกรองกล่องแชท — ไม่เคยมีรายการ = null (ไม่ตก done) */
export function filterStateOf(c: { open: number; late: number; done: number }): FilterState | null {
  if (c.open >= 1) return c.late >= 1 ? 'late' : 'upcoming'
  return c.done >= 1 ? 'done' : null
}

/** เตือนได้ไหม: OPEN ∧ fireAt ≤ now ≤ windowEnd ∧ ยังไม่เคยจองค่า fireAt นี้ */
export function isReminderDue(
  f: DueRow & { remindedFor: Date | null },
  now: Date,
): boolean {
  if (f.status !== 'OPEN') return false
  const fire = reminderFireAt(f).getTime()
  const t = now.getTime()
  if (t < fire || t > reminderWindowEnd(f).getTime()) return false
  return f.remindedFor === null || f.remindedFor.getTime() !== fire
}

/** ค่า remindedFor ตอนสร้าง/แก้เวลา: fireAt ผ่านแล้ว (ย้อนหลัง) = จองไว้กันเตือนทันที · อนาคต = null */
export function initialRemindedFor(f: { dueAt: Date; allDay: boolean }, now: Date): Date | null {
  const fire = reminderFireAt(f)
  return fire.getTime() <= now.getTime() ? fire : null
}

/** ยังไม่มีคนรับ = ไม่มี assignee หรือไม่ใช่สมาชิกปัจจุบันของร้าน (BR-ACT-11) */
export function isUnassigned(
  row: { assigneeUserId: string | null },
  memberIds: ReadonlySet<string>,
): boolean {
  return row.assigneeUserId === null || !memberIds.has(row.assigneeUserId)
}

/** แผงห้อง: กางเองเมื่อมีรายการเลยกำหนด */
export function panelModel(rows: DueRow[], now: Date) {
  const { open, late } = countOpenAndLate(rows, now)
  return { openCount: open, lateCount: late, expanded: late >= 1 }
}

/** แถวของ bubble: OPEN ที่เป็น late/today · late ก่อน แล้วเรียง dueAt · ตัด BUBBLE_MAX · total/lateCount นับก่อนตัด */
export function bubbleRows<T extends DueRow>(rows: T[], now: Date) {
  const kept = rows
    .map((r) => ({ r, b: bucketOf(r, now) }))
    .filter((x) => x.b === 'late' || x.b === 'today')
    .sort((a, b) => (a.b === b.b ? a.r.dueAt.getTime() - b.r.dueAt.getTime() : a.b === 'late' ? -1 : 1))
  return {
    rows: kept.slice(0, BUBBLE_MAX).map((x) => x.r),
    total: kept.length,
    lateCount: kept.filter((x) => x.b === 'late').length,
  }
}

/** bubble: ไม่มีรายการ = ไม่มีปุ่ม · มือถือ+อยู่ในห้อง = ซ่อน (BR-ACT-21) */
export function bubbleModel(i: { total: number; lateCount: number; isMobile: boolean; inThread: boolean }) {
  const tone: 'none' | 'normal' | 'late' = i.total <= 0 ? 'none' : i.lateCount > 0 ? 'late' : 'normal'
  return { tone, visible: tone !== 'none' && !(i.isMobile && i.inThread) }
}

export interface ReminderItem {
  id: string
  shopId: string
  assigneeUserId: string | null
  conversationId: string
  title: string
  customerName?: string | null
}

/** 1 กลุ่มต่อ (ร้าน, ผู้รับ) — ไม่มีผู้รับ = ข้าม */
export function groupReminders<T extends ReminderItem>(items: T[]) {
  const m = new Map<string, { shopId: string; assigneeUserId: string; items: T[] }>()
  for (const it of items) {
    if (it.assigneeUserId === null) continue
    const k = `${it.shopId}\u0000${it.assigneeUserId}`
    const g = m.get(k) ?? { shopId: it.shopId, assigneeUserId: it.assigneeUserId, items: [] }
    g.items.push(it)
    m.set(k, g)
  }
  return [...m.values()]
}

function clip(s: string): string {
  const cp = Array.from(s)
  return cp.length <= PUSH_TITLE_MAX ? s : cp.slice(0, PUSH_TITLE_MAX - 1).join('') + '…'
}

/** payload push — อ่านเฉพาะ field ใน allow-list (ไม่มี note/เบอร์ — AC-ACT-38) */
export function buildReminderPush(items: ReminderItem[]) {
  const first = items[0]
  if (items.length === 1) {
    return {
      title: PUSH_TITLE,
      subtitle: first.customerName || undefined,
      body: clip(first.title),
      data: {
        type: 'follow-up',
        url: `/inbox/${first.conversationId}`,
        shopId: first.shopId,
        conversationId: first.conversationId,
        followUpId: first.id,
      },
    }
  }
  return {
    title: PUSH_TITLE,
    subtitle: undefined,
    body: pushMultiBody(items.length),
    data: {
      type: 'follow-up',
      url: `/follow-ups?mine=1&shopId=${encodeURIComponent(first.shopId)}`,
      shopId: first.shopId,
    },
  }
}
