/**
 * TC-301 — ออเดอร์ส่งเอง + ต้นทุน X: ชีต/dashboard กับ P&L ใช้ resolveOutboundShippingCost ตัวเดียว
 * เกณฑ์ vertical ของผู้เรียกไม่เปลี่ยน: pnl นับเฉพาะร้านบริการ · ชีตนับทุกร้าน
 * (mock prisma ล้วน — ไม่แตะ DB จริง HR13 · /sales ใช้ฟังก์ชันเดียวกันใน page.tsx ซึ่งเทสผ่าน RSC ไม่ได้)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/return-adjustment.service', () => ({
  getReturnAdjustments: vi.fn(async () => new Map()),
  getReturnedQtyByProduct: async () => new Map(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: { findMany: vi.fn(), groupBy: vi.fn(async () => []) },
    expense: { findMany: vi.fn(), aggregate: vi.fn() },
    orderReturn: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { getSalesSeries } from '@/services/dashboard.service'
import { getPnlReport } from '@/services/pnl.service'
import { resolveDateRange } from '@/lib/date-range'

const findMany = vi.mocked(prisma.order.findMany)
const X = 35

// ส่งเอง: ไม่มีใบ iShip มีแต่ ShipmentTracking ที่ร้านกรอกต้นทุน
const MANUAL_ROW = {
  id: 'o1', totalAmount: 1000, createdAt: new Date(Date.UTC(2026, 2, 5, 5)), status: 'CONFIRMED',
  items: [{ cost: 200, qty: 1 }], shipments: [],
  shipmentTracking: { outboundShippingCost: X },
}

beforeEach(() => vi.clearAllMocks())

describe('ต้นทุนส่งเองเข้าทุกพื้นผิวด้วยตัวเลขเดียวกัน', () => {
  it('ชีต/dashboard: ทุกประเภทร้านนับ X', async () => {
    for (const vertical of ['ONLINE_SALES', 'SERVICE_QUEUE']) {
      findMany.mockResolvedValue([{ ...MANUAL_ROW, serviceClosedAt: new Date(Date.UTC(2026, 2, 5, 5)) }] as never)
      const res = await getSalesSeries('shop1', 'daily', { year: 2026, month: 3 }, true, vertical)
      expect(res.shippingValues?.[4], vertical).toBe(X)
    }
  })

  it('ส่งเองที่ร้านยังไม่กรอก = pending ไม่ใช่ 0 เงียบ', async () => {
    findMany.mockResolvedValue([{ ...MANUAL_ROW, shipmentTracking: { outboundShippingCost: null } }] as never)
    const res = await getSalesSeries('shop1', 'daily', { year: 2026, month: 3 }, true, 'ONLINE_SALES')
    expect(res.shippingValues?.[4]).toBe(0)
    // ป้าย "ราคาประมาณ" ต้องไม่ถูกใช้กับใบที่ยังไม่กรอก
    expect(res.pendingShipmentValues?.[4]).toBe(0)
    // ...แต่ต้องไม่เงียบ: นับแยกเป็น "ยังไม่กรอก" ให้หน้าจอติดป้าย
    expect(res.shippingMissingCount).toBe(1)
  })

  const range = resolveDateRange('custom', '2026-03-01', '2026-03-31')
  const setupPnl = () => {
    findMany.mockResolvedValueOnce([MANUAL_ROW] as never).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amount: 0 } } as never)
    vi.mocked(prisma.orderReturn.findMany).mockResolvedValue([] as never)
  }

  it('pnl: ร้านขายของไม่นับ (เกณฑ์เดิม) · ร้านบริการนับ X', async () => {
    setupPnl()
    const sale = await getPnlReport('shop1', range, 'ONLINE_SALES')
    expect(sale.shippingCost).toBe(0)
    expect(sale.shippingPendingCount).toBe(0)

    setupPnl()
    const svc = await getPnlReport('shop1', range, 'SERVICE_QUEUE')
    expect(svc.shippingCost).toBe(X)
    expect(svc.shippingPendingCount).toBe(0)
    expect(svc.shippingMissingCount).toBe(0)
  })

  it('pnl: ส่งเองยังไม่กรอก นับเป็น "ยังไม่กรอก" ไม่ใช่ "ราคาประมาณ"', async () => {
    findMany.mockResolvedValueOnce([{ ...MANUAL_ROW, shipmentTracking: { outboundShippingCost: null } }] as never).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amount: 0 } } as never)
    vi.mocked(prisma.orderReturn.findMany).mockResolvedValue([] as never)
    const r = await getPnlReport('shop1', range, 'SERVICE_QUEUE')
    expect(r.shippingMissingCount).toBe(1)
    expect(r.shippingPendingCount).toBe(0)
  })
})
