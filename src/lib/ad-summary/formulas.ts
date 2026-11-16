/**
 * ad-summary/formulas — สูตรหน้า "สรุปโฆษณา" (00094) · pure ไม่มี DB/React
 * 🛑 HR16: สูตรเดิมเรียกจาก ad-quality-formulas / ad-report-view ห้ามเขียนใหม่ — ไฟล์นี้เพิ่มเฉพาะ F-06, F-10, F-12..F-16
 */
import { ratio, ratePct, unitCost, frequency } from '@/lib/ad-quality-formulas'
import { roas, costPerOrder } from '@/lib/ad-report-view'
import type { KpiSet, MetricPair, Profit, Tone, Trend } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

/** F-10 % เปลี่ยน — ช่วงก่อน ≤0 หรือ null (หรือช่วงนี้ null) = ไม่มีฐานเทียบ → null */
export function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev <= 0) return null
  return round2(((cur - prev) / prev) * 100)
}

/** BR-AIR-02 ทิศทางที่ดี — ค่าโฆษณาขึ้น = เขียว (มติ user 2026-11-15) */
export const TONE: Record<keyof KpiSet, Tone> = {
  spend: 'signed', sales: 'signed', roas: 'signed', orders: 'signed', closeRate: 'signed',
  aov: 'signed', chatsMeta: 'signed', ctr: 'signed', chats: 'signed', impressions: 'signed', reach: 'signed',
  cpa: 'inverse', cpc: 'inverse', cpm: 'inverse', costPerChatMeta: 'inverse',
  // ความถี่สูง = คนเดิมเห็นซ้ำจนเบื่อได้ — ไม่ตัดสินดี/แย่
  frequency: 'neutral',
}

/** ไม่มีฐานเทียบ → null · ไม่เปลี่ยนเลย = กลาง (ไม่ใช่ดี/แย่) */
export function trendOf(pair: MetricPair, tone: Tone): Trend {
  const pct = pctChange(pair.cur, pair.prev)
  if (pct === null) return null
  if (tone === 'neutral' || pct === 0) return 'neutral'
  const up = pct > 0
  return (tone === 'signed' ? up : !up) ? 'good' : 'bad'
}

/** HR16: ROAS/ต้นทุนต่อออเดอร์ทุกระดับ (แถว/ชุด/แคมเปญ/ครีเอทีฟ/CSV) ใช้ตัวนี้ตัวเดียว = ตัวตั้ง/ตัวหารเฉพาะโฆษณาที่ spend > 0 เหมือน KPI */
type Covered = { spend: number | null; coveredSales: number; coveredOrders: number }
export const coveredOf = (spend: number | null, sales: number, orders: number) =>
  spend !== null && spend > 0 ? { coveredSales: sales, coveredOrders: orders } : { coveredSales: 0, coveredOrders: 0 }
export const roasOfRow = (r: Covered): number | null => (r.spend === null ? null : roas(r.coveredSales, r.spend))
export const cpaOfRow = (r: Covered): number | null => costPerOrder(r.spend, r.coveredOrders)

/** F-06 CPM = ค่าโฆษณา ÷ การแสดงผล × 1,000 */
export const cpm = (spend: number | null, impressions: number | null) => ratio(spend, impressions, 1000)

export type Totals = {
  spend: number | null
  /** ยอดขายเฉพาะโฆษณาที่มีค่าโฆษณา > 0 (ตัวตั้ง ROAS) */
  coveredSales: number
  /** ออเดอร์ของโฆษณาชุดเดียวกัน (ตัวหาร CPA) */
  coveredOrders: number
  sales: number
  orders: number
  chats: number
  impressions: number | null
  clicks: number | null
  reach: number | null
  chatsMeta: number | null
}

function metrics(t: Totals) {
  return {
    spend: t.spend,
    sales: t.sales,
    roas: t.spend === null ? null : roas(t.coveredSales, t.spend),
    cpa: costPerOrder(t.spend, t.coveredOrders),
    orders: t.orders,
    closeRate: ratePct(t.orders, t.chats),
    aov: ratio(t.sales, t.orders, 1),
    impressions: t.impressions,
    reach: t.reach,
    frequency: frequency(t.impressions, t.reach),
    chatsMeta: t.chatsMeta,
    ctr: ratePct(t.clicks, t.impressions),
    cpc: unitCost(t.spend, t.clicks),
    cpm: cpm(t.spend, t.impressions),
    costPerChatMeta: unitCost(t.spend, t.chatsMeta),
    chats: t.chats,
  } satisfies Record<keyof KpiSet, number | null>
}

export function buildKpi(input: { cur: Totals; prev: Totals }): KpiSet {
  const cur = metrics(input.cur)
  const prev = metrics(input.prev)
  const out = {} as KpiSet
  for (const k of Object.keys(cur) as (keyof KpiSet)[]) out[k] = { cur: cur[k], prev: prev[k] }
  return out
}

/** F-12..F-16 — ต้นทุนไม่ครบ/ใบเกินเพดาน = ข้อมูลไม่เพียงพอ → null (ห้ามเดาเป็น 0) */
export function buildProfit(input: {
  coveredSales: number
  cogs: number | null
  spend: number | null
  missingCostLines: number
  truncated: boolean
  byCampaign: { campaignId: string; name: string | null; sales: number; cogs: number | null; spend: number | null }[]
}): Profit {
  const { coveredSales, cogs, spend, missingCostLines, truncated } = input
  const insufficient = missingCostLines > 0 || truncated || cogs === null
  const grossProfit = insufficient ? null : round2(coveredSales - (cogs as number))
  const profitAfterAds = grossProfit === null || spend === null ? null : round2(grossProfit - spend)
  const grossMargin = grossProfit === null || coveredSales <= 0 ? null : Math.round((grossProfit / coveredSales) * 10000) / 10000
  const breakEvenRoas = grossMargin === null || grossMargin <= 0 ? null : round2(1 / grossMargin)
  return {
    coveredSales,
    cogs,
    spend,
    grossProfit,
    profitAfterAds,
    grossMargin,
    breakEvenRoas,
    missingCostLines,
    byCampaign: input.byCampaign.map((c) => ({
      campaignId: c.campaignId,
      name: c.name,
      profitAfterAds: c.cogs === null || c.spend === null ? null : round2(c.sales - c.cogs - c.spend),
    })),
  }
}
