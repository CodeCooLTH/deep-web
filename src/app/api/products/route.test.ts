import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * [blocker] Regression — "แผงเลือกสินค้าในเธรดร้าน B แสดงสินค้าของร้าน A"
 *
 * `ProductPickerPanel` / `ProductMultiSelectSheet` ในกล่องแชทยิง `GET /api/products?sort=best`
 * แล้วเอาผลไป **ส่งการ์ดสินค้าให้ลูกค้าจริง** — endpoint นี้ scope ด้วยร้าน active มาตลอด
 * ขณะที่ feature 00037 ทำให้เปิดเธรดของอีกร้านได้โดย active ไม่ขยับ (BR-UNI-07)
 * ⇒ ส่งชื่อ/ราคา/รูปของอีกร้านออกไปหาลูกค้า โดยไม่มีอะไรบนจอบอกว่าผิด
 *
 * 🛑 ไม่ mock `@/lib/shop-context` — ให้ตัวตรวจ membership จริงถูกเดินทุกครั้ง
 * mock prisma ทั้งหมด — ห้ามต่อ DB จริง (Hard Rule 13)
 */

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

const prismaMock = vi.hoisted(() => ({
  shop: { findUnique: vi.fn() },
  shopMember: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const getProductsByShopMock = vi.hoisted(() => vi.fn())
vi.mock('@/services/product.service', () => ({
  getProductsByShop: getProductsByShopMock,
  getBestSellerProducts: vi.fn(async () => []),
  createProduct: vi.fn(),
  serializeProduct: (p: unknown) => p,
}))
vi.mock('@/services/inventory-entitlement.service', () => ({
  isEntitlementActive: vi.fn(async () => false),
  isProActive: vi.fn(async () => false),
}))

import { GET } from './route'
import { getServerSession } from 'next-auth'

const USER_ID = 'user-1'
const SHOP_A = '11111111-1111-4111-8111-111111111111' // active
const SHOP_B = '22222222-2222-4222-8222-222222222222' // ร้านของเธรด
const SHOP_OUTSIDER = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: USER_ID, activeShopId: SHOP_A } } as never)
  prismaMock.shop.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id, kind: 'BUSINESS', userId: 'owner-x', packageLockedAt: null, packageLockReason: null, deletedAt: null,
  }))
  prismaMock.shopMember.findUnique.mockImplementation(async ({ where }: { where: { shopId_userId: { shopId: string } } }) =>
    where.shopId_userId.shopId === SHOP_OUTSIDER ? null : { role: 'OWNER' },
  )
  getProductsByShopMock.mockResolvedValue([])
})

const req = (qs = '') => new NextRequest(`http://seller.deepth.local/api/products${qs}`)

describe('[blocker] GET /api/products — แคตตาล็อกต้องเป็นของร้านที่ระบุ ไม่ใช่ร้านที่ active', () => {
  it('?shopId=B → อ่านแคตตาล็อกของร้าน B', async () => {
    await GET(req(`?shopId=${SHOP_B}`))
    expect(getProductsByShopMock).toHaveBeenCalledWith(SHOP_B)
  })

  it('ไม่ส่ง shopId → พฤติกรรมเดิม (ร้านที่ active)', async () => {
    await GET(req())
    expect(getProductsByShopMock).toHaveBeenCalledWith(SHOP_A)
  })

  it('shopId ของร้านที่ไม่มีสิทธิ์ → รายการว่าง และห้ามหลุดไปอ่านร้าน active แทน', async () => {
    const res = await GET(req(`?shopId=${SHOP_OUTSIDER}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
    expect(getProductsByShopMock).not.toHaveBeenCalled()
  })

  it('shopId รูปแบบผิด → 400 ไม่ใช่ตกไปอ่านร้าน active เงียบ ๆ', async () => {
    const res = await GET(req('?shopId=not-a-uuid'))
    expect(res.status).toBe(400)
    expect(getProductsByShopMock).not.toHaveBeenCalled()
  })
})
