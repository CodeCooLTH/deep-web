import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * [blocker] Regression — "แก้ไขรายการจากเธรดของอีกร้าน แล้วขึ้นว่าไม่พบคำสั่งซื้อ"
 *
 * คลาสเดียวกับบั๊กสร้างรายการ (ดู `src/app/api/orders/route.test.ts`): กล่องแชทรวมหลายร้าน
 * (feature 00037) เปิดเธรดของร้าน B ได้โดยร้านที่ active ยังเป็น A — การ์ดออเดอร์ในเธรดนั้น
 * เป็นของร้าน B แต่ GET/PATCH `/api/orders/[token]` scope ด้วยร้าน active เสมอ → 404
 * ทั้งที่ผู้ขายมีสิทธิ์เต็มและเพิ่งเห็นออเดอร์ใบนั้นบนจอ
 *
 * 🛑 ไม่ mock `@/lib/shop-context` — ต้องให้ตัวตรวจสิทธิ์จริงถูกเดินทุกครั้ง
 * mock prisma ทั้งหมด — ห้ามต่อ DB จริง (Hard Rule 13)
 */

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

const prismaMock = vi.hoisted(() => ({
  shop: { findUnique: vi.fn() },
  shopMember: { findUnique: vi.fn() },
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
}))

import { GET, PATCH } from './route'
import { getServerSession } from 'next-auth'

const USER_ID = 'user-1'
const SHOP_A = '11111111-1111-4111-8111-111111111111' // active
const SHOP_B = '22222222-2222-4222-8222-222222222222' // ร้านของเธรด
const SHOP_OUTSIDER = '33333333-3333-4333-8333-333333333333'
const TOKEN = 'tok-1'

const routeParams = { params: Promise.resolve({ token: TOKEN }) }

function patchBody(extra: Record<string, unknown> = {}) {
  return {
    items: [{ name: 'ตัดผม', qty: 1, price: 300 }],
    type: 'SERVICE',
    buyerContact: '0812345678',
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: USER_ID, activeShopId: SHOP_A } } as never)
  prismaMock.shop.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id, kind: 'BUSINESS', userId: 'owner-x', packageLockedAt: null, packageLockReason: null, deletedAt: null,
  }))
  prismaMock.shopMember.findUnique.mockImplementation(async ({ where }: { where: { shopId_userId: { shopId: string } } }) =>
    where.shopId_userId.shopId === SHOP_OUTSIDER ? null : { role: 'OWNER' },
  )
  prismaMock.order.findFirst.mockResolvedValue({
    publicToken: TOKEN, status: 'PENDING', type: 'SERVICE', createdAt: new Date(),
    buyerName: null, buyerContact: null, paymentMethod: null, salesChannel: null,
    internalNote: null, discount: null, vatRate: null, vatAmount: null, shippingAddress: null, items: [],
  })
  updateOrderMock.mockResolvedValue({ publicToken: TOKEN })
})

describe('[blocker] GET/PATCH /api/orders/[token] — ต้องทำงานกับร้านของร่าง ไม่ใช่ร้านที่ active', () => {
  it('GET ?shopId=B → หาออเดอร์ในร้าน B', async () => {
    const res = await GET(new NextRequest(`http://seller.deepth.local/api/orders/${TOKEN}?shopId=${SHOP_B}`), routeParams)

    expect(res.status).toBe(200)
    expect(prismaMock.order.findFirst.mock.calls[0]![0].where).toMatchObject({ publicToken: TOKEN, shopId: SHOP_B })
  })

  it('GET ไม่ส่ง shopId → พฤติกรรมเดิม (ร้านที่ active)', async () => {
    const res = await GET(new NextRequest(`http://seller.deepth.local/api/orders/${TOKEN}`), routeParams)

    expect(res.status).toBe(200)
    expect(prismaMock.order.findFirst.mock.calls[0]![0].where).toMatchObject({ shopId: SHOP_A })
  })

  it('PATCH body.shopId=B → updateOrder ถูกเรียกด้วยร้าน B', async () => {
    const req = new NextRequest(`http://seller.deepth.local/api/orders/${TOKEN}`, {
      method: 'PATCH',
      body: JSON.stringify(patchBody({ shopId: SHOP_B })),
    })

    const res = await PATCH(req, routeParams)

    expect(res.status).toBe(200)
    expect(updateOrderMock.mock.calls[0]![0]).toBe(SHOP_B)
  })

  it('PATCH shopId ของร้านที่ไม่มีสิทธิ์ → ไม่แก้อะไรเลย (ห้าม fallback ไปร้าน active)', async () => {
    const req = new NextRequest(`http://seller.deepth.local/api/orders/${TOKEN}`, {
      method: 'PATCH',
      body: JSON.stringify(patchBody({ shopId: SHOP_OUTSIDER })),
    })

    const res = await PATCH(req, routeParams)

    expect(res.status).toBe(404)
    expect(updateOrderMock).not.toHaveBeenCalled()
  })
})
