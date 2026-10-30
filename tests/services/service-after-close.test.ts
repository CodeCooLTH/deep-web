/**
 * [blocker] feature 00073 FR-012/FR-013 (มติ user 2026-10-11 รอบ 2) — หลังร้านปิดงาน (ฐานจริง localhost)
 *   FR-012: ร้านปิดงาน "ให้บริการแล้ว" ⇒ ลูกค้าส่งคะแนนได้ทันที และการส่งคะแนน = ยืนยันรับบริการ
 *   FR-013: ลูกค้าเปิดใบเสร็จเองได้เมื่อปิดงานแล้ว + ชำระครบ (ใบเดียว เลขเดียวกับฝั่งร้าน)
 *
 * ล้างเฉพาะของที่เทสสร้าง (Hard Rule 13) — ลูกของ Order ลบตาม cascade
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteTestData, prisma } from '../setup'
import { closeServiceJob, reopenServiceJob } from '@/services/service-job.service'
import { createReview } from '@/services/review.service'
import {
  ReceiptError,
  getReceiptViewForBuyer,
  issueOrReadReceipt,
  issueOrReadReceiptForBuyer,
} from '@/services/receipt.service'

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
  const owner = await prisma.user.create({ data: { displayName: 'เจ้าของร้านล้างแอร์', username: `sac_owner_${tag()}`, isShop: true } })
  const buyer = await prisma.user.create({ data: { displayName: 'ลูกค้าล้างแอร์', username: `sac_buyer_${tag()}` } })
  const other = await prisma.user.create({ data: { displayName: 'ลูกค้าคนอื่น', username: `sac_other_${tag()}` } })
  userIds.push(owner.id, buyer.id, other.id)
  const shop = await prisma.shop.create({
    data: { userId: owner.id, shopName: 'ร้านล้างแอร์ทดสอบ 00073', businessType: 'INDIVIDUAL', vertical },
  })
  shopIds.push(shop.id)
  const resource = await prisma.serviceResource.create({ data: { shopId: shop.id, name: 'ช่างเอ' } })
  return { owner, buyer, other, shop, resource }
}

const HOUR = 60 * 60 * 1000
async function job(ctx: Awaited<ReturnType<typeof seed>>, opts: { deposit?: number; type?: string } = {}) {
  const start = new Date(Date.now() - 2 * HOUR)
  const order = await prisma.order.create({
    data: {
      shopId: ctx.shop.id,
      type: opts.type ?? 'SERVICE',
      fulfillmentMode: 'NO_SHIPPING',
      status: 'PENDING',
      totalAmount: 1200,
      buyerUserId: ctx.buyer.id,
      buyerName: 'คุณลูกค้าล้างแอร์',
      serviceResourceId: ctx.resource.id,
      serviceSeat: 1,
      serviceStart: start,
      serviceEnd: new Date(start.getTime() + HOUR),
      appointmentStatus: 'SCHEDULED',
      items: { create: [{ name: 'ล้างแอร์ติดผนัง 12,000 BTU', qty: 1, price: 1200 }] },
    },
  })
  if (opts.deposit) {
    await prisma.orderPayment.create({
      data: { orderId: order.id, shopId: ctx.shop.id, kind: 'DEPOSIT', amount: opts.deposit, method: 'TRANSFER', receivedByUserId: ctx.owner.id },
    })
  }
  return order
}

const close = (ctx: Awaited<ReturnType<typeof seed>>, token: string, extra: Partial<Parameters<typeof closeServiceJob>[0]> = {}) =>
  closeServiceJob({ shopId: ctx.shop.id, orderToken: token, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'SERVED', ...extra })

describe('FR-012 — ร้านปิดงานแล้ว ส่งคะแนน = ยืนยันรับบริการ', () => {
  it('ปิดงานแล้ว (ลูกค้ายังไม่ยืนยัน) → ส่งคะแนนได้ · งานเป็น CONFIRMED · มีรีวิว · มีเหตุการณ์ยืนยันของลูกค้า', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await close(ctx, o.publicToken, { payment: { amount: 1200, method: 'CASH' } })

    const review = await createReview(o.publicToken, { rating: 5, comment: 'ช่างล้างสะอาด', reviewerUserId: ctx.buyer.id })
    expect(review.rating).toBe(5)
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } })
    expect(after.status).toBe('CONFIRMED')
    const ev = await prisma.orderEvent.findFirst({ where: { orderId: o.id, type: 'BUYER_CONFIRMED' } })
    expect(ev?.actorUserId).toBe(ctx.buyer.id)
  })

  it('ปิดทั้งที่ยังค้างเงิน → ยังส่งคะแนนได้ (คะแนนเป็นเรื่องบริการ ไม่ใช่เรื่องเงิน)', async () => {
    const ctx = await seed()
    const o = await job(ctx, { deposit: 200 })
    await close(ctx, o.publicToken)
    await createReview(o.publicToken, { rating: 4, reviewerUserId: ctx.buyer.id })
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('CONFIRMED')
  })

  it('ร้านยังไม่ปิดงาน → ส่งคะแนนไม่ได้ (ต้องยืนยันก่อนเหมือนเดิม) · สถานะไม่เปลี่ยน', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await expect(createReview(o.publicToken, { rating: 5, reviewerUserId: ctx.buyer.id })).rejects.toThrow(/Cannot review/)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('PENDING')
  })

  it('ไม่มาตามนัด → ส่งคะแนนไม่ได้ · ไม่ถูกยืนยัน', async () => {
    const ctx = await seed()
    const o = await job(ctx, { deposit: 300 })
    await close(ctx, o.publicToken, { outcome: 'NO_SHOW' })
    await expect(createReview(o.publicToken, { rating: 1, reviewerUserId: ctx.buyer.id })).rejects.toThrow(/Cannot review/)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('PENDING')
  })

  it('ร้านเปิดงานอีกครั้งแล้ว → กลับไปส่งคะแนนไม่ได้จนกว่าจะปิดใหม่', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await close(ctx, o.publicToken)
    await reopenServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id })
    await expect(createReview(o.publicToken, { rating: 5, reviewerUserId: ctx.buyer.id })).rejects.toThrow(/Cannot review/)
  })

  it('คนอื่น (ไม่ใช่เจ้าของงาน) ส่งคะแนนแทน → ไม่ถูกยืนยัน', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await close(ctx, o.publicToken)
    await expect(createReview(o.publicToken, { rating: 5, reviewerUserId: ctx.other.id })).rejects.toThrow()
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('PENDING')
  })

  it('[blocker] ร้านขายของ: ออเดอร์ PENDING ส่งรีวิวไม่ได้เหมือนเดิม (ไม่ถูกยืนยันอัตโนมัติ)', async () => {
    const ctx = await seed('ONLINE_SALES')
    const o = await prisma.order.create({
      data: { shopId: ctx.shop.id, type: 'PHYSICAL', status: 'PENDING', totalAmount: 500, buyerUserId: ctx.buyer.id },
    })
    await expect(createReview(o.publicToken, { rating: 5, reviewerUserId: ctx.buyer.id })).rejects.toThrow(/Cannot review/)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('PENDING')
  })
})

describe('FR-013 — ลูกค้าเปิดใบเสร็จเอง', () => {
  it('ปิดงาน + ชำระครบ → ลูกค้าได้เลขใบเสร็จ · ร้านกดทีหลังได้เลขเดียวกัน · หน้าใบเสร็จอ่านได้', async () => {
    const ctx = await seed()
    const o = await job(ctx, { deposit: 200 })
    await close(ctx, o.publicToken, { payment: { amount: 1000, method: 'TRANSFER' } })

    const mine = await issueOrReadReceiptForBuyer({ orderToken: o.publicToken, buyerUserId: ctx.buyer.id })
    expect(mine.receiptNo).toMatch(/^CA\d{10}$/)
    const shopSide = await issueOrReadReceipt({ shopId: ctx.shop.id, orderToken: o.publicToken, userId: ctx.owner.id })
    expect(shopSide.receiptNo).toBe(mine.receiptNo)

    const view = await getReceiptViewForBuyer({ orderToken: o.publicToken, buyerUserId: ctx.buyer.id })
    expect(view?.receipt.receiptNo).toBe(mine.receiptNo)
    expect(view?.items[0].name).toBe('ล้างแอร์ติดผนัง 12,000 BTU')
  })

  it('ร้านเคยพิมพ์ใบไปก่อน → ลูกค้าได้ใบเดิม (ไม่ออกเลขใหม่)', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    const shopFirst = await issueOrReadReceipt({ shopId: ctx.shop.id, orderToken: o.publicToken, userId: ctx.owner.id })
    await close(ctx, o.publicToken, { payment: { amount: 1200, method: 'CASH' } })
    const mine = await issueOrReadReceiptForBuyer({ orderToken: o.publicToken, buyerUserId: ctx.buyer.id })
    expect(mine.receiptNo).toBe(shopFirst.receiptNo)
    expect(await prisma.orderReceipt.count({ where: { orderId: o.id } })).toBe(1)
  })

  it('ปิดงานแต่ยังค้างเงิน → ลูกค้าเปิดไม่ได้ · ไม่ออกเลข', async () => {
    const ctx = await seed()
    const o = await job(ctx, { deposit: 200 })
    await close(ctx, o.publicToken)
    await expect(issueOrReadReceiptForBuyer({ orderToken: o.publicToken, buyerUserId: ctx.buyer.id })).rejects.toMatchObject({
      code: 'ORDER_NOT_ISSUABLE',
    })
    expect(await prisma.orderReceipt.count({ where: { orderId: o.id } })).toBe(0)
  })

  it('ร้านยังไม่ปิดงาน (จ่ายครบแล้วก็ตาม) → ลูกค้าเปิดไม่ได้', async () => {
    const ctx = await seed()
    const o = await job(ctx, { deposit: 1200 })
    await expect(issueOrReadReceiptForBuyer({ orderToken: o.publicToken, buyerUserId: ctx.buyer.id })).rejects.toBeInstanceOf(ReceiptError)
  })

  it('ไม่มาตามนัด (เก็บมัดจำ) → ไม่มีใบเสร็จค่าบริการฝั่งลูกค้า', async () => {
    const ctx = await seed()
    const o = await job(ctx, { deposit: 1200 })
    await close(ctx, o.publicToken, { outcome: 'NO_SHOW' })
    await expect(issueOrReadReceiptForBuyer({ orderToken: o.publicToken, buyerUserId: ctx.buyer.id })).rejects.toMatchObject({
      code: 'ORDER_NOT_ISSUABLE',
    })
  })

  it('คนอื่นเปิดใบเสร็จงานนี้ → หาไม่เจอ (ไม่ใช่ถูกปฏิเสธ)', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await close(ctx, o.publicToken, { payment: { amount: 1200, method: 'CASH' } })
    await expect(issueOrReadReceiptForBuyer({ orderToken: o.publicToken, buyerUserId: ctx.other.id })).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
    })
    expect(await getReceiptViewForBuyer({ orderToken: o.publicToken, buyerUserId: ctx.other.id })).toBeNull()
  })

  it('ออกใบแล้วร้านเปิดงานอีกครั้ง → ลูกค้าเลิกเห็นใบ (ตรวจสดทุกครั้ง) · ฝั่งร้านยังเปิดใบเดิมได้', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await close(ctx, o.publicToken, { payment: { amount: 1200, method: 'CASH' } })
    const mine = await issueOrReadReceiptForBuyer({ orderToken: o.publicToken, buyerUserId: ctx.buyer.id })
    await reopenServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id })
    expect(await getReceiptViewForBuyer({ orderToken: o.publicToken, buyerUserId: ctx.buyer.id })).toBeNull()
    const shopSide = await issueOrReadReceipt({ shopId: ctx.shop.id, orderToken: o.publicToken, userId: ctx.owner.id })
    expect(shopSide.receiptNo).toBe(mine.receiptNo)
  })
})
