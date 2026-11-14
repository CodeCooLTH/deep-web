/**
 * 00093 parity: ฝั่ง Deep ของรายงานคุณภาพโฆษณา = ตัวเลขเดียวกับ /reports/ads (HR16)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบ scope ด้วย id ที่เทสสร้างเท่านั้น
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'

vi.mock('server-only', () => ({}))

import { getAdSalesReport } from '@/services/ad-sales-report.service'
import { getQualityDeepSide } from '@/services/ad-quality-report.service'
import { thaiMidnightUtc } from '@/lib/date-range'
import type { SpendResult, SpendSource } from '@/services/meta-ads-spend.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const run = randomUUID().slice(0, 8)
const x = {} as Record<'user' | 'shop' | 'channel' | 'c1' | 'c2' | 'c3', string>
const gte = thaiMidnightUtc(2026, 9, 1)
const lt = thaiMidnightUtc(2026, 10, 1)
const at = (d: number) => new Date(Date.UTC(2026, 9, d, 5, 0, 0))

const rows: SpendResult['rows'] = [
  { adId: 'Q1', adName: 'a', day: '2026-10-03', spend: 100.5 },
  { adId: 'Q1', adName: 'a', day: '2026-10-04', spend: 50 },
  { adId: 'Q2', adName: 'b', day: '2026-10-05', spend: 30 },
  { adId: 'Q1', adName: 'a', day: '2026-09-10', spend: 999 }, // ช่วงก่อนหน้า ห้ามรวมในค่าโฆษณาของช่วงนี้
]
const spendSource: SpendSource = async () => ({ state: 'OK', accountName: 'x', currency: 'THB', tz: 'Asia/Bangkok', rows })

describe.skipIf(!isLocal)('00093 parity กับ /reports/ads (DB จริง)', () => {
  beforeAll(async () => {
    x.user = (await prisma.user.create({ data: { displayName: `aq-${run}`, username: `aq_${run}` }, select: { id: true } })).id
    x.shop = (await prisma.shop.create({ data: { userId: x.user, shopName: `aq-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })).id
    x.channel = (await prisma.shopChannel.create({ data: { shopId: x.shop, provider: 'MESSENGER', externalId: `pg-${run}`, name: 'p', accessTokenEnc: 'x', connectedByUserId: x.user }, select: { id: true } })).id
    const mk = async (s: string) => {
      const c = await prisma.externalContact.create({ data: { shopChannelId: x.channel, externalUserId: `psid-${s}-${run}` }, select: { id: true } })
      return (await prisma.conversation.create({ data: { shopId: x.shop, channel: 'MESSENGER', shopChannelId: x.channel, externalContactId: c.id }, select: { id: true } })).id
    }
    x.c1 = await mk('1'); x.c2 = await mk('2'); x.c3 = await mk('3')
    const click = (conversationId: string, adId: string, d: number) =>
      prisma.conversationAdReferral.create({ data: { conversationId, source: 'ADS', adId, adTitle: adId, receivedAt: at(d) } })
    await click(x.c1, 'Q1', 2); await click(x.c1, 'Q1', 3) // ห้องเดียวคลิกซ้ำ = 1
    await click(x.c2, 'Q1', 4); await click(x.c3, 'Q2', 5)
  })

  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { id: { in: [x.c1, x.c2, x.c3] } } })
    await prisma.shopChannel.deleteMany({ where: { id: x.channel } })
    await prisma.shop.deleteMany({ where: { id: x.shop } })
    await prisma.user.deleteMany({ where: { id: x.user } })
    await prisma.$disconnect()
  })

  it('แชท (Deep) ต่อแอด = ค่าเดียวกับ /reports/ads · แชทรวมนับห้องไม่ซ้ำ', async () => {
    const ads = await getAdSalesReport(x.shop, { from: gte, to: lt }, { spendSource })
    const q = await getQualityDeepSide(x.shop, { from: gte, to: lt }, { spendSource })
    for (const d of q.deepAds) expect(d.chats).toBe(ads.rows.find((r) => r.adId === d.adId)!.chats)
    expect(q.deepAds.find((d) => d.adId === 'Q1')!.chats).toBe(2)
    expect(q.chatsTotal).toBe(ads.summary.chats)
    expect(q.chatsTotal).toBe(3)
  })

  it('ค่าโฆษณา = ผลรวมของ getAdSpend ในช่วงเดียวกัน (150.5 + 30) = ตัวเลขของ /reports/ads', async () => {
    const ads = await getAdSalesReport(x.shop, { from: gte, to: lt }, { spendSource })
    const q = await getQualityDeepSide(x.shop, { from: gte, to: lt }, { spendSource })
    expect(q.ads.summary.spend).toBe(180.5)
    expect(q.ads.summary.spend).toBe(ads.ads.summary.spend)
  })

  it('เลือกเพจ: ใช้ชุดแอดที่มีแชทในเพจนั้น (scope เดียวกับ /reports/ads)', async () => {
    const q = await getQualityDeepSide(x.shop, { from: gte, to: lt, shopChannelId: x.channel }, { spendSource })
    expect(q.deepAds.map((d) => d.adId).sort()).toEqual(['Q1', 'Q2'])
  })
})
