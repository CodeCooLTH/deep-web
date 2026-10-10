import { describe, it, expect } from 'vitest'
import { planMemberRoleChange as plan, validateAssignableRoles as val } from '../shop-role-assignment'

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
  const admin = { role: 'ADMIN', roles: ['CHAT'] }
  const owner = { role: 'OWNER', roles: [] }
  it('ADMIN→OWNER ล้าง roles', () => expect(plan({ current: admin, input: { role: 'OWNER' } })).toEqual({ role: 'OWNER', roles: [] }))
  it('ADMIN→OWNER พร้อม roles = INVALID_ROLES', () =>
    expect(plan({ current: admin, input: { role: 'OWNER', roles: ['CHAT'] } })).toEqual({ error: 'INVALID_ROLES' }))
  it('OWNER→ADMIN ไม่ส่ง roles = MANAGER', () => expect(plan({ current: owner, input: { role: 'ADMIN' } })).toEqual({ role: 'ADMIN', roles: ['MANAGER'] }))
  it('OWNER→ADMIN พร้อม roles ใช้ชุดนั้น', () => expect(plan({ current: owner, input: { role: 'ADMIN', roles: ['TECHNICIAN'] } })).toEqual({ role: 'ADMIN', roles: ['TECHNICIAN'] }))
  it('ADMIN ส่งแค่ roles = เปลี่ยน roles', () => expect(plan({ current: admin, input: { roles: ['BILLING'] } })).toEqual({ role: 'ADMIN', roles: ['BILLING'] }))
  it('ส่ง roles ให้คนที่ยังเป็น OWNER = INVALID_ROLES', () => {
    expect(plan({ current: owner, input: { roles: ['CHAT'] } })).toEqual({ error: 'INVALID_ROLES' })
    expect(plan({ current: owner, input: { role: 'OWNER', roles: ['CHAT'] } })).toEqual({ error: 'INVALID_ROLES' })
  })
  it('idempotent', () => {
    expect(plan({ current: admin, input: { role: 'ADMIN' } })).toEqual({ role: 'ADMIN', roles: ['CHAT'] })
    expect(plan({ current: owner, input: { role: 'OWNER' } })).toEqual({ role: 'OWNER', roles: [] })
  })
})
