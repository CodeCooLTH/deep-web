/**
 * [blocker] feature 00073 — ปิดงาน / เปิดงานอีกครั้ง / ด่านยืนยัน-ยกเลิก ของร้านบริการ (ฐานจริง localhost)
 *
 * ล้างเฉพาะของที่เทสสร้าง (Hard Rule 13) — OrderPayment/OrderEvent ลบตาม Order (onDelete: Cascade)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteTestData, prisma } from '../setup'
import { closeServiceJob, reopenServiceJob } from '@/services/service-job.service'
import { cancelOrder, confirmOrder, updateOrder } from '@/services/order.service'
import {
  ServiceJobAlreadyClosedError,
  ServiceJobClosedLockedError,
  ServiceJobNoShowConfirmError,
  ServiceJobNoShowWithoutAppointmentError,
  ServiceJobNotClosableError,
  ServiceJobNotReopenableError,
  NO_SHOW_REFUND_REASON,
} from '@/lib/service-job'
import { AppointmentFeatureUnavailableError, AppointmentNotStartedError } from '@/lib/appointments'

let userIds: string[] = []
let shopIds: string[] = []
const tag = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

beforeEach(() => {
  userIds = []
  shopIds = []
})
afterEach(async () => {
  await deleteTestData({ userIds, shopIds })
})

async function seed(vertical: 'SERVICE_QUEUE' | 'ONLINE_SALES' = 'SERVICE_QUEUE') {
  const owner = await prisma.user.create({ data: { displayName: 'เจ้าของร้าน', username: `svc_owner_${tag()}`, isShop: true } })
  const buyer = await prisma.user.create({ data: { displayName: 'ลูกค้า', username: `svc_buyer_${tag()}` } })
  userIds.push(owner.id, buyer.id)
  const shop = await prisma.shop.create({
    data: { userId: owner.id, shopName: 'ร้านทดสอบ 00073', businessType: 'INDIVIDUAL', vertical },
  })
  shopIds.push(shop.id)
  const resource = await prisma.serviceResource.create({ data: { shopId: shop.id, name: 'ช่างนิด' } })
  return { owner, buyer, shop, resource }
}

const HOUR = 60 * 60 * 1000
/** ที่นั่งไม่ซ้ำต่องาน — งานหลายใบเวลาทับกันบนคิวเดียวกันชน EXCLUDE "Order_service_seat_no_overlap" (CI ล้ม 23P01 · 2026-10-12) */
let seatSeq = 0
async function job(
  ctx: Awaited<ReturnType<typeof seed>>,
  opts: { appointment?: boolean; startOffsetH?: number; total?: number; deposit?: number; status?: string } = {},
) {
  const start = new Date(Date.now() + (opts.startOffsetH ?? -2) * HOUR)
  const order = await prisma.order.create({
    data: {
      shopId: ctx.shop.id,
      type: 'SERVICE',
      fulfillmentMode: 'NO_SHIPPING',
      status: opts.status ?? 'PENDING',
      totalAmount: opts.total ?? 3500,
      buyerUserId: ctx.buyer.id,
      ...(opts.appointment === false
        ? {}
        : {
            serviceResourceId: ctx.resource.id,
            serviceSeat: ++seatSeq,
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

describe('closeServiceJob — ปิดงานกดครั้งเดียว', () => {
  it('ให้บริการแล้ว + รับเงินที่เหลือ: วันปิด · สถานะนัด · เงิน · ประวัติ ในครั้งเดียว', async () => {
    const ctx = await seed()
    const o = await job(ctx, { deposit: 500 })
    const r = await closeServiceJob({
      shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'],
      outcome: 'SERVED', payment: { amount: 3000, method: 'CASH' },
    })
    expect(r.serviceClosedAt).toBeInstanceOf(Date)
    expect(r.appointmentStatus).toBe('COMPLETED')
    expect(r.money.outstanding).toBe(0)
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } })
    expect(after.status).toBe('PENDING') // BR-RSV-33 ไม่แตะ Order.status — "สำเร็จ" มาจากลูกค้า
    const ev = await prisma.orderEvent.findFirstOrThrow({ where: { orderId: o.id, type: 'SERVICE_CLOSED' } })
    expect(ev.meta).toMatchObject({ outcome: 'SERVED', amount: 3000 })
    expect(ev.actorUserId).toBe(ctx.owner.id)
  })

  it('ปิดทั้งที่ยังค้างเงินได้ (ALLOW_COMPLETE_WITH_OUTSTANDING)', async () => {
    const ctx = await seed()
    const o = await job(ctx, { deposit: 500 })
    const r = await closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'SERVED' })
    expect(r.money.outstanding).toBe(3000)
  })

  it('walk-in (ไม่มีนัด) ปิดได้ทันที · สถานะนัดยังว่าง · ไม่มาตามนัดไม่ได้', async () => {
    const ctx = await seed()
    const o = await job(ctx, { appointment: false })
    await expect(
      closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'NO_SHOW' }),
    ).rejects.toBeInstanceOf(ServiceJobNoShowWithoutAppointmentError)
    const r = await closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'SERVED' })
    expect(r.appointmentStatus).toBeNull()
    expect(r.serviceClosedAt).not.toBeNull()
  })

  it('ไม่มาตามนัด + เก็บมัดจำ (ค่าตั้งต้น) → มัดจำยังอยู่ · meta KEPT', async () => {
    const ctx = await seed()
    const o = await job(ctx, { deposit: 300 })
    const r = await closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'NO_SHOW' })
    expect(r.appointmentStatus).toBe('NO_SHOW')
    expect(r.money.totalReceived).toBe(300)
    const ev = await prisma.orderEvent.findFirstOrThrow({ where: { orderId: o.id, type: 'SERVICE_CLOSED' } })
    expect(ev.meta).toMatchObject({ outcome: 'NO_SHOW', deposit: 'KEPT' })
  })

  it('ไม่มาตามนัด + คืนมัดจำ → void พร้อมเหตุผล (ไม่ลบแถว) · meta REFUNDED', async () => {
    const ctx = await seed()
    const o = await job(ctx, { deposit: 300 })
    const r = await closeServiceJob({
      shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'NO_SHOW', deposit: 'REFUND',
    })
    expect(r.money.totalReceived).toBe(0)
    const pays = await prisma.orderPayment.findMany({ where: { orderId: o.id } })
    expect(pays).toHaveLength(1)
    expect(pays[0].voidedReason).toBe(NO_SHOW_REFUND_REASON)
    expect(pays[0].voidedByUserId).toBe(ctx.owner.id)
  })

  it('ไม่มาตามนัดไม่รับเงินค่าบริการ แม้ส่งมา', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await closeServiceJob({
      shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'NO_SHOW', payment: { amount: 999, method: 'CASH' },
    })
    expect(await prisma.orderPayment.count({ where: { orderId: o.id } })).toBe(0)
  })

  it('ปิดซ้ำไม่ได้ · ปิดงานยกเลิกไม่ได้ · ปิดก่อนเวลานัดไม่ได้ (BR-RSV-34)', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'SERVED' })
    await expect(
      closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'SERVED' }),
    ).rejects.toBeInstanceOf(ServiceJobAlreadyClosedError)

    const cancelled = await job(ctx, { status: 'CANCELLED', startOffsetH: -5 })
    await expect(
      closeServiceJob({ shopId: ctx.shop.id, orderToken: cancelled.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'SERVED' }),
    ).rejects.toBeInstanceOf(ServiceJobNotClosableError)

    const future = await job(ctx, { startOffsetH: 5 })
    await expect(
      closeServiceJob({ shopId: ctx.shop.id, orderToken: future.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'SERVED' }),
    ).rejects.toBeInstanceOf(AppointmentNotStartedError)
  })

  it('ลูกค้ายืนยันไปก่อน (CONFIRMED) ร้านยังปิดงานได้ — ยอดเข้าตอนปิด', async () => {
    const ctx = await seed()
    const o = await job(ctx, { status: 'CONFIRMED' })
    const r = await closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'SERVED' })
    expect(r.serviceClosedAt).not.toBeNull()
  })

  it('[blocker] ร้านขายของใช้ไม่ได้ (ร้านบริการเท่านั้น)', async () => {
    const ctx = await seed('ONLINE_SALES')
    const o = await job(ctx, { appointment: false })
    await expect(
      closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'SERVED' }),
    ).rejects.toBeInstanceOf(AppointmentFeatureUnavailableError)
  })
})

describe('reopenServiceJob — เปิดงานอีกครั้ง (มติ D2)', () => {
  it('ล้างวันปิด · สถานะนัดกลับ · บันทึกประวัติ · มัดจำที่คืนไม่ย้อน', async () => {
    const ctx = await seed()
    const o = await job(ctx, { deposit: 300 })
    await closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'NO_SHOW', deposit: 'REFUND' })
    await reopenServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id })
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { payments: true } })
    expect(after.serviceClosedAt).toBeNull()
    expect(after.appointmentStatus).toBe('SCHEDULED')
    expect(after.payments[0].voidedAt).not.toBeNull()
    expect(await prisma.orderEvent.count({ where: { orderId: o.id, type: 'SERVICE_REOPENED' } })).toBe(1)
  })

  it('ลูกค้ายืนยันแล้ว → เปิดไม่ได้ · ยังไม่ปิด → เปิดไม่ได้', async () => {
    const ctx = await seed()
    const o = await job(ctx, { status: 'CONFIRMED' })
    await closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'SERVED' })
    await expect(reopenServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id })).rejects.toBeInstanceOf(
      ServiceJobNotReopenableError,
    )
    const open = await job(ctx)
    await expect(reopenServiceJob({ shopId: ctx.shop.id, orderToken: open.publicToken, actorUserId: ctx.owner.id })).rejects.toBeInstanceOf(
      ServiceJobNotReopenableError,
    )
  })
})

describe('ด่านที่ทำให้โปรไฟล์จริง', () => {
  it('ลูกค้ายืนยันงานที่ร้านปิดแบบไม่มาตามนัดไม่ได้', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'NO_SHOW' })
    await expect(confirmOrder(o.publicToken, ctx.buyer.id)).rejects.toBeInstanceOf(ServiceJobNoShowConfirmError)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('PENDING')
  })

  it('ลูกค้ายืนยันงานที่ให้บริการแล้วได้ตามปกติ', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'SERVED' })
    await confirmOrder(o.publicToken, ctx.buyer.id)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('CONFIRMED')
  })

  it('งานที่ปิดแล้วยกเลิกไม่ได้ ทั้งร้านและลูกค้า · เปิดงานอีกครั้งแล้วยกเลิกได้', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'SERVED' })
    await expect(cancelOrder(o.publicToken, 'buyer', undefined, ctx.buyer.id)).rejects.toBeInstanceOf(ServiceJobClosedLockedError)
    await expect(cancelOrder(o.publicToken, 'seller', 'SHOP_ISSUE', ctx.owner.id)).rejects.toBeInstanceOf(ServiceJobClosedLockedError)
    await reopenServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id })
    await cancelOrder(o.publicToken, 'seller', 'SHOP_ISSUE', ctx.owner.id)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('CANCELLED')
  })

  it('ร้านบริการเลือก "ลูกค้าไม่มาตามนัด" เป็นเหตุผลยกเลิกไม่ได้แล้ว (ทางเดียวคือปิดงาน)', async () => {
    const ctx = await seed()
    const o = await job(ctx)
    await expect(cancelOrder(o.publicToken, 'seller', 'BUYER_NO_SHOW', ctx.owner.id)).rejects.toThrow()
  })

  it('งานที่ปิดแล้วแก้ไขไม่ได้ (มติ D3)', async () => {
    const ctx = await seed()
    const o = await job(ctx, { appointment: false })
    await closeServiceJob({ shopId: ctx.shop.id, orderToken: o.publicToken, actorUserId: ctx.owner.id, actorRoles: ['OWNER'], outcome: 'SERVED' })
    await expect(
      updateOrder(ctx.shop.id, o.publicToken, { items: [{ name: 'ตัดผม', qty: 1, price: 100 }], type: 'SERVICE' } as never, ctx.owner.id),
    ).rejects.toBeInstanceOf(ServiceJobClosedLockedError)
  })

  it('[blocker] ร้านขายของ: ยกเลิก/ยืนยันเหมือนเดิม (ไม่มีด่านใหม่)', async () => {
    const ctx = await seed('ONLINE_SALES')
    const a = await job(ctx, { appointment: false })
    await confirmOrder(a.publicToken, ctx.buyer.id)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('CONFIRMED')
    const b = await job(ctx, { appointment: false })
    await cancelOrder(b.publicToken, 'seller', 'BUYER_NO_PAYMENT', ctx.owner.id)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CANCELLED')
  })
})
