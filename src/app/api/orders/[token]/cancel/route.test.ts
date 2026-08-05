import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Regression test — บั๊ก "admin ยกเลิกคำสั่งซื้อไม่ได้" (user report prod 2026-08-05)
 *
 * สาเหตุเดิม: POST /api/orders/[token]/cancel เช็คสิทธิ์ฝั่ง seller ด้วย
 * `sessionUserId === order.shop.userId` (owner-only) — BUSINESS admin ที่ถูกเชิญ
 * เปิดหน้า order detail ได้ (หน้าใช้ requireActiveShop = membership-based) แต่กดยกเลิก
 * แล้วโดน 403 "ไม่มีสิทธิ์ยกเลิกคำสั่งซื้อนี้" — คลาสเดียวกับบั๊กแชทที่เคยเกิดบน prod
 * (ดู comment ของ canAccessShop ใน shop-context.ts)
 *
 * ทดสอบ: user เป็น ShopMember (ADMIN) ของร้าน BUSINESS ที่ไม่ใช่ shop.userId
 * → ต้องยกเลิกได้ (initiator = 'seller') · คนนอก (ไม่ใช่สมาชิก ไม่ใช่ buyer) → ยังต้อง 403
 *
 * mock Prisma ทั้งหมด (@/lib/shop-context ใช้ prisma จริงแต่ import mock ผ่าน '@/lib/prisma')
 * — ห้ามต่อ DB จริง (Hard Rule 13)
 */

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

// vi.hoisted กัน TDZ — pattern เดียวกับ chat/conversations/route.test.ts
const prismaMock = vi.hoisted(() => ({
  order: { findUnique: vi.fn() },
  shop: { findUnique: vi.fn() },
  shopMember: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const cancelOrderMock = vi.hoisted(() => vi.fn())
vi.mock('@/services/order.service', () => ({
  cancelOrder: cancelOrderMock,
  CancelReasonRequiredError: class extends Error {},
  InvalidCancelReasonError: class extends Error {},
}))

import { POST } from './route'
import { getServerSession } from 'next-auth'

const SHOP_ID = 'shop-biz-1'
const OWNER_ID = 'user-owner'
const ADMIN_ID = 'user-admin' // สมาชิก ADMIN — ไม่ใช่ shop.userId
const OUTSIDER_ID = 'user-outsider'
const TOKEN = 'tok-123'

const orderRow = {
  id: 'order-1',
  publicToken: TOKEN,
  shopId: SHOP_ID,
  buyerUserId: null,
  shop: { id: SHOP_ID, userId: OWNER_ID, kind: 'BUSINESS' },
}

function makeRequest() {
  return new NextRequest(`http://seller.deepth.local/api/orders/${TOKEN}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

const routeParams = { params: Promise.resolve({ token: TOKEN }) }

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.order.findUnique.mockResolvedValue(orderRow)
  // canAccessShop → prisma.shop.findUnique({select:{userId}}) แล้วค่อย shopMember.findUnique
  prismaMock.shop.findUnique.mockResolvedValue({ userId: OWNER_ID })
  cancelOrderMock.mockResolvedValue({ status: 'CANCELLED' })
})

describe('POST /api/orders/[token]/cancel — สิทธิ์ฝั่งร้าน', () => {
  it('BUSINESS admin (สมาชิกที่ไม่ใช่ owner) ยกเลิกได้ initiator=seller', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: ADMIN_ID } } as never)
    prismaMock.shopMember.findUnique.mockResolvedValue({ shopId: SHOP_ID })

    const res = await POST(makeRequest(), routeParams)

    expect(res.status).toBe(200)
    expect(cancelOrderMock).toHaveBeenCalledWith(TOKEN, 'seller', undefined, ADMIN_ID)
  })

  it('owner ยังยกเลิกได้เหมือนเดิม', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: OWNER_ID } } as never)
    prismaMock.shopMember.findUnique.mockResolvedValue(null)

    const res = await POST(makeRequest(), routeParams)

    expect(res.status).toBe(200)
    expect(cancelOrderMock).toHaveBeenCalledWith(TOKEN, 'seller', undefined, OWNER_ID)
  })

  it('คนนอก (ไม่ใช่สมาชิก ไม่ใช่ buyer) โดน 403 เหมือนเดิม', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: OUTSIDER_ID } } as never)
    prismaMock.shopMember.findUnique.mockResolvedValue(null)

    const res = await POST(makeRequest(), routeParams)

    expect(res.status).toBe(403)
    expect(cancelOrderMock).not.toHaveBeenCalled()
  })
})
