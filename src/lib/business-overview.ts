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

// ─── v1.1 (2026-10-05) ช่วงเวลารายวัน/รายเดือน + แท่งซ้อน + ตารางเทียบ — SDS ส่วนแก้ไข v1.1 ───────

export type PortfolioMode = 'daily' | 'monthly'

/** ช่วงวันที่ (ปฏิทินไทย ISO) ของ period — รายวัน = ทั้งเดือน · รายเดือน = ทั้งปี */
export function periodRange(mode: PortfolioMode, year: number, month?: number | null): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  if (mode === 'monthly') return { start: `${year}-01-01`, end: `${year}-12-31` }
  const m = month ?? 1
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate()
  return { start: `${year}-${pad(m)}-01`, end: `${year}-${pad(m)}-${pad(lastDay)}` }
}

/** ฟิลด์ของ SalesSeries ที่บวกข้ามร้านได้ — ที่เหลือ (การเงิน/ร้านบริการ) ตั้งใจไม่รวม (SDS V1.1-4) */
export type AdditiveSalesSeries = {
  labels: string[]
  values: number[]
  confirmedValues: number[]
  unconfirmedValues: number[]
  orderCounts: number[]
  codPendingValues: number[]
  total: number
  prevTotal: number
  prevTotalToDate: number
  futureFromIndex: number
  last14Confirmed?: number[]
  last14Unconfirmed?: number[]
  last14Labels?: string[]
}

const sumAt = (arrs: (number[] | undefined)[], len: number) =>
  Array.from({ length: len }, (_, i) => round2(arrs.reduce((t, a) => t + (a?.[i] ?? 0), 0)))

/** บวกตาม index · labels/futureFromIndex/last14Labels เป็นค่าของช่วง (เท่ากันทุกร้าน) เอาจากตัวแรก */
export function aggregateSalesSeries(list: AdditiveSalesSeries[]): AdditiveSalesSeries | null {
  if (list.length === 0) return null
  const [first] = list
  const n = first.labels.length
  const out: AdditiveSalesSeries = {
    labels: first.labels,
    values: sumAt(list.map((s) => s.values), n),
    confirmedValues: sumAt(list.map((s) => s.confirmedValues), n),
    unconfirmedValues: sumAt(list.map((s) => s.unconfirmedValues), n),
    orderCounts: sumAt(list.map((s) => s.orderCounts), n),
    codPendingValues: sumAt(list.map((s) => s.codPendingValues), n),
    total: round2(list.reduce((t, s) => t + s.total, 0)),
    prevTotal: round2(list.reduce((t, s) => t + s.prevTotal, 0)),
    prevTotalToDate: round2(list.reduce((t, s) => t + s.prevTotalToDate, 0)),
    futureFromIndex: first.futureFromIndex,
  }
  if (first.last14Labels) {
    out.last14Labels = first.last14Labels
    out.last14Confirmed = sumAt(list.map((s) => s.last14Confirmed), first.last14Labels.length)
    out.last14Unconfirmed = sumAt(list.map((s) => s.last14Unconfirmed), first.last14Labels.length)
  }
  return out
}

export const OTHERS_KEY = 'others'

/** ชุดของกราฟแท่งซ้อน ≤ max · เกิน → (max−1) ร้านยอดสูงสุด + "อื่น ๆ" */
export function buildStack(
  shops: { key: string; name: string; total: number; values: number[] }[],
  max = 5,
): { key: string; name: string; values: number[] }[] {
  const sorted = [...shops].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'th'))
  if (sorted.length <= max) return sorted.map(({ key, name, values }) => ({ key, name, values }))
  const head = sorted.slice(0, max - 1)
  const rest = sorted.slice(max - 1)
  const len = rest[0].values.length
  return [
    ...head.map(({ key, name, values }) => ({ key, name, values })),
    { key: OTHERS_KEY, name: 'อื่น ๆ', values: sumAt(rest.map((s) => s.values), len) },
  ]
}

export type ComparisonRow = {
  shopId: string
  shopName: string
  logoUrl: string | null
  vertical: string
  isPersonal: boolean
  status: 'OK' | 'ERROR'
  sales: number
  netProfit: number
  marginPct: number | null
  /** % ของยอดขายรวม (BUSINESS เท่านั้น) — null เมื่อยอดรวม 0 / Personal / ERROR */
  sharePct: number | null
  missingCost: boolean
  missingExpense: boolean
  href: string
}

export type PortfolioTotals = { sales: number; netProfit: number; incomplete: boolean; mixedFinanceRules: boolean }

/** ยอดรวม (BUSINESS ที่ OK เท่านั้น) + แถวเทียบ: เรียงยอดขาย · Personal ท้ายสุด */
export function buildPortfolio(rows: Omit<ComparisonRow, 'sharePct'>[]): { totals: PortfolioTotals; rows: ComparisonRow[] } {
  const biz = rows.filter((r) => !r.isPersonal)
  const ok = biz.filter((r) => r.status === 'OK')
  const sales = round2(ok.reduce((t, r) => t + r.sales, 0))
  const service = biz.map((r) => usesServiceFinanceRules(r.vertical))
  const totals: PortfolioTotals = {
    sales,
    netProfit: round2(ok.reduce((t, r) => t + r.netProfit, 0)),
    incomplete: biz.some((r) => r.status === 'ERROR' || r.missingCost || r.missingExpense),
    mixedFinanceRules: service.includes(true) && service.includes(false),
  }
  const withShare = rows.map((r) => ({
    ...r,
    sharePct: !r.isPersonal && r.status === 'OK' && sales > 0 ? round2((r.sales / sales) * 100) : null,
  }))
  withShare.sort(
    (a, b) => Number(a.isPersonal) - Number(b.isPersonal) || b.sales - a.sales || a.shopName.localeCompare(b.shopName, 'th'),
  )
  return { totals, rows: withShare }
}
