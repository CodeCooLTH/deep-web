/**
 * ad-revenue-view — ตัวคำนวณล้วนของหน้า "วิเคราะห์ยอดขายจากโฆษณา" (00091 เฟส 3 · FR-011..FR-019)
 * ไม่มีนิยามเงินใหม่ในไฟล์นี้ (HR16) — ตัวเลขทุกตัวมาจาก ad-revenue-report.service ซึ่งใช้ตัวกลางเดิม
 * ที่นี่แค่ "รวม/จัดกลุ่ม/ตัดสินกฎ" เพื่อให้เทสจับได้โดยไม่ต้องมี DB
 */

/** ตัวเลขต่อแอด — หน่วยเดียวที่ทุกแท็บรวมขึ้นไป */
export type AdMetrics = {
  adId: string
  adTitle: string | null
  adPhotoFileId: string | null
  /** ลำดับชั้นจาก Meta Insights — null = Meta ไม่ส่งมา / ยังไม่เชื่อมบัญชี → กลุ่ม "ไม่ทราบแคมเปญ" */
  campaignId: string | null
  campaignName: string | null
  adsetId: string | null
  adsetName: string | null
  chats: number
  /** ใบที่นับเป็นยอดขาย (salesOrderWhere) */
  orders: number
  sales: number
  /** ยอดของใบที่รับเงินแล้ว (isOrderUnpaid = false) — ส่วนหนึ่งของ sales */
  collected: number
  collectedOrders: number
  /** ใบทุกสถานะ (ยกเว้นร่าง) ตามวันที่สั่ง — ฐานของแท็บคุณภาพออเดอร์ */
  status: StatusCounts
  /** ยอดสั่งรวมทุกสถานะ (ยกเว้นร่าง) ตามวันที่สั่ง */
  gross: StatusAmounts
  /** ยอดที่รับเงินแล้วในชุดเดียวกับ `gross` (ไม่นับยกเลิก/ตีกลับ) — ตัวตั้งของ "อัตรารับเงินจริง" (ห้ามใช้ `collected` ซึ่งคนละชุดใบ) */
  collectedPlaced: number
  /** ค่าโฆษณาในช่วง — null = ไม่มีข้อมูลจาก Meta */
  spend: number | null
  newCustomers: number
  returningCustomers: number
  unknownCustomers: number
  newSales: number
  returningSales: number
  /** กำไรส่วนเกินก่อนหักค่าโฆษณา (ใบที่ P&L นับเป็นยอดขาย) */
  profitBeforeAds: number
  profitOrders: number
  /** ใบที่ต้นทุนสินค้าว่าง / ค่าส่งยังเป็นราคาประมาณหรือยังไม่กรอก — ต้องติดป้าย */
  incompleteProfitOrders: number
}

export const STATUS_KEYS = ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED', 'RETURNED'] as const
export type StatusKey = (typeof STATUS_KEYS)[number]
export type StatusCounts = Record<StatusKey, number>
export type StatusAmounts = Record<StatusKey, number>
export const emptyStatus = (): StatusCounts => ({ PENDING: 0, SHIPPED: 0, CONFIRMED: 0, CANCELLED: 0, RETURNED: 0 })

const round2 = (n: number) => Math.round(n * 100) / 100

// ── จัดกลุ่มแคมเปญ → ชุดโฆษณา (FR-012) ────────────────────────────────────────

export type GroupRow = {
  /** null = "ไม่ทราบ" */
  id: string | null
  name: string | null
  ads: number
  chats: number
  orders: number
  sales: number
  collected: number
  lost: number
  placed: number
  spend: number | null
  profitBeforeAds: number
  incompleteProfitOrders: number
}

/** รวมแอดเป็นแถวแคมเปญหรือชุดโฆษณา — จัดด้วย **รหัส** ไม่ใช่ชื่อ · ผลรวมทุกแถว = ผลรวมทุกแอด (ไม่ซ้ำ ไม่หาย) */
export function groupAds(ads: AdMetrics[], level: 'campaign' | 'adset'): GroupRow[] {
  const by = new Map<string, GroupRow>()
  for (const a of ads) {
    const id = level === 'campaign' ? a.campaignId : a.adsetId
    const name = level === 'campaign' ? a.campaignName : a.adsetName
    const k = id ?? ''
    let g = by.get(k)
    if (!g) by.set(k, (g = { id, name, ads: 0, chats: 0, orders: 0, sales: 0, collected: 0, lost: 0, placed: 0, spend: null, profitBeforeAds: 0, incompleteProfitOrders: 0 }))
    if (!g.name && name) g.name = name
    g.ads += 1
    g.chats += a.chats
    g.orders += a.orders
    g.sales += a.sales
    g.collected += a.collected
    g.lost += a.status.CANCELLED + a.status.RETURNED
    g.placed += placedOf(a.status)
    if (a.spend !== null) g.spend = (g.spend ?? 0) + a.spend
    g.profitBeforeAds += a.profitBeforeAds
    g.incompleteProfitOrders += a.incompleteProfitOrders
  }
  return [...by.values()]
    .map((g) => ({ ...g, sales: round2(g.sales), collected: round2(g.collected), spend: g.spend === null ? null : round2(g.spend), profitBeforeAds: round2(g.profitBeforeAds) }))
    // "ไม่ทราบ" อยู่ล่างสุดเสมอ — ไม่ปนกับแคมเปญจริง
    .sort((x, y) => Number(x.id === null) - Number(y.id === null) || y.sales - x.sales)
}

export const placedOf = (s: StatusCounts) => STATUS_KEYS.reduce((n, k) => n + s[k], 0)

/** อัตรารับเงินจริง = รับเงินแล้ว ÷ ยอดสั่งรวม (ชุดใบเดียวกัน ⇒ ไม่เกิน 100%) — null เมื่อยอดสั่ง 0 */
export function collectedRatePct(a: Pick<AdMetrics, 'gross' | 'collectedPlaced'>): number | null {
  const g = STATUS_KEYS.reduce((n, k) => n + a.gross[k], 0)
  return g > 0 ? round2((a.collectedPlaced / g) * 100) : null
}

/** % ยกเลิก+ตีกลับ จากใบที่สั่งทั้งหมด — null เมื่อไม่มีใบ */
export function lostRatePct(s: StatusCounts): number | null {
  const placed = placedOf(s)
  return placed > 0 ? round2(((s.CANCELLED + s.RETURNED) / placed) * 100) : null
}

/** กำไรส่วนเกินหลังหักค่าโฆษณา — ค่าโฆษณาไม่ทราบ = คืนกำไรก่อนหักค่าโฆษณา พร้อมธงให้ UI ติดป้าย */
export function contribution(profitBeforeAds: number, spend: number | null): { value: number; spendKnown: boolean } {
  return { value: round2(profitBeforeAds - (spend ?? 0)), spendKnown: spend !== null }
}

// ── waterfall (FR-013) ───────────────────────────────────────────────────────

export type Waterfall = { gross: number; cancelled: number; returned: number; open: number; unrecorded: number; collected: number }

/**
 * ยอดสั่งทั้งหมด → หักยกเลิก → หักตีกลับ/คืน → ยังไม่บันทึกรับเงิน → รับเงินแล้ว
 * ทุกขั้นมาจากชุดใบที่ไม่ซ้อนกัน (ใบหนึ่งอยู่สถานะเดียว) ⇒ gross = cancelled + returned + unrecorded + collected เสมอ
 * `open` = ยอดที่เหลือหลังหักยกเลิก/ตีกลับ (แท่งกลางของกราฟ)
 */
export function buildWaterfall(parts: { gross: StatusAmounts; collectedAmongOpen: number }): Waterfall {
  const gross = round2(STATUS_KEYS.reduce((n, k) => n + parts.gross[k], 0))
  const cancelled = round2(parts.gross.CANCELLED)
  const returned = round2(parts.gross.RETURNED)
  const open = round2(gross - cancelled - returned)
  const collected = round2(Math.min(parts.collectedAmongOpen, open))
  return { gross, cancelled, returned, open, unrecorded: round2(open - collected), collected }
}

// ── เวลา (FR-011 · FR-017) ───────────────────────────────────────────────────

const TH_OFFSET = 7 * 3_600_000

/** ช่อง heatmap: แถว 0 = จันทร์ … 6 = อาทิตย์ · คอลัมน์ = ชั่วโมงไทย 0–23 */
export function thaiWeekdayHour(d: Date): { row: number; hour: number } {
  const t = new Date(d.getTime() + TH_OFFSET)
  return { row: (t.getUTCDay() + 6) % 7, hour: t.getUTCHours() }
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ── คำแนะนำ (FR-018) ─────────────────────────────────────────────────────────

/** 🛑 เกณฑ์ทั้งหมดอยู่ที่นี่ที่เดียว — แก้ตัวเลขต้องแก้เทสคู่กัน */
export const INSIGHT_RULES = {
  /** แอดต้องมีออเดอร์อย่างน้อยเท่านี้ในช่วง (เกณฑ์เดียวกับ FR-010 "ROAS ดีที่สุด") */
  minOrders: 10,
  /** ยกเลิก/ตีกลับสูง = ≥ ค่าเฉลี่ยร้าน × ตัวนี้ */
  highLostFactor: 1.5,
  /** ROAS จากยอดรับเงินจริงต่ำกว่านี้ = ใช้เงินมากแต่ได้เงินน้อย */
  lowCollectedRoas: 1,
  /** แชทเยอะแต่ซื้อน้อย = อัตราปิด < ค่าเฉลี่ยร้าน × ตัวนี้ */
  lowCloseFactor: 0.5,
  /** แอดรับเงินดี = ROAS จากยอดรับเงิน ≥ ตัวนี้ และยกเลิก ≤ ค่าเฉลี่ย */
  strongCollectedRoas: 2,
  /** สินค้าเด่นของแอด = สินค้าเดียวทำยอด ≥ % นี้ของแอด */
  dominantProductPct: 50,
} as const

export type InsightKind = 'HIGH_LOST' | 'LOW_COLLECTED_ROAS' | 'LOW_CLOSE' | 'STRONG' | 'PRODUCT_FOCUS'
export type Insight = {
  kind: InsightKind
  /** REVIEW = ควรตรวจสอบ · OPPORTUNITY = โอกาส */
  level: 'REVIEW' | 'OPPORTUNITY'
  adId: string
  adTitle: string | null
  /** ตัวเลขที่ใช้ตัดสิน: ค่าของแอด เทียบ ค่าอ้างอิง */
  value: number
  benchmark: number
  /** PRODUCT_FOCUS เท่านั้น */
  productName?: string
}

/**
 * กฎตายตัว 5 ข้อ — แอดที่ออเดอร์น้อยกว่าเกณฑ์ไม่ถูกตัดสิน (ตัวเลขน้อย = เดาสุ่ม)
 * ค่าเฉลี่ยร้านคิดจาก **ทุกแอด** ในช่วง (ไม่ใช่เฉพาะแอดที่ผ่านเกณฑ์) · ไม่มีอะไรเข้าเกณฑ์ = []
 */
export function buildInsights(ads: AdMetrics[], topProductByAd: Map<string, { name: string; sales: number }>): Insight[] {
  const R = INSIGHT_RULES
  let placed = 0, lost = 0, chats = 0, orders = 0
  for (const a of ads) {
    placed += placedOf(a.status)
    lost += a.status.CANCELLED + a.status.RETURNED
    chats += a.chats
    orders += a.orders
  }
  const avgLost = placed > 0 ? (lost / placed) * 100 : null
  const avgClose = chats > 0 ? (orders / chats) * 100 : null
  const out: Insight[] = []
  for (const a of ads) {
    if (a.orders < R.minOrders) continue
    const base = { adId: a.adId, adTitle: a.adTitle }
    const lr = lostRatePct(a.status)
    if (lr !== null && avgLost !== null && avgLost > 0 && lr >= avgLost * R.highLostFactor) {
      out.push({ ...base, kind: 'HIGH_LOST', level: 'REVIEW', value: lr, benchmark: round2(avgLost) })
    }
    const cRoas = a.spend && a.spend > 0 ? round2(a.collected / a.spend) : null
    if (cRoas !== null && cRoas < R.lowCollectedRoas) {
      out.push({ ...base, kind: 'LOW_COLLECTED_ROAS', level: 'REVIEW', value: cRoas, benchmark: R.lowCollectedRoas })
    }
    if (a.chats > 0 && avgClose !== null) {
      const close = (a.orders / a.chats) * 100
      if (close < avgClose * R.lowCloseFactor) out.push({ ...base, kind: 'LOW_CLOSE', level: 'REVIEW', value: round2(close), benchmark: round2(avgClose) })
    }
    if (cRoas !== null && cRoas >= R.strongCollectedRoas && lr !== null && avgLost !== null && lr <= avgLost) {
      out.push({ ...base, kind: 'STRONG', level: 'OPPORTUNITY', value: cRoas, benchmark: R.strongCollectedRoas })
    }
    const tp = topProductByAd.get(a.adId)
    if (tp && a.sales > 0) {
      const pct = (tp.sales / a.sales) * 100
      if (pct >= R.dominantProductPct) out.push({ ...base, kind: 'PRODUCT_FOCUS', level: 'OPPORTUNITY', value: round2(pct), benchmark: R.dominantProductPct, productName: tp.name })
    }
  }
  // ควรตรวจสอบก่อนโอกาส · ในระดับเดียวกันเรียงตามยอดขายของแอด
  const salesOf = new Map(ads.map((a) => [a.adId, a.sales]))
  return out.sort((x, y) => Number(x.level !== 'REVIEW') - Number(y.level !== 'REVIEW') || (salesOf.get(y.adId) ?? 0) - (salesOf.get(x.adId) ?? 0))
}
