/**
 * ads-profit-compare.db.test.ts — 00096 P1 ตัวเทียบ "เมื่อวาน ณ เวลาเดียวกัน" + "เฉลี่ย 7 วันก่อน" บน DB จริง
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบ scope ด้วย id ที่เทสสร้างเท่านั้น
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'

vi.mock('server-only', () => ({}))

import { getAdsProfitReport } from '@/services/ads-profit.service'
import { thaiMidnightUtc } from '@/lib/date-range'
import type { HourlySource, SpendSource } from '@/services/meta-ads-spend.service'

const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(process.env.DATABASE_URL ?? '')
const run = randomUUID().slice(0, 8)
let userId = '', shopId = ''
const orderIds: string[] = []
// เวลาไทย = UTC+7 · "วันนี้" = 2026-10-10
const thai = (d: number, h: number) => new Date(Date.UTC(2026, 9, d, h - 7, 0, 0))
const today = { from: thaiMidnightUtc(2026, 9, 10), to: thaiMidnightUtc(2026, 9, 11) }
const now = thai(10, 10)

const spend: SpendSource = async (_s, since, until) => ({
  state: 'OK', accountName: 'x', currency: 'THB', tz: 'Asia/Bangkok',
  // 7 วันก่อน (3–9 ต.ค.) วันละ 10 · ช่วงอื่นไม่สน
  rows: since === '2026-10-03' && until === '2026-10-09'
    ? Array.from({ length: 7 }, (_, i) => ({ adId: 'A1', adName: null, day: `2026-10-0${3 + i}`, spend: 10, campaignId: null, campaignName: null, adsetId: null, adsetName: null, impressions: null, clicks: null, chatsMeta: null }))
    : [],
})
const hourly: HourlySource = async (_s, day, beforeHour) => (day === '2026-10-09' && beforeHour === 10 ? { state: 'OK', spend: 55.5 } : { state: 'ERROR', spend: 0 })
const noDetails = async () => null

describe.skipIf(!isLocal)('00096 P1 ตัวเทียบรายวัน (DB จริง)', () => {
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { displayName: `cmp-${run}`, username: `cmp_${run}` }, select: { id: true } })).id
    shopId = (await prisma.shop.create({ data: { userId, shopName: `cmp-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })).id
    // เมื่อวาน 03:00 (ก่อนเวลาเดียวกัน) + 20:00 (หลัง) · 3–8 ต.ค. วันละใบ (6 ใบ + เมื่อวาน 2 = 8 ใน 7 วัน)
    const at = [thai(9, 3), thai(9, 20), ...[3, 4, 5, 6, 7, 8].map((d) => thai(d, 12))]
    for (const t of at) {
      const o = await prisma.order.create({
        data: { shopId, type: 'PHYSICAL', status: 'PENDING', createdAt: t, totalAmount: 700, adId: 'A1', adTitle: 'แอด', adClickedAt: t, items: { create: [{ name: 'ของ', qty: 1, price: 700, cost: 300 }] } } as never,
        select: { id: true },
      })
      orderIds.push(o.id)
    }
  })
  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    await prisma.shop.deleteMany({ where: { id: shopId } })
    await prisma.user.deleteMany({ where: { id: userId } })
  })

  it('วันนี้: เมื่อวาน ณ เวลาเดียวกัน = ใบก่อน 10:00 เมื่อวาน + ค่าโฆษณารายชั่วโมงก่อน 10 โมง', async () => {
    const r = await getAdsProfitReport(shopId, null, today, { spendSource: spend, detailsSource: noDetails, hourlySource: hourly, now })
    expect(r.sameTime).toEqual({ spend: 55.5, orders: 1, revenue: 700, profitBefore: 400, cutoffHour: 10 })
  })
  it('เฉลี่ย 7 วันก่อน: 8 ใบ / 7 · ค่าโฆษณา 70 / 7', async () => {
    const r = await getAdsProfitReport(shopId, null, today, { spendSource: spend, detailsSource: noDetails, hourlySource: hourly, now })
    expect(r.avg7).toEqual({ spend: 10, orders: 1.14, revenue: 800, profitBefore: 457.14 })
  })
  it('Meta ไม่มีรายชั่วโมง = spend null (ไม่เทียบกับ 0 ปลอม) · วันที่จบแล้วไม่มี sameTime', async () => {
    const r = await getAdsProfitReport(shopId, null, today, { spendSource: spend, detailsSource: noDetails, hourlySource: async () => ({ state: 'UNAVAILABLE', spend: 0 }), now })
    expect(r.sameTime?.spend).toBeNull()
    const past = await getAdsProfitReport(shopId, null, { from: thaiMidnightUtc(2026, 9, 9), to: thaiMidnightUtc(2026, 9, 10) }, { spendSource: spend, detailsSource: noDetails, hourlySource: hourly, now })
    expect(past.sameTime).toBeNull()
    expect(past.avg7).not.toBeNull()
  })
  it('ช่วงหลายวัน = ไม่มีตัวเทียบ P1', async () => {
    const r = await getAdsProfitReport(shopId, null, { from: thaiMidnightUtc(2026, 9, 1), to: thaiMidnightUtc(2026, 9, 11) }, { spendSource: spend, detailsSource: noDetails, hourlySource: hourly, now })
    expect(r.sameTime).toBeNull()
    expect(r.avg7).toBeNull()
  })
})
