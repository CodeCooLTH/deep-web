// product-report-access.service.test.ts — รายงานยอดขายรายสินค้า = F1 = เจ้าของเท่านั้น (00071 BR-RP-08/09/10)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireActiveShop = vi.fn()
vi.mock('@/lib/shop-context', () => ({
  requireActiveShop: (...args: unknown[]) => requireActiveShop(...args),
}))

const { resolveProductReportAccess } = await import('./product-report-access.service')

const session = { user: { id: 'u1', activeShopId: 's1' } }
const shop = (staffCanViewFinance: boolean, vertical = 'ONLINE_SALES') =>
  ({ id: 's1', userId: 'owner1', vertical, staffCanViewFinance })

beforeEach(() => requireActiveShop.mockReset())

describe('resolveProductReportAccess', () => {
  it('ไม่มีร้าน → NO_SHOP', async () => {
    requireActiveShop.mockResolvedValue(null)
    expect(await resolveProductReportAccess(session)).toEqual({ kind: 'NO_SHOP' })
  })

  it('เจ้าของ → OK แม้ธง false', async () => {
    requireActiveShop.mockResolvedValue({ shop: shop(false), role: 'OWNER', roles: [] })
    expect((await resolveProductReportAccess(session)).kind).toBe('OK')
  })

  it('เจ้าของร่วม (Shop.userId เป็นคนอื่น) → OK', async () => {
    requireActiveShop.mockResolvedValue({ shop: { ...shop(false), userId: 'other' }, role: 'OWNER', roles: [] })
    expect((await resolveProductReportAccess(session)).kind).toBe('OK')
  })

  it('[blocker] ADMIN ธง true → FORBIDDEN (ธงไม่มีผล)', async () => {
    requireActiveShop.mockResolvedValue({ shop: shop(true), role: 'ADMIN', roles: ['CHAT'] })
    expect(await resolveProductReportAccess(session)).toEqual({ kind: 'FORBIDDEN' })
  })

  it('ร้านคนละประเภท → WRONG_VERTICAL ก่อนสิทธิ์', async () => {
    requireActiveShop.mockResolvedValue({ shop: shop(true, 'LODGING'), role: 'ADMIN', roles: ['MANAGER'] })
    expect((await resolveProductReportAccess(session)).kind).toBe('WRONG_VERTICAL')
  })
})
