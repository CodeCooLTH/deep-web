/**
 * TC-302/303/306 — ShipOrderSchema + PATCH /api/orders/[token]/shipping-cost (00078 D06)
 * ด่านสิทธิ์ใช้ canAccessShopWith ตัวจริง; mock แค่ prisma/session (ไม่ต่อ DB จริง HR13)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as v from 'valibot'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

const db = vi.hoisted(() => ({
  shop: { findUnique: vi.fn() },
  shopMember: { findUnique: vi.fn() },
  order: { findUnique: vi.fn(), findFirst: vi.fn() },
  shipmentTracking: { update: vi.fn() },
  orderEvent: { create: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { getServerSession } from 'next-auth'
import { PATCH } from '../[token]/shipping-cost/route'
import { ShipOrderSchema } from '@/lib/validations'

const req = (body: unknown) =>
  new NextRequest('http://x/api/orders/t1/shipping-cost', { method: 'PATCH', body: JSON.stringify(body) })
const call = (body: unknown) => PATCH(req(body), { params: Promise.resolve({ token: 't1' }) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'owner1' } } as never)
  db.order.findUnique.mockResolvedValue({ shopId: 'shop1' })
  db.shop.findUnique.mockResolvedValue({ id: 'shop1', userId: 'owner1', kind: 'PERSONAL' })
  db.shopMember.findUnique.mockResolvedValue(null)
  db.user.findUnique.mockResolvedValue({ displayName: 'เจ้าของ', username: 'o' })
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db))
  db.shipmentTracking.update.mockResolvedValue({ outboundShippingCost: 35 })
})

describe('TC-302 ShipOrderSchema.outboundShippingCost', () => {
  const ok = (extra: object) => v.safeParse(ShipOrderSchema, { provider: 'p', trackingNo: 't', ...extra })
  it('ไม่ส่งคีย์/null/0/ค่าปกติ ผ่าน (ไม่ส่งคีย์ = ไม่มีคีย์ใน output)', () => {
    expect(ok({}).success).toBe(true)
    expect('outboundShippingCost' in (ok({}) as { output: object }).output).toBe(false)
    for (const n of [null, 0, 35.5, 99999.99]) expect(ok({ outboundShippingCost: n }).success, String(n)).toBe(true)
  })
  it('ติดลบ/เกินเพดาน/3 ทศนิยม/ไม่ใช่ตัวเลข ถูกปฏิเสธ', () => {
    for (const n of [-1, 100000, 1.005, '35']) expect(ok({ outboundShippingCost: n }).success, String(n)).toBe(false)
  })
})

describe('TC-303 PATCH /shipping-cost', () => {
  it('มีแถวเดิม → 200 + no-store + บันทึกผู้แก้โดยไม่ใส่ตัวเลขเงินใน meta', async () => {
    db.order.findFirst.mockResolvedValue({ id: 'o1', status: 'SHIPPED', shipmentTracking: { id: 'st1' } })
    const res = await call({ outboundShippingCost: 35 })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(await res.json()).toEqual({ outboundShippingCost: 35 })
    expect(db.shipmentTracking.update).toHaveBeenCalledWith(expect.objectContaining({ data: { outboundShippingCost: 35 } }))
    const ev = db.orderEvent.create.mock.calls[0][0].data
    expect(ev.actorUserId).toBe('owner1')
    expect(JSON.stringify(ev.meta)).not.toContain('35')
  })

  it('ไม่มีแถว ShipmentTracking → 409 NO_TRACKING_ROW และไม่เขียนอะไร', async () => {
    db.order.findFirst.mockResolvedValue({ id: 'o1', status: 'SHIPPED', shipmentTracking: null })
    const res = await call({ outboundShippingCost: 35 })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('NO_TRACKING_ROW')
    expect(db.shipmentTracking.update).not.toHaveBeenCalled()
  })

  it('ใบ CANCELLED/DRAFTED → 409 SHIPPING_COST_NOT_ALLOWED', async () => {
    for (const status of ['CANCELLED', 'DRAFTED']) {
      db.order.findFirst.mockResolvedValue({ id: 'o1', status, shipmentTracking: { id: 'st1' } })
      const res = await call({ outboundShippingCost: 1 })
      expect(res.status, status).toBe(409)
      expect((await res.json()).error).toBe('SHIPPING_COST_NOT_ALLOWED')
    }
  })

  it('body ผิด → 400 · ไม่ล็อกอิน → 401 · ไม่ใช่สมาชิกร้าน → 403', async () => {
    expect((await call({})).status).toBe(400)
    expect((await call({ outboundShippingCost: -5 })).status).toBe(400)
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'stranger' } } as never)
    expect((await call({ outboundShippingCost: 1 })).status).toBe(403)
    vi.mocked(getServerSession).mockResolvedValue(null as never)
    expect((await call({ outboundShippingCost: 1 })).status).toBe(401)
  })

  it('ออเดอร์หายระหว่างทาง (OrderNotFoundError) → 404', async () => {
    db.order.findFirst.mockResolvedValue(null)
    expect((await call({ outboundShippingCost: 1 })).status).toBe(404)
  })

  it('error ที่ไม่รู้จัก → 500 ข้อความกลาง ๆ ไม่รั่ว err.message + no-store', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.order.findFirst.mockRejectedValue(new Error('connection to db-host-secret refused'))
    const res = await call({ outboundShippingCost: 1 })
    expect(res.status).toBe(500)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(JSON.stringify(await res.json())).not.toContain('db-host-secret')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('null ล้างค่า', async () => {
    db.order.findFirst.mockResolvedValue({ id: 'o1', status: 'SHIPPED', shipmentTracking: { id: 'st1' } })
    db.shipmentTracking.update.mockResolvedValue({ outboundShippingCost: null })
    const res = await call({ outboundShippingCost: null })
    expect(await res.json()).toEqual({ outboundShippingCost: null })
  })
})
