import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    shipmentPickup: { count: vi.fn(), findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { listShopPickups, PICKUP_PAGE_SIZE } from '@/services/pickup-list.service'

const p = prisma as unknown as {
  shipmentPickup: { count: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
  user: { findMany: ReturnType<typeof vi.fn> }
}

const row = (o: object) => ({
  id: 'p1', provider: 'FLASH', courierCode: 'FLASH', ticketPickupId: 'T-first', currentTicketPickupId: 'T-now',
  parcelCount: 3, status: 'ACCEPTED', staffName: 'ก', staffPhone: '081', timeoutAtText: null, isDryRun: false,
  lastErrorMessage: null, createdByUserId: 'u1', createdAt: new Date('2026-10-29T08:00:00Z'), ...o,
})

beforeEach(() => {
  vi.clearAllMocks()
  p.shipmentPickup.count.mockResolvedValue(41)
  p.shipmentPickup.findMany.mockResolvedValue([row({}), row({ id: 'p2', currentTicketPickupId: null, createdByUserId: 'gone' })])
  p.user.findMany.mockResolvedValue([{ id: 'u1', displayName: 'เจ้าของ' }])
})

describe('listShopPickups (00087)', () => {
  it('ผูก shopId เสมอ · active = REQUESTED+ACCEPTED · หน้า 3 ข้าม 40', async () => {
    const r = await listShopPickups('shop-A', { filter: 'active', page: 3 })
    const arg = p.shipmentPickup.findMany.mock.calls[0][0]
    expect(arg.where).toEqual({ shopId: 'shop-A', status: { in: ['REQUESTED', 'ACCEPTED'] } })
    expect(arg.skip).toBe(2 * PICKUP_PAGE_SIZE)
    expect(p.shipmentPickup.count).toHaveBeenCalledWith({ where: arg.where })
    expect(r.total).toBe(41)
  })

  it('all = ไม่กรองสถานะ · page ผิดรูปเป็นหน้า 1', async () => {
    await listShopPickups('shop-A', { filter: 'all', page: NaN })
    const arg = p.shipmentPickup.findMany.mock.calls[0][0]
    expect(arg.where).toEqual({ shopId: 'shop-A' })
    expect(arg.skip).toBe(0)
  })

  it('เลขคำขอใช้รหัสปัจจุบันก่อน · ชื่อผู้เรียกหาไม่เจอ = null · ไม่ส่ง userId ออกไป', async () => {
    const { rows } = await listShopPickups('shop-A', { filter: 'all', page: 1 })
    expect(rows[0]).toMatchObject({ ticketId: 'T-now', createdByName: 'เจ้าของ' })
    expect(rows[1]).toMatchObject({ ticketId: 'T-first', createdByName: null })
    expect(rows[0]).not.toHaveProperty('createdByUserId')
  })
})
