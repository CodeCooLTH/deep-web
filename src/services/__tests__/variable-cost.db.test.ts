/**
 * variable-cost.db.test.ts — 00096 P2 ต้นทุนต่อออเดอร์ที่ร้านตั้ง (BRD FR-016/017) บน DB จริง
 * พิสูจน์ว่าหน้ากำไร (getPnlReport) กับรายงานโฆษณา (getAdsProfitReport) หักตัวเลขเดียวกัน (HR16)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบ scope ด้วย id ที่เทสสร้างเท่านั้น
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'

vi.mock('server-only', () => ({}))

import { getPnlReport } from '@/services/pnl.service'
import { getAdsProfitReport } from '@/services/ads-profit.service'
import { resolveDateRange, thaiMidnightUtc } from '@/lib/date-range'
import type { SpendSource } from '@/services/meta-ads-spend.service'

const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(process.env.DATABASE_URL ?? '')
const run = randomUUID().slice(0, 8)
let userId = '', shopId = ''
const orderIds: string[] = []
const at = new Date(Date.UTC(2026, 9, 5, 5))
const noSpend: SpendSource = async () => ({ state: 'OK', accountName: 'x', currency: 'THB', tz: 'Asia/Bangkok', rows: [] })

describe.skipIf(!isLocal)('00096 P2 ต้นทุนต่อออเดอร์ (DB จริง)', () => {
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { displayName: `vc-${run}`, username: `vc_${run}` }, select: { id: true } })).id
    shopId = (await prisma.shop.create({ data: { userId, shopName: `vc-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })).id
    for (const pm of ['TRANSFER', 'COD']) {
      const o = await prisma.order.create({
        data: {
          shopId, type: 'PHYSICAL', status: 'CONFIRMED', createdAt: at, totalAmount: 1000, paymentMethod: pm,
          adId: 'VC1', adTitle: 'แอด', adClickedAt: at,
          items: { create: [{ name: 'ของ', qty: 1, price: 1000, cost: 400 }] },
        } as never,
        select: { id: true },
      })
      orderIds.push(o.id)
    }
  })
  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    await prisma.shop.deleteMany({ where: { id: shopId } })
    await prisma.user.deleteMany({ where: { id: userId } })
  })

  const range = resolveDateRange('custom', '2026-10-01', '2026-10-31')
  const setVc = (v: unknown) => prisma.shop.update({ where: { id: shopId }, data: { variableCosts: v as never } })

  it('ไม่ตั้ง = 0 · กำไรเท่าเดิม', async () => {
    await setVc(null)
    const r = await getPnlReport(shopId, range, null)
    expect(r.variableCost).toBe(0)
    expect(r.variableCostSet).toBe(false)
    expect(r.netProfit).toBe(1200)
  })

  it('ตั้งแล้ว: หน้ากำไรกับรายงานโฆษณาหักเท่ากัน (โอน 45 + COD 60)', async () => {
    await setVc({ packagingPerOrder: 10, codFeePct: 3, paymentFeePct: 1.5, commissionPct: 2 })
    const r = await getPnlReport(shopId, range, null)
    expect(r.variableCost).toBe(105)
    expect(r.variableCostSet).toBe(true)
    expect(r.netProfit).toBe(1095)
    const ads = await getAdsProfitReport(shopId, null, { from: thaiMidnightUtc(2026, 9, 1), to: thaiMidnightUtc(2026, 10, 1) }, { spendSource: noSpend, detailsSource: async () => null as never })
    expect(ads.totals.parts.realized.variable).toBe(105)
    expect(ads.totals.metrics.realized.profitBefore).toBe(1095)
  })
})
