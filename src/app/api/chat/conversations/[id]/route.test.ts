import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// PATCH /api/chat/conversations/{id} — S-7 (ตัวกรองแชท + ปักหมุด/ซ่อน/ปิดงาน, feature 00018)
// mock Prisma ทั้งหมด — ห้ามต่อ DB จริง

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ — ถ้าประกาศ
// prismaMock ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError)
const prismaMock = vi.hoisted(() => ({
  shop: { findUnique: vi.fn(), findFirst: vi.fn() },
  shopMember: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const updateConversationStateMock = vi.hoisted(() => vi.fn())
vi.mock('@/services/chat.service', () => ({
  updateConversationState: updateConversationStateMock,
}))

import { PATCH } from './route'
import { getServerSession } from 'next-auth'

const USER_ID = 'user-1'
const SHOP_A_PERSONAL = 'shop-a-personal'
const CONV_ID = '11111111-1111-1111-1111-111111111111'

function req(body: unknown) {
  return new NextRequest(`https://seller.deepthailand.app/api/chat/conversations/${CONV_ID}`, {
    method: 'PATCH',
    headers: { host: 'seller.deepthailand.app', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function params() {
  return { params: Promise.resolve({ id: CONV_ID }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/chat/conversations/[id]', () => {
  it('ไม่ได้ login → 401', async () => {
    ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const res = await PATCH(req({ action: 'pin' }), params())
    expect(res.status).toBe(401)
    expect(updateConversationStateMock).not.toHaveBeenCalled()
  })

  it('resolve ร้าน active ไม่ได้ (ไม่มี Personal/หลุด membership) → 404', async () => {
    ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: USER_ID, activeShopId: null } })
    prismaMock.shop.findFirst.mockResolvedValue(null) // resolveActiveShopContext: ไม่มี activeShopId → getPersonalShop → shop.findFirst
    const res = await PATCH(req({ action: 'pin' }), params())
    expect(res.status).toBe(404)
    expect(updateConversationStateMock).not.toHaveBeenCalled()
  })

  it("action ไม่ถูกต้อง (ไม่อยู่ใน picklist) → 400 ไม่เรียก service", async () => {
    ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: USER_ID, activeShopId: null } })
    prismaMock.shop.findFirst.mockResolvedValue({ id: SHOP_A_PERSONAL })
    const res = await PATCH(req({ action: 'delete' }), params())
    expect(res.status).toBe(400)
    expect(updateConversationStateMock).not.toHaveBeenCalled()
  })

  it("path param id ไม่ใช่ uuid → 400", async () => {
    ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: USER_ID, activeShopId: null } })
    prismaMock.shop.findFirst.mockResolvedValue({ id: SHOP_A_PERSONAL })
    const badReq = new NextRequest('https://seller.deepthailand.app/api/chat/conversations/not-a-uuid', {
      method: 'PATCH',
      headers: { host: 'seller.deepthailand.app', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'pin' }),
    })
    const res = await PATCH(badReq, { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(400)
    expect(updateConversationStateMock).not.toHaveBeenCalled()
  })

  it.each(['pin', 'unpin', 'hide', 'unhide', 'resolve', 'reopen'] as const)(
    "action=%s ถูกต้อง → เรียก updateConversationState(id, activeShopId, action) แล้วคืน 200",
    async (action) => {
      ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: USER_ID, activeShopId: null } })
      prismaMock.shop.findFirst.mockResolvedValue({ id: SHOP_A_PERSONAL })
      updateConversationStateMock.mockResolvedValue(undefined)

      const res = await PATCH(req({ action }), params())

      expect(res.status).toBe(200)
      expect(updateConversationStateMock).toHaveBeenCalledWith(CONV_ID, SHOP_A_PERSONAL, action)
    },
  )

  it('ownership: service throw CONVERSATION_NOT_FOUND_OR_FORBIDDEN (ร้านอื่น PATCH ไม่ได้) → 404', async () => {
    ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: USER_ID, activeShopId: null } })
    prismaMock.shop.findFirst.mockResolvedValue({ id: SHOP_A_PERSONAL })
    updateConversationStateMock.mockRejectedValue(new Error('CONVERSATION_NOT_FOUND_OR_FORBIDDEN'))

    const res = await PATCH(req({ action: 'pin' }), params())
    expect(res.status).toBe(404)
  })

  it('resolve ร้าน active ได้เป็น BUSINESS shop ที่ user เป็นสมาชิก → ใช้ shopId ของ BUSINESS ไม่ใช่ Personal', async () => {
    const SHOP_B_BUSINESS = 'shop-b-business'
    ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: USER_ID, activeShopId: SHOP_B_BUSINESS },
    })
    prismaMock.shop.findUnique.mockResolvedValue({
      id: SHOP_B_BUSINESS, kind: 'BUSINESS', userId: 'other-owner',
      packageLockedAt: null, packageLockReason: null, deletedAt: null,
    })
    prismaMock.shopMember.findUnique.mockResolvedValue({ role: 'ADMIN' })
    updateConversationStateMock.mockResolvedValue(undefined)

    const res = await PATCH(req({ action: 'resolve' }), params())
    expect(res.status).toBe(200)
    expect(updateConversationStateMock).toHaveBeenCalledWith(CONV_ID, SHOP_B_BUSINESS, 'resolve')
  })
})
