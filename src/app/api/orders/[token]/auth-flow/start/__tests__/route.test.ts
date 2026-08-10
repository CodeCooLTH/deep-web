/**
 * [blocker] `POST /api/orders/[token]/auth-flow/start` — instrumentation ต้องไม่ขวางทางผู้ใช้
 *
 * endpoint นี้ถูกยิงตอน guest กำลังจะกดล็อกอิน ⇒ ถ้ามันตอบ error/ช้า/500 ผู้ใช้จะสะดุด
 * ในจังหวะที่เปราะที่สุดของทั้ง funnel (จุดที่ prod บอกว่าคนหลุด 100%) — เทสชุดนี้ล็อกว่า
 * ไม่ว่าอะไรพัง มันต้องคืน 204 เสมอ
 *
 * และล็อกอีกข้อที่ตรงข้ามกับ endpoint อื่นทั้งหมดใต้ /api/orders/[token]/:
 * **ต้องไม่บังคับ session** — ถ้าบังคับ ตัวส่วนของ Login Completion Rate จะหายไปทั้งก้อน
 *
 * 🛑 แดง = ห้าม merge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const recordOrderEvent = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: { order: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}))
vi.mock('@/services/order-event.service', () => ({
  recordOrderEvent: (...a: unknown[]) => recordOrderEvent(...a),
}))

const { POST } = await import('../route')

const TOKEN = 'tok_1'

function post(body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) {
  const req = new Request(`https://x.test/api/orders/${TOKEN}/auth-flow/start`, {
    method: 'POST',
    body: body === undefined ? null : JSON.stringify(body),
    headers,
  })
  return POST(req as never, { params: Promise.resolve({ token: TOKEN }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  findUnique.mockResolvedValue({ id: 'ord_1' })
  recordOrderEvent.mockResolvedValue(undefined)
})

describe('POST auth-flow/start', () => {
  it('guest ที่ไม่มี session เรียกได้ และบันทึก AUTH_FLOW_STARTED', async () => {
    const res = await post({ method: 'facebook' })

    expect(res.status).toBe(204)
    expect(recordOrderEvent).toHaveBeenCalledTimes(1)
    expect(recordOrderEvent.mock.calls[0][1]).toMatchObject({
      orderId: 'ord_1',
      type: 'AUTH_FLOW_STARTED',
      // guest ยังไม่มีตัวตน — null คือค่าที่ถูกต้อง ไม่ใช่ข้อมูลขาด
      actorUserId: null,
    })
  })

  it('token ไม่มีจริง → 204 และไม่บันทึกอะไร (ไม่บอกว่ามีหรือไม่มี)', async () => {
    findUnique.mockResolvedValue(null)

    const res = await post({ method: 'facebook' })

    expect(res.status).toBe(204)
    expect(recordOrderEvent).not.toHaveBeenCalled()
  })

  it('body พัง/ไม่มี → ยังบันทึกได้ โดยไม่มี method', async () => {
    const req = new Request(`https://x.test/api/orders/${TOKEN}/auth-flow/start`, {
      method: 'POST',
      body: 'ไม่ใช่ json',
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req as never, { params: Promise.resolve({ token: TOKEN }) })

    expect(res.status).toBe(204)
    expect(recordOrderEvent).toHaveBeenCalledTimes(1)
    expect(recordOrderEvent.mock.calls[0][1]).not.toHaveProperty('meta')
  })

  it('method ที่ไม่อยู่ใน picklist → ทิ้ง method แต่ยังบันทึก event', async () => {
    const res = await post({ method: 'ทางลัดที่ไม่มีอยู่จริง' })

    expect(res.status).toBe(204)
    expect(recordOrderEvent).toHaveBeenCalledTimes(1)
    expect(recordOrderEvent.mock.calls[0][1]).not.toHaveProperty('meta')
  })

  // 🛑 เคสสำคัญที่สุด — instrumentation ต้องไม่ทำให้ผู้ใช้เจอ error กลางทางไปล็อกอิน
  it('เขียนฐานล้ม → ยังคืน 204 ไม่ปล่อย 500 ออกไป', async () => {
    recordOrderEvent.mockRejectedValue(new Error('CHECK constraint violation'))

    const res = await post({ method: 'phone_otp' })

    expect(res.status).toBe(204)
  })

  it('query ฐานล้ม → ยังคืน 204', async () => {
    findUnique.mockRejectedValue(new Error('db down'))

    const res = await post({ method: 'facebook' })

    expect(res.status).toBe(204)
  })
})
