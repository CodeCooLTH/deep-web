/**
 * [blocker] feature 00082 — ลูกค้ายืนยันรับบริการ = ปิดงาน + ชำระครบ (ร้านบริการเท่านั้น · ฐานจริง localhost)
 *
 * ทางเข้าเดียว `confirmOrder` (เว็บ · แอป · ส่งคะแนน) → `settleServiceJobOnBuyerConfirm` ในทรานแซกชันเดียวกัน
 * + migration ปิดย้อนหลัง (รันไฟล์ SQL จริงในทรานแซกชันแล้วย้อนกลับ — ข้อมูลอื่นในฐานไม่ถูกแตะ)
 *
 * ล้างเฉพาะของที่เทสสร้าง (Hard Rule 13) — ลูกของ Order ลบตาม cascade
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteTestData, prisma } from '../setup'
import { confirmOrder } from '@/services/order.service'
import { closeServiceJob } from '@/services/service-job.service'
import { createReview } from '@/services/review.service'
import { issueOrReadReceiptForBuyer } from '@/services/receipt.service'
import { getOrderMoney, voidPayment } from '@/services/order-payment.service'
import { BUYER_CONFIRM_PAYMENT_NOTE, ServiceJobNoShowConfirmError } from '@/lib/service-job'
import { describeOrderEvent } from '@/lib/order-event'

let userIds: string[] = []
let shopIds: string[] = []
const tag = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

beforeEach(() => {
  userIds = []
  shopIds = []
})
afterEach(async () => {
  await prisma.shopReceiptCounter.deleteMany({ where: { shopId: { in: shopIds } } })
  await deleteTestData({ userIds, shopIds })
})

async function seed(vertical: 'SERVICE_QUEUE' | 'ONLINE_SALES' = 'SERVICE_QUEUE') {
  const owner = await prisma.user.create({ data: { displayName: 'เจ้าของร้าน 00082', username: `b82_owner_${tag()}`, isShop: true } })
  const buyer = await prisma.user.create({ data: { displayName: 'ลูกค้า 00082', username: `b82_buyer_${tag()}` } })
  userIds.push(owner.id, buyer.id)
  const shop = await prisma.shop.create({
    data: { userId: owner.id, shopName: 'ร้านทดสอบ 00082', businessType: 'INDIVIDUAL', vertical },
  })
  shopIds.push(shop.id)
  const resource = await prisma.serviceResource.create({ data: { shopId: shop.id, name: 'ช่างเอ' } })
  return { owner, buyer, shop, resource }
}

const HOUR = 60 * 60 * 1000
/** ที่นั่งไม่ซ้ำต่องาน — กันชน EXCLUDE "Order_service_seat_no_overlap" */
let seatSeq = 0
async function job(
  ctx: Awaited<ReturnType<typeof seed>>,
  opts: { appointment?: boolean; startOffsetH?: number; total?: number; deposit?: number } = {},
) {
  const start = new Date(Date.now() + (opts.startOffsetH ?? -2) * HOUR)
  const order = await prisma.order.create({
    data: {
      shopId: ctx.shop.id,
      type: 'SERVICE',
      fulfillmentMode: 'NO_SHIPPING',
      status: 'PENDING',
      totalAmount: opts.total ?? 3500,
      buyerUserId: ctx.buyer.id,
      buyerName: 'คุณลูกค้า',
      items: { create: [{ name: 'ติดตั้งไฟหน้า', qty: 1, price: opts.total ?? 3500 }] },
      ...(opts.appointment === false
        ? {}
        : {
            serviceResourceId: ctx.resource.id,
            serviceSeat: 9000 + ++seatSeq,
            serviceStart: start,
            serviceEnd: new Date(start.getTime() + HOUR),
            appointmentStatus: 'SCHEDULED',
          }),
    },
  })
  if (opts.deposit) {
    await prisma.orderPayment.create({
      data: { orderId: order.id, shopId: ctx.shop.id, kind: 'DEPOSIT', amount: opts.deposit, method: 'TRANSFER', receivedByUserId: ctx.owner.id },
    })
  }
  return order
}

const shopClose = (ctx: Awaited<ReturnType<typeof seed>>, token: string, payment?: number) =>
  closeServiceJob({
    shopId: ctx.shop.id,
    orderToken: token,
    actorUserId: ctx.owner.id,
    outcome: 'SERVED',
    ...(payment ? { payment: { amount: payment, method: 'CASH' as const } } : {}),
  })

const load = (id: string) =>
  prisma.order.findUniqueOrThrow({ where: { id }, include: { payments: { orderBy: { createdAt: 'asc' } } } })
const closedEvents = (orderId: string) => prisma.orderEvent.findMany({ where: { orderId, type: 'SERVICE_CLOSED' } })
const outstanding = async (ctx: Awaited<ReturnType<typeof seed>>, token: string) =>
  (await getOrderMoney({ shopId: ctx.shop.id, orderToken: token })).outstanding

describe('[blocker] FR-001/002/003/004 — ร้านยังไม่ปิด ลูกค้ายืนยัน ⇒ ปิดงาน + ชำระครบ', () => {
  it('มีนัด · มัดจำ 500 ค้าง 3,000 → ปิด (นัด = ให้บริการแล้ว) · รายการรับเงิน 3,000 · ประวัติ · ไม่จองข้อความแจ้ง', async () => {
    const ctx = await seed()
    const o = await job(ctx, { deposit: 500 })
    const before = Date.now()
    const r = await confirmOrder(o.publicToken, ctx.buyer.id)
    expect(r.status).toBe('CONFIRMED')

    const after = await load(o.id)
    expect(after.serviceClosedAt).not.toBeNull()
    expect(after.serviceClosedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(after.appointmentStatus).toBe('COMPLETED')

    const auto = after.payments.filter((p) => p.note === BUYER_CONFIRM_PAYMENT_NOTE)
    expect(auto).toHaveLength(1)
    expect(auto[0]).toMatchObject({ kind: 'BALANCE', method: 'OTHER', receivedByUserId: ctx.buyer.id, voidedAt: null })
    expect(Number(auto[0].amount)).toBe(3000)
    expect(auto[0].receivedAt.getTime()).toBe(after.serviceClosedAt!.getTime())
    expect(await outstanding(ctx, o.publicToken)).toBe(0)

    const ev = await closedEvents(o.id)
    expect(ev).toHaveLength(1)
    expect(ev[0].actorUserId).toBe(ctx.buyer.id)
    expect(ev[0].meta).toMatchObject({ outcome: 'SERVED', closedBy: 'BUYER', amount: 3000 })
    const confirmed = await prisma.orderEvent.findFirstOrThrow({ where: { orderId: o.id, type: 'BUYER_CONFIRMED' } })
    expect(confirmed.occurredAt.getTime()).toBe(ev[0].occurredAt.getTime())

    // FR-004 — ไม่ส่ง "ร้านให้บริการแล้ว" (ลูกค้ากดเอง)
    expect(await prisma.autoNotifyLedger.count({ where: { orderId: o.id } })).toBe(0)
  })

  it('FR-005 — ลูกค้าเปิดใบเสร็จได้ทันทีหลังยืนยัน', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await confirmOrder(o.publicToken, ctx.buyer.id)
    const mine = await issueOrReadReceiptForBuyer({ orderToken: o.publicToken, buyerUserId: ctx.buyer.id })
    expect(mine.receiptNo).toMatch(/^CA\d{10}$/)
  })

  it('จ่ายครบอยู่แล้ว → ปิดงาน ไม่สร้างรายการรับเงิน · ประวัติไม่มียอด', async () => {
    const ctx = await seed()
    const o = await job(ctx, { total: 1200, deposit: 1200 })
    await confirmOrder(o.publicToken, ctx.buyer.id)
    const after = await load(o.id)
    expect(after.serviceClosedAt).not.toBeNull()
    expect(after.payments).toHaveLength(1)
    const ev = await closedEvents(o.id)
    expect(ev).toHaveLength(1)
    expect((ev[0].meta as Record<string, unknown>).amount).toBeUndefined()
  })

  it('นัดยังไม่ถึงเวลา → ลูกค้ายืนยันแล้วปิดได้ (ไม่ตรวจเวลานัดเหมือนฝั่งร้าน)', async () => {
    const ctx = await seed()
    const o = await job(ctx, { startOffsetH: 5 })
    await confirmOrder(o.publicToken, ctx.buyer.id)
    const after = await load(o.id)
    expect(after.serviceClosedAt).not.toBeNull()
    expect(after.appointmentStatus).toBe('COMPLETED')
  })

  it('walk-in (ไม่มีนัด) → ปิด · สถานะนัดยังว่าง', async () => {
    const ctx = await seed()
    const o = await job(ctx, { appointment: false })
    await confirmOrder(o.publicToken, ctx.buyer.id)
    const after = await load(o.id)
    expect(after.serviceClosedAt).not.toBeNull()
    expect(after.appointmentStatus).toBeNull()
    expect(await outstanding(ctx, o.publicToken)).toBe(0)
  })

  it('ร้านยกเลิกรายการรับเงินที่ระบบบันทึกให้ → กลับเป็นค้าง · ลูกค้าเปิดใบเสร็จไม่ได้', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await confirmOrder(o.publicToken, ctx.buyer.id)
    const auto = (await load(o.id)).payments.find((p) => p.note === BUYER_CONFIRM_PAYMENT_NOTE)!
    await voidPayment({ shopId: ctx.shop.id, orderToken: o.publicToken, paymentId: auto.id, voidedByUserId: ctx.owner.id, reason: 'ลูกค้ายังไม่ได้จ่าย' })
    expect(await outstanding(ctx, o.publicToken)).toBe(3500)
    await expect(issueOrReadReceiptForBuyer({ orderToken: o.publicToken, buyerUserId: ctx.buyer.id })).rejects.toMatchObject({
      code: 'ORDER_NOT_ISSUABLE',
    })
  })

  it('กดยืนยันพร้อมกันสองครั้ง → ปิดครั้งเดียว · รายการรับเงินแถวเดียว', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await Promise.allSettled([confirmOrder(o.publicToken, ctx.buyer.id), confirmOrder(o.publicToken, ctx.buyer.id)])
    const after = await load(o.id)
    expect(after.status).toBe('CONFIRMED')
    expect(after.payments.filter((p) => p.note === BUYER_CONFIRM_PAYMENT_NOTE)).toHaveLength(1)
    expect(await closedEvents(o.id)).toHaveLength(1)
  })
})

describe('[blocker] FR-006 — ร้านปิดไปแล้ว แล้วลูกค้ายืนยัน', () => {
  it('ร้านปิดแบบค้าง 3,500 → ลูกค้ายืนยัน ⇒ บันทึกยอดค้าง · วันปิดเดิม · ไม่มีประวัติปิดซ้ำ · ใบเสร็จเปิดได้', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    const closed = await shopClose(ctx, o.publicToken)
    await confirmOrder(o.publicToken, ctx.buyer.id)

    const after = await load(o.id)
    expect(after.serviceClosedAt!.getTime()).toBe(closed.serviceClosedAt!.getTime())
    const auto = after.payments.filter((p) => p.note === BUYER_CONFIRM_PAYMENT_NOTE)
    expect(auto).toHaveLength(1)
    expect(Number(auto[0].amount)).toBe(3500)
    expect(await closedEvents(o.id)).toHaveLength(1) // ของร้านอย่างเดียว
    expect((await closedEvents(o.id))[0].actorUserId).toBe(ctx.owner.id)
    await expect(issueOrReadReceiptForBuyer({ orderToken: o.publicToken, buyerUserId: ctx.buyer.id })).resolves.toBeTruthy()
  })

  it('ร้านปิดแบบชำระครบ → ลูกค้ายืนยัน ⇒ ไม่มีรายการรับเงินเพิ่ม (เหมือนเดิม)', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await shopClose(ctx, o.publicToken, 3500)
    await confirmOrder(o.publicToken, ctx.buyer.id)
    const after = await load(o.id)
    expect(after.payments).toHaveLength(1)
    expect(after.payments[0].note).not.toBe(BUYER_CONFIRM_PAYMENT_NOTE)
  })

  it('ทางส่งคะแนน (ร้านปิดแบบค้าง ลูกค้ายังไม่ยืนยัน) → ยืนยัน + บันทึกยอดค้าง', async () => {
    const ctx = await seed()
    const o = await job(ctx, { deposit: 1000 })
    await shopClose(ctx, o.publicToken)
    await createReview(o.publicToken, { rating: 5, reviewerUserId: ctx.buyer.id })
    const after = await load(o.id)
    expect(after.status).toBe('CONFIRMED')
    expect(await outstanding(ctx, o.publicToken)).toBe(0)
    expect(Number(after.payments.find((p) => p.note === BUYER_CONFIRM_PAYMENT_NOTE)!.amount)).toBe(2500)
  })
})

describe('[blocker] ไม่กระทบ', () => {
  it('ไม่มาตามนัด → ยืนยันไม่ได้ · ไม่มีอะไรถูกเขียน', async () => {
    const ctx = await seed()
    const o = await job(ctx, { deposit: 500 })
    await closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, outcome: 'NO_SHOW' })
    await expect(confirmOrder(o.publicToken, ctx.buyer.id)).rejects.toBeInstanceOf(ServiceJobNoShowConfirmError)
    const after = await load(o.id)
    expect(after.status).toBe('PENDING')
    expect(after.payments).toHaveLength(1)
  })

  it('ร้านขายของ → ยืนยันเหมือนเดิม: ไม่มีวันปิดงาน · ไม่มีรายการรับเงิน · ไม่มีประวัติปิดงาน', async () => {
    const ctx = await seed('ONLINE_SALES')
    const o = await prisma.order.create({
      data: { shopId: ctx.shop.id, type: 'PHYSICAL', status: 'PENDING', totalAmount: 500, buyerUserId: ctx.buyer.id },
    })
    await confirmOrder(o.publicToken, ctx.buyer.id)
    const after = await load(o.id)
    expect(after.status).toBe('CONFIRMED')
    expect(after.serviceClosedAt).toBeNull()
    expect(after.payments).toHaveLength(0)
    expect(await closedEvents(o.id)).toHaveLength(0)
  })

  it('คนอื่นยืนยันแทน → ถูกปฏิเสธ ไม่ปิด ไม่บันทึกเงิน', async () => {
    const ctx = await seed()
    const other = await prisma.user.create({ data: { displayName: 'คนอื่น', username: `b82_other_${tag()}` } })
    userIds.push(other.id)
    const o = await job(ctx)
    await expect(confirmOrder(o.publicToken, other.id)).rejects.toThrow()
    const after = await load(o.id)
    expect(after.serviceClosedAt).toBeNull()
    expect(after.payments).toHaveLength(0)
  })
})

describe('ไทม์ไลน์ร้าน — บอกว่าระบบปิดให้เพราะลูกค้ายืนยัน', () => {
  it('describeOrderEvent: ปิดโดยลูกค้า vs ร้านปิด', () => {
    const vocab = { buyerNoun: 'ลูกค้า' } as Parameters<typeof describeOrderEvent>[1]
    expect(describeOrderEvent({ type: 'SERVICE_CLOSED', meta: { outcome: 'SERVED', closedBy: 'BUYER', amount: 3000 } }, vocab)).toBe(
      'ปิดให้อัตโนมัติเมื่อลูกค้ายืนยันรับบริการ · ให้บริการแล้ว · รับเงิน ฿3,000',
    )
    expect(describeOrderEvent({ type: 'SERVICE_CLOSED', meta: { outcome: 'SERVED' } }, vocab)).toBe('ให้บริการแล้ว')
  })
})

describe('[blocker] FR-007 — migration ปิดย้อนหลัง (รันไฟล์จริง แล้วย้อนกลับ)', () => {
  const sql = readFileSync(
    join(process.cwd(), 'prisma/migrations/20261023100000_00082_service_buyer_confirm_settle/migration.sql'),
    'utf8',
  )
  /** ตัดคอมเมนต์แล้วแยกคำสั่ง — ไฟล์นี้ไม่มี ; ในข้อความ */
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean)

  class Rollback extends Error {}

  it('ใบเก่าทั้ง 2 แบบ ถูกปิด/บันทึกเงินตามวันที่ยืนยัน · รันซ้ำไม่เพิ่ม · ร้านขายของ/ไม่มาตามนัดไม่ถูกแตะ', async () => {
    expect(statements).toHaveLength(3)
    const confirmedAt = new Date('2026-09-15T05:30:00.000Z')
    const shopClosedAt = new Date('2026-09-10T03:00:00.000Z')
    const t = tag()

    await expect(
      prisma.$transaction(
        async (tx) => {
          const owner = await tx.user.create({ data: { displayName: 'เจ้าของ m82', username: `m82_owner_${t}`, isShop: true } })
          const buyer = await tx.user.create({ data: { displayName: 'ลูกค้า m82', username: `m82_buyer_${t}` } })
          const svc = await tx.shop.create({ data: { userId: owner.id, shopName: 'm82 บริการ', businessType: 'INDIVIDUAL', vertical: 'SERVICE_QUEUE' } })
          const owner2 = await tx.user.create({ data: { displayName: 'เจ้าของ m82b', username: `m82_owner2_${t}`, isShop: true } })
          const sale = await tx.shop.create({ data: { userId: owner2.id, shopName: 'm82 ขายของ', businessType: 'INDIVIDUAL', vertical: 'ONLINE_SALES' } })
          const res = await tx.serviceResource.create({ data: { shopId: svc.id, name: 'ช่าง m82' } })
          const mk = (shopId: string, extra: Record<string, unknown>) =>
            tx.order.create({
              data: { shopId, type: 'SERVICE', fulfillmentMode: 'NO_SHIPPING', status: 'CONFIRMED', totalAmount: 2000, buyerUserId: buyer.id, ...extra },
            })
          // A: ยืนยันแล้ว ยังไม่ปิด · มีนัดค้าง · มัดจำ 500
          const a = await mk(svc.id, {
            serviceResourceId: res.id,
            serviceSeat: 1,
            serviceStart: new Date('2026-09-14T03:00:00Z'),
            serviceEnd: new Date('2026-09-14T04:00:00Z'),
            appointmentStatus: 'CONFIRMED_BY_BUYER',
          })
          await tx.orderPayment.create({ data: { orderId: a.id, shopId: svc.id, kind: 'DEPOSIT', amount: 500, method: 'TRANSFER', receivedByUserId: owner.id } })
          await tx.orderEvent.create({ data: { orderId: a.id, type: 'BUYER_CONFIRMED', actorUserId: buyer.id, occurredAt: confirmedAt } })
          // B: ร้านปิดแบบค้าง แล้วลูกค้ายืนยัน
          const b = await mk(svc.id, { serviceClosedAt: shopClosedAt })
          await tx.orderEvent.create({ data: { orderId: b.id, type: 'BUYER_CONFIRMED', actorUserId: buyer.id, occurredAt: confirmedAt } })
          // C: ไม่มาตามนัด (ยืนยันแล้วในข้อมูลเก่า) — ห้ามแตะ
          const c = await mk(svc.id, { appointmentStatus: 'NO_SHOW', serviceResourceId: res.id, serviceSeat: 2, serviceStart: new Date('2026-09-01T03:00:00Z'), serviceEnd: new Date('2026-09-01T04:00:00Z') })
          // D: ร้านขายของ ยืนยันแล้ว ค้างเงิน — ห้ามแตะ
          const d = await mk(sale.id, { type: 'PHYSICAL', fulfillmentMode: 'SHIPPED' })
          // E: ยืนยันแล้ว ยังไม่ปิด ไม่มี event → ใช้ updatedAt
          const e = await mk(svc.id, {})

          const run = async () => {
            for (const s of statements) await tx.$executeRawUnsafe(s)
          }
          await run()

          const get = (id: string) => tx.order.findUniqueOrThrow({ where: { id }, include: { payments: true } })
          const A = await get(a.id)
          expect(A.serviceClosedAt!.toISOString()).toBe(confirmedAt.toISOString())
          expect(A.appointmentStatus).toBe('COMPLETED')
          const aPay = A.payments.filter((p) => p.note === BUYER_CONFIRM_PAYMENT_NOTE)
          expect(aPay).toHaveLength(1)
          expect(aPay[0]).toMatchObject({ kind: 'BALANCE', method: 'OTHER', receivedByUserId: buyer.id })
          expect(Number(aPay[0].amount)).toBe(1500)
          expect(aPay[0].receivedAt.toISOString()).toBe(confirmedAt.toISOString())
          const aEv = await tx.orderEvent.findMany({ where: { orderId: a.id, type: 'SERVICE_CLOSED' } })
          expect(aEv).toHaveLength(1)
          expect(aEv[0].meta).toMatchObject({ outcome: 'SERVED', closedBy: 'BUYER', backfilled: true, amount: 1500 })
          expect(aEv[0].occurredAt.toISOString()).toBe(confirmedAt.toISOString())

          const B = await get(b.id)
          expect(B.serviceClosedAt!.toISOString()).toBe(shopClosedAt.toISOString())
          expect(B.payments.filter((p) => p.note === BUYER_CONFIRM_PAYMENT_NOTE)).toHaveLength(1)
          expect(Number(B.payments[0].amount)).toBe(2000)
          expect(await tx.orderEvent.count({ where: { orderId: b.id, type: 'SERVICE_CLOSED' } })).toBe(0)

          const C = await get(c.id)
          expect(C.serviceClosedAt).toBeNull()
          expect(C.payments).toHaveLength(0)

          const D = await get(d.id)
          expect(D.serviceClosedAt).toBeNull()
          expect(D.payments).toHaveLength(0)

          const E = await get(e.id)
          expect(E.serviceClosedAt!.toISOString()).toBe(e.updatedAt.toISOString())
          expect(E.payments).toHaveLength(1)

          // รันซ้ำ — ไม่มีอะไรเพิ่ม
          const countPay = () => tx.orderPayment.count({ where: { orderId: { in: [a.id, b.id, c.id, d.id, e.id] } } })
          const countEv = () => tx.orderEvent.count({ where: { orderId: { in: [a.id, b.id, c.id, d.id, e.id] }, type: 'SERVICE_CLOSED' } })
          const [p1, e1] = [await countPay(), await countEv()]
          await run()
          expect(await countPay()).toBe(p1)
          expect(await countEv()).toBe(e1)

          throw new Rollback()
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback)
  })
})
