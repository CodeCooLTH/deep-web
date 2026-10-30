import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ change: vi.fn(), invite: vi.fn(), link: vi.fn(), list: vi.fn(), transfer: vi.fn(), remove: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn().mockResolvedValue({ user: { id: 'owner' } }) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/session-user', () => ({ sessionUserId: () => 'owner' }))
vi.mock('@/services/shop-member.service', () => ({
  changeMemberRole: m.change, removeShopMember: m.remove, inviteShopMember: m.invite, listInvites: m.list, transferShopOwnership: m.transfer,
}))
vi.mock('@/services/invite-link.service', () => ({ createInviteLink: m.link, listActiveInviteLinks: vi.fn() }))
// ด่านจริง (requireShopCapability) ทำงานเต็ม — mock แค่ตัว resolve ร้าน/สมาชิก (ค่าตั้งต้น = เจ้าของหลัก)
const ctx = vi.hoisted(() => ({ role: 'OWNER' as 'OWNER' | 'ADMIN', roles: [] as string[], shopOwner: 'owner' }))
vi.mock('@/lib/shop-context', () => ({
  requireShopForRequest: vi.fn(async () => ({
    ok: true,
    target: {
      shop: { id: 's1', kind: 'BUSINESS', vertical: 'ONLINE_SALES', userId: ctx.shopOwner },
      kind: 'BUSINESS', role: ctx.role, roles: ctx.roles, locked: false, lockReason: null,
    },
  })),
}))

import { PATCH, DELETE } from './route'
import { POST as invitePost } from '../../invites/route'
import { POST as linkPost } from '@/app/api/shops/current/invite-links/route'
import { GET as invitesGet } from '../../invites/route'
import { POST as transferPost } from '../../transfer/route'

const req = (body: unknown) => new NextRequest('http://x/api', { method: 'POST', body: JSON.stringify(body) })
const patch = (body: unknown) => PATCH(req(body), { params: Promise.resolve({ shopId: 's1', memberId: 'm1' }) })
const invite = (body: unknown) => invitePost(req(body), { params: Promise.resolve({ shopId: 's1' }) })

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  Object.values(m).forEach((f) => f.mockReset())
  Object.assign(ctx, { role: 'OWNER', roles: [], shopOwner: 'owner' })
})

describe('PATCH members/[memberId]', () => {
  it.each([
    ['ว่าง', { roles: [] }],
    ['5 ค่า', { roles: ['MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN', 'CHAT'] }],
    ['ซ้ำ', { roles: ['CHAT', 'CHAT'] }],
    ['ไม่รู้จัก', { roles: ['BOSS'] }],
    ['OWNER ใน roles', { roles: ['OWNER'] }],
    ['ไม่ส่งอะไร', {}],
  ])('%s = 400', async (_n, body) => {
    expect((await patch(body)).status).toBe(400)
    expect(m.change).not.toHaveBeenCalled()
  })
  it('ผู้ไม่ใช่เจ้าของ = 403 NOT_OWNER', async () => {
    m.change.mockRejectedValue(new Error('NOT_OWNER'))
    expect((await patch({ roles: ['CHAT'] })).status).toBe(403)
  })
  it.each(['INVALID_ROLES', 'BILLING_NOT_AVAILABLE'])('%s = 400 ไม่ใช่ 500', async (code) => {
    m.change.mockRejectedValue(new Error(code))
    const r = await patch({ roles: ['BILLING'] })
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: code })
  })
  it('สำเร็จคืน role+roles+ธง+จำนวนงานที่ถูกปลด (00086)', async () => {
    m.change.mockResolvedValue({ role: 'ADMIN', roles: ['CHAT'], canCloseJob: true, canRecordExpense: false, unassignedJobCount: 0 })
    expect(await (await patch({ roles: ['CHAT'] })).json())
      .toEqual({ role: 'ADMIN', roles: ['CHAT'], canCloseJob: true, canRecordExpense: false, unassignedJobCount: 0 })
  })
  // 00086 P3: ถอดฝ่ายช่าง → service ปลดงานเปิด 3 ใบ ⇒ route ต้องส่งจำนวนให้ toast (ผลข้างเคียงต้องไม่เงียบ)
  it('ถอดฝ่ายช่างแล้วงานถูกปลด → คืน unassignedJobCount', async () => {
    m.change.mockResolvedValue({ role: 'ADMIN', roles: ['CHAT'], canCloseJob: false, canRecordExpense: false, unassignedJobCount: 3 })
    expect((await (await patch({ roles: ['CHAT'] })).json()).unassignedJobCount).toBe(3)
  })
  // 00086: ส่งธงอย่างเดียว (ไม่มี role/roles) ต้องผ่าน schema · ธงต้องเป็น boolean
  it('ส่งแค่ธงก็ผ่าน schema และส่งต่อให้ service', async () => {
    m.change.mockResolvedValue({ role: 'ADMIN', roles: ['CHAT'], canCloseJob: true, canRecordExpense: true })
    expect((await patch({ canCloseJob: true })).status).toBe(200)
    expect(m.change.mock.calls[0][3]).toEqual({ canCloseJob: true })
    expect((await patch({ canRecordExpense: false })).status).toBe(200)
  })
  it('ธงไม่ใช่ boolean = 400', async () => {
    expect((await patch({ canCloseJob: 'yes' })).status).toBe(400)
    expect(m.change).not.toHaveBeenCalled()
  })
  it.each([
    ['CLOSE_JOB_NEEDS_START_ROLE', 'ปิดงานได้ ต้องใช้คู่กับ ตอบแชท หรือ ฝ่ายช่าง'],
    ['STAFF_FLAGS_NOT_AVAILABLE', 'ร้านนี้ไม่ได้ขายบริการ จึงตั้งปิดงานได้/บันทึกค่าใช้จ่ายได้ไม่ได้'],
  ])('%s = 400 + ข้อความไทย', async (code, message) => {
    m.change.mockRejectedValue(new Error(code))
    const r = await patch({ canCloseJob: true })
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: code, message })
  })
})

describe('invite create routes', () => {
  it.each(['INVALID_ROLES', 'BILLING_NOT_AVAILABLE'])('invites POST %s = 400', async (code) => {
    m.invite.mockRejectedValue(new Error(code))
    expect((await invite({ contact: '0812345678', contactType: 'PHONE', roles: ['BILLING'] })).status).toBe(400)
  })
  it.each(['INVALID_ROLES', 'BILLING_NOT_AVAILABLE'])('invite-links POST %s = 400', async (code) => {
    m.link.mockRejectedValue(new Error(code))
    expect((await linkPost(req({ roles: ['BILLING'] }))).status).toBe(400)
  })
  it('schema ปัด roles ผิดรูปที่ทั้งสอง route', async () => {
    expect((await invite({ contact: '08', contactType: 'PHONE', roles: ['OWNER'] })).status).toBe(400)
    expect((await linkPost(req({ roles: [] }))).status).toBe(400)
  })
  it('ส่ง roles ต่อให้ service', async () => {
    m.invite.mockResolvedValue({ id: 'i', status: 'PENDING' })
    await invite({ contact: '08', contactType: 'PHONE', roles: ['CHAT'] })
    expect(m.invite.mock.calls[0][4]).toEqual(['CHAT'])
  })
  // 00086
  it('ธงไม่ส่ง = false ทั้งสอง route · ส่งมา = ส่งต่อ · คืนธงใน response', async () => {
    m.invite.mockResolvedValue({ id: 'i', status: 'PENDING', canCloseJob: false, canRecordExpense: false })
    await invite({ contact: '08', contactType: 'PHONE', roles: ['CHAT'] })
    expect(m.invite.mock.calls[0][5]).toEqual({ canCloseJob: false, canRecordExpense: false })
    m.invite.mockResolvedValue({ id: 'i', status: 'PENDING', canCloseJob: true, canRecordExpense: true })
    const r = await invite({ contact: '08', contactType: 'PHONE', roles: ['CHAT'], canCloseJob: true, canRecordExpense: true })
    expect(m.invite.mock.calls[1][5]).toEqual({ canCloseJob: true, canRecordExpense: true })
    expect(await r.json()).toMatchObject({ canCloseJob: true, canRecordExpense: true })

    m.link.mockResolvedValue({ slug: 'abc', expiresAt: new Date(), canCloseJob: false, canRecordExpense: false })
    await linkPost(req({ roles: ['CHAT'] }))
    expect(m.link.mock.calls[0][4]).toEqual({ canCloseJob: false, canRecordExpense: false })
    m.link.mockResolvedValue({ slug: 'abc', expiresAt: new Date(), canCloseJob: true, canRecordExpense: false })
    const lr = await linkPost(req({ roles: ['CHAT'], canCloseJob: true }))
    expect(m.link.mock.calls[1][4]).toEqual({ canCloseJob: true, canRecordExpense: false })
    expect(await lr.json()).toMatchObject({ canCloseJob: true, canRecordExpense: false })
  })
  it.each(['CLOSE_JOB_NEEDS_START_ROLE', 'STAFF_FLAGS_NOT_AVAILABLE'])('%s = 400 + message ทั้งสอง route (ไม่ใช่ 500)', async (code) => {
    m.invite.mockRejectedValue(new Error(code))
    m.link.mockRejectedValue(new Error(code))
    const a = await invite({ contact: '08', contactType: 'PHONE', roles: ['CHAT'], canCloseJob: true })
    const b = await linkPost(req({ roles: ['CHAT'], canCloseJob: true }))
    for (const r of [a, b]) {
      expect(r.status).toBe(400)
      const j = await r.json()
      expect(j.error).toBe(code)
      expect(j.message).toMatch(/[ก-๙]/)
    }
  })
})

// 00071 T2/T4: ด่านบทบาทอยู่หน้า service — บทบาทที่ไม่มีสิทธิ์ต้องไม่ถึง service และได้รหัสเดิมที่ UI อ่าน (NOT_OWNER)
describe('ด่านบทบาทของ API จัดการสมาชิก (00071)', () => {
  const asManager = () => Object.assign(ctx, { role: 'ADMIN', roles: ['MANAGER'] })
  const params = { params: Promise.resolve({ shopId: 's1' }) }
  const get = () => invitesGet(new NextRequest('http://x/api'), params)

  it('PATCH สมาชิก: ผู้ดูแล = 403 NOT_OWNER ไม่ถึง service', async () => {
    asManager()
    const r = await patch({ roles: ['CHAT'] })
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ error: 'NOT_OWNER' })
    expect(m.change).not.toHaveBeenCalled()
  })
  it('POST เชิญ: ผู้ดูแล = 403 NOT_OWNER ไม่ถึง service', async () => {
    asManager()
    const r = await invite({ contact: '0812345678', contactType: 'PHONE', roles: ['CHAT'] })
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ error: 'NOT_OWNER' })
    expect(m.invite).not.toHaveBeenCalled()
  })
  it('POST ลิงก์เชิญ: ผู้ดูแล = 403 NOT_OWNER ไม่ถึง service', async () => {
    asManager()
    const r = await linkPost(req({ roles: ['CHAT'] }))
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ error: 'NOT_OWNER' })
    expect(m.link).not.toHaveBeenCalled()
  })
  it('GET รายการคำเชิญ (มติ C-3): ผู้ดูแล/ตอบแชท/เปิดบิล/ช่าง = 403 · เจ้าของ = 200', async () => {
    for (const role of ['MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN']) {
      Object.assign(ctx, { role: 'ADMIN', roles: [role] })
      const r = await get()
      // BILLING ในร้านทั่วไปถูกตัดบทบาทเหลือชุดว่าง — ก็ต้อง 403 เช่นกัน
      expect(r.status, role).toBe(403)
    }
    expect(m.list).not.toHaveBeenCalled()
    Object.assign(ctx, { role: 'OWNER', roles: [] })
    m.list.mockResolvedValue([])
    expect((await get()).status).toBe(200)
  })
  it('โอนเจ้าของหลัก (T4): เจ้าของร่วม = 403 NOT_PRIMARY_OWNER · เจ้าของหลัก = ผ่านถึง service', async () => {
    Object.assign(ctx, { role: 'OWNER', shopOwner: 'someone-else' })
    const body = { memberId: 'cm0000000000000000000000a' }
    const call = () => transferPost(req(body), params)
    const denied = await call()
    expect(denied.status).toBe(403)
    expect(await denied.json()).toEqual({ error: 'NOT_PRIMARY_OWNER' })
    expect(m.transfer).not.toHaveBeenCalled()
    ctx.shopOwner = 'owner'
    m.transfer.mockResolvedValue({ transferred: true, unassignedJobCount: 0 })
    expect((await call()).status).not.toBe(403)
  })
})

// 00086 P3 — โอนเจ้าของ/ลบสมาชิก ปลดงานเปิดของผู้รับโอน/ผู้ถูกลบ ⇒ route ส่งจำนวนให้ toast
describe('unassignedJobCount ใน response (00086 P3)', () => {
  const params = { params: Promise.resolve({ shopId: 's1' }) }
  it('โอนเจ้าของหลัก คืนจำนวนจาก service', async () => {
    m.transfer.mockResolvedValue({ transferred: true, unassignedJobCount: 2 })
    const r = await transferPost(req({ memberId: 'cm0000000000000000000000a' }), params)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ status: 'TRANSFERRED', unassignedJobCount: 2 })
  })
  it('ลบสมาชิก คืนจำนวนจาก service', async () => {
    m.remove.mockResolvedValue({ removed: true, unassignedJobCount: 4 })
    const r = await DELETE(new NextRequest('http://x/api', { method: 'DELETE' }), { params: Promise.resolve({ shopId: 's1', memberId: 'm1' }) })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ status: 'REMOVED', unassignedJobCount: 4 })
  })
})
