/**
 * createOrder — Order.shopChannelId (2026-08-10, user request)
 *
 * เขียนช่องทางที่ลูกค้าทักเข้ามาจริง (LINE OA / เพจ Messenger-Instagram ที่เธรดผูกอยู่) ลง
 * Order.shopChannelId ทันทีตอนสร้างออเดอร์จากแชท
 *
 * 🛑 จุดที่พลาดง่ายที่สุดของงานนี้: ต้องเขียนแม้ "ยังไม่มีเบอร์ลูกค้า" (customerId=null) —
 * ต่างจาก customer-link (ผูก ExternalContact เข้า Customer) ที่ทำเฉพาะตอนมีเบอร์เท่านั้น
 * เทสชุดนี้พิสูจน์ว่าเงื่อนไขทั้งสองไม่ได้ผูกกันจริง ๆ (ไม่ใช่แค่ "บังเอิญผ่านเพราะเทสมีเบอร์เสมอ")
 *
 * ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ — ถ้าประกาศ db
 * ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError) — pattern เดียวกับ
 * chat-service-filters.test.ts
 *
 * scenario ที่เลือก (type=DIGITAL, item ไม่มี productId) ตั้งใจให้เดินพ้นทุก branch ที่ไม่เกี่ยวข้อง
 * กับ shopChannelId เลย (shipping-required / stock-deduct / appointment) เพื่อให้ mock surface
 * เล็กที่สุดเท่าที่จำเป็น — เหลือเฉพาะ path จริงที่ resolvedShopChannelId เดินผ่าน
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  shop: { findUnique: vi.fn() },
  product: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  conversation: { findFirst: vi.fn() },
  externalContact: { updateMany: vi.fn() },
  inventoryEntitlement: { findUnique: vi.fn() },
  order: { create: vi.fn(), update: vi.fn() },
  orderEvent: { create: vi.fn() },
  stockMovement: { create: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

// findOrCreateCustomer แยก mock — ไม่ต้องประกอบ Customer flow จริงเพื่อพิสูจน์ shopChannelId
const custMock = vi.hoisted(() => ({ findOrCreateCustomer: vi.fn() }))
vi.mock('@/services/customer.service', () => custMock)

import { createOrder } from '@/services/order.service'

const DIGITAL_ITEM = [{ name: 'สินค้าทดสอบ', qty: 1, price: 100 }]

describe('createOrder — Order.shopChannelId (2026-08-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.$transaction.mockImplementation(async (cb: any) => cb(db))
    db.shop.findUnique.mockResolvedValue({ vertical: 'ONLINE_SALES' })
    db.product.findFirst.mockResolvedValue(null) // Quick-Create: ไม่มีสินค้าชื่อซ้ำ
    db.product.create.mockResolvedValue({ id: 'prod-auto-1' })
    db.product.findMany.mockResolvedValue([{ id: 'prod-auto-1', cost: null }]) // resolveLineCosts
    db.inventoryEntitlement.findUnique.mockResolvedValue(null) // ไม่ ACTIVE → ข้าม stock-deduct
    db.order.create.mockResolvedValue({
      id: 'order-1',
      publicToken: 'tok12345',
      createdAt: new Date('2026-08-10T03:00:00.000Z'),
      items: [],
    })
    db.order.update.mockResolvedValue({})
    db.orderEvent.create.mockResolvedValue({})
    db.externalContact.updateMany.mockResolvedValue({ count: 1 })
    custMock.findOrCreateCustomer.mockResolvedValue('cust-9')
  })

  it('มี conversationId แต่ "ไม่มีเบอร์ลูกค้า" (customerId=null) → shopChannelId ยังถูกเขียน', async () => {
    // เทรดผูก shopChannel ไว้แล้ว (LINE OA ใบนี้) — ยืนยันด้วย call แรกไปที่ conversation.findFirst
    db.conversation.findFirst.mockResolvedValueOnce({ shopChannelId: 'chan-line-1' })

    await createOrder('shop-1', {
      type: 'DIGITAL',
      items: DIGITAL_ITEM,
      conversationId: 'conv-1',
      // ไม่ส่ง buyerContact → custPhone=null → findOrCreateCustomer ไม่ถูกเรียกเลย
    })

    expect(custMock.findOrCreateCustomer).not.toHaveBeenCalled()
    // conversation.findFirst ถูกเรียกครั้งเดียว (เพื่อ resolve shopChannelId) — ไม่ใช่ 0 ครั้ง
    // ซึ่งจะเกิดถ้าโค้ดเอาไปห้อยใต้เงื่อนไข customerId ผิด ๆ
    expect(db.conversation.findFirst).toHaveBeenCalledTimes(1)
    const createArgs = db.order.create.mock.calls[0]![0]
    expect(createArgs.data.shopChannelId).toBe('chan-line-1')
    // customer-link block ต้องไม่ทำงาน (ไม่มีเบอร์ → customerId null)
    expect(db.externalContact.updateMany).not.toHaveBeenCalled()
  })

  it('มี conversationId และ "มีเบอร์ลูกค้า" → เขียนทั้ง shopChannelId และผูก customer เหมือนเดิม', async () => {
    // call แรก (นอก tx) resolve shopChannelId, call ที่สอง (ใน tx) resolve externalContactId
    db.conversation.findFirst
      .mockResolvedValueOnce({ shopChannelId: 'chan-fb-1' })
      .mockResolvedValueOnce({ externalContactId: 'ext-1' })

    await createOrder('shop-1', {
      type: 'DIGITAL',
      items: DIGITAL_ITEM,
      conversationId: 'conv-2',
      buyerContact: '0812345678',
    })

    expect(custMock.findOrCreateCustomer).toHaveBeenCalledWith(db, '0812345678')
    expect(db.conversation.findFirst).toHaveBeenCalledTimes(2)
    const createArgs = db.order.create.mock.calls[0]![0]
    expect(createArgs.data.shopChannelId).toBe('chan-fb-1')
    expect(db.externalContact.updateMany).toHaveBeenCalledWith({
      where: { id: 'ext-1', customerId: null },
      data: { customerId: 'cust-9' },
    })
  })

  it('conversationId ของร้านอื่น → ไม่เขียน shopChannelId (ownership scope ด้วย shopId ใน WHERE)', async () => {
    // ownership scope อยู่ที่ WHERE ไม่ใช่การกรองผลลัพธ์ทีหลัง — จำลอง "ไม่เจอแถว" เพราะ shopId
    // ไม่ตรง (findFirst ที่มี shopId ใน WHERE คืน null จริงเมื่อแถวเป็นของร้านอื่น)
    db.conversation.findFirst.mockResolvedValueOnce(null)

    await createOrder('shop-1', {
      type: 'DIGITAL',
      items: DIGITAL_ITEM,
      conversationId: 'conv-of-another-shop',
    })

    // พิสูจน์ว่า query ที่ยิงไปสโคปด้วย shopId ของร้านตัวเอง (กันผูกช่องทางของร้านอื่น)
    expect(db.conversation.findFirst).toHaveBeenCalledWith({
      where: { id: 'conv-of-another-shop', shopId: 'shop-1' },
      select: { shopChannelId: true },
    })
    const createArgs = db.order.create.mock.calls[0]![0]
    expect(createArgs.data.shopChannelId).toBeUndefined()
  })

  it('ไม่มี conversationId (POS/หน้าร้าน) → shopChannelId เป็น undefined ไม่ throw ไม่ query conversation เลย', async () => {
    await expect(
      createOrder('shop-1', {
        type: 'DIGITAL',
        items: DIGITAL_ITEM,
      }),
    ).resolves.toBeDefined()

    expect(db.conversation.findFirst).not.toHaveBeenCalled()
    const createArgs = db.order.create.mock.calls[0]![0]
    expect(createArgs.data.shopChannelId).toBeUndefined()
  })
})
