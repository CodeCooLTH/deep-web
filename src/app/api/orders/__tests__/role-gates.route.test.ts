/**
 * ด่านบทบาทของ route ออเดอร์/บิล/นัดหมาย (00071 P3 · S-14) — ไล่ด้วยบทบาทจริงผ่าน requireShopCapability/canAccessShopWith ตัวจริง
 *
 * 🛑 ไม่ mock `@/lib/shop-capability` / `shop-context` / `shop-permissions` — mock แค่ prisma (ห้ามต่อ DB จริง · HR13) และ service ที่ไม่เกี่ยวกับด่าน
 * mock ด่านทิ้งแล้วเขียวตลอดไม่ว่ากฎจะเป็นอะไร (บทเรียน 00038) · createOrder/updateOrder ใช้ของจริง เพื่อให้กฎ "บังคับ type=SERVICE" และ
 * "ปฏิเสธสินค้าไม่ใช่บริการ" ถูกเดินจริง (ไม่ใช่แค่เห็นว่า route ส่ง flag ไป)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

const db = vi.hoisted(() => ({
  shop: { findUnique: vi.fn() },
  shopMember: { findUnique: vi.fn() },
  product: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  conversation: { findFirst: vi.fn() },
  inventoryEntitlement: { findUnique: vi.fn() },
  order: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), count: vi.fn() },
  orderItem: { deleteMany: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
  orderEvent: { create: vi.fn() },
  stockMovement: { create: vi.fn() },
  externalContact: { update: vi.fn(), count: vi.fn() },
  customer: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/services/customer.service', () => ({ findOrCreateCustomer: vi.fn() }))

const svc = vi.hoisted(() => ({
  recordPayment: vi.fn(),
  voidPayment: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  setAppointmentOutcome: vi.fn(),
  setOrRescheduleAppointment: vi.fn(),
  shipOrder: vi.fn(),
  retryAutoOrderDraft: vi.fn(),
  createBooking: vi.fn(),
  importParcelAsOrder: vi.fn(),
}))
vi.mock('@/services/order-payment.service', async (orig) => ({ ...(await orig<object>()), recordPayment: svc.recordPayment, voidPayment: svc.voidPayment }))
vi.mock('@/services/product.service', async (orig) => ({ ...(await orig<object>()), updateProduct: svc.updateProduct, deleteProduct: svc.deleteProduct, serializeProduct: (p: unknown) => p }))
vi.mock('@/services/appointment.service', async (orig) => ({
  ...(await orig<object>()), setAppointmentOutcome: svc.setAppointmentOutcome, setOrRescheduleAppointment: svc.setOrRescheduleAppointment,
}))
vi.mock('@/services/order.service', async (orig) => ({ ...(await orig<object>()), shipOrder: svc.shipOrder }))
vi.mock('@/services/auto-order-validate.service', async (orig) => ({ ...(await orig<object>()), retryAutoOrderDraft: svc.retryAutoOrderDraft }))
vi.mock('@/services/booking.service', async (orig) => ({ ...(await orig<object>()), createBooking: svc.createBooking }))
vi.mock('@/services/iship.service', async (orig) => ({ ...(await orig<object>()), importParcelAsOrder: svc.importParcelAsOrder }))

import { getServerSession } from 'next-auth'
import { POST as createOrderRoute } from '../route'
import { PATCH as patchOrderRoute } from '../[token]/route'
import { POST as paymentsPost } from '../[token]/payments/route'
import { POST as outcomePost } from '../[token]/appointment/outcome/route'
import { PATCH as reschedulePatch } from '../[token]/appointment/route'
import { DELETE as voidDelete } from '../[token]/payments/[paymentId]/route'
import { PATCH as productPatch, DELETE as productDelete } from '@/app/api/products/[id]/route'
import { POST as shipPost } from '../[token]/ship/route'
import { POST as autoOrderRetryPost } from '../[token]/auto-order/retry/route'
import { POST as bookingsPost } from '@/app/api/shops/current/bookings/route'
import { POST as ishipImportPost } from '@/app/api/seller/iship/unlinked/import/route'

const SHOP = '11111111-1111-4111-8111-111111111111'
const PRODUCT = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'tok-1'
const params = { params: Promise.resolve({ token: TOKEN }) }

/** ผู้ใช้เป็นสมาชิก ADMIN ของร้านที่มี `roles` ตามนี้ (ร้าน BUSINESS ประเภท `vertical`) */
function asRole(roles: string[], vertical = 'SERVICE_QUEUE') {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', activeShopId: SHOP } } as never)
  const shopRow = {
    id: SHOP, userId: 'owner-x', kind: 'BUSINESS', vertical, deletedAt: null, packageLockedAt: null, packageLockReason: null,
    payoutBankCode: null, payoutAccountNo: null, payoutAccountName: null, payoutPromptPayId: null,
    members: [{ role: 'ADMIN', roles }],
  }
  db.shop.findUnique.mockResolvedValue(shopRow)
  db.shopMember.findUnique.mockResolvedValue({ role: 'ADMIN', roles })
}

const json = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://seller.deepth.local${url}`, { method, body: JSON.stringify(body) })

const TYPED = [{ name: 'ตัดผม', qty: 1, price: 300 }]
const createBody = (extra: object = {}) => ({ type: 'PHYSICAL', buyerContact: '0812345678', items: TYPED, ...extra })

beforeEach(() => {
  vi.clearAllMocks()
  db.$transaction.mockImplementation(async (cb: any) => cb(db))
  db.product.findMany.mockResolvedValue([])
  db.product.findFirst.mockResolvedValue(null)
  db.product.create.mockResolvedValue({ id: 'prod-auto-1' })
  db.inventoryEntitlement.findUnique.mockResolvedValue(null)
  db.conversation.findFirst.mockResolvedValue(null)
  db.order.create.mockResolvedValue({ id: 'order-1', publicToken: 'tok12345', createdAt: new Date('2026-10-10T03:00:00Z'), items: [] })
  db.order.update.mockResolvedValue({ id: 'order-9', items: [] })
  db.orderEvent.create.mockResolvedValue({})
  db.orderItem.deleteMany.mockResolvedValue({ count: 0 })
  db.orderItem.findMany.mockResolvedValue([])
  db.orderItem.createMany.mockResolvedValue({ count: 1 })
  db.user.findUnique.mockResolvedValue(null)
  db.customer.findUnique.mockResolvedValue(null)
  svc.recordPayment.mockResolvedValue({ ok: true })
  svc.setAppointmentOutcome.mockResolvedValue({ appointmentStatus: 'COMPLETED' })
})

describe('POST /api/orders — BILLING (มี O2s ไม่มี O2) สร้างได้เฉพาะบิลบริการ (C-6)', () => {
  beforeEach(() => asRole(['BILLING']))

  it('PHYSICAL + สินค้า PHYSICAL ของร้าน → 403 FORBIDDEN_ROLE และไม่สร้างบิล', async () => {
    db.product.findMany.mockResolvedValue([{ type: 'PHYSICAL' }])
    const res = await createOrderRoute(json('/api/orders', 'POST', createBody({ items: [{ productId: PRODUCT, name: 'x', qty: 1, price: 10 }] })))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
    expect(db.order.create).not.toHaveBeenCalled()
  })

  it('type=SERVICE แต่บรรทัดอ้างสินค้าที่ไม่ใช่ SERVICE → 403 (ไม่ใช่ตัวหลอกที่ type ของใบอย่างเดียว)', async () => {
    db.product.findMany.mockResolvedValue([{ type: 'PHYSICAL' }])
    const res = await createOrderRoute(json('/api/orders', 'POST', createBody({ type: 'SERVICE', items: [{ productId: PRODUCT, name: 'x', qty: 1, price: 10 }] })))
    expect(res.status).toBe(403)
    expect(db.order.create).not.toHaveBeenCalled()
  })

  it('รายการพิมพ์เอง (ไม่มี productId) → 201 และถูกบังคับเป็น SERVICE แม้ client ส่ง PHYSICAL มา', async () => {
    const res = await createOrderRoute(json('/api/orders', 'POST', createBody({ type: 'PHYSICAL' })))
    expect(res.status).toBe(201)
    expect(db.order.create.mock.calls[0]![0].data.type).toBe('SERVICE')
  })

  it('สินค้าประเภท SERVICE ของร้าน → 201', async () => {
    db.product.findMany.mockResolvedValue([{ type: 'SERVICE', id: PRODUCT, cost: null }])
    const res = await createOrderRoute(json('/api/orders', 'POST', createBody({ type: 'SERVICE', items: [{ productId: PRODUCT, name: 'ตัดผม', qty: 1, price: 300 }] })))
    expect(res.status).toBe(201)
  })
})

describe('POST /api/orders — บทบาทที่สร้างได้ทุกประเภทไม่ถูกจำกัด', () => {
  it('CHAT (มี O2) สร้างบิล PHYSICAL พิมพ์เอง → type ไม่ถูกบังคับ', async () => {
    asRole(['CHAT'], 'ONLINE_SALES')
    const res = await createOrderRoute(json('/api/orders', 'POST', createBody({ shippingAddress: { line1: 'x', province: 'กทม', postcode: '10110' } })))
    expect(res.status).toBe(201)
    expect(db.order.create.mock.calls[0]![0].data.type).toBe('PHYSICAL')
  })

  it('TECHNICIAN (ไม่มี O2s) → 403', async () => {
    asRole(['TECHNICIAN'])
    const res = await createOrderRoute(json('/api/orders', 'POST', createBody()))
    expect(res.status).toBe(403)
    expect(db.order.create).not.toHaveBeenCalled()
  })
})

describe('ทางสร้างบิลอื่น — BILLING ไม่มี O2/S1 → 403 ทั้ง 3 ทาง (bookings · auto-order retry · iShip import)', () => {
  it('POST /api/shops/current/bookings (O2) — ถูกปฏิเสธด้วย "บทบาท" ไม่ใช่ด้วยประเภทร้าน', async () => {
    // ร้านบ้านพัก: BILLING ถูกตัดทิ้ง (ใช้ได้เฉพาะร้านบริการ) ⇒ ชุดบทบาทว่าง ⇒ FORBIDDEN_ROLE
    // ต้อง assert รหัส error ด้วย — 403 เปล่า ๆ แยกไม่ออกจาก NOT_LODGING_SHOP (ด่านประเภทร้าน) ซึ่งทำให้เทสเขียวทั้งที่ด่านบทบาทพัง
    asRole(['BILLING'], 'LODGING')
    const res = await bookingsPost(json('/api/shops/current/bookings', 'POST', {}))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
    expect(svc.createBooking).not.toHaveBeenCalled()
  })

  it('POST /api/shops/current/bookings — TECHNICIAN (ไม่มี O2) → FORBIDDEN_ROLE', async () => {
    asRole(['TECHNICIAN'], 'LODGING')
    const res = await bookingsPost(json('/api/shops/current/bookings', 'POST', {}))
    expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
  })

  it('POST /api/orders/[token]/auto-order/retry (O2) — เป็นสมาชิกแต่ไม่มีสิทธิ์ = 403 ไม่ใช่ 404', async () => {
    asRole(['BILLING'])
    db.order.findUnique.mockResolvedValue({ shopId: SHOP, status: 'DRAFTED' })
    const res = await autoOrderRetryPost(json(`/api/orders/${TOKEN}/auto-order/retry`, 'POST', {}), params)
    expect(res.status).toBe(403)
    expect(svc.retryAutoOrderDraft).not.toHaveBeenCalled()
  })

  it('POST /api/seller/iship/unlinked/import (S1) — ADMIN ที่มีแค่ BILLING', async () => {
    asRole(['BILLING'], 'ONLINE_SALES')
    const res = await ishipImportPost(json('/api/seller/iship/unlinked/import', 'POST', { trackingNo: 'TH123', itemName: 'x', itemPrice: 10 }) as never)
    expect(res.status).toBe(403)
    expect(svc.importParcelAsOrder).not.toHaveBeenCalled()
  })

  it('POST /api/seller/iship/unlinked/import (S1) — TECHNICIAN (มี O4 แต่ไม่มี S1) → 403', async () => {
    asRole(['TECHNICIAN'], 'ONLINE_SALES')
    const res = await ishipImportPost(json('/api/seller/iship/unlinked/import', 'POST', { trackingNo: 'TH123', itemName: 'x', itemPrice: 10 }) as never)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
    expect(svc.importParcelAsOrder).not.toHaveBeenCalled()
  })

  it('auto-order retry: TECHNICIAN (มี O1/O4 แต่ไม่มี O2) → 403', async () => {
    asRole(['TECHNICIAN'])
    db.order.findUnique.mockResolvedValue({ shopId: SHOP, status: 'DRAFTED' })
    const res = await autoOrderRetryPost(json(`/api/orders/${TOKEN}/auto-order/retry`, 'POST', {}), params)
    expect(res.status).toBe(403)
  })

  it('auto-order retry: คนนอกร้านยังได้ 404 (แยกไม่ออกว่า token มีจริง)', async () => {
    asRole([])
    db.shop.findUnique.mockResolvedValue({ id: SHOP, userId: 'owner-x', kind: 'BUSINESS', vertical: 'SERVICE_QUEUE', deletedAt: null, members: [] })
    db.order.findUnique.mockResolvedValue({ shopId: SHOP, status: 'DRAFTED' })
    const res = await autoOrderRetryPost(json(`/api/orders/${TOKEN}/auto-order/retry`, 'POST', {}), params)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/orders/[token] — BILLING แก้ได้เฉพาะบริการที่ยังไม่ชำระ (O3 ต่อใบ)', () => {
  const EXISTING = {
    id: 'order-9', status: 'PENDING', type: 'SERVICE', totalAmount: 300, buyerContact: null, customerId: null, buyerName: null,
    paymentMethod: null, salesChannel: null, internalNote: null, discount: null, vatRate: null, vatAmount: null, shippingAddress: null,
    createdAt: new Date('2026-10-01T03:00:00Z'), publicToken: TOKEN, fulfillmentMode: 'NO_SHIPPING', handedOverAt: null, payoutSnapshot: null,
    conversationId: null, items: [{ productId: null, name: 'ตัดผม', qty: 1, price: 300, description: null }],
  }
  const patch = () => patchOrderRoute(json(`/api/orders/${TOKEN}`, 'PATCH', createBody({ type: 'SERVICE' })), params)
  beforeEach(() => {
    asRole(['BILLING'])
    db.order.findFirst.mockResolvedValue(EXISTING)
  })

  it('บิลที่รับเงินแล้ว → 403 FORBIDDEN_ROLE และไม่แก้', async () => {
    db.order.findUniqueOrThrow.mockResolvedValue({
      type: 'SERVICE', totalAmount: 300, paymentConfirmedAt: null, codReceivedAt: null,
      payments: [{ kind: 'DEPOSIT', amount: 100, voidedAt: null }],
    })
    const res = await patch()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
    expect(db.order.update).not.toHaveBeenCalled()
  })

  it('บิลบริการที่ยังไม่ชำระ → 200', async () => {
    db.order.findUniqueOrThrow.mockResolvedValue({ type: 'SERVICE', totalAmount: 300, paymentConfirmedAt: null, codReceivedAt: null, payments: [] })
    expect((await patch()).status).toBe(200)
    expect(db.order.update).toHaveBeenCalled()
  })

  it('MANAGER แก้ใบที่รับเงินแล้วได้ (O3 ไม่มีเงื่อนไข)', async () => {
    asRole(['MANAGER'])
    db.order.findFirst.mockResolvedValue(EXISTING)
    expect((await patch()).status).toBe(200)
    expect(db.order.findUniqueOrThrow).not.toHaveBeenCalled()
  })

  it('TECHNICIAN (ไม่มี O3) → 403', async () => {
    asRole(['TECHNICIAN'])
    expect((await patch()).status).toBe(403)
  })
})

describe('สิทธิ์แยกราย action', () => {
  it('BILLING บันทึกรับเงิน (O5) → 200', async () => {
    asRole(['BILLING'])
    const res = await paymentsPost(json(`/api/orders/${TOKEN}/payments`, 'POST', { kind: 'DEPOSIT', amount: 100 }), params)
    expect(res.status).toBe(200)
    expect(svc.recordPayment).toHaveBeenCalled()
  })

  it('TECHNICIAN บันทึกรับเงิน → 403', async () => {
    asRole(['TECHNICIAN'])
    const res = await paymentsPost(json(`/api/orders/${TOKEN}/payments`, 'POST', { kind: 'DEPOSIT', amount: 100 }), params)
    expect(res.status).toBe(403)
    expect(svc.recordPayment).not.toHaveBeenCalled()
  })

  it('TECHNICIAN ปิดผลนัด (O4) → 200', async () => {
    asRole(['TECHNICIAN'])
    const res = await outcomePost(json(`/api/orders/${TOKEN}/appointment/outcome`, 'POST', { outcome: 'COMPLETED' }), params)
    expect(res.status).toBe(200)
    expect(svc.setAppointmentOutcome).toHaveBeenCalled()
  })

  it('TECHNICIAN เลื่อนนัด (O3) → 403', async () => {
    asRole(['TECHNICIAN'])
    const res = await reschedulePatch(json(`/api/orders/${TOKEN}/appointment`, 'PATCH', {}), params)
    expect(res.status).toBe(403)
    expect(svc.setOrRescheduleAppointment).not.toHaveBeenCalled()
  })

  it('TECHNICIAN แจ้งเลขพัสดุ (S1 — ไม่ใช่ O4) → 403', async () => {
    asRole(['TECHNICIAN'], 'ONLINE_SALES')
    db.order.findUnique.mockResolvedValue({ shopId: SHOP, shop: { vertical: 'ONLINE_SALES' } })
    const res = await shipPost(json(`/api/orders/${TOKEN}/ship`, 'POST', { carrier: 'KERRY', trackingNo: 'TH1' }), params)
    expect(res.status).toBe(403)
    expect(svc.shipOrder).not.toHaveBeenCalled()
  })

  it('CHAT แจ้งเลขพัสดุ (S1) → ผ่านด่าน', async () => {
    asRole(['CHAT'], 'ONLINE_SALES')
    db.order.findUnique.mockResolvedValue({ shopId: SHOP, shop: { vertical: 'ONLINE_SALES' } })
    svc.shipOrder.mockResolvedValue({ status: 'SHIPPED' })
    const res = await shipPost(json(`/api/orders/${TOKEN}/ship`, 'POST', { carrier: 'KERRY', trackingNo: 'TH1' }), params)
    expect(res.status).not.toBe(403)
  })

  it('BILLING เลื่อนนัด (O3) → ผ่านด่าน (ไม่ 403)', async () => {
    asRole(['BILLING'])
    svc.setOrRescheduleAppointment.mockResolvedValue({})
    const res = await reschedulePatch(json(`/api/orders/${TOKEN}/appointment`, 'PATCH', {}), params)
    expect(res.status).not.toBe(403)
  })
})

describe('เลื่อนนัด (C-7) — BILLING เลื่อนได้เฉพาะบริการที่ยังไม่ชำระ', () => {
  const body = { resourceId: 'r1', start: '2026-10-20T10:00:00+07:00', end: '2026-10-20T11:00:00+07:00' }
  const go = () => reschedulePatch(json(`/api/orders/${TOKEN}/appointment`, 'PATCH', body), params)
  const unpaid = { type: 'SERVICE', totalAmount: 300, paymentConfirmedAt: null, codReceivedAt: null, payments: [] }
  beforeEach(() => svc.setOrRescheduleAppointment.mockResolvedValue({ resource: null, serviceStart: null, serviceEnd: null, appointmentStatus: 'SCHEDULED', rescheduleCount: 1 }))

  it('BILLING + SERVICE ยังไม่ชำระ → 200', async () => {
    asRole(['BILLING'])
    db.order.findFirst.mockResolvedValue(unpaid)
    expect((await go()).status).toBe(200)
    expect(svc.setOrRescheduleAppointment).toHaveBeenCalled()
  })

  it('BILLING + รับมัดจำแล้ว → 403 FORBIDDEN_ROLE และไม่เลื่อน', async () => {
    asRole(['BILLING'])
    db.order.findFirst.mockResolvedValue({ ...unpaid, payments: [{ kind: 'DEPOSIT', amount: 100, voidedAt: null }] })
    const res = await go()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
    expect(svc.setOrRescheduleAppointment).not.toHaveBeenCalled()
  })

  it('MANAGER เลื่อนใบที่รับเงินแล้วได้', async () => {
    asRole(['MANAGER'])
    db.order.findFirst.mockResolvedValue({ ...unpaid, payments: [{ kind: 'DEPOSIT', amount: 100, voidedAt: null }] })
    expect((await go()).status).toBe(200)
  })
})

describe('ยกเลิกรายการรับเงิน — O6 (เจ้าของ+ผู้จัดการ) ไม่ใช่ O5', () => {
  const del = () => voidDelete(json(`/api/orders/${TOKEN}/payments/p1`, 'DELETE', { reason: 'กรอกผิด' }) as never, { params: Promise.resolve({ token: TOKEN, paymentId: 'p1' }) })
  beforeEach(() => svc.voidPayment.mockResolvedValue({ ok: true }))

  it('BILLING (มี O5 ไม่มี O6) → 403 และไม่ยกเลิก', async () => {
    asRole(['BILLING'])
    expect((await del()).status).toBe(403)
    expect(svc.voidPayment).not.toHaveBeenCalled()
  })

  it('MANAGER → 200', async () => {
    asRole(['MANAGER'])
    expect((await del()).status).toBe(200)
    expect(svc.voidPayment).toHaveBeenCalled()
  })
})

describe('PATCH/DELETE /api/products/[id] — ไม่ใช่สมาชิก 404 · สมาชิกไม่มี P2 403', () => {
  const pp = { params: Promise.resolve({ id: PRODUCT }) }
  const patchP = () => productPatch(json(`/api/products/${PRODUCT}`, 'PATCH', { name: 'y' }) as never, pp)
  const delP = () => productDelete(json(`/api/products/${PRODUCT}`, 'DELETE', {}) as never, pp)
  beforeEach(() => db.product.findUnique.mockResolvedValue({ id: PRODUCT, shopId: SHOP, type: 'PHYSICAL', stockQty: null, shop: { vertical: 'SERVICE_QUEUE' } }))

  it.each([['PATCH', patchP], ['DELETE', delP]] as const)('%s: คนนอกร้านของสินค้า → 404', async (_n, call) => {
    asRole(['MANAGER'])
    db.shopMember.findUnique.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
    expect(svc.updateProduct).not.toHaveBeenCalled()
    expect(svc.deleteProduct).not.toHaveBeenCalled()
  })

  it.each([['PATCH', patchP], ['DELETE', delP]] as const)('%s: สมาชิกที่ไม่มี P2 → 403 FORBIDDEN_ROLE', async (_n, call) => {
    asRole(['TECHNICIAN'])
    const res = await call()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
    expect(svc.updateProduct).not.toHaveBeenCalled()
    expect(svc.deleteProduct).not.toHaveBeenCalled()
  })
})
