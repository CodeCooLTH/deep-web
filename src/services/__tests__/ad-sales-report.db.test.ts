/**
 * ad-sales-report.db.test.ts — 00091 FR-008: รายงานยอดขายตามโฆษณา + parity กับรายงานยอดขายรายสินค้า (HR16)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบ scope ด้วย id ที่เทสสร้างเท่านั้น
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'

vi.mock('server-only', () => ({}))

import { getAdSalesReport, listOrdersForAd } from '@/services/ad-sales-report.service'
import { getProductSalesMonth } from '@/services/product-sales-series.service'
import { thaiMidnightUtc } from '@/lib/date-range'
import type { SpendResult, SpendSource } from '@/services/meta-ads-spend.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const run = randomUUID().slice(0, 8)
const x = {} as Record<'user' | 'shop' | 'prod' | 'channel' | 'conv1' | 'conv2' | 'conv3', string>
const orderIds: string[] = []

// ตุลาคม 2569-เดือนในอดีต: 2026-10-01 ถึง 2026-10-31 (ตัดวันตามเวลาไทย)
const gte = thaiMidnightUtc(2026, 9, 1)
const lt = thaiMidnightUtc(2026, 10, 1)
const inRange = (d: number) => new Date(Date.UTC(2026, 9, d, 5, 0, 0))

const mkOrder = async (o: { adId?: string; adTitle?: string; status?: string; at: Date; items: [number, number][]; conv?: string; photo?: string; province?: string; channel?: boolean }) => {
  const r = await prisma.order.create({
    data: {
      shopId: x.shop, conversationId: o.conv ?? null, type: 'PHYSICAL', status: o.status ?? 'PENDING', createdAt: o.at,
      totalAmount: o.items.reduce((s, [q, p]) => s + q * p, 0),
      shopChannelId: o.channel ? x.channel : null, shippingAddress: o.province ? { province: o.province } : undefined,
      adId: o.adId ?? null, adTitle: o.adTitle ?? null, adPhotoFileId: o.photo ?? null, adClickedAt: o.adId ? o.at : null,
      items: { create: o.items.map(([qty, price]) => ({ name: 'สินค้า', qty, price, productId: x.prod })) },
    } as never,
    select: { id: true },
  })
  orderIds.push(r.id)
  return r.id
}
const click = (conversationId: string, o: { source?: string; adId: string; adTitle?: string; at: Date; photo?: string }) =>
  prisma.conversationAdReferral.create({
    data: { conversationId, source: o.source ?? 'ADS', adId: o.adId, adTitle: o.adTitle ?? null, photoFileId: o.photo ?? null, receivedAt: o.at },
  })

describe.skipIf(!isLocal)('00091 รายงานยอดขายตามโฆษณา (DB จริง)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `adr-${run}`, username: `adr_${run}` }, select: { id: true } })
    x.user = u.id
    x.shop = (await prisma.shop.create({ data: { userId: u.id, shopName: `adr-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })).id
    x.prod = (await prisma.product.create({ data: { shopId: x.shop, name: `p-${run}`, price: 100, fulfillmentMode: 'NO_SHIPPING' } as never, select: { id: true } })).id
    x.channel = (await prisma.shopChannel.create({
      data: { shopId: x.shop, provider: 'MESSENGER', externalId: `pg-${run}`, name: 'p', accessTokenEnc: 'x', connectedByUserId: u.id },
      select: { id: true },
    })).id
    const mk = async (s: string) => {
      const c = await prisma.externalContact.create({ data: { shopChannelId: x.channel, externalUserId: `psid-${s}-${run}` }, select: { id: true } })
      return (await prisma.conversation.create({ data: { shopId: x.shop, channel: 'MESSENGER', shopChannelId: x.channel, externalContactId: c.id }, select: { id: true } })).id
    }
    x.conv1 = await mk('1'); x.conv2 = await mk('2'); x.conv3 = await mk('3')

    await click(x.conv1, { adId: 'AD1', adTitle: 'โปรล้อแม็ก (เก่า)', at: inRange(2) })
    await click(x.conv1, { adId: 'AD1', adTitle: 'โปรล้อแม็ก', photo: 'ph1', at: inRange(3) }) // ห้องเดียวคลิกซ้ำ = 1
    await click(x.conv2, { adId: 'AD1', adTitle: 'โปรล้อแม็ก', at: inRange(4) })
    await click(x.conv1, { adId: 'AD2', adTitle: 'ไฟหน้า LED', at: inRange(5) })
    await click(x.conv3, { adId: 'AD3', adTitle: 'ไม่ปิดการขาย', at: inRange(6) })
    await click(x.conv3, { source: 'SHORTLINK', adId: 'SL', at: inRange(6) })
    await click(x.conv3, { adId: 'AD1', at: new Date(Date.UTC(2026, 8, 20)) }) // นอกช่วง

    await mkOrder({ adId: 'AD1', adTitle: 'โปรล้อแม็ก', at: inRange(10), items: [[2, 100]], conv: x.conv1, province: 'กรุงเทพมหานคร', channel: true }) // 200
    await mkOrder({ adId: 'AD1', adTitle: 'โปรล้อแม็ก', at: inRange(11), items: [[1, 50]], conv: x.conv2, channel: true }) // 50 (ไม่มีที่อยู่)
    await mkOrder({ at: inRange(12), items: [[3, 100]] }) // ไม่ใช่แอด 300
    await mkOrder({ adId: 'AD1', status: 'CANCELLED', at: inRange(13), items: [[9, 100]], conv: x.conv1 }) // ยกเลิก: ไม่นับยอด
    await mkOrder({ adId: 'AD2', at: new Date(Date.UTC(2026, 8, 25)), items: [[1, 999]], conv: x.conv1, channel: true }) // นอกช่วง = ช่วงก่อนหน้า
    await mkOrder({ adId: 'AD9', adTitle: 'คลิกก่อนช่วง', photo: 'ph9', at: inRange(14), items: [[1, 70]], province: 'เชียงใหม่' }) // ไม่มีคลิกในช่วง → ยังมีแถว
  })

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    await prisma.conversation.deleteMany({ where: { id: { in: [x.conv1, x.conv2, x.conv3] } } })
    await prisma.shopChannel.deleteMany({ where: { id: x.channel } })
    await prisma.product.deleteMany({ where: { id: x.prod } })
    await prisma.shop.deleteMany({ where: { id: x.shop } })
    await prisma.user.deleteMany({ where: { id: x.user } })
    await prisma.$disconnect()
  })

  it('หนึ่งแถวต่อแอด: แชท(ห้องไม่ซ้ำ) · คำสั่งซื้อ · อัตรา · ยอด · เฉลี่ย · ยกเลิก', async () => {
    const r = await getAdSalesReport(x.shop, { from: gte, to: lt })
    const by = Object.fromEntries(r.rows.map((a) => [a.adId, a]))
    expect(by.AD1).toMatchObject({ adTitle: 'โปรล้อแม็ก', adPhotoFileId: 'ph1', chats: 2, orders: 2, closeRatePct: 100, sales: 250, avgPerOrder: 125, cancelledOrReturned: 1 })
    expect(by.AD2).toMatchObject({ chats: 1, orders: 0, closeRatePct: 0, sales: 0, avgPerOrder: null })
    expect(by.AD3).toMatchObject({ chats: 1, orders: 0 }) // แอดที่ไม่ปิดการขายยังแสดง
    expect(by.AD9).toMatchObject({ chats: 0, orders: 1, closeRatePct: null, adTitle: 'คลิกก่อนช่วง', adPhotoFileId: 'ph9', sales: 70 })
    expect(by.SL).toBeUndefined() // SHORTLINK ไม่นับ
    expect(r.rows[0].adId).toBe('AD1') // เรียงตามยอดขายมาก→น้อย
    expect(r.summary).toMatchObject({ adSales: 320, nonAdSales: 300, adOrders: 3, nonAdOrders: 1 })
    expect(r.summary.adSharePct).toBeCloseTo(51.61, 1)
    expect(r.hasAnyAdData).toBe(true)
  })

  it('parity (HR16): ยอดจากแอด + ไม่ใช่แอด = ยอดรวมของรายงานยอดขายรายสินค้าในช่วงเดียวกัน', async () => {
    const ads = await getAdSalesReport(x.shop, { from: gte, to: lt })
    const prod = await getProductSalesMonth(x.shop, 2026, 9)
    const productTotal = prod.rows.reduce((s, p) => s + p.totalAmount, 0)
    expect(ads.summary.adSales + ads.summary.nonAdSales).toBe(productTotal)
    expect(ads.summary.adOrders + ads.summary.nonAdOrders).toBe(prod.orderCount)
  })

  it('ตัวกรองเพจ: เพจอื่น = ไม่มีแชท/คำสั่งซื้อ', async () => {
    const r = await getAdSalesReport(x.shop, { from: gte, to: lt, shopChannelId: 'no-such-channel' })
    expect(r.rows).toEqual([])
    expect(r.summary.adSharePct).toBeNull()
  })

  it('ช่วงก่อนหน้า = เลื่อนถอยหลังเท่าความยาวช่วง (31 วัน → 31 ส.ค.–30 ก.ย.) + ป้ายช่วง', async () => {
    const r = await getAdSalesReport(x.shop, { from: gte, to: lt })
    expect(r.range).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(r.prevRange).toEqual({ from: '2026-08-31', to: '2026-09-30' })
    expect(r.previous).toEqual({ adSales: 999, adOrders: 1, chats: 1, closeRatePct: 100, nonAdSales: 0 })
    expect(r.summary).toMatchObject({ chats: 3, closeRatePct: 100 }) // 3 ห้ามไม่ซ้ำ (conv1 กดสองแอดนับ 1) · 3 ใบ ÷ 3
  })

  it('รายวัน: ผลรวม daily.adSales = summary = ผลรวมแถวตาราง · วันว่าง = 0 · ช่วงก่อนหน้าเรียงตามตำแหน่งวัน', async () => {
    const r = await getAdSalesReport(x.shop, { from: gte, to: lt })
    expect(r.daily).toHaveLength(31)
    expect(r.prevDaily).toHaveLength(31)
    const sum = (a: number[]) => Math.round(a.reduce((s, v) => s + v, 0) * 100) / 100
    expect(sum(r.daily.map((d) => d.adSales))).toBe(r.summary.adSales)
    expect(sum(r.daily.map((d) => d.nonAdSales))).toBe(r.summary.nonAdSales)
    expect(sum(r.daily.map((d) => d.adOrders))).toBe(r.summary.adOrders)
    expect(sum(r.rows.map((a) => a.sales))).toBe(r.summary.adSales)
    expect(r.daily[0]).toEqual({ day: '2026-10-01', adSales: 0, nonAdSales: 0, adOrders: 0, spend: 0, coveredSales: 0 })
    expect(r.daily[9]).toMatchObject({ day: '2026-10-10', adSales: 200, adOrders: 1 })
    expect(r.daily[11]).toMatchObject({ nonAdSales: 300 })
    expect(sum(r.prevDaily.map((d) => d.adSales))).toBe(r.previous.adSales)
  })

  it('จังหวัด (เฉพาะแอด · กทม. รวมชื่อเดียว) · ช่องทาง (ยอดทั้งร้าน) · เพจ — ผลรวมตรงกับยอดรวม', async () => {
    const r = await getAdSalesReport(x.shop, { from: gte, to: lt })
    expect(Object.fromEntries(r.provinces.map((p) => [String(p.name), p.sales]))).toEqual({ กรุงเทพ: 200, เชียงใหม่: 70, null: 50 }) // กทม. ผ่าน canonicalProvince
    expect(r.provinces.reduce((s, p) => s + p.sales, 0)).toBe(r.summary.adSales)
    expect(Object.fromEntries(r.channels.map((c) => [String(c.provider), c.sales]))).toEqual({ MESSENGER: 250, null: 370 })
    expect(r.channels.reduce((s, c) => s + c.sales, 0)).toBe(r.summary.adSales + r.summary.nonAdSales)
    expect(r.pages).toEqual([{ shopChannelId: x.channel, name: 'p', provider: 'MESSENGER', avatarUrl: null, sales: 250, prevSales: 999 }])
  })

  it('ที่อยู่ว่าง → จังหวัด null ("ไม่ระบุ") · ยอดยังรวมครบ', async () => {
    const r = await getAdSalesReport(x.shop, { from: thaiMidnightUtc(2026, 9, 11), to: thaiMidnightUtc(2026, 9, 12) })
    expect(r.provinces).toEqual([{ name: null, sales: 50 }])
    const r2 = await getAdSalesReport(x.shop, { from: thaiMidnightUtc(2026, 9, 12), to: thaiMidnightUtc(2026, 9, 13) })
    expect(r2.summary.adSales).toBe(0)
    expect(r2.provinces).toEqual([])
    expect(r2.channels).toEqual([{ provider: null, sales: 300 }])
  })

  it('ช่วงวันเดียว = รายชั่วโมง 24 ช่อง', async () => {
    const r = await getAdSalesReport(x.shop, { from: thaiMidnightUtc(2026, 9, 10), to: thaiMidnightUtc(2026, 9, 11) })
    expect(r.daily).toHaveLength(24)
    expect(r.daily[12]).toMatchObject({ adSales: 200 }) // 12:00 น. ไทย
    expect(r.prevDaily).toHaveLength(24)
  })

  it('ชีตคำสั่งซื้อของแอด: ใบของแอดนั้นเท่านั้น รวมใบยกเลิก · ร้านอื่นไม่เห็น', async () => {
    const l = await listOrdersForAd(x.shop, 'ONLINE_SALES', 'AD1', { from: gte, to: lt })
    expect(l.items).toHaveLength(3)
    expect(l.items.map((i) => i.status).sort()).toEqual(['CANCELLED', 'PENDING', 'PENDING'])
    const other = await listOrdersForAd('another-shop-id', 'ONLINE_SALES', 'AD1', { from: gte, to: lt })
    expect(other.items).toEqual([])
  })

  describe('ค่าโฆษณา / ROAS (FR-010) — แหล่ง spend ฉีดเข้า ไม่ยิง Meta', () => {
    const ok = (rows: SpendResult['rows'], tz = 'Asia/Bangkok'): SpendSource => async () => ({ state: 'OK', accountName: 'บัญชีเทส', currency: 'THB', tz, rows })
    const spendRows = [
      { adId: 'AD1', adName: 'โปรล้อแม็ก', day: '2026-10-10', spend: 100 },
      { adId: 'AD1', adName: 'โปรล้อแม็ก', day: '2026-10-11', spend: 50 },
      { adId: 'AD2', adName: 'ไฟหน้า LED', day: '2026-10-05', spend: 40 },
      { adId: 'GHOST', adName: 'แอดผี', day: '2026-10-20', spend: 60 },
      { adId: 'AD2', adName: 'ไฟหน้า LED', day: '2026-09-25', spend: 333 }, // ช่วงก่อนหน้า
    ]

    it('parity (HR16): Σ daily.spend = summary.spend = Σ spend รายแถว (รวมแถวผี)', async () => {
      const r = await getAdSalesReport(x.shop, { from: gte, to: lt }, { spendSource: ok(spendRows) })
      const sum = (a: number[]) => Math.round(a.reduce((q, v) => q + v, 0) * 100) / 100
      expect(r.ads.state).toBe('OK')
      expect(r.ads.summary.spend).toBe(250)
      expect(sum(r.daily.map((d) => d.spend))).toBe(250)
      expect(sum(r.rows.map((a) => a.spend ?? 0))).toBe(250)
      expect(r.daily[9].spend).toBe(100)
      expect(sum(r.prevDaily.map((d) => d.spend))).toBe(r.ads.summary.prevSpend)
      expect(r.ads.summary.prevSpend).toBe(333)
    })

    it('ROAS = ยอด Deep ของแอดที่มี spend>0 ÷ Σ spend · ต้นทุน/ใบ ชุดเดียวกัน · แอดไม่พบ spend ไม่นับ + uncoveredAds', async () => {
      const r = await getAdSalesReport(x.shop, { from: gte, to: lt }, { spendSource: ok(spendRows) })
      // covered = AD1(250, 2 ใบ) + AD2(0) ; AD9 (70, 1 ใบ) ไม่มี spend → ไม่นับ
      expect(r.ads.summary).toMatchObject({ roas: 1, costPerOrder: 125, uncoveredAds: 1 })
      expect(r.ads.summary.prevRoas).toBe(3) // 999 ÷ 333
      expect(r.ads.summary.prevCostPerOrder).toBe(333)
      expect(r.daily.reduce((s, d) => s + d.coveredSales, 0)).toBe(250)
      const by = Object.fromEntries(r.rows.map((a) => [a.adId, a]))
      expect(by.AD1).toMatchObject({ spend: 150, noChats: false })
      expect(by.AD9.spend).toBeNull()
      expect(by.GHOST).toMatchObject({ spend: 60, noChats: true, chats: 0, orders: 0, sales: 0, adTitle: 'แอดผี' })
    })

    it('กรองเพจ: spend นับเฉพาะแอดที่มีแชทในเพจ · ไม่มีแถวผี', async () => {
      const r = await getAdSalesReport(x.shop, { from: gte, to: lt, shopChannelId: x.channel }, { spendSource: ok(spendRows) })
      expect(r.ads.summary.spend).toBe(190)
      expect(r.rows.some((a) => a.noChats)).toBe(false)
    })

    it('state ≠ OK: ไม่มีตัวเลข spend/ROAS · ยอดขายยังถูก · tz ต่าง = tzMismatch', async () => {
      for (const state of ['AUTH', 'ERROR', 'CURRENCY', 'NOT_CONNECTED'] as const) {
        const r = await getAdSalesReport(x.shop, { from: gte, to: lt }, { spendSource: async () => ({ state, accountName: null, currency: 'USD', tz: null, rows: [] }) })
        expect(r.ads.state).toBe(state)
        expect(r.ads.summary).toEqual({ spend: null, prevSpend: null, roas: null, prevRoas: null, costPerOrder: null, prevCostPerOrder: null, uncoveredAds: 0 })
        expect(r.rows.every((a) => a.spend === null && !a.noChats)).toBe(true)
        expect(r.summary.adSales).toBe(320)
      }
      const tz = await getAdSalesReport(x.shop, { from: gte, to: lt }, { spendSource: ok(spendRows, 'America/Los_Angeles') })
      expect(tz.ads.tzMismatch).toBe(true)
    })

    it('แหล่ง spend ล่ม (throw) → ERROR ไม่ทำให้รายงานล่ม · ขอช่วง prevFrom..to ถูกต้อง', async () => {
      const calls: string[][] = []
      const r = await getAdSalesReport(x.shop, { from: gte, to: lt }, { spendSource: async (_s, a, b) => { calls.push([a, b]); throw new Error('boom') } })
      expect(r.ads.state).toBe('ERROR')
      expect(calls).toEqual([['2026-08-31', '2026-10-31']])
    })
  })
})
