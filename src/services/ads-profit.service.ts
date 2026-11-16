/**
 * ads-profit.service — รายงานกำไรและประสิทธิภาพโฆษณารายวัน (00096 · BRD FR-004..FR-010)
 *
 * ต่อยอด getAdRevenueReport (ค่าโฆษณา · ลำดับชั้น · ชื่อ/รูป · ยอด/ใบตามนิยาม 00091) แล้วแตกกำไรรายโฆษณาเป็นตัวประกอบ:
 *   ยอดสุทธิ · ต้นทุนสินค้า · ค่าใช้จ่ายผันแปร — ด้วย pnlOrderParts ตัวเดียวกับหน้ากำไร (HR16)
 * สองโหมด (PRD §4.1 ข้อ 5):
 *   - คาดการณ์ (expected) = ใบชุดยอดขาย (salesOrderWhere — ชุดเดียวกับ "คำสั่งซื้อ" ของ 00091) รวมใบที่ยังไม่รับเงิน
 *   - รับรู้แล้ว (realized) = ใบชุดหน้ากำไร (revenueWindowWhere) — กำไรก่อนค่าโฆษณาต่อแอดต้องเท่ากับ 00091 profitBeforeAds (เทส parity)
 * ค่าใช้จ่ายผันแปร = ค่าส่งขาไปเฉพาะร้านบริการ (กฎหน้ากำไร มติ 2026-10-02 · user ตอบ Q1 "ตามแนะนำ") + ค่าส่งคืน · ค่าธรรมเนียมอื่นระบบไม่มีข้อมูล
 * 🛑 ทุก query ผูก shopId (tenant) · ค่าโฆษณามาจาก base ที่ระดับ ad เท่านั้น (ไม่บวกซ้ำจากแคมเปญ/ชุด)
 */
import { prisma } from '@/lib/prisma'
import { profitMetrics, profitStatus, type ProfitMetrics, type ProfitParts, type ProfitStatus } from '@/lib/ads-profit'
import { revenueWindowWhere } from '@/lib/order-revenue'
import { RETURN_STATUS, sumReturnShippingCost } from '@/lib/order-return'
import { thaiDayKey } from '@/lib/format-date'
import { getReturnAdjustments } from '@/services/return-adjustment.service'
import { shopUsesServiceFinanceRules } from '@/services/finance-rules.service'
import { MAX_ITEM_ROWS, salesOrderWhere } from '@/services/product-sales-series.service'
import { ORDER_SELECT, pnlOrderParts, type PnlOrder } from '@/services/pnl.service'
import { getShopVariableCosts } from '@/services/variable-cost.service'
import type { VariableCostSettings } from '@/lib/variable-cost'
import { getAdDetails, getAdSpend, getSpendBeforeHour, type DetailsSource, type HourlySource, type SpendSource } from '@/services/meta-ads-spend.service'
import { TZ_OFFSET_MS } from '@/lib/date-range'
import { buildProfitInsights, type ProfitInsight } from '@/lib/ads-profit-insights'
import { getAdRevenueReport, type AdRevenueRange, type AdRevenueReport } from '@/services/ad-revenue-report.service'
import type { ReturnAdjustment } from '@/lib/order-return'

export type ProfitMode = 'expected' | 'realized'

export type AdProfitRow = {
  adId: string
  adTitle: string | null
  adPhotoFileId: string | null
  campaignId: string | null
  campaignName: string | null
  adsetId: string | null
  adsetName: string | null
  spend: number | null
  /** ตัวประกอบกำไรตามโหมด */
  parts: Record<ProfitMode, ProfitParts>
  metrics: Record<ProfitMode, ProfitMetrics>
  status: Record<ProfitMode, ProfitStatus>
  /** ค่าส่งขาไปที่คำนวณได้ (ข้อมูลประกอบ — หักจริงเฉพาะร้านบริการ) */
  shippingInfo: number
  /** Meta (ช่วงปัจจุบัน) — null = Meta ไม่ส่ง/ไม่เชื่อม */
  impressions: number | null
  clicks: number | null
  chatsMeta: number | null
  /** P1 (FR-014) — reach/ความถี่ทั้งช่วง · สถานะ/วัตถุประสงค์ ณ ตอนนี้ (null = Meta ไม่ส่ง/ไม่เชื่อม) */
  reach: number | null
  frequency: number | null
  adStatus: string | null
  objective: string | null
  /** คุณภาพใบ (ชุด 00091 ตามวันที่สั่ง) */
  cancelled: number
  returned: number
  collected: number
}

export type AdsProfitReport = {
  base: Pick<AdRevenueReport, 'range' | 'prevRange' | 'spend' | 'truncated' | 'serviceRules' | 'hasAnyAdData' | 'insights' | 'coverage'>
  rows: AdProfitRow[]
  totals: { spend: number | null; parts: Record<ProfitMode, ProfitParts>; metrics: Record<ProfitMode, ProfitMetrics>; impressions: number | null; clicks: number | null; chatsMeta: number | null }
  /** ช่วงก่อนหน้าความยาวเท่ากัน (โหมดคาดการณ์เท่านั้น — เทียบบนการ์ด) */
  previous: { spend: number | null; orders: number; revenue: number; profitBefore: number }
  /**
   * P1 — วันนี้ (ยังไม่จบวัน) เทียบ "เมื่อวาน ณ เวลาเดียวกัน" · null = ไม่ใช่ช่วงวันนี้
   * ใบ = สร้างก่อนเวลาเดียวกันเมื่อวาน · ค่าโฆษณา = เมื่อวานรายชั่วโมงก่อนชั่วโมงปัจจุบัน (null = Meta ไม่มีข้อมูลรายชั่วโมง → ไม่เทียบค่าโฆษณา/กำไรหลัง)
   */
  sameTime: { spend: number | null; orders: number; revenue: number; profitBefore: number; cutoffHour: number } | null
  /** P1 — ช่วง 1 วัน: เฉลี่ยต่อวันของ 7 วันก่อนหน้า (โหมดคาดการณ์) · null = ช่วงยาวกว่า 1 วัน */
  avg7: { spend: number | null; orders: number; revenue: number; profitBefore: number } | null
  daily: { day: string; spend: number | null; orders: Record<ProfitMode, number>; revenue: Record<ProfitMode, number>; profitBefore: Record<ProfitMode, number> }[]
  /** P1 คำแนะนำรายวัน (FR-012) ต่อโหมด */
  insights: Record<ProfitMode, ProfitInsight[]>
}

const r2 = (n: number) => Math.round(n * 100) / 100
const DAY = 86_400_000
const emptyParts = (): ProfitParts => ({ orders: 0, revenue: 0, cogs: 0, variable: 0, incomplete: 0 })

/** select ร่วม: ตัวประกอบ P&L + วันที่ (ทุกร้าน — payments ใช้กับร้านบริการ no-show) */
const PROFIT_SELECT = {
  ...ORDER_SELECT,
  payments: { select: { kind: true, amount: true, voidedAt: true } },
  adId: true, createdAt: true, serviceClosedAt: true,
} as const
type ProfitOrder = PnlOrder & { adId: string | null; createdAt: Date; serviceClosedAt: Date | null }

/** ตัวประกอบกำไรของใบเดียว — ใช้ทั้งรายงานและรายละเอียดโฆษณา (ผลรวมต้องตรงกัน) */
export function orderParts(o: ProfitOrder, adj: ReturnAdjustment | undefined, serviceRules: boolean, vc: VariableCostSettings) {
  const p = pnlOrderParts(o, adj, serviceRules, vc)
  return {
    revenue: p.revenue,
    cogs: p.cogs,
    // ร้านที่ไม่ใช่บริการ: หน้ากำไรไม่หักค่าส่งขาไป (มติ 2026-10-02) — ตามเป๊ะ · + ต้นทุนต่อออเดอร์ที่ร้านตั้ง (00096 P2 ทุกร้าน)
    variable: (serviceRules ? p.shipping : 0) + p.variable,
    shipping: p.shipping,
    incomplete: p.missingCost || (serviceRules && (p.shippingPending || p.shippingMissing)),
  }
}

export async function getAdsProfitReport(
  shopId: string,
  vertical: string | null | undefined,
  range: AdRevenueRange,
  deps: { spendSource?: SpendSource; detailsSource?: DetailsSource; hourlySource?: HourlySource; now?: Date } = {},
): Promise<AdsProfitReport> {
  const { from, to } = range
  const chan = range.shopChannelId ? { shopChannelId: range.shopChannelId } : {}
  const span = to.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - span)
  const spendSource = deps.spendSource ?? getAdSpend
  const [base, serviceRules, vc] = await Promise.all([getAdRevenueReport(shopId, vertical, range, { spendSource }), shopUsesServiceFinanceRules(shopId), getShopVariableCosts(shopId)])

  const adWhere = { adId: { not: null }, ...chan }
  const detailsP = (deps.detailsSource ?? getAdDetails)(shopId, thaiDayKey(from), thaiDayKey(new Date(to.getTime() - 1))).catch(() => null)
  // P1 ตัวเทียบ — ช่วง 1 วันเท่านั้น (วันนี้ = เมื่อวาน ณ เวลาเดียวกัน · วันจบแล้ว = เฉลี่ย 7 วันก่อน)
  const now = deps.now ?? new Date()
  const oneDay = Math.round(span / DAY) === 1
  const isToday = oneDay && now >= from && now < to
  const sameTimeP = isToday ? sameTimeCompare(shopId, serviceRules, vc, adWhere, from, now, deps.hourlySource ?? getSpendBeforeHour) : Promise.resolve(null)
  const avg7P = oneDay ? avg7Compare(shopId, serviceRules, vc, adWhere, from, spendSource) : Promise.resolve(null)
  const [expectedOrders, realizedOrders, prevOrders, returnRows, returnAdj, spendRes] = await Promise.all([
    prisma.order.findMany({ where: { ...salesOrderWhere(shopId, serviceRules, { gte: from, lt: to }), ...adWhere }, select: PROFIT_SELECT, orderBy: { createdAt: 'desc' }, take: MAX_ITEM_ROWS + 1 }),
    prisma.order.findMany({ where: { shopId, ...revenueWindowWhere(vertical, { gte: from, lt: to }), ...adWhere }, select: PROFIT_SELECT, orderBy: { createdAt: 'desc' }, take: MAX_ITEM_ROWS + 1 }),
    prisma.order.findMany({ where: { ...salesOrderWhere(shopId, serviceRules, { gte: prevFrom, lt: from }), ...adWhere }, select: PROFIT_SELECT, orderBy: { createdAt: 'desc' }, take: MAX_ITEM_ROWS + 1 }),
    // ค่าส่งคืน — ชุดเดียวกับ 00091 (รับของคืนในช่วง · ผูกแอดของใบเดิม)
    prisma.orderReturn.findMany({
      where: { shopId, status: RETURN_STATUS.RECEIVED, receivedAt: { gte: from, lt: to }, order: { adId: { not: null }, ...chan } },
      select: { countAsCost: true, shippingCost: true, shipment: { select: { carrierPrice: true, estimatedPrice: true } }, order: { select: { adId: true } } },
    }),
    serviceRules ? getReturnAdjustments(shopId) : Promise.resolve(new Map<string, ReturnAdjustment>()),
    // ช่วงเดียวกับที่ base ขอ ⇒ โดนแคชเดียวกัน ไม่ยิง Meta เพิ่ม
    spendSource(shopId, thaiDayKey(prevFrom), thaiDayKey(new Date(to.getTime() - 1))).catch(() => null),
  ])
  const truncated = base.truncated || [expectedOrders, realizedOrders, prevOrders].some((l) => l.length > MAX_ITEM_ROWS)
  const cap = <T,>(l: T[]) => (l.length > MAX_ITEM_ROWS ? l.slice(0, MAX_ITEM_ROWS) : l)

  const slots = Math.max(1, Math.round(span / DAY))
  const dayKeys = Array.from({ length: slots }, (_, i) => thaiDayKey(new Date(from.getTime() + i * DAY)))
  const dayIdx = new Map(dayKeys.map((k, i) => [k, i]))
  const daily = dayKeys.map((day, i) => ({
    day, spend: base.daily[i]?.spend ?? null,
    orders: { expected: 0, realized: 0 }, revenue: { expected: 0, realized: 0 }, profitBefore: { expected: 0, realized: 0 },
  }))

  const parts = new Map<string, Record<ProfitMode, ProfitParts>>()
  const shippingInfo = new Map<string, number>()
  const getParts = (adId: string) => {
    let p = parts.get(adId)
    if (!p) parts.set(adId, (p = { expected: emptyParts(), realized: emptyParts() }))
    return p
  }
  const add = (mode: ProfitMode, list: ProfitOrder[]) => {
    for (const o of cap(list)) {
      const x = orderParts(o, returnAdj.get(o.id), serviceRules, vc)
      const p = getParts(o.adId!)[mode]
      p.orders += 1; p.revenue += x.revenue; p.cogs += x.cogs; p.variable += x.variable
      if (x.incomplete) p.incomplete += 1
      if (mode === 'expected') shippingInfo.set(o.adId!, (shippingInfo.get(o.adId!) ?? 0) + x.shipping)
      const i = dayIdx.get(thaiDayKey(serviceRules ? o.serviceClosedAt ?? o.createdAt : o.createdAt))
      if (i !== undefined) {
        const d = daily[i]
        d.orders[mode] += 1; d.revenue[mode] += x.revenue; d.profitBefore[mode] += x.revenue - x.cogs - x.variable
      }
    }
  }
  add('expected', expectedOrders as ProfitOrder[])
  add('realized', realizedOrders as ProfitOrder[])

  // ค่าส่งคืนหักทั้งสองโหมด (ตามแอดของใบเดิม) — เหมือน 00091
  const retByAd = new Map<string, Parameters<typeof sumReturnShippingCost>[0]>()
  for (const r of returnRows) {
    const l = retByAd.get(r.order.adId!) ?? []
    l.push({
      countAsCost: r.countAsCost,
      shippingCost: r.shippingCost != null ? Number(r.shippingCost) : null,
      carrierPrice: r.shipment?.carrierPrice != null ? Number(r.shipment.carrierPrice) : null,
      estimatedPrice: r.shipment?.estimatedPrice != null ? Number(r.shipment.estimatedPrice) : null,
    })
    retByAd.set(r.order.adId!, l)
  }
  for (const [adId, l] of retByAd) {
    const c = sumReturnShippingCost(l).total
    const p = getParts(adId)
    p.expected.variable += c
    p.realized.variable += c
  }

  // Meta: การแสดงผล/คลิก/แชทของช่วงปัจจุบัน (null ทั้งชุดเมื่อ Meta ไม่ OK)
  const metaOk = spendRes?.state === 'OK'
  const curKey = thaiDayKey(from)
  const meta = new Map<string, { impressions: number | null; clicks: number | null; chatsMeta: number | null }>()
  if (metaOk) {
    for (const r of spendRes!.rows) {
      if (r.day < curKey) continue
      const m = meta.get(r.adId) ?? { impressions: null, clicks: null, chatsMeta: null }
      const addN = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b)
      meta.set(r.adId, { impressions: addN(m.impressions, r.impressions), clicks: addN(m.clicks, r.clicks), chatsMeta: addN(m.chatsMeta, r.chatsMeta) })
    }
  }

  const details = await detailsP
  const det = details?.state === 'OK' ? details.ads : {}
  const round = (p: ProfitParts): ProfitParts => ({ ...p, revenue: r2(p.revenue), cogs: r2(p.cogs), variable: r2(p.variable) })
  const rows: AdProfitRow[] = base.ads
    .filter((a) => (a.spend ?? 0) > 0 || parts.has(a.adId))
    .map((a) => {
      const p = parts.get(a.adId) ?? { expected: emptyParts(), realized: emptyParts() }
      const pr = { expected: round(p.expected), realized: round(p.realized) }
      const metrics = { expected: profitMetrics(a.spend, pr.expected), realized: profitMetrics(a.spend, pr.realized) }
      const m = meta.get(a.adId)
      return {
        adId: a.adId, adTitle: a.adTitle, adPhotoFileId: a.adPhotoFileId,
        campaignId: a.campaignId, campaignName: a.campaignName, adsetId: a.adsetId, adsetName: a.adsetName,
        spend: a.spend, parts: pr, metrics,
        status: { expected: profitStatus(a.spend, pr.expected, metrics.expected), realized: profitStatus(a.spend, pr.realized, metrics.realized) },
        shippingInfo: r2(shippingInfo.get(a.adId) ?? 0),
        impressions: m?.impressions ?? null, clicks: m?.clicks ?? null, chatsMeta: m?.chatsMeta ?? null,
        reach: det[a.adId]?.reach ?? null, frequency: det[a.adId]?.frequency ?? null, adStatus: det[a.adId]?.status ?? null, objective: det[a.adId]?.objective ?? null,
        cancelled: a.status.CANCELLED, returned: a.status.RETURNED, collected: a.collected,
      }
    })

  const spendKnown = rows.some((r) => r.spend !== null)
  const totalSpend = spendKnown ? r2(rows.reduce((n, r) => n + (r.spend ?? 0), 0)) : null
  const sumMode = (mode: ProfitMode) => round(rows.reduce((s, r) => ({
    orders: s.orders + r.parts[mode].orders, revenue: s.revenue + r.parts[mode].revenue, cogs: s.cogs + r.parts[mode].cogs,
    variable: s.variable + r.parts[mode].variable, incomplete: s.incomplete + r.parts[mode].incomplete,
  }), emptyParts()))
  const tp = { expected: sumMode('expected'), realized: sumMode('realized') }
  const sumMeta = (k: 'impressions' | 'clicks' | 'chatsMeta') => (rows.some((r) => r[k] !== null) ? rows.reduce((n, r) => n + (r[k] ?? 0), 0) : null)

  // ช่วงก่อน (โหมดคาดการณ์) — ไม่หักค่าส่งคืนช่วงก่อน (การ์ดเทียบเฉพาะยอด/ใบ/กำไรก่อนค่าโฆษณาโดยประมาณ)
  const prevParts = emptyParts()
  for (const o of cap(prevOrders) as ProfitOrder[]) {
    const x = orderParts(o, returnAdj.get(o.id), serviceRules, vc)
    prevParts.orders += 1; prevParts.revenue += x.revenue; prevParts.cogs += x.cogs; prevParts.variable += x.variable
  }

  return {
    base: { range: base.range, prevRange: base.prevRange, spend: base.spend, truncated, serviceRules, hasAnyAdData: base.hasAnyAdData, insights: base.insights, coverage: base.coverage },
    rows: rows.sort((x, y) => (y.metrics.expected.profitAfter ?? y.metrics.expected.profitBefore) - (x.metrics.expected.profitAfter ?? x.metrics.expected.profitBefore)),
    totals: {
      spend: totalSpend, parts: tp,
      metrics: { expected: profitMetrics(totalSpend, tp.expected), realized: profitMetrics(totalSpend, tp.realized) },
      impressions: sumMeta('impressions'), clicks: sumMeta('clicks'), chatsMeta: sumMeta('chatsMeta'),
    },
    previous: { spend: base.previous.spend, orders: prevParts.orders, revenue: r2(prevParts.revenue), profitBefore: r2(prevParts.revenue - prevParts.cogs - prevParts.variable) },
    sameTime: await sameTimeP,
    avg7: await avg7P,
    insights: {
      expected: buildProfitInsights(rows.map((r) => ({ adId: r.adId, spend: r.spend, parts: r.parts.expected, metrics: r.metrics.expected, status: r.status.expected, cancelled: r.cancelled, returned: r.returned, objective: r.objective }))),
      realized: buildProfitInsights(rows.map((r) => ({ adId: r.adId, spend: r.spend, parts: r.parts.realized, metrics: r.metrics.realized, status: r.status.realized, cancelled: r.cancelled, returned: r.returned, objective: r.objective }))),
    },
    daily: daily.map((d) => ({ ...d, revenue: { expected: r2(d.revenue.expected), realized: r2(d.revenue.realized) }, profitBefore: { expected: r2(d.profitBefore.expected), realized: r2(d.profitBefore.realized) } })),
  }
}

/** คำสั่งซื้อของโฆษณาเดียว + ค่าโฆษณาจัดสรร (BRD FR-009/FR-010) — ชุดใบเดียวกับแถวในตารางตามโหมด */
/** รวมตัวประกอบของใบชุดยอดขาย (โหมดคาดการณ์) ในช่วง — ใช้กับตัวเทียบ P1 (ไม่หักค่าส่งคืน เหมือน previous) */
async function sumExpected(shopId: string, serviceRules: boolean, vc: VariableCostSettings, adWhere: object, gte: Date, lt: Date) {
  const [orders, returnAdj] = await Promise.all([
    prisma.order.findMany({ where: { ...salesOrderWhere(shopId, serviceRules, { gte, lt }), ...adWhere }, select: PROFIT_SELECT, take: MAX_ITEM_ROWS }),
    serviceRules ? getReturnAdjustments(shopId) : Promise.resolve(new Map<string, ReturnAdjustment>()),
  ])
  const p = emptyParts()
  for (const o of orders as ProfitOrder[]) {
    const x = orderParts(o, returnAdj.get(o.id), serviceRules, vc)
    p.orders += 1; p.revenue += x.revenue; p.cogs += x.cogs; p.variable += x.variable
  }
  return { orders: p.orders, revenue: p.revenue, profitBefore: p.revenue - p.cogs - p.variable }
}

/** เมื่อวาน ณ เวลาเดียวกัน — ใบสร้างก่อน now−24ชม. · ค่าโฆษณารายชั่วโมงก่อนชั่วโมงปัจจุบัน (เวลาไทย = เขตเวลาบัญชีของร้านไทย) */
async function sameTimeCompare(shopId: string, serviceRules: boolean, vc: VariableCostSettings, adWhere: object, from: Date, now: Date, hourly: HourlySource) {
  const yFrom = new Date(from.getTime() - DAY)
  const cutoffHour = new Date(now.getTime() + TZ_OFFSET_MS).getUTCHours()
  // shortcut: ใบตัดที่นาทีปัจจุบัน แต่ค่าโฆษณาตัดที่ต้นชั่วโมง (Meta ให้ละเอียดแค่ชั่วโมง) — ต่างกัน ≤ 1 ชม. บอกใน tooltip
  const [p, h] = await Promise.all([
    sumExpected(shopId, serviceRules, vc, adWhere, yFrom, new Date(now.getTime() - DAY)),
    hourly(shopId, thaiDayKey(yFrom), cutoffHour).catch(() => null),
  ])
  return { spend: h?.state === 'OK' ? h.spend : null, orders: p.orders, revenue: r2(p.revenue), profitBefore: r2(p.profitBefore), cutoffHour }
}

/** เฉลี่ยต่อวันของ 7 วันก่อน `from` — ค่าโฆษณาจากแหล่งเดียวกับรายงาน (ไม่ OK = null) */
async function avg7Compare(shopId: string, serviceRules: boolean, vc: VariableCostSettings, adWhere: object, from: Date, spendSource: SpendSource) {
  const f7 = new Date(from.getTime() - 7 * DAY)
  const [p, sp] = await Promise.all([
    sumExpected(shopId, serviceRules, vc, adWhere, f7, from),
    spendSource(shopId, thaiDayKey(f7), thaiDayKey(new Date(from.getTime() - DAY))).catch(() => null),
  ])
  const spend = sp?.state === 'OK' ? sp.rows.reduce((n, r) => n + r.spend, 0) / 7 : null
  return { spend: spend === null ? null : r2(spend), orders: r2(p.orders / 7), revenue: r2(p.revenue / 7), profitBefore: r2(p.profitBefore / 7) }
}

export async function getAdProfitOrders(
  shopId: string,
  vertical: string | null | undefined,
  range: AdRevenueRange & { adId: string; mode: ProfitMode },
) {
  const { from, to } = range
  const [serviceRules, vc] = await Promise.all([shopUsesServiceFinanceRules(shopId), getShopVariableCosts(shopId)])
  const chan = range.shopChannelId ? { shopChannelId: range.shopChannelId } : {}
  const where = range.mode === 'expected'
    ? { ...salesOrderWhere(shopId, serviceRules, { gte: from, lt: to }), adId: range.adId, ...chan }
    : { shopId, ...revenueWindowWhere(vertical, { gte: from, lt: to }), adId: range.adId, ...chan }
  const [orders, returnAdj] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        ...PROFIT_SELECT, status: true, publicToken: true, orderNo: true, paymentConfirmedAt: true, codReceivedAt: true,
        buyerName: true,
        items: { select: { cost: true, qty: true, name: true, price: true, productId: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ITEM_ROWS,
    }),
    serviceRules ? getReturnAdjustments(shopId) : Promise.resolve(new Map<string, ReturnAdjustment>()),
  ])
  return orders.map((o) => ({ order: o, parts: orderParts(o as unknown as ProfitOrder, returnAdj.get(o.id), serviceRules, vc) }))
}
