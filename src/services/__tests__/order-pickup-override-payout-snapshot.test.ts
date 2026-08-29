/**
 * createOrder/updateOrder — override fulfillmentMode='PICKUP' + payoutSnapshot (feature 00062, U11)
 *
 * mocked-prisma unit test (pattern เดียวกับ order-service-shop-channel.test.ts) — ไม่แตะ DB จริง
 * (HR13/HR14: เวิร์กทรีนี้ไม่มีฐาน local รันอยู่)
 *
 * ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ — ประกาศ db
 * ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError)
 *
 * scenario เลือก type='PHYSICAL' + item พิมพ์เอง (ไม่มี productId) โดยตั้งใจ: เส้นทางนี้ปกติ
 * คำนวณเป็น fulfillmentMode='SHIPPED' เมื่อ shop.vertical='ONLINE_SALES' (shipsGoods=true) —
 * เป็น input เดียวที่พิสูจน์ได้จริงว่า override "ทับ" ผลคำนวณเดิม (BRD FR-PKP-01 AC #3) ไม่ใช่
 * แค่บังเอิญตรงกับ path อื่นที่ให้ PICKUP อยู่แล้ว
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  shop: { findUnique: vi.fn() },
  product: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  conversation: { findFirst: vi.fn() },
  inventoryEntitlement: { findUnique: vi.fn() },
  order: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  orderItem: { deleteMany: vi.fn() },
  orderEvent: { create: vi.fn() },
  stockMovement: { create: vi.fn() },
  externalContact: { update: vi.fn(), count: vi.fn() },
  customer: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const custMock = vi.hoisted(() => ({ findOrCreateCustomer: vi.fn() }))
vi.mock('@/services/customer.service', () => custMock)

import { createOrder, updateOrder, PickupNotAllowedError } from '@/services/order.service'

const PHYSICAL_MANUAL_ITEM = [{ name: 'ตุ๊กตาแมว', qty: 1, price: 200 }]

// ร้าน ONLINE_SALES ที่ตั้งบัญชีรับเงินไว้ครบ — buildPayoutSnapshot คืนก้อนนี้เป๊ะ
const SHOP_ONLINE_WITH_PAYOUT = {
  vertical: 'ONLINE_SALES',
  payoutBankCode: 'SCB',
  payoutAccountNo: '1234567890',
  payoutAccountName: 'ร้านทดสอบ',
  payoutPromptPayId: '0812345678',
}
const SHOP_ONLINE_NO_PAYOUT = {
  vertical: 'ONLINE_SALES',
  payoutBankCode: null,
  payoutAccountNo: null,
  payoutAccountName: null,
  payoutPromptPayId: null,
}
const SHOP_SERVICE_QUEUE = {
  vertical: 'SERVICE_QUEUE',
  payoutBankCode: null,
  payoutAccountNo: null,
  payoutAccountName: null,
  payoutPromptPayId: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  db.$transaction.mockImplementation(async (cb: any) => cb(db))
  db.product.findFirst.mockResolvedValue(null) // Quick-Create: ไม่มีสินค้าชื่อซ้ำ
  db.product.create.mockResolvedValue({ id: 'prod-auto-1' })
  db.product.findMany.mockResolvedValue([{ id: 'prod-auto-1', cost: null }]) // resolveLineCosts
  db.inventoryEntitlement.findUnique.mockResolvedValue(null) // ไม่ ACTIVE → ข้าม stock-deduct
  db.order.create.mockResolvedValue({
    id: 'order-1',
    publicToken: 'tok12345',
    createdAt: new Date('2026-08-28T03:00:00.000Z'),
    items: [],
  })
  db.order.update.mockResolvedValue({})
  db.orderEvent.create.mockResolvedValue({})
  db.orderItem.deleteMany.mockResolvedValue({ count: 0 })
  db.user.findUnique.mockResolvedValue(null)
})

describe('createOrder — override fulfillmentMode=PICKUP (TFR-001/TD-001)', () => {
  it('type=PHYSICAL + item พิมพ์เอง (ปกติคำนวณเป็น SHIPPED) + fulfillmentMode:"PICKUP" → เป็น PICKUP ไม่ใช่ SHIPPED, ไม่บังคับที่อยู่', async () => {
    db.shop.findUnique.mockResolvedValue(SHOP_ONLINE_NO_PAYOUT)

    const order = await createOrder('shop-1', {
      type: 'PHYSICAL',
      items: PHYSICAL_MANUAL_ITEM,
      fulfillmentMode: 'PICKUP',
      // ไม่ส่ง shippingAddress เลย — ต้องไม่ throw ShippingAddressRequiredError
    })

    expect(order).toBeDefined()
    const createArgs = db.order.create.mock.calls[0]![0]
    expect(createArgs.data.fulfillmentMode).toBe('PICKUP')
  })

  it('ไม่ส่ง fulfillmentMode มา (พฤติกรรมเดิม) — item พิมพ์เอง PHYSICAL ยังคำนวณเป็น SHIPPED ตามเดิม', async () => {
    db.shop.findUnique.mockResolvedValue(SHOP_ONLINE_NO_PAYOUT)

    await createOrder('shop-1', {
      type: 'PHYSICAL',
      items: PHYSICAL_MANUAL_ITEM,
      shippingAddress: { line1: 'บ้านเลขที่ 1', province: 'กรุงเทพ', postcode: '10110' },
    })

    const createArgs = db.order.create.mock.calls[0]![0]
    expect(createArgs.data.fulfillmentMode).toBe('SHIPPED')
  })

  it('ร้านไม่ใช่ ONLINE_SALES ส่ง fulfillmentMode:"PICKUP" มา → PickupNotAllowedError, ไม่เขียนอะไรเลย', async () => {
    db.shop.findUnique.mockResolvedValue(SHOP_SERVICE_QUEUE)

    await expect(
      createOrder('shop-1', {
        type: 'PHYSICAL',
        items: PHYSICAL_MANUAL_ITEM,
        fulfillmentMode: 'PICKUP',
      }),
    ).rejects.toBeInstanceOf(PickupNotAllowedError)

    expect(db.order.create).not.toHaveBeenCalled()
  })
})

describe('createOrder — payoutSnapshot (TFR-009)', () => {
  it('paymentMethod=TRANSFER + ร้านตั้งบัญชีไว้แล้ว → เขียน payoutSnapshot ตรงกับ buildPayoutSnapshot(shop)', async () => {
    db.shop.findUnique.mockResolvedValue(SHOP_ONLINE_WITH_PAYOUT)

    await createOrder('shop-1', {
      type: 'PHYSICAL',
      items: PHYSICAL_MANUAL_ITEM,
      paymentMethod: 'TRANSFER',
      fulfillmentMode: 'PICKUP', // กันไม่ต้องกรอกที่อยู่ ตัดตัวแปรที่ไม่เกี่ยวข้องออก
    })

    const createArgs = db.order.create.mock.calls[0]![0]
    expect(createArgs.data.payoutSnapshot).toEqual({
      bankCode: 'SCB',
      accountNo: '1234567890',
      accountName: 'ร้านทดสอบ',
      promptPayId: '0812345678',
    })
  })

  it('paymentMethod=PROMPTPAY เหมือนกัน — TRANSFER ไม่ใช่ค่าเดียวที่ถือว่า "ต้องมีบัญชี"', async () => {
    db.shop.findUnique.mockResolvedValue(SHOP_ONLINE_WITH_PAYOUT)

    await createOrder('shop-1', {
      type: 'PHYSICAL',
      items: PHYSICAL_MANUAL_ITEM,
      paymentMethod: 'PROMPTPAY',
      fulfillmentMode: 'PICKUP',
    })

    const createArgs = db.order.create.mock.calls[0]![0]
    expect(createArgs.data.payoutSnapshot).toEqual(
      expect.objectContaining({ promptPayId: '0812345678' }),
    )
  })

  it('paymentMethod=COD → payoutSnapshot ไม่ถูกเขียนเลย (undefined = column เป็น NULL)', async () => {
    db.shop.findUnique.mockResolvedValue(SHOP_ONLINE_WITH_PAYOUT)

    await createOrder('shop-1', {
      type: 'PHYSICAL',
      items: PHYSICAL_MANUAL_ITEM,
      paymentMethod: 'COD',
      fulfillmentMode: 'PICKUP',
    })

    const createArgs = db.order.create.mock.calls[0]![0]
    expect(createArgs.data.payoutSnapshot).toBeUndefined()
  })

  it('paymentMethod=TRANSFER แต่ร้านยังไม่ตั้งบัญชีเลย → payoutSnapshot undefined ไม่ throw (SRS TFR-009 edge case)', async () => {
    db.shop.findUnique.mockResolvedValue(SHOP_ONLINE_NO_PAYOUT)

    await expect(
      createOrder('shop-1', {
        type: 'PHYSICAL',
        items: PHYSICAL_MANUAL_ITEM,
        paymentMethod: 'TRANSFER',
        fulfillmentMode: 'PICKUP',
      }),
    ).resolves.toBeDefined()

    const createArgs = db.order.create.mock.calls[0]![0]
    expect(createArgs.data.payoutSnapshot).toBeUndefined()
  })
})

// ─── updateOrder ─────────────────────────────────────────────────────────

const EXISTING_BASE = {
  id: 'order-9',
  status: 'PENDING',
  type: 'PHYSICAL',
  totalAmount: 200,
  buyerContact: null,
  customerId: null,
  buyerName: null,
  paymentMethod: null,
  salesChannel: null,
  internalNote: null,
  discount: null,
  vatRate: null,
  vatAmount: null,
  shippingAddress: null,
  createdAt: new Date('2026-08-20T03:00:00.000Z'),
  publicToken: 'tok-existing',
  fulfillmentMode: 'PICKUP',
  handedOverAt: null,
  payoutSnapshot: null,
  items: [{ productId: null, name: 'ตุ๊กตาแมว', qty: 1, price: 200, description: null }],
}

describe('updateOrder — override fulfillmentMode=PICKUP (TFR-001/TD-001, ต้องแก้คู่กับ createOrder)', () => {
  it('type=PHYSICAL + item พิมพ์เอง (ปกติคำนวณเป็น SHIPPED) + fulfillmentMode:"PICKUP" → เป็น PICKUP ไม่บังคับที่อยู่', async () => {
    db.shop.findUnique.mockResolvedValue(SHOP_ONLINE_NO_PAYOUT)
    db.order.findFirst.mockResolvedValue({ ...EXISTING_BASE, fulfillmentMode: 'SHIPPED' })
    db.order.update.mockResolvedValue({ id: 'order-9', items: [] })

    await updateOrder('shop-1', 'tok-existing', {
      type: 'PHYSICAL',
      items: PHYSICAL_MANUAL_ITEM,
      fulfillmentMode: 'PICKUP',
    })

    const updateArgs = db.order.update.mock.calls[0]![0]
    expect(updateArgs.data.fulfillmentMode).toBe('PICKUP')
  })

  it('ร้านไม่ใช่ ONLINE_SALES ส่ง fulfillmentMode:"PICKUP" มา → PickupNotAllowedError, ไม่แตะ tx เลย', async () => {
    db.shop.findUnique.mockResolvedValue(SHOP_SERVICE_QUEUE)

    await expect(
      updateOrder('shop-1', 'tok-existing', {
        type: 'PHYSICAL',
        items: PHYSICAL_MANUAL_ITEM,
        fulfillmentMode: 'PICKUP',
      }),
    ).rejects.toBeInstanceOf(PickupNotAllowedError)

    expect(db.order.findFirst).not.toHaveBeenCalled()
    expect(db.order.update).not.toHaveBeenCalled()
  })
})

describe('updateOrder — payoutSnapshot ไม่เขียนทับของเดิม (TFR-009 + task instruction U11)', () => {
  it('ใบเดิมยังไม่มี payoutSnapshot + เปลี่ยนเป็น TRANSFER ระหว่างแก้ → เขียนครั้งแรก', async () => {
    db.shop.findUnique.mockResolvedValue(SHOP_ONLINE_WITH_PAYOUT)
    db.order.findFirst.mockResolvedValue({ ...EXISTING_BASE, payoutSnapshot: null })
    db.order.update.mockResolvedValue({ id: 'order-9', items: [] })

    await updateOrder('shop-1', 'tok-existing', {
      type: 'PHYSICAL',
      items: PHYSICAL_MANUAL_ITEM,
      paymentMethod: 'TRANSFER',
      fulfillmentMode: 'PICKUP',
    })

    const updateArgs = db.order.update.mock.calls[0]![0]
    expect(updateArgs.data.payoutSnapshot).toEqual({
      bankCode: 'SCB',
      accountNo: '1234567890',
      accountName: 'ร้านทดสอบ',
      promptPayId: '0812345678',
    })
  })

  it('ใบเดิมมี payoutSnapshot อยู่แล้ว — ไม่เขียนทับ แม้ shop.payout* เปลี่ยนไปแล้ว (ตกลงบัญชีไหนไว้กับลูกค้าก็ต้องเป็นบัญชีนั้น)', async () => {
    // shop เปลี่ยนไปตั้งบัญชีใหม่แล้ว (ต่างจาก snapshot เดิมของออเดอร์นี้)
    db.shop.findUnique.mockResolvedValue({
      vertical: 'ONLINE_SALES',
      payoutBankCode: 'KBANK',
      payoutAccountNo: '9999999999',
      payoutAccountName: 'บัญชีใหม่',
      payoutPromptPayId: null,
    })
    const oldSnapshot = { bankCode: 'SCB', accountNo: '1234567890', accountName: 'ร้านทดสอบ' }
    db.order.findFirst.mockResolvedValue({ ...EXISTING_BASE, paymentMethod: 'TRANSFER', payoutSnapshot: oldSnapshot })
    db.order.update.mockResolvedValue({ id: 'order-9', items: [] })

    await updateOrder('shop-1', 'tok-existing', {
      type: 'PHYSICAL',
      items: PHYSICAL_MANUAL_ITEM,
      paymentMethod: 'TRANSFER', // ยังเป็น TRANSFER เหมือนเดิม
      fulfillmentMode: 'PICKUP',
    })

    const updateArgs = db.order.update.mock.calls[0]![0]
    expect(updateArgs.data.payoutSnapshot).toBeUndefined()
  })

  it('paymentMethod=COD (ไม่ใช่ TRANSFER/PROMPTPAY) → payoutSnapshot ยังไม่ถูกเขียนแม้ใบเดิมว่าง', async () => {
    db.shop.findUnique.mockResolvedValue(SHOP_ONLINE_WITH_PAYOUT)
    db.order.findFirst.mockResolvedValue({ ...EXISTING_BASE, payoutSnapshot: null })
    db.order.update.mockResolvedValue({ id: 'order-9', items: [] })

    await updateOrder('shop-1', 'tok-existing', {
      type: 'PHYSICAL',
      items: PHYSICAL_MANUAL_ITEM,
      paymentMethod: 'COD',
      fulfillmentMode: 'PICKUP',
    })

    const updateArgs = db.order.update.mock.calls[0]![0]
    expect(updateArgs.data.payoutSnapshot).toBeUndefined()
  })
})

describe('updateOrder — ล้าง handedOverAt เมื่อเปลี่ยน fulfillmentMode ออกจาก PICKUP (SRS TFR-001 edge case, DATABASE.md §5.1)', () => {
  it('เดิม PICKUP + handedOverAt ไม่ว่าง → เปลี่ยนไป SHIPPED (ไม่ส่ง fulfillmentMode มา, auto-compute) → ล้าง handedOverAt/handedOverByUserId เป็น NULL + บันทึก HANDOVER_REVERTED', async () => {
    db.shop.findUnique.mockResolvedValue(SHOP_ONLINE_NO_PAYOUT)
    db.order.findFirst.mockResolvedValue({
      ...EXISTING_BASE,
      fulfillmentMode: 'PICKUP',
      handedOverAt: new Date('2026-08-27T10:00:00.000Z'),
    })
    db.order.update.mockResolvedValue({ id: 'order-9', items: [] })

    await updateOrder(
      'shop-1',
      'tok-existing',
      {
        type: 'PHYSICAL',
        items: PHYSICAL_MANUAL_ITEM, // ไม่ส่ง fulfillmentMode → auto-compute = SHIPPED (ONLINE_SALES + PHYSICAL manual item)
        shippingAddress: { line1: 'บ้านเลขที่ 1', province: 'กรุงเทพ', postcode: '10110' },
      },
      'user-actor-1',
    )

    const updateArgs = db.order.update.mock.calls[0]![0]
    expect(updateArgs.data.fulfillmentMode).toBe('SHIPPED')
    expect(updateArgs.data.handedOverAt).toBeNull()
    expect(updateArgs.data.handedOverByUserId).toBeNull()

    const handoverEvent = db.orderEvent.create.mock.calls.find(
      (call: any) => call[0].data.type === 'HANDOVER_REVERTED',
    )
    expect(handoverEvent).toBeDefined()
    expect(handoverEvent![0].data.orderId).toBe('order-9')
    expect(handoverEvent![0].data.meta).toMatchObject({ reason: 'FULFILLMENT_MODE_CHANGED' })
  })

  it('ยังเป็น PICKUP เหมือนเดิม (ส่ง fulfillmentMode:"PICKUP" ซ้ำ) แม้มี handedOverAt → ไม่แตะ handedOverAt เลย ไม่บันทึก HANDOVER_REVERTED', async () => {
    db.shop.findUnique.mockResolvedValue(SHOP_ONLINE_NO_PAYOUT)
    db.order.findFirst.mockResolvedValue({
      ...EXISTING_BASE,
      fulfillmentMode: 'PICKUP',
      handedOverAt: new Date('2026-08-27T10:00:00.000Z'),
    })
    db.order.update.mockResolvedValue({ id: 'order-9', items: [] })

    await updateOrder('shop-1', 'tok-existing', {
      type: 'PHYSICAL',
      items: PHYSICAL_MANUAL_ITEM,
      fulfillmentMode: 'PICKUP',
    })

    const updateArgs = db.order.update.mock.calls[0]![0]
    expect(updateArgs.data.handedOverAt).toBeUndefined()
    expect(updateArgs.data.handedOverByUserId).toBeUndefined()
    expect(
      db.orderEvent.create.mock.calls.some((call: any) => call[0].data.type === 'HANDOVER_REVERTED'),
    ).toBe(false)
  })

  it('เดิมไม่เคยกด "มอบสินค้าแล้ว" (handedOverAt=null) แล้วเปลี่ยนออกจาก PICKUP → ไม่มีอะไรให้ล้าง ไม่บันทึก HANDOVER_REVERTED', async () => {
    db.shop.findUnique.mockResolvedValue(SHOP_ONLINE_NO_PAYOUT)
    db.order.findFirst.mockResolvedValue({ ...EXISTING_BASE, fulfillmentMode: 'PICKUP', handedOverAt: null })
    db.order.update.mockResolvedValue({ id: 'order-9', items: [] })

    await updateOrder('shop-1', 'tok-existing', {
      type: 'PHYSICAL',
      items: PHYSICAL_MANUAL_ITEM,
      shippingAddress: { line1: 'บ้านเลขที่ 1', province: 'กรุงเทพ', postcode: '10110' },
    })

    const updateArgs = db.order.update.mock.calls[0]![0]
    expect(updateArgs.data.handedOverAt).toBeUndefined()
    expect(
      db.orderEvent.create.mock.calls.some((call: any) => call[0].data.type === 'HANDOVER_REVERTED'),
    ).toBe(false)
  })
})
