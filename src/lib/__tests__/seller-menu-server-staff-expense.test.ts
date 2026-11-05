/**
 * resolveSellerMenuItems × เมนูค่าใช้จ่ายของพนักงาน (00086 FR-018)
 * ส่งธงมา = ไม่ query · ไม่ส่ง = อ่านแถวสมาชิกเฉพาะ ADMIN ของร้านบริการ · query ล้ม = ซ่อน (fail-closed · หน้าไม่พัง)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ shop: { findUnique: vi.fn() }, shopMember: { findUnique: vi.fn() } }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/services/line-report-access.service', () => ({ ownsAnyShop: vi.fn(async () => false) }))
vi.mock('@/services/inventory-entitlement.service', () => ({ getEntitlementInfo: vi.fn(async () => ({ status: 'NOT_SUBSCRIBED', package: null })) }))
vi.mock('@/i18n/server', async () => {
  const { th } = await vi.importActual<typeof import('@/i18n/dictionaries/th')>('@/i18n/dictionaries/th')
  return { getT: vi.fn(async () => th) }
})

import type { MenuItemType } from '@/types'
import { resolveSellerMenuItems, type SellerMenuContext } from '../seller-menu-server'

const urls = (items: MenuItemType[]): string[] => items.flatMap((i) => [...(i.url ? [i.url] : []), ...urls(i.children ?? [])])
const ctx = (over: Partial<SellerMenuContext> = {}): SellerMenuContext => ({
  session: { user: { id: 'u1', activeShopId: 's1' } },
  shopId: 's1', kind: 'BUSINESS', role: 'ADMIN', roles: ['MANAGER'], vertical: 'SERVICE_QUEUE',
  unreadChatCount: 0, isPrimaryOwner: false, hidePayments: false, hidePaidFeatures: false, offerIap: true,
  ...over,
})

beforeEach(() => {
  db.shopMember.findUnique.mockReset()
})

describe('resolveSellerMenuItems — เมนูค่าใช้จ่ายของพนักงาน', () => {
  it('[blocker] ส่งธง true = มีเมนู · ไม่ query ซ้ำ', async () => {
    const out = urls(await resolveSellerMenuItems(ctx({ canRecordExpense: true })))
    expect(out).toContain('/expenses/mine')
    expect(db.shopMember.findUnique).not.toHaveBeenCalled()
  })
  it('ไม่ส่งธง (แถบเมนูหน้าแชท) = อ่านจากแถวสมาชิกของผู้ใช้ในร้านนี้', async () => {
    db.shopMember.findUnique.mockResolvedValue({ canRecordExpense: true })
    expect(urls(await resolveSellerMenuItems(ctx()))).toContain('/expenses/mine')
    expect(db.shopMember.findUnique.mock.calls[0][0].where).toEqual({ shopId_userId: { shopId: 's1', userId: 'u1' } })
  })
  it('[blocker] ธง false / query ล้ม = ไม่มีเมนู และหน้าไม่พัง', async () => {
    db.shopMember.findUnique.mockResolvedValue({ canRecordExpense: false })
    expect(urls(await resolveSellerMenuItems(ctx()))).not.toContain('/expenses/mine')
    db.shopMember.findUnique.mockRejectedValue(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(urls(await resolveSellerMenuItems(ctx()))).not.toContain('/expenses/mine')
    spy.mockRestore()
  })
  it('[blocker] เจ้าของ · ร้านสินค้า · ร้านที่พัก = ไม่ query ไม่มีเมนู (service-only)', async () => {
    for (const over of [{ role: 'OWNER', roles: [] }, { vertical: 'ONLINE_SALES' }, { vertical: 'LODGING' }] as Partial<SellerMenuContext>[]) {
      expect(urls(await resolveSellerMenuItems(ctx(over)))).not.toContain('/expenses/mine')
    }
    expect(db.shopMember.findUnique).not.toHaveBeenCalled()
  })
})
