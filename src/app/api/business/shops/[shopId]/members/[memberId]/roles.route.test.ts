import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ change: vi.fn(), invite: vi.fn(), link: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn().mockResolvedValue({ user: { id: 'owner' } }) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/session-user', () => ({ sessionUserId: () => 'owner' }))
vi.mock('@/services/shop-member.service', () => ({
  changeMemberRole: m.change, removeShopMember: vi.fn(), inviteShopMember: m.invite, listInvites: vi.fn(),
}))
vi.mock('@/services/invite-link.service', () => ({ createInviteLink: m.link, listActiveInviteLinks: vi.fn() }))
vi.mock('@/lib/shop-context', () => ({
  isShopMember: vi.fn(),
  requireActiveShop: vi.fn().mockResolvedValue({ kind: 'BUSINESS', role: 'OWNER', shop: { id: 's1' } }),
}))

import { PATCH } from './route'
import { POST as invitePost } from '../../invites/route'
import { POST as linkPost } from '@/app/api/shops/current/invite-links/route'

const req = (body: unknown) => new NextRequest('http://x/api', { method: 'POST', body: JSON.stringify(body) })
const patch = (body: unknown) => PATCH(req(body), { params: Promise.resolve({ shopId: 's1', memberId: 'm1' }) })
const invite = (body: unknown) => invitePost(req(body), { params: Promise.resolve({ shopId: 's1' }) })

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); Object.values(m).forEach((f) => f.mockReset()) })

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
  it('สำเร็จคืน role+roles', async () => {
    m.change.mockResolvedValue({ role: 'ADMIN', roles: ['CHAT'] })
    expect(await (await patch({ roles: ['CHAT'] })).json()).toEqual({ role: 'ADMIN', roles: ['CHAT'] })
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
})
