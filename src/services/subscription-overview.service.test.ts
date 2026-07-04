import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock deps ก่อน import service
vi.mock('@/lib/prisma', () => ({
  prisma: {
    shop: { findMany: vi.fn(), count: vi.fn() },
    inventoryEntitlement: { findUnique: vi.fn() },
  },
}))
vi.mock('@/services/business-package.service', () => ({ getSubscriptionStatus: vi.fn() }))
vi.mock('@/services/wallet.service', () => ({ getBalance: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getSubscriptionStatus } from '@/services/business-package.service'
import { getBalance } from '@/services/wallet.service'
import { getSellerSubscriptionOverview } from './subscription-overview.service'

const anyPrisma = prisma as any

describe('getSellerSubscriptionOverview', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('รวม business package + ทุกร้าน + คำนวณ shortfall/warnAdvance', async () => {
    ;(getSubscriptionStatus as any).mockResolvedValue({
      tier: 'PRO', status: 'ACTIVE', nextRenewalAt: new Date('2026-08-01'),
    })
    // ownedBusinessCount = prisma.shop.count (owner-scoped, ตรงกับ canonical quota)
    anyPrisma.shop.count.mockResolvedValue(2)
    ;(getBalance as any).mockImplementation(async (id: string) => (id === 'shopP' ? 50 : 300))
    anyPrisma.shop.findMany.mockResolvedValue([
      { id: 'shopP', shopName: 'ร้านหลัก', kind: 'PERSONAL', logo: null,
        inventoryEntitlement: { status: 'ACTIVE', package: 'BASIC', nextRenewalAt: new Date('2026-07-05') } },
      { id: 'shopB', shopName: 'ร้านธุรกิจ', kind: 'BUSINESS', logo: null,
        inventoryEntitlement: null },
    ])

    const out = await getSellerSubscriptionOverview('u1')

    expect(out.businessPackage.tier).toBe('PRO')
    expect(out.businessPackage.status).toBe('ACTIVE')
    expect(out.businessPackage.maxBusinesses).toBe(3) // PRO = 3
    expect(out.businessPackage.ownedBusinessCount).toBe(2)
    // personalWalletBalance derive จากร้าน PERSONAL ใน rows (shopP = 50)
    expect(out.businessPackage.personalWalletBalance).toBe(50)
    // ยืนยันใช้ shop.count (owner-scoped) ไม่ใช่ shopMember.count
    expect(anyPrisma.shop.count).toHaveBeenCalledWith({
      where: { userId: 'u1', kind: 'BUSINESS', deletedAt: null },
    })
    expect(out.shops).toHaveLength(2)
    const p = out.shops.find(s => s.shopId === 'shopP')!
    expect(p.entitlementStatus).toBe('ACTIVE')
    expect(p.package).toBe('BASIC')
    expect(p.shortfall).toBe(149) // 199 - 50
    const b = out.shops.find(s => s.shopId === 'shopB')!
    expect(b.entitlementStatus).toBe('NOT_SUBSCRIBED')
    expect(b.package).toBeNull()
    expect(b.shortfall).toBe(0)
  })

  it('business package = NOT_SUBSCRIBED เมื่อ getSubscriptionStatus คืน null', async () => {
    ;(getSubscriptionStatus as any).mockResolvedValue(null)
    anyPrisma.shop.count.mockResolvedValue(0)
    ;(getBalance as any).mockResolvedValue(0)
    anyPrisma.shop.findMany.mockResolvedValue([])

    const out = await getSellerSubscriptionOverview('u1')
    expect(out.businessPackage.status).toBe('NOT_SUBSCRIBED')
    expect(out.businessPackage.tier).toBeNull()
    expect(out.businessPackage.maxBusinesses).toBeNull()
    expect(out.businessPackage.personalWalletBalance).toBe(0)
    expect(out.shops).toHaveLength(0)
  })

  it('ร้าน LOCKED → entitlementStatus LOCKED, shortfall 0, warnAdvance false', async () => {
    ;(getSubscriptionStatus as any).mockResolvedValue({
      tier: 'GROWTH', status: 'LOCKED_RENEWAL_FAILED', nextRenewalAt: new Date('2026-07-05'),
    })
    anyPrisma.shop.count.mockResolvedValue(1)
    ;(getBalance as any).mockResolvedValue(10)
    anyPrisma.shop.findMany.mockResolvedValue([
      { id: 'shopP', shopName: 'ร้านหลัก', kind: 'PERSONAL', logo: null,
        inventoryEntitlement: { status: 'LOCKED', package: 'PRO', nextRenewalAt: new Date('2026-07-05') } },
    ])

    const out = await getSellerSubscriptionOverview('u1')
    expect(out.businessPackage.status).toBe('LOCKED_RENEWAL_FAILED')
    expect(out.businessPackage.tier).toBe('GROWTH')
    const p = out.shops[0]
    expect(p.entitlementStatus).toBe('LOCKED')
    expect(p.package).toBe('PRO')
    expect(p.shortfall).toBe(0) // ไม่ ACTIVE → ไม่คิด shortfall
    expect(p.warnAdvance).toBe(false) // warn เฉพาะ ACTIVE
  })
})
