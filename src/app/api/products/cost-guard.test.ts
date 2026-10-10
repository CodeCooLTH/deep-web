import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * 00071 D-7 — คีย์ `cost` ใน body จากผู้ไม่ใช่เจ้าของ = 403 FORBIDDEN_ROLE · ไม่มีคีย์ = ผ่านปกติ
 * mock prisma/service ทั้งหมด — ไม่ต่อ DB (Hard Rule 13)
 */
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'u1' } })) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

const role = vi.hoisted(() => ({ current: 'ADMIN' as 'OWNER' | 'ADMIN', ctxNull: false }))
vi.mock('@/lib/shop-context', () => ({
  requireActiveShop: vi.fn(async () => ({
    shop: { id: 'shop-1', vertical: 'ONLINE_SALES' }, kind: 'BUSINESS', role: role.current, roles: role.current === 'ADMIN' ? ['MANAGER'] : [], locked: false, lockReason: null,
  })),
  requireShopForRequest: vi.fn(async () => ({ ok: true, target: { shop: { id: 'shop-1', vertical: 'ONLINE_SALES' }, role: role.current, roles: role.current === 'ADMIN' ? ['MANAGER'] : [] } })),
  canAccessShop: vi.fn(async () => true),
  resolveActiveShopContext: vi.fn(async () => (role.ctxNull ? null : { shopId: 'shop-1', role: role.current, roles: role.current === 'ADMIN' ? ['MANAGER'] : [] })),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { product: { findUnique: vi.fn(async () => ({ id: 'p1', shopId: 'shop-1', type: 'PHYSICAL', stockQty: null, shop: { vertical: 'ONLINE_SALES' } })) } },
}))
const createProduct = vi.hoisted(() => vi.fn(async () => ({ id: 'p1' })))
const updateProduct = vi.hoisted(() => vi.fn(async () => ({ id: 'p1' })))
vi.mock('@/services/product.service', () => ({
  getProductsByShop: vi.fn(async () => [{ id: 'p1' }]), getBestSellerProducts: vi.fn(async () => []), deleteProduct: vi.fn(),
  createProduct, updateProduct,
  serializeProduct: (_p: unknown, o: { canSeeCost: boolean }) => ({ id: 'p1', ...(o.canSeeCost ? { cost: 5 } : {}) }),
}))
vi.mock('@/services/inventory-entitlement.service', () => ({
  isEntitlementActive: vi.fn(async () => false), isProActive: vi.fn(async () => false),
}))

import { GET, POST } from './route'
import { PATCH } from './[id]/route'

const post = (b: object) => POST(new NextRequest('http://seller.deepth.local/api/products', { method: 'POST', body: JSON.stringify(b) }))
const patch = (b: object) =>
  PATCH(new NextRequest('http://seller.deepth.local/api/products/p1', { method: 'PATCH', body: JSON.stringify(b) }), {
    params: Promise.resolve({ id: 'p1' }),
  })
const base = { name: 'x', price: 10, type: 'PHYSICAL' }

beforeEach(() => { vi.clearAllMocks(); role.current = 'ADMIN'; role.ctxNull = false })

describe('POST /api/products — cost guard', () => {
  it('ADMIN ส่ง cost → 403 FORBIDDEN_ROLE และไม่สร้างสินค้า', async () => {
    const res = await post({ ...base, cost: 5 })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
    expect(createProduct).not.toHaveBeenCalled()
  })
  it('ADMIN ส่ง cost: null ก็ 403 (ตัดสินที่ "มีคีย์")', async () => {
    expect((await post({ ...base, cost: null })).status).toBe(403)
  })
  it('ADMIN ไม่ส่งคีย์ → 201 และ response ไม่มี cost', async () => {
    const res = await post(base)
    expect(res.status).toBe(201)
    expect(await res.json()).not.toHaveProperty('cost')
  })
  it('OWNER ส่ง cost → 201 มี cost', async () => {
    role.current = 'OWNER'
    const res = await post({ ...base, cost: 5 })
    expect(res.status).toBe(201)
    expect((await res.json()).cost).toBe(5)
  })
})

describe('PATCH /api/products/[id] — cost guard', () => {
  it('ADMIN ส่ง cost → 403 และไม่เรียก updateProduct', async () => {
    const res = await patch({ cost: 5 })
    expect(res.status).toBe(403)
    expect(updateProduct).not.toHaveBeenCalled()
  })
  it('ADMIN ไม่ส่งคีย์ → 200 ไม่มี cost', async () => {
    const res = await patch({ name: 'y' })
    expect(res.status).toBe(200)
    expect(await res.json()).not.toHaveProperty('cost')
  })
  it('OWNER ส่ง cost → 200', async () => {
    role.current = 'OWNER'
    expect((await patch({ cost: 5 })).status).toBe(200)
    expect(updateProduct).toHaveBeenCalled()
  })
})

describe('GET /api/products — cost redaction', () => {
  const get = () => GET(new NextRequest('http://seller.deepth.local/api/products'))
  it('ADMIN → รายการสินค้าไม่มีคีย์ cost', async () => {
    const items = await (await get()).json()
    expect(items.length).toBeGreaterThan(0)
    for (const it of items) expect(it).not.toHaveProperty('cost')
  })
  it('OWNER → มี cost', async () => {
    role.current = 'OWNER'
    expect((await (await get()).json())[0].cost).toBe(5)
  })
})

describe('PATCH — membership ctx เป็น null (fail-closed)', () => {
  it('ส่ง cost → 403 และไม่เรียก updateProduct', async () => {
    role.current = 'OWNER'
    role.ctxNull = true
    expect((await patch({ cost: 5 })).status).toBe(403)
    expect(updateProduct).not.toHaveBeenCalled()
  })
})
