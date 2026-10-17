/**
 * [blocker] 00078 — ตัวโหลดรายงานร้านบริการ + บิลของวัน + บันทึกตั้งค่า บนฐานจริง (localhost · HR13 ล้างเฉพาะของที่สร้าง)
 *
 * ฉาก (ร้านบริการ · ต.ค. 2026):
 *   A ปิดงาน 6 ต.ค. ฿3,000 (สร้าง 5 ต.ค.)        → ปิดงานแล้ว วันที่ 6
 *   B ยังไม่ปิด สร้าง 7 ต.ค. ฿8,000               → ยังไม่ปิดงาน วันที่ 7
 *   N ไม่มาตามนัด ปิด 7 ต.ค. ฿5,000 มัดจำ ฿1,000 → ปิดงานแล้ว วันที่ 7 = 1,000 (มัดจำที่เก็บ)
 *   D ยกเลิก ฿500 (7 ต.ค.)                        → ไม่นับ
 *   ค่าใช้จ่าย 7 ต.ค. ฿400 + 6 ต.ค. ฿100
 * ร้านขายของ: route ได้ 404
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

import { deleteTestData, prisma } from '../setup'
import { getServiceReportData, getServiceReportDayBills } from '@/services/service-report.service'
import { updateReportSettings } from '@/services/report-settings.service'
import { buildServiceReport } from '@/lib/service-report/view-model'

const gate = vi.hoisted(() => ({ shop: null as null | { id: string; vertical: string }, forbid: false }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'u' } })) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/shop-capability', () => ({
  requireShopCapability: vi.fn(async () =>
    gate.forbid
      ? { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
      : { ok: true, active: { shop: gate.shop } },
  ),
}))
import { GET as reportGET } from '@/app/api/seller/service-report/route'
import { GET as dayGET } from '@/app/api/seller/service-report/day/route'

const userIds: string[] = []
const shopIds: string[] = []
const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const th = (iso: string, h = 12) => new Date(`${iso}T${String(h).padStart(2, '0')}:00:00+07:00`)
let svc = { id: '', vertical: 'SERVICE_QUEUE' }
let online = { id: '', vertical: 'ONLINE_SALES' }

beforeAll(async () => {
  const o1 = await prisma.user.create({ data: { displayName: 'เจ้าของ', username: `sr_o1_${tag}`, isShop: true } })
  const o2 = await prisma.user.create({ data: { displayName: 'เจ้าของ 2', username: `sr_o2_${tag}`, isShop: true } })
  userIds.push(o1.id, o2.id)
  const s1 = await prisma.shop.create({ data: { userId: o1.id, shopName: 'ร้านบริการ', businessType: 'INDIVIDUAL', vertical: 'SERVICE_QUEUE', reportSettings: { pnl: false, headline: 'RECEIVED', chartStyle: 'AREA' } } })
  const s2 = await prisma.shop.create({ data: { userId: o2.id, shopName: 'ร้านขายของ', businessType: 'INDIVIDUAL', vertical: 'ONLINE_SALES' } })
  shopIds.push(s1.id, s2.id)
  svc = { id: s1.id, vertical: 'SERVICE_QUEUE' }
  online = { id: s2.id, vertical: 'ONLINE_SALES' }
  const bill = (key: string, total: number, createdAt: Date, extra: Record<string, unknown> = {}) =>
    prisma.order.create({
      data: {
        publicToken: `sr-${tag}-${key}`, shopId: s1.id, type: 'SERVICE', fulfillmentMode: 'NO_SHIPPING', totalAmount: total, createdAt,
        buyerName: `ลูกค้า ${key}`, items: { create: [{ name: 'ติดตั้ง', qty: 1, price: total }] }, ...extra,
      },
    })
  await bill('A', 3000, th('2026-10-05'), { serviceClosedAt: th('2026-10-06') })
  await bill('B', 8000, th('2026-10-07'))
  const n = await bill('N', 5000, th('2026-10-03'), { serviceClosedAt: th('2026-10-07', 23), appointmentStatus: 'NO_SHOW' })
  await prisma.orderPayment.create({ data: { orderId: n.id, shopId: s1.id, kind: 'DEPOSIT', amount: 1000, method: 'CASH', receivedAt: th('2026-10-03'), receivedByUserId: o1.id } })
  await bill('D', 500, th('2026-10-07'), { status: 'CANCELLED' })
  await prisma.expense.createMany({
    data: [
      { shopId: s1.id, category: 'OTHER', amount: 400, expenseDate: new Date(Date.UTC(2026, 9, 7)), createdByUserId: o1.id },
      { shopId: s1.id, category: 'SHIPPING', amount: 100, expenseDate: new Date(Date.UTC(2026, 9, 6)), createdByUserId: o1.id },
    ],
  })
})
afterAll(async () => {
  await prisma.expense.deleteMany({ where: { shopId: { in: shopIds } } })
  await prisma.orderPayment.deleteMany({ where: { shopId: { in: shopIds } } })
  await deleteTestData({ userIds, shopIds })
})

describe('[blocker] getServiceReportData', () => {
  it('รายวัน ต.ค.: ปิดงานแล้วตามวันปิด · ยังไม่ปิดงานตามวันเปิดบิล · ไม่มาตามนัด = มัดจำ · ค่าใช้จ่ายตามวันที่', async () => {
    const d = await getServiceReportData(svc.id, svc.vertical, 'daily', { year: 2026, month: 10 })
    expect(d.closed[5]).toBe(3000)
    expect(d.closed[6]).toBe(1000)
    expect(d.unclosed[6]).toBe(8000)
    expect(d.unclosedCounts[6]).toBe(1)
    expect(d.closedCounts[6]).toBe(1)
    expect(d.expense[5]).toBe(100)
    expect(d.expense[6]).toBe(400)
    const m = buildServiceReport(d, 'sales')
    expect(m.totals).toMatchObject({ sales: 12000, closed: 4000, unclosed: 8000, expense: 500, profit: 3500, jobs: 3 })
  })
  it('รายเดือน: bucket ต.ค. = ผลรวมเดือน', async () => {
    const d = await getServiceReportData(svc.id, svc.vertical, 'monthly', { year: 2026 })
    expect(d.labels).toHaveLength(12)
    expect(d.closed[9]).toBe(4000)
    expect(d.unclosed[9]).toBe(8000)
    expect(d.expense[9]).toBe(500)
  })
})

describe('[blocker] getServiceReportDayBills — ผลรวม = ยอดของแถววันนั้น', () => {
  it('7 ต.ค.: N ปิดงาน (1,000) + B ยังไม่ปิด (8,000) · ยกเลิกไม่มา', async () => {
    const bills = await getServiceReportDayBills(svc.id, '2026-10-07')
    expect(bills.map((b) => [b.buyerName, b.amount, b.closed])).toEqual([
      ['ลูกค้า N', 1000, true],
      ['ลูกค้า B', 8000, false],
    ])
    const d = await getServiceReportData(svc.id, svc.vertical, 'daily', { year: 2026, month: 10 })
    expect(bills.reduce((s, b) => s + b.amount, 0)).toBe(d.closed[6] + d.unclosed[6])
  })
})

describe('[blocker] บันทึกตั้งค่า — ไม่ลบค่าเดิมในฐาน', () => {
  it('PATCH กำไร: แถวยังเก็บ pnl/chartStyle เดิม · ค่าที่คืน = แปลงแล้ว', async () => {
    const out = await updateReportSettings(svc.id, { headline: 'NET_PROFIT' })
    expect(out.headline).toBe('NET_PROFIT')
    expect(out.chartStyle).toBe('LINE') // AREA → เส้น
    expect(out.pnl).toBe(true) // สวิตช์เลิกใช้ = ค่าตั้งต้น
    const row = await prisma.shop.findUnique({ where: { id: svc.id }, select: { reportSettings: true } })
    expect(row?.reportSettings).toMatchObject({ pnl: false, chartStyle: 'AREA', headline: 'NET_PROFIT' })
  })
})

describe('[blocker] routes — ร้านบริการเท่านั้น · ด่าน F1', () => {
  const req = (url: string) => new NextRequest(`http://seller.deepth.local${url}`)
  it('ร้านบริการ: 200 · พารามิเตอร์ผิด 400', async () => {
    gate.forbid = false
    gate.shop = svc
    const ok = await reportGET(req('/api/seller/service-report?mode=daily&year=2026&month=10'))
    expect(ok.status).toBe(200)
    expect((await ok.json()).closed[5]).toBe(3000)
    expect((await reportGET(req('/api/seller/service-report?mode=daily&year=2026'))).status).toBe(400)
    const day = await dayGET(req('/api/seller/service-report/day?date=2026-10-07'))
    expect(day.status).toBe(200)
    expect((await day.json()).bills).toHaveLength(2)
    expect((await dayGET(req('/api/seller/service-report/day?date=2026-13-40'))).status).toBe(400)
    expect((await dayGET(req('/api/seller/service-report/day?date=2026-02-31'))).status).toBe(400) // วันไม่มีจริง
    expect((await dayGET(req('/api/seller/service-report/day?date=2028-02-29'))).status).toBe(200) // ปีอธิกสุรทิน
  })
  it('ร้านขายของ: 404 ทั้งสอง route', async () => {
    gate.shop = online
    expect((await reportGET(req('/api/seller/service-report?mode=daily&year=2026&month=10'))).status).toBe(404)
    expect((await dayGET(req('/api/seller/service-report/day?date=2026-10-07'))).status).toBe(404)
  })
  it('ไม่ผ่านด่าน F1 (ไม่ใช่เจ้าของ): 403 ก่อนดูอะไรทั้งนั้น', async () => {
    gate.forbid = true
    expect((await reportGET(req('/api/seller/service-report?mode=daily&year=2026&month=10'))).status).toBe(403)
    expect((await dayGET(req('/api/seller/service-report/day?date=2026-10-07'))).status).toBe(403)
    gate.forbid = false
  })
})
