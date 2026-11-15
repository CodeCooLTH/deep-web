/**
 * ad-summary/view — การตัดสินใจฝั่งจอของหน้า "สรุปโฆษณา" /reports/ads-summary (00094)
 * ทำไมแยกจากคอมโพเนนต์: boolean/ตรรกะที่ตัดสินสิ่งที่ผู้ใช้เห็น ต้องมีที่ให้เทสจับ (convention ui-boolean-needs-a-testable-home)
 * pure ล้วน — ไม่มี React/DB · ข้อความรับมาเป็นพจนานุกรมสตริง (ไม่ฝังประโยคไทยในไฟล์นี้)
 */
import { ratePct, unitCost } from '@/lib/ad-quality-formulas'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { isThin } from './classify'
import { cpaOfRow, cpm, pctChange, roasOfRow, TONE, trendOf } from './formulas'
import type { AdRow, AdSummaryReport, Audience, CampaignRow, Funnel, Insight, KpiSet, MetaState, MetricPair, PerfTag, Profit, RollUp, Tone, Trend } from './types'
import type { SeriesKey } from './buckets'

type Dict = Record<string, string>

// ───────── % เปลี่ยน · สี ─────────

export type DeltaView = { pct: number | null; trend: Trend; arrow: 'up' | 'down' | null }

/** กลาง/ไม่เปลี่ยน/ไม่มีฐาน = ไม่มีลูกศร (BR-AIR-02) */
export function deltaView(pair: MetricPair, tone: Tone): DeltaView {
  const pct = pctChange(pair.cur, pair.prev)
  const trend = trendOf(pair, tone)
  const arrow = pct === null || pct === 0 || trend === 'neutral' ? null : pct > 0 ? 'up' : 'down'
  return { pct, trend, arrow }
}

/** ดีขึ้น success-ink · แย่ลง warning-ink (ไม่ใช้ danger — BR-AIR-03) · กลาง default-700 */
export const inkClass = (t: Trend) => (t === 'good' ? 'text-success-ink' : t === 'bad' ? 'text-warning-ink' : 'text-default-700')
export const badgeClass = (t: Trend) => (t === 'good' ? 'bg-success/15 text-success-ink' : t === 'bad' ? 'bg-warning/15 text-warning-ink' : 'bg-light text-default-700')

export type ChartToken = 'chart-primary' | 'chart-zeta' | 'default-400'
/** สีกราฟเล็กตามทิศทาง (BR-AIR-16) — ไม่มีฐานเทียบ = กลาง (ไม่ตัดสิน) */
export const chartToken = (t: Trend): ChartToken => (t === 'good' ? 'chart-primary' : t === 'bad' ? 'chart-zeta' : 'default-400')

/** "+12.3%" / "−5.0%" / "0.0%" — เครื่องหมายลบเป็น U+2212 */
export function signedPct(pct: number, digits = 1): string {
  const v = Math.abs(pct).toFixed(digits)
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${v}%`
}

// ───────── ตัวเลขรอง (Stat tiles) ─────────

export type ValueUnit = 'num' | 'baht' | 'pct1' | 'pct2' | 'x2'
export function formatValue(unit: ValueUnit, v: number | null): string {
  if (v === null) return '—'
  switch (unit) {
    case 'num': return formatNumberNoSymbol(Math.round(v))
    case 'baht': return formatBaht(v)
    case 'pct1': return `${v.toFixed(1)}%`
    case 'pct2': return `${v.toFixed(2)}%`
    case 'x2': return v.toFixed(2)
  }
}

export type TileKey = 'orders' | 'closeRate' | 'aov' | 'impressions' | 'reach' | 'frequency' | 'chatsMeta' | 'ctr' | 'cpc' | 'cpm' | 'costPerChatMeta'
export type Tile = { key: TileKey & keyof KpiSet & SeriesKey; label: string; icon: string; unit: ValueUnit; chart: 'bar' | 'area'; meta: boolean; rate: boolean }
// label = คีย์ใน dictionary adSummary · rate = อัตรา → title "ช่วงก่อน X%" (มติ user: % ทุกตัว ไม่ใช้ "จุด")
export const TILES: Tile[] = [
  { key: 'orders', label: 'tOrders', icon: 'shopping-cart', unit: 'num', chart: 'bar', meta: false, rate: false },
  { key: 'closeRate', label: 'tClose', icon: 'target-arrow', unit: 'pct1', chart: 'area', meta: false, rate: true },
  { key: 'aov', label: 'tAov', icon: 'receipt', unit: 'baht', chart: 'area', meta: false, rate: false },
  { key: 'impressions', label: 'tImpr', icon: 'eye', unit: 'num', chart: 'bar', meta: true, rate: false },
  { key: 'reach', label: 'tReach', icon: 'users', unit: 'num', chart: 'bar', meta: true, rate: false },
  { key: 'frequency', label: 'tFreq', icon: 'repeat', unit: 'x2', chart: 'area', meta: true, rate: false },
  { key: 'chatsMeta', label: 'tChatsMeta', icon: 'message-circle', unit: 'num', chart: 'bar', meta: true, rate: false },
  { key: 'ctr', label: 'tCtr', icon: 'click', unit: 'pct2', chart: 'area', meta: true, rate: true },
  { key: 'cpc', label: 'tCpc', icon: 'coin', unit: 'baht', chart: 'area', meta: true, rate: false },
  { key: 'cpm', label: 'tCpm', icon: 'chart-bar', unit: 'baht', chart: 'area', meta: true, rate: false },
  { key: 'costPerChatMeta', label: 'tCpChat', icon: 'messages', unit: 'baht', chart: 'area', meta: true, rate: false },
]
export { TONE }

// ───────── สถานะ Meta ─────────

export type MetaView = 'ok' | 'none' | 'auth' | 'currency' | 'error'
export const metaView = (s: MetaState): MetaView => (s === 'OK' ? 'ok' : s === 'NOT_CONNECTED' ? 'none' : s === 'AUTH' ? 'auth' : s === 'CURRENCY' ? 'currency' : 'error')
export const metaOk = (s: MetaState) => s === 'OK'

// ───────── แนวโน้ม ─────────

export type TrendKey = 'sales' | 'spend' | 'orders' | 'ctr'
export const TREND_TABS: { key: TrendKey; label: string; icon: string; unit: ValueUnit; meta: boolean }[] = [
  { key: 'sales', label: 'kSales', icon: 'cash', unit: 'baht', meta: false },
  { key: 'spend', label: 'kSpend', icon: 'speakerphone', unit: 'baht', meta: true },
  { key: 'orders', label: 'tOrders', icon: 'shopping-cart', unit: 'num', meta: false },
  { key: 'ctr', label: 'tCtr', icon: 'click', unit: 'pct2', meta: true },
]

/** แท็บที่ต้องใช้ Meta ปิดเมื่อไม่ OK หรือช่วง 1 วัน (Meta ไม่มีรายชั่วโมง) — null = ใช้ได้ */
export function trendDisabled(meta: boolean, state: MetaState, hourly: boolean): 'none' | 'hourly' | null {
  if (!meta) return null
  if (state !== 'OK') return 'none'
  return hourly ? 'hourly' : null
}

/** แท็บที่เลือกอยู่ถูกปิด (เช่น ตัวกรองเปลี่ยนเป็นช่วง 1 วัน) → กลับไปยอดขาย */
export function resolveTrendKey(selected: TrendKey, state: MetaState, hourly: boolean): TrendKey {
  const tab = TREND_TABS.find((t) => t.key === selected)
  return tab && trendDisabled(tab.meta, state, hourly) === null ? selected : 'sales'
}

/** AC-7: บรรทัดสรุปใต้กราฟ — ต้องมี % ทั้งสองตัว ไม่งั้นไม่แสดง (ห้ามเดา) */
export function trendSummaryDeltas(kpi: KpiSet): { spend: string; orders: string } | null {
  const s = pctChange(kpi.spend.cur, kpi.spend.prev)
  const o = pctChange(kpi.orders.cur, kpi.orders.prev)
  return s === null || o === null ? null : { spend: signedPct(s, 0), orders: signedPct(o, 0) }
}

// ───────── funnel ─────────

export type FunnelRowView = {
  index: number
  value: number | null
  meta: boolean
  /** อัตราผ่านจากขั้นก่อน (%) — null = ไม่คำนวณ (ขั้นใดขั้นหนึ่งไม่มีค่า) */
  pass: number | null
  /** % เปลี่ยนของอัตราผ่านเทียบช่วงก่อน — null = ไม่มีฐาน */
  change: number | null
  crossSource: boolean
  worst: boolean
}
export function funnelRows(f: Funnel): FunnelRowView[] {
  return f.steps.map((s, i) => {
    const r = i === 0 ? null : f.rates[i - 1]
    return {
      index: i, value: s.cur, meta: s.source === 'META',
      pass: r?.cur ?? null, change: r ? pctChange(r.cur, r.prev) : null,
      crossSource: r?.crossSource ?? false, worst: f.worst !== null && f.worst === i - 1,
    }
  })
}

// ───────── ตารางแคมเปญ ─────────

export type ColKey = 'spend' | 'sales' | 'roas' | 'orders' | 'cpa' | 'chats' | 'chatsMeta' | 'impressions' | 'ctr' | 'cpc' | 'cpm' | 'delta'
export const ALL_COLS: { key: ColKey; label: string; unit: ValueUnit }[] = [
  { key: 'spend', label: 'cSpend', unit: 'baht' },
  { key: 'sales', label: 'cSales', unit: 'baht' },
  { key: 'roas', label: 'cRoas', unit: 'x2' },
  { key: 'orders', label: 'cOrders', unit: 'num' },
  { key: 'cpa', label: 'cCpa', unit: 'baht' },
  { key: 'chats', label: 'cChats', unit: 'num' },
  { key: 'chatsMeta', label: 'cChatsMeta', unit: 'num' },
  { key: 'impressions', label: 'cImpr', unit: 'num' },
  { key: 'ctr', label: 'cCtr', unit: 'pct2' },
  { key: 'cpc', label: 'cCpc', unit: 'baht' },
  { key: 'cpm', label: 'cCpm', unit: 'baht' },
  { key: 'delta', label: 'cDelta', unit: 'pct1' },
]
/** ตั้งต้น 8 คอลัมน์หลัก (BRD FR-007 AC-4) */
export const DEFAULT_COLS: ColKey[] = ['spend', 'sales', 'roas', 'orders', 'cpa', 'chats', 'ctr', 'delta']
export const COLS_STORAGE_KEY = 'ads-summary:cols'

/** ค่าจาก localStorage ต้องผ่านด่านก่อนใช้ — ค่าแปลก/ว่าง = ตั้งต้น */
export function parseCols(raw: string | null): ColKey[] {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null
    if (!Array.isArray(v)) return DEFAULT_COLS
    const ok = ALL_COLS.map((c) => c.key).filter((k) => v.includes(k))
    return ok.length ? ok : DEFAULT_COLS
  } catch {
    return DEFAULT_COLS
  }
}

type Metricable = Pick<RollUp, 'spend' | 'sales' | 'orders' | 'coveredSales' | 'coveredOrders' | 'chats' | 'chatsMeta' | 'impressions' | 'clicks'>
/** ค่าของคอลัมน์หนึ่งของแถวหนึ่ง — อัตรา = Σ/Σ ของแถวนั้น (RollUp รวมจากลูกแล้ว) · null = "—" */
export function metricOf(r: Metricable, key: ColKey, prevSpend: number | null = null): number | null {
  switch (key) {
    case 'spend': return r.spend
    case 'sales': return r.sales
    case 'roas': return roasOfRow(r)
    case 'orders': return r.orders
    case 'cpa': return cpaOfRow(r)
    case 'chats': return r.chats
    case 'chatsMeta': return r.chatsMeta
    case 'impressions': return r.impressions
    case 'ctr': return ratePct(r.clicks, r.impressions)
    case 'cpc': return unitCost(r.spend, r.clicks)
    case 'cpm': return cpm(r.spend, r.impressions)
    case 'delta': return pctChange(r.spend, prevSpend)
  }
}

export type StatusGroup = 'on' | 'off' | 'unknown'
export const statusGroup = (s: string | null): StatusGroup => (s === null ? 'unknown' : s === 'ACTIVE' ? 'on' : 'off')

export type CampFilter = { q: string; status: 'all' | 'on' | 'off'; objective: string; tag: 'all' | NonNullable<PerfTag> }
export const NO_FILTER: CampFilter = { q: '', status: 'all', objective: 'all', tag: 'all' }

/** ค้นหาไล่ลงถึงชุด/โฆษณา — แคมเปญที่ลูกตรงเงื่อนไขก็ผ่าน */
export function filterCampaigns(rows: CampaignRow[], f: CampFilter): CampaignRow[] {
  const q = f.q.trim().toLowerCase()
  return rows.filter((c) => {
    if (f.status !== 'all' && statusGroup(c.status) !== f.status) return false
    if (f.objective !== 'all' && c.objective !== f.objective) return false
    if (f.tag !== 'all' && c.tag !== f.tag) return false
    if (!q) return true
    const hit = (s: string | null) => (s ?? '').toLowerCase().includes(q)
    return hit(c.name) || c.adsets.some((a) => hit(a.name) || a.ads.some((x) => hit(x.name)))
  })
}

export function sortCampaigns(rows: CampaignRow[], key: ColKey | null, dir: 'asc' | 'desc'): CampaignRow[] {
  if (!key) return rows
  const val = (c: CampaignRow) => metricOf(c, key, c.prevSpend)
  const sign = dir === 'asc' ? 1 : -1
  // null เรียงท้ายเสมอ ไม่ว่าทิศไหน
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b)
    if (x === null && y === null) return 0
    if (x === null) return 1
    if (y === null) return -1
    return (x - y) * sign
  })
}

export function pageSlice(total: number, pageIndex: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const index = Math.min(Math.max(0, pageIndex), pageCount - 1)
  const start = total === 0 ? 0 : index * pageSize + 1
  const end = Math.min(total, (index + 1) * pageSize)
  return { pageCount, index, start, end, from: index * pageSize, to: (index + 1) * pageSize }
}

export const MAX_COMPARE = 3
/** ติ๊กเพิ่มได้ถึง 3 — ตัวที่ 4 ไม่เข้า (ติ๊กออกได้เสมอ) */
export function toggleSelect(sel: string[], id: string, max = MAX_COMPARE): string[] {
  if (sel.includes(id)) return sel.filter((x) => x !== id)
  return sel.length >= max ? sel : [...sel, id]
}

export const OBJECTIVE_KEYS: Record<string, string> = {
  OUTCOME_SALES: 'objSales', CONVERSIONS: 'objSales', OUTCOME_LEADS: 'objLeads', LEAD_GENERATION: 'objLeads',
  OUTCOME_ENGAGEMENT: 'objEngagement', MESSAGES: 'objMessages', OUTCOME_AWARENESS: 'objAwareness', OUTCOME_TRAFFIC: 'objTraffic',
}
export const objectiveLabel = (t: Dict, o: string | null) => (o === null ? '' : t[OBJECTIVE_KEYS[o] ?? 'objOther'])

export const TAG_KEYS: Record<NonNullable<PerfTag>, string> = { good: 'tagGood', ok: 'tagOk', watch: 'tagWatch', thin: 'tagThin' }

// ───────── ครีเอทีฟ ─────────

export type CreativeSort = 'orders' | 'roas' | 'spend'
export const CREATIVE_TOP = 5

/** ตัวเลือกจัดอันดับ: Meta OK = เฉพาะโฆษณาที่ Meta รู้จัก · ไม่ OK = ทุกตัว (ไม่มีโครงให้แยก) */
export function creativePool(r: Pick<AdSummaryReport, 'campaigns' | 'unknownCampaign' | 'meta'>): AdRow[] {
  const known = r.campaigns.flatMap((c) => c.adsets.flatMap((a) => a.ads))
  return r.meta.state === 'OK' ? known : [...known, ...r.unknownCampaign.ads]
}

export function rankCreatives(ads: AdRow[], sort: CreativeSort): AdRow[] {
  const val = (a: AdRow) => (sort === 'orders' ? a.orders : sort === 'roas' ? roasOfRow(a) ?? 0 : a.spend ?? 0)
  return [...ads].sort((x, y) => val(y) - val(x)).slice(0, CREATIVE_TOP)
}

/** แอดข้อมูลน้อยไม่วาดบนจุดกระจาย (FR-009 AC-2) · แยก 2 กลุ่มด้วยต้นทุนต่อออเดอร์เทียบค่าเฉลี่ยร้าน */
export function bubbleSplit(ads: AdRow[], avgCpa: number | null): { low: AdRow[]; high: AdRow[] } {
  const low: AdRow[] = []
  const high: AdRow[] = []
  for (const a of ads) {
    if (isThin(a) || a.spend === null) continue
    const cpa = cpaOfRow(a)
    const isLow = avgCpa === null ? true : cpa !== null && cpa <= avgCpa
    ;(isLow ? low : high).push(a)
  }
  return { low, high }
}

export const FLAG_KEYS = { HIGH_SPEND_LOW_ORDERS: 'flagSpend', HIGH_CTR_LOW_CLOSE: 'flagCtr' } as const

// ───────── ความคุ้มค่า ─────────

export type ProfitKind = 'ok' | 'insufficient' | 'noSpend'
export type ProfitView = { kind: ProfitKind; missing: number; belowCost: boolean }
export function profitView(p: Profit, state: MetaState): ProfitView {
  // ไม่มีค่าโฆษณา (Meta ไม่ OK) → ไม่มีตัวลบ จึงไม่มีกำไรหลังค่าโฆษณา
  if (state !== 'OK' || p.spend === null) return { kind: 'noSpend', missing: 0, belowCost: false }
  // ต้นทุนไม่ครบ/ใบเกินเพดาน → ห้ามเดา (buildProfit ส่ง null มาให้แล้ว)
  if (p.grossProfit === null) return { kind: 'insufficient', missing: p.missingCostLines, belowCost: false }
  return { kind: 'ok', missing: 0, belowCost: p.grossMargin !== null && p.grossMargin <= 0 }
}

export type WaterfallBar = { key: 'sales' | 'cogs' | 'spend' | 'profit'; base: number; pos: number; neg: number; label: number; minus: boolean }
/** แท่งน้ำตก = stacked column ฐานโปร่ง · ช่วงที่คร่อมศูนย์แยกเป็นส่วนบวก/ลบ (Apex ซ้อนบวกกับลบแยกกัน) */
export function waterfall(p: Profit): WaterfallBar[] | null {
  if (p.cogs === null || p.spend === null || p.grossProfit === null || p.profitAfterAds === null) return null
  const sales = p.coveredSales
  const g = sales - p.cogs
  const net = g - p.spend
  const bar = (key: WaterfallBar['key'], lo: number, hi: number, label: number, minus: boolean): WaterfallBar => {
    if (lo >= 0) return { key, base: lo, pos: hi - lo, neg: 0, label, minus }
    if (hi <= 0) return { key, base: hi, pos: 0, neg: lo - hi, label, minus }
    return { key, base: 0, pos: hi, neg: lo, label, minus }
  }
  return [
    bar('sales', 0, sales, sales, false),
    bar('cogs', Math.min(g, sales), Math.max(g, sales), p.cogs, true),
    bar('spend', Math.min(net, g), Math.max(net, g), p.spend, true),
    bar('profit', Math.min(0, net), Math.max(0, net), net, false),
  ]
}

export function profitByCampaign(p: Profit): { name: string; value: number }[] {
  return p.byCampaign
    .filter((c): c is typeof c & { profitAfterAds: number } => c.profitAfterAds !== null)
    .map((c) => ({ name: c.name ?? c.campaignId, value: c.profitAfterAds }))
    .sort((a, b) => b.value - a.value)
}

// ───────── กลุ่มผู้ชม ─────────

export type AudienceView = 'ok' | 'needConnect' | 'empty' | 'unavailable' | 'error' | 'auth'
export function audienceView(state: MetaState, a: Audience): AudienceView {
  if (state === 'NOT_CONNECTED') return 'needConnect'
  if (state === 'AUTH') return 'auth'
  if (state === 'CURRENCY') return 'unavailable'
  if (state === 'ERROR') return 'error'
  if (a.status === 'OK') return a.gender.length || a.age.length ? 'ok' : 'empty'
  return a.status === 'EMPTY' ? 'empty' : a.status === 'UNAVAILABLE' ? 'unavailable' : a.status === 'AUTH' ? 'auth' : 'error'
}

/** กลุ่มอายุที่ต้นทุนต่อแชท (Meta) ต่ำสุด — ต้องมีแชทและค่าโฆษณา */
export function cheapestAge(age: Audience['age']): string | null {
  let best: { range: string; v: number } | null = null
  for (const r of age) {
    const v = unitCost(r.spend, r.chatsMeta)
    if (v !== null && (best === null || v < best.v)) best = { range: r.range, v }
  }
  return best?.range ?? null
}

// ───────── คำแนะนำ ─────────

/** ปุ่ม bubble ซ่อนเมื่อใบเกินเพดาน (ไม่มีคำแนะนำให้ถือว่าถูกต้องไม่ได้) — ไม่มีข้อ = ยังแสดง */
export const showInsightBubble = (r: Pick<AdSummaryReport, 'truncated'>) => !r.truncated

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const r1 = (n: number) => `${Math.round(n)}%`
const dp = (n: number, d: number) => `${n.toFixed(d)}%`

/** พารามิเตอร์ของข้อความ — จัดรูปตามชนิดตัวเลขของแต่ละกฎ */
export function insightParams(i: Insight): Record<string, string | number> {
  const p = i.params
  const n = (k: string) => Number(p[k] ?? 0)
  switch (i.rule) {
    case 'R1': return { pct: r1(n('pct')) }
    case 'R2': return { spendPct: signedPct(n('spendPct'), 0), ordersPct: signedPct(n('ordersPct'), 0) }
    case 'R3': return { from: dp(n('from'), 2), to: dp(n('to'), 2) }
    case 'R4': return { to: dp(n('to'), 1), from: dp(n('from'), 1) }
    case 'R5': return { name: String(p.name ?? ''), spendShare: `${n('spendShare')}%`, orderShare: `${n('orderShare')}%` }
    case 'R6': return { name: String(p.name ?? ''), times: n('times').toFixed(1) }
    case 'R7': return { meta: formatNumberNoSymbol(n('meta')), shop: formatNumberNoSymbol(n('shop')) }
    case 'R8': return { name: String(p.name ?? '') }
  }
}

export type InsightLink = 'table' | 'ads' | 'quality' | null
export const insightLink = (i: Insight): InsightLink =>
  i.rule === 'R7' ? 'quality' : i.rule === 'R4' ? 'ads' : i.rule === 'R2' || i.rule === 'R5' || i.rule === 'R6' || i.rule === 'R8' ? 'table' : null

export function evidenceText(e: Insight['evidence'][number]): { value: string; prev: string | null } {
  const f = (v: number | null) => {
    if (v === null) return '—'
    switch (e.unit) {
      case 'baht': return formatBaht(v)
      case 'pct': return dp(v, Math.abs(v) < 10 ? 2 : 1)
      case 'x': return v.toFixed(2)
      case 'num': return formatNumberNoSymbol(v)
    }
  }
  return { value: f(e.value), prev: e.prev === undefined || e.prev === null ? null : f(e.prev) }
}

export function insightWhyKey(i: Insight): string {
  if (i.rule !== 'R1') return `${i.rule.toLowerCase()}Why`
  return i.params.cause ? `r1Why${cap(String(i.params.cause))}` : 'r1WhyNone'
}
export const insightHeadKey = (i: Insight) => `${i.rule.toLowerCase()}Head`
export const insightActKey = (i: Insight) => `${i.rule.toLowerCase()}Act`
export const evidenceLabelKey = (key: string) => `ev${cap(key)}`
