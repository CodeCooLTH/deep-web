/**
 * parcel-close-money.test.ts — สูตรเงินของ feature 00085 บนฐานจริง (TC I-19..I-21, T-REV)
 *
 * ค่าอ้างอิงเขียนมือจากฟิกซ์เจอร์ ไม่เรียกสูตรของ service กลับมาเป็นคำตอบ
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ทุกแถวมี id ของรอบนี้ ลบ scope ด้วย id
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { revenueOrderWhere } from '@/lib/order-revenue'
import { revenueOrderSql } from '@/lib/agent-performance-sql'
import { resolveDateRange } from '@/lib/date-range'
import { getSalesSeries } from '@/services/dashboard.service'
import { getPnlReport } from '@/services/pnl.service'

const run = randomUUID().slice(0, 8)
const ids = { user: '', shops: [] as string[], orders: [] as string[] }
const at = new Date(Date.UTC(2026, 8, 10, 5)) // 10 ก.ย. 2026 เที่ยงไทย → bucket index 9

type Spec = { key: string; amount: number; status: string; carrier: string; excludes: boolean | null; price?: number; codFee?: number }
const SPECS: Spec[] = [
  { key: 'A_excluded_confirmed', amount: 360, status: 'CONFIRMED', carrier: 'issue', excludes: true, price: 30, codFee: 7.7 },
  { key: 'B_kept_shipped_issue', amount: 100, status: 'SHIPPED', carrier: 'issue', excludes: false },
  { key: 'C_open_shipped_issue', amount: 110, status: 'SHIPPED', carrier: 'issue', excludes: null },
  { key: 'D_confirmed', amount: 120, status: 'CONFIRMED', carrier: 'delivered', excludes: null },
  { key: 'E_shipped_delivered', amount: 130, status: 'SHIPPED', carrier: 'delivered', excludes: null },
]
const orderOf: Record<string, string> = {}

async function mkShop(label: string) {
  const s = await prisma.shop.create({ data: { userId: ids.user, shopName: `pcm-${run}-${label}`, vertical: 'ONLINE_SALES', kind: 'BUSINESS' }, select: { id: true } })
  ids.shops.push(s.id)
  return s.id
}
async function mkOrder(shopId: string, s: Spec, seq: number) {
  const row = await prisma.order.create({
    data: {
      publicToken: `pcm-${run}-${seq}`, shopId, totalAmount: s.amount, status: s.status, createdAt: at,
      buyerName: `ลูกค้า ${seq}`, buyerContact: '0812345678', paymentMethod: 'COD',
      items: { create: [{ name: `รายการ ${seq}`, qty: 1, price: s.amount, cost: 50 }] },
    },
    select: { id: true },
  })
  ids.orders.push(row.id)
  await prisma.orderShipment.create({
    data: {
      orderId: row.id, shopId, status: 'CREATED', isDryRun: false, direction: 'FORWARD', carrierStatus: s.carrier,
      carrierPrice: s.price ?? null, codFee: s.codFee ?? null, idempotencyKey: `pcm-${run}-${seq}`,
      ...(s.excludes === null
        ? {}
        : { problemClosedAt: at, problemCloseOutcome: s.excludes ? 'DELIVERY_FAILED' : 'LOST_ON_RETURN', problemCloseExcludesRevenue: s.excludes }),
    },
  })
  return row.id
}

describe.skipIf(!isLocal)('00085 สูตรเงินใบที่ร้านปิดพัสดุ (ฐานจริง)', () => {
  let shopAll = ''
  let shopA = ''

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `pcm-${run}`, username: `pcm_${run}` }, select: { id: true } })
    ids.user = u.id
    shopAll = await mkShop('all')
    shopA = await mkShop('a')
    let seq = 0
    for (const s of SPECS) orderOf[s.key] = await mkOrder(shopAll, s, ++seq)
    await mkOrder(shopA, SPECS[0], ++seq)
  }, 120_000)

  afterAll(async () => {
    await prisma.orderShipment.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.order.deleteMany({ where: { id: { in: ids.orders } } })
    await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } })
    await prisma.$disconnect()
  })

  const want = () => ['B_kept_shipped_issue', 'D_confirmed', 'E_shipped_delivered'].map((k) => orderOf[k]).sort()

  it('T-REV-3: revenueOrderWhere (Prisma) นับ B/D/E · ตัด A (ปิดไม่นับ) และ C (issue ยังไม่ปิด)', async () => {
    const rows = await prisma.order.findMany({ where: { shopId: shopAll, ...revenueOrderWhere }, select: { id: true } })
    expect(rows.map((r) => r.id).sort()).toEqual(want())
  })

  it('คู่แฝด SQL (revenueOrderSql) ให้ชุดเดียวกับ Prisma', async () => {
    const rows = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT o."id" FROM "Order" o WHERE o."shopId" = ${shopAll} AND ${Prisma.raw(revenueOrderSql('o'))}`,
    )
    expect(rows.map((r) => r.id).sort()).toEqual(want())
  })

  it('I-19: getSalesSeries — COD 360 / ค่าส่ง 30 / codFee 7.70 / ผล A ⇒ ยอด 0 · ต้นทุน 0 · ค่าส่ง 30 ยืนยันแล้ว', async () => {
    const res = await getSalesSeries(shopA, 'daily', { year: 2026, month: 9 }, true, 'ONLINE_SALES')
    expect(res.values[9]).toBe(0)
    expect(res.total).toBe(0)
    expect(res.orderCounts[9]).toBe(0)
    expect(res.cogsValues?.[9]).toBe(0)
    expect(res.shippingValues?.[9]).toBe(30)
    expect(res.shippingConfirmedValues?.[9]).toBe(30)
    expect(res.confirmedValues?.[9]).toBe(0)
  })

  it('I-20: getPnlReport ร้านขายของ — A ไม่อยู่ในยอดขาย ไม่มีค่าส่งขาไปของ A', async () => {
    const range = resolveDateRange('custom', '2026-09-01', '2026-09-30')
    const a = await getPnlReport(shopA, range, 'ONLINE_SALES')
    expect(a.revenue).toBe(0)
    expect(a.orderCount).toBe(0)
    expect(a.shippingCost).toBe(0)
    const all = await getPnlReport(shopAll, range, 'ONLINE_SALES')
    expect(all.revenue).toBe(100 + 120 + 130)
    expect(all.orderCount).toBe(3)
  })
})
