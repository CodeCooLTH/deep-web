import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Regression test — บั๊ก "แชทไม่แยกตามร้าน" (user report prod)
 *
 * สาเหตุเดิม: GET /api/chat/conversations (seller branch) resolve shop ด้วย getShopByUserId
 * ซึ่งคืนร้าน PERSONAL เสมอ ไม่สนว่า session กำลัง active อยู่ร้านไหน (feature 00008 shop
 * switcher) — สลับไปร้าน B แล้วยังเห็นแชทของ PERSONAL (ร้าน A) ค้างอยู่
 *
 * ทดสอบ: ร้าน A (PERSONAL) มีเธรดอยู่, session.user.activeShopId ชี้ร้าน B (BUSINESS ที่ user
 * เป็นสมาชิก) → GET ต้องเรียก listConversationsForShop ด้วย shopId ของร้าน B เท่านั้น และ
 * response ต้องไม่มีเธรดของร้าน A ปนมาด้วย
 *
 * mock Prisma ทั้งหมด (@/lib/shop-context ใช้ prisma จริงแต่ import mock ผ่าน '@/lib/prisma') —
 * ห้ามต่อ DB จริงตามข้อบังคับ task
 */

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ — ถ้าประกาศ
// prismaMock ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError) — pattern เดียวกับ
// channel-chat-outbound.test.ts
const prismaMock = vi.hoisted(() => ({
  shop: { findUnique: vi.fn(), findFirst: vi.fn() },
  shopMember: { findUnique: vi.fn() },
  user: { findMany: vi.fn() },
  externalContact: { findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const listConversationsForShopMock = vi.hoisted(() => vi.fn())
vi.mock('@/services/chat.service', () => ({
  getOrCreateConversation: vi.fn(),
  listConversationsForShop: listConversationsForShopMock,
  listConversationsForBuyer: vi.fn(),
}))

import { GET } from './route'
import { getServerSession } from 'next-auth'

const SHOP_A_PERSONAL = 'shop-a-personal'
const SHOP_B_BUSINESS = 'shop-b-business'
const USER_ID = 'user-1'

const threadA = {
  id: 'conv-a1',
  buyerUserId: 'buyer-1',
  shopId: SHOP_A_PERSONAL,
  lastMessageAt: new Date('2026-07-20T10:00:00Z'),
  lastMessagePreview: 'ข้อความร้าน A',
  lastSenderRole: 'BUYER' as const,
  buyerLastReadAt: null,
  shopLastReadAt: null,
  createdAt: new Date('2026-07-19T10:00:00Z'),
  channel: 'DEEP',
  shopChannelId: null,
  externalContactId: null,
  lastInboundAt: new Date('2026-07-20T10:00:00Z'),
}

const threadB = {
  ...threadA,
  id: 'conv-b1',
  shopId: SHOP_B_BUSINESS,
  lastMessagePreview: 'ข้อความร้าน B',
}

function req(host = 'seller.deepthailand.app') {
  return new NextRequest('https://seller.deepthailand.app/api/chat/conversations', {
    headers: { host },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/chat/conversations (seller branch) — scope ตามร้าน active ไม่ใช่ PERSONAL เสมอ', () => {
  it('active = ร้าน B (BUSINESS) → เรียก listConversationsForShop ด้วย shopId ของร้าน B และไม่เห็นเธรดร้าน A', async () => {
    ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: USER_ID, activeShopId: SHOP_B_BUSINESS },
    })

    // resolveActiveShopContext: shop.findUnique(id=SHOP_B_BUSINESS) → BUSINESS shop, ตาม membership
    prismaMock.shop.findUnique.mockResolvedValue({
      id: SHOP_B_BUSINESS,
      kind: 'BUSINESS',
      userId: 'other-owner', // BUSINESS ที่ user เป็นแค่สมาชิก ไม่ใช่ผู้สร้าง
      packageLockedAt: null,
      packageLockReason: null,
      deletedAt: null,
    })
    prismaMock.shopMember.findUnique.mockResolvedValue({ role: 'ADMIN' })

    // listConversationsForShop คืนตาม shopId ที่รับจริง — ถ้าโค้ด (bug เดิม) เรียกด้วย SHOP_A_PERSONAL
    // แทน จะได้ threadA ปนมา ซึ่งทดสอบนี้ต้องจับได้
    listConversationsForShopMock.mockImplementation(async (shopId: string) => {
      if (shopId === SHOP_B_BUSINESS) return { items: [threadB], nextCursor: null }
      return { items: [threadA], nextCursor: null } // ไม่ควรถูกเรียกด้วย path นี้เลย
    })
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'buyer-1', displayName: 'ลูกค้า', avatar: null },
    ])
    prismaMock.externalContact.findMany.mockResolvedValue([])

    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()

    // 1) ต้อง resolve shop ด้วย id ของร้าน active (B) ไม่ใช่ getShopByUserId(PERSONAL)
    expect(listConversationsForShopMock).toHaveBeenCalledTimes(1)
    expect(listConversationsForShopMock.mock.calls[0][0]).toBe(SHOP_B_BUSINESS)

    // 2) response ต้องเห็นเฉพาะเธรดของร้าน B ไม่มีเธรดร้าน A ปนมา
    expect(body.items).toHaveLength(1)
    expect(body.items[0].id).toBe('conv-b1')
    expect(body.items.some((i: { id: string }) => i.id === 'conv-a1')).toBe(false)
  })

  it('activeShopId ไม่มี (ยังไม่เคยสลับ) → fallback PERSONAL ของ resolveActiveShopContext เอง (ไม่ error)', async () => {
    ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: USER_ID, activeShopId: null },
    })
    // resolveActiveShopContext: ไม่มี activeShopId → getPersonalShop(userId) → shop.findFirst
    prismaMock.shop.findFirst.mockResolvedValue({ id: SHOP_A_PERSONAL })
    listConversationsForShopMock.mockResolvedValue({ items: [threadA], nextCursor: null })
    prismaMock.user.findMany.mockResolvedValue([])
    prismaMock.externalContact.findMany.mockResolvedValue([])

    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(listConversationsForShopMock.mock.calls[0][0]).toBe(SHOP_A_PERSONAL)
  })

  it('resolve ไม่ได้ (ร้านถูกลบ/หลุดสิทธิ์) → 404 ห้าม fallback เงียบ ๆ ไป PERSONAL', async () => {
    ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: USER_ID, activeShopId: SHOP_B_BUSINESS },
    })
    prismaMock.shop.findUnique.mockResolvedValue({
      id: SHOP_B_BUSINESS,
      kind: 'BUSINESS',
      userId: 'other-owner',
      packageLockedAt: null,
      packageLockReason: null,
      deletedAt: null,
    })
    // หลุด membership — resolveActiveShopContext ต้องคืน null (ไม่ fallback PERSONAL)
    prismaMock.shopMember.findUnique.mockResolvedValue(null)

    const res = await GET(req())
    expect(res.status).toBe(404)
    expect(listConversationsForShopMock).not.toHaveBeenCalled()
  })

  it('ไม่ได้ login → 401', async () => {
    ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const res = await GET(req())
    expect(res.status).toBe(401)
  })
})
