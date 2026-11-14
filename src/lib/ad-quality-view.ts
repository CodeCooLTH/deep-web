/**
 * ad-quality-view — ประกอบ view model ของรายงานคุณภาพโฆษณา (00093) · pure (ไม่มี React/DB) — serializable ล้วน
 * รับแถว Deep (จาก getAdSalesReport — แชท/คำสั่งซื้อต่อแอดตัวเดียวกับ /reports/ads) + แถว Insights ของ Meta
 * 🛑 "แชท (Meta)" ≠ "แชท (Deep)": อย่ารวมสองฝั่งเป็นตัวเลขเดียว · ตัวลบนับจากชุดแอดเดียวกับตัวตั้ง (F-02)
 */
import type { AdInsightRow, AgeGenderRow, PlacementRow } from '@/lib/meta-ads-quality'
import {
  closeRatePct, frequency, gapBadge, gapPct, groupRatePct, isVideoAd, placementLabel, platformLabel, ratePct, sumKnown, unitCost,
  HIGH_GAP_MIN_META_CHATS, GENDER_ORDER, type GapBadge,
} from '@/lib/ad-quality-formulas'

export type DeepAd = { adId: string; adTitle: string | null; photoFileId: string | null; chats: number; orders: number }

export type QualityRow = {
  adId: string
  title: string | null
  photoFileId: string | null
  campaign: string | null
  adset: string | null
  /** พบในคำตอบ Q1 ไหม — false = ฝั่ง Meta ทั้งแถวเป็น "—" และไม่ร่วม F-02 */
  inInsights: boolean
  chatsMeta: number | null
  chatsDeep: number
  orders: number
  gap: number | null
  badge: GapBadge
  impressions: number | null
  reach: number | null
  clicks: number | null
  ctr: number | null
  depth2: number | null; depth3: number | null; replied: number | null; block: number | null
  rate2: number | null; rate3: number | null; rateReplied: number | null; rateBlock: number | null
  closeRate: number | null
  isVideo: boolean
  thruplayPct: number | null
  videoSteps: { p25: number | null; p50: number | null; p75: number | null; p100: number | null }
}

/**
 * หนึ่งแถวต่อแอดที่ "มีค่าใน Q1 หรือมีแชท (Deep)" — เลือกเพจแล้ว Meta ไม่รู้จักเพจ → ใช้เฉพาะแอดที่มีแชท (Deep) ในเพจนั้น
 * (แอดที่มีแต่ใน Insights = แถวผี ไม่แสดง)
 */
export function buildQualityRows(deep: DeepAd[], insights: AdInsightRow[] | null, opts: { pageFiltered: boolean }): QualityRow[] {
  const byId = new Map((insights ?? []).map((r) => [r.adId, r]))
  const deepIds = new Set(deep.map((d) => d.adId))
  const make = (adId: string, d: DeepAd | undefined, m: AdInsightRow | undefined): QualityRow => {
    const chatsDeep = d?.chats ?? 0
    const orders = d?.orders ?? 0
    const chatsMeta = m?.chats ?? null
    const v = m?.video
    const stepPct = (n: number | null | undefined) => (m ? ratePct(n ?? null, m.impressions) : null)
    const video = Boolean(v) && isVideoAd(v!)
    return {
      adId,
      // ชื่อปัจจุบันใน Ads Manager ชนะ — ไม่มีใน Q1 ใช้ชื่อจาก 00091 (edge BRD §9)
      title: m?.adName ?? d?.adTitle ?? null,
      photoFileId: d?.photoFileId ?? null,
      campaign: m?.campaignName ?? null,
      adset: m?.adsetName ?? null,
      inInsights: Boolean(m),
      chatsMeta, chatsDeep, orders,
      gap: gapPct(chatsMeta, chatsDeep),
      badge: gapBadge(chatsMeta, chatsDeep),
      impressions: m?.impressions ?? null, reach: m?.reach ?? null, clicks: m?.clicks ?? null,
      ctr: ratePct(m?.clicks ?? null, m?.impressions ?? null),
      depth2: m?.depth2 ?? null, depth3: m?.depth3 ?? null, replied: m?.replied ?? null, block: m?.block ?? null,
      rate2: ratePct(m?.depth2 ?? null, chatsMeta), rate3: ratePct(m?.depth3 ?? null, chatsMeta),
      rateReplied: ratePct(m?.replied ?? null, chatsMeta), rateBlock: ratePct(m?.block ?? null, chatsMeta),
      closeRate: closeRatePct(orders, chatsDeep),
      isVideo: video,
      thruplayPct: video ? stepPct(v!.thruplay) : null,
      videoSteps: video ? { p25: stepPct(v!.p25), p50: stepPct(v!.p50), p75: stepPct(v!.p75), p100: stepPct(v!.p100) } : { p25: null, p50: null, p75: null, p100: null },
    }
  }
  const rows: QualityRow[] = deep.map((d) => make(d.adId, d, byId.get(d.adId)))
  if (!opts.pageFiltered) for (const m of insights ?? []) if (!deepIds.has(m.adId)) rows.push(make(m.adId, undefined, m))
  return rows
}

export type QualityTotals = {
  adsCounted: number
  chatsMeta: number | null
  /** แชท (Deep) ของชุดแอดเดียวกับ chatsMeta (ตัวลบของ F-02) */
  chatsDeepSameSet: number
  gap: number | null
  /** แชท (Deep) ของแอดที่ไม่ร่วมผลรวม (ไม่พบ Insights / ไม่มี action แชท) */
  excludedDeepChats: number
  highGapTop: QualityRow | null
  impressions: number | null
  clicks: number | null
  ctr: number | null
  rates: Record<'depth2' | 'depth3' | 'replied' | 'block', { pct: number | null; num: number | null; den: number | null }>
}

export function buildTotals(rows: QualityRow[]): QualityTotals {
  const set = rows.filter((r) => r.chatsMeta !== null)
  const chatsMeta = sumKnown(set.map((r) => r.chatsMeta))
  const chatsDeepSameSet = set.reduce((s, r) => s + r.chatsDeep, 0)
  const top = rows.filter((r) => r.badge === 'HIGH' || r.badge === 'NO_DEEP').sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0) || (b.chatsMeta ?? 0) - (a.chatsMeta ?? 0))[0] ?? null
  const rate = (k: 'depth2' | 'depth3' | 'replied' | 'block') => groupRatePct(set, (r) => r[k], (r) => r.chatsMeta)
  const ctrSet = groupRatePct(rows, (r) => r.clicks, (r) => r.impressions)
  return {
    adsCounted: set.length,
    chatsMeta, chatsDeepSameSet,
    gap: gapPct(chatsMeta, chatsDeepSameSet),
    excludedDeepChats: rows.filter((r) => r.chatsMeta === null).reduce((s, r) => s + r.chatsDeep, 0),
    highGapTop: top,
    impressions: sumKnown(rows.map((r) => r.impressions)),
    clicks: sumKnown(rows.map((r) => r.clicks)),
    ctr: ctrSet.pct,
    rates: { depth2: rate('depth2'), depth3: rate('depth3'), replied: rate('replied'), block: rate('block') },
  }
}

/** ค่าโฆษณา ÷ Σ คลิก (F-04) · ต่อแชท (Meta) (F-10) · ต่อแชท (Deep) (F-11) · ความถี่ (F-12) จากยอดรวม Q2 */
export function spendRatios(
  spend: number | null, totals: QualityTotals, deepChats: number, reach: { impressions: number | null; reach: number | null } | null,
  opts: { pageFiltered?: boolean } = {},
) {
  // เลือกเพจ: ค่าโฆษณารวมแอดที่มีแต่ใบ (ไม่มีแชท) ซึ่งไม่อยู่ในตัวหารคลิก/แชท (Meta) → ไม่หาร (HR16 ตัวตั้ง/ตัวหารต้องชุดเดียวกัน)
  const mixed = opts.pageFiltered === true
  return {
    cpc: mixed ? null : unitCost(spend, totals.clicks),
    costPerChatMeta: mixed ? null : unitCost(spend, totals.chatsMeta),
    costPerChatDeep: unitCost(spend, deepChats),
    frequency: reach ? frequency(reach.impressions, reach.reach) : null,
  }
}

// ── ⑥ จัดกลุ่มตามแคมเปญ ──────────────────────────────────────────────────────
export type CampaignGroup = {
  key: string
  name: string | null
  rows: QualityRow[]
  chatsMeta: number | null; chatsDeep: number; orders: number
  impressions: number | null; clicks: number | null; ctr: number | null
  rate2: number | null; rate3: number | null; rateReplied: number | null; rateBlock: number | null
  /** ตัวตั้ง/ตัวหารของแต่ละอัตรา (ชุดแถวเดียวกัน) — ใช้แสดง "k จาก n" ให้ตรงกับ % */
  rates: Record<'depth2' | 'depth3' | 'replied' | 'block', { pct: number | null; num: number | null; den: number | null }>
  closeRate: number | null
}
export function groupByCampaign(rows: QualityRow[]): CampaignGroup[] {
  const m = new Map<string, QualityRow[]>()
  for (const r of rows) m.set(r.campaign ?? '', [...(m.get(r.campaign ?? '') ?? []), r])
  return [...m].map(([key, rs]) => {
    const set = rs.filter((r) => r.chatsMeta !== null)
    const rates = {
      depth2: groupRatePct(set, (r) => r.depth2, (r) => r.chatsMeta), depth3: groupRatePct(set, (r) => r.depth3, (r) => r.chatsMeta),
      replied: groupRatePct(set, (r) => r.replied, (r) => r.chatsMeta), block: groupRatePct(set, (r) => r.block, (r) => r.chatsMeta),
    }
    const chatsDeep = rs.reduce((s, r) => s + r.chatsDeep, 0)
    const orders = rs.reduce((s, r) => s + r.orders, 0)
    return {
      key, name: key || null, rows: rs,
      chatsMeta: sumKnown(rs.map((r) => r.chatsMeta)), chatsDeep, orders,
      impressions: sumKnown(rs.map((r) => r.impressions)), clicks: sumKnown(rs.map((r) => r.clicks)),
      ctr: groupRatePct(rs, (r) => r.clicks, (r) => r.impressions).pct,
      rate2: rates.depth2.pct, rate3: rates.depth3.pct, rateReplied: rates.replied.pct, rateBlock: rates.block.pct, rates,
      closeRate: closeRatePct(orders, chatsDeep),
    }
  })
}

// ── ④ ตำแหน่ง ────────────────────────────────────────────────────────────────
export type PlacementLine = {
  key: string; label: string; platform: string
  spend: number | null; impressions: number | null; clicks: number | null; chats: number | null
  costPerChat: number | null; sharePct: number | null
}
export type PlacementView = {
  lines: PlacementLine[]
  /** ตำแหน่งที่เหลือรวมเป็น "อื่น ๆ" */
  rest: { count: number; spend: number | null; impressions: number | null; clicks: number | null; chats: number | null } | null
  platforms: { platform: string; label: string; chats: number }[]
  totalChats: number | null
  /** ต้นทุนต่อแชท (Meta) ต่ำสุด เฉพาะแถวที่แชท ≥ 20 — ไม่มีแถวเข้าเกณฑ์ = null */
  cheapest: PlacementLine | null
}
export function buildPlacements(rows: PlacementRow[], top = 8): PlacementView {
  const merged = new Map<string, PlacementRow[]>()
  for (const r of rows) merged.set(`${r.platform}|${r.position}`, [...(merged.get(`${r.platform}|${r.position}`) ?? []), r])
  const raw = [...merged.values()].map((rs) => ({
    platform: rs[0].platform, position: rs[0].position,
    spend: sumKnown(rs.map((r) => r.spend)), impressions: sumKnown(rs.map((r) => r.impressions)),
    clicks: sumKnown(rs.map((r) => r.clicks)), chats: sumKnown(rs.map((r) => r.chats)),
  })).sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
  const totalChats = sumKnown(raw.map((r) => r.chats))
  const toLine = (r: (typeof raw)[number]): PlacementLine => ({
    key: `${r.platform}|${r.position}`, label: placementLabel(r.platform, r.position), platform: r.platform,
    spend: r.spend, impressions: r.impressions, clicks: r.clicks, chats: r.chats,
    costPerChat: unitCost(r.spend, r.chats), sharePct: ratePct(r.chats, totalChats),
  })
  const lines = raw.map(toLine)
  const tail = raw.slice(top)
  const byPlatform = new Map<string, number>()
  for (const r of raw) if (r.chats !== null) byPlatform.set(r.platform, (byPlatform.get(r.platform) ?? 0) + r.chats)
  return {
    lines: lines.slice(0, top),
    rest: tail.length ? { count: tail.length, spend: sumKnown(tail.map((r) => r.spend)), impressions: sumKnown(tail.map((r) => r.impressions)), clicks: sumKnown(tail.map((r) => r.clicks)), chats: sumKnown(tail.map((r) => r.chats)) } : null,
    platforms: [...byPlatform].map(([platform, chats]) => ({ platform, label: platformLabel(platform), chats })).sort((a, b) => b.chats - a.chats),
    totalChats,
    // ต้นทุนต่ำสุดดูจากทุกแถว (ไม่ใช่แค่ 8 แถวแรก) เฉพาะที่ตัวอย่างพอ
    cheapest: lines.filter((l) => (l.chats ?? 0) >= HIGH_GAP_MIN_META_CHATS && l.costPerChat !== null).sort((a, b) => (a.costPerChat as number) - (b.costPerChat as number))[0] ?? null,
  }
}

// ── ④ อายุ/เพศ ───────────────────────────────────────────────────────────────
export type Metric = 'chats' | 'impressions' | 'spend'
export type AgeLine = { age: string; chats: number | null; spend: number | null; costPerChat: number | null; sharePct: number | null }

const ageOrder = (a: string) => (a === 'unknown' ? 999 : parseInt(a, 10) || 998)
export const ageLabel = (a: string) => (a === 'unknown' ? 'ไม่ระบุ' : a)

export function buildAgeSummary(rows: AgeGenderRow[]): { lines: AgeLine[]; top: AgeLine | null; totalChats: number | null } {
  const by = new Map<string, AgeGenderRow[]>()
  for (const r of rows) by.set(r.age, [...(by.get(r.age) ?? []), r])
  const totalChats = sumKnown(rows.map((r) => r.chats))
  const lines = [...by].sort((a, b) => ageOrder(a[0]) - ageOrder(b[0])).map(([age, rs]) => {
    const chats = sumKnown(rs.map((r) => r.chats)), spend = sumKnown(rs.map((r) => r.spend))
    return { age, chats, spend, costPerChat: unitCost(spend, chats), sharePct: ratePct(chats, totalChats) }
  })
  const top = lines.filter((l) => l.chats !== null).sort((a, b) => (b.chats as number) - (a.chats as number))[0] ?? null
  return { lines, top, totalChats }
}

/** ซีรีส์แท่งซ้อน: หนึ่งซีรีส์ต่อเพศ · ช่องที่ Meta ไม่ส่ง = null (ไม่ใช่ 0) */
export function buildAgeSeries(rows: AgeGenderRow[], metric: Metric) {
  const ages = [...new Set(rows.map((r) => r.age))].sort((a, b) => ageOrder(a) - ageOrder(b))
  const pick = (r: AgeGenderRow) => (metric === 'chats' ? r.chats : metric === 'impressions' ? r.impressions : r.spend)
  const gender = (g: string) => (g === 'male' || g === 'female' ? g : 'unknown')
  const series = GENDER_ORDER.map((g) => ({
    gender: g,
    data: ages.map((a) => sumKnown(rows.filter((r) => r.age === a && gender(r.gender) === g).map(pick))),
  }))
  const donut = series.map((s) => ({ gender: s.gender, value: sumKnown(s.data) }))
  return { ages, series, donut }
}

// ── ⑥ แถวของตารางคุณภาพ: แอดเดี่ยว หรือแคมเปญ (มี subRows) — รูปเดียวกันเพื่อให้ตาราง/รายการมือถือใช้ร่วมกัน ──
type RateKey = 'depth2' | 'depth3' | 'replied' | 'block'
export type QualityLine = {
  key: string
  kind: 'ad' | 'campaign'
  adId: string | null
  title: string | null
  photoFileId: string | null
  /** แอด: "แคมเปญ › ชุดโฆษณา" · แคมเปญ: null (UI ใส่จำนวนแอด) */
  campaign: string | null
  adset: string | null
  adCount: number
  inInsights: boolean
  chatsMeta: number | null
  chatsDeep: number
  orders: number
  impressions: number | null
  ctr: number | null
  rates: Record<RateKey, { pct: number | null; num: number | null; den: number | null }>
  closeRate: number | null
  isVideo: boolean
  thruplayPct: number | null
  videoSteps: { p25: number | null; p50: number | null; p75: number | null; p100: number | null }
  subRows?: QualityLine[]
}

export function adLine(r: QualityRow): QualityLine {
  const rate = (num: number | null, pct: number | null) => ({ pct, num, den: num === null ? null : r.chatsMeta })
  return {
    key: r.adId, kind: 'ad', adId: r.adId, title: r.title, photoFileId: r.photoFileId, campaign: r.campaign, adset: r.adset, adCount: 1,
    inInsights: r.inInsights, chatsMeta: r.chatsMeta, chatsDeep: r.chatsDeep, orders: r.orders, impressions: r.impressions, ctr: r.ctr,
    rates: { depth2: rate(r.depth2, r.rate2), depth3: rate(r.depth3, r.rate3), replied: rate(r.replied, r.rateReplied), block: rate(r.block, r.rateBlock) },
    closeRate: r.closeRate, isVideo: r.isVideo, thruplayPct: r.thruplayPct, videoSteps: r.videoSteps,
  }
}

export function campaignLine(g: CampaignGroup): QualityLine {
  return {
    key: `c:${g.key}`, kind: 'campaign', adId: null, title: g.name, photoFileId: null, campaign: null, adset: null, adCount: g.rows.length,
    inInsights: g.rows.some((r) => r.inInsights), chatsMeta: g.chatsMeta, chatsDeep: g.chatsDeep, orders: g.orders,
    impressions: g.impressions, ctr: g.ctr, rates: g.rates, closeRate: g.closeRate,
    isVideo: false, thruplayPct: null, videoSteps: { p25: null, p50: null, p75: null, p100: null },
    subRows: g.rows.map(adLine),
  }
}
