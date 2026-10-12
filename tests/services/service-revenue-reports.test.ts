/**
 * [blocker] feature 00073 — ยอดขายร้านบริการทุกจอนับ "งานที่ร้านปิดแล้ว" ตามวันปิดงาน และตรงกันทุกจอ
 * (P&L · ชีตยอดขาย · ค้างรับ · ยอดสะสมลูกค้า) · ร้านขายของได้ตัวเลขเดิม (ฐานจริง localhost)
 *
 * ฉาก (ร้านบริการ):
 *   A ให้บริการแล้ว ฿3,500 · สร้าง 28 ก.ย. · ปิด 2 ต.ค. · รับ ฿2,000      → ยอด ต.ค. ฿3,500 · ค้าง ฿1,500
 *   B ลูกค้ายืนยันแล้ว ฿1,000 แต่ร้านยังไม่ปิด                              → ไม่ใช่ยอดขาย
 *   C ไม่มาตามนัด เก็บมัดจำ ฿300 (บิล ฿2,000) · ปิด 3 ต.ค.                 → ยอด ฿300 · ค้าง 0
 *   D ไม่มาตามนัด คืนมัดจำ ฿500 · ปิด 3 ต.ค.                                → ยอด 0
 *   E ยกเลิก                                                                  → ไม่ใช่ยอดขาย
 * รวม ต.ค. = ฿3,800 · ก.ย. = 0 (A สร้าง ก.ย. แต่ปิด ต.ค.)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteTestData, prisma } from '../setup'
import { closeServiceJob } from '@/services/service-job.service'
import { getPnlReport } from '@/services/pnl.service'
import { getSalesSeries } from '@/services/dashboard.service'
import { getReceivables } from '@/services/receivable.service'
import { aggregateShopCustomers, getServiceCustomerSpend } from '@/services/customer-directory.service'
import { resolveDateRange } from '@/lib/date-range'

const userIds: string[] = []
const shopIds: string[] = []
const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const th = (iso: string, h = 12) => new Date(`${iso}T${String(h).padStart(2, '0')}:00:00+07:00`)

let svcShop = ''
let onlineShop = ''
let customerId = ''

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { displayName: 'เจ้าของ', username: `rev_owner_${tag}`, isShop: true } })
  const owner2 = await prisma.user.create({ data: { displayName: 'เจ้าของ 2', username: `rev_owner2_${tag}`, isShop: true } })
  userIds.push(owner.id, owner2.id)
  const svc = await prisma.shop.create({ data: { userId: owner.id, shopName: 'ร้านบริการ', businessType: 'INDIVIDUAL', vertical: 'SERVICE_QUEUE' } })
  const online = await prisma.shop.create({ data: { userId: owner2.id, shopName: 'ร้านขายของ', businessType: 'INDIVIDUAL', vertical: 'ONLINE_SALES' } })
  shopIds.push(svc.id, online.id)
  svcShop = svc.id
  onlineShop = online.id
  const res = await prisma.serviceResource.create({ data: { shopId: svc.id, name: 'ช่าง' } })
  const customer = await prisma.customer.create({ data: { phone: `09${String(Date.now()).slice(-8)}` } })
  customerId = customer.id

  const job = async (key: string, total: number, start: Date, extra: Record<string, unknown> = {}) =>
    prisma.order.create({
      data: {
        publicToken: `rev-${tag}-${key}`,
        shopId: svc.id,
        customerId: customer.id,
        type: 'SERVICE',
        fulfillmentMode: 'NO_SHIPPING',
        totalAmount: total,
        createdAt: th('2026-09-28'),
        serviceResourceId: res.id,
        serviceSeat: 1,
        serviceStart: start,
        serviceEnd: new Date(start.getTime() + 3600_000),
        appointmentStatus: 'SCHEDULED',
        items: { create: [{ name: 'ซ่อมเครื่องยนต์', qty: 1, price: total, cost: 1000 }] },
        ...extra,
      },
    })
  const pay = (orderId: string, amount: number, kind = 'DEPOSIT') =>
    prisma.orderPayment.create({ data: { orderId, shopId: svc.id, kind, amount, method: 'CASH', receivedByUserId: owner.id } })

  const A = await job('A', 3500, th('2026-10-02', 9))
  await pay(A.id, 2000, 'BALANCE')
  await closeServiceJob({ shopId: svc.id, orderToken: A.publicToken, actorUserId: owner.id, outcome: 'SERVED', now: th('2026-10-02', 15) })

  await job('B', 1000, th('2026-10-04', 9), { status: 'CONFIRMED' })

  const C = await job('C', 2000, th('2026-10-03', 9))
  await pay(C.id, 300)
  await closeServiceJob({ shopId: svc.id, orderToken: C.publicToken, actorUserId: owner.id, outcome: 'NO_SHOW', now: th('2026-10-03', 15) })

  const D = await job('D', 2000, th('2026-10-03', 10))
  await pay(D.id, 500)
  await closeServiceJob({ shopId: svc.id, orderToken: D.publicToken, actorUserId: owner.id, outcome: 'NO_SHOW', deposit: 'REFUND', now: th('2026-10-03', 16) })

  await job('E', 900, th('2026-10-05', 9), { status: 'CANCELLED' })

  // ร้านขายของ: ยืนยันแล้ว ฿700 + รอยืนยัน ฿400 ใน ต.ค. (มีวันปิดงานปลอมใส่ไว้ — ต้องไม่ถูกอ่านเลย)
  for (const [k, status, amt] of [['X', 'CONFIRMED', 700], ['Y', 'PENDING', 400]] as const) {
    await prisma.order.create({
      data: {
        publicToken: `rev-${tag}-${k}`, shopId: online.id, totalAmount: amt, status, createdAt: th('2026-10-02'),
        serviceClosedAt: th('2026-09-15'),
        items: { create: [{ name: 'เสื้อ', qty: 1, price: amt, cost: 100 }] },
      },
    })
  }
}, 60_000)

afterAll(async () => {
  await prisma.customer.deleteMany({ where: { id: customerId } }).catch(() => undefined)
  await deleteTestData({ userIds, shopIds })
})

const oct = resolveDateRange('custom', '2026-10-01', '2026-10-31')
const sep = resolveDateRange('custom', '2026-09-01', '2026-09-30')

describe('[blocker] ร้านบริการ — ยอดขาย = งานที่ปิดแล้ว ตามวันปิดงาน', () => {
  it('P&L: ต.ค. = ฿3,800 (A + มัดจำ C) · ก.ย. = 0 · ต้นทุนเฉพาะงานที่ให้บริการ (A)', async () => {
    const r = await getPnlReport(svcShop, oct, 'SERVICE_QUEUE')
    expect(r.revenue).toBe(3800)
    expect(r.cogs).toBe(1000)
    expect(r.orderCount).toBe(3) // A C D (ปิดแล้ว · D ยอด 0)
    const prev = await getPnlReport(svcShop, sep, 'SERVICE_QUEUE')
    expect(prev.revenue).toBe(0)
  })

  it('ชีตยอดขาย: ยอดรวม = P&L · ไม่มี "รอยืนยัน" · รับจริง/ค้างรับ ของงานที่ปิด', async () => {
    const s = await getSalesSeries(svcShop, 'daily', { year: 2026, month: 10 }, true, 'SERVICE_QUEUE')
    expect(s.total).toBe(3800)
    expect(s.confirmedValues.reduce((a, b) => a + b, 0)).toBe(3800)
    expect(s.unconfirmedValues.every((v) => v === 0)).toBe(true)
    expect(s.receivedValues!.reduce((a, b) => a + b, 0)).toBe(2300) // 2,000 (A) + 300 (C)
    expect(s.values[1]).toBe(3500) // วันที่ 2 = วันปิด A (ไม่ใช่ 28 ก.ย. ที่สร้าง)
    expect(s.values[2]).toBe(300) // วันที่ 3 = C (D คืนมัดจำ = 0)
    expect(s.jobStatusCounts).toMatchObject({ total: 0 }) // แถวสถานะงานนับตามวันที่สร้าง — ทุกงานสร้าง 28 ก.ย.
  })

  it('ค้างรับ: ยอดเดียวกับ P&L · ค้าง ฿1,500 (A) · ไม่มาตามนัดไม่ค้าง', async () => {
    const r = await getReceivables(svcShop, oct)
    expect(r.summary.salesTotal).toBe(3800)
    expect(r.summary.receivedTotal).toBe(2300)
    expect(r.summary.outstandingTotal).toBe(1500)
    expect(r.items.map((i) => i.outstandingAmount)).toEqual([1500])
  })

  it('ยอดสะสมลูกค้า (หน้าลูกค้า = แผงแชท) = ฿3,800', async () => {
    const rows = await aggregateShopCustomers(svcShop)
    const me = rows.find((r) => r.totalSpent > 0)
    expect(me?.totalSpent).toBe(3800)
    expect(await getServiceCustomerSpend(svcShop, customerId)).toBe(3800)
  })
})

describe('[blocker] ร้านขายของ — ตัวเลขเดิม ไม่อ่านวันปิดงาน', () => {
  it('P&L = เฉพาะ CONFIRMED ตาม createdAt (฿700)', async () => {
    expect((await getPnlReport(onlineShop, oct, 'ONLINE_SALES')).revenue).toBe(700)
    expect((await getPnlReport(onlineShop, sep, 'ONLINE_SALES')).revenue).toBe(0)
  })
  it('ชีต = ทุกบิล ยืนยัน ฿700 + รอยืนยัน ฿400 ตาม createdAt', async () => {
    const s = await getSalesSeries(onlineShop, 'daily', { year: 2026, month: 10 }, false, 'ONLINE_SALES')
    expect(s.total).toBe(1100)
    expect(s.confirmedValues.reduce((a, b) => a + b, 0)).toBe(700)
    expect(s.unconfirmedValues.reduce((a, b) => a + b, 0)).toBe(400)
    expect(s.receivedValues).toBeUndefined()
  })
})
