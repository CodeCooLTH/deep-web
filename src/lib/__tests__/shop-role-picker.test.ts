import { describe, it, expect } from 'vitest'
import {
  staffRoleOptions,
  toggleStaffRole,
  canSubmitRoles,
  rolesDiffer,
  managerCoversOthers,
  roleErrorText,
  rolesSummary,
} from '../shop-role-picker'

describe('shop-role-picker', () => {
  it('[blocker] BILLING ซ่อนเมื่อร้านไม่ขายบริการ · โชว์เมื่อขาย', () => {
    expect(staffRoleOptions(false).map((o) => o.role)).toEqual(['MANAGER', 'CHAT', 'TECHNICIAN'])
    expect(staffRoleOptions(true).map((o) => o.role)).toEqual(['MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN'])
  })
  it('[blocker] drift: ติ๊ก BILLING อยู่บนร้านที่ไม่ขายบริการ → โชว์แบบ blocked และบันทึกไม่ได้', () => {
    const o = staffRoleOptions(false, ['BILLING']).find((x) => x.role === 'BILLING')
    expect(o?.blocked).toBe(true)
    expect(staffRoleOptions(true, ['BILLING']).find((x) => x.role === 'BILLING')?.blocked).toBe(false)
    expect(canSubmitRoles(['BILLING'], false)).toBe(false)
    expect(canSubmitRoles(['MANAGER', 'BILLING'], false)).toBe(false)
    expect(canSubmitRoles(['BILLING'], true)).toBe(true)
  })
  it('[blocker] canSubmitRoles ห้ามว่าง/ซ้ำ/บทบาทแปลก', () => {
    expect(canSubmitRoles([], true)).toBe(false)
    expect(canSubmitRoles(['CHAT', 'CHAT'], true)).toBe(false)
    expect(canSubmitRoles(['OWNER'], true)).toBe(false)
    expect(canSubmitRoles(['CHAT'], true)).toBe(true)
  })
  it('[blocker] toggle คืนเรียงตามลำดับมาตรฐานไม่ว่ากดลำดับไหน', () => {
    let s: string[] = []
    s = toggleStaffRole(s, 'TECHNICIAN')
    s = toggleStaffRole(s, 'MANAGER')
    s = toggleStaffRole(s, 'CHAT')
    expect(s).toEqual(['MANAGER', 'CHAT', 'TECHNICIAN'])
    expect(toggleStaffRole(s, 'CHAT')).toEqual(['MANAGER', 'TECHNICIAN'])
  })
  it('rolesDiffer เทียบเป็นเซ็ต', () => {
    expect(rolesDiffer(['CHAT', 'MANAGER'], ['MANAGER', 'CHAT'])).toBe(false)
    expect(rolesDiffer(['CHAT'], ['CHAT', 'MANAGER'])).toBe(true)
    expect(rolesDiffer(['CHAT'], ['MANAGER'])).toBe(true)
  })
  it('managerCoversOthers ต้องมี MANAGER + อย่างน้อยอีก 1', () => {
    expect(managerCoversOthers(['MANAGER'])).toBe(false)
    expect(managerCoversOthers(['MANAGER', 'CHAT'])).toBe(true)
    expect(managerCoversOthers(['CHAT', 'BILLING'])).toBe(false)
  })
  it('roleErrorText แยกคำกริยาตาม action · รหัสอื่น null', () => {
    expect(roleErrorText('INVALID_ROLES', 'create')).toContain('กดสร้างลิงก์อีกครั้ง')
    expect(roleErrorText('BILLING_NOT_AVAILABLE', 'save')).toContain('บันทึกอีกครั้ง')
    expect(roleErrorText('NOPE', 'save')).toBeNull()
    expect(rolesSummary(['CHAT', 'MANAGER'])).toBe('ผู้ดูแล · ตอบแชท')
  })
})
