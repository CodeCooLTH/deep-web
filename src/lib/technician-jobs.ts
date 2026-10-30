/**
 * technician-jobs — กติกาการแบ่งกลุ่มงานของ "มุมมองช่าง" (00086 P3 · T9 · BRD FR-008)
 *
 * ใช้ร่วมกันระหว่างหน้าแรกช่าง (TodayJobs) และหน้า "งานของฉัน" (/my-jobs) — แยกมาไว้ใน lib เพื่อให้เทสได้
 * โดยไม่ต้อง render (ui-boolean-needs-a-testable-home) และให้สองจอใช้นิยามเดียวกัน
 *
 * 🛑 "ของฉัน" เทียบด้วย `assignee.userId` เท่านั้น ห้ามเทียบชื่อ (ชื่อพนักงานซ้ำกันได้)
 * pure module — ใช้ได้ทั้ง server และ client
 */
import { isClosedAppointment } from './appointment-day-view'

export type JobAssignee = { userId: string; displayName: string }

export type TechnicianJobLike = {
  appointmentStatus: string | null
  /** ไม่มีคีย์/null = ยังไม่มีคนรับ */
  assignee?: JobAssignee | null
  serviceClosedAt?: string | Date | null
}

/** ตัวกรองบนหน้า "งานของฉัน" — `mine` = ของฉัน ∪ ยังไม่มีคนรับ (ต้นแบบ screenList · BRD FR-008) */
export type MyJobsFilter = 'mine' | 'all'

export const MY_JOBS_FILTERS: readonly { key: MyJobsFilter; label: string }[] = [
  { key: 'mine', label: 'งานของฉัน' },
  { key: 'all', label: 'ทั้งร้าน' },
]

/** งานนี้ปิดแล้วไหม — ร้านปิดงาน (serviceClosedAt) หรือผลนัดเป็นที่สุดแล้ว (ให้บริการแล้ว/ไม่มาตามนัด) */
export function isJobClosed(j: TechnicianJobLike): boolean {
  return j.serviceClosedAt != null || isClosedAppointment(j.appointmentStatus)
}

export function isMyJob(j: TechnicianJobLike, viewerUserId: string | null): boolean {
  return viewerUserId != null && j.assignee?.userId === viewerUserId
}

export function isUnassignedJob(j: TechnicianJobLike): boolean {
  return !j.assignee
}

/**
 * หน้าแรกช่าง: "งานของฉันวันนี้" (ของฉัน ∧ ยังไม่ปิด) + "ยังไม่มีคนรับ" (ไม่มีคนรับ ∧ ยังไม่ปิด)
 * งานปิดแล้วไม่อยู่ทั้งสองกอง — หน้าแรกบอก "สิ่งที่ต้องทำ" ไม่ใช่ประวัติ
 */
export function technicianTodayGroups<T extends TechnicianJobLike>(
  items: readonly T[],
  viewerUserId: string | null,
): { mine: T[]; unassigned: T[] } {
  const open = items.filter((j) => !isJobClosed(j))
  return {
    mine: open.filter((j) => isMyJob(j, viewerUserId)),
    unassigned: open.filter(isUnassignedJob),
  }
}

/**
 * หน้า "งานของฉัน": แบ่งเป็น ค้างจากวันก่อน · ยังไม่ระบุเวลา · วันนี้ที่ยังไม่ปิด · ปิดงานแล้ว
 *
 * - ค้างจากวันก่อน: มาจาก endpoint carry-over (ของผู้ดูเท่านั้น) · แสดง **เฉพาะตัวกรอง "งานของฉัน"**
 *   (Controller decision Q2 2026-10-27) — ตัวกรอง "ทั้งร้าน" คือภาพของวันนี้ทั้งร้าน ไม่ใช่งานค้างของฉัน
 *   ว่าง = ไม่ render กลุ่มเลย (ผู้เรียกเช็ก `carryOver.length`)
 * - ยังไม่ระบุเวลา (00086 M1 · Controller decision (a) 2026-10-29): งานที่มอบให้ฉันแต่ไม่มีเวลานัด — ไม่อยู่ในรายการวันนี้
 *   (คัดด้วยช่วงเวลา) ถ้าไม่มีกลุ่มนี้ งานจะหายจากทุกจอของช่าง · กติกาเดียวกับค้างจากวันก่อน (ของฉัน · ตัวกรอง "งานของฉัน" · ว่าง = ไม่ render)
 *   ไม่นับรวมใน TodayJobs หน้าแรก (นั่นคือ "วันนี้" เท่านั้น)
 * - ตัวกรอง "งานของฉัน" = ของฉัน ∪ ยังไม่มีคนรับ (ไม่ใช่ของฉันอย่างเดียว — งานที่ยังไม่มีคนรับคือสิ่งที่ช่างกดรับได้)
 */
export function myJobsSections<T extends TechnicianJobLike, U extends TechnicianJobLike = T>(
  today: readonly T[],
  carryOver: readonly T[],
  filter: MyJobsFilter,
  viewerUserId: string | null,
  unscheduled: readonly U[] = [],
): { carryOver: T[]; unscheduled: U[]; open: T[]; closed: T[] } {
  const scoped = filter === 'mine' ? today.filter((j) => isMyJob(j, viewerUserId) || isUnassignedJob(j)) : [...today]
  return {
    carryOver: filter === 'mine' ? carryOver.filter((j) => isMyJob(j, viewerUserId)) : [],
    // server คัด "ของฉัน ∧ ยังไม่ปิด" มาแล้ว — กรองซ้ำที่นี่ให้เป็นนิยามเดียวกับกลุ่มอื่น (ไม่เชื่อผู้ส่งฝ่ายเดียว)
    unscheduled: filter === 'mine' ? unscheduled.filter((j) => isMyJob(j, viewerUserId) && !isJobClosed(j)) : [],
    open: scoped.filter((j) => !isJobClosed(j)),
    closed: scoped.filter(isJobClosed),
  }
}

/** ข้อความผู้รับผิดชอบสำหรับ who-line และส่วนต่อท้าย aria-label (คำเดียวกันทุกจอ) */
export const UNASSIGNED_LABEL = 'ยังไม่มีคนรับ'

export function assigneeAriaSuffix(assignee: JobAssignee | null | undefined): string {
  return assignee ? ` ผู้รับผิดชอบ ${assignee.displayName}` : ` ${UNASSIGNED_LABEL}`
}
