/**
 * createOrder / updateOrder — บทบาท "เปิดบิล" (BILLING) สร้าง/แก้ได้เฉพาะบิลบริการ (00071 P3 · C-6 / O3 เงื่อนไขต่อใบ)
 *
 * mocked-prisma (pattern เดียวกับ order-pickup-override-payout-snapshot.test.ts) — ไม่แตะ DB จริง (HR13)
 * ทุกเคสที่ "ต้องถูกปฏิเสธ" assert ด้วยว่าไม่มีการเขียน (order.create/update ไม่ถูกเรียก) —
 * ปฏิเสธแต่เขียนไปแล้วคือช่องโหว่ที่เงียบที่สุด
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  shop: { findUnique: vi.fn() },
  product: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  conversation: { findFirst: vi.fn() },
  inventoryEntitlement: { findUnique: vi.fn() },
  order: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), count: vi.fn() },
  orderItem: { deleteMany: vi.fn() },
  orderEvent: { create: vi.fn() },
  stockMovement: { create: vi.fn() },
  externalContact: { update: vi.fn(), count: vi.fn() },
  customer: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/services/customer.service', () => ({ findOrCreateCustomer: vi.fn() }))

import {
  createOrder, updateOrder, OrderLockedForRoleError, OrderRoleRestrictedError,
} from '@/services/order.service'
import { ForbiddenRoleError } from '@/lib/shop-capability'

const SHOP_SERVICE = { vertical: 'SERVICE_QUEUE', payoutBankCode: null, payoutAccountNo: null, payoutAccountName: null, payoutPromptPayId: null }
const TYPED = [{ name: 'ตัดผม', qty: 1, price: 300 }]

beforeEach(() => {
  vi.clearAllMocks()
  db.$transaction.mockImplementation(async (cb: any) => cb(db))
  db.shop.findUnique.mockResolvedValue(SHOP_SERVICE)
  db.product.findFirst.mockResolvedValue(null)
  db.product.create.mockResolvedValue({ id: 'prod-auto-1' })
  db.product.findMany.mockResolvedValue([])
  db.inventoryEntitlement.findUnique.mockResolvedValue(null)
  db.order.create.mockResolvedValue({ id: 'order-1', publicToken: 'tok12345', createdAt: new Date('2026-10-10T03:00:00Z'), items: [] })
  db.order.update.mockResolvedValue({ id: 'order-9', items: [] })
  db.orderEvent.create.mockResolvedValue({})
  db.orderItem.deleteMany.mockResolvedValue({ count: 0 })
  db.user.findUnique.mockResolvedValue(null)
})

describe('createOrder({ billingOnly: true })', () => {
  it('บังคับ type=SERVICE แม้ caller ส่ง PHYSICAL มา (รายการพิมพ์เอง)', async () => {
    await createOrder('shop-1', { type: 'PHYSICAL', items: TYPED }, { billingOnly: true })
    expect(db.order.create.mock.calls[0]![0].data.type).toBe('SERVICE')
  })

  it('บรรทัดที่อ้างสินค้าไม่ใช่ SERVICE → OrderRoleRestrictedError (⊂ ForbiddenRoleError) และไม่เขียนอะไร', async () => {
    db.product.findMany.mockResolvedValue([{ type: 'PHYSICAL' }])
    const p = createOrder('shop-1', { type: 'SERVICE', items: [{ productId: 'p-phys', name: 'x', qty: 1, price: 10 }] }, { billingOnly: true })
    await expect(p).rejects.toBeInstanceOf(OrderRoleRestrictedError)
    await expect(p).rejects.toBeInstanceOf(ForbiddenRoleError)
    expect(db.order.create).not.toHaveBeenCalled()
  })

  it('สินค้า DIGITAL ก็ไม่ใช่บริการ → ปฏิเสธ (ตรวจ "เป็น SERVICE" ไม่ใช่ "ไม่ใช่ PHYSICAL")', async () => {
    db.product.findMany.mockResolvedValue([{ type: 'DIGITAL' }])
    await expect(
      createOrder('shop-1', { type: 'SERVICE', items: [{ productId: 'p-dig', name: 'x', qty: 1, price: 10 }] }, { billingOnly: true }),
    ).rejects.toBeInstanceOf(OrderRoleRestrictedError)
  })

  it('ตรวจประเภทสินค้าเทียบกับร้านนี้เท่านั้น (where shopId) — ไม่เปิดช่องให้ id ต่างร้านผ่านด่านนี้', async () => {
    db.product.findMany.mockResolvedValue([])
    await createOrder('shop-1', { type: 'SERVICE', items: TYPED }, { billingOnly: true }).catch(() => undefined)
    // ไม่มี productId ⇒ ไม่ query; มี productId ⇒ ต้อง scope shopId
    db.product.findMany.mockClear()
    db.product.findMany.mockResolvedValue([{ type: 'SERVICE' }])
    await createOrder('shop-1', { type: 'SERVICE', items: [{ productId: 'p-svc', name: 'x', qty: 1, price: 10 }] }, { billingOnly: true }).catch(() => undefined)
    expect(db.product.findMany.mock.calls[0]![0].where).toMatchObject({ shopId: 'shop-1' })
  })

  it('บรรทัดอ้างสินค้า SERVICE ของร้านนี้ → สร้างได้ type=SERVICE', async () => {
    db.product.findMany.mockResolvedValue([{ type: 'SERVICE', id: 'p-svc', cost: null }])
    await createOrder('shop-1', { type: 'PHYSICAL', items: [{ productId: 'p-svc', name: 'ตัดผม', qty: 1, price: 300 }] }, { billingOnly: true })
    expect(db.order.create.mock.calls[0]![0].data.type).toBe('SERVICE')
  })

  it('ไม่ส่ง opts (ทางภายใน: auto-order/iship) = ไม่จำกัด — type เดิมไม่ถูกบังคับ', async () => {
    db.shop.findUnique.mockResolvedValue({ ...SHOP_SERVICE, vertical: 'ONLINE_SALES' })
    await createOrder('shop-1', { type: 'PHYSICAL', items: TYPED, fulfillmentMode: 'PICKUP' })
    expect(db.order.create.mock.calls[0]![0].data.type).toBe('PHYSICAL')
  })
})

describe('updateOrder({ billingOnly: true }) — O3 เงื่อนไขต่อใบ', () => {
  const EXISTING = {
    id: 'order-9', status: 'PENDING', type: 'SERVICE', totalAmount: 300, buyerContact: null, customerId: null, buyerName: null,
    paymentMethod: null, salesChannel: null, internalNote: null, discount: null, vatRate: null, vatAmount: null, shippingAddress: null,
    createdAt: new Date('2026-10-01T03:00:00Z'), publicToken: 'tok-e', fulfillmentMode: 'NO_SHIPPING', handedOverAt: null, payoutSnapshot: null,
    conversationId: null, items: [{ productId: null, name: 'ตัดผม', qty: 1, price: 300, description: null }],
  }
  const payState = (p: object) => db.order.findUniqueOrThrow.mockResolvedValue({
    type: 'SERVICE', totalAmount: 300, paymentConfirmedAt: null, codReceivedAt: null, payments: [], ...p,
  })
  const edit = () => updateOrder('shop-1', 'tok-e', { type: 'SERVICE', items: TYPED }, 'u1', { billingOnly: true })

  beforeEach(() => { db.order.findFirst.mockResolvedValue(EXISTING) })

  it('บิลบริการที่ยังไม่ชำระ → แก้ได้', async () => {
    payState({})
    await expect(edit()).resolves.toBeDefined()
    expect(db.order.update).toHaveBeenCalled()
  })

  it('บิลที่มีเงินรับแล้ว (OrderPayment) → OrderLockedForRoleError และไม่เขียน', async () => {
    payState({ payments: [{ kind: 'DEPOSIT', amount: 100, voidedAt: null }] })
    const p = edit()
    await expect(p).rejects.toBeInstanceOf(OrderLockedForRoleError)
    await expect(p).rejects.toBeInstanceOf(ForbiddenRoleError)
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.orderItem.deleteMany).not.toHaveBeenCalled()
  })

  it('บิลที่ร้านยืนยันรับเงินแล้ว (paymentConfirmedAt) → ล็อก', async () => {
    payState({ paymentConfirmedAt: new Date() })
    await expect(edit()).rejects.toBeInstanceOf(OrderLockedForRoleError)
  })

  it('บิลที่ไม่ใช่ SERVICE → ล็อก (แม้ยังไม่ชำระ)', async () => {
    payState({ type: 'PHYSICAL' })
    await expect(edit()).rejects.toBeInstanceOf(OrderLockedForRoleError)
    expect(db.order.update).not.toHaveBeenCalled()
  })

  it('ไม่ส่ง billingOnly (บทบาทอื่นที่มี O3) → แก้ใบที่รับเงินแล้วได้ ไม่ query สถานะชำระ', async () => {
    await updateOrder('shop-1', 'tok-e', { type: 'SERVICE', items: TYPED }, 'u1', {})
    expect(db.order.findUniqueOrThrow).not.toHaveBeenCalled()
    expect(db.order.update).toHaveBeenCalled()
  })
})
