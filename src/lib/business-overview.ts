/**
 * business-overview.ts — ฟังก์ชันบริสุทธิ์ของส่วน "ภาพรวมทุกธุรกิจ" (00069 TFR-003..007)
 * ไม่มีสูตรเงินใหม่ — ตัวเลขทุกตัวมาจาก getPnlReport/getSalesSeries ตัวเดิม
 */
import { round2 } from '@/lib/round2'
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import type { DateRangePreset } from '@/lib/date-range'

export type OverviewCard = {
  shopId: string
  shopName: string
  logoUrl: string | null
  vertical: string
  status: 'OK' | 'ERROR'
  revenue: number
  netProfit: number
  marginPct: number | null
  orderCount: number
  missingCost: boolean
  missingExpense: boolean
  href: string
}

/** % margin ไม่ clamp (ขาดทุน = ติดลบ) · ยอดขาย ≤ 0 = null (UI แสดง "—") */
export function marginPercent(revenue: number, netProfit: number): number | null {
  return revenue > 0 ? round2((netProfit / revenue) * 100) : null
}

export function summarizeOverview(cards: OverviewCard[]) {
  const ok = cards.filter((c) => c.status === 'OK')
  const totals = {
    revenue: round2(ok.reduce((s, c) => s + c.revenue, 0)),
    netProfit: round2(ok.reduce((s, c) => s + c.netProfit, 0)),
    orderCount: ok.reduce((s, c) => s + c.orderCount, 0),
    // ร้านล้ม หรือข้อมูลไม่ครบ (ไม่มีต้นทุน/ไม่มีค่าใช้จ่าย) ⇒ ยอดรวมต้องติดป้าย "ไม่ครบ"
    incomplete: cards.some((c) => c.status === 'ERROR' || c.missingCost || c.missingExpense),
    // ผสมกติกาการเงินสองชุด (ร้านบริการ vs ร้านอื่น) — ใช้ vertical ของทุกร้านที่เห็น
    mixedFinanceRules: new Set(cards.map((c) => usesServiceFinanceRules(c.vertical))).size > 1,
  }
  const sorted = [...cards].sort((a, b) => b.revenue - a.revenue || a.shopName.localeCompare(b.shopName, 'th'))
  return { totals, cards: sorted }
}

/** query string ของช่วงเวลา — มี range เสมอ (/expenses default 30d ถ้าไม่ส่ง) */
export function buildRangeQs(period: { preset: DateRangePreset; custom: [string, string] | null }): string {
  const p = new URLSearchParams({ range: period.preset })
  if (period.preset === 'custom' && period.custom) {
    p.set('start', period.custom[0])
    p.set('end', period.custom[1])
  }
  return p.toString()
}

/** ปลายทางตามประเภทร้าน: แท็บ pnl มีเฉพาะร้านบริการ ที่เหลือใช้การ์ด P&L ของ /expenses (SDS TD-002) */
export function financeHrefFor(vertical: string | null | undefined, rangeQs: string): string {
  return usesServiceFinanceRules(vertical) ? `/sales?tab=pnl&${rangeQs}` : `/expenses?${rangeQs}`
}

/** รวมกราฟตาม index — ไม่มีค่า = 0 · ความยาว = ยาวสุดของ labels */
export function sumSeries(
  list: { labels: string[]; values: number[]; netProfitValues?: number[] }[],
): { labels: string[]; revenue: number[]; netProfit: number[] } | null {
  if (list.length === 0) return null
  const labels = list.reduce((a, s) => (s.labels.length > a.length ? s.labels : a), [] as string[])
  const sum = (pick: (s: (typeof list)[number]) => number[] | undefined) =>
    labels.map((_, i) => round2(list.reduce((t, s) => t + (pick(s)?.[i] ?? 0), 0)))
  return { labels, revenue: sum((s) => s.values), netProfit: sum((s) => s.netProfitValues) }
}

export type OverviewTotals = ReturnType<typeof summarizeOverview>['totals']
