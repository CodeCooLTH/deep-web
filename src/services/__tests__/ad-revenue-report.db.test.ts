/**
 * ad-revenue-report.db.test.ts — 00091 เฟส 3 (FR-011..FR-020) บน DB จริง
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบ scope ด้วย id ที่เทสสร้างเท่านั้น
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'

vi.mock('server-only', () => ({}))

import { getAdRevenueReport } from '@/services/ad-revenue-report.service'
import { getAdSalesReport } from '@/services/ad-sales-report.service'
import { thaiMidnightUtc } from '@/lib/date-range'
import type { SpendResult, SpendSource } from '@/services/meta-ads-spend.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const run = randomUUID().slice(0, 8)
const x = {} as Record<'user' | 'shop' | 'otherShop' | 'prodA' | 'conv' | 'contact' | 'channel' | 'cust1' | 'cust2', string>
const orderIds: string[] = []
const customerIds: string[] = []

const gte = thaiMidnightUtc(2026, 9, 1)
const lt = thaiMidnightUtc(2026, 10, 1)
const at = (d: number, h = 5) => new Date(Date.UTC(2026, 9, d, h, 0, 0))

type Item = { qty: number; price: number; cost?: number; custom?: string }
const mkOrder = async (o: {
  shop?: string; adId?: string; status?: string; at: Date; items: Item[]; total?: number; conv?: boolean
  customer?: string; confirmedPaid?: boolean; cod?: boolean; clickedAt?: Date
}) => {
  const r = await prisma.order.create({
    data: {
      shopId: o.shop ?? x.shop, conversationId: o.conv ? x.conv : null, type: 'PHYSICAL', status: o.status ?? 'PENDING', createdAt: o.at,
      totalAmount: o.total ?? o.items.reduce((s, i) => s + i.qty * i.price, 0),
      customerId: o.customer ?? null,
      paymentConfirmedAt: o.confirmedPaid ? o.at : null, codReceivedAt: o.cod ? o.at : null,
      adId: o.adId ?? null, adTitle: o.adId ? `แอด ${o.adId}` : null, adClickedAt: o.adId ? o.clickedAt ?? o.at : null,
      items: {
        create: o.items.map((i) => ({
          name: i.custom ?? 'สินค้า A', qty: i.qty, price: i.price, cost: i.cost ?? null, productId: i.custom ? null : x.prodA,
        })),
      },
    } as never,
    select: { id: true },
  })
  orderIds.push(r.id)
  return r.id
}

const spendRows: SpendResult['rows'] = [
  { adId: 'AD1', adName: 'แอด 1', day: '2026-10-03', spend: 100, campaignId: 'C1', campaignName: 'แคมเปญโช๊ค', adsetId: 'S1', adsetName: 'ชุด Wave', impressions: null, clicks: null, chatsMeta: null },
  { adId: 'AD3', adName: 'ใช้เงินไม่มีใบ', day: '2026-10-04', spend: 40, campaignId: 'C1', campaignName: 'แคมเปญโช๊ค', adsetId: 'S2', adsetName: 'ชุด 2', impressions: null, clicks: null, chatsMeta: null },
  { adId: 'AD1', adName: 'แอด 1', day: '2026-09-20', spend: 70, campaignId: 'C1', campaignName: 'แคมเปญโช๊ค', adsetId: 'S1', adsetName: 'ชุด Wave', impressions: null, clicks: null, chatsMeta: null }, // ช่วงก่อน
]
const okSpend: SpendSource = async () => ({ state: 'OK', accountName: 'บัญชี', currency: 'THB', tz: 'Asia/Bangkok', rows: spendRows })
const errSpend: SpendSource = async () => ({ state: 'ERROR', accountName: null, currency: null, tz: null, rows: [] })

describe.skipIf(!isLocal)('00091 เฟส 3 วิเคราะห์ยอดขายจากโฆษณา (DB จริง)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `arv-${run}`, username: `arv_${run}` }, select: { id: true } })
    x.user = u.id
    x.shop = (await prisma.shop.create({ data: { userId: u.id, shopName: `arv-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })).id
    x.otherShop = (await prisma.shop.create({ data: { userId: u.id, shopName: `arv2-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })).id
    x.prodA = (await prisma.product.create({ data: { shopId: x.shop, name: `โช๊ค-${run}`, sku: 'SK-1', price: 100, fulfillmentMode: 'NO_SHIPPING' } as never, select: { id: true } })).id
    const ch = await prisma.shopChannel.create({
      data: { shopId: x.shop, provider: 'MESSENGER', externalId: `pg-${run}`, name: 'p', accessTokenEnc: 'x', connectedByUserId: u.id }, select: { id: true },
    })
    x.channel = ch.id
    const c = await prisma.externalContact.create({ data: { shopChannelId: ch.id, externalUserId: `psid-${run}` }, select: { id: true } })
    x.contact = c.id
    x.conv = (await prisma.conversation.create({ data: { shopId: x.shop, channel: 'MESSENGER', shopChannelId: ch.id, externalContactId: c.id }, select: { id: true } })).id
    for (const k of ['cust1', 'cust2'] as const) {
      const cu = await prisma.customer.create({ data: { phone: `09${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}` }, select: { id: true } })
      x[k] = cu.id
      customerIds.push(cu.id)
    }
    await prisma.conversationAdReferral.create({ data: { conversationId: x.conv, source: 'ADS', adId: 'AD1', adTitle: 'แอด 1', receivedAt: at(2) } })

    // cust2 เคยซื้อก่อนช่วง (ไม่ใช่แอด) ⇒ ใบจากแอดของ cust2 = ลูกค้าเดิม
    await mkOrder({ at: new Date(Date.UTC(2026, 6, 1)), items: [{ qty: 1, price: 10 }], customer: x.cust2, status: 'CONFIRMED' })

    // AD1: ใหม่ (cust1 ใบแรก จ่ายแล้ว) · cust1 ซื้อซ้ำ (ยังไม่บันทึกรับเงิน) · ยกเลิก · ตีกลับ
    await mkOrder({ adId: 'AD1', at: at(10), items: [{ qty: 2, price: 100, cost: 30 }], customer: x.cust1, confirmedPaid: true, conv: true, clickedAt: at(8) })
    await mkOrder({ adId: 'AD1', at: at(12), items: [{ qty: 1, price: 50 }], customer: x.cust1, status: 'CONFIRMED', conv: true, clickedAt: at(8) })
    await mkOrder({ adId: 'AD1', at: at(13), items: [{ qty: 9, price: 100 }], status: 'CANCELLED', conv: true })
    await mkOrder({ adId: 'AD1', at: at(14), items: [{ qty: 1, price: 100 }], status: 'RETURNED', customer: x.cust2, conv: true })
    // AD2: บิลหลายสินค้า + ส่วนลดท้ายบิล 20 · COD รับแล้ว · ไม่มีลูกค้า · รายการพิมพ์เองไม่มีต้นทุน
    await mkOrder({ adId: 'AD2', at: at(15, 13), items: [{ qty: 2, price: 100, cost: 30 }, { qty: 1, price: 50, custom: 'ของแถม' }], total: 230, status: 'CONFIRMED', cod: true, conv: true })
    // ไม่ใช่แอด: จากแชท 300 · ไม่ได้มาจากแชท 70
    await mkOrder({ at: at(16), items: [{ qty: 3, price: 100 }], conv: true, status: 'CONFIRMED' })
    await mkOrder({ at: at(17), items: [{ qty: 1, price: 70 }], status: 'CONFIRMED' })
    // ร้านอื่นที่มีรหัสแอดเดียวกัน — ห้ามโผล่ (tenant)
    await mkOrder({ shop: x.otherShop, adId: 'AD1', at: at(10), items: [{ qty: 1, price: 5000 }], status: 'CONFIRMED' })
    // ช่วงก่อนหน้า
    await mkOrder({ adId: 'AD1', at: new Date(Date.UTC(2026, 8, 20, 5)), items: [{ qty: 1, price: 999 }], confirmedPaid: true })
  })

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } })
    await prisma.conversationAdReferral.deleteMany({ where: { conversationId: x.conv } })
    await prisma.conversation.deleteMany({ where: { id: x.conv } })
    await prisma.externalContact.deleteMany({ where: { id: x.contact } })
    await prisma.shopChannel.deleteMany({ where: { id: x.channel } })
    await prisma.product.deleteMany({ where: { id: x.prodA } })
    await prisma.shop.deleteMany({ where: { id: { in: [x.shop, x.otherShop] } } })
    await prisma.user.deleteMany({ where: { id: x.user } })
  })

  const report = (spendSource: SpendSource = okSpend) => getAdRevenueReport(x.shop, null, { from: gte, to: lt }, { spendSource })

  it('FR-011 ยอดขาย = รับเงินแล้ว + ยังไม่บันทึก · ไม่นับยกเลิก · ร้านอื่นไม่โผล่', async () => {
    const r = await report()
    // ร้านขายของ: salesOrderWhere ตัดเฉพาะยกเลิก ⇒ 200 + 50 + 100(ตีกลับ) + 250(AD2 ก่อนส่วนลดท้ายบิล)
    expect(r.summary).toMatchObject({ sales: 600, orders: 4, collected: 450, collectedOrders: 2, unrecorded: 150, avgPerOrder: 150 })
    // คลิกวันที่ 8 สั่ง 10/12 = 2,4 วัน · ตีกลับ/AD2 คลิกวันเดียวกับที่สั่ง = 0 ⇒ [0,0,2,4] มัธยฐาน 1
    expect(r.summary.medianClickToOrderDays).toBe(1)
  })

  it('FR-011 เทียบช่วงก่อนหน้า', async () => {
    const r = await report()
    expect(r.previous).toMatchObject({ sales: 999, orders: 1, collected: 999, spend: 70 })
  })

  it('FR-019 ความครอบคลุม: สามกลุ่มไม่ซ้อน รวมเท่ายอดทั้งร้านของ /reports/ads', async () => {
    const r = await report()
    expect(r.coverage).toEqual({ adOrders: 4, adSales: 600, chatOrders: 1, chatSales: 300, otherOrders: 1, otherSales: 70 })
    const old = await getAdSalesReport(x.shop, { from: gte, to: lt }, { spendSource: okSpend })
    expect(r.coverage.adSales).toBe(old.summary.adSales)
    expect(r.coverage.chatSales + r.coverage.otherSales).toBe(old.summary.nonAdSales)
  })

  it('FR-012 แคมเปญมาจาก Insights ด้วยรหัส · ไม่มีข้อมูล = null · แอดใช้เงินไม่มีใบยังมีแถว', async () => {
    const r = await report()
    const by = new Map(r.ads.map((a) => [a.adId, a]))
    expect(by.get('AD1')).toMatchObject({ campaignId: 'C1', adsetId: 'S1', spend: 100, chats: 1 })
    expect(by.get('AD2')).toMatchObject({ campaignId: null, spend: null })
    expect(by.get('AD3')).toMatchObject({ orders: 0, spend: 40, adTitle: 'ใช้เงินไม่มีใบ' })
    expect(r.summary.spend).toBe(140)
  })

  it('FR-013 คุณภาพออเดอร์ + waterfall ไม่ลบซ้ำ', async () => {
    const r = await report()
    const ad1 = r.ads.find((a) => a.adId === 'AD1')!
    expect(ad1.status).toEqual({ PENDING: 1, SHIPPED: 0, CONFIRMED: 1, CANCELLED: 1, RETURNED: 1 })
    expect(r.ads.reduce((s, a) => s + a.collectedPlaced, 0)).toBe(r.waterfall.collected)
    expect(r.waterfall).toEqual({ gross: 1500, cancelled: 900, returned: 100, open: 500, unrecorded: 50, collected: 450 })
    expect(r.summary).toMatchObject({ placed: 5, cancelled: 1, returned: 1, lostRatePct: 40 })
  })

  it('FR-014 สินค้า: นับรายบรรทัด ไม่เอายอดทั้งบิลใส่ทุกสินค้า', async () => {
    const r = await report()
    const a = r.products.find((p) => p.productId === x.prodA)!
    const gift = r.products.find((p) => p.productId === null)!
    expect(a).toMatchObject({ units: 6, sales: 550, orders: 4, sku: 'SK-1' }) // 2+1+1(ตีกลับ)+2(AD2)
    expect(gift).toMatchObject({ name: 'ของแถม', units: 1, sales: 50 })
    expect(r.products.reduce((s, p) => s + p.sales, 0)).toBe(r.summary.sales)
    // % ยกเลิก/ตีกลับของสินค้า A: 5 ใบที่มี A (ยกเลิก 1 · ตีกลับ 1)
    expect(a.lostRatePct).toBe(40)
  })

  it('FR-015 ลูกค้าใหม่/เดิม/ไม่ทราบ', async () => {
    const r = await report()
    const ad1 = r.ads.find((a) => a.adId === 'AD1')!
    expect(ad1).toMatchObject({ newCustomers: 1, newSales: 200, returningCustomers: 2, returningSales: 150 })
    expect(r.ads.find((a) => a.adId === 'AD2')).toMatchObject({ unknownCustomers: 1 })
    expect(r.summary).toMatchObject({ newCustomers: 1, returningCustomers: 2, unknownCustomers: 1, unknownSales: 250 })
  })

  it('FR-016 กำไรใช้ชุด/สูตรของ P&L: ยอดหลังส่วนลด − ต้นทุน · ต้นทุนว่าง = ติดป้าย', async () => {
    const r = await report()
    // P&L นับเฉพาะ CONFIRMED (+ส่งแล้วจริง): AD2 230 − 60 = 170 (ของแถมไม่มีต้นทุน ⇒ ไม่ครบ) · AD1 ใบ CONFIRMED 50 ไม่มีต้นทุน
    expect(r.ads.find((a) => a.adId === 'AD2')).toMatchObject({ profitBeforeAds: 170, profitOrders: 1, incompleteProfitOrders: 1 })
    expect(r.ads.find((a) => a.adId === 'AD1')).toMatchObject({ profitBeforeAds: 50, profitOrders: 1, incompleteProfitOrders: 1 })
  })

  it('FR-017 heatmap รวมเท่าจำนวนใบ', async () => {
    const r = await report()
    expect(r.heatmap.orders.flat().reduce((s, n) => s + n, 0)).toBe(4)
    // AD2 13:00 UTC วันพฤหัส 15 ต.ค. = 20:00 ไทย
    expect(r.heatmap.orders[3][20]).toBe(1)
  })

  it('Meta ล้มเหลว: หน้าไม่ล่ม ค่าโฆษณา/แคมเปญเป็น null ยอดขายยังครบ', async () => {
    const r = await report(errSpend)
    expect(r.spend.state).toBe('ERROR')
    expect(r.summary.spend).toBeNull()
    expect(r.ads.every((a) => a.spend === null && a.campaignId === null)).toBe(true)
    expect(r.summary.sales).toBe(600)
    expect(r.ads.some((a) => a.adId === 'AD3')).toBe(false)
  })

  it('รายวัน: ผลรวมทุกวัน = ตัวเลขบนการ์ด', async () => {
    const r = await report()
    const sum = (k: 'sales' | 'collected' | 'orders' | 'lost' | 'profitBeforeAds') => r.daily.reduce((s, d) => s + d[k], 0)
    expect(r.daily).toHaveLength(31)
    expect(sum('sales')).toBe(r.summary.sales)
    expect(sum('collected')).toBe(r.summary.collected)
    expect(sum('orders')).toBe(r.summary.orders)
    expect(sum('lost')).toBe(r.summary.cancelled + r.summary.returned)
    expect(sum('profitBeforeAds')).toBe(220)
    expect(r.prevDaily).toHaveLength(31)
    expect(r.prevDaily.reduce((t, d) => t + d.sales, 0)).toBe(r.previous.sales)
    expect(r.prevDaily.reduce((t, d) => t + d.collected, 0)).toBe(r.previous.collected) // ไม่มีใบคืนที่รับของ ⇒ เท่ากับผลรวมกำไรรายแอด 170 + 50
  })

  it('FR-018 ออเดอร์ไม่ถึงเกณฑ์ = ไม่มีคำแนะนำ', async () => {
    expect((await report()).insights).toEqual([])
  })
})
