/**
 * assignee-load — เลือกผู้รับผิดชอบเมื่อร้านมีช่างเยอะ (00086 · มติ user 2026-10-30 · prototype v14 "ร้านมีช่าง 10 คน")
 *
 * - ช่างไม่เกิน ASSIGNEE_CHIPS_MAX คน = ชิปเรียงแบบเดิม · เกิน = ช่องเดียว + ชีตค้นชื่อ
 * - ในชีต แต่ละคนมี "ว่างช่วงนี้ / ติดงาน HH:mm–HH:mm" + "วันนี้ N งาน" · คนว่างขึ้นก่อน
 *
 * 🛑 ทุกการตัดสิน (เกณฑ์ชิป · คัดค้น · เรียง · ชนเวลา · ช่วงเวลาของฟอร์ม) อยู่ที่นี่ ไม่ใช่ในเทอร์นารีกลาง JSX
 * (docs/conventions/ui-boolean-needs-a-testable-home.md) · server ใช้ computeStaffLoad ตัวเดียวกัน
 */
import { thaiDateBounds } from '@/lib/appointment-day'
import { walkInWindow } from '@/lib/appointments'
import { todayThaiIsoDate } from '@/lib/date-range'

/** เกินนี้ ชิปยาวเกิน 2 แถวบนมือถือ → เปลี่ยนเป็นช่องเลือก + ชีตค้นชื่อ */
export const ASSIGNEE_CHIPS_MAX = 6

/** ภาระงานของช่างหนึ่งคนในวันของช่วงที่ถาม — ไม่มีข้อมูลลูกค้า */
export interface StaffLoad {
  /** งานที่มอบให้คนนี้ในวันเดียวกัน (ปฏิทินไทย) ไม่นับงานที่กำลังมอบ */
  dayJobs: number
  /** งานที่ยังไม่จบซึ่งเวลาซ้อนช่วงที่ถาม (ตัวแรกตามเวลา) — null = ว่าง */
  clash: { start: string; end: string } | null
}

export interface LoadWindow {
  from: Date
  to: Date
}

/** ใช้ช่องเลือก + ชีตค้นชื่อแทนชิปไหม */
export function usesAssigneeSearch(count: number): boolean {
  return count > ASSIGNEE_CHIPS_MAX
}

/** คัดตามคำค้น (ไม่สนตัวพิมพ์ · ช่องว่างหัวท้าย) — คำค้นว่าง = ทุกคน */
export function matchesStaffQuery(name: string, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('th')
  return !q || name.toLocaleLowerCase('th').includes(q)
}

/**
 * คนว่างก่อน แล้วงานน้อยก่อน · เท่ากันคงลำดับเดิม (ชื่อตามที่ server เรียง)
 * ไม่มีภาระงาน (ไม่ได้ส่งช่วงเวลา) = คงลำดับเดิมทั้งหมด
 */
export function sortStaffByAvailability<T extends { load?: StaffLoad | null }>(staff: readonly T[]): T[] {
  // Array#sort เสถียร (ES2019) — คืน 0 = คงลำดับเดิม
  return [...staff].sort((a, b) => {
    if (!a.load || !b.load) return 0
    return Number(!!a.load.clash) - Number(!!b.load.clash) || a.load.dayJobs - b.load.dayJobs
  })
}

/** ช่วงที่ยาวที่สุดที่ถามได้ (นัดรายวัน = 1 วัน) — กันคำขอกว้างผิดปกติ */
const MAX_WINDOW_MS = 2 * 86_400_000

/** อ่าน ?from=&to= ของ GET service-staff — ผิดรูป/กลับด้าน/กว้างเกิน = null (คืนรายชื่ออย่างเดียวแบบเดิม) */
export function parseLoadWindow(from: string | null, to: string | null): LoadWindow | null {
  if (!from || !to) return null
  const f = new Date(from), t = new Date(to)
  if (isNaN(f.getTime()) || isNaN(t.getTime())) return null
  if (t.getTime() <= f.getTime() || t.getTime() - f.getTime() > MAX_WINDOW_MS) return null
  return { from: f, to: t }
}

/** query ของ GET service-staff — shopId (ร้านของฟอร์ม) + ช่วงเวลา + งานที่กำลังมอบ · ไม่มีช่วง = รายชื่ออย่างเดียว */
export function staffQuery(args: { shopId?: string | null; window?: LoadWindow | null; excludeToken?: string | null }): string {
  const q = new URLSearchParams()
  if (args.shopId) q.set('shopId', args.shopId)
  if (args.window) {
    q.set('from', args.window.from.toISOString())
    q.set('to', args.window.to.toISOString())
    if (args.excludeToken) q.set('exclude', args.excludeToken)
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** ขอบวัน (ปฏิทินไทย) ของวันที่ช่วงนี้เริ่ม — ใช้นับ "วันนี้ N งาน" */
export function loadDayBounds(window: LoadWindow): LoadWindow {
  return thaiDateBounds(todayThaiIsoDate(window.from))!
}

/** แถวงานที่ server ดึงมา (เฉพาะงานที่มอบแล้ว ในวันนั้น · ไม่ใช่ร่าง/ยกเลิก/คืน) */
export interface LoadJobRow {
  assignedUserId: string | null
  publicToken: string
  serviceStart: Date | null
  serviceEnd: Date | null
  serviceFinishedAt: Date | null
  serviceClosedAt: Date | null
  appointmentStatus: string | null
}

/**
 * นับภาระงานต่อคน — งานที่ "ยังไม่จบ" เท่านั้นที่นับว่าชนเวลา
 * (ทำเสร็จ/ปิดแล้ว/ไม่มาตามนัด/ให้บริการแล้ว = คนนั้นว่างแล้ว) · งานที่กำลังมอบ (exclude) ไม่นับทั้งสองอย่าง
 */
export function computeStaffLoad(
  userIds: readonly string[],
  rows: readonly LoadJobRow[],
  window: LoadWindow,
  excludeToken?: string | null,
): Map<string, StaffLoad> {
  const out = new Map<string, StaffLoad>(userIds.map((id) => [id, { dayJobs: 0, clash: null }]))
  const sorted = [...rows].sort((a, b) => (a.serviceStart?.getTime() ?? 0) - (b.serviceStart?.getTime() ?? 0))
  for (const r of sorted) {
    if (!r.assignedUserId || r.publicToken === excludeToken) continue
    const load = out.get(r.assignedUserId)
    if (!load) continue
    load.dayJobs += 1
    const open =
      !r.serviceFinishedAt && !r.serviceClosedAt && r.appointmentStatus !== 'NO_SHOW' && r.appointmentStatus !== 'COMPLETED'
    if (
      !load.clash && open && r.serviceStart && r.serviceEnd &&
      r.serviceStart.getTime() < window.to.getTime() && r.serviceEnd.getTime() > window.from.getTime()
    ) {
      load.clash = { start: r.serviceStart.toISOString(), end: r.serviceEnd.toISOString() }
    }
  }
  return out
}

/**
 * ช่วงเวลาของงานที่กำลังกรอกในฟอร์มสร้าง — สูตรเดียวกับตอนกดบันทึก (OrderCreateForm.onSubmit)
 * หน้าร้าน = walkInWindow (ตัวเดียวกับ server) · นัดรายวัน = ทั้งวัน · นัดรายเวลา = วันที่ + เวลาเริ่ม/จบ
 * ข้อมูลไม่ครบ = null (ชีตแสดงชื่ออย่างเดียว ไม่มีป้ายว่าง/ติดงาน)
 */
export function assigneeFormWindow(args: {
  arrival: 'BOOKED' | 'WALK_IN' | undefined
  date?: string
  startTime?: string
  endTime?: string
  granularity: 'DAY' | 'TIME'
  walkInMinutes?: number | null
  now: Date
}): LoadWindow | null {
  if (args.arrival === 'WALK_IN') {
    const w = walkInWindow(args.now, args.walkInMinutes)
    return { from: w.start, to: w.end }
  }
  if (!args.date) return null
  let from: Date, to: Date
  if (args.granularity === 'DAY') {
    from = new Date(`${args.date}T00:00`)
    to = new Date(from.getTime() + 86_400_000)
  } else {
    if (!args.startTime || !args.endTime) return null
    from = new Date(`${args.date}T${args.startTime}`)
    to = new Date(`${args.date}T${args.endTime}`)
  }
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to.getTime() <= from.getTime()) return null
  return { from, to }
}
