import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 00071 T3 — 3 route ของ /api/wallet (4 handler) เป็นกระเป๋า F3: เจ้าของร้านเท่านั้น
 * mock session/requireShopForRequest/service (ไม่ต่อ DB) — แพตเทิร์นเดียวกับ sales-series/route.test.ts
 */
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/app-purchase-guard', () => ({ rejectInAppPurchase: vi.fn().mockResolvedValue(null) }))
// ด่านจริง (shop-capability) ทำงานเต็ม — mock แค่ตัว resolve ร้าน/สมาชิก
const requireShopForRequestMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/shop-context', () => ({ requireShopForRequest: requireShopForRequestMock }))
const getBalanceMock = vi.hoisted(() => vi.fn())
vi.mock('@/services/wallet.service', () => ({ getBalance: getBalanceMock, getTransactions: vi.fn().mockResolvedValue([]) }))
vi.mock('@/services/topup.service', () => ({ createTopUpRequest: vi.fn().mockResolvedValue({ id: 't1' }) }))
const prismaMock = vi.hoisted(() => ({
  topUpRequest: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { getServerSession } from 'next-auth'
import { GET as walletGET } from './route'
import { POST as topupPOST } from './topup/route'
import { GET as eventsGET, POST as eventsPOST } from './events/route'

function as(role: 'OWNER' | 'ADMIN', shopUserId = 'u1') {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1' } } as never)
  requireShopForRequestMock.mockResolvedValue({ ok: true, target: { shop: { id: 's1', userId: shopUserId, kind: 'BUSINESS', vertical: 'ONLINE_SALES' }, role, roles: role === 'ADMIN' ? ['MANAGER'] : [] } })
}
const post = (body: unknown) =>
  new Request('http://x/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

const handlers: [string, () => Promise<Response>][] = [
  ['GET /wallet', () => walletGET()],
  ['POST /wallet/topup', () => topupPOST(post({ amount: 100, slipFileId: 'f' }))],
  ['GET /wallet/events', () => eventsGET()],
  ['POST /wallet/events', () => eventsPOST(post({ ids: ['a'] }))],
]

describe('wallet routes — F3 เจ้าของร้านเท่านั้น', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getBalanceMock.mockResolvedValue(500)
  })

  for (const [name, call] of handlers) {
    it(`${name}: OWNER → ไม่ใช่ 403`, async () => {
      as('OWNER')
      expect((await call()).status).not.toBe(403)
    })
    it(`${name}: เจ้าของร่วม (ShopMember OWNER, shop.userId คนอื่น) → ไม่ใช่ 403`, async () => {
      as('OWNER', 'someone-else')
      expect((await call()).status).not.toBe(403)
    })
    it(`${name}: ADMIN → 403 FORBIDDEN_ROLE และไม่แตะยอด/ฐาน`, async () => {
      as('ADMIN')
      const res = await call()
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'FORBIDDEN_ROLE' })
      expect(getBalanceMock).not.toHaveBeenCalled()
      expect(prismaMock.topUpRequest.findMany).not.toHaveBeenCalled()
      expect(prismaMock.topUpRequest.updateMany).not.toHaveBeenCalled()
    })
  }
})
