/**
 * invite-link.service.test.ts — unit tests สำหรับ invite-link.service (feature 00012, Task 1.3)
 *
 * ทำไม mock แทน integration test:
 * - migration ของ ShopInviteLink ยังไม่ apply กับ DB จริง (human gate ค้างอยู่) —
 *   ห้ามรัน test ที่ต้องต่อ DB จริงตอนนี้ (ดู task constraint)
 * - unit test ครอบ guard/error-throwing logic (NOT_OWNER/SHOP_LOCKED/NO_ACTIVE_PACKAGE/
 *   LINK_INVALID/ALREADY_OWNER/ADMIN_QUOTA_EXCEEDED) + happy-path ด้วย mocked prisma
 * - พฤติกรรมจริงของ $transaction (atomicity, P2002 retry บน DB จริง, unique constraint)
 *   เป็น QA-deferred หลัง migration apply (integration/E2E test ต่างหาก)
 *
 * mock $transaction: เรียก callback ทันทีด้วย txMock ที่ผูก method เดียวกับ prisma top-level
 * (เพียงพอสำหรับ unit test ระดับ logic — ไม่จำลอง rollback จริง)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน import ใด ๆ (รวม const declarations
// ปกติ) — ถ้าประกาศ vi.fn() ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError)
// vi.hoisted() ยก block นี้ขึ้นไปพร้อมกับ vi.mock ทำให้ reference ปลอดภัย
const {
  shopFindUnique, subFindUnique, linkCreate, linkFindMany, linkFindUnique, linkUpdate,
  memberFindUnique, memberCount, memberUpsert,
} = vi.hoisted(() => ({
  shopFindUnique: vi.fn(),
  subFindUnique: vi.fn(),
  linkCreate: vi.fn(),
  linkFindMany: vi.fn(),
  linkFindUnique: vi.fn(),
  linkUpdate: vi.fn(),
  memberFindUnique: vi.fn(),
  memberCount: vi.fn(),
  memberUpsert: vi.fn(),
}))

const txMock = {
  shop: { findUnique: shopFindUnique },
  businessPackageSubscription: { findUnique: subFindUnique },
  shopInviteLink: { create: linkCreate, findMany: linkFindMany, findUnique: linkFindUnique, update: linkUpdate },
  shopMember: { findUnique: memberFindUnique, count: memberCount, upsert: memberUpsert },
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    shop: { findUnique: shopFindUnique },
    shopInviteLink: { create: linkCreate, findMany: linkFindMany, findUnique: linkFindUnique, update: linkUpdate },
    $transaction: vi.fn((cb: (tx: typeof txMock) => unknown) => cb(txMock)),
  },
}))

import { prisma } from '@/lib/prisma'
import {
  createInviteLink,
  listActiveInviteLinks,
  revokeInviteLink,
  resolveInviteLink,
  acceptInviteLink,
} from '../invite-link.service'

const OWNER_ID = 'owner-1'
const SHOP_ID = 'shop-1'
const businessShop = (overrides: Partial<{ userId: string; kind: string; packageLockedAt: Date | null }> = {}) => ({
  id: SHOP_ID,
  userId: OWNER_ID,
  kind: 'BUSINESS',
  packageLockedAt: null,
  shopName: 'ร้านทดสอบ',
  logo: null,
  ...overrides,
})
const activeSub = { ownerId: OWNER_ID, status: 'ACTIVE', tier: 'PRO' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createInviteLink', () => {
  it('throws NOT_OWNER เมื่อ shop ไม่ใช่ของ owner', async () => {
    shopFindUnique.mockResolvedValue(businessShop({ userId: 'someone-else' }))
    await expect(createInviteLink(OWNER_ID, SHOP_ID, '7d')).rejects.toThrow('NOT_OWNER')
  })

  it('throws NOT_OWNER เมื่อ shop เป็น PERSONAL', async () => {
    shopFindUnique.mockResolvedValue(businessShop({ kind: 'PERSONAL' }))
    await expect(createInviteLink(OWNER_ID, SHOP_ID, '7d')).rejects.toThrow('NOT_OWNER')
  })

  it('throws SHOP_LOCKED เมื่อ shop ถูกล็อก', async () => {
    shopFindUnique.mockResolvedValue(businessShop({ packageLockedAt: new Date() }))
    await expect(createInviteLink(OWNER_ID, SHOP_ID, '7d')).rejects.toThrow('SHOP_LOCKED')
  })

  it('throws NO_ACTIVE_PACKAGE เมื่อไม่มี subscription หรือไม่ ACTIVE', async () => {
    shopFindUnique.mockResolvedValue(businessShop())
    subFindUnique.mockResolvedValue(null)
    await expect(createInviteLink(OWNER_ID, SHOP_ID, '7d')).rejects.toThrow('NO_ACTIVE_PACKAGE')
  })

  it('happy path — สร้าง link สำเร็จ คืน slug + expiresAt', async () => {
    shopFindUnique.mockResolvedValue(businessShop())
    subFindUnique.mockResolvedValue(activeSub)
    linkCreate.mockImplementation(({ data }: { data: { slug: string; expiresAt: Date } }) =>
      Promise.resolve({ slug: data.slug, expiresAt: data.expiresAt }),
    )
    const result = await createInviteLink(OWNER_ID, SHOP_ID, '7d')
    expect(result.slug).toHaveLength(12)
    expect(result.expiresAt).toBeInstanceOf(Date)
    expect(linkCreate).toHaveBeenCalledTimes(1)
  })
})

describe('listActiveInviteLinks', () => {
  it('query where revokedAt=null && expiresAt>now, order createdAt desc', async () => {
    ;(prisma.shopInviteLink.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    await listActiveInviteLinks(SHOP_ID)
    expect(prisma.shopInviteLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shopId: SHOP_ID, revokedAt: null }),
        orderBy: { createdAt: 'desc' },
      }),
    )
  })
})

describe('revokeInviteLink', () => {
  it('throws NOT_OWNER เมื่อ shop ไม่ใช่ของ owner', async () => {
    ;(prisma.shop.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(businessShop({ userId: 'other' }))
    await expect(revokeInviteLink(OWNER_ID, SHOP_ID, 'slug123')).rejects.toThrow('NOT_OWNER')
  })

  it('throws NOT_OWNER เมื่อ link ไม่ใช่ของ shop นี้', async () => {
    ;(prisma.shop.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(businessShop())
    ;(prisma.shopInviteLink.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      shopId: 'other-shop',
      revokedAt: null,
    })
    await expect(revokeInviteLink(OWNER_ID, SHOP_ID, 'slug123')).rejects.toThrow('NOT_OWNER')
  })

  it('idempotent — revoke ซ้ำไม่ throw ไม่เรียก update', async () => {
    ;(prisma.shop.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(businessShop())
    ;(prisma.shopInviteLink.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      shopId: SHOP_ID,
      revokedAt: new Date(),
    })
    await expect(revokeInviteLink(OWNER_ID, SHOP_ID, 'slug123')).resolves.toBeUndefined()
    expect(prisma.shopInviteLink.update).not.toHaveBeenCalled()
  })

  it('happy path — set revokedAt', async () => {
    ;(prisma.shop.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(businessShop())
    ;(prisma.shopInviteLink.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      shopId: SHOP_ID,
      revokedAt: null,
    })
    await revokeInviteLink(OWNER_ID, SHOP_ID, 'slug123')
    expect(prisma.shopInviteLink.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'slug123' } }),
    )
  })
})

describe('resolveInviteLink', () => {
  it('reason NOT_FOUND เมื่อไม่มี slug', async () => {
    ;(prisma.shopInviteLink.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    await expect(resolveInviteLink('nope')).resolves.toEqual({ valid: false, reason: 'NOT_FOUND' })
  })

  it('reason REVOKED เมื่อ revokedAt ตั้งไว้', async () => {
    ;(prisma.shopInviteLink.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 100000),
      shop: { id: SHOP_ID, shopName: 'x', logo: null },
    })
    await expect(resolveInviteLink('slug')).resolves.toEqual({ valid: false, reason: 'REVOKED' })
  })

  it('reason EXPIRED เมื่อหมดอายุ', async () => {
    ;(prisma.shopInviteLink.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      shop: { id: SHOP_ID, shopName: 'x', logo: null },
    })
    await expect(resolveInviteLink('slug')).resolves.toEqual({ valid: false, reason: 'EXPIRED' })
  })

  it('valid=true คืนข้อมูล shop เมื่อลิงก์ยังใช้ได้', async () => {
    ;(prisma.shopInviteLink.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
      shop: { id: SHOP_ID, shopName: 'ร้านทดสอบ', logo: 'logo.png' },
    })
    await expect(resolveInviteLink('slug')).resolves.toEqual({
      valid: true,
      shopId: SHOP_ID,
      shopName: 'ร้านทดสอบ',
      shopLogo: 'logo.png',
    })
  })
})

describe('acceptInviteLink', () => {
  const USER_ID = 'user-1'

  it('throws LINK_INVALID เมื่อ link ไม่มี/revoked/expired', async () => {
    linkFindUnique.mockResolvedValue(null)
    await expect(acceptInviteLink('slug', USER_ID)).rejects.toThrow('LINK_INVALID')

    linkFindUnique.mockResolvedValue({ shopId: SHOP_ID, revokedAt: new Date(), expiresAt: new Date(Date.now() + 100000) })
    await expect(acceptInviteLink('slug', USER_ID)).rejects.toThrow('LINK_INVALID')

    linkFindUnique.mockResolvedValue({ shopId: SHOP_ID, revokedAt: null, expiresAt: new Date(Date.now() - 1000) })
    await expect(acceptInviteLink('slug', USER_ID)).rejects.toThrow('LINK_INVALID')
  })

  it('throws ALREADY_OWNER เมื่อ user คือเจ้าของ shop เอง', async () => {
    linkFindUnique.mockResolvedValue({ shopId: SHOP_ID, revokedAt: null, expiresAt: new Date(Date.now() + 100000) })
    shopFindUnique.mockResolvedValue(businessShop({ userId: USER_ID }))
    await expect(acceptInviteLink('slug', USER_ID)).rejects.toThrow('ALREADY_OWNER')
  })

  it('idempotent — คืน {shopId} เฉย ๆ เมื่อเป็นสมาชิกอยู่แล้ว (ข้าม quota check)', async () => {
    linkFindUnique.mockResolvedValue({ shopId: SHOP_ID, revokedAt: null, expiresAt: new Date(Date.now() + 100000) })
    shopFindUnique.mockResolvedValue(businessShop())
    memberFindUnique.mockResolvedValue({ id: 'member-1', shopId: SHOP_ID, userId: USER_ID, role: 'ADMIN' })
    const result = await acceptInviteLink('slug', USER_ID)
    expect(result).toEqual({ shopId: SHOP_ID })
    expect(subFindUnique).not.toHaveBeenCalled()
    expect(memberUpsert).not.toHaveBeenCalled()
  })

  it('throws ADMIN_QUOTA_EXCEEDED เมื่อโควตาเต็ม', async () => {
    linkFindUnique.mockResolvedValue({ shopId: SHOP_ID, revokedAt: null, expiresAt: new Date(Date.now() + 100000) })
    shopFindUnique.mockResolvedValue(businessShop())
    memberFindUnique.mockResolvedValue(null)
    subFindUnique.mockResolvedValue({ ownerId: OWNER_ID, status: 'ACTIVE', tier: 'GROWTH' }) // maxAdminsPerBusiness=1
    memberCount.mockResolvedValue(1)
    await expect(acceptInviteLink('slug', USER_ID)).rejects.toThrow('ADMIN_QUOTA_EXCEEDED')
  })

  it('fail-closed — ไม่มี ACTIVE subscription = โควตา 0 → throw ADMIN_QUOTA_EXCEEDED', async () => {
    linkFindUnique.mockResolvedValue({ shopId: SHOP_ID, revokedAt: null, expiresAt: new Date(Date.now() + 100000) })
    shopFindUnique.mockResolvedValue(businessShop())
    memberFindUnique.mockResolvedValue(null)
    subFindUnique.mockResolvedValue(null)
    memberCount.mockResolvedValue(0)
    await expect(acceptInviteLink('slug', USER_ID)).rejects.toThrow('ADMIN_QUOTA_EXCEEDED')
  })

  it('happy path — สร้าง ShopMember ADMIN สำเร็จ', async () => {
    linkFindUnique.mockResolvedValue({ shopId: SHOP_ID, revokedAt: null, expiresAt: new Date(Date.now() + 100000) })
    shopFindUnique.mockResolvedValue(businessShop())
    memberFindUnique.mockResolvedValue(null)
    subFindUnique.mockResolvedValue(activeSub) // PRO — maxAdminsPerBusiness=3
    memberCount.mockResolvedValue(0)
    memberUpsert.mockResolvedValue({ id: 'new-member', shopId: SHOP_ID, userId: USER_ID, role: 'ADMIN' })

    const result = await acceptInviteLink('slug', USER_ID)
    expect(result).toEqual({ shopId: SHOP_ID })
    expect(memberUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId_userId: { shopId: SHOP_ID, userId: USER_ID } },
        create: { shopId: SHOP_ID, userId: USER_ID, role: 'ADMIN' },
      }),
    )
  })
})
