import { describe, it, expect } from 'vitest'
import { mustUnassignOpenJobs, planMemberRoleChange as plan, validateAssignableRoles as val, validateStaffFlags as vflags } from '../shop-role-assignment'

const svc = { kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' }
const sale = { kind: 'BUSINESS', vertical: 'ONLINE_SALES' }
const lodging = { kind: 'BUSINESS', vertical: 'LODGING' }

describe('validateAssignableRoles', () => {
  it('BILLING ร้านที่ไม่ใช่บริการ = BILLING_NOT_AVAILABLE', () => {
    expect(val(['BILLING'], sale)).toBe('BILLING_NOT_AVAILABLE')
    expect(val(['MANAGER', 'BILLING'], lodging)).toBe('BILLING_NOT_AVAILABLE')
  })
  it('SERVICE_QUEUE ใช้ BILLING ได้', () => expect(val(['BILLING', 'CHAT'], svc)).toBeNull())
  it('ชุดผิดรูป = INVALID_ROLES', () => {
    expect(val([], svc)).toBe('INVALID_ROLES')
    expect(val(['CHAT', 'CHAT'], svc)).toBe('INVALID_ROLES')
    expect(val(['OWNER'], svc)).toBe('INVALID_ROLES')
    expect(val(['MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN', 'CHAT'], svc)).toBe('INVALID_ROLES')
  })
  it('ครบ 4 ค่าบนร้านบริการผ่าน', () => expect(val(['MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN'], svc)).toBeNull())
})

describe('planMemberRoleChange', () => {
  const NO = { canCloseJob: false, canRecordExpense: false }
  const admin = { role: 'ADMIN', roles: ['CHAT'], ...NO }
  const owner = { role: 'OWNER', roles: [], ...NO }
  it('ADMIN→OWNER ล้าง roles', () => expect(plan({ current: admin, input: { role: 'OWNER' } })).toEqual({ role: 'OWNER', roles: [], ...NO }))
  it('ADMIN→OWNER พร้อม roles = INVALID_ROLES', () =>
    expect(plan({ current: admin, input: { role: 'OWNER', roles: ['CHAT'] } })).toEqual({ error: 'INVALID_ROLES' }))
  it('OWNER→ADMIN ไม่ส่ง roles = MANAGER', () => expect(plan({ current: owner, input: { role: 'ADMIN' } })).toEqual({ role: 'ADMIN', roles: ['MANAGER'], ...NO }))
  it('OWNER→ADMIN พร้อม roles ใช้ชุดนั้น', () => expect(plan({ current: owner, input: { role: 'ADMIN', roles: ['TECHNICIAN'] } })).toEqual({ role: 'ADMIN', roles: ['TECHNICIAN'], ...NO }))
  it('ADMIN ส่งแค่ roles = เปลี่ยน roles', () => expect(plan({ current: admin, input: { roles: ['BILLING'] } })).toEqual({ role: 'ADMIN', roles: ['BILLING'], ...NO }))
  it('ส่ง roles ให้คนที่ยังเป็น OWNER = INVALID_ROLES', () => {
    expect(plan({ current: owner, input: { roles: ['CHAT'] } })).toEqual({ error: 'INVALID_ROLES' })
    expect(plan({ current: owner, input: { role: 'OWNER', roles: ['CHAT'] } })).toEqual({ error: 'INVALID_ROLES' })
  })
  it('idempotent', () => {
    expect(plan({ current: admin, input: { role: 'ADMIN' } })).toEqual({ role: 'ADMIN', roles: ['CHAT'], ...NO })
    expect(plan({ current: owner, input: { role: 'OWNER' } })).toEqual({ role: 'OWNER', roles: [], ...NO })
  })
})

describe('validateStaffFlags (00086) [blocker]', () => {
  it('ไม่ติ๊กอะไร = ผ่านทุกร้าน', () => {
    for (const shop of [svc, sale, lodging]) expect(vflags(['BILLING'], {}, shop)).toBeNull()
    expect(vflags(['CHAT'], { canCloseJob: false, canRecordExpense: false }, sale)).toBeNull()
  })
  it('ติ๊กธงใดก็ได้ในร้านไม่ใช่บริการ = STAFF_FLAGS_NOT_AVAILABLE', () => {
    expect(vflags(['CHAT'], { canCloseJob: true }, sale)).toBe('STAFF_FLAGS_NOT_AVAILABLE')
    expect(vflags(['CHAT'], { canRecordExpense: true }, lodging)).toBe('STAFF_FLAGS_NOT_AVAILABLE')
    expect(vflags(['CHAT'], { canRecordExpense: true }, { kind: 'PERSONAL', vertical: 'ONLINE_SALES' })).toBe('STAFF_FLAGS_NOT_AVAILABLE')
  })
  it('ปิดงานได้ แต่ไม่มีบทบาทเริ่มงาน = CLOSE_JOB_NEEDS_START_ROLE', () => {
    expect(vflags(['BILLING'], { canCloseJob: true }, svc)).toBe('CLOSE_JOB_NEEDS_START_ROLE')
    expect(vflags([], { canCloseJob: true }, svc)).toBe('CLOSE_JOB_NEEDS_START_ROLE')
  })
  it.each([['CHAT'], ['TECHNICIAN'], ['MANAGER'], ['BILLING', 'CHAT']])('ร้านบริการ %j + ปิดงานได้ = ผ่าน', (...roles) => {
    expect(vflags(roles, { canCloseJob: true, canRecordExpense: true }, svc)).toBeNull()
  })
  it('บันทึกค่าใช้จ่ายอย่างเดียวไม่ต้องมีบทบาทเริ่มงาน (BILLING ล้วนได้)', () => {
    expect(vflags(['BILLING'], { canRecordExpense: true }, svc)).toBeNull()
  })
})

describe('planMemberRoleChange — ธง (00086) [blocker]', () => {
  const chatOn = { role: 'ADMIN', roles: ['CHAT'], canCloseJob: true, canRecordExpense: true }
  it('ADMIN→OWNER ล้างธงทั้งสอง (CHECK flags_admin_only)', () =>
    expect(plan({ current: chatOn, input: { role: 'OWNER' } })).toEqual({ role: 'OWNER', roles: [], canCloseJob: false, canRecordExpense: false }))
  it('ไม่ส่งธง = คงธงเดิม (ห้ามล้างเงียบ)', () =>
    expect(plan({ current: chatOn, input: { roles: ['TECHNICIAN'] } })).toEqual({ role: 'ADMIN', roles: ['TECHNICIAN'], canCloseJob: true, canRecordExpense: true }))
  it('roles เหลือแค่ BILLING ⇒ canCloseJob false · canRecordExpense คงเดิม', () =>
    expect(plan({ current: chatOn, input: { roles: ['BILLING'] } })).toEqual({ role: 'ADMIN', roles: ['BILLING'], canCloseJob: false, canRecordExpense: true }))
  it('roles เหลือ BILLING แม้ส่ง canCloseJob true มา ⇒ false', () =>
    expect(plan({ current: chatOn, input: { roles: ['BILLING'], canCloseJob: true } })).toMatchObject({ canCloseJob: false }))
  it('ส่งธงมา = ใช้ค่าที่ส่ง', () => {
    expect(plan({ current: chatOn, input: { canCloseJob: false } })).toEqual({ role: 'ADMIN', roles: ['CHAT'], canCloseJob: false, canRecordExpense: true })
    expect(plan({ current: { role: 'ADMIN', roles: ['TECHNICIAN'], canCloseJob: false, canRecordExpense: false }, input: { canCloseJob: true, canRecordExpense: true } }))
      .toEqual({ role: 'ADMIN', roles: ['TECHNICIAN'], canCloseJob: true, canRecordExpense: true })
  })
  it('OWNER→ADMIN ไม่ส่งธง = false ทั้งคู่ · MANAGER คงธงที่ส่งมา', () => {
    expect(plan({ current: { role: 'OWNER', roles: [], canCloseJob: false, canRecordExpense: false }, input: { role: 'ADMIN' } }))
      .toEqual({ role: 'ADMIN', roles: ['MANAGER'], canCloseJob: false, canRecordExpense: false })
    expect(plan({ current: { role: 'OWNER', roles: [], canCloseJob: false, canRecordExpense: false }, input: { role: 'ADMIN', canCloseJob: true } }))
      .toMatchObject({ canCloseJob: true })
  })
})

describe('mustUnassignOpenJobs (00086 P3 — ไม่ได้เป็นช่างแล้ว ⇒ ปลดงานที่เปิดอยู่)', () => {
  it('ร้านบริการ: ชุดใหม่ไม่มี TECHNICIAN ⇒ ปลด', () => {
    expect(mustUnassignOpenJobs(svc, { role: 'ADMIN', roles: ['CHAT'] })).toBe(true)
    expect(mustUnassignOpenJobs(svc, { role: 'ADMIN', roles: ['MANAGER', 'BILLING'] })).toBe(true)
  })
  it('ร้านบริการ: เลื่อนเป็นเจ้าของ (OWNER = [OWNER] ไม่มี TECHNICIAN) ⇒ ปลด', () => {
    expect(mustUnassignOpenJobs(svc, { role: 'OWNER', roles: [] })).toBe(true)
  })
  it('ร้านบริการ: ยังถือ TECHNICIAN (เดี่ยวหรือคู่) ⇒ ไม่แตะ', () => {
    expect(mustUnassignOpenJobs(svc, { role: 'ADMIN', roles: ['TECHNICIAN'] })).toBe(false)
    expect(mustUnassignOpenJobs(svc, { role: 'ADMIN', roles: ['CHAT', 'TECHNICIAN'] })).toBe(false)
  })
  it('ร้านไม่ใช่บริการ ⇒ ไม่แตะเสมอ (ไม่มีระบบผู้รับผิดชอบ)', () => {
    expect(mustUnassignOpenJobs(sale, { role: 'ADMIN', roles: ['CHAT'] })).toBe(false)
    expect(mustUnassignOpenJobs(lodging, { role: 'OWNER', roles: [] })).toBe(false)
  })
})
