import { describe, expect, it } from 'vitest'
import {
  buildInsights, buildWaterfall, collectedRatePct, contribution, emptyStatus, groupAds, INSIGHT_RULES, lostRatePct, median, thaiWeekdayHour,
  type AdMetrics,
} from './ad-revenue-view'

const ad = (o: Partial<AdMetrics> & { adId: string }): AdMetrics => ({
  adTitle: null, adPhotoFileId: null, campaignId: null, campaignName: null, adsetId: null, adsetName: null,
  chats: 0, orders: 0, sales: 0, collected: 0, collectedOrders: 0, status: emptyStatus(), gross: emptyStatus(), collectedPlaced: 0, spend: null,
  newCustomers: 0, returningCustomers: 0, unknownCustomers: 0, newSales: 0, returningSales: 0,
  profitBeforeAds: 0, profitOrders: 0, incompleteProfitOrders: 0, ...o,
})

describe('groupAds — จัดด้วยรหัส ผลรวมไม่ซ้ำไม่หาย', () => {
  const ads = [
    ad({ adId: 'A1', campaignId: 'C1', campaignName: 'ชื่อเก่า', adsetId: 'S1', sales: 100, orders: 1, spend: 10 }),
    ad({ adId: 'A2', campaignId: 'C1', campaignName: 'ชื่อใหม่', adsetId: 'S2', sales: 50, orders: 2, spend: null }),
    ad({ adId: 'A3', campaignId: 'C2', campaignName: 'ชื่อเก่า', adsetId: 'S3', sales: 500, orders: 3, spend: 20 }),
    ad({ adId: 'A4', sales: 999, orders: 4 }),
  ]
  it('ชื่อซ้ำกันคนละรหัส = คนละแถว · ไม่ทราบอยู่ล่างสุด', () => {
    const g = groupAds(ads, 'campaign')
    expect(g.map((r) => r.id)).toEqual(['C2', 'C1', null])
    expect(g.find((r) => r.id === 'C1')).toMatchObject({ ads: 2, sales: 150, orders: 3, spend: 10 })
  })
  it('ผลรวมทุกแถว = ผลรวมทุกแอด', () => {
    for (const lv of ['campaign', 'adset'] as const) {
      const g = groupAds(ads, lv)
      expect(g.reduce((s, r) => s + r.sales, 0)).toBe(1649)
      expect(g.reduce((s, r) => s + r.orders, 0)).toBe(10)
    }
  })
  it('ไม่มีค่าโฆษณาเลยทั้งกลุ่ม = null ไม่ใช่ 0', () => {
    expect(groupAds(ads, 'campaign').find((r) => r.id === null)!.spend).toBeNull()
  })
})

describe('waterfall — ชุดใบไม่ซ้อน ผลรวมเท่ายอดสั่ง', () => {
  it('gross = ยกเลิก + ตีกลับ + ยังไม่บันทึก + รับแล้ว', () => {
    const w = buildWaterfall({ gross: { PENDING: 100, SHIPPED: 200, CONFIRMED: 300, CANCELLED: 50, RETURNED: 25 }, collectedAmongOpen: 450 })
    expect(w).toEqual({ gross: 675, cancelled: 50, returned: 25, open: 600, unrecorded: 150, collected: 450 })
    expect(w.cancelled + w.returned + w.unrecorded + w.collected).toBe(w.gross)
  })
  it('รับเงินเกินยอดเปิด (ข้อมูลเพี้ยน) ไม่ทำให้ติดลบ', () => {
    expect(buildWaterfall({ gross: { ...emptyStatus(), CONFIRMED: 100 }, collectedAmongOpen: 150 }).unrecorded).toBe(0)
  })
})

describe('ตัวช่วยเล็ก', () => {
  it('lostRatePct ฐาน 0 = null', () => {
    expect(lostRatePct(emptyStatus())).toBeNull()
    expect(lostRatePct({ ...emptyStatus(), CONFIRMED: 3, CANCELLED: 1 })).toBe(25)
  })
  it('contribution ค่าโฆษณาไม่ทราบ = ไม่หัก + ธง', () => {
    expect(contribution(100, null)).toEqual({ value: 100, spendKnown: false })
    expect(contribution(100, 30)).toEqual({ value: 70, spendKnown: true })
  })
  it('collectedRatePct ชุดเดียวกับยอดสั่ง ไม่เกิน 100', () => {
    expect(collectedRatePct({ gross: emptyStatus(), collectedPlaced: 0 })).toBeNull()
    expect(collectedRatePct({ gross: { ...emptyStatus(), CONFIRMED: 300, CANCELLED: 100 }, collectedPlaced: 300 })).toBe(75)
  })
  it('median', () => {
    expect(median([])).toBeNull()
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 10])).toBe(2.5)
  })
  it('thaiWeekdayHour: จันทร์ 00:30 ไทย = อาทิตย์ 17:30 UTC', () => {
    expect(thaiWeekdayHour(new Date('2026-11-15T17:30:00Z'))).toEqual({ row: 0, hour: 0 })
    expect(thaiWeekdayHour(new Date('2026-11-15T16:59:00Z'))).toEqual({ row: 6, hour: 23 })
  })
})

describe('buildInsights — กฎตายตัว', () => {
  const st = (confirmed: number, lost: number) => ({ ...emptyStatus(), CONFIRMED: confirmed, CANCELLED: lost })
  const n = INSIGHT_RULES.minOrders
  it('แอดออเดอร์ไม่ถึงเกณฑ์ ไม่ถูกตัดสิน', () => {
    const r = buildInsights([ad({ adId: 'X', orders: n - 1, chats: 100, status: st(n - 1, 50), spend: 1000, collected: 1 })], new Map())
    expect(r).toEqual([])
  })
  it('ยกเลิกสูง: ≥ 1.5 เท่าค่าเฉลี่ยร้าน', () => {
    const ads = [
      ad({ adId: 'BAD', orders: n, status: st(n, n), sales: 1 }), // 50%
      ad({ adId: 'OK', orders: 30, status: st(30, 0), sales: 2 }),
    ]
    // ค่าเฉลี่ย = 10/50 = 20% → 50% ≥ 30%
    const r = buildInsights(ads, new Map())
    expect(r.filter((i) => i.kind === 'HIGH_LOST').map((i) => i.adId)).toEqual(['BAD'])
  })
  it('ROAS จากยอดรับเงิน < 1 = ควรตรวจสอบ · ≥ 2 และยกเลิกไม่เกินค่าเฉลี่ย = โอกาส · ไม่มีค่าโฆษณา = ไม่ตัดสิน', () => {
    const ads = [
      ad({ adId: 'LOW', orders: n, status: st(n, 0), spend: 1000, collected: 500, sales: 900 }),
      ad({ adId: 'GOOD', orders: n, status: st(n, 0), spend: 100, collected: 300, sales: 300 }),
      ad({ adId: 'NOSPEND', orders: n, status: st(n, 0), spend: null, collected: 0, sales: 10 }),
    ]
    const r = buildInsights(ads, new Map())
    expect(r.find((i) => i.kind === 'LOW_COLLECTED_ROAS')?.adId).toBe('LOW')
    expect(r.find((i) => i.kind === 'STRONG')?.adId).toBe('GOOD')
    expect(r.some((i) => i.adId === 'NOSPEND')).toBe(false)
  })
  it('แชทเยอะซื้อน้อย: อัตราปิด < ครึ่งหนึ่งของค่าเฉลี่ย', () => {
    const ads = [ad({ adId: 'CHATTY', orders: n, chats: 200, status: st(n, 0) }), ad({ adId: 'B', orders: 40, chats: 50, status: st(40, 0) })]
    // เฉลี่ย 50/250 = 20% · CHATTY 5% < 10%
    expect(buildInsights(ads, new Map()).find((i) => i.kind === 'LOW_CLOSE')?.adId).toBe('CHATTY')
  })
  it('สินค้าเด่น ≥ 50% ของยอดแอด · ควรตรวจสอบมาก่อนโอกาส', () => {
    const ads = [ad({ adId: 'P', orders: n, status: st(n, n), sales: 1000 }), ad({ adId: 'Q', orders: 40, status: st(40, 0), sales: 10 })]
    const r = buildInsights(ads, new Map([['P', { name: 'โช๊คหลัง', sales: 600 }]]))
    expect(r.find((i) => i.kind === 'PRODUCT_FOCUS')).toMatchObject({ adId: 'P', productName: 'โช๊คหลัง', value: 60 })
    expect(r[0].level).toBe('REVIEW')
  })
})
