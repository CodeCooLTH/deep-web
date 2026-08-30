import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * [blocker] Regression — "สร้างรายการจากเธรดของอีกร้าน แล้วออเดอร์ไปเข้าร้านที่ active แทน"
 * (user report prod 2026-08-11 — จอขึ้น `RESOURCE_NOT_FOUND` ตอนสร้างการเข้ารับบริการ)
 *
 * ต้นเหตุเดิม: `POST /api/orders` resolve ร้านปลายทางด้วย `requireActiveShop()` ล้วน ๆ ขณะที่
 * กล่องแชทรวมหลายร้าน (feature 00037) เปิดเธรดของร้าน B ได้โดยร้านที่ active ยังเป็น A —
 * ฟอร์มโหลดคิวงาน/สินค้าของร้าน B มาแสดง แต่ตอนบันทึกยิงเข้าร้าน A
 *   - มีนัด  → คิวงานของ B ไม่มีในร้าน A → 404 RESOURCE_NOT_FOUND (อาการที่ user เห็น)
 *   - ไม่มีนัด + พิมพ์รายการเอง → **บันทึกสำเร็จเข้าร้านผิดถาวร ไม่มีอะไรฟ้อง** (ร้ายแรงกว่า)
 * `OrderCreateForm` รับ prop `shopId` ของร่างมาแล้วโยนทิ้ง (`shopId: _shopId`) และ route
 * ไม่มีที่ให้ใส่ — ด่านตาม AC-06-6 ของ 00037 ("ร้านของร่างไม่ตรงกับร้านของเธรด → ปฏิเสธ")
 * ไม่เคยถูกสร้างขึ้นมาเลย (TestCase B-24 เขียนเองว่า "ยังไม่มีวิธี repro จากหน้าจอ")
 *
 * 🛑 เทสนี้ตั้งใจ **ไม่ mock `@/lib/shop-context`** — mock แค่ prisma เพื่อให้ตัวตรวจสิทธิ์จริง
 * (resolveActiveShopContext → shop/shopMember) ถูกเดินจริงทุกครั้ง. mock ทิ้งทั้งตัวจะเขียว
 * ตลอดไม่ว่าด่านสิทธิ์จะทำอะไร (บทเรียน 00038)
 *
 * mock prisma ทั้งหมด — ห้ามต่อ DB จริง (Hard Rule 13)
 */

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

const prismaMock = vi.hoisted(() => ({
  shop: { findUnique: vi.fn(), findMany: vi.fn() },
  shopMember: { findUnique: vi.fn(), findMany: vi.fn() },
  conversation: { findFirst: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const createOrderMock = vi.hoisted(() => vi.fn())
vi.mock('@/services/order.service', () => ({
  createOrder: createOrderMock,
  getOrdersByShop: vi.fn(),
  getOrdersByBuyer: vi.fn(),
  ShippingAddressRequiredError: class extends Error {},
  ProductNotInShopError: class extends Error {},
  OrderDateOutOfWindowError: class extends Error {},
  // feature 00062 (U11) — route.ts เพิ่ม `instanceof PickupNotAllowedError` เข้า catch block
  // ต้องมีอยู่ในม็อกนี้เสมอ ไม่งั้น `instanceof undefined` throw TypeError ถ้ามีเทสในอนาคตที่
  // ทำให้ createOrder reject
  PickupNotAllowedError: class extends Error {},
}))
vi.mock('@/services/inventory-stock.service', () => ({ OutOfStockError: class extends Error {} }))

import { POST } from './route'
import { getServerSession } from 'next-auth'

const USER_ID = 'user-1'
const SHOP_A = '11111111-1111-4111-8111-111111111111' // ร้านที่ active อยู่
const SHOP_B = '22222222-2222-4222-8222-222222222222' // ร้านเจ้าของเธรดที่เปิดค้างไว้
const SHOP_OUTSIDER = '33333333-3333-4333-8333-333333333333' // ร้านที่ user ไม่มีสิทธิ์
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444'

/** body ที่ผ่าน CreateOrderSchema แบบน้อยที่สุด — รายการพิมพ์เอง (ไม่มี productId) */
function body(extra: Record<string, unknown> = {}) {
  return {
    items: [{ name: 'ตัดผม', qty: 1, price: 300 }],
    type: 'SERVICE',
    buyerContact: '0812345678',
    ...extra,
  }
}

function makeRequest(payload: Record<string, unknown>) {
  return new NextRequest('http://seller.deepth.local/api/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** ร้านทุกใบเป็น BUSINESS ที่ user เป็นสมาชิก ยกเว้น SHOP_OUTSIDER */
function wireShops() {
  prismaMock.shop.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id === SHOP_OUTSIDER) {
      return { id: SHOP_OUTSIDER, kind: 'BUSINESS', userId: 'someone-else', packageLockedAt: null, packageLockReason: null, deletedAt: null }
    }
    return { id: where.id, kind: 'BUSINESS', userId: 'owner-x', packageLockedAt: null, packageLockReason: null, deletedAt: null }
  })
  prismaMock.shopMember.findUnique.mockImplementation(async ({ where }: { where: { shopId_userId: { shopId: string } } }) => {
    return where.shopId_userId.shopId === SHOP_OUTSIDER ? null : { role: 'OWNER' }
  })
  // listAccessibleShopIds — user เข้าถึงร้าน A/B (ไม่รวม SHOP_OUTSIDER)
  prismaMock.shop.findMany.mockResolvedValue([])
  prismaMock.shopMember.findMany.mockResolvedValue([{ shopId: SHOP_A }, { shopId: SHOP_B }])
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: USER_ID, activeShopId: SHOP_A } } as never)
  wireShops()
  prismaMock.conversation.findFirst.mockResolvedValue(null)
  createOrderMock.mockResolvedValue({ publicToken: 'tok-1' })
})

describe('[blocker] POST /api/orders — ร้านปลายทางต้องเป็นร้านของร่าง ไม่ใช่ร้านที่ active', () => {
  it('ส่ง shopId ของร้าน B มาขณะ active เป็นร้าน A → createOrder ต้องถูกเรียกด้วยร้าน B', async () => {
    const res = await POST(makeRequest(body({ shopId: SHOP_B })))

    expect(res.status).toBe(201)
    expect(createOrderMock).toHaveBeenCalledTimes(1)
    expect(createOrderMock.mock.calls[0]![0]).toBe(SHOP_B)
  })

  it('ไม่ส่ง shopId → พฤติกรรมเดิมทุกประการ (ร้านที่ active)', async () => {
    const res = await POST(makeRequest(body()))

    expect(res.status).toBe(201)
    expect(createOrderMock.mock.calls[0]![0]).toBe(SHOP_A)
  })

  it('ส่ง shopId ของร้านที่ไม่มีสิทธิ์ → 403 และห้ามบันทึกอะไรเลย (fail-closed ห้าม fallback ไปร้าน active)', async () => {
    const res = await POST(makeRequest(body({ shopId: SHOP_OUTSIDER })))

    expect(res.status).toBe(403)
    expect(createOrderMock).not.toHaveBeenCalled()
  })

  it('AC-06-6 — ร่างผูกร้าน B แต่เธรดที่อ้างมาเป็นของร้าน A → ปฏิเสธ ห้ามเดาว่าจะเข้าร้านไหน', async () => {
    // เธรดมีจริงในขอบเขตสิทธิ์ของ user แต่เป็นของอีกร้าน
    prismaMock.conversation.findFirst.mockResolvedValue({ id: CONVERSATION_ID, shopId: SHOP_A })

    const res = await POST(makeRequest(body({ shopId: SHOP_B, conversationId: CONVERSATION_ID })))

    expect(res.status).toBe(409)
    expect(createOrderMock).not.toHaveBeenCalled()
    // ownership ต้องอยู่ใน WHERE ตั้งแต่คำสั่งแรก ไม่ใช่ดึงเธรดของใครก็ได้มาแล้วค่อยเทียบทีหลัง
    // (feedback_rsc_dal_authz) — ถ้าวันหนึ่งมีคนถอด filter นี้ออก เธรดของร้านคนอื่นจะถูกอ่านขึ้นมา
    expect(prismaMock.conversation.findFirst.mock.calls[0]![0].where.shop).toBeTruthy()
  })

  it('เธรดเป็นของร้านเดียวกับร่าง → ผ่านตามปกติ', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({ id: CONVERSATION_ID, shopId: SHOP_B })

    const res = await POST(makeRequest(body({ shopId: SHOP_B, conversationId: CONVERSATION_ID })))

    expect(res.status).toBe(201)
    expect(createOrderMock.mock.calls[0]![0]).toBe(SHOP_B)
  })
})
