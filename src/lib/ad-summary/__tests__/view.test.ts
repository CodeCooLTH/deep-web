import { describe, expect, it } from 'vitest'
import { en } from '@/i18n/dictionaries/en'
import { th } from '@/i18n/dictionaries/th'
import {
  ALL_COLS, DEFAULT_COLS, NO_FILTER, TILES, TREND_TABS, audienceView, bubbleSplit, chartToken, cheapestAge, deltaView, evidenceLabelKey,
  filterCampaigns, funnelRows, insightActKey, insightHeadKey, insightLink, insightParams, insightWhyKey, metricOf, pageSlice, parseCols,
  profitView, rankCreatives, resolveTrendKey, signedPct, sortCampaigns, toggleSelect, trendDisabled, trendSummaryDeltas, waterfall, TAG_KEYS, FLAG_KEYS,
} from '../view'
import { coveredOf } from '../formulas'
import type { AdRow, CampaignRow, Insight, KpiSet, Profit } from '../types'

const pair = (cur: number | null, prev: number | null) => ({ cur, prev })
const ad = (o: Partial<AdRow>): AdRow => withCov({
  adId: 'a', name: 'A', photoFileId: null, thumbnailUrl: null, adsetId: 's', campaignId: 'c', status: 'ACTIVE', spend: 1000, sales: 5000, orders: 10, chats: 40,
  chatsMeta: 50, impressions: 10000, clicks: 200, reach: 5000, cogs: 2000, tag: null, tagReason: null, creativeFlags: [], coveredSales: 0, coveredOrders: 0, ...o,
}, o)
// covered ตาม spend>0 เว้นแต่เทสระบุเอง (นิยามเดียวกับ KPI)
const withCov = <T extends { spend: number | null; sales: number; orders: number; coveredSales: number; coveredOrders: number }>(r: T, o: Partial<T>): T => ({ ...r, ...coveredOf(r.spend, r.sales, r.orders), ...o })
const camp = (o: Partial<CampaignRow> & { adsets?: CampaignRow['adsets'] }): CampaignRow => withCov({
  campaignId: 'c1', name: 'แคมเปญหนึ่ง', objective: 'OUTCOME_SALES', status: 'ACTIVE', adsets: [], prevSpend: 1000, tag: 'ok', tagReason: null,
  spend: 1000, sales: 4000, orders: 8, chats: 30, chatsMeta: 40, impressions: 5000, clicks: 100, cogs: 1500, coveredSales: 0, coveredOrders: 0, ...o,
}, o)

describe('deltaView / สี', () => {
  it('signed: ขึ้น=ดี มีลูกศรขึ้น · inverse: ขึ้น=แย่', () => {
    expect(deltaView(pair(120, 100), 'signed')).toEqual({ pct: 20, trend: 'good', arrow: 'up' })
    expect(deltaView(pair(120, 100), 'inverse')).toEqual({ pct: 20, trend: 'bad', arrow: 'up' })
    expect(deltaView(pair(80, 100), 'signed')).toMatchObject({ trend: 'bad', arrow: 'down' })
  })
  it('neutral/ไม่เปลี่ยน/ไม่มีฐาน = ไม่มีลูกศร', () => {
    expect(deltaView(pair(120, 100), 'neutral').arrow).toBeNull()
    expect(deltaView(pair(100, 100), 'signed').arrow).toBeNull()
    expect(deltaView(pair(100, 0), 'signed')).toEqual({ pct: null, trend: null, arrow: null })
    expect(deltaView(pair(null, 5), 'signed').pct).toBeNull()
  })
  it('สีกราฟ: แย่ลง zeta · กลาง/ไม่มีฐาน default-400 · ดีขึ้น primary — ห้ามม่วง', () => {
    expect(chartToken('bad')).toBe('chart-zeta')
    expect(chartToken('good')).toBe('chart-primary')
    expect(chartToken('neutral')).toBe('default-400')
    expect(chartToken(null)).toBe('default-400')
  })
  it('signedPct ใช้ − (U+2212) ไม่ใช้ hyphen', () => {
    expect(signedPct(-5)).toBe('−5.0%')
    expect(signedPct(12.34, 0)).toBe('+12%')
    expect(signedPct(0)).toBe('0.0%')
  })
})

describe('แนวโน้ม', () => {
  it('แท็บ Meta ปิดเมื่อไม่เชื่อม/ช่วง 1 วัน · แท็บร้านเปิดเสมอ', () => {
    expect(trendDisabled(true, 'NOT_CONNECTED', false)).toBe('none')
    expect(trendDisabled(true, 'AUTH', false)).toBe('none')
    expect(trendDisabled(true, 'OK', true)).toBe('hourly')
    expect(trendDisabled(true, 'OK', false)).toBeNull()
    expect(trendDisabled(false, 'NOT_CONNECTED', true)).toBeNull()
  })
  it('แท็บที่เลือกถูกปิด → กลับยอดขาย', () => {
    expect(resolveTrendKey('ctr', 'OK', true)).toBe('sales')
    expect(resolveTrendKey('ctr', 'OK', false)).toBe('ctr')
    expect(resolveTrendKey('orders', 'NOT_CONNECTED', true)).toBe('orders')
    expect(TREND_TABS.map((t) => t.key)).toEqual(['sales', 'spend', 'orders', 'ctr'])
  })
  it('บรรทัดสรุปต้องมี % ทั้งคู่', () => {
    const k = { spend: pair(132, 100), orders: pair(108, 100) } as unknown as KpiSet
    expect(trendSummaryDeltas(k)).toEqual({ spend: '+32%', orders: '+8%' })
    expect(trendSummaryDeltas({ spend: pair(1, 0), orders: pair(1, 1) } as unknown as KpiSet)).toBeNull()
  })
})

describe('funnel', () => {
  it('อัตราผ่านไม่คำนวณข้ามขั้นที่ไม่มีค่า · ชี้ขั้นแย่สุด', () => {
    const rows = funnelRows({
      steps: [
        { key: 'impressions', source: 'META', cur: null, prev: 100 }, { key: 'clicks', source: 'META', cur: null, prev: 10 },
        { key: 'chatsMeta', source: 'META', cur: 5, prev: 4 }, { key: 'chats', source: 'SHOP', cur: 4, prev: 4 }, { key: 'orders', source: 'SHOP', cur: 2, prev: 3 },
      ],
      rates: [
        { cur: null, prev: 10, crossSource: false }, { cur: null, prev: 40, crossSource: false },
        { cur: 80, prev: 100, crossSource: true }, { cur: 50, prev: 75, crossSource: false },
      ],
      worst: 3,
    })
    expect(rows[1].pass).toBeNull()
    expect(rows[3].crossSource).toBe(true)
    expect(rows[4].worst).toBe(true)
    expect(rows[4].change).toBeCloseTo(-33.33, 1)
    expect(rows.filter((r) => r.worst)).toHaveLength(1)
  })
})

describe('ตารางแคมเปญ', () => {
  const rows = [
    camp({ campaignId: 'a', name: 'ล้อแม็ก', spend: 3000, status: 'ACTIVE', tag: 'good', adsets: [{ adsetId: 's', name: 'ชุดรถซิ่ง', status: 'ACTIVE', ads: [ad({ name: 'video 360' })], spend: 1, sales: 1, orders: 1, coveredSales: 1, coveredOrders: 1, chats: 1, chatsMeta: 1, impressions: 1, clicks: 1, cogs: 1 }] }),
    camp({ campaignId: 'b', name: 'โช้ค', spend: null, status: 'PAUSED', objective: 'OUTCOME_AWARENESS', tag: 'thin' }),
    camp({ campaignId: 'c', name: 'โปร', spend: 500, status: null, tag: null }),
  ]
  it('metricOf: ROAS/CPA/CTR คำนวณจากผลรวมของแถว · หาร 0 = null', () => {
    const r = { spend: 1000, sales: 4000, orders: 8, coveredSales: 4000, coveredOrders: 8, chats: 30, chatsMeta: 40, impressions: 5000, clicks: 100 }
    expect(metricOf(r, 'roas')).toBe(4)
    expect(metricOf(r, 'cpa')).toBe(125)
    expect(metricOf(r, 'ctr')).toBe(2)
    expect(metricOf(r, 'delta', 800)).toBe(25)
    expect(metricOf({ ...r, spend: null }, 'roas')).toBeNull()
    expect(metricOf({ ...r, orders: 0, coveredOrders: 0 }, 'cpa')).toBeNull()
  })
  it('กรอง: ค้นหาไล่ถึงชื่อชุด/โฆษณา · สถานะ null ไม่เข้า on/off', () => {
    expect(filterCampaigns(rows, { ...NO_FILTER, q: 'VIDEO' }).map((c) => c.campaignId)).toEqual(['a'])
    expect(filterCampaigns(rows, { ...NO_FILTER, q: 'รถซิ่ง' }).map((c) => c.campaignId)).toEqual(['a'])
    expect(filterCampaigns(rows, { ...NO_FILTER, status: 'on' }).map((c) => c.campaignId)).toEqual(['a'])
    expect(filterCampaigns(rows, { ...NO_FILTER, status: 'off' }).map((c) => c.campaignId)).toEqual(['b'])
    expect(filterCampaigns(rows, { ...NO_FILTER, objective: 'OUTCOME_AWARENESS' }).map((c) => c.campaignId)).toEqual(['b'])
    expect(filterCampaigns(rows, { ...NO_FILTER, tag: 'good' }).map((c) => c.campaignId)).toEqual(['a'])
  })
  it('เรียง: null ท้ายเสมอทั้งสองทิศ', () => {
    expect(sortCampaigns(rows, 'spend', 'desc').map((c) => c.campaignId)).toEqual(['a', 'c', 'b'])
    expect(sortCampaigns(rows, 'spend', 'asc').map((c) => c.campaignId)).toEqual(['c', 'a', 'b'])
    expect(sortCampaigns(rows, null, 'asc')).toBe(rows)
  })
  it('แบ่งหน้า: หน้าเกินถูกหนีบ · ว่าง = 0 ถึง 0', () => {
    expect(pageSlice(25, 9, 10)).toMatchObject({ index: 2, start: 21, end: 25, pageCount: 3 })
    expect(pageSlice(0, 0, 10)).toMatchObject({ index: 0, start: 0, end: 0, pageCount: 1 })
  })
  it('ติ๊กเทียบ ≤ 3 — ตัวที่ 4 ไม่เข้า ติ๊กออกได้เสมอ', () => {
    let s: string[] = []
    for (const id of ['a', 'b', 'c', 'd']) s = toggleSelect(s, id)
    expect(s).toEqual(['a', 'b', 'c'])
    expect(toggleSelect(s, 'b')).toEqual(['a', 'c'])
  })
  it('คอลัมน์: ค่าจาก storage ที่แปลก = ตั้งต้น · กรองคีย์ที่ไม่รู้จัก', () => {
    expect(DEFAULT_COLS).toHaveLength(8)
    expect(parseCols(null)).toEqual(DEFAULT_COLS)
    expect(parseCols('not json')).toEqual(DEFAULT_COLS)
    expect(parseCols('{"a":1}')).toEqual(DEFAULT_COLS)
    expect(parseCols('["cpc","zzz","spend"]')).toEqual(['spend', 'cpc'])
    expect(parseCols('["zzz"]')).toEqual(DEFAULT_COLS)
  })
})

describe('ครีเอทีฟ', () => {
  it('จัดอันดับตามตัวเลือก · ตัด 5 อันดับ', () => {
    const ads = Array.from({ length: 7 }, (_, i) => ad({ adId: `x${i}`, orders: i, spend: 100 * (7 - i), sales: 100 }))
    expect(rankCreatives(ads, 'orders').map((a) => a.adId)).toEqual(['x6', 'x5', 'x4', 'x3', 'x2'])
    expect(rankCreatives(ads, 'spend')[0].adId).toBe('x0')
    expect(rankCreatives(ads, 'roas')[0].adId).toBe('x6')
  })
  it('จุดกระจาย: ข้อมูลน้อยไม่วาด · แยกตามต้นทุนต่อออเดอร์เทียบค่าเฉลี่ย', () => {
    const cheap = ad({ adId: 'cheap', spend: 1000, orders: 20 })
    const dear = ad({ adId: 'dear', spend: 1000, orders: 5 })
    const none = ad({ adId: 'none', spend: 1000, orders: 0 })
    const thin = ad({ adId: 'thin', spend: 100, orders: 9 })
    const unknownSpend = ad({ adId: 'ns', spend: null })
    const { low, high } = bubbleSplit([cheap, dear, none, thin, unknownSpend], 100)
    expect(low.map((a) => a.adId)).toEqual(['cheap'])
    expect(high.map((a) => a.adId)).toEqual(['dear', 'none'])
    expect(bubbleSplit([cheap], null).low).toHaveLength(1)
  })
})

describe('ความคุ้มค่า', () => {
  const full: Profit = { coveredSales: 10000, cogs: 4000, spend: 2000, grossProfit: 6000, profitAfterAds: 4000, grossMargin: 0.6, breakEvenRoas: 1.67, missingCostLines: 0, byCampaign: [] }
  it('สถานะส่วนกำไร', () => {
    expect(profitView(full, 'OK')).toEqual({ kind: 'ok', missing: 0, belowCost: false })
    expect(profitView(full, 'NOT_CONNECTED').kind).toBe('noSpend')
    expect(profitView({ ...full, spend: null }, 'OK').kind).toBe('noSpend')
    expect(profitView({ ...full, grossProfit: null, missingCostLines: 7 }, 'OK')).toEqual({ kind: 'insufficient', missing: 7, belowCost: false })
    expect(profitView({ ...full, grossMargin: -0.1, breakEvenRoas: null }, 'OK').belowCost).toBe(true)
  })
  it('น้ำตก: ฐาน+ส่วนบวกปลายแท่งตรงกับตัวเลข', () => {
    const w = waterfall(full)!
    expect(w.map((b) => [b.key, b.base, b.pos, b.neg])).toEqual([['sales', 0, 10000, 0], ['cogs', 6000, 4000, 0], ['spend', 4000, 2000, 0], ['profit', 0, 4000, 0]])
    expect(w.map((b) => b.label)).toEqual([10000, 4000, 2000, 4000])
  })
  it('น้ำตก: ขาดทุนหลังค่าโฆษณา — แท่งค่าโฆษณาคร่อมศูนย์ แท่งกำไรเป็นลบ', () => {
    const w = waterfall({ ...full, spend: 8000, profitAfterAds: -2000 })!
    expect(w[2]).toMatchObject({ key: 'spend', base: 0, pos: 6000, neg: -2000 })
    expect(w[3]).toMatchObject({ key: 'profit', base: 0, pos: 0, neg: -2000 })
    expect(w[3].label).toBe(-2000)
    expect(waterfall({ ...full, grossProfit: null })).toBeNull()
  })
})

describe('กลุ่มผู้ชม', () => {
  const aud = (status: 'OK' | 'EMPTY' | 'UNAVAILABLE' | 'ERROR' | 'AUTH', n = 1) => ({
    status, reach: 1, chatsMeta: 1, gender: n ? [{ key: 'male' as const, reach: 1 }] : [], age: [],
  })
  it('สถานะ Meta ชนะสถานะส่วน', () => {
    expect(audienceView('NOT_CONNECTED', aud('OK'))).toBe('needConnect')
    expect(audienceView('AUTH', aud('OK'))).toBe('auth')
    expect(audienceView('CURRENCY', aud('OK'))).toBe('unavailable')
    expect(audienceView('OK', aud('OK'))).toBe('ok')
    expect(audienceView('OK', aud('OK', 0))).toBe('empty')
    expect(audienceView('OK', aud('ERROR'))).toBe('error')
  })
  it('ป้าย "ถูกสุด" = ต้นทุนต่อแชทต่ำสุด ข้ามกลุ่มที่ไม่มีแชท', () => {
    expect(cheapestAge([
      { range: '18-24', reach: 1, chatsMeta: 0, spend: 100 }, { range: '25-34', reach: 1, chatsMeta: 10, spend: 100 }, { range: '35-44', reach: 1, chatsMeta: 20, spend: 100 },
    ])).toBe('35-44')
    expect(cheapestAge([{ range: 'x', reach: 1, chatsMeta: null, spend: null }])).toBeNull()
  })
})

describe('คำแนะนำ', () => {
  const rules = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'] as const
  const mk = (rule: (typeof rules)[number], params: Insight['params'] = {}): Insight => ({ rule, priority: 'HIGH', confidence: 'MEDIUM', params, evidence: [], spendAtStake: 0 })
  it('ทุกกฎมีข้อความครบทั้งสองภาษา', () => {
    for (const d of [th.adSummary, en.adSummary] as Record<string, string>[]) {
      for (const r of rules) {
        const i = mk(r)
        expect(d[insightHeadKey(i)], `${r} head`).toBeTruthy()
        expect(d[insightActKey(i)], `${r} act`).toBeTruthy()
        if (r !== 'R1') expect(d[insightWhyKey(i)], `${r} why`).toBeTruthy()
      }
      for (const cause of ['cpc', 'closeRate', 'ctr', undefined]) {
        expect(d[insightWhyKey(mk('R1', cause ? { cause } : {}))]).toBeTruthy()
      }
      for (const k of ['cpa', 'cpc', 'ctr', 'closeRate', 'spend', 'orders', 'impressions', 'chats', 'chatsMeta', 'spendShare', 'orderShare', 'roas', 'avgRoas']) {
        expect(d[evidenceLabelKey(k)], k).toBeTruthy()
      }
    }
  })
  it('จัดรูปพารามิเตอร์ตามชนิด — ไม่เหลือ {placeholder} ที่ไม่มีค่า', () => {
    expect(insightParams(mk('R2', { spendPct: 32.4, ordersPct: -5 }))).toEqual({ spendPct: '+32%', ordersPct: '−5%' })
    expect(insightParams(mk('R3', { from: 2.5, to: 1.9 }))).toEqual({ from: '2.50%', to: '1.90%' })
    expect(insightParams(mk('R7', { meta: 1200, shop: 800 }))).toEqual({ meta: '1,200', shop: '800' })
    expect(insightParams(mk('R6', { name: 'A', times: 2.34 }))).toEqual({ name: 'A', times: '2.3' })
  })
  it('ลิงก์ตามกฎ', () => {
    expect(insightLink(mk('R7'))).toBe('quality')
    expect(insightLink(mk('R4'))).toBe('ads')
    expect(insightLink(mk('R5'))).toBe('table')
    expect(insightLink(mk('R1'))).toBeNull()
  })
})

describe('ข้อความหน้า (BR-AIR-14/15)', () => {
  it('ห้ามคำว่า "Deep" และ "แอด" (ยกเว้น "แอดมิน") ทั้งสองภาษา', () => {
    for (const [k, v] of Object.entries(th.adSummary)) {
      expect(v, `th.${k}`).not.toMatch(/Deep/i)
      expect(v, `th.${k}`).not.toMatch(/แอด(?!มิน)/)
    }
    for (const [k, v] of Object.entries(en.adSummary)) expect(v, `en.${k}`).not.toMatch(/Deep/i)
  })
  it('สองภาษามีคีย์ชุดเดียวกัน · คีย์ที่โค้ดอ้างมีอยู่จริง', () => {
    expect(Object.keys(en.adSummary).sort()).toEqual(Object.keys(th.adSummary).sort())
    const d = th.adSummary as Record<string, string>
    for (const t of TILES) expect(d[t.label], t.label).toBeTruthy()
    for (const c of ALL_COLS) expect(d[c.label], c.label).toBeTruthy()
    for (const t of TREND_TABS) expect(d[t.label], t.label).toBeTruthy()
    for (const k of [...Object.values(TAG_KEYS), ...Object.values(FLAG_KEYS)]) expect(d[k], k).toBeTruthy()
  })
})
