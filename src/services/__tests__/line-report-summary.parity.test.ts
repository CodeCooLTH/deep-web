/**
 * line-report-summary.parity.test.ts — integration parity (00070 · AC-LGS-14-3/14-4/14-5)
 *
 * ตัวเลขใน buildGroupSummary ต้อง "ต่าง 0" จาก SSOT ที่เรียกตรง (getSalesSeries / getPnlReport /
 * jobStatusCounts.cancelled) ทั้ง 3 vertical × (วันนี้ · เมื่อวาน · รอบคร่อมเดือน)
 *
 * ฝั่ง "เรียกตรง" รวมวันด้วย index ตรง ๆ ทีละวัน (ไม่เรียก sumDays) — ไม่งั้นเทสวนอ้างตัวเอง
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ข้อมูลทุกแถวสร้างด้วย id ของรอบนี้ ลบ scope ด้วย id
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)

import { prisma } from '@/lib/prisma'
import { getSalesSeries } from '@/services/dashboard.service'
import { getPnlReport } from '@/services/pnl.service'
import { buildGroupSummary, createSweepCache } from '@/services/line-report-summary.service'
import { countCancelledOrders } from '@/services/cancelled-order-count.service'
import { resolveDateRange, shiftIsoDate, thaiMidnightUtc, todayThaiIsoDate } from '@/lib/date-range'

const run = randomUUID().slice(0, 8)
const ids = { user: '', shops: [] as string[], orders: [] as string[], expenses: [] as string[] }
const VERTICALS = ['ONLINE_SALES', 'SERVICE_QUEUE', 'LODGING'] as const

const ymd = (iso: string) => iso.split('-').map(Number) as [number, number, number]
const at = (iso: string, h: number, m: number) => {
  const [y, mo, d] = ymd(iso)
  return new Date(thaiMidnightUtc(y, mo - 1, d).getTime() + (h * 60 + m) * 60_000)
}
const datesIn = (a: string, b: string) => {
  const out: string[] = []
  for (let d = a; d <= b; d = shiftIsoDate(d, 1)) out.push(d)
  return out
}

/** ยอดของวันเดียวจาก getSalesSeries เรียกตรง ๆ (index วัน−1 ของเดือนของวันนั้น) */
async function direct(shopId: string, vertical: string, dates: string[]) {
  const t = { orders: 0, confirmed: 0, unconfirmed: 0 }
  for (const d of dates) {
    const [y, m, day] = ymd(d)
    const s = await getSalesSeries(shopId, 'daily', { year: y, month: m }, false, vertical)
    t.orders += s.orderCounts[day - 1]
    t.confirmed += s.confirmedValues[day - 1]
    t.unconfirmed += s.unconfirmedValues[day - 1]
  }
  return t
}

const TODAY = todayThaiIsoDate()
const YESTERDAY = shiftIsoDate(TODAY, -1)
const CYCLE = { startIso: '2026-08-25', endIso: '2026-09-05' }
const STATUSES = ['CONFIRMED', 'PENDING', 'DRAFTED', 'CANCELLED', 'RETURNED', 'CONFIRMED'] as const

describe.skipIf(!isLocal)('00070 parity: buildGroupSummary vs SSOT', () => {
  const shopOf: Record<string, string> = {}
  // จำนวนใบ CANCELLED ที่ตั้งใจสร้างต่อร้านในแต่ละวัน (ไว้ตรวจนับยกเลิกแบบไม่อ้างสูตรของ service)
  const cancelledOn = new Map<string, number>()

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `par-${run}`, username: `par_${run}` }, select: { id: true } })
    ids.user = u.id
    for (const v of VERTICALS) {
      const s = await prisma.shop.create({ data: { userId: u.id, shopName: `par-${run}-${v}`, vertical: v, kind: 'BUSINESS' }, select: { id: true } })
      shopOf[v] = s.id
      ids.shops.push(s.id)
    }
    // เวลาที่เล็งขอบเที่ยงคืนไทย: 00:10 วันนี้ / 23:50 เมื่อวาน / 23:50 สิ้นเดือน ส.ค. / 00:10 ต้น ก.ย.
    const slots: [string, number, number][] = [
      [TODAY, 0, 10], [TODAY, 12, 0], [YESTERDAY, 23, 50], [YESTERDAY, 12, 0],
      ['2026-08-24', 23, 50], ['2026-08-25', 0, 10], ['2026-08-31', 23, 50], ['2026-09-01', 0, 10],
      ['2026-09-02', 12, 0], ['2026-09-05', 23, 50], ['2026-09-06', 0, 10],
    ]
    let seq = 0
    for (const v of VERTICALS) {
      for (const [iso, h, m] of slots) {
        for (const status of STATUSES) {
          seq++
          const o = await prisma.order.create({
            data: {
              publicToken: `par-${run}-${seq}`,
              shopId: shopOf[v],
              totalAmount: 100 + seq,
              status,
              createdAt: at(iso, h, m),
              // ใบ CANCELLED ที่ "เปิดเมื่อวาน ยกเลิกวันนี้" — updatedAt วันนี้ ต้องไม่ถูกนับในวันนี้
              updatedAt: at(TODAY, 12, 0),
              items: { create: [{ name: `สินค้า ${seq}`, qty: 1 + (seq % 3), price: 100 + seq, cost: seq % 2 ? 40 : null }] },
            },
            select: { id: true },
          })
          ids.orders.push(o.id)
          if (status === 'CANCELLED') cancelledOn.set(`${v}:${iso}`, (cancelledOn.get(`${v}:${iso}`) ?? 0) + 1)
        }
      }
      const ex = await prisma.expense.create({
        data: { shopId: shopOf[v], category: 'OTHER', amount: 30, expenseDate: new Date(Date.UTC(2026, 8, 2)), createdByUserId: u.id },
        select: { id: true },
      })
      ids.expenses.push(ex.id)
    }
  }, 120_000)

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.order.deleteMany({ where: { id: { in: ids.orders } } })
    await prisma.expense.deleteMany({ where: { id: { in: ids.expenses } } })
    await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } })
    await prisma.$disconnect()
  })

  const windows: [string, string, string][] = [
    ['วันนี้', TODAY, TODAY],
    ['เมื่อวาน', YESTERDAY, YESTERDAY],
    ['รอบคร่อมเดือน', CYCLE.startIso, CYCLE.endIso],
  ]
  const flags = { showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: true }

  for (const v of VERTICALS) {
    for (const [label, startIso, endIso] of windows) {
      it(`${v} · ${label}: orders/ยอดขาย/ยังไม่นับ/ยกเลิก/กำไร ต่าง 0`, async () => {
        const shop = { id: shopOf[v], name: v, vertical: v }
        const sum = await buildGroupSummary({
          shops: [shop], excluded: [], flags, cache: createSweepCache(),
          window: { startIso, endIso, computedAt: new Date().toISOString() },
        })
        const got = sum.shops[0]
        expect(got.state).toBe('OK')
        if (process.env.PARITY_LOG) console.log(`[parity] ${v} ${label}`, JSON.stringify({ o: got.orders, c: got.confirmed, u: got.unconfirmed, x: got.cancelled, p: got.profit }))
        const want = await direct(shop.id, v, datesIn(startIso, endIso))
        expect({ orders: got.orders, confirmed: got.confirmed, unconfirmed: got.unconfirmed }).toEqual(want)
        // ฟิกซ์เจอร์ต้องไม่ว่าง ไม่งั้น parity เขียวแบบว่างเปล่า
        expect(want.orders).toBeGreaterThan(0)

        // ยกเลิก: นับจากฟิกซ์เจอร์ตรง ๆ (แกน createdAt ไม่ใช่ updatedAt · ไม่นับ DRAFTED/RETURNED)
        const expectCancelled = datesIn(startIso, endIso).reduce((n, d) => n + (cancelledOn.get(`${v}:${d}`) ?? 0), 0)
        expect(got.cancelled).toBe(expectCancelled)

        // AC-14-4: กำไร = getPnlReport ช่วงเดียวกัน · pnl.revenue = ยอดขายนับแล้วของร้านเดียวกัน
        const pnl = await getPnlReport(shop.id, resolveDateRange('custom', startIso, endIso), v)
        expect(got.profit?.netProfit).toBe(pnl.netProfit)
        expect(pnl.revenue).toBe(got.confirmed)
      })
    }
  }

  it('capped: ไม่มีค่าใช้จ่ายในช่วง = true · มีแถว Expense (02 ก.ย.) = false เมื่อต้นทุนครบ', async () => {
    // ONLINE_SALES + ช่วงที่มีใบ CONFIRMED ทุกใบต้นทุนครบ ไม่ได้ — ฟิกซ์เจอร์มี cost null สลับ จึงสร้างร้านแยกที่ต้นทุนครบ
    const s = await prisma.shop.create({ data: { userId: ids.user, shopName: `par-${run}-capped`, vertical: 'ONLINE_SALES', kind: 'BUSINESS' }, select: { id: true } })
    ids.shops.push(s.id)
    const o = await prisma.order.create({
      data: { publicToken: `par-${run}-cap`, shopId: s.id, totalAmount: 100, status: 'CONFIRMED', createdAt: at('2026-09-02', 12, 0), items: { create: [{ name: 'x', qty: 1, price: 100, cost: 40 }] } },
      select: { id: true },
    })
    ids.orders.push(o.id)
    const shop = { id: s.id, name: 'c', vertical: 'ONLINE_SALES' }
    const run1 = (startIso: string, endIso: string) =>
      buildGroupSummary({ shops: [shop], excluded: [], flags: { ...flags, showTopProducts: false }, cache: createSweepCache(), window: { startIso, endIso, computedAt: new Date().toISOString() } })
    expect((await run1('2026-09-02', '2026-09-02')).shops[0].profit?.capped).toBe(true) // ยังไม่มีค่าใช้จ่าย
    const ex = await prisma.expense.create({ data: { shopId: s.id, category: 'OTHER', amount: 30, expenseDate: new Date(Date.UTC(2026, 8, 2)), createdByUserId: ids.user }, select: { id: true } })
    ids.expenses.push(ex.id)
    const got = (await run1('2026-09-02', '2026-09-02')).shops[0].profit
    expect(got?.capped).toBe(false)
    const pnl = await getPnlReport(s.id, resolveDateRange('custom', '2026-09-02', '2026-09-02'), 'ONLINE_SALES')
    expect(got?.netProfit).toBe(pnl.netProfit)
  })

  it('AC-14-5: ร้าน SERVICE_QUEUE ทั้งเดือน = jobStatusCounts.cancelled · ใบเปิดเมื่อวานยกเลิกวันนี้ไม่นับวันนี้', async () => {
    const id = shopOf.SERVICE_QUEUE
    for (const [y, m] of [[2026, 9], [2026, 8]] as const) {
      const s = await getSalesSeries(id, 'daily', { year: y, month: m }, false, 'SERVICE_QUEUE')
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
      const pad = (n: number) => String(n).padStart(2, '0')
      const n = await countCancelledOrders(id, `${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(last)}`)
      expect(n).toBe(s.jobStatusCounts?.cancelled)
      expect(n).toBeGreaterThan(0)
    }
    // ใบ CANCELLED ที่เปิดเมื่อวาน (updatedAt วันนี้): วันนี้นับเฉพาะที่เปิดวันนี้
    expect(await countCancelledOrders(id, TODAY, TODAY)).toBe(cancelledOn.get(`SERVICE_QUEUE:${TODAY}`) ?? 0)
    expect(await countCancelledOrders(id, YESTERDAY, YESTERDAY)).toBe(cancelledOn.get(`SERVICE_QUEUE:${YESTERDAY}`) ?? 0)
  })
})
