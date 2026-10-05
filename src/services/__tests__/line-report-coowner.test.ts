/**
 * line-report-coowner.test.ts — เจ้าของร่วมผูกรายงานกลุ่ม LINE ได้ (ส่วนขยาย 00070 · 2026-10-05)
 *
 * ต้นเรื่อง: Deep Nattapat เป็นเจ้าของร่วม (ShopMember.role='OWNER') ของร้าน BT แต่หน้าผูกกลุ่มหาร้านไม่เจอ
 * เพราะทุก query กรอง `Shop.userId = owner` (เจ้าของหลักเท่านั้น)
 * ครอบ: เจ้าของร่วมเห็น/ส่งได้ · ถูกลดเป็นผู้ดูแล/ถูกลบออก = หลุดตอนส่ง (NOT_OWNED) · ADMIN ไม่เคยผ่าน
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    shop: { findMany: vi.fn() },
    lineReportGroupShop: { findMany: vi.fn() },
  },
}))
vi.mock('@/services/line-report-access.service', () => ({ isOwnerPaidForReports: vi.fn(async () => true) }))

import { prisma } from '@/lib/prisma'
import {
  isOwnedBy,
  listReportableShops,
  ownedShopWhere,
  resolveSendableShops,
} from '@/services/line-report-shop.service'

const shopFindMany = vi.mocked(prisma.shop.findMany)
const linkFindMany = vi.mocked(prisma.lineReportGroupShop.findMany)

const OWNER = 'u-coowner'
const base = { shopName: 'BT', vertical: 'SERVICE_QUEUE', kind: 'BUSINESS', packageLockedAt: null, deletedAt: null, purgedAt: null }

beforeEach(() => {
  shopFindMany.mockReset()
  linkFindMany.mockReset()
})

describe('[blocker] ownedShopWhere — เจ้าของหลัก หรือ สมาชิก role OWNER เท่านั้น', () => {
  it('OR ของ userId กับ members.some role OWNER (ไม่ใช่ทุก role)', () => {
    expect(ownedShopWhere(OWNER)).toEqual({
      OR: [{ userId: OWNER }, { members: { some: { userId: OWNER, role: 'OWNER' } } }],
    })
  })

  it('listReportableShops ใช้ ownedShopWhere + ตัดร้านลบ/purge/ล็อก', async () => {
    shopFindMany.mockResolvedValue([] as never)
    await listReportableShops(OWNER)
    const where = (shopFindMany.mock.calls[0][0] as { where: Record<string, unknown> }).where
    expect(where).toMatchObject({ ...ownedShopWhere(OWNER), deletedAt: null, purgedAt: null, packageLockedAt: null })
  })
})

describe('[blocker] isOwnedBy — ฝั่ง JS ที่จุดส่ง', () => {
  it('เจ้าของหลัก = ใช่ · เจ้าของร่วม (มีแถว OWNER) = ใช่ · ไม่มีทั้งคู่ = ไม่ใช่', () => {
    expect(isOwnedBy({ userId: OWNER, members: [] }, OWNER)).toBe(true)
    expect(isOwnedBy({ userId: 'u-primary', members: [{ id: 'm1' }] }, OWNER)).toBe(true)
    expect(isOwnedBy({ userId: 'u-primary', members: [] }, OWNER)).toBe(false)
  })
})

describe('[blocker] resolveSendableShops — เจ้าของร่วมส่งได้ · ถูกลดสิทธิ์แล้วหลุด', () => {
  it('เจ้าของร่วม → sendable · ถูกลดเป็นผู้ดูแล (query members OWNER คืนว่าง) → NOT_OWNED', async () => {
    linkFindMany.mockResolvedValue([
      { shop: { ...base, id: 's-co', userId: 'u-primary', members: [{ id: 'm1' }] } },
      { shop: { ...base, id: 's-demoted', userId: 'u-primary', members: [] } },
    ] as never)
    const r = await resolveSendableShops({ id: 'g1', ownerId: OWNER })
    expect(r.sendable.map((s) => s.id)).toEqual(['s-co'])
    expect(r.excluded).toEqual([{ shop: expect.objectContaining({ id: 's-demoted' }), reason: 'NOT_OWNED' }])
    // select ต้องกรองแถวสมาชิกด้วย role OWNER ของเจ้าของกลุ่ม — ไม่งั้นผู้ดูแลจะนับเป็นเจ้าของ
    const sel = (linkFindMany.mock.calls[0][0] as { select: { shop: { select: { members: { where: unknown } } } } }).select
    expect(sel.shop.select.members.where).toEqual({ userId: OWNER, role: 'OWNER' })
  })
})
