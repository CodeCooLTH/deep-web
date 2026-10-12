/**
 * [blocker] feature 00073 เฟส B — กราฟการเงิน 3 แท็บ (ฐานจริง localhost)
 * ผลรวมทั้งช่วงของกราฟต้องเท่าแท็บกำไรขาดทุน (getPnlReport) เป๊ะ — ตัวเลขเดียวกันห้ามมีสองค่า (HR16)
 * ล้างเฉพาะของที่เทสสร้าง (Hard Rule 13)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteTestData, prisma } from '../setup'
import { closeServiceJob } from '@/services/service-job.service'
import { getFinanceChartData, getAdvanceDeposits, rangeLabelOf, shiftAnchor, clampAnchor } from '@/services/finance-chart.service'
import { getPnlReport } from '@/services/pnl.service'
import { resolveDateRange, TZ_OFFSET_MS } from '@/lib/date-range'

let userIds: string[] = []
let shopIds: string[] = []
const tag = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
beforeEach(() => { userIds = []; shopIds = [] })
afterEach(async () => { await deleteTestData({ userIds, shopIds }) })

async function seed() {
  const owner = await prisma.user.create({ data: { displayName: 'เจ้าของร้านล้างแอร์', username: `fc_owner_${tag()}`, isShop: true } })
  userIds.push(owner.id)
  const shop = await prisma.shop.create({ data: { userId: owner.id, shopName: 'ร้านล้างแอร์กราฟ', businessType: 'INDIVIDUAL', vertical: 'SERVICE_QUEUE' } })
  shopIds.push(shop.id)
  const resource = await prisma.serviceResource.create({ data: { shopId: shop.id, name: 'ช่างบี' } })
  return { owner, shop, resource }
}
const HOUR = 3600_000
/**
 * ที่นั่งไม่ซ้ำต่องาน — ทุกงานในไฟล์นี้เริ่มเวลาเดียวกัน (2 ชม. ก่อน) บนคิวเดียวกัน
 * ⇒ ที่นั่งเดียวกันชน EXCLUDE "Order_service_seat_no_overlap" (CI ล้ม 23P01 · 2026-10-12)
 * ขยับเวลาไม่ได้เพราะเทสตรวจยอดรายวัน — ใช้คนละที่นั่งแทน (ความจุบังคับที่ service ไม่ใช่ DB)
 */
let seatSeq = 0
async function job(ctx: Awaited<ReturnType<typeof seed>>, total: number, cost: number | null, opts: { deposit?: number } = {}) {
  const start = new Date(Date.now() - 2 * HOUR)
  const o = await prisma.order.create({
    data: {
      shopId: ctx.shop.id, type: 'SERVICE', fulfillmentMode: 'NO_SHIPPING', status: 'PENDING', totalAmount: total,
      serviceResourceId: ctx.resource.id, serviceSeat: ++seatSeq, serviceStart: start, serviceEnd: new Date(start.getTime() + HOUR),
      appointmentStatus: 'SCHEDULED',
      items: { create: [{ name: 'ล้างแอร์ (ค่าบริการ)', qty: 1, price: total, cost }] },
    },
  })
  if (opts.deposit) {
    await prisma.orderPayment.create({ data: { orderId: o.id, shopId: ctx.shop.id, kind: 'DEPOSIT', amount: opts.deposit, method: 'CASH', receivedByUserId: ctx.owner.id } })
  }
  return o
}
const thaiToday = () => { const t = new Date(Date.now() + TZ_OFFSET_MS); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() } }

describe('getFinanceChartData — ตรงกับแท็บกำไรขาดทุน', () => {
  it('[blocker] เดือนนี้ (รายวัน): ยอดขาย · ต้นทุน · ค่าใช้จ่าย รวมเท่า getPnlReport · รับแล้ว+ค้างรับ = ยอดขาย', async () => {
    const ctx = await seed()
    const a = await job(ctx, 1200, 300)
    const b = await job(ctx, 800, null, { deposit: 200 })
    await job(ctx, 999, 100) // ยังไม่ปิด — ไม่ใช่ยอดขาย
    await closeServiceJob({ shopId: ctx.shop.id, orderToken: a.publicToken, actorUserId: ctx.owner.id, outcome: 'SERVED', payment: { amount: 1200, method: 'CASH' } })
    await closeServiceJob({ shopId: ctx.shop.id, orderToken: b.publicToken, actorUserId: ctx.owner.id, outcome: 'SERVED' })
    const { y, m, d } = thaiToday()
    await prisma.expense.create({ data: { shopId: ctx.shop.id, category: 'RENT', amount: 500, expenseDate: new Date(Date.UTC(y, m - 1, d)), createdByUserId: ctx.owner.id } })

    const chart = await getFinanceChartData(ctx.shop.id, 'SERVICE_QUEUE', 'MONTH', { year: y, month: m })
    const iso = (dd: number) => `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const pnl = await getPnlReport(ctx.shop.id, resolveDateRange('custom', iso(1), iso(last)), 'SERVICE_QUEUE')

    expect(chart.totals.sales).toBe(2000)
    expect(chart.totals.sales).toBe(pnl.revenue)
    expect(chart.totals.cost).toBe(pnl.cogs)
    expect(chart.totals.expense).toBe(pnl.totalExpense)
    expect(chart.totals.jobs).toBe(pnl.orderCount)
    expect(chart.totals.received).toBe(1400)
    expect(chart.totals.outstanding).toBe(600)
    expect(chart.totals.received + chart.totals.outstanding).toBe(chart.totals.sales)
    expect(chart.hasMissingCost).toBe(true)
    expect(chart.buckets).toHaveLength(last)
    expect(chart.buckets[d - 1].expense).toBe(500)
  })

  it('6 เดือน (รายเดือน): 6 ช่อง · เดือนสุดท้าย = เดือนนี้ · รวมเท่ารายวันของเดือนนี้', async () => {
    const ctx = await seed()
    const a = await job(ctx, 1500, 400)
    await closeServiceJob({ shopId: ctx.shop.id, orderToken: a.publicToken, actorUserId: ctx.owner.id, outcome: 'SERVED', payment: { amount: 1500, method: 'CASH' } })
    const { y, m } = thaiToday()
    const six = await getFinanceChartData(ctx.shop.id, 'SERVICE_QUEUE', 'M6', { year: y, month: m })
    expect(six.buckets).toHaveLength(6)
    expect(six.buckets[5].sales).toBe(1500)
    expect(six.totals.sales).toBe(1500)
    expect(six.isCurrent).toBe(true)
    const year = await getFinanceChartData(ctx.shop.id, 'SERVICE_QUEUE', 'YEAR', { year: y })
    expect(year.buckets).toHaveLength(12)
    expect(year.buckets[m - 1].sales).toBe(1500)
  })

  it('มัดจำรับล่วงหน้า = เงินของงานที่ยังไม่ปิด (ไม่ปนยอดขาย)', async () => {
    const ctx = await seed()
    await job(ctx, 1000, null, { deposit: 300 })
    const closed = await job(ctx, 1000, null, { deposit: 400 })
    await closeServiceJob({ shopId: ctx.shop.id, orderToken: closed.publicToken, actorUserId: ctx.owner.id, outcome: 'SERVED' })
    expect(await getAdvanceDeposits(ctx.shop.id)).toEqual({ amount: 300, jobs: 1 })
  })
})

describe('ช่วงเวลา (pure)', () => {
  it('ป้ายช่วง + เลื่อนช่วง + ไม่ให้เลยเดือนปัจจุบัน', () => {
    expect(rangeLabelOf('MONTH', { year: 2026, month: 10 })).toBe('ต.ค. 2569')
    expect(rangeLabelOf('M3', { year: 2026, month: 10 })).toBe('ส.ค.–ต.ค. 2569')
    expect(rangeLabelOf('M3', { year: 2026, month: 1 })).toBe('พ.ย. 2568–ม.ค. 2569')
    expect(rangeLabelOf('YEAR', { year: 2026, month: 12 })).toBe('ปี 2569')
    expect(shiftAnchor('M6', { year: 2026, month: 3 }, -1)).toEqual({ year: 2025, month: 9 })
    expect(shiftAnchor('MONTH', { year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    const now = new Date(Date.UTC(2026, 9, 11))
    expect(clampAnchor({ year: 2027, month: 5 }, now)).toEqual({ year: 2026, month: 10 })
  })
})
