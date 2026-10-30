/**
 * shop-role-picker — ตรรกะ + ข้อความของตัวเลือกบทบาทพนักงาน (00071 P2 · T5)
 *
 * ไฟล์บริสุทธิ์ client-safe: ทุกการตัดสินใจของ UI (ซ่อน BILLING, ปุ่มบันทึกกดได้ไหม, ลำดับ)
 * อยู่ที่นี่เพื่อให้เทส mutation จับได้ — component แค่เรียกใช้ (ui-boolean-needs-a-testable-home)
 * copy = SSOT ตาม docs/superpowers/specs/2026-10-10-00071-p2-role-picker-ux-spec.md
 */

import { STAFF_ROLES, closeJobFlagState } from '@/lib/shop-permissions'

export type StaffRole = (typeof STAFF_ROLES)[number]

export const STAFF_ROLE_COPY: Record<StaffRole, { label: string; description: string }> = {
  MANAGER: { label: 'ผู้ดูแล', description: 'ดูแลงานร้านได้เกือบทั้งหมด ยกเว้นการเงิน สมาชิก และบัญชีรับเงิน' },
  CHAT: { label: 'ตอบแชท', description: 'อ่านและตอบแชททุกห้อง สร้างออเดอร์ เห็นราคารายใบ ไม่เห็นยอดขายรวมและกำไร' },
  BILLING: { label: 'เปิดบิล', description: 'เปิดบิลบริการและพิมพ์ใบเสร็จ เห็นราคารายใบ ไม่เห็นแชท' },
  TECHNICIAN: { label: 'ฝ่ายช่าง', description: 'ดูงานทั้งหมด อัปเดตสถานะและผลเข้ารับบริการ ไม่เห็นราคาและแชท' },
}

export const BILLING_DRIFT_TEXT = 'ร้านนี้ไม่ได้ขายบริการแล้ว เอาเปิดบิลออกก่อนบันทึก'
export const COVERS_HINT = 'ผู้ดูแลมีสิทธิ์ของบทบาทอื่นครบอยู่แล้ว การเลือกบทบาทอื่นเพิ่มจึงไม่ได้ให้สิทธิ์เพิ่ม'
export const FINANCE_NOTE = 'ยอดขายรวม กำไร ต้นทุน และกระเป๋าเงินของร้าน เห็นได้เฉพาะเจ้าของร้าน'

export type RoleAction = 'create' | 'save'
const ACTION_VERB: Record<RoleAction, string> = { create: 'สร้างลิงก์', save: 'บันทึก' }

export const emptyRolesText = (action: RoleAction) => `เลือกอย่างน้อย 1 บทบาทก่อน${ACTION_VERB[action]}`

export interface StaffRoleOption {
  role: StaffRole
  label: string
  description: string
  /** ติ๊กอยู่แต่ใช้ไม่ได้ (ข้อมูลเคลื่อน: BILLING บนร้านที่ไม่ขายบริการ) — ต้องเอาออกก่อนบันทึก */
  blocked: boolean
}

/**
 * ตัวเลือกที่แสดง ตามลำดับมาตรฐาน — BILLING ซ่อน (ไม่ใช่ disable) เมื่อร้านไม่ขายบริการ
 * ยกเว้น drift: ถ้า `selected` มี BILLING อยู่แล้ว ต้องโชว์ให้ผู้ใช้เห็นและเอาออกเองได้
 */
export function staffRoleOptions(billingAvailable: boolean, selected: readonly string[] = []): StaffRoleOption[] {
  return STAFF_ROLES.filter((r) => r !== 'BILLING' || billingAvailable || selected.includes('BILLING')).map((role) => ({
    role,
    ...STAFF_ROLE_COPY[role],
    blocked: role === 'BILLING' && !billingAvailable,
  }))
}

/** สลับบทบาท คืนอาร์เรย์ใหม่เรียงตามลำดับมาตรฐานเสมอ (ไม่ขึ้นกับลำดับที่ผู้ใช้กด) */
export function toggleStaffRole(selected: readonly string[], role: StaffRole): StaffRole[] {
  const next = new Set(selected)
  if (next.has(role)) next.delete(role)
  else next.add(role)
  return STAFF_ROLES.filter((r) => next.has(r))
}

/** ≥1 · ไม่ซ้ำ · เป็นบทบาทพนักงานที่รู้จัก · ไม่มี BILLING เมื่อร้านไม่ขายบริการ */
export function canSubmitRoles(selected: readonly string[], billingAvailable: boolean): boolean {
  if (selected.length === 0) return false
  if (new Set(selected).size !== selected.length) return false
  if (!selected.every((r) => (STAFF_ROLES as readonly string[]).includes(r))) return false
  if (!billingAvailable && selected.includes('BILLING')) return false
  return true
}

/** เทียบเป็นเซ็ต — ลำดับไม่มีผล */
export function rolesDiffer(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size !== sb.size) return true
  for (const r of sa) if (!sb.has(r)) return true
  return false
}

export function managerCoversOthers(selected: readonly string[]): boolean {
  return selected.includes('MANAGER') && selected.length > 1
}

/** ป้ายบทบาทคั่นด้วย " · " ตามลำดับมาตรฐาน (ใช้ใน toast) */
export function rolesSummary(roles: readonly string[]): string {
  return STAFF_ROLES.filter((r) => roles.includes(r)).map((r) => STAFF_ROLE_COPY[r].label).join(' · ')
}

/** ข้อความของ error ที่เกี่ยวกับบทบาท — รหัสอื่นคืน null ให้ caller ใช้ข้อความกลาง */
export function roleErrorText(code: string, action: RoleAction): string | null {
  const verb = ACTION_VERB[action]
  if (code === 'INVALID_ROLES') return `บทบาทที่เลือกใช้ไม่ได้ ลองเลือกใหม่แล้วกด${verb}อีกครั้ง ถ้ายังไม่ได้ให้โหลดหน้านี้ใหม่`
  if (code === 'BILLING_NOT_AVAILABLE') return `ร้านนี้ไม่ได้ขายบริการ จึงใช้บทบาทเปิดบิลไม่ได้ เอาเปิดบิลออกแล้ว${verb}อีกครั้ง`
  // 00086 — ตัวเลือกในฟอร์มกันไว้แล้ว รหัสนี้มาได้จากข้อมูลเคลื่อน (หลายแท็บ / ร้านเปลี่ยนประเภทระหว่างเปิดฟอร์ม)
  if (code === 'CLOSE_JOB_NEEDS_START_ROLE') return `ปิดงานได้ ต้องใช้คู่กับ ตอบแชท หรือ ฝ่ายช่าง เลือกบทบาทเพิ่มหรือเอาปิดงานได้ออก แล้ว${verb}อีกครั้ง`
  if (code === 'STAFF_FLAGS_NOT_AVAILABLE') return `ร้านนี้ไม่ได้ขายบริการแล้ว จึงตั้งปิดงานได้และบันทึกค่าใช้จ่ายได้ไม่ได้ โหลดหน้านี้ใหม่แล้ว${verb}อีกครั้ง`
  return null
}

// ─── 00086 สิทธิ์เพิ่มรายคน (การ์ดที่ 5–6 · ร้านบริการเท่านั้น) ────────────────────────────────
// กติกาฝั่ง server อยู่ที่ shop-permissions (closeJobFlagState) + shop-role-assignment (validateStaffFlags)
// ไฟล์นี้แค่แปลงเป็นสิ่งที่ UI ต้องแสดง/ส่ง — ห้ามเขียนกติกาซ้ำ

export interface StaffFlags {
  canCloseJob: boolean
  canRecordExpense: boolean
}

export const NO_STAFF_FLAGS: StaffFlags = { canCloseJob: false, canRecordExpense: false }

export const CLOSE_JOB_COPY = {
  label: 'ปิดงานได้',
  description: 'กด "ปิดงาน" ได้ · ไม่ติ๊ก = ทำเสร็จแล้วส่งให้คนที่มีสิทธิ์ปิดต่อ',
  lockedDescription: 'ผู้ดูแลปิดงานได้อยู่แล้ว',
  disabledDescription: 'ใช้คู่กับ ตอบแชท หรือ ฝ่ายช่าง (บทบาทที่เริ่มงานได้)',
} as const

export const RECORD_EXPENSE_COPY = {
  label: 'บันทึกค่าใช้จ่ายได้',
  description: 'เพิ่ม แก้ และลบค่าใช้จ่ายที่ตัวเองบันทึก · ไม่เห็นรายการคนอื่น ยอดรวม และกำไร',
} as const

export interface FlagCardState {
  checked: boolean
  disabled: boolean
  description: string
  /** ข้อความเป็นคำเตือน (โทนเดียวกับ BILLING_DRIFT_TEXT) */
  warn: boolean
}

/** การ์ด "ปิดงานได้" — ผู้ดูแล = ติ๊กค้างแก้ไม่ได้ · ไม่มีบทบาทเริ่มงาน = ปิดไว้ไม่ติ๊ก · นอกนั้นตามธง */
export function closeJobCard(roles: readonly string[], flags: StaffFlags): FlagCardState {
  const state = closeJobFlagState(roles)
  if (state === 'LOCKED_ON') return { checked: true, disabled: true, description: CLOSE_JOB_COPY.lockedDescription, warn: false }
  if (state === 'DISABLED') return { checked: false, disabled: true, description: CLOSE_JOB_COPY.disabledDescription, warn: true }
  return { checked: flags.canCloseJob, disabled: false, description: CLOSE_JOB_COPY.description, warn: false }
}

/**
 * ธงหลังเปลี่ยนบทบาท — ถ้าชุดใหม่ไม่มีบทบาทเริ่มงาน ปลดปิดงานออก (UI กับสิ่งที่ส่ง API ต้องตรงกัน:
 * การ์ดโชว์ "ไม่ติ๊ก" แต่ส่ง true ไป = server ตอบ CLOSE_JOB_NEEDS_START_ROLE ทั้งที่ผู้ใช้มองไม่เห็นสาเหตุ)
 * คืนอ็อบเจกต์เดิมถ้าไม่มีอะไรเปลี่ยน (caller ใช้ === เช็คก่อน emit ได้)
 */
export function reconcileFlags(roles: readonly string[], flags: StaffFlags): StaffFlags {
  if (flags.canCloseJob && closeJobFlagState(roles) === 'DISABLED') return { ...flags, canCloseJob: false }
  return flags
}

/**
 * ธงหลังผู้ใช้กดการ์ดบทบาท (มติ user 2026-10-30): **เพิ่ม "ฝ่ายช่าง" ⇒ ติ๊ก "ปิดงานได้" ให้อัตโนมัติ**
 * — ช่างส่วนใหญ่ปิดงานเอง · ไม่ติ๊กให้ = เจ้าของต้องปิดเองทุกงานโดยไม่รู้ตัว · ติ๊กออกได้เสมอ (การ์ดยัง EDITABLE)
 * ติ๊กให้เฉพาะจังหวะที่ "เพิ่ม" ช่างเข้ามา — แก้บทบาทอื่นของคนที่เป็นช่างอยู่แล้ว ไม่ไปทับค่าที่เจ้าของติ๊กออกไว้
 * จากนั้นผ่าน reconcileFlags เสมอ (ชุดใหม่ไม่มีบทบาทเริ่มงาน ⇒ ปลด)
 */
export function flagsAfterRoleToggle(prev: readonly string[], next: readonly string[], flags: StaffFlags): StaffFlags {
  const addedTechnician = !prev.includes('TECHNICIAN') && next.includes('TECHNICIAN')
  const base =
    addedTechnician && !flags.canCloseJob && closeJobFlagState(next) === 'EDITABLE' ? { ...flags, canCloseJob: true } : flags
  return reconcileFlags(next, base)
}

export function flagsDiffer(a: StaffFlags, b: StaffFlags): boolean {
  return a.canCloseJob !== b.canCloseJob || a.canRecordExpense !== b.canRecordExpense
}

/** ส่งธงไป API เฉพาะร้านบริการ — ร้านอื่นไม่ส่งเลย (ส่ง true ไป = STAFF_FLAGS_NOT_AVAILABLE) */
export function flagsPayload(serviceFlagsAvailable: boolean, flags: StaffFlags): Partial<StaffFlags> {
  return serviceFlagsAvailable ? { canCloseJob: flags.canCloseJob, canRecordExpense: flags.canRecordExpense } : {}
}

/**
 * ป้ายธงในรายชื่อสมาชิก/ลิงก์เชิญ — ร้านไม่ใช่บริการ = ไม่โชว์ (ธงค้างไม่มีผล: stored-flag-vs-owner-truth)
 * ปิดงาน: โชว์เฉพาะตอนธงมีผลจริงและไม่ซ้ำกับบทบาท (ผู้ดูแลปิดได้อยู่แล้ว · ไม่มีบทบาทเริ่มงาน = ไม่มีผล)
 */
export function staffFlagChips(
  serviceFlagsAvailable: boolean,
  roles: readonly string[],
  flags: Partial<StaffFlags>,
): string[] {
  if (!serviceFlagsAvailable) return []
  const out: string[] = []
  if (flags.canCloseJob === true && closeJobFlagState(roles) === 'EDITABLE') out.push(CLOSE_JOB_COPY.label)
  if (flags.canRecordExpense === true) out.push(RECORD_EXPENSE_COPY.label)
  return out
}

/** ฟอร์มแก้สมาชิกมีอะไรเปลี่ยนไหม — ธงนับเฉพาะร้านบริการ (ร้านอื่นไม่ได้แสดง/ไม่ได้ส่ง) */
export function memberDraftChanged(
  draft: { roles: readonly string[]; flags: StaffFlags },
  initial: { roles: readonly string[]; flags: StaffFlags },
  serviceFlagsAvailable: boolean,
): boolean {
  return rolesDiffer(draft.roles, initial.roles) || (serviceFlagsAvailable && flagsDiffer(draft.flags, initial.flags))
}

/**
 * 00086 P3 — แก้บทบาท/โอนเจ้าของ/ลบสมาชิก ทำให้งานบริการที่ยังเปิดของเขากลับเป็น "ยังไม่มีคนรับ" ⇒ ผลข้างเคียงต้องไม่เงียบ
 * ต่อท้าย toast เดิมด้วยจำนวนจาก API (`unassignedJobCount`) · 0/ไม่มีค่า/ค่าแปลก = toast เดิมตรงตัว (ร้านสินค้าได้ 0 เสมอ)
 * copy = UX spec 00086 P3 §ถอดบทบาทฝ่ายช่าง
 */
export function withUnassignedJobsNote(message: string, unassignedJobCount: unknown): string {
  const n = typeof unassignedJobCount === 'number' && Number.isInteger(unassignedJobCount) ? unassignedJobCount : 0
  return n > 0 ? `${message} · งานที่ยังไม่ปิด ${n} งานกลับเป็น "ยังไม่มีคนรับ"` : message
}
