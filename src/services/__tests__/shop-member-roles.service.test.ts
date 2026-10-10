import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  shopFind: vi.fn(), memberFind: vi.fn(), memberUpdate: vi.fn(), memberUpsert: vi.fn(), memberCount: vi.fn(),
  subFind: vi.fn(), inviteFind: vi.fn(), inviteCreate: vi.fn(), inviteUpdate: vi.fn(), inviteFindFirst: vi.fn(),
  userFind: vi.fn(), linkCreate: vi.fn(), linkFind: vi.fn(),
}))
const tx = {
  shop: { findUnique: m.shopFind },
  shopMember: { findUnique: m.memberFind, update: m.memberUpdate, upsert: m.memberUpsert, count: m.memberCount },
  businessPackageSubscription: { findUnique: m.subFind },
  shopInvite: { findUnique: m.inviteFind, create: m.inviteCreate, update: m.inviteUpdate, findFirst: m.inviteFindFirst },
  user: { findUnique: m.userFind },
  shopInviteLink: { create: m.linkCreate, findUnique: m.linkFind },
}
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: (cb: (t: typeof tx) => unknown) => cb(tx) } }))
vi.mock('@/services/trust-score.service', () => ({ recalculateShopTrustScore: vi.fn() }))

import { inviteShopMember, acceptShopInvite, changeMemberRole } from '../shop-member.service'
import { createInviteLink, acceptInviteLink } from '../invite-link.service'

const svcShop = { id: 's1', userId: 'primary', kind: 'BUSINESS', vertical: 'SERVICE_QUEUE', packageLockedAt: null }
const saleShop = { ...svcShop, vertical: 'ONLINE_SALES' }
const sub = { status: 'ACTIVE', tier: 'BUSINESS' }

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.subFind.mockResolvedValue(sub)
  m.memberCount.mockResolvedValue(0)
})

describe('changeMemberRole', () => {
  const setup = (shop: object, target: object) => {
    m.shopFind.mockResolvedValue(shop)
    m.memberFind.mockImplementation(({ where }: { where: { id?: string } }) =>
      Promise.resolve(where.id ? target : { userId: 'caller', role: 'OWNER' }))
  }
  const tgt = (role: string, roles: string[]) => ({ id: 'm1', shopId: 's1', userId: 'u2', role, roles })

  it('เลื่อนเป็น OWNER ล้าง roles', async () => {
    setup(svcShop, tgt('ADMIN', ['CHAT']))
    await changeMemberRole('caller', 's1', 'm1', { role: 'OWNER' })
    expect(m.memberUpdate).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { role: 'OWNER', roles: [] } })
  })
  it('OWNER→ADMIN ไม่ส่ง roles = MANAGER', async () => {
    setup(svcShop, tgt('OWNER', []))
    await changeMemberRole('caller', 's1', 'm1', { role: 'ADMIN' })
    expect(m.memberUpdate.mock.calls[0][0].data).toEqual({ role: 'ADMIN', roles: ['MANAGER'] })
  })
  it('ชุดเดิมที่มี BILLING ไม่ถูกตีกลับเมื่อไม่ได้ส่ง roles มา (ร้านเปลี่ยน vertical ทีหลัง · review T4)', async () => {
    setup(saleShop, tgt('ADMIN', ['BILLING']))
    await changeMemberRole('caller', 's1', 'm1', { role: 'ADMIN' })
    expect(m.memberUpdate.mock.calls[0][0].data).toEqual({ role: 'ADMIN', roles: ['BILLING'] })
  })
  it('BILLING ร้านไม่ใช่บริการ = BILLING_NOT_AVAILABLE ไม่เขียน', async () => {
    setup(saleShop, tgt('ADMIN', ['CHAT']))
    await expect(changeMemberRole('caller', 's1', 'm1', { roles: ['BILLING'] })).rejects.toThrow('BILLING_NOT_AVAILABLE')
    expect(m.memberUpdate).not.toHaveBeenCalled()
  })
  it('ส่ง roles ให้ OWNER = INVALID_ROLES', async () => {
    setup(svcShop, tgt('OWNER', []))
    await expect(changeMemberRole('caller', 's1', 'm1', { roles: ['CHAT'] })).rejects.toThrow('INVALID_ROLES')
  })
  it('แตะเจ้าของหลักยัง PRIMARY_OWNER_LOCKED', async () => {
    setup(svcShop, { ...tgt('OWNER', []), userId: 'primary' })
    await expect(changeMemberRole('caller', 's1', 'm1', { role: 'ADMIN' })).rejects.toThrow('PRIMARY_OWNER_LOCKED')
  })
  it('ผู้เรียกไม่ใช่เจ้าของ = NOT_OWNER', async () => {
    m.shopFind.mockResolvedValue(svcShop)
    m.memberFind.mockResolvedValue({ userId: 'x', role: 'ADMIN' })
    await expect(changeMemberRole('x', 's1', 'm1', { roles: ['CHAT'] })).rejects.toThrow('NOT_OWNER')
  })
})

describe('invite by contact', () => {
  it('เชิญเก็บ roles ที่เลือก', async () => {
    m.shopFind.mockResolvedValue(svcShop)
    m.memberFind.mockResolvedValue({ role: 'OWNER' })
    m.inviteCreate.mockResolvedValue({ id: 'i1' })
    await inviteShopMember('o', 's1', '0812345678', 'PHONE', ['CHAT', 'BILLING'])
    expect(m.inviteCreate.mock.calls[0][0].data.roles).toEqual(['CHAT', 'BILLING'])
  })
  it('ไม่ส่ง roles = [MANAGER]', async () => {
    m.shopFind.mockResolvedValue(svcShop)
    m.memberFind.mockResolvedValue({ role: 'OWNER' })
    await inviteShopMember('o', 's1', '0812345678', 'PHONE')
    expect(m.inviteCreate.mock.calls[0][0].data.roles).toEqual(['MANAGER'])
  })
  it('BILLING ร้านไม่ใช่บริการ ไม่สร้างคำเชิญ', async () => {
    m.shopFind.mockResolvedValue(saleShop)
    m.memberFind.mockResolvedValue({ role: 'OWNER' })
    await expect(inviteShopMember('o', 's1', '0812345678', 'PHONE', ['BILLING'])).rejects.toThrow('BILLING_NOT_AVAILABLE')
    expect(m.inviteCreate).not.toHaveBeenCalled()
  })
  it('accept คัดลอก invite.roles ลง ShopMember', async () => {
    m.inviteFind.mockResolvedValue({ id: 'i1', status: 'PENDING', shopId: 's1', contactType: 'PHONE', invitedContact: '08', roles: ['TECHNICIAN', 'CHAT'] })
    m.userFind.mockResolvedValue({ phone: '08' })
    m.shopFind.mockResolvedValue(svcShop)
    await acceptShopInvite('i1', 'u9')
    expect(m.memberUpsert.mock.calls[0][0].create.roles).toEqual(['TECHNICIAN', 'CHAT'])
  })
})

describe('invite link', () => {
  it('สร้างลิงก์เก็บ roles + validate', async () => {
    m.shopFind.mockResolvedValue(svcShop)
    m.memberFind.mockResolvedValue({ role: 'OWNER' })
    m.linkCreate.mockResolvedValue({ slug: 'abc', expiresAt: new Date() })
    await createInviteLink('o', 's1', '7d', ['BILLING'])
    expect(m.linkCreate.mock.calls[0][0].data.roles).toEqual(['BILLING'])
  })
  it('BILLING ร้านไม่ใช่บริการ = BILLING_NOT_AVAILABLE', async () => {
    m.shopFind.mockResolvedValue(saleShop)
    m.memberFind.mockResolvedValue({ role: 'OWNER' })
    await expect(createInviteLink('o', 's1', '7d', ['BILLING'])).rejects.toThrow('BILLING_NOT_AVAILABLE')
    expect(m.linkCreate).not.toHaveBeenCalled()
  })
  it('accept คัดลอก link.roles · สมาชิกเดิมไม่ถูกเขียนทับ', async () => {
    m.linkFind.mockResolvedValue({ shopId: 's1', revokedAt: null, expiresAt: new Date(Date.now() + 1e6), roles: ['CHAT'] })
    m.shopFind.mockResolvedValue(svcShop)
    m.memberFind.mockResolvedValueOnce(null)
    await acceptInviteLink('slug', 'u9')
    expect(m.memberUpsert.mock.calls[0][0].create.roles).toEqual(['CHAT'])
    m.memberUpsert.mockClear()
    m.memberFind.mockResolvedValueOnce({ id: 'x' })
    await acceptInviteLink('slug', 'u9')
    expect(m.memberUpsert).not.toHaveBeenCalled()
  })
})
