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
  closeServiceJob: vi.fn(),
  startServiceJob: vi.fn(),
  reopenServiceJob: vi.fn(),
  setOrRescheduleAppointment: vi.fn(),
  shipOrder: vi.fn(),
  retryAutoOrderDraft: vi.fn(),
  createBooking: vi.fn(),
  importParcelAsOrder: vi.fn(),
}))
vi.mock('@/services/order-payment.service', async (orig) => ({ ...(await orig<object>()), recordPayment: svc.recordPayment, voidPayment: svc.voidPayment }))
vi.mock('@/services/product.service', async (orig) => ({ ...(await orig<object>()), updateProduct: svc.updateProduct, deleteProduct: svc.deleteProduct, serializeProduct: (p: unknown) => p }))
vi.mock('@/services/appointment.service', async (orig) => ({
  ...(await orig<object>()), setOrRescheduleAppointment: svc.setOrRescheduleAppointment,
}))
// feature 00073 — ปุ่มผลนัดเดิม = ปิดงาน (closeServiceJob) · /close = ปิดงานเต็ม + เปิดงานอีกครั้ง
vi.mock('@/services/service-job.service', () => ({ closeServiceJob: svc.closeServiceJob, reopenServiceJob: svc.reopenServiceJob, startServiceJob: svc.startServiceJob }))
vi.mock('@/services/order.service', async (orig) => ({ ...(await orig<object>()), shipOrder: svc.shipOrder }))
vi.mock('@/services/auto-order-validate.service', async (orig) => ({ ...(await orig<object>()), retryAutoOrderDraft: svc.retryAutoOrderDraft }))
vi.mock('@/services/booking.service', async (orig) => ({ ...(await orig<object>()), createBooking: svc.createBooking }))
vi.mock('@/services/iship.service', async (orig) => ({ ...(await orig<object>()), importParcelAsOrder: svc.importParcelAsOrder }))

import { getServerSession } from 'next-auth'
import { POST as createOrderRoute } from '../route'
import { PATCH as patchOrderRoute } from '../[token]/route'
import { POST as paymentsPost } from '../[token]/payments/route'
import { POST as outcomePost } from '../[token]/appointment/outcome/route'
import { POST as startPost } from '../[token]/start/route'
import { ServiceJobNotStartableError } from '@/lib/service-job'
import { POST as closePost, DELETE as reopenDelete } from '../[token]/close/route'
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

/** ผู้ใช้เป็นสมาชิก ADMIN ของร้านที่มี `roles` ตามนี้ (ร้าน BUSINESS ประเภท `vertical`) · `flags` = ธง 00086 ของแถวสมาชิก */
function asRole(roles: string[], vertical = 'SERVICE_QUEUE', flags: { canCloseJob?: boolean; canRecordExpense?: boolean } = {}) {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1', activeShopId: SHOP } } as never)
  const shopRow = {
    id: SHOP, userId: 'owner-x', kind: 'BUSINESS', vertical, deletedAt: null, packageLockedAt: null, packageLockReason: null,
    payoutBankCode: null, payoutAccountNo: null, payoutAccountName: null, payoutPromptPayId: null,
    members: [{ role: memberRole(roles), roles: memberRoles(roles), canCloseJob: false, canRecordExpense: false, ...flags }],
  }
  db.shop.findUnique.mockResolvedValue(shopRow)
  db.shopMember.findUnique.mockResolvedValue({ role: memberRole(roles), roles: memberRoles(roles), canCloseJob: false, canRecordExpense: false, ...flags })
}
const CLOSE_FLAG = { canCloseJob: true }
// ['OWNER'] = แถวเจ้าของร่วม (role OWNER · roles ว่าง) — บทบาทพนักงานอื่น = role ADMIN + roles
function memberRole(roles: string[]) { return roles.includes('OWNER') ? 'OWNER' : 'ADMIN' }
function memberRoles(roles: string[]) { return roles.includes('OWNER') ? [] : roles }

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
  svc.closeServiceJob.mockResolvedValue({ appointmentStatus: 'COMPLETED', serviceClosedAt: new Date(), money: {} })
  svc.reopenServiceJob.mockResolvedValue({ serviceClosedAt: null })
  svc.startServiceJob.mockResolvedValue({ serviceStartedAt: new Date(), alreadyStarted: false })
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

  it('TECHNICIAN (+ธงปิดงาน 00086) ปิดผลนัด (O4) → 200', async () => {
    asRole(['TECHNICIAN'], 'SERVICE_QUEUE', CLOSE_FLAG)
    const res = await outcomePost(json(`/api/orders/${TOKEN}/appointment/outcome`, 'POST', { outcome: 'COMPLETED' }), params)
    expect(res.status).toBe(200)
    expect(svc.closeServiceJob).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SERVED', deposit: 'KEEP' }))
  })

  // ── feature 00073 — ปิดงาน: O4 ด่านหลัก · เงินต้อง O5 · คืนมัดจำต้อง O6 · เปิดงานอีกครั้งต้อง O6 ──
  it('[00073] TECHNICIAN (+ธงปิดงาน) ปิดงานไม่มีเงิน → 200 และไม่ได้ยอดเงินกลับไป', async () => {
    asRole(['TECHNICIAN'], 'SERVICE_QUEUE', CLOSE_FLAG)
    const res = await closePost(json(`/api/orders/${TOKEN}/close`, 'POST', { outcome: 'SERVED' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).not.toHaveProperty('money')
  })
  it('[00073] TECHNICIAN (+ธงปิดงาน) ปิดงานพร้อมรับเงิน (ไม่มี O5) → 403', async () => {
    asRole(['TECHNICIAN'], 'SERVICE_QUEUE', CLOSE_FLAG)
    const res = await closePost(json(`/api/orders/${TOKEN}/close`, 'POST', { outcome: 'SERVED', payment: { amount: 500 } }), params)
    expect(res.status).toBe(403)
    expect(svc.closeServiceJob).not.toHaveBeenCalled()
  })
  it('[00073] BILLING (O5 ไม่มี O4) ปิดงานไม่ได้ → 403', async () => {
    asRole(['BILLING'])
    const res = await closePost(json(`/api/orders/${TOKEN}/close`, 'POST', { outcome: 'SERVED' }), params)
    expect(res.status).toBe(403)
  })
  it('[00073] CHAT (+ธงปิดงาน · O4+O5 ไม่มี O6) ปิดไม่มาตามนัดแบบคืนมัดจำ → 403 · เก็บมัดจำ → 200', async () => {
    asRole(['CHAT'], 'SERVICE_QUEUE', CLOSE_FLAG)
    const refund = await closePost(json(`/api/orders/${TOKEN}/close`, 'POST', { outcome: 'NO_SHOW', deposit: 'REFUND' }), params)
    expect(refund.status).toBe(403)
    const keep = await closePost(json(`/api/orders/${TOKEN}/close`, 'POST', { outcome: 'NO_SHOW', deposit: 'KEEP' }), params)
    expect(keep.status).toBe(200)
  })
  it('[00073] MANAGER ปิดงาน + รับเงิน → 200 · เปิดงานอีกครั้ง → 200', async () => {
    asRole(['MANAGER'])
    const res = await closePost(json(`/api/orders/${TOKEN}/close`, 'POST', { outcome: 'SERVED', payment: { amount: 500, method: 'CASH' } }), params)
    expect(res.status).toBe(200)
    expect(svc.closeServiceJob).toHaveBeenCalledWith(expect.objectContaining({ payment: expect.objectContaining({ amount: 500, method: 'CASH' }) }))
    expect((await reopenDelete(json(`/api/orders/${TOKEN}/close`, 'DELETE', {}), params)).status).toBe(200)
  })
  // ── feature 00078 — เริ่มงาน: O4 · ช่างเรียกได้ · ไม่มีคีย์เงินกลับไป ──
  it('[00078] TECHNICIAN เริ่มงาน (O4) → 200 ไม่มีคีย์เงิน', async () => {
    asRole(['TECHNICIAN'])
    const res = await startPost(json(`/api/orders/${TOKEN}/start`, 'POST', {}), params)
    expect(res.status).toBe(200)
    expect(Object.keys(await res.json()).sort()).toEqual(['alreadyStarted', 'serviceStartedAt'])
  })
  it('[00078] BILLING (ไม่มี O4) เริ่มงานไม่ได้ → 403 และไม่เรียก service', async () => {
    asRole(['BILLING'])
    const res = await startPost(json(`/api/orders/${TOKEN}/start`, 'POST', {}), params)
    expect(res.status).toBe(403)
    expect(svc.startServiceJob).not.toHaveBeenCalled()
  })
  it('[00078] ใบยกเลิก/ร่าง → 409 SERVICE_JOB_NOT_STARTABLE', async () => {
    asRole(['TECHNICIAN'])
    svc.startServiceJob.mockRejectedValueOnce(new ServiceJobNotStartableError())
    const res = await startPost(json(`/api/orders/${TOKEN}/start`, 'POST', {}), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('SERVICE_JOB_NOT_STARTABLE')
  })
  it('[00078] ?shopId= ของร้านที่ไม่ได้เป็นสมาชิก → ไม่ผ่านด่าน (ไม่เรียก service)', async () => {
    asRole(['TECHNICIAN'])
    db.shopMember.findUnique.mockResolvedValue(null)
    const res = await startPost(json(`/api/orders/${TOKEN}/start?shopId=other-shop`, 'POST', {}), params)
    expect([403, 404]).toContain(res.status)
    expect(svc.startServiceJob).not.toHaveBeenCalled()
  })

  it('[00073] TECHNICIAN เปิดงานอีกครั้ง (ไม่มี O6) → 403', async () => {
    asRole(['TECHNICIAN'])
    const res = await reopenDelete(json(`/api/orders/${TOKEN}/close`, 'DELETE', {}), params)
    expect(res.status).toBe(403)
    expect(svc.reopenServiceJob).not.toHaveBeenCalled()
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

describe('[00086 S-5] ปิดงานตามสิทธิ์ — /close และ /appointment/outcome กั้นเท่ากัน (FR-005)', () => {
  const closeCall = () => closePost(json(`/api/orders/${TOKEN}/close`, 'POST', { outcome: 'SERVED' }), params)
  const outcomeCall = () => outcomePost(json(`/api/orders/${TOKEN}/appointment/outcome`, 'POST', { outcome: 'COMPLETED' }), params)
  const ROUTES = [['POST /close', closeCall], ['POST /appointment/outcome', outcomeCall]] as const

  type Case = [label: string, status: 200 | 403, roles: string[], flags: { canCloseJob?: boolean }]
  const SERVICE: Case[] = [
    ['OWNER (ไม่มีธง)', 200, ['OWNER'], {}],
    ['MANAGER (ไม่มีธง)', 200, ['MANAGER'], {}],
    ['CHAT + ธง', 200, ['CHAT'], { canCloseJob: true }],
    ['CHAT ไม่มีธง', 403, ['CHAT'], {}],
    ['TECHNICIAN + ธง', 200, ['TECHNICIAN'], { canCloseJob: true }],
    ['TECHNICIAN ไม่มีธง', 403, ['TECHNICIAN'], {}],
    ['TECHNICIAN+CHAT ไม่มีธง', 403, ['TECHNICIAN', 'CHAT'], {}],
    ['BILLING ไม่มีธง', 403, ['BILLING'], {}],
    // BILLING ไม่มี O4 ⇒ ตกตั้งแต่ด่านเดิม · ธงที่ค้างในแถว (ไม่ควรเกิด — CHECK กันไว้) ต้องไม่เปิดทาง
    ['BILLING + ธง', 403, ['BILLING'], { canCloseJob: true }],
  ]

  describe.each(ROUTES)('%s — ร้านบริการ (SERVICE_QUEUE)', (_r, call) => {
    it.each(SERVICE)('%s → %d', async (_l, status, roles, flags) => {
      asRole(roles, 'SERVICE_QUEUE', flags)
      const res = await call()
      expect(res.status).toBe(status)
      if (status === 403) {
        expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
        expect(svc.closeServiceJob).not.toHaveBeenCalled()
      } else {
        expect(svc.closeServiceJob).toHaveBeenCalledWith(expect.objectContaining({ shopId: SHOP, orderToken: TOKEN }))
      }
    })
  })

  // ร้านอื่น: กติกาเดิม (O4) ทุกประการ — ไม่มีธงก็ปิดได้ถ้าบทบาทมี O4
  const NON_SERVICE: Case[] = [
    ['CHAT ไม่มีธง', 200, ['CHAT'], {}],
    ['TECHNICIAN ไม่มีธง', 200, ['TECHNICIAN'], {}],
    ['MANAGER', 200, ['MANAGER'], {}],
    ['BILLING (ถูกตัดทิ้งนอกร้านบริการ)', 403, ['BILLING'], {}],
  ]
  describe.each(['ONLINE_SALES', 'LODGING'])('ร้าน %s — เท่ากับ O4 เดิม', (vertical) => {
    describe.each(ROUTES)('%s', (_r, call) => {
      it.each(NON_SERVICE)('%s → %d', async (_l, status, roles, flags) => {
        asRole(roles, vertical, flags)
        expect((await call()).status).toBe(status)
      })
    })
  })

  it('?shopId= ร้านอื่น: ตัดสินด้วยธงของแถวสมาชิก "ร้านนั้น" และส่ง shopId เดียวกันเข้า service', async () => {
    const OTHER = '33333333-3333-4333-8333-333333333333'
    asRole(['TECHNICIAN'], 'SERVICE_QUEUE', CLOSE_FLAG)
    db.shop.findUnique.mockResolvedValue({
      id: OTHER, userId: 'owner-y', kind: 'BUSINESS', vertical: 'SERVICE_QUEUE', deletedAt: null, packageLockedAt: null, packageLockReason: null,
    })
    // แถวสมาชิกของร้าน OTHER ไม่มีธง ⇒ ต้องโดนปฏิเสธแม้ร้าน active (SHOP) จะมีธง
    db.shopMember.findUnique.mockResolvedValue({ role: 'ADMIN', roles: ['TECHNICIAN'], canCloseJob: false, canRecordExpense: false })
    const res = await outcomePost(json(`/api/orders/${TOKEN}/appointment/outcome?shopId=${OTHER}`, 'POST', { outcome: 'COMPLETED' }), params)
    expect(res.status).toBe(403)
    expect(svc.closeServiceJob).not.toHaveBeenCalled()

    db.shopMember.findUnique.mockResolvedValue({ role: 'ADMIN', roles: ['TECHNICIAN'], canCloseJob: true, canRecordExpense: false })
    const ok = await closePost(json(`/api/orders/${TOKEN}/close?shopId=${OTHER}`, 'POST', { outcome: 'SERVED' }), params)
    expect(ok.status).toBe(200)
    expect(svc.closeServiceJob).toHaveBeenCalledWith(expect.objectContaining({ shopId: OTHER }))
  })

  it('เปิดงานอีกครั้ง (DELETE, O6) และพรีวิวเงิน (GET) ไม่เปลี่ยน — MANAGER ไม่ต้องมีธง', async () => {
    asRole(['MANAGER'])
    expect((await reopenDelete(json(`/api/orders/${TOKEN}/close`, 'DELETE', {}), params)).status).toBe(200)
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
