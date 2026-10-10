import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * 00071 P1-T7 — ต้นทุนรายบรรทัดไม่ถึงผู้ไม่ใช่เจ้าของ (S-3 · D-4 · D-7)
 * mock prisma + updateOrder — ไม่ต่อ DB จริง (HR13) · ไม่ mock shop-context/shop-permissions (ด่านจริงต้องถูกเดิน)
 */
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

const prismaMock = vi.hoisted(() => ({
  shop: { findUnique: vi.fn(), findMany: vi.fn() },
  shopMember: { findUnique: vi.fn(), findMany: vi.fn() },
  order: { findFirst: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const updateOrderMock = vi.hoisted(() => vi.fn())
vi.mock('@/services/order.service', () => ({
  updateOrder: updateOrderMock,
  OrderNotFoundError: class extends Error {},
  OrderNotEditableError: class extends Error {},
  ProductNotInShopError: class extends Error {},
  ShippingAddressRequiredError: class extends Error {},
  OrderDateOutOfWindowError: class extends Error {},
  PickupNotAllowedError: class extends Error {},
}))
vi.mock('@/services/inventory-stock.service', () => ({ OutOfStockError: class extends Error {} }))

import { GET, PATCH } from './route'
import { getServerSession } from 'next-auth'

const USER = 'user-1'
const SHOP = '11111111-1111-4111-8111-111111111111'

function asRole(role: 'OWNER' | 'ADMIN') {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: USER, activeShopId: SHOP } } as never)
  // BUSINESS: บทบาทมาจาก ShopMember.role (resolveActiveShopContext)
  prismaMock.shop.findUnique.mockResolvedValue({
    id: SHOP, userId: USER, kind: 'BUSINESS', vertical: 'ONLINE_SALES',
    packageLockedAt: null, packageLockReason: null, deletedAt: null,
  })
  prismaMock.shopMember.findUnique.mockResolvedValue({ role, roles: role === 'ADMIN' ? ['MANAGER'] : [] })
}

const item = { productId: null, name: 'a', description: null, qty: 1, price: 10, cost: 5 }
const orderRow = { publicToken: 't', status: 'PENDING', type: 'PHYSICAL', createdAt: new Date(), items: [item] }
const params = { params: Promise.resolve({ token: 't' }) }
const getReq = () => new NextRequest(`http://x/api/orders/t?shopId=${SHOP}`)
const patchReq = () =>
  new NextRequest('http://x/api/orders/t', {
    method: 'PATCH',
    body: JSON.stringify({ shopId: SHOP, type: 'PHYSICAL', buyerContact: '0812345678', items: [{ name: 'a', qty: 1, price: 10, cost: 7 }] }),
  })

describe('GET /api/orders/[token] — ต้นทุนรายบรรทัด', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.order.findFirst.mockImplementation(async (a: { select: { items: { select: Record<string, boolean> } } }) => ({
      ...orderRow,
      items: [Object.fromEntries(Object.keys(a.select.items.select).map((k) => [k, (item as Record<string, unknown>)[k] ?? null]))],
    }))
  })

  it('ADMIN: ไม่มีคีย์ cost ใน items และไม่ select cost', async () => {
    asRole('ADMIN')
    const res = await GET(getReq(), params)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect('cost' in body.items[0]).toBe(false)
    expect(prismaMock.order.findFirst.mock.calls[0][0].select.items.select.cost).toBeUndefined()
  })

  it('OWNER: ได้ cost', async () => {
    asRole('OWNER')
    const body = await (await GET(getReq(), params)).json()
    expect(body.items[0].cost).toBe(5)
  })
})

describe('PATCH /api/orders/[token] — ตัด items[].cost ของผู้ไม่ใช่เจ้าของ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateOrderMock.mockResolvedValue({ id: 'o' })
  })

  it('ADMIN: cost ถูกตัดก่อนถึง service + keepLineCosts=true', async () => {
    asRole('ADMIN')
    const res = await PATCH(patchReq(), params)
    expect(res.status).toBe(200)
    const [, , data, , opts] = updateOrderMock.mock.calls[0]
    expect('cost' in data.items[0]).toBe(false)
    expect(opts).toEqual({ keepLineCosts: true })
  })

  it('OWNER: cost ผ่านไปถึง service + keepLineCosts=false', async () => {
    asRole('OWNER')
    await PATCH(patchReq(), params)
    const [, , data, , opts] = updateOrderMock.mock.calls[0]
    expect(data.items[0].cost).toBe(7)
    expect(opts).toEqual({ keepLineCosts: false })
  })
})

describe('PATCH /api/orders/[token] — response ไม่มีต้นทุน (review T7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateOrderMock.mockResolvedValue({ id: 'o', items: [{ name: 'a', price: 10, cost: 5 }] })
  })

  it('ADMIN: response items ไม่มีคีย์ cost', async () => {
    asRole('ADMIN')
    const body = await (await PATCH(patchReq(), params)).json()
    expect('cost' in body.items[0]).toBe(false)
  })

  it('OWNER: response items มี cost', async () => {
    asRole('OWNER')
    const body = await (await PATCH(patchReq(), params)).json()
    expect(body.items[0].cost).toBe(5)
  })
})
