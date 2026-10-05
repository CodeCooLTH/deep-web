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
import { round2 } from '@/lib/round2'
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
    await prisma.orderReturn.deleteMany({ where: { orderId: { in: ids.orders } } })
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

  // AC-EXT-09-2: trend รวมต่อวัน = Σ ร้าน OK ของ getSalesSeries ตรง ๆ (ต่อ vertical × วันนี้/เมื่อวาน/คร่อมเดือน)
  for (const [label, , endIso] of [...windows, ['คร่อมเดือน (7 วันจบ 02 ก.ย.)', '', '2026-09-02'] as [string, string, string]]) {
    it(`trend 7 วัน · ${label}: รวม 3 vertical = getSalesSeries ตรง ๆ ทีละวัน`, async () => {
      const shops = VERTICALS.map((v) => ({ id: shopOf[v], name: v, vertical: v as string }))
      const sum = await buildGroupSummary({
        shops, excluded: [], flags: { ...flags, showProfit: false, showTopProducts: false }, needs: { needTrend7: true },
        cache: createSweepCache(), window: { startIso: endIso, endIso, computedAt: new Date().toISOString() },
      })
      const dates = datesIn(shiftIsoDate(endIso, -6), endIso)
      const want = { dates, confirmed: [] as number[], orders: [] as number[] }
      for (const d of dates) {
        let c = 0, o = 0
        for (const v of VERTICALS) {
          const r = await direct(shopOf[v], v, [d])
          c += r.confirmed
          o += r.orders
        }
        want.confirmed.push(c)
        want.orders.push(o)
      }
      expect(sum.trend).toEqual(want)
      expect(want.orders.some((n) => n > 0)).toBe(true)
      // ตัวเลขกราฟ = ตัวเลขบล็อกรายร้านโดยโครงสร้าง: วันสุดท้ายของ trend รายร้าน = ยอดวัน endIso ของร้านนั้น
      for (const s of sum.shops) expect(s.trend!.confirmed.at(-1)).toBe((await direct(s.shop.id, s.shop.vertical!, [endIso])).confirmed)
    })
  }

  // AC-EXP-01-2: round2(netSales + expense) === confirmed ต่อร้าน ต่อหน้าต่าง (ผ่านเส้นทางจริง ไม่ mock)
  for (const v of VERTICALS) {
    for (const [label, startIso, endIso] of windows) {
      it(`EXP ${v} · ${label}: round2(netSales+expense) = ยอดขายนับแล้ว`, async () => {
        const shop = { id: shopOf[v], name: v, vertical: v }
        const sum = await buildGroupSummary({
          shops: [shop], excluded: [], flags: { ...flags, showProfit: false, showTopProducts: false }, needs: { needExpense: true },
          cache: createSweepCache(), window: { startIso, endIso, computedAt: new Date().toISOString() },
        })
        const g = sum.shops[0]
        expect(g.profit).toBeUndefined()
        expect(g.confirmed).toBeGreaterThan(0)
        expect(round2(g.finance!.netSales + g.finance!.expense)).toBe(round2(g.confirmed))
      })
    }
  }

  it('EXP: ร้านบริการมีใบคืนบางส่วน (RECEIVED) + ใบ RETURNED + ค่าใช้จ่ายที่บันทึก -> ยังต่าง 0 และ expenseRecorded ตามแถวจริง', async () => {
    const mkShop = async (v: string) => {
      const s = await prisma.shop.create({ data: { userId: ids.user, shopName: `par-${run}-exp-${v}`, vertical: v, kind: 'BUSINESS' }, select: { id: true } })
      ids.shops.push(s.id)
      return s.id
    }
    for (const v of ['SERVICE_QUEUE', 'ONLINE_SALES']) {
      const id = await mkShop(v)
      const orderIds: string[] = []
      for (const [i, st] of (['CONFIRMED', 'RETURNED'] as const).entries()) {
        const o = await prisma.order.create({
          data: { publicToken: `par-${run}-exp-${v}-${i}`, shopId: id, totalAmount: 300, status: st, createdAt: at('2026-09-02', 12, 0), items: { create: [{ name: 'a', qty: 2, price: 100, cost: 40 }, { name: 'b', qty: 1, price: 100, cost: null }] } },
          select: { id: true, items: { select: { id: true } } },
        })
        ids.orders.push(o.id)
        orderIds.push(o.id)
        if (i === 0) {
          await prisma.orderReturn.create({
            data: { orderId: o.id, shopId: id, status: 'RECEIVED', refundAmount: 100, receivedAt: at('2026-09-03', 12, 0), items: { create: [{ orderItemId: o.items[0].id, qty: 1, unitPrice: 100 }] } },
          })
        }
      }
      const win = { startIso: '2026-08-31', endIso: '2026-09-03', computedAt: new Date().toISOString() }
      const go = () => buildGroupSummary({ shops: [{ id, name: v, vertical: v }], excluded: [], flags: { ...flags, showProfit: false, showTopProducts: false }, needs: { needExpense: true }, cache: createSweepCache(), window: win })
      const a = (await go()).shops[0]
      expect(a.finance!.expenseRecorded).toBe(false)
      expect(round2(a.finance!.netSales + a.finance!.expense)).toBe(round2(a.confirmed))
      const ex = await prisma.expense.create({ data: { shopId: id, category: 'OTHER', amount: 45.5, expenseDate: new Date(Date.UTC(2026, 8, 2)), createdByUserId: ids.user }, select: { id: true } })
      ids.expenses.push(ex.id)
      const b = (await go()).shops[0]
      expect(b.finance!.expenseRecorded).toBe(true)
      expect(round2(b.finance!.netSales + b.finance!.expense)).toBe(round2(b.confirmed))
      expect(b.finance!.expense).toBeGreaterThanOrEqual(45.5)
    }
  })

  // §17: Σ รายการย่อย = totalExpense ต่อร้าน (แดง = แหล่งข้อมูลไม่ตรง หยุดรายงาน) · ไม่มีโน้ตหลุดมา
  it('ITEMS: Σ รายการย่อย = expense ต่อร้าน (บริการมีค่าส่ง+ใบคืน+หลายหมวด) และไม่มีโน้ต', async () => {
    for (const v of ['SERVICE_QUEUE', 'ONLINE_SALES']) {
      const s = await prisma.shop.create({ data: { userId: ids.user, shopName: `par-${run}-itm-${v}`, vertical: v, kind: 'BUSINESS' }, select: { id: true } })
      ids.shops.push(s.id)
      for (const [i, st] of (['CONFIRMED', 'RETURNED'] as const).entries()) {
        const o = await prisma.order.create({
          data: { publicToken: `par-${run}-itm-${v}-${i}`, shopId: s.id, totalAmount: 300, status: st, createdAt: at('2026-09-02', 12, 0), items: { create: [{ name: 'a', qty: 2, price: 100, cost: 40 }] } },
          select: { id: true, items: { select: { id: true } } },
        })
        ids.orders.push(o.id)
        await prisma.orderReturn.create({
          data: { orderId: o.id, shopId: s.id, status: 'RECEIVED', refundAmount: 100, shippingCost: 20, receivedAt: at('2026-09-03', 12, 0), items: { create: [{ orderItemId: o.items[0].id, qty: 1, unitPrice: 100 }] } },
        })
      }
      for (const [category, amount, note] of [['RENT', 1000.1, 'โน้ตลับ-RENT'], ['RENT', 200.2, 'โน้ตลับ-RENT2'], ['ADVERTISING', 55.55, 'โน้ตลับ-ADS'], ['OTHER', 7, null]] as const) {
        const ex = await prisma.expense.create({ data: { shopId: s.id, category, amount, note, expenseDate: new Date(Date.UTC(2026, 8, 2)), createdByUserId: ids.user }, select: { id: true } })
        ids.expenses.push(ex.id)
      }
      const sum = await buildGroupSummary({
        shops: [{ id: s.id, name: v, vertical: v }], excluded: [], flags: { ...flags, showProfit: false, showTopProducts: false },
        needs: { needExpense: true, needExpenseItems: true }, cache: createSweepCache(),
        window: { startIso: '2026-08-31', endIso: '2026-09-03', computedAt: new Date().toISOString() },
      })
      const f = sum.shops[0].finance!
      const items = f.items!
      expect(round2(items.reduce((a, i) => a + i.amount, 0))).toBe(f.expense)
      expect(items.find((i) => i.key === 'RENT')!.amount).toBe(1200.3)
      expect(items.map((i) => i.amount)).toEqual([...items.map((i) => i.amount)].sort((a, b) => b - a))
      expect(items.some((i) => i.key === 'SYS_RETURN_SHIPPING')).toBe(true)
      expect(JSON.stringify(sum)).not.toContain('โน้ตลับ')
    }
  })

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
