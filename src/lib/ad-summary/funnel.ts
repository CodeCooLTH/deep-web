/**
 * ad-summary/funnel — กรวย แสดงผล → คลิก → แชท(Meta) → แชทเข้าร้าน → ออเดอร์ (00094 F-17)
 */
import { ratePct } from '@/lib/ad-quality-formulas'
import { pctChange } from './formulas'
import type { Funnel, FunnelRate, FunnelStep, KpiSet, MetricPair } from './types'

/** ขั้นที่แย่ลงสัมพัทธ์ถึงเกณฑ์นี้จึงถูกชี้ · ตัวหารต้องมีตัวอย่างพอทั้งสองช่วง */
export const FUNNEL_WORST_DROP_PCT = -15
export const FUNNEL_MIN_DENOMINATOR = 20

export function buildFunnel(kpi: KpiSet, clicks: MetricPair): Funnel {
  const steps: FunnelStep[] = [
    { key: 'impressions', source: 'META', ...kpi.impressions },
    { key: 'clicks', source: 'META', ...clicks },
    { key: 'chatsMeta', source: 'META', ...kpi.chatsMeta },
    { key: 'chats', source: 'SHOP', ...kpi.chats },
    { key: 'orders', source: 'SHOP', ...kpi.orders },
  ]
  // ขั้นไหนไม่มีค่า → อัตราขั้นนั้นเป็น null (ห้ามข้ามไปเทียบขั้นถัดไป)
  const rates: FunnelRate[] = []
  for (let i = 0; i < steps.length - 1; i++) {
    rates.push({
      cur: ratePct(steps[i + 1].cur, steps[i].cur),
      prev: ratePct(steps[i + 1].prev, steps[i].prev),
      crossSource: i === 2,
    })
  }
  let worst: number | null = null
  let worstDrop = 0
  rates.forEach((r, i) => {
    const den = steps[i]
    if ((den.cur ?? 0) < FUNNEL_MIN_DENOMINATOR || (den.prev ?? 0) < FUNNEL_MIN_DENOMINATOR) return
    const change = pctChange(r.cur, r.prev)
    if (change === null || change > FUNNEL_WORST_DROP_PCT) return
    if (worst === null || change < worstDrop) { worst = i; worstDrop = change }
  })
  return { steps, rates, worst }
}
