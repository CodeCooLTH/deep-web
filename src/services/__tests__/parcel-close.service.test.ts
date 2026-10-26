/**
 * parcel-close.service.test.ts — 00085 TestCase §3 I-1..I-18, I-23 (DB local)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ทุกแถวสร้างด้วย id ของรอบนี้ ลบ scope ด้วย id
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(process.env.DATABASE_URL ?? '')

import { prisma } from '@/lib/prisma'
import { handleStatusWebhook } from '@/services/iship.service'
import {
  ParcelCloseError,
  closeParcelProblem,
  previewParcelClose,
  reopenParcelProblem,
} from '@/services/parcel-close.service'

const run = randomUUID().slice(0, 8)
const ids = { user: '', shops: [] as string[], orders: [] as string[] }
let shopId = ''
let otherShopId = ''
let serviceShopId = ''
let seq = 0

const COLS = [
  'problemClosedAt', 'problemClosedByUserId', 'problemCloseReason', 'problemCloseNote',
  'problemCloseOutcome', 'problemCloseBasis', 'problemCloseRefunded', 'problemCloseExcludesRevenue',
] as const

async function mk(o: {
  shop?: string
  orderStatus?: string
  pay?: string
  mode?: string
  ship?: Partial<{ direction: string; status: string; isDryRun: boolean; carrierStatus: string | null; deliveredAt: Date | null; problemAt: Date | null }>
} = {}) {
  seq++
  const order = await prisma.order.create({
    data: {
      publicToken: `pc-${run}-${seq}`, shopId: o.shop ?? shopId, totalAmount: 360, status: o.orderStatus ?? 'SHIPPED',
      fulfillmentMode: o.mode ?? 'SHIPPED', paymentMethod: o.pay ?? 'TRANSFER', buyerName: `ลูกค้า ${seq}`, buyerContact: '0812345678',
      items: { create: [{ name: 'x', qty: 1, price: 360 }] },
    },
    select: { id: true },
  })
  ids.orders.push(order.id)
  const sh = await prisma.orderShipment.create({
    data: {
      orderId: order.id, shopId: o.shop ?? shopId, status: 'CREATED', isDryRun: false, direction: 'FORWARD',
      provider: 'ISHIP', refCode: `pc-ref-${run}-${seq}`, carrierStatus: 'issue', problemAt: new Date('2026-10-20T03:00:00Z'),
      idempotencyKey: `pc-${run}-${seq}`, ...o.ship,
    },
    select: { id: true },
  })
  return { orderId: order.id, shipmentId: sh.id, refCode: `pc-ref-${run}-${seq}` }
}
const close = (shipmentId: string, over: Partial<Parameters<typeof closeParcelProblem>[0]> = {}) =>
  closeParcelProblem({ shopId, userId: ids.user, shipmentId, reason: 'LOST', expectedOutcome: 'DELIVERY_FAILED', ...over })
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof ParcelCloseError ? e.code : `ERR:${e}`))
const row = (id: string) => prisma.orderShipment.findUniqueOrThrow({ where: { id } })
const events = (orderId: string, type: string) => prisma.orderEvent.count({ where: { orderId, type } })
const stillOpen = async (id: string) => expect((await row(id)).problemClosedAt).toBeNull()

describe.skipIf(!isLocal)('00085 parcel-close.service', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `pc-${run}`, username: `pc_${run}` }, select: { id: true } })
    ids.user = u.id
    for (const [k, v] of [['a', 'ONLINE_SALES'], ['b', 'ONLINE_SALES'], ['c', 'SERVICE_QUEUE']] as const) {
      const s = await prisma.shop.create({ data: { userId: u.id, shopName: `pc-${run}-${k}`, vertical: v, kind: 'BUSINESS' }, select: { id: true } })
      ids.shops.push(s.id)
      if (k === 'a') shopId = s.id
      if (k === 'b') otherShopId = s.id
      if (k === 'c') serviceShopId = s.id
    }
  }, 60_000)

  afterAll(async () => {
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.shipmentEvent.deleteMany({ where: { shipment: { orderId: { in: ids.orders } } } })
    await prisma.orderShipment.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids.orders } } })
    await prisma.order.deleteMany({ where: { id: { in: ids.orders } } })
    await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } })
    await prisma.$disconnect()
  })

  it('I-1 ปิด A: 8 คอลัมน์ครบ · Order.status เดิม · event 1 แถวมี actor', async () => {
    const f = await mk()
    const res = await close(f.shipmentId, { reason: 'OTHER', note: 'ไฟไหม้โกดังขนส่ง' })
    expect(res).toMatchObject({ closed: true, outcome: 'DELIVERY_FAILED', basis: 'NONE', excludesRevenue: true })
    expect(res.shipment.problemClose).toMatchObject({ outcome: 'DELIVERY_FAILED', reason: 'OTHER', note: 'ไฟไหม้โกดังขนส่ง', closedByName: `pc-${run}` })
    const r = await row(f.shipmentId)
    for (const c of COLS.filter((c) => c !== 'problemCloseRefunded')) expect(r[c], c).not.toBeNull()
    expect(r.problemCloseRefunded).toBeNull()
    expect((await prisma.order.findUniqueOrThrow({ where: { id: f.orderId } })).status).toBe('SHIPPED')
    const ev = await prisma.orderEvent.findMany({ where: { orderId: f.orderId, type: 'PARCEL_PROBLEM_CLOSED' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].actorUserId).toBe(ids.user)
  })

  it('I-2 ปิด B-COD: excludes=true · refunded=null (แม้ client ส่งมา)', async () => {
    const f = await mk({ pay: 'COD', ship: { deliveredAt: new Date() } })
    const res = await close(f.shipmentId, { expectedOutcome: 'LOST_ON_RETURN', refunded: false })
    expect(res).toMatchObject({ outcome: 'LOST_ON_RETURN', basis: 'DELIVERED_AT', excludesRevenue: true })
    expect((await row(f.shipmentId)).problemCloseRefunded).toBeNull()
  })

  it('I-3 B-โอน ไม่ส่ง refunded: REFUND_ANSWER_REQUIRED และไม่มีแถวเปลี่ยน', async () => {
    const f = await mk({ ship: { deliveredAt: new Date() } })
    expect(await codeOf(close(f.shipmentId, { expectedOutcome: 'LOST_ON_RETURN' }))).toBe('REFUND_ANSWER_REQUIRED')
    await stillOpen(f.shipmentId)
    expect(await events(f.orderId, 'PARCEL_PROBLEM_CLOSED')).toBe(0)
  })

  it('I-4 B-โอน refunded=false: excludes=false · refunded=true: excludes=true', async () => {
    const f = await mk({ ship: { deliveredAt: new Date() } })
    expect(await close(f.shipmentId, { expectedOutcome: 'LOST_ON_RETURN', refunded: false })).toMatchObject({ excludesRevenue: false })
    const g = await mk({ ship: { deliveredAt: new Date() } })
    expect(await close(g.shipmentId, { expectedOutcome: 'LOST_ON_RETURN', refunded: true })).toMatchObject({ excludesRevenue: true })
  })

  it('I-5 ส่ง refunded ในกรณี A: ถูกทิ้ง · note ของเหตุผลอื่น OTHER ถูกทิ้ง', async () => {
    const f = await mk()
    await close(f.shipmentId, { refunded: true, note: 'ไม่ควรเก็บ' })
    const r = await row(f.shipmentId)
    expect(r.problemCloseRefunded).toBeNull()
    expect(r.problemCloseNote).toBeNull()
  })

  it('I-6 expectedOutcome ไม่ตรง: OUTCOME_CHANGED พร้อม preview ใหม่ ไม่เขียน', async () => {
    const f = await mk({ ship: { deliveredAt: new Date() } })
    const err = await close(f.shipmentId, { expectedOutcome: 'DELIVERY_FAILED', refunded: true }).catch((e) => e)
    expect(err).toBeInstanceOf(ParcelCloseError)
    expect(err.code).toBe('OUTCOME_CHANGED')
    expect(err.preview).toMatchObject({ outcome: 'LOST_ON_RETURN', basis: 'DELIVERED_AT', needsRefundAnswer: true })
    await stillOpen(f.shipmentId)
  })

  it('I-7 ปิดซ้ำ: ALREADY_CLOSED', async () => {
    const f = await mk()
    await close(f.shipmentId)
    expect(await codeOf(close(f.shipmentId))).toBe('ALREADY_CLOSED')
  })

  it('I-8 ปิด 2 คำขอพร้อมกัน: สำเร็จ 1 · 409 1 · event 1 แถว', async () => {
    const f = await mk()
    const r = await Promise.all([codeOf(close(f.shipmentId)), codeOf(close(f.shipmentId))])
    expect(r.filter((x) => x === 'OK')).toHaveLength(1)
    expect(r.filter((x) => x === 'ALREADY_CLOSED')).toHaveLength(1)
    expect(await events(f.orderId, 'PARCEL_PROBLEM_CLOSED')).toBe(1)
  })

  it('I-9 carrierStatus เปลี่ยนเป็น delivered ระหว่างอ่านกับเขียน: NOT_IN_PROBLEM ไม่เขียน', async () => {
    const f = await mk()
    // แทรกการเปลี่ยนสถานะระหว่าง "อ่านแถว" กับ "เขียน" (buildPreview เรียก count หลัง loadRow)
    const ev = prisma.shipmentEvent as unknown as { count: (...a: unknown[]) => Promise<number> }
    const orig = ev.count
    ev.count = (...a) => prisma.orderShipment.update({ where: { id: f.shipmentId }, data: { carrierStatus: 'delivered' } }).then(() => orig.apply(ev, a))
    try {
      expect(await codeOf(close(f.shipmentId))).toBe('NOT_IN_PROBLEM')
    } finally {
      ev.count = orig
    }
    await stillOpen(f.shipmentId)
    expect(await events(f.orderId, 'PARCEL_PROBLEM_CLOSED')).toBe(0)
  })

  it('I-10 สถานะออเดอร์/โหมด', async () => {
    for (const s of ['CANCELLED', 'RETURNED', 'DRAFTED']) {
      expect(await codeOf(close((await mk({ orderStatus: s })).shipmentId)), s).toBe('ORDER_FINISHED')
    }
    expect(await codeOf(close((await mk({ mode: 'PICKUP' })).shipmentId))).toBe('NOT_SHIPPED_MODE')
  })

  it('I-11 พัสดุ RETURN / dry-run / FAILED', async () => {
    expect(await codeOf(close((await mk({ ship: { direction: 'RETURN' } })).shipmentId))).toBe('NOT_FORWARD')
    expect(await codeOf(close((await mk({ ship: { isDryRun: true } })).shipmentId))).toBe('NOT_ACTIVE')
    expect(await codeOf(close((await mk({ ship: { status: 'FAILED' } })).shipmentId))).toBe('NOT_ACTIVE')
  })

  it('I-12 ร้าน SERVICE_QUEUE (เรียก service ตรง)', async () => {
    const f = await mk({ shop: serviceShopId })
    expect(await codeOf(close(f.shipmentId, { shopId: serviceShopId }))).toBe('SERVICE_SHOP_UNSUPPORTED')
  })

  it('I-13 พัสดุของร้านอื่น: NOT_FOUND ทั้ง GET/POST/DELETE', async () => {
    const f = await mk({ shop: otherShopId })
    expect(await codeOf(close(f.shipmentId))).toBe('NOT_FOUND')
    expect(await codeOf(previewParcelClose(shopId, f.shipmentId))).toBe('NOT_FOUND')
    expect(await codeOf(reopenParcelProblem({ shopId, userId: ids.user, shipmentId: f.shipmentId }))).toBe('NOT_FOUND')
    expect(await codeOf(close('no-such-id'))).toBe('NOT_FOUND')
  })

  it('I-14 เลิกปิด: คอลัมน์ null ทั้ง 8 + event REOPENED; ปิดใหม่ได้', async () => {
    const f = await mk()
    await close(f.shipmentId)
    const res = await reopenParcelProblem({ shopId, userId: ids.user, shipmentId: f.shipmentId })
    expect(res.shipment.problemClose).toBeNull()
    const r = await row(f.shipmentId)
    for (const c of COLS) expect(r[c], c).toBeNull()
    expect(await events(f.orderId, 'PARCEL_PROBLEM_REOPENED')).toBe(1)
    await close(f.shipmentId)
    expect((await row(f.shipmentId)).problemClosedAt).not.toBeNull()
  })

  it('I-15 เลิกปิดบน CANCELLED / ไม่ได้ปิด / ซ้ำพร้อมกัน', async () => {
    const f = await mk()
    expect(await codeOf(reopenParcelProblem({ shopId, userId: ids.user, shipmentId: f.shipmentId }))).toBe('NOT_CLOSED')
    await close(f.shipmentId)
    await prisma.order.update({ where: { id: f.orderId }, data: { status: 'CANCELLED' } })
    expect(await codeOf(reopenParcelProblem({ shopId, userId: ids.user, shipmentId: f.shipmentId }))).toBe('ORDER_FINISHED')
    const g = await mk()
    await close(g.shipmentId)
    const r = await Promise.all([1, 2].map(() => codeOf(reopenParcelProblem({ shopId, userId: ids.user, shipmentId: g.shipmentId }))))
    expect(r.sort()).toEqual(['NOT_CLOSED', 'OK'])
    expect(await events(g.orderId, 'PARCEL_PROBLEM_REOPENED')).toBe(1)
  })

  it('I-16 webhook iShip หลังปิด: คอลัมน์ปิดไม่ถูกแตะ · problemAt/deliveredAt write-once', async () => {
    const f = await mk()
    await close(f.shipmentId)
    const before = await row(f.shipmentId)
    for (const status of ['issue', 'progress', 'delivered', 'return_success']) {
      await handleStatusWebhook({ ref_code: f.refCode, status, timestamp: Math.floor(Date.now() / 1000) })
    }
    const after = await row(f.shipmentId)
    for (const c of COLS) expect(after[c], c).toEqual(before[c])
    expect(after.problemAt).toEqual(before.problemAt)
    expect(after.deliveredAt).not.toBeNull()
  })

  it('I-17 source-grep: ตัวเขียนสถานะขนส่ง (iShip/Flash) ไม่ใส่ problemClose* นอกจาก type/select', () => {
    const dir = join(process.cwd(), 'src/services')
    const writers = readdirSync(dir).filter((n) => /^(iship|flash)[\w.-]*\.ts$/.test(n))
    expect(writers).toContain('iship.service.ts')
    const bad = writers.flatMap((n) =>
      readFileSync(join(dir, n), 'utf8').split('\n')
        .filter((l) => /\bproblemClose\w*/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l) && !/problemClose\w*\??:\s*(true,?|string|Date|boolean)\b/.test(l))
        .map((l) => `${n}: ${l.trim()}`),
    )
    expect(bad).toEqual([])
  })

  it('I-18 GET preview ตรงกับผล POST (A / B-COD / B-โอน)', async () => {
    const cases = [
      { f: await mk(), refunded: undefined },
      { f: await mk({ pay: 'COD', ship: { deliveredAt: new Date() } }), refunded: undefined },
      { f: await mk({ ship: { deliveredAt: new Date() } }), refunded: false },
    ]
    for (const { f, refunded } of cases) {
      const p = await previewParcelClose(shopId, f.shipmentId)
      const res = await close(f.shipmentId, { expectedOutcome: p.outcome, refunded })
      expect(res).toMatchObject({ outcome: p.outcome, basis: p.basis })
      expect(p.eligible).toBe(true)
      expect(p.effect.countsAsSale).toBe(p.needsRefundAnswer ? null : false)
    }
  })

  it('I-18b ShipmentEvent delivered = หลักฐาน (EVENT) · eventCount นับเฉพาะของใบนี้', async () => {
    const f = await mk()
    await prisma.shipmentEvent.create({ data: { shipmentId: f.shipmentId, status: 'delivered', occurredAt: new Date(), dedupeKey: `delivered:${run}:${seq}` } })
    expect(await previewParcelClose(shopId, f.shipmentId)).toMatchObject({ outcome: 'LOST_ON_RETURN', basis: 'EVENT', eventCount: 1 })
  })

  it('I-23 Order (status/cancelInitiator/ฯลฯ) ไม่เปลี่ยนหลังปิด · ไม่มี OrderReturn', async () => {
    const f = await mk({ pay: 'COD', orderStatus: 'CONFIRMED' })
    const before = await prisma.order.findUniqueOrThrow({ where: { id: f.orderId } })
    await close(f.shipmentId, { expectedOutcome: 'LOST_ON_RETURN' })
    expect(await prisma.order.findUniqueOrThrow({ where: { id: f.orderId } })).toEqual(before)
    expect(await prisma.orderReturn.count({ where: { orderId: f.orderId } })).toBe(0)
  })
})
