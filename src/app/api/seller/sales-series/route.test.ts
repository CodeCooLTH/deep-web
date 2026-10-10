import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * 00071 T2 — /api/seller/sales-series เป็นการเงินเต็ม (F1): เจ้าของร้านเท่านั้น
 * mock session/requireShopForRequest/service (ไม่ต่อ DB) — แพตเทิร์นเดียวกับ shops/current/videos/route.test.ts
 */
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
const requireShopForRequestMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/shop-context', () => ({ requireShopForRequest: requireShopForRequestMock }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
const getSalesSeriesMock = vi.hoisted(() => vi.fn())
vi.mock('@/services/dashboard.service', () => ({ getSalesSeries: getSalesSeriesMock }))

import { GET } from './route'
import { getServerSession } from 'next-auth'

const req = () => new NextRequest('http://seller.deepth.local/api/seller/sales-series?mode=monthly&year=2026')

function as(role: 'OWNER' | 'ADMIN') {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1' } } as never)
  // เจ้าของร่วม = ShopMember.role OWNER แต่ shop.userId เป็นคนอื่น — ตัดสินที่ role ไม่ใช่ shop.userId
  requireShopForRequestMock.mockResolvedValue({ ok: true, target: { shop: { id: 's1', userId: 'someone-else', kind: 'BUSINESS', vertical: 'ONLINE_SALES' }, role, roles: role === 'ADMIN' ? ['MANAGER'] : [] } })
}

describe('GET /api/seller/sales-series', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSalesSeriesMock.mockResolvedValue({ points: [] })
  })

  it('OWNER (เจ้าของร่วม) → 200 และ includeFinance=true', async () => {
    as('OWNER')
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(getSalesSeriesMock.mock.calls[0][3]).toBe(true)
  })

  it('ADMIN → 403 FORBIDDEN_ROLE และไม่ query', async () => {
    as('ADMIN')
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
    expect(getSalesSeriesMock).not.toHaveBeenCalled()
  })
})
