/**
 * line-report-detail.parity.test.ts — parity ฐานจริงของ snapshot หน้า "สรุปรายละเอียด" (00070 EXT-LINK AC-LINK-04-2 / 07-2)
 *
 * ค่าอ้างอิงเขียนมือจากฟิกซ์เจอร์ (ไม่เรียกสูตรของ service) — กันเทสวนอ้างตัวเอง
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ทุกแถวสร้างด้วย id ของรอบนี้ ลบ scope ด้วย id
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)

import { prisma } from '@/lib/prisma'
import { round2 } from '@/lib/round2'
import { thaiMidnightUtc } from '@/lib/date-range'
import { combineTotals } from '@/lib/line-report/aggregate'
import { buildGroupSummary, createSweepCache } from '@/services/line-report-summary.service'
import { buildDetailSnapshot } from '@/services/line-report-detail.service'
import { salesTotal } from '@/lib/line/flex-report-blocks'
import type { Block, TemplateV1 } from '@/lib/line-report/template'
import type { Window } from '@/lib/line-report/types'

const run = randomUUID().slice(0, 8)
const ids = { user: '', shops: [] as string[], orders: [] as string[], expenses: [] as string[] }

const W: Window = { startIso: '2026-09-10', endIso: '2026-09-11', computedAt: '2026-09-12T03:00:00.000Z' }
/** เวลาไทย: วันที่ + ms จากเที่ยงคืนไทย (ขอบ 23:59:59 / 00:00:00) */
const th = (iso: string, h = 0, m = 0, s = 0) => {
  const [y, mo, d] = iso.split('-').map(Number)
  return new Date(thaiMidnightUtc(y, mo - 1, d).getTime() + ((h * 60 + m) * 60 + s) * 1000)
}
const tpl = (types: Block['type'][]): TemplateV1 => ({
  v: 1,
  button: { show: true, label: 'เปิด Deep' },
  blocks: types.map((type, i) => ({ id: `b${i}`, type }) as Block),
})
const FULL = tpl(['orders', 'sales', 'cancelled', 'expense'])
const flags = { showOrders: true, showSales: true, showCancelled: true, showTopProducts: false, showProfit: false }
const needs = { needExpense: true, needExpenseItems: true }

type Spec = {
  amount: number
  status: string
  at: Date
  closed?: Date
  shipments?: { direction: string; carrierStatus: string; carrierPrice?: number }[]
  ret?: boolean
}
const SERVICE: Spec[] = [
  { amount: 100, status: 'CONFIRMED', at: th('2026-09-10', 10), closed: th('2026-09-10', 12), shipments: [{ direction: 'FORWARD', carrierStatus: 'delivered', carrierPrice: 45 }] },
  { amount: 200, status: 'PENDING', at: th('2026-09-10', 11) },
  { amount: 300, status: 'RETURNED', at: th('2026-09-11', 9), closed: th('2026-09-11', 15), ret: true },
  { amount: 400, status: 'RETURNED', at: th('2026-09-11', 10) },
  { amount: 500, status: 'CANCELLED', at: th('2026-09-10', 9) },
  { amount: 600, status: 'DRAFTED', at: th('2026-09-10', 9) },
  { amount: 700, status: 'CONFIRMED', at: th('2026-09-10', 12), closed: th('2026-09-20', 10) }, // ปิดคนละวัน
  { amount: 800, status: 'CONFIRMED', at: th('2026-09-09', 23, 59, 59), closed: th('2026-09-10', 10) }, // เปิดก่อนช่วง ปิดในช่วง = ไม่นับ
  { amount: 900, status: 'PENDING', at: th('2026-09-11', 23, 59, 59) },
  { amount: 1000, status: 'PENDING', at: th('2026-09-12', 0, 0, 0) },
  { amount: 1100, status: 'PENDING', at: th('2026-09-10', 0, 0, 0) },
]
const GENERAL: Spec[] = [
  { amount: 100, status: 'CONFIRMED', at: th('2026-09-10', 10) },
  { amount: 200, status: 'PENDING', at: th('2026-09-10', 11) },
  { amount: 300, status: 'SHIPPED', at: th('2026-09-10', 12), shipments: [{ direction: 'FORWARD', carrierStatus: 'delivered' }] },
  { amount: 400, status: 'SHIPPED', at: th('2026-09-10', 13) },
  { amount: 500, status: 'SHIPPED', at: th('2026-09-10', 14), shipments: [{ direction: 'RETURN', carrierStatus: 'delivered' }] },
  { amount: 600, status: 'RETURNED', at: th('2026-09-10', 15) },
  { amount: 700, status: 'CONFIRMED', at: th('2026-09-11', 23, 59, 59) },
  { amount: 800, status: 'CONFIRMED', at: th('2026-09-12', 0, 0, 0) },
  { amount: 900, status: 'CONFIRMED', at: th('2026-09-10', 0, 0, 0) },
  { amount: 1000, status: 'CANCELLED', at: th('2026-09-10', 9) },
  { amount: 1100, status: 'DRAFTED', at: th('2026-09-10', 9) },
]
const LODGING: Spec[] = [
  { amount: 100, status: 'CONFIRMED', at: th('2026-09-10', 10) },
  { amount: 200, status: 'PENDING', at: th('2026-09-11', 10) },
  { amount: 300, status: 'CANCELLED', at: th('2026-09-11', 11) },
]

describe.skipIf(!isLocal)('00070 EXT-LINK parity: buildDetailSnapshot vs การ์ด', () => {
  const shopOf: Record<string, { id: string; name: string; vertical: string }> = {}

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `dp-${run}`, username: `dp_${run}` }, select: { id: true } })
    ids.user = u.id
    const specs: [string, Spec[]][] = [['SERVICE_QUEUE', SERVICE], ['ONLINE_SALES', GENERAL], ['LODGING', LODGING]]
    let seq = 0
    for (const [v, list] of specs) {
      const s = await prisma.shop.create({ data: { userId: u.id, shopName: `dp-${run}-${v}`, vertical: v, kind: 'BUSINESS' }, select: { id: true } })
      shopOf[v] = { id: s.id, name: `dp-${run}-${v}`, vertical: v }
      ids.shops.push(s.id)
      for (const o of list) {
        seq++
        const row = await prisma.order.create({
          data: {
            publicToken: `dp-${run}-${seq}`, shopId: s.id, totalAmount: o.amount, status: o.status, createdAt: o.at,
            buyerName: `ลูกค้า ${seq}`, buyerContact: '0812345678',
            ...(o.closed ? { serviceClosedAt: o.closed } : {}),
            items: { create: [{ name: `รายการ ${seq}`, qty: 1, price: o.amount }] },
          },
          select: { id: true },
        })
        ids.orders.push(row.id)
        for (const [k, sp] of (o.shipments ?? []).entries()) {
          await prisma.orderShipment.create({
            data: {
              orderId: row.id, shopId: s.id, status: 'CREATED', isDryRun: false, direction: sp.direction,
              carrierStatus: sp.carrierStatus, carrierPrice: sp.carrierPrice ?? null, idempotencyKey: `dp-${run}-${seq}-${k}`,
            },
          })
        }
        if (o.ret) {
          await prisma.orderReturn.create({
            data: { orderId: row.id, shopId: s.id, status: 'RECEIVED', receivedAt: th('2026-09-11', 16), countAsCost: true, shippingCost: 38 },
          })
        }
      }
      // ค่าใช้จ่าย: 2 แถวในช่วง (มีโน้ต) + 1 แถวนอกช่วง
      for (const [d, amt, note] of [['2026-09-10', 30, 'ซื้อกล่อง'], ['2026-09-11', 70.5, null], ['2026-09-12', 999, 'นอกช่วง']] as const) {
        const ex = await prisma.expense.create({
          data: { shopId: s.id, category: 'OTHER', amount: amt, expenseDate: th(d, 12), note, createdByUserId: u.id },
          select: { id: true },
        })
        ids.expenses.push(ex.id)
      }
    }
  }, 120_000)

  afterAll(async () => {
    await prisma.orderReturn.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.orderShipment.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.order.deleteMany({ where: { id: { in: ids.orders } } })
    await prisma.expense.deleteMany({ where: { id: { in: ids.expenses } } })
    await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } })
    await prisma.$disconnect()
  })

  async function build(template: TemplateV1, shopKeys = ['SERVICE_QUEUE', 'ONLINE_SALES', 'LODGING']) {
    const cache = createSweepCache()
    const summary = await buildGroupSummary({
      shops: shopKeys.map((k) => shopOf[k]), window: W, flags, needs, cache,
      excluded: [{ shop: { id: randomUUID(), name: 'ร้านถูกล็อก', vertical: 'ONLINE_SALES' }, reason: 'LOCKED' }],
    })
    const snap = await buildDetailSnapshot({ summary, template, kind: 'DAILY', title: 'รายงาน', window: W, now: new Date('2026-09-12T03:00:00Z'), cache })
    return { summary, snap }
  }

  it('ผลรวมก้อน = ยอด/จำนวนบนการ์ดต่อร้าน และตรงค่าที่เขียนมือจากฟิกซ์เจอร์', async () => {
    const { summary, snap } = await build(FULL)
    const by = (n: string) => snap.shops.find((s) => s.name === n)!
    const expected: Record<string, { orders: number; b: [number, number][] }> = {
      SERVICE_QUEUE: { orders: 7, b: [[3, 1100], [4, 2600]] },
      ONLINE_SALES: { orders: 8, b: [[4, 2000], [4, 1700]] },
      LODGING: { orders: 2, b: [[1, 100], [1, 200]] },
    }
    for (const [v, e] of Object.entries(expected)) {
      const sh = by(shopOf[v].name)
      const card = summary.shops.find((s) => s.shop.id === shopOf[v].id)!
      expect(sh.parity).toBeUndefined()
      expect(sh.orders).toBe(card.orders)
      expect(sh.orders).toBe(e.orders)
      expect(sh.buckets!.map((b) => [b.count, b.amount])).toEqual(e.b)
      expect(round2(sh.buckets![0].amount + sh.buckets![1].amount)).toBe(round2(card.confirmed + card.unconfirmed))
      expect(sh.buckets!.reduce((n, b) => n + b.count, 0)).toBe(card.orders)
      expect(sh.rowsTotal).toBe(e.orders)
      expect(sh.rows).toHaveLength(e.orders)
      expect(sh.rows.some((r) => r.axis === 'RETURNED')).toBe(v !== 'LODGING')
    }
    // ร้านบริการ: RETURNED อยู่ในทั้งสองก้อนตาม serviceClosedAt (ไม่ถูกตัดแบบ countsAsServiceRevenue)
    const svc = by(shopOf.SERVICE_QUEUE.name)
    expect(svc.rows.filter((r) => r.axis === 'RETURNED').map((r) => r.bucket).sort()).toEqual([0, 1])
    expect(svc.buckets!.map((b) => b.key)).toEqual(['CLOSED', 'UNCLOSED'])
    // ร้านขายของ: SHIPPED+carrier รับ = ยืนยัน · พัสดุขากลับ/ไม่มีพัสดุ = รอยืนยัน
    const gen = by(shopOf.ONLINE_SALES.name)
    expect(gen.rows.filter((r) => r.axis === 'CONFIRMED').map((r) => r.amount).sort((a, b) => a! - b!)).toEqual([100, 300, 700, 900])
  })

  it('ตัวเลขใหญ่ = salesTotal(combineTotals) และร้านถูกตัดออก/ล้มไม่มีตัวเลข', async () => {
    const { summary, snap } = await build(FULL)
    const t = combineTotals(summary.shops)
    expect(snap.total.sales).toBe(salesTotal(t))
    expect(snap.total.orders).toBe(t.orders)
    expect(snap.total.orders).toBe(17)
    const ex = snap.shops.find((s) => s.state === 'EXCLUDED')!
    expect(ex).toMatchObject({ excludedReason: 'LOCKED', orders: 0, rows: [] })
    expect(ex.sales).toBeUndefined()
    expect(ex.buckets).toBeUndefined()
    expect(ex.expense).toBeUndefined()
    expect(snap.orderWordMixed).toBe(true)
  })

  it('ร้านเดี่ยว: total.sales = ยอดการ์ดของร้าน', async () => {
    const { summary, snap } = await build(FULL, ['SERVICE_QUEUE'])
    expect(summary.total).toBeUndefined()
    expect(snap.total.sales).toBe(3700)
  })

  it('ค่าใช้จ่าย: Σ แถว (ก่อนตัด) = ShopFinance.expense · ร้านบริการมีบรรทัดค่าส่ง+ใบคืนจากระบบ', async () => {
    const { summary, snap } = await build(FULL)
    for (const v of ['SERVICE_QUEUE', 'ONLINE_SALES', 'LODGING']) {
      const sh = snap.shops.find((s) => s.name === shopOf[v].name)!
      const card = summary.shops.find((s) => s.shop.id === shopOf[v].id)!
      expect(sh.expense!.rowsTruncated).toBe(false)
      expect(round2(sh.expense!.rows.reduce((n, r) => n + r.amount, 0))).toBe(card.finance!.expense)
      expect(sh.expense!.total).toBe(card.finance!.expense)
      expect(sh.expense!.recorded).toBe(true)
      expect(sh.expense!.rows.some((r) => r.note === 'ซื้อกล่อง')).toBe(true)
      expect(sh.expense!.rows.some((r) => r.note === 'นอกช่วง')).toBe(false)
    }
    const svc = snap.shops.find((s) => s.name === shopOf.SERVICE_QUEUE.name)!.expense!
    // 30 + 70.5 + ค่าส่งขาไป 45 + ใบคืน 38 (ป้ายจากค่าคงที่ระบบ) — ถ้าระบบไม่ได้ดึงค่าส่งฟิกซ์เจอร์นี้ว่างเปล่าเทสต้องแดง
    expect(svc.rows.filter((r) => r.system).map((r) => [r.category, r.amount])).toEqual([['ค่าส่ง (จ่ายขนส่ง)', 45], ['ค่าส่งคืนสินค้า', 38]])
    expect(svc.total).toBe(183.5)
    const gen = snap.shops.find((s) => s.name === shopOf.ONLINE_SALES.name)!.expense!
    expect(gen.rows.some((r) => r.system)).toBe(false)
    expect(gen.total).toBe(100.5)
  })

  it('exposure ปิดค่าใช้จ่าย: ไม่มี key expense ในทุกร้าน', async () => {
    const { snap } = await build(tpl(['orders', 'sales']))
    expect(snap.exposure.expense).toBe(false)
    snap.shops.forEach((s) => expect('expense' in s).toBe(false))
  })
})
