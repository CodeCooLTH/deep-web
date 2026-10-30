import { describe, it, expect } from 'vitest'
import {
  staffRoleOptions,
  toggleStaffRole,
  canSubmitRoles,
  rolesDiffer,
  managerCoversOthers,
  roleErrorText,
  rolesSummary,
  NO_STAFF_FLAGS,
  closeJobCard,
  flagsDiffer,
  flagsPayload,
  memberDraftChanged,
  reconcileFlags,
  flagsAfterRoleToggle,
  staffFlagChips,
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

// ─── 00086 ธงสิทธิ์รายคน ─────────────────────────────────────────────────────

describe('shop-role-picker — 00086 ธง', () => {
  const close = { canCloseJob: true, canRecordExpense: false }
  const exp = { canCloseJob: false, canRecordExpense: true }
  const both = { canCloseJob: true, canRecordExpense: true }

  it('flagsDiffer ดูทีละธง', () => {
    expect(flagsDiffer(NO_STAFF_FLAGS, { ...NO_STAFF_FLAGS })).toBe(false)
    expect(flagsDiffer(NO_STAFF_FLAGS, close)).toBe(true)
    expect(flagsDiffer(NO_STAFF_FLAGS, exp)).toBe(true)
    expect(flagsDiffer(both, both)).toBe(false)
  })

  it('[blocker] roleErrorText แปลรหัสธงทั้งสอง พร้อมคำกริยาตาม action', () => {
    expect(roleErrorText('CLOSE_JOB_NEEDS_START_ROLE', 'save')).toContain('ตอบแชท หรือ ฝ่ายช่าง')
    expect(roleErrorText('CLOSE_JOB_NEEDS_START_ROLE', 'save')).toContain('บันทึกอีกครั้ง')
    expect(roleErrorText('STAFF_FLAGS_NOT_AVAILABLE', 'create')).toContain('สร้างลิงก์อีกครั้ง')
    expect(roleErrorText('STAFF_FLAGS_NOT_AVAILABLE', 'save')).toContain('ไม่ได้ขายบริการ')
  })

  it('[blocker] closeJobCard: ผู้ดูแล = ติ๊กค้าง · ไม่มีบทบาทเริ่มงาน = ปิด+เตือน · นอกนั้นตามธง', () => {
    expect(closeJobCard(['MANAGER', 'BILLING'], NO_STAFF_FLAGS)).toEqual({ checked: true, disabled: true, description: 'ผู้ดูแลปิดงานได้อยู่แล้ว', warn: false })
    expect(closeJobCard(['BILLING'], close)).toMatchObject({ checked: false, disabled: true, warn: true })
    expect(closeJobCard([], close)).toMatchObject({ checked: false, disabled: true })
    expect(closeJobCard(['CHAT'], close)).toMatchObject({ checked: true, disabled: false, warn: false })
    expect(closeJobCard(['TECHNICIAN'], NO_STAFF_FLAGS)).toMatchObject({ checked: false, disabled: false })
  })

  // มติ user 2026-10-30 — เลือกฝ่ายช่าง = ติ๊ก "ปิดงานได้" ให้ · ติ๊กออกได้ · ไม่ทับค่าที่ติ๊กออกไว้
  it('[blocker] flagsAfterRoleToggle: เพิ่มฝ่ายช่าง ⇒ ติ๊กปิดงานให้ (ค่าใช้จ่ายไม่แตะ)', () => {
    expect(flagsAfterRoleToggle([], ['TECHNICIAN'], NO_STAFF_FLAGS)).toEqual({ canCloseJob: true, canRecordExpense: false })
    expect(flagsAfterRoleToggle(['CHAT'], ['CHAT', 'TECHNICIAN'], exp)).toEqual(both)
    expect(flagsAfterRoleToggle(['BILLING'], ['BILLING', 'TECHNICIAN'], NO_STAFF_FLAGS).canCloseJob).toBe(true)
  })
  it('[blocker] flagsAfterRoleToggle: เป็นช่างอยู่แล้ว / เพิ่มบทบาทอื่น / ผู้ดูแล ⇒ ไม่ติ๊กให้ (ไม่ทับค่าที่ติ๊กออก)', () => {
    expect(flagsAfterRoleToggle(['TECHNICIAN'], ['TECHNICIAN', 'BILLING'], NO_STAFF_FLAGS)).toBe(NO_STAFF_FLAGS)
    expect(flagsAfterRoleToggle([], ['CHAT'], NO_STAFF_FLAGS)).toBe(NO_STAFF_FLAGS)
    // ผู้ดูแล: การ์ดติ๊กค้างโดยบทบาท (LOCKED_ON) — ไม่ต้องเก็บธงซ้ำ
    expect(flagsAfterRoleToggle(['MANAGER'], ['MANAGER', 'TECHNICIAN'], NO_STAFF_FLAGS)).toBe(NO_STAFF_FLAGS)
    // เอาช่างออกจนไม่มีบทบาทเริ่มงาน ⇒ ปลดตาม reconcileFlags
    expect(flagsAfterRoleToggle(['TECHNICIAN', 'BILLING'], ['BILLING'], close)).toEqual(NO_STAFF_FLAGS)
  })

  it('[blocker] reconcileFlags ปลดปิดงานเมื่อไม่มีบทบาทเริ่มงาน · ไม่เปลี่ยน = อ็อบเจกต์เดิม', () => {
    expect(reconcileFlags(['BILLING'], both)).toEqual(exp)
    expect(reconcileFlags([], close)).toEqual(NO_STAFF_FLAGS)
    expect(reconcileFlags(['CHAT'], both)).toBe(both)
    expect(reconcileFlags(['MANAGER'], both)).toBe(both)
    expect(reconcileFlags(['BILLING'], exp)).toBe(exp)
  })

  it('[blocker] flagsPayload: ร้านไม่ใช่บริการไม่ส่งธงเลย', () => {
    expect(flagsPayload(false, both)).toEqual({})
    expect(flagsPayload(true, exp)).toEqual(exp)
  })

  it('[blocker] staffFlagChips: ร้านไม่ใช่บริการไม่มีป้าย · ผู้ดูแลไม่ขึ้นป้ายปิดงาน · ไม่มีบทบาทเริ่มงานไม่ขึ้น', () => {
    expect(staffFlagChips(false, ['CHAT'], both)).toEqual([])
    expect(staffFlagChips(true, ['CHAT'], both)).toEqual(['ปิดงานได้', 'บันทึกค่าใช้จ่ายได้'])
    expect(staffFlagChips(true, ['MANAGER'], both)).toEqual(['บันทึกค่าใช้จ่ายได้'])
    expect(staffFlagChips(true, ['BILLING'], close)).toEqual([])
    expect(staffFlagChips(true, ['TECHNICIAN'], {})).toEqual([])
  })

  it('[blocker] memberDraftChanged: ธงนับเฉพาะร้านบริการ', () => {
    const initial = { roles: ['CHAT'], flags: NO_STAFF_FLAGS }
    expect(memberDraftChanged({ roles: ['CHAT'], flags: close }, initial, true)).toBe(true)
    expect(memberDraftChanged({ roles: ['CHAT'], flags: close }, initial, false)).toBe(false)
    expect(memberDraftChanged({ roles: ['CHAT'], flags: NO_STAFF_FLAGS }, initial, true)).toBe(false)
    expect(memberDraftChanged({ roles: ['TECHNICIAN'], flags: NO_STAFF_FLAGS }, initial, false)).toBe(true)
  })
})

// 00086 P3 — toast หลังแก้บทบาท/โอนเจ้าของ/ลบสมาชิก ต้องบอกจำนวนงานที่กลับเป็น "ยังไม่มีคนรับ" (UX spec copy)
describe('withUnassignedJobsNote', () => {
  it('n > 0 → ต่อท้ายจำนวน', async () => {
    const { withUnassignedJobsNote } = await import('@/lib/shop-role-picker')
    expect(withUnassignedJobsNote('บันทึกบทบาทของ เอ แล้ว', 2)).toBe('บันทึกบทบาทของ เอ แล้ว · งานที่ยังไม่ปิด 2 งานกลับเป็น "ยังไม่มีคนรับ"')
    expect(withUnassignedJobsNote('x', 1)).toBe('x · งานที่ยังไม่ปิด 1 งานกลับเป็น "ยังไม่มีคนรับ"')
  })
  it.each([0, undefined, null, '3', 1.5, -1, Number.NaN])('%s → ข้อความเดิมตรงตัว', async (n) => {
    const { withUnassignedJobsNote } = await import('@/lib/shop-role-picker')
    expect(withUnassignedJobsNote('บันทึกบทบาทของ เอ แล้ว', n)).toBe('บันทึกบทบาทของ เอ แล้ว')
  })
})
