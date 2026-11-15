/**
 * ad-summary/insights — กฎคำแนะนำ R1–R8 (BRD §6) · pure · คืนคีย์ + พารามิเตอร์ ไม่มีประโยคใน lib (UI แปลผ่าน i18n)
 */
import { gapBadge } from '@/lib/ad-quality-formulas'
import { HIGH_CTR_X, LOW_CLOSE_X, MIN_CHATS, MIN_SPEND, isThin } from './classify'
import { pctChange, roasOfRow } from './formulas'
import type { AdRow, CampaignRow, Insight, InsightConfidence, KpiSet } from './types'

/** เกณฑ์ทั้งหมดอยู่ที่นี่ที่เดียว */
export const R1 = { costRisePct: 20, minOrders: 5, causeCpcRisePct: 15, causeCloseDropPct: 15, causeCtrDropPct: 15 }
export const R2 = { spendRisePct: 20, orderGrowthRatio: 0.5 }
export const R3 = { ctrDropPct: 20, minImpressions: 5000 }
export const R4 = { closeDropPct: 25, minChats: MIN_CHATS }
export const R5 = { minSpendShare: 30, maxOrderShareRatio: 0.5 }
export const R6 = { roasX: 1.5, minOrders: 5, minSpend: MIN_SPEND }
export const R8 = { ctrX: HIGH_CTR_X, closeX: LOW_CLOSE_X, minChats: MIN_CHATS }
export const MAX_INSIGHTS = 5
/** ความมั่นใจสูง = ตัวอย่าง ≥ 2 เท่าของเกณฑ์ */
export const CONFIDENCE_SAMPLE_X = 2

export type InsightInput = {
  kpi: KpiSet
  campaigns: CampaignRow[]
  ads: AdRow[]
  chatGap: { meta: number | null; shop: number }
  truncated: boolean
  metaOk: boolean
  hourly: boolean
  includesRecent: boolean
}

export function buildInsights(input: InsightInput): Insight[] {
  const { kpi, campaigns, ads, chatGap, truncated, metaOk, hourly, includesRecent } = input
  if (truncated) return []
  const out: Insight[] = []
  // สูงเมื่อตัวอย่างพอ 2 เท่าและช่วงไม่รวมวันล่าสุด · ไม่งั้นกลาง (R1/R4 ก็ไม่เกินกลางเมื่อรวมวันล่าสุดด้วยกฎเดียวกัน)
  const conf = (big: boolean): InsightConfidence => (big && !includesRecent ? 'HIGH' : 'MEDIUM')
  const spendNow = kpi.spend.cur ?? 0
  const bothGe = (p: { cur: number | null; prev: number | null }, n: number) => (p.cur ?? -1) >= n && (p.prev ?? -1) >= n

  if (!hourly) {
    // R1 ต้นทุนต่อออเดอร์ขึ้น
    if (metaOk) {
      const cpa = pctChange(kpi.cpa.cur, kpi.cpa.prev)
      if (cpa !== null && cpa >= R1.costRisePct && bothGe(kpi.orders, R1.minOrders)) {
        const causes: { key: 'cpc' | 'closeRate' | 'ctr'; mag: number; pct: number }[] = []
        const cpc = pctChange(kpi.cpc.cur, kpi.cpc.prev)
        const close = pctChange(kpi.closeRate.cur, kpi.closeRate.prev)
        const ctr = pctChange(kpi.ctr.cur, kpi.ctr.prev)
        if (cpc !== null && cpc >= R1.causeCpcRisePct) causes.push({ key: 'cpc', mag: cpc, pct: cpc })
        if (close !== null && close <= -R1.causeCloseDropPct) causes.push({ key: 'closeRate', mag: -close, pct: close })
        if (ctr !== null && ctr <= -R1.causeCtrDropPct) causes.push({ key: 'ctr', mag: -ctr, pct: ctr })
        causes.sort((a, b) => b.mag - a.mag)
        const top = causes[0]
        const ev: Insight['evidence'] = [{ key: 'cpa', value: kpi.cpa.cur, prev: kpi.cpa.prev, unit: 'baht' }]
        if (top) ev.push({ key: top.key, value: kpi[top.key].cur, prev: kpi[top.key].prev, unit: top.key === 'cpc' ? 'baht' : 'pct' })
        out.push({
          rule: 'R1', priority: 'HIGH',
          confidence: bothGe(kpi.orders, R1.minOrders * CONFIDENCE_SAMPLE_X) && !includesRecent ? 'HIGH' : 'MEDIUM',
          params: top ? { pct: cpa, cause: top.key, causePct: top.pct } : { pct: cpa },
          evidence: ev, spendAtStake: spendNow,
        })
      }
    }
    // R2 ใช้เงินโตเร็วกว่าผล
    if (metaOk) {
      const sp = pctChange(kpi.spend.cur, kpi.spend.prev)
      const od = pctChange(kpi.orders.cur, kpi.orders.prev)
      if (sp !== null && od !== null && sp >= R2.spendRisePct && od < R2.orderGrowthRatio * sp && (kpi.spend.prev ?? 0) >= MIN_SPEND) {
        out.push({
          rule: 'R2', priority: 'HIGH',
          confidence: (kpi.spend.prev ?? 0) >= MIN_SPEND * CONFIDENCE_SAMPLE_X && !includesRecent ? 'HIGH' : 'MEDIUM',
          params: { spendPct: sp, ordersPct: od },
          evidence: [
            { key: 'spend', value: kpi.spend.cur, prev: kpi.spend.prev, unit: 'baht' },
            { key: 'orders', value: kpi.orders.cur, prev: kpi.orders.prev, unit: 'num' },
          ],
          spendAtStake: spendNow,
        })
      }
    }
    // R3 CTR ลด
    if (metaOk) {
      const ctr = pctChange(kpi.ctr.cur, kpi.ctr.prev)
      if (ctr !== null && ctr <= -R3.ctrDropPct && bothGe(kpi.impressions, R3.minImpressions)) {
        out.push({
          rule: 'R3', priority: 'MEDIUM',
          confidence: conf(bothGe(kpi.impressions, R3.minImpressions * CONFIDENCE_SAMPLE_X)),
          params: { from: kpi.ctr.prev ?? 0, to: kpi.ctr.cur ?? 0 },
          evidence: [
            { key: 'ctr', value: kpi.ctr.cur, prev: kpi.ctr.prev, unit: 'pct' },
            { key: 'impressions', value: kpi.impressions.cur, prev: kpi.impressions.prev, unit: 'num' },
          ],
          spendAtStake: spendNow,
        })
      }
    }
    // R4 แชทเยอะ ปิดการขายน้อย (ใช้ตัวเลขร้านล้วน จึงไม่พึ่ง Meta)
    const close = pctChange(kpi.closeRate.cur, kpi.closeRate.prev)
    if (close !== null && close <= -R4.closeDropPct && bothGe(kpi.chats, R4.minChats)) {
      out.push({
        rule: 'R4', priority: 'HIGH',
        confidence: bothGe(kpi.chats, R4.minChats * CONFIDENCE_SAMPLE_X) && !includesRecent ? 'HIGH' : 'MEDIUM',
        params: { to: kpi.closeRate.cur ?? 0, from: kpi.closeRate.prev ?? 0 },
        evidence: [
          { key: 'closeRate', value: kpi.closeRate.cur, prev: kpi.closeRate.prev, unit: 'pct' },
          { key: 'chats', value: kpi.chats.cur, prev: kpi.chats.prev, unit: 'num' },
        ],
        spendAtStake: spendNow,
      })
    }
  }

  if (metaOk) {
    // R5 แคมเปญกินงบ
    // ตัวหาร = ตัวเลขหลัก (รวม unknownCampaign) ไม่ใช่ Σ แคมเปญ — ไม่งั้นส่วนแบ่งพอง
    const totSpend = kpi.spend.cur ?? 0
    const totOrders = kpi.orders.cur ?? 0
    if (totSpend > 0) {
      for (const c of campaigns) {
        if (c.spend === null || isThin(c) || c.tag === 'thin') continue
        const spendShare = (c.spend / totSpend) * 100
        const orderShare = totOrders > 0 ? (c.orders / totOrders) * 100 : 0
        if (spendShare >= R5.minSpendShare && orderShare <= R5.maxOrderShareRatio * spendShare) {
          out.push({
            rule: 'R5', priority: 'HIGH',
            confidence: c.spend >= MIN_SPEND * CONFIDENCE_SAMPLE_X && c.chats >= MIN_CHATS * CONFIDENCE_SAMPLE_X && !includesRecent ? 'HIGH' : 'MEDIUM',
            params: { name: c.name ?? c.campaignId, spendShare: Math.round(spendShare), orderShare: Math.round(orderShare) },
            evidence: [
              { key: 'spendShare', value: Math.round(spendShare), unit: 'pct' },
              { key: 'orderShare', value: Math.round(orderShare), unit: 'pct' },
              { key: 'spend', value: c.spend, unit: 'baht' },
            ],
            campaignId: c.campaignId, spendAtStake: c.spend,
          })
        }
      }
    }
    // R6 โฆษณาน่าทดลองเพิ่มงบ
    const baseRoas = kpi.roas.cur
    if (baseRoas !== null && baseRoas > 0) {
      for (const a of ads) {
        if (a.status !== 'ACTIVE' || a.spend === null) continue
        if (a.chats > 0 && (a.orders / a.chats) * 100 > 100) continue
        if (a.orders < R6.minOrders || a.spend < R6.minSpend) continue
        const r = roasOfRow(a)
        if (r === null || r < R6.roasX * baseRoas) continue
        out.push({
          rule: 'R6', priority: 'MEDIUM',
          confidence: a.orders >= R6.minOrders * CONFIDENCE_SAMPLE_X && a.spend >= R6.minSpend * CONFIDENCE_SAMPLE_X && !includesRecent ? 'HIGH' : 'MEDIUM',
          params: { name: a.name ?? a.adId, times: Math.round((r / baseRoas) * 10) / 10, roas: r, avgRoas: baseRoas },
          evidence: [
            { key: 'roas', value: r, unit: 'x' },
            { key: 'avgRoas', value: baseRoas, unit: 'x' },
            { key: 'orders', value: a.orders, unit: 'num' },
          ],
          adId: a.adId, campaignId: a.campaignId ?? undefined, spendAtStake: a.spend,
        })
      }
    }
    // R7 แชทหายระหว่างทาง
    if (gapBadge(chatGap.meta, chatGap.shop) === 'HIGH') {
      out.push({
        rule: 'R7', priority: 'MEDIUM',
        confidence: (chatGap.meta ?? 0) >= MIN_CHATS * CONFIDENCE_SAMPLE_X && !includesRecent ? 'HIGH' : 'MEDIUM',
        params: { meta: chatGap.meta ?? 0, shop: chatGap.shop },
        evidence: [
          { key: 'chatsMeta', value: chatGap.meta, unit: 'num' },
          { key: 'chats', value: chatGap.shop, unit: 'num' },
        ],
        spendAtStake: spendNow,
      })
    }
    // R8 CTR สูง ปิดการขายต่ำ
    const ctrAll = kpi.ctr.cur
    const closeAll = kpi.closeRate.cur
    if (ctrAll !== null && closeAll !== null) {
      for (const a of ads) {
        if (a.impressions === null || a.impressions <= 0 || a.clicks === null || a.chats < R8.minChats) continue
        const ctr = (a.clicks / a.impressions) * 100
        const close = (a.orders / a.chats) * 100
        if (ctr >= R8.ctrX * ctrAll && close <= R8.closeX * closeAll) {
          out.push({
            rule: 'R8', priority: 'MEDIUM',
            confidence: a.chats >= R8.minChats * CONFIDENCE_SAMPLE_X && !includesRecent ? 'HIGH' : 'MEDIUM',
            params: { name: a.name ?? a.adId, ctr, avgCtr: ctrAll, closeRate: close, avgCloseRate: closeAll },
            evidence: [
              { key: 'ctr', value: ctr, unit: 'pct' },
              { key: 'closeRate', value: close, unit: 'pct' },
              { key: 'chats', value: a.chats, unit: 'num' },
            ],
            adId: a.adId, campaignId: a.campaignId ?? undefined, spendAtStake: a.spend ?? 0,
          })
        }
      }
    }
  }

  const rank = (p: Insight['priority']) => (p === 'HIGH' ? 0 : 1)
  return out.sort((a, b) => rank(a.priority) - rank(b.priority) || b.spendAtStake - a.spendAtStake).slice(0, MAX_INSIGHTS)
}
