import { beforeEach, describe, expect, it, vi } from 'vitest'

// roles ต้องไหลจากแถว ShopMember ที่ query เดิม → context → ActiveShop (00071 P2 S-9)
const prismaMock = vi.hoisted(() => ({
  shop: { findUnique: vi.fn(), findFirst: vi.fn() },
  shopMember: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { requireActiveShop, requireShopForRequest, resolveActiveShopContext } from '@/lib/shop-context'

const SHOP = {
  id: 's1', kind: 'BUSINESS', userId: 'owner', vertical: 'ONLINE_SALES',
  packageLockedAt: null, packageLockReason: null, deletedAt: null,
}
const session = { user: { id: 'u1', activeShopId: 's1' } }

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.shop.findUnique.mockResolvedValue(SHOP)
})

describe('shop-context — roles จากแถว ShopMember', () => {
  it('select roles ใน query เดิมและคืนใน context', async () => {
    prismaMock.shopMember.findUnique.mockResolvedValue({ role: 'ADMIN', roles: ['CHAT', 'BILLING'] })
    const ctx = await resolveActiveShopContext(session)
    expect(ctx?.roles).toEqual(['CHAT', 'BILLING'])
    expect(prismaMock.shopMember.findUnique).toHaveBeenCalledTimes(1)
    expect(prismaMock.shopMember.findUnique.mock.calls[0][0].select).toMatchObject({ role: true, roles: true })
  })

  it('requireActiveShop / requireShopForRequest ส่ง roles ต่อ', async () => {
    prismaMock.shopMember.findUnique.mockResolvedValue({ role: 'ADMIN', roles: ['TECHNICIAN'] })
    expect((await requireActiveShop(session))?.roles).toEqual(['TECHNICIAN'])
    const r = await requireShopForRequest(session, 's1')
    expect(r.ok && r.target.roles).toEqual(['TECHNICIAN'])
  })

  it('PERSONAL = []', async () => {
    prismaMock.shop.findUnique.mockResolvedValue({ ...SHOP, kind: 'PERSONAL', userId: 'u1' })
    expect((await resolveActiveShopContext(session))?.roles).toEqual([])
  })
})
