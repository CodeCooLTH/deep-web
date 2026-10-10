/**
 * shop-role-picker — ตรรกะ + ข้อความของตัวเลือกบทบาทพนักงาน (00071 P2 · T5)
 *
 * ไฟล์บริสุทธิ์ client-safe: ทุกการตัดสินใจของ UI (ซ่อน BILLING, ปุ่มบันทึกกดได้ไหม, ลำดับ)
 * อยู่ที่นี่เพื่อให้เทส mutation จับได้ — component แค่เรียกใช้ (ui-boolean-needs-a-testable-home)
 * copy = SSOT ตาม docs/superpowers/specs/2026-10-10-00071-p2-role-picker-ux-spec.md
 */

import { STAFF_ROLES } from '@/lib/shop-permissions'

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
  return null
}
