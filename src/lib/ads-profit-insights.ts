/**
 * ads-profit-insights — คำแนะนำรายวันแบบกฎตายตัว (00096 P1 BRD FR-012 · PRD §3.6)
 * ทุกข้อ = ข้อสังเกต + ตัวเลขอ้างอิง + ฐานเทียบ + ความสำคัญ + ความมั่นใจของข้อมูล — ข้อความ (สาเหตุ/สิ่งที่ลองได้) อยู่ที่ i18n ตาม kind
 * 🛑 ไม่ใช้ AI สร้างตัวเลข · ไม่สั่งหยุด/เพิ่มงบเอง · โฆษณาวัตถุประสงค์การรับรู้ (awareness/reach) ไม่ถูกตัดสินด้วยกำไร
 * 🛑 ต้นทุนไม่ครบ (INCOMPLETE) ไม่ถูกตัดสินเรื่องกำไร (กันสรุปผิดจากต้นทุน 0)
 */
import type { ProfitMetrics, ProfitParts, ProfitStatus } from './ads-profit'

export type InsightRow = {
  adId: string
  spend: number | null
  parts: ProfitParts
  metrics: ProfitMetrics
  status: ProfitStatus
  cancelled: number
  returned: number
  objective: string | null
}

export type ProfitInsightKind = 'LOSS' | 'HIGH_CPO' | 'ROAS_BUT_LOSS' | 'STEADY_PROFIT' | 'HIGH_LOST'
export type ProfitInsight = {
  kind: ProfitInsightKind
  adId: string
  priority: 1 | 2 | 3
  /** ค่าของโฆษณานี้ */
  value: number
  /** ฐานเทียบ (ค่าเฉลี่ยร้าน / เกณฑ์) */
  baseline: number
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

export const PROFIT_INSIGHT_RULES = { minSpend: 300, minOrders: 5, highCpoFactor: 1.5, roasGood: 2, steadyMargin: 15, highLostFactor: 1.5 } as const
// 🛑 OUTCOME_ENGAGEMENT ไม่อยู่ในชุดนี้ — โฆษณาให้ทักแชท (messages) ของร้านส่วนใหญ่ใช้วัตถุประสงค์นี้ ต้องถูกตัดสินด้วยกำไร
const AWARENESS = new Set(['OUTCOME_AWARENESS', 'BRAND_AWARENESS', 'REACH', 'VIDEO_VIEWS'])

const confidenceOf = (orders: number): ProfitInsight['confidence'] => (orders >= 10 ? 'HIGH' : orders >= PROFIT_INSIGHT_RULES.minOrders ? 'MEDIUM' : 'LOW')
const r1 = (n: number) => Math.round(n * 10) / 10

/** เรียงความสำคัญ 1 → 3 แล้วตามขนาดเงินที่เกี่ยว · ตัดที่ `limit` ข้อ */
export function buildProfitInsights(rows: InsightRow[], limit = 5): ProfitInsight[] {
  const out: (ProfitInsight & { weight: number })[] = []
  const judged = rows.filter((r) => !AWARENESS.has(r.objective ?? '') && r.status !== 'INCOMPLETE')
  const withOrders = judged.filter((r) => r.spend !== null && r.parts.orders > 0)
  const spendSum = withOrders.reduce((n, r) => n + (r.spend ?? 0), 0)
  const ordersSum = withOrders.reduce((n, r) => n + r.parts.orders, 0)
  const avgCpo = ordersSum > 0 ? spendSum / ordersSum : null
  const placed = judged.reduce((n, r) => n + r.parts.orders + r.cancelled, 0)
  const lostAll = judged.reduce((n, r) => n + r.cancelled + r.returned, 0)
  const avgLost = placed > 0 ? (lostAll / placed) * 100 : null

  for (const r of judged) {
    const m = r.metrics
    const spend = r.spend ?? 0
    const conf = confidenceOf(r.parts.orders)
    if (r.spend !== null && m.profitAfter !== null && m.profitAfter < 0 && spend >= PROFIT_INSIGHT_RULES.minSpend) {
      // ROAS ดีแต่ขาดทุน = ปัญหาต้นทุน/ราคา ไม่ใช่ตัวโฆษณา — แยกข้อให้ชัด
      if (m.roas !== null && m.roas >= PROFIT_INSIGHT_RULES.roasGood) out.push({ kind: 'ROAS_BUT_LOSS', adId: r.adId, priority: 1, value: m.roas, baseline: PROFIT_INSIGHT_RULES.roasGood, confidence: conf, weight: -m.profitAfter })
      else out.push({ kind: 'LOSS', adId: r.adId, priority: 1, value: Math.round(m.profitAfter), baseline: 0, confidence: r.parts.orders === 0 ? 'HIGH' : conf, weight: -m.profitAfter })
      continue
    }
    if (avgCpo !== null && m.costPerOrder !== null && r.parts.orders >= PROFIT_INSIGHT_RULES.minOrders && m.costPerOrder >= avgCpo * PROFIT_INSIGHT_RULES.highCpoFactor) {
      out.push({ kind: 'HIGH_CPO', adId: r.adId, priority: 2, value: Math.round(m.costPerOrder), baseline: Math.round(avgCpo), confidence: conf, weight: spend })
    }
    const lostBase = r.parts.orders + r.cancelled
    const lostRate = lostBase > 0 ? ((r.cancelled + r.returned) / lostBase) * 100 : null
    if (avgLost !== null && avgLost > 0 && lostRate !== null && lostBase >= PROFIT_INSIGHT_RULES.minOrders && lostRate >= avgLost * PROFIT_INSIGHT_RULES.highLostFactor) {
      out.push({ kind: 'HIGH_LOST', adId: r.adId, priority: 2, value: r1(lostRate), baseline: r1(avgLost), confidence: conf, weight: r.cancelled + r.returned })
    }
    if (m.profitAfter !== null && m.profitAfter > 0 && m.margin !== null && m.margin >= PROFIT_INSIGHT_RULES.steadyMargin && r.parts.orders >= PROFIT_INSIGHT_RULES.minOrders) {
      out.push({ kind: 'STEADY_PROFIT', adId: r.adId, priority: 3, value: m.margin, baseline: PROFIT_INSIGHT_RULES.steadyMargin, confidence: conf, weight: m.profitAfter })
    }
  }
  return out.sort((a, b) => a.priority - b.priority || b.weight - a.weight).slice(0, limit).map(({ weight: _w, ...i }) => i) // eslint-disable-line @typescript-eslint/no-unused-vars
}
