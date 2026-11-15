/**
 * ad-summary/classify — ป้ายจัดกลุ่มแคมเปญ (BR-AIR-08) + ป้ายครีเอทีฟ (BR-AIR-10) · pure
 */
import { sumKnown } from '@/lib/ad-quality-formulas'
import { cpaOfRow, roasOfRow } from './formulas'
import type { AdRow, RollUp, TagReason } from './types'

/** BR-AIR-04 (มติ Q3) — ต่ำกว่านี้ = ข้อมูลน้อย */
export const MIN_SPEND = 500
export const MIN_CHATS = 20

const CLOSE_OBJECTIVES = new Set(['OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'MESSAGES', 'CONVERSIONS', 'LEAD_GENERATION'])
export type ObjectiveGroup = 'close' | 'other'
export const objectiveGroup = (objective: string | null): ObjectiveGroup => (objective !== null && CLOSE_OBJECTIVES.has(objective) ? 'close' : 'other')

export const isThin = (r: { spend: number | null; chats: number }) => r.spend === null || r.spend < MIN_SPEND || r.chats < MIN_CHATS

export const GOOD_ROAS_X = 1.2
export const GOOD_CPO_X = 0.85
export const WATCH_ROAS_X = 0.6
export const WATCH_CPO_X = 1.5
export const WATCH_NO_ORDER_SPEND_X = 3

const f1 = (n: number) => (Math.round(n * 10) / 10).toString()
const f0 = (n: number) => Math.round(n).toLocaleString('en-US')

type Stat = { roas: number | null; cpo: number | null }
const statOf = (r: RollUp): Stat => ({
  roas: roasOfRow(r),
  cpo: cpaOfRow(r),
})

export function classify<T extends RollUp>(rows: T[], groupOf: (r: T) => ObjectiveGroup): TagReason[] {
  const out: TagReason[] = rows.map(() => ({ tag: null, reason: 'วัตถุประสงค์นี้ไม่นำมาเทียบกับกลุ่มปิดการขาย' }))
  const base: Partial<Record<ObjectiveGroup, Stat>> = {}
  for (const g of ['close', 'other'] as const) {
    const ok = rows.filter((r) => groupOf(r) === g && !isThin(r))
    // ค่ากลาง = Σ/Σ ของแถวที่ไม่ข้อมูลน้อย · ต่ำกว่า 2 แถว = ไม่มีค่ากลาง
    if (g === 'close' && ok.length >= 2) {
      const spend = sumKnown(ok.map((r) => r.spend)) ?? 0
      const sales = ok.reduce((s, r) => s + r.coveredSales, 0)
      const orders = ok.reduce((s, r) => s + r.coveredOrders, 0)
      base[g] = { roas: spend > 0 ? sales / spend : null, cpo: orders > 0 ? spend / orders : null }
    }
  }
  rows.forEach((r, i) => {
    if (groupOf(r) !== 'close') return
    if (isThin(r)) { out[i] = { tag: 'thin', reason: `ข้อมูลน้อย (ค่าโฆษณาต่ำกว่า ฿${MIN_SPEND} หรือแชทต่ำกว่า ${MIN_CHATS})` }; return }
    const b = base.close
    if (!b) { out[i] = { tag: null, reason: 'กลุ่มเดียวกันมีข้อมูลไม่พอสำหรับเทียบ' }; return }
    const s = statOf(r)
    const spend = r.spend as number
    if (s.roas !== null && b.roas !== null && b.roas > 0 && s.cpo !== null && b.cpo !== null && s.roas >= GOOD_ROAS_X * b.roas && s.cpo <= GOOD_CPO_X * b.cpo) {
      out[i] = { tag: 'good', reason: `ROAS ${f1(s.roas)} สูงกว่าแคมเปญกลุ่มเดียวกันเฉลี่ย ${f1(b.roas)}` }
      return
    }
    if (r.orders === 0 && b.cpo !== null && spend >= WATCH_NO_ORDER_SPEND_X * b.cpo) {
      out[i] = { tag: 'watch', reason: `ไม่มีออเดอร์ ทั้งที่ใช้ ฿${f0(spend)} (ต้นทุนต่อออเดอร์เฉลี่ยกลุ่ม ฿${f0(b.cpo)})` }
      return
    }
    if (s.roas !== null && b.roas !== null && b.roas > 0 && s.roas <= WATCH_ROAS_X * b.roas) {
      out[i] = { tag: 'watch', reason: `ROAS ${f1(s.roas)} ต่ำกว่าแคมเปญกลุ่มเดียวกันเฉลี่ย ${f1(b.roas)}` }
      return
    }
    if (s.cpo !== null && b.cpo !== null && s.cpo >= WATCH_CPO_X * b.cpo) {
      out[i] = { tag: 'watch', reason: `ต้นทุนต่อออเดอร์ ฿${f0(s.cpo)} สูงกว่าแคมเปญกลุ่มเดียวกันเฉลี่ย ฿${f0(b.cpo)}` }
      return
    }
    out[i] = { tag: 'ok', reason: 'ใกล้เคียงค่าเฉลี่ยของแคมเปญกลุ่มเดียวกัน' }
  })
  return out
}

/** เงื่อนไข R8/BR-AIR-10 */
export const CREATIVE_SPEND_SHARE_X = 2
export const HIGH_CTR_X = 1.3
export const LOW_CLOSE_X = 0.5

export function creativeFlags(
  ad: Pick<AdRow, 'spend' | 'orders' | 'chats' | 'impressions' | 'clicks'>,
  totals: { spend: number | null; orders: number; ctr: number | null; closeRate: number | null },
): AdRow['creativeFlags'] {
  if (isThin(ad)) return []
  const flags: AdRow['creativeFlags'] = []
  const spend = ad.spend as number
  if (totals.spend !== null && totals.spend > 0 && totals.orders > 0) {
    const spendShare = spend / totals.spend
    const orderShare = ad.orders / totals.orders
    if (spendShare >= CREATIVE_SPEND_SHARE_X * orderShare) flags.push('HIGH_SPEND_LOW_ORDERS')
  }
  const ctr = ad.impressions !== null && ad.impressions > 0 && ad.clicks !== null ? (ad.clicks / ad.impressions) * 100 : null
  const close = ad.chats > 0 ? (ad.orders / ad.chats) * 100 : null
  if (ctr !== null && close !== null && totals.ctr !== null && totals.closeRate !== null && ctr >= HIGH_CTR_X * totals.ctr && close <= LOW_CLOSE_X * totals.closeRate) {
    flags.push('HIGH_CTR_LOW_CLOSE')
  }
  return flags
}
