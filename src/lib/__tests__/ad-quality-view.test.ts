import { describe, it, expect } from 'vitest'
import { adLine, campaignLine, buildQualityRows, buildTotals, buildPlacements, buildAgeSummary, buildAgeSeries, groupByCampaign, spendRatios, metaAdsNotInAccount, type DeepAd } from '@/lib/ad-quality-view'
import type { AdInsightRow } from '@/lib/meta-ads-quality'

// fixture จำลอง (ไม่ใช่ payload จริง — ดู TODO ใน meta-ads-quality.ts)
const ins = (o: Partial<AdInsightRow> & { adId: string }): AdInsightRow => ({
  adName: null, adsetName: null, campaignName: null, impressions: 1000, reach: 500, clicks: 20,
  chats: null, depth2: null, depth3: null, replied: null, block: null,
  video: { p25: null, p50: null, p75: null, p100: null, thruplay: null }, ...o,
})
const deep = (adId: string, chats: number, orders = 0, title: string | null = null): DeepAd => ({ adId, adTitle: title, photoFileId: null, chats, orders })

describe('buildQualityRows', () => {
  const insights = [ins({ adId: 'A', adName: 'ชื่อใหม่', chats: 88, depth3: 44, block: 0 }), ins({ adId: 'B', chats: null }), ins({ adId: 'GHOST', chats: 10 })]
  const rows = buildQualityRows([deep('A', 51, 5, 'ชื่อเก่า'), deep('B', 4), deep('C', 7, 1, 'ไม่มีใน Insights')], insights, { pageFiltered: false })
  const by = (id: string) => rows.find((r) => r.adId === id)!

  it('ชื่อจาก Q1 ชนะ · ไม่มีใน Q1 ใช้ชื่อ 00091 · แอดที่มีแต่ใน Insights เป็นแถวผี Deep 0', () => {
    expect(by('A').title).toBe('ชื่อใหม่')
    expect(by('C').title).toBe('ไม่มีใน Insights')
    expect(by('GHOST')).toMatchObject({ chatsDeep: 0, chatsMeta: 10, badge: 'LOW_SAMPLE' })
    expect(rows).toHaveLength(4)
  })
  it('แอดไม่อยู่ใน Q1 → Meta ทั้งแถว null (ไม่ใช่ 0) · แอด Q1 ไม่มี action แชท → chatsMeta null แต่ยังมี CTR', () => {
    expect(by('C')).toMatchObject({ inInsights: false, chatsMeta: null, gap: null, ctr: null, rate3: null })
    expect(by('B')).toMatchObject({ inInsights: true, chatsMeta: null, rate3: null, ctr: 2 })
  })
  it('อัตราตามสูตร: คุยต่อ ≥3 = depth3 ÷ แชท Meta · block "0" จริง = 0 · ปิดการขาย = orders ÷ Deep', () => {
    expect(by('A')).toMatchObject({ rate3: 50, rateBlock: 0, rateReplied: null, closeRate: 9.8, badge: 'HIGH' })
  })
  it('เลือกเพจ: ไม่แสดงแอดที่มีแต่ใน Insights', () => {
    expect(buildQualityRows([deep('A', 51)], insights, { pageFiltered: true }).map((r) => r.adId)).toEqual(['A'])
  })
  it('Q1 ล้ม (null) → ยังมีแถว Deep ล้วน ฝั่ง Meta null ทั้งหมด', () => {
    expect(buildQualityRows([deep('A', 5)], null, { pageFiltered: false })[0]).toMatchObject({ inInsights: false, chatsMeta: null, impressions: null })
  })
  it('วิดีโอ: มี thruplay → ThruPlay% ของ impressions · ไม่ใช่วิดีโอ = isVideo false ไม่ใช่ 0', () => {
    const v = buildQualityRows([], [ins({ adId: 'V', impressions: 200, video: { p25: 100, p50: 80, p75: 60, p100: 40, thruplay: 50 } }), ins({ adId: 'N' })], { pageFiltered: false })
    expect(v.find((r) => r.adId === 'V')).toMatchObject({ isVideo: true, thruplayPct: 25, videoSteps: { p25: 50, p100: 20 } })
    expect(v.find((r) => r.adId === 'N')).toMatchObject({ isVideo: false, thruplayPct: null })
  })
})

describe('buildTotals (F-02: ตัวลบจากชุดเดียวกับตัวตั้ง)', () => {
  const rows = buildQualityRows(
    [deep('A', 51), deep('B', 30), deep('C', 7), deep('D', 3)],
    [ins({ adId: 'A', chats: 88, depth3: 44 }), ins({ adId: 'B', chats: 40, depth3: 4 }), ins({ adId: 'D', chats: null })],
    { pageFiltered: false },
  )
  const t = buildTotals(rows)
  it('Σ Meta = 128 · Deep ชุดเดียวกัน = 81 (ไม่รวม C ที่ไม่พบ และ D ที่ไม่มี action) · ส่วนต่าง = 36.72%', () => {
    expect(t).toMatchObject({ chatsMeta: 128, chatsDeepSameSet: 81, adsCounted: 2, excludedDeepChats: 10 })
    expect(t.gap).toBe(36.72)
  })
  it('อัตรารวม = Σตัวตั้ง ÷ Σตัวหาร (ไม่เฉลี่ย %) · แอดส่วนต่างสูงสุดเข้าเกณฑ์', () => {
    expect(t.rates.depth3).toMatchObject({ pct: 37.5, num: 48, den: 128 })
    expect(t.rates.replied.pct).toBeNull() // ไม่มี action เลย = null ไม่ใช่ 0
    expect(t.highGapTop?.adId).toBe('A')
  })
  it('CTR รวม = Σคลิก ÷ Σแสดงผล · CPC/ต้นทุนต่อแชท หาร 0 → null', () => {
    expect(t.ctr).toBe(2)
    const r = spendRatios(1000, t, 81, { impressions: 3000, reach: 1000 })
    expect(r).toMatchObject({ cpc: 16.67, costPerChatMeta: 7.81, costPerChatDeep: 12.35, frequency: 3 })
    expect(spendRatios(null, t, 0, null)).toEqual({ cpc: null, costPerChatMeta: null, costPerChatDeep: null, frequency: null })
    // เลือกเพจ: ค่าโฆษณารวมแอดที่ไม่มีแชท → CPC / ต้นทุนต่อแชท (Meta) ไม่หาร · ต่อแชท (Deep) ยังหารได้ (ชุดเดียวกัน)
    const pf = spendRatios(1000, t, 81, null, { pageFiltered: true })
    expect(pf.cpc).toBeNull()
    expect(pf.costPerChatMeta).toBeNull()
    expect(pf.costPerChatDeep).not.toBeNull()
  })
  it('ไม่มีแอดมีแชท Meta เลย → ผลรวมเป็น null ทั้งชุด', () => {
    expect(buildTotals(buildQualityRows([deep('X', 3)], null, { pageFiltered: false }))).toMatchObject({ chatsMeta: null, gap: null, impressions: null })
  })
})

describe('groupByCampaign', () => {
  it('รวมด้วยผลรวมตัวตั้ง ÷ ผลรวมตัวหาร', () => {
    const rows = buildQualityRows(
      [deep('A', 10, 1), deep('B', 30, 3)],
      [ins({ adId: 'A', campaignName: 'K', chats: 10, depth3: 10 }), ins({ adId: 'B', campaignName: 'K', chats: 90, depth3: 0 })],
      { pageFiltered: false },
    )
    const [g] = groupByCampaign(rows)
    expect(g).toMatchObject({ chatsMeta: 100, rate3: 10, chatsDeep: 40, orders: 4, closeRate: 10 })
  })
})

describe('buildPlacements / อายุ-เพศ', () => {
  const p = buildPlacements([
    { platform: 'facebook', position: 'feed', spend: 100, impressions: 10, clicks: 1, chats: 25 },
    { platform: 'instagram', position: 'stream', spend: 50, impressions: 10, clicks: 1, chats: 5 },
    { platform: 'weird', position: 'x', spend: 10, impressions: 1, clicks: null, chats: null },
  ])
  it('เรียงตามค่าโฆษณา · ต้นทุนต่ำสุดนับเฉพาะแชท ≥ 20 · chats ไม่ทราบ = null · ค่าดิบแสดงดิบ', () => {
    expect(p.lines.map((l) => l.label)).toEqual(['Facebook ฟีด', 'Instagram ฟีด', 'weird · x'])
    expect(p.cheapest?.label).toBe('Facebook ฟีด')
    expect(p.lines[2]).toMatchObject({ chats: null, costPerChat: null, sharePct: null })
    expect(p.lines[0].sharePct).toBeCloseTo(83.33, 1)
  })
  it('จำกัด 8 แถว + "อื่น ๆ"', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ platform: 'facebook', position: `p${i}`, spend: 10 - i, impressions: 1, clicks: 1, chats: 1 }))
    const v = buildPlacements(many)
    expect(v.lines).toHaveLength(8)
    expect(v.rest).toMatchObject({ count: 2, spend: 3 })
  })
  it('อายุ: เรียงตามอายุ ไม่ระบุท้ายสุด · ซีรีส์เพศช่องว่าง = null ไม่ใช่ 0', () => {
    const rows = [
      { age: '25-34', gender: 'female', spend: 10, impressions: 100, reach: 50, chats: 6 },
      { age: '18-24', gender: 'male', spend: 5, impressions: 50, reach: 25, chats: 2 },
      { age: 'unknown', gender: 'unknown', spend: 1, impressions: 5, reach: 2, chats: null },
    ]
    const s = buildAgeSummary(rows)
    expect(s.lines.map((l) => l.age)).toEqual(['18-24', '25-34', 'unknown'])
    expect(s.top?.age).toBe('25-34')
    expect(s.lines[2]).toMatchObject({ chats: null, costPerChat: null })
    const ser = buildAgeSeries(rows, 'chats')
    expect(ser.series.find((x) => x.gender === 'male')!.data).toEqual([2, null, null])
  })
})

describe('adLine / campaignLine (รูปเดียวกันของตาราง ⑥)', () => {
  it('แถวแคมเปญ: อัตราและตัวตั้ง/ตัวหารมาจากชุดแถวเดียวกัน · subRows คือแอดภายใน', () => {
    const rows = buildQualityRows([deep('A', 10, 1), deep('B', 30, 3)], [ins({ adId: 'A', campaignName: 'K', chats: 10, depth3: 10 }), ins({ adId: 'B', campaignName: 'K', chats: 90, depth3: null })], { pageFiltered: false })
    const line = campaignLine(groupByCampaign(rows)[0])
    expect(line.kind).toBe('campaign')
    expect(line.rates.depth3).toEqual({ pct: 100, num: 10, den: 10 }) // B ไม่มี depth3 → ไม่ลากตัวหาร
    expect(line.subRows).toHaveLength(2)
    expect(adLine(rows[0]).rates.depth3).toMatchObject({ pct: 100, num: 10, den: 10 })
  })
})

describe('metaAdsNotInAccount', () => {
  it('Meta ว่าง + มีแชท (Deep) จากแอด + ไม่กรองเพจ → แอดไม่อยู่ในบัญชีที่เชื่อม', () => {
    expect(metaAdsNotInAccount('EMPTY', 3, false)).toBe(true)
  })
  it('ไม่ใช่กรณีนี้: ไม่มีแชท (Deep) · กรองเพจ · Meta ตอบมีข้อมูล/ล้ม', () => {
    expect(metaAdsNotInAccount('EMPTY', 0, false)).toBe(false)
    expect(metaAdsNotInAccount('EMPTY', 3, true)).toBe(false)
    expect(metaAdsNotInAccount('OK', 3, false)).toBe(false)
    expect(metaAdsNotInAccount('ERROR', 3, false)).toBe(false)
  })
})
