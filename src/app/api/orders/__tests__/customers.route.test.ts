import { describe, it, expect, vi, beforeEach } from 'vitest'

// 00078 S-5 — /api/orders/customers: ผลตาม q + orderCount = counted + ไม่มี query ต่อแถว
const findMany = vi.fn()
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'u1' } }) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: { order: { findMany: (a: unknown) => findMany(a) } } }))
vi.mock('@/lib/shop-capability', () => ({
  requireShopCapability: async () => ({ ok: true, active: { shop: { id: 'shop-1' } } }),
}))

import { GET } from '../customers/route'

const req = (q: string) => new Request(`http://x/api/orders/customers?q=${q}`) as never
const ev = (o: object) => ({ status: 'CONFIRMED', cancelInitiator: null, cancelReason: null, appointmentStatus: null, shipments: [], ...o })

beforeEach(() => {
  findMany.mockReset()
  findMany
    .mockResolvedValueOnce([
      { buyerContact: '0811111111', buyerName: 'สมชาย' },
      { buyerContact: '0811111111', buyerName: null },
      { buyerContact: '0822222222', buyerName: 'สมหญิง' },
      { buyerContact: '0899999999', buyerName: 'ไม่เกี่ยว' },
    ])
    .mockResolvedValueOnce([
      ev({ buyerContact: '0811111111' }),
      ev({ buyerContact: '0811111111', status: 'CANCELLED' }),
      ev({ buyerContact: '0822222222' }),
      ev({ buyerContact: '0822222222' }),
      ev({ buyerContact: '0822222222', shipments: [{ carrierStatus: 'return' }] }),
    ])
})

describe('GET /api/orders/customers', () => {
  it('กรอง q ก่อน · orderCount = counted · เรียงมาก→น้อย', async () => {
    const res = await GET(req('สม'))
    expect(await res.json()).toEqual([
      { name: 'สมหญิง', contact: '0822222222', orderCount: 2 },
      { name: 'สมชาย', contact: '0811111111', orderCount: 1 },
    ])
  })

  it('หลักฐานดึงเฉพาะ contact ที่ผ่าน q และมีแค่ 2 query ไม่ว่ากี่แถว', async () => {
    await GET(req('สม'))
    expect(findMany).toHaveBeenCalledTimes(2)
    const second = findMany.mock.calls[1]![0] as { where: { shopId: string; buyerContact: { in: string[] } } }
    expect(second.where.shopId).toBe('shop-1')
    expect(second.where.buyerContact.in.sort()).toEqual(['0811111111', '0822222222'])
  })

  it('ไม่มีใครผ่าน q → [] และไม่ยิง query รอบ 2', async () => {
    const res = await GET(req('zzz'))
    expect(await res.json()).toEqual([])
    expect(findMany).toHaveBeenCalledTimes(1)
  })
})
