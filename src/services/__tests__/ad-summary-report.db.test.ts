/**
 * 00094 สรุปโฆษณา: ตัวเลขหลัก = /reports/ads (HR16) · ผลรวมตาราง = ตัวเลขหลัก · กำไรไม่ครบ = null · ไม่เชื่อม = ส่วน Meta null
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบ scope ด้วย id ที่เทสสร้างเท่านั้น · Meta ฉีดของปลอมทั้งหมด (ไม่ยิงจริง)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'

vi.mock('server-only', () => ({}))

import { getAdSalesReport } from '@/services/ad-sales-report.service'
import { getAdSummaryReport } from '@/services/ad-summary-report.service'
import { thaiMidnightUtc } from '@/lib/date-range'
import type { SpendResult, SpendSource } from '@/services/meta-ads-spend.service'
import type { EntitiesCard } from '@/services/meta-ads-entities.service'
import type { getQualityBundle } from '@/services/meta-ads-quality.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const run = randomUUID().slice(0, 8)
const x = {} as Record<'user' | 'shop' | 'prod' | 'channel' | 'c1' | 'c2' | 'c3', string>
const orderIds: string[] = []
const gte = thaiMidnightUtc(2026, 9, 1)
const lt = thaiMidnightUtc(2026, 10, 1)
const lt20 = thaiMidnightUtc(2026, 9, 21) // 1–20 ต.ค. (ก่อนใบที่ต้นทุนไม่ครบ)
const at = (d: number) => new Date(Date.UTC(2026, 9, d, 5, 0, 0))

const mkOrder = async (o: { adId?: string; channel?: string; at: Date; items: [number, number, number | null][]; conv?: string }) => {
  const r = await prisma.order.create({
    data: {
      shopId: x.shop, conversationId: o.conv ?? null, type: 'PHYSICAL', status: 'PENDING', createdAt: o.at,
      totalAmount: o.items.reduce((s, [q, p]) => s + q * p, 0), adId: o.adId ?? null, shopChannelId: o.channel ?? null, adClickedAt: o.adId ? o.at : null,
      items: { create: o.items.map(([qty, price, cost]) => ({ name: 'สินค้า', qty, price, cost, productId: x.prod })) },
    } as never,
    select: { id: true },
  })
  orderIds.push(r.id)
}
const click = (conversationId: string, adId: string, d: number) =>
  prisma.conversationAdReferral.create({ data: { conversationId, source: 'ADS', adId, adTitle: adId, receivedAt: at(d) } })

const ins = (adId: string, day: string, spend: number, imp: number, clicks: number, chatsMeta: number | null, adset: string, campaign: string) =>
  ({ adId, adName: `โฆษณา ${adId}`, day, spend, adsetId: adset, adsetName: `ชุด ${adset}`, campaignId: campaign, campaignName: `แคมเปญ ${campaign}`, impressions: imp, clicks, chatsMeta })
const rows: SpendResult['rows'] = [
  ins('AD1', '2026-10-10', 100, 1000, 50, 10, 'S1', 'C1'),
  ins('AD1', '2026-10-11', 50, 500, 20, 5, 'S1', 'C1'),
  ins('AD2', '2026-10-12', 40, 800, 10, null, 'S2', 'C1'),
  ins('AD3', '2026-10-25', 500, 2000, 30, 3, 'S3', 'C2'),
  ins('AD1', '2026-09-10', 60, 300, 10, 2, 'S1', 'C1'), // ช่วงก่อนหน้า
]
// กรองตามช่วงเหมือน Graph จริง (ไม่งั้นแถว 25 ต.ค. หลุดเข้าช่วง 1–20)
const spendSource: SpendSource = async (_shop, since, until) => ({ state: 'OK', accountName: 'x', currency: 'THB', tz: 'Asia/Bangkok', rows: rows.filter((r) => r.day >= since && r.day <= until) })
const notConnected: SpendSource = async () => ({ state: 'NOT_CONNECTED', accountName: null, currency: null, tz: null, rows: [] })

const card = (rs: unknown[]) => Promise.resolve({ status: 'OK' as const, rows: rs, fetchedAt: 1 })
const quality = (() => ({
  account: card([{ impressions: 5000, reach: 2500 }]), placement: card([]),
  daily: card([{ day: '2026-10-10', impressions: 1000, reach: 700 }]),
  agegender: card([
    { age: '18-24', gender: 'female', spend: 50, impressions: 10, reach: 100, chats: 2 },
    { age: '18-24', gender: 'male', spend: 30, impressions: 10, reach: 50, chats: 1 },
    { age: '25-34', gender: 'unknown', spend: 10, impressions: 10, reach: 20, chats: null },
  ]),
})) as unknown as typeof getQualityBundle
const entities = async (): Promise<EntitiesCard> => ({
  state: 'OK',
  campaigns: [{ id: 'C1', name: 'แคมเปญหนึ่ง', objective: 'MESSAGES', status: 'ACTIVE' }, { id: 'C2', name: 'แคมเปญสอง', objective: 'OUTCOME_TRAFFIC', status: 'PAUSED' }],
  adsets: [{ id: 'S1', name: 'ชุดหนึ่ง', status: 'ACTIVE', campaignId: 'C1' }],
  ads: [{ id: 'AD1', status: 'ACTIVE', adsetId: 'S1', campaignId: 'C1', thumbnailUrl: 'https://t/1.jpg' }],
})
const deps = { spendSource, quality, entities, now: new Date('2026-11-15T00:00:00Z') }

describe.skipIf(!isLocal)('00094 สรุปโฆษณา (DB จริง · Meta ปลอม)', () => {
  beforeAll(async () => {
    x.user = (await prisma.user.create({ data: { displayName: `as-${run}`, username: `as_${run}` }, select: { id: true } })).id
    x.shop = (await prisma.shop.create({ data: { userId: x.user, shopName: `as-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })).id
    x.prod = (await prisma.product.create({ data: { shopId: x.shop, name: `p-${run}`, price: 100, fulfillmentMode: 'NO_SHIPPING' } as never, select: { id: true } })).id
    x.channel = (await prisma.shopChannel.create({ data: { shopId: x.shop, provider: 'MESSENGER', externalId: `pg-${run}`, name: 'p', accessTokenEnc: 'x', connectedByUserId: x.user }, select: { id: true } })).id
    const mk = async (s: string) => {
      const c = await prisma.externalContact.create({ data: { shopChannelId: x.channel, externalUserId: `psid-${s}-${run}` }, select: { id: true } })
      return (await prisma.conversation.create({ data: { shopId: x.shop, channel: 'MESSENGER', shopChannelId: x.channel, externalContactId: c.id }, select: { id: true } })).id
    }
    x.c1 = await mk('1'); x.c2 = await mk('2'); x.c3 = await mk('3')
    await click(x.c1, 'AD1', 4); await click(x.c1, 'AD1', 4); await click(x.c2, 'AD1', 6); await click(x.c1, 'AD2', 6); await click(x.c3, 'AD3', 7)
    await mkOrder({ adId: 'AD1', at: at(10), items: [[2, 100, 60]], conv: x.c1 }) // 200 ต้นทุน 120
    await mkOrder({ adId: 'AD1', at: at(11), items: [[1, 50, 20]], conv: x.c2 }) // 50 ต้นทุน 20
    await mkOrder({ at: at(12), items: [[3, 100, 50]] }) // ไม่ใช่โฆษณา
    await mkOrder({ adId: 'AD2', at: at(12), items: [[1, 100, 30]], conv: x.c1 }) // 100 ต้นทุน 30
    await mkOrder({ adId: 'AD9', at: at(14), items: [[1, 70, null]] }) // Meta ไม่รู้จัก · ต้นทุนไม่ครบ · ไม่มีค่าโฆษณา
    await mkOrder({ adId: 'AD3', at: at(25), items: [[1, 80, null]], conv: x.c3 }) // มีค่าโฆษณา + ต้นทุนไม่ครบ
  })

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    await prisma.conversation.deleteMany({ where: { id: { in: [x.c1, x.c2, x.c3] } } })
    await prisma.shopChannel.deleteMany({ where: { id: x.channel } })
    await prisma.product.deleteMany({ where: { id: x.prod } })
    await prisma.shop.deleteMany({ where: { id: x.shop } })
    await prisma.user.deleteMany({ where: { id: x.user } })
    await prisma.$disconnect()
  })

  it('parity: ตัวเลขหลัก = getAdSalesReport (ยอดขาย/ออเดอร์/แชท/ค่าโฆษณา/ROAS/ต้นทุนต่อออเดอร์) ทั้งช่วงนี้และก่อนหน้า', async () => {
    const a = await getAdSalesReport(x.shop, { from: gte, to: lt }, { spendSource })
    const s = await getAdSummaryReport(x.shop, { from: gte, to: lt }, deps)
    expect(s.kpi.sales).toEqual({ cur: a.summary.adSales, prev: a.previous.adSales })
    expect(s.kpi.orders).toEqual({ cur: a.summary.adOrders, prev: a.previous.adOrders })
    expect(s.kpi.chats).toEqual({ cur: a.summary.chats, prev: a.previous.chats })
    expect(s.kpi.spend).toEqual({ cur: a.ads.summary.spend, prev: a.ads.summary.prevSpend })
    expect(s.kpi.roas.cur).toBe(a.ads.summary.roas)
    expect(s.kpi.roas.prev).toBe(a.ads.summary.prevRoas)
    expect(s.kpi.cpa.cur).toBe(a.ads.summary.costPerOrder)
    expect(s.kpi.sales.cur).toBe(500)
    expect(s.kpi.chats.cur).toBe(3)
    // Meta: Σ แถว Insights ช่วงนี้
    expect(s.kpi.impressions.cur).toBe(4300)
    expect(s.kpi.chatsMeta.cur).toBe(18)
    expect(s.kpi.reach.cur).toBe(2500) // Q2 ระดับบัญชี ไม่ใช่ Σ รายแอด
    expect(s.meta.state).toBe('OK')
  })

  it('ผลรวมตาราง (แคมเปญ + ไม่ทราบแคมเปญ) = ตัวเลขหลัก · แอดที่ Meta ไม่รู้จักไม่หาย', async () => {
    const s = await getAdSummaryReport(x.shop, { from: gte, to: lt }, deps)
    const sum = (k: 'sales' | 'orders') => s.campaigns.reduce((t, c) => t + c[k], 0) + s.unknownCampaign[k]
    expect(sum('sales')).toBeCloseTo(s.kpi.sales.cur!, 2)
    expect(sum('orders')).toBe(s.kpi.orders.cur)
    // แชทไม่ตรวจผลรวม: ห้องเดียวกดสองโฆษณานับ 1 ในตัวเลขหลัก แต่นับทั้งสองแถว (นิยามเดิมของ 00091)
    expect(s.campaigns.reduce((t, c) => t + (c.spend ?? 0), 0) + (s.unknownCampaign.spend ?? 0)).toBeCloseTo(s.kpi.spend.cur!, 2)
    expect(s.unknownCampaign.ads.map((a) => a.adId)).toEqual(['AD9'])
    // ชั้นของแคมเปญ: ชื่อ/สถานะ/วัตถุประสงค์จาก entities · prevSpend จาก Insights ช่วงก่อน
    const c1 = s.campaigns.find((c) => c.campaignId === 'C1')!
    expect(c1).toMatchObject({ name: 'แคมเปญหนึ่ง', objective: 'MESSAGES', status: 'ACTIVE', prevSpend: 60, spend: 190, orders: 3 })
    expect(c1.adsets.map((a) => a.adsetId).sort()).toEqual(['S1', 'S2'])
    expect(c1.adsets.find((a) => a.adsetId === 'S2')!.name).toBe('ชุด S2') // entities ไม่มี → ใช้ชื่อจากแถว Insights
    expect(c1.adsets.find((a) => a.adsetId === 'S1')!.ads[0]).toMatchObject({ adId: 'AD1', thumbnailUrl: 'https://t/1.jpg', reach: null, chatsMeta: 15, cogs: 140 })
  })

  it('ต้นทุนไม่ครบในชุดที่มีค่าโฆษณา → กำไร null + นับบรรทัดที่ไม่มีต้นทุน · ช่วงที่ครบ → คำนวณได้', async () => {
    const full = await getAdSummaryReport(x.shop, { from: gte, to: lt }, deps)
    expect(full.profit.missingCostLines).toBe(1) // AD3 (AD9 ไม่มีค่าโฆษณา ไม่นับ)
    expect(full.profit.cogs).toBeNull()
    expect(full.profit.grossProfit).toBeNull()
    expect(full.profit.profitAfterAds).toBeNull()
    const ok = await getAdSummaryReport(x.shop, { from: gte, to: lt20 }, deps)
    // ชุดที่มีค่าโฆษณา: AD1 (ขาย 250 ทุน 140) + AD2 (100 ทุน 30) · ค่าโฆษณา 190
    expect(ok.profit).toMatchObject({ coveredSales: 350, cogs: 170, spend: 190, grossProfit: 180, profitAfterAds: -10, missingCostLines: 0 })
    expect(ok.profit.byCampaign.find((c) => c.campaignId === 'C1')!.profitAfterAds).toBe(-10)
  })

  it('รายวัน: ตัวเลขร้าน + Meta รายวัน + reach รายวัน · ช่วงก่อนไม่มี reach', async () => {
    const s = await getAdSummaryReport(x.shop, { from: gte, to: lt }, deps)
    expect(s.daily).toHaveLength(31)
    expect(s.daily.find((d) => d.day === '2026-10-10')).toMatchObject({ sales: 200, orders: 1, spend: 100, impressions: 1000, clicks: 50, chatsMeta: 10, reach: 700 })
    expect(s.daily.find((d) => d.day === '2026-10-04')!.chats).toBe(1) // ห้องเดียวคลิกซ้ำวันเดียว = 1
    expect(s.prevDaily.every((d) => d.reach === null)).toBe(true)
    expect(s.prevDaily.some((d) => d.day === '2026-09-10' && d.impressions === 300)).toBe(true)
    expect(s.includesRecent).toBe(false)
  })

  it('กลุ่มผู้ชม: เพศ = Σ reach ตามเพศ · อายุ = รวมต่อช่วง', async () => {
    const s = await getAdSummaryReport(x.shop, { from: gte, to: lt }, deps)
    expect(s.audience.status).toBe('OK')
    expect(s.audience.gender).toEqual([{ key: 'male', reach: 50 }, { key: 'female', reach: 100 }, { key: 'unknown', reach: 20 }])
    expect(s.audience.age[0]).toEqual({ range: '18-24', reach: 150, chatsMeta: 3, spend: 80 })
  })

  it('ไม่เชื่อมบัญชีโฆษณา: ไม่ยิง Meta เพิ่ม · ยอด/ออเดอร์ยังมี · ส่วน Meta null · ทุกแอดอยู่ในไม่ทราบแคมเปญ', async () => {
    const q = vi.fn()
    const e = vi.fn()
    const s = await getAdSummaryReport(x.shop, { from: gte, to: lt }, { ...deps, spendSource: notConnected, quality: q as unknown as typeof getQualityBundle, entities: e })
    expect(q).not.toHaveBeenCalled()
    expect(e).not.toHaveBeenCalled()
    expect(s.meta.state).toBe('NOT_CONNECTED')
    expect(s.kpi.sales.cur).toBe(500)
    expect(s.kpi.orders.cur).toBe(5)
    expect(s.kpi.spend.cur).toBeNull()
    expect(s.kpi.roas.cur).toBeNull()
    expect(s.kpi.impressions.cur).toBeNull()
    expect(s.kpi.reach.cur).toBeNull()
    expect(s.campaigns).toEqual([])
    expect(s.unknownCampaign.orders).toBe(5)
    expect(s.audience.status).toBe('UNAVAILABLE')
    expect(s.profit.profitAfterAds).toBeNull()
  })

  it('คำขอ Meta ล้ม (entities/คุณภาพ) ไม่ล้มทั้งหน้า: ลำดับชั้นยังมาจากแถว Insights · ส่วนที่ล้มเป็น null/ERROR', async () => {
    const down = (() => ({ account: Promise.reject(new Error('x')), placement: Promise.resolve(), daily: Promise.reject(new Error('x')), agegender: Promise.reject(new Error('x')) })) as unknown as typeof getQualityBundle
    const s = await getAdSummaryReport(x.shop, { from: gte, to: lt }, { ...deps, quality: down, entities: async () => { throw new Error('boom') } })
    expect(s.kpi.reach.cur).toBeNull()
    expect(s.audience.status).toBe('ERROR')
    expect(s.campaigns.find((c) => c.campaignId === 'C1')).toMatchObject({ name: 'แคมเปญ C1', objective: null })
    expect(s.kpi.sales.cur).toBe(500)
  })

  // 🛑 ทดสอบท้ายไฟล์: สร้างออเดอร์เพิ่ม (วันที่ 13) จึงต้องอยู่หลังเทสที่ยืนยันยอดรวม 500
  it('เลือกเพจ (shopChannelId): ผลรวมตาราง = kpi · ออเดอร์ที่ไม่ผูกเพจไม่เข้า', async () => {
    await mkOrder({ adId: 'AD1', channel: x.channel, at: at(13), items: [[1, 100, 60]], conv: x.c2 })
    const s = await getAdSummaryReport(x.shop, { from: thaiMidnightUtc(2026, 9, 13), to: thaiMidnightUtc(2026, 9, 16), shopChannelId: x.channel }, deps)
    expect(s.kpi.sales.cur).toBe(100) // ไม่รวม AD9 (วันที่ 14 ไม่ผูกเพจ)
    const sum = (k: 'sales' | 'orders' | 'coveredSales') => s.campaigns.reduce((t, c) => t + c[k], 0) + s.unknownCampaign[k]
    expect(sum('sales')).toBeCloseTo(s.kpi.sales.cur!, 2)
    expect(sum('orders')).toBe(s.kpi.orders.cur)
  })

  it('ROAS ทุกระดับใช้ covered: โฆษณาไม่มีค่าโฆษณาแต่มีออเดอร์ไม่พอง ROAS · Σ coveredSales ทุกแคมเปญ+unknown = ตัวตั้ง ROAS ของ kpi', async () => {
    const s = await getAdSummaryReport(x.shop, { from: gte, to: lt }, deps)
    const covered = s.campaigns.reduce((t, c) => t + c.coveredSales, 0) + s.unknownCampaign.coveredSales
    // AD9 (ขาย 70 ไม่มีค่าโฆษณา) ไม่เข้า covered
    expect(s.unknownCampaign.sales).toBeGreaterThan(s.unknownCampaign.coveredSales)
    expect(s.kpi.roas.cur).toBe(Math.round((covered / s.kpi.spend.cur!) * 100) / 100)
    const coveredOrders = s.campaigns.reduce((t, c) => t + c.coveredOrders, 0) + s.unknownCampaign.coveredOrders
    expect(s.kpi.cpa.cur).toBe(Math.round((s.kpi.spend.cur! / coveredOrders) * 100) / 100)
  })

  it('ช่วง 1 วัน → hourly และไม่มีกฎ R1–R4 (ต้องใช้เทียบช่วง)', async () => {
    const s = await getAdSummaryReport(x.shop, { from: thaiMidnightUtc(2026, 9, 10), to: thaiMidnightUtc(2026, 9, 11) }, deps)
    expect(s.hourly).toBe(true)
    expect(s.insights.filter((i) => ['R1', 'R2', 'R3', 'R4'].includes(i.rule))).toEqual([])
  })
})
