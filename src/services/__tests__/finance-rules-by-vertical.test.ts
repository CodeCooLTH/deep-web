/**
 * [blocker] กติกาการเงินแยกตามประเภทกิจการ (มติ user 2026-10-02)
 *
 * ลูกค้าร้านขายของรายงานว่าชีตยอดขายขึ้น "กำไร 0 · ต้นทุน —" หลัง PR #97 เปลี่ยนทุก vertical
 * ให้นับแบบใหม่ ⇒ ร้านที่ไม่ใช่บริการต้องได้ตัวเลข **เท่าก่อน 00067 (commit e3a52782)** ทุกจุด
 * ส่วนร้านบริการได้กติกาใหม่ต่อ — ตัวตัดสินกลาง src/lib/finance-rules.ts
 *
 * fixture เดียวที่ทำให้สองกติกาให้ผลต่างกันชัด ๆ: บิล 1,000 ยืนยันแล้ว ต้นทุน 400
 * มีคืนบางส่วน (ยอดคืน 300 · ต้นทุนชิ้นที่คืน 100) และมีพัสดุสองใบ — ขากลับ 50 ถูกสร้างก่อนขาไป 30
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/return-adjustment.service', () => ({
  getReturnAdjustments: vi.fn(async () =>
    new Map([['o1', { refund: 300, returnedCost: 100, returnedQtyByItem: {} }]]),
  ),
  getReturnedQtyByProduct: async () => new Map(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    // groupBy = นับงานตามสถานะ (jobStatusCounts) — ร้านบริการเท่านั้นที่ยิง
    order: { findMany: vi.fn(), groupBy: vi.fn(async () => []) },
    expense: { findMany: vi.fn(), aggregate: vi.fn() },
    orderReturn: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { getReturnAdjustments } from '@/services/return-adjustment.service'
import { getSalesSeries } from '@/services/dashboard.service'
import { getPnlReport } from '@/services/pnl.service'
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import { resolveDateRange } from '@/lib/date-range'

const thaiNoon = (y: number, m1: number, d: number) => new Date(Date.UTC(y, m1 - 1, d, 5, 0, 0))
const findMany = vi.mocked(prisma.order.findMany)

const ROW = {
  id: 'o1',
  totalAmount: 1000,
  createdAt: thaiNoon(2026, 3, 5),
  status: 'CONFIRMED',
  items: [{ cost: 200, qty: 2 }],
  shipments: [
    // ใบขากลับมาก่อน — กติกาเดิมหยิบใบ CREATED ใบแรก, กติกาใหม่หยิบเฉพาะขาไป
    { status: 'CREATED', direction: 'RETURN', isDryRun: false, carrierPrice: 50, codFee: 0, createdAt: thaiNoon(2026, 3, 6) },
    { status: 'CREATED', direction: 'FORWARD', isDryRun: false, carrierPrice: 30, codFee: 0, createdAt: thaiNoon(2026, 3, 5) },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('[blocker] usesServiceFinanceRules — ตัวตัดสินเดียว', () => {
  it('เฉพาะ SERVICE_QUEUE · ค่าแปลก/ว่าง = กติกาเดิม (fail-closed ไปทางของเดิม)', () => {
    expect(usesServiceFinanceRules('SERVICE_QUEUE')).toBe(true)
    for (const v of ['ONLINE_SALES', 'LODGING', 'GENERAL', '', null, undefined]) {
      expect(usesServiceFinanceRules(v), String(v)).toBe(false)
    }
  })
})

describe('[blocker] getSalesSeries — ชีต/การ์ดยอดขายหน้าหลัก', () => {
  it('ร้านขายออนไลน์/บ้านพัก: ยอด ต้นทุน ค่าส่ง เท่าของเดิม (ไม่หักคืน · ค่าส่งใบ CREATED ใบแรก)', async () => {
    for (const vertical of ['ONLINE_SALES', 'LODGING', undefined]) {
      findMany.mockResolvedValue([ROW] as never)
      const res = await getSalesSeries('shop1', 'daily', { year: 2026, month: 3 }, true, vertical)
      expect(res.values[4], String(vertical)).toBe(1000)
      expect(res.cogsValues?.[4]).toBe(400)
      expect(res.shippingValues?.[4]).toBe(50)
      // ไม่แม้แต่ดึงยอดคืน — ของเดิมไม่มีขั้นนี้
      expect(getReturnAdjustments).not.toHaveBeenCalled()
    }
  })

  it('ร้านบริการ: หักคืนบางส่วน + ค่าส่งเฉพาะขาไป (กติกาใหม่ 00067)', async () => {
    findMany.mockResolvedValue([ROW] as never)
    const res = await getSalesSeries('shop1', 'daily', { year: 2026, month: 3 }, true, 'SERVICE_QUEUE')
    expect(res.values[4]).toBe(700)
    expect(res.cogsValues?.[4]).toBe(300)
    expect(res.shippingValues?.[4]).toBe(30)
  })
})

describe('[blocker] getPnlReport — กำไรขาดทุน', () => {
  const range = resolveDateRange('custom', '2026-03-01', '2026-03-31')
  const setup = () => {
    // ลำดับใน Promise.all: ออเดอร์ช่วงนี้ → ช่วงก่อน · ค่าใช้จ่ายช่วงนี้ → ช่วงก่อน · ใบคืนช่วงนี้ → ช่วงก่อน
    const pnlRow = { id: 'o1', totalAmount: 1000, items: [{ cost: 200, qty: 2 }], shipments: [{ carrierPrice: 30, estimatedPrice: null, codFee: 0 }] }
    findMany.mockResolvedValueOnce([pnlRow] as never).mockResolvedValueOnce([] as never)
    vi.mocked(prisma.expense.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: 100 } } as never)
      .mockResolvedValueOnce({ _sum: { amount: 0 } } as never)
    vi.mocked(prisma.orderReturn.findMany).mockResolvedValue([] as never)
  }

  it('ร้านขายออนไลน์/บ้านพัก: ค่าใช้จ่าย = ที่บันทึกเอง (ไม่รวมค่าส่ง) · ไม่หักคืน — ของเดิม', async () => {
    for (const vertical of ['ONLINE_SALES', 'LODGING']) {
      setup()
      const r = await getPnlReport('shop1', range, vertical)
      expect(r.revenue, vertical).toBe(1000)
      expect(r.cogs).toBe(400)
      expect(r.totalExpense).toBe(100)
      expect(r.netProfit).toBe(500)
      // แถว/ป้ายค่าส่งบนหน้า /expenses อ่านจากสองตัวนี้ — ต้องเป็น 0 ไม่งั้นแถวใหม่โผล่
      expect(r.shippingCost).toBe(0)
      expect(r.shippingPendingCount).toBe(0)
    }
  })

  it('ร้านบริการ: ค่าส่งขาไปเป็นค่าใช้จ่าย + หักคืนบางส่วน (กติกาใหม่)', async () => {
    setup()
    const r = await getPnlReport('shop1', range, 'SERVICE_QUEUE')
    expect(r.revenue).toBe(700)
    expect(r.cogs).toBe(300)
    expect(r.totalExpense).toBe(130)
    expect(r.netProfit).toBe(270)
    expect(r.shippingCost).toBe(30)
  })
})
