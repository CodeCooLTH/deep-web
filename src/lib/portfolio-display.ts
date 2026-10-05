/**
 * portfolio-display.ts — ข้อความ/boolean ที่ตัดสินหน้าตาของส่วน "ภาพรวมทุกธุรกิจ" (00069)
 *
 * แยกจาก JSX เพื่อให้เทสจับได้ (docs/conventions/ui-boolean-needs-a-testable-home.md)
 * ไม่มีสูตรเงินใหม่ — รับตัวเลขจาก business-overview.ts อย่างเดียว
 */
import { formatMonthYearTH, toBuddhistYear } from '@/lib/format-date'
import type { PortfolioMode } from '@/lib/business-overview'

/** ป้ายข้อมูลไม่ครบบนการ์ดร้าน — ขาดทั้งคู่ = 2 ป้าย */
export function shopIncompleteBadges(
  c: { missingCost: boolean; missingExpense: boolean; sales: number },
  costNoun: string,
): string[] {
  // ยอดขาย 0 = ไม่มีกำไรให้ "ไม่ครบ" — เตือนตรงนี้ทำให้ผู้ใช้รู้สึกว่าทำอะไรผิดทั้งที่แค่ไม่มีของขาย (critique 2026-10-05)
  if (c.sales <= 0) return []
  const out: string[] = []
  if (c.missingCost) out.push(`ยังไม่ตั้ง${costNoun}`)
  if (c.missingExpense) out.push('ยังไม่บันทึกค่าใช้จ่าย')
  return out
}

/** ขาดทุน → แดง · ข้อมูลไม่ครบ → warning · ปกติ → กลาง (ห้ามเขียว: Verified-Means-Green) */
export function profitToneClass(netProfit: number, incomplete: boolean): string {
  if (netProfit < 0) return 'text-danger-ink'
  return incomplete ? 'text-warning-ink' : 'text-default-800'
}

export function profitHeading(netProfit: number, scope: 'total' | 'shop'): string {
  const word = netProfit < 0 ? 'ขาดทุนสุทธิ' : 'กำไรสุทธิ'
  return scope === 'total' ? `${word}รวม` : word
}

/** หมายเหตุฐานค่าส่ง — เฉพาะเมื่อมีร้านต่างกติกาการเงิน */
export function financeBasisNote(mixedFinanceRules: boolean): string | null {
  return mixedFinanceRules
    ? 'ร้านบริการนับค่าส่งเป็นค่าใช้จ่าย ร้านขายของไม่นับ กำไรของสองแบบจึงเทียบกันตรง ๆ ไม่ได้'
    : null
}

// ─── v1.1 (2026-10-05) ช่วงเวลารายวัน/รายเดือน + กราฟแท่งซ้อน + ตารางเทียบ ─────────────────────────

export const PORTFOLIO_TITLE = 'ภาพรวมทุกธุรกิจ'
/** หัวการ์ดบนมือถือ + หัวชีต (spec: "ยอดขายทุกธุรกิจ") */
export const PORTFOLIO_CARD_TITLE = 'ยอดขายทุกธุรกิจ'
export const PORTFOLIO_BASIS_NOTE = 'ยอดขายนับทั้งที่ยืนยันแล้วและรอยืนยัน · กำไรสุทธิคิดแบบเดียวกับหน้าการเงินของแต่ละร้าน'
export const PORTFOLIO_PERSONAL_BADGE = 'ส่วนตัว · ไม่นับในยอดรวม'
/** ป้ายเดียวกันแบ่งเป็นท่อน — แต่ละท่อน nowrap กันคำว่า "รวม" ตกบรรทัดเดี่ยว (critique 2026-10-05) */
export const PORTFOLIO_PERSONAL_BADGE_PARTS = ['ส่วนตัว ·', 'ไม่นับในยอดรวม'] as const
export const PORTFOLIO_EMPTY_TITLE = 'ช่วงนี้ยังไม่มียอดขาย — ลองเลื่อนไปช่วงก่อนหน้า'
export const PORTFOLIO_ERROR_TEXT = 'โหลดข้อมูลไม่สำเร็จ'
export const PORTFOLIO_ROW_ERROR_TEXT = 'ดึงข้อมูลร้านนี้ไม่ได้'
export const PORTFOLIO_INCOMPLETE_BADGE = 'ข้อมูลยังไม่ครบ'
export const PORTFOLIO_INCOMPLETE_HINT = 'มีร้านที่ยังไม่ตั้งต้นทุนหรือยังไม่บันทึกค่าใช้จ่าย กำไรจริงจึงน้อยกว่าตัวเลขนี้'

/**
 * โทเคนสีของกราฟแท่งซ้อนตามลำดับร้าน (ยอดมาก→น้อย) — เฉพาะสีกลาง
 * ห้ามเขียว (alpha = ยืนยันแล้ว) · แดง/เหลือง (beta/gamma = error/warning) · chart-secondary (ม่วงบน skin อื่น)
 * ชุดนี้มี chart-* กลางแค่ 4 ตัว แต่ buildStack ให้ได้ถึง 5 ซีรีส์ (≤5 ร้านไม่มี "อื่น ๆ") ⇒ ตัวที่ 5 ใช้เทากลาง
 */
// chart-dark ถูกถอด — สกิน saas เป็นน้ำเงินเข้มใกล้ chart-primary จนแยกสองร้านแรกไม่ออก (critique 2026-10-05)
// ⇒ ชุดสีมี 4 สี · service จึงเรียก buildStack(…, STACK_COLOR_TOKENS.length) ให้ไม่มีสีวนซ้ำ
export const STACK_COLOR_TOKENS = ['chart-primary', 'chart-delta', 'chart-zeta', 'default-600'] as const
export const OTHERS_COLOR_TOKEN = 'default-400'

/** โทเคนสีของซีรีส์ลำดับที่ index — "อื่น ๆ" เป็นเทาอ่อนเสมอ ไม่กินสีลำดับ */
export function stackColorToken(index: number, key: string, othersKey = 'others'): string {
  if (key === othersKey) return OTHERS_COLOR_TOKEN
  return STACK_COLOR_TOKENS[index % STACK_COLOR_TOKENS.length]
}

/**
 * จุดสีของแถวในตาราง — ต้องตรงกับแท่งในกราฟทุกร้าน
 * ร้านที่ถูกรวมเป็น "อื่น ๆ" = เทาอ่อน · Personal/ร้านล้ม (ไม่อยู่ในกราฟ) = null (ไม่มีจุด)
 */
export function rowDotToken(
  stack: { key: string }[],
  row: { shopId: string; isPersonal: boolean; status: 'OK' | 'ERROR' },
  othersKey = 'others',
): string | null {
  if (row.isPersonal || row.status === 'ERROR') return null
  const i = stack.findIndex((s) => s.key === row.shopId)
  if (i >= 0) return stackColorToken(i, row.shopId, othersKey)
  return stack.some((s) => s.key === othersKey) ? OTHERS_COLOR_TOKEN : null
}

/** "อื่น ๆ (N ร้าน)" — N = จำนวนร้านที่ถูกรวม = ร้านใน stack ทั้งหมดที่ไม่ได้ถูกแยก */
export function othersLabel(count: number): string {
  return `อื่น ๆ (${count} ร้าน)`
}

/** บรรทัด "ยอดรวมนี้ยังไม่รวม n ร้าน" — เฉพาะ BUSINESS ที่ล้ม */
export function excludedCountNote(failedCount: number): string | null {
  return failedCount > 0 ? `ยอดรวมนี้ยังไม่รวม ${failedCount} ร้าน` : null
}

export type PortfolioPeriod = { mode: PortfolioMode; year: number; month: number }

/** "ต.ค. 2569" / "ปี 2569" */
export function portfolioPeriodLabel(p: PortfolioPeriod): string {
  return p.mode === 'daily'
    ? formatMonthYearTH(new Date(Date.UTC(p.year, p.month - 1, 15)))
    : `ปี ${toBuddhistYear(p.year)}`
}

/** ช่วงที่เลือกเป็นช่วงปัจจุบัน (หรืออนาคต) ไหม — ปิดปุ่ม › */
export function isCurrentOrFuturePeriod(p: PortfolioPeriod, now: { year: number; month: number }): boolean {
  return p.mode === 'daily' ? p.year * 12 + p.month >= now.year * 12 + now.month : p.year >= now.year
}

/** เลื่อนช่วง ‹ › — ข้ามปีได้ · เลื่อนไปอนาคตไม่ได้ (คืนค่าเดิม) */
export function shiftPeriod(p: PortfolioPeriod, dir: -1 | 1, now: { year: number; month: number }): PortfolioPeriod {
  if (dir === 1 && isCurrentOrFuturePeriod(p, now)) return p
  if (p.mode === 'monthly') return { ...p, year: p.year + dir }
  const idx = p.year * 12 + (p.month - 1) + dir
  return { ...p, year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

/** สลับโหมด → กลับไปช่วงปัจจุบันของโหมดนั้นเสมอ (ชุดเดียวกับ SalesChartSheet) */
export function switchPeriodMode(mode: PortfolioMode, now: { year: number; month: number }): PortfolioPeriod {
  return { mode, year: now.year, month: now.month }
}

/** query ของ GET /api/seller/portfolio-series — monthly ไม่ส่ง month */
export function portfolioSeriesQuery(p: PortfolioPeriod): string {
  const qs = new URLSearchParams({ mode: p.mode, year: String(p.year) })
  if (p.mode === 'daily') qs.set('month', String(p.month))
  return qs.toString()
}

/** aria ของกราฟ — role="img" ต้องมีสรุปตัวเลข */
export function portfolioChartAria(totalSales: string, periodLabel: string): string {
  return `กราฟแท่งซ้อนยอดขายแยกตามธุรกิจ ${periodLabel} ยอดขายรวม ${totalSales}`
}

export function rowAriaLabel(shopName: string): string {
  return `ดูการเงินของร้าน ${shopName}`
}

/**
 * สัดส่วนยอดขายในตารางเทียบ — ยอดไม่เป็นศูนย์ต้องไม่แสดงเป็น "0%" (QA 2026-10-05: ฿150 จาก ฿51,690
 * ปัดเป็น 0% อ่านแล้วเหมือนร้านไม่มียอดเลย) · null = ไม่มีสัดส่วน (Personal/ร้านล้ม/ยอดรวม 0)
 */
export function formatSharePct(pct: number | null): string {
  if (pct == null) return '—'
  if (pct > 0 && pct < 1) return '<1%'
  return `${Math.round(pct)}%`
}

/** ป้าย "ข้อมูลยังไม่ครบ" ที่ยอดรวม — ไม่มียอดขายเลย = ไม่มีอะไรให้ไม่ครบ */
export function showTotalIncompleteBadge(totals: { sales: number; incomplete: boolean }): boolean {
  return totals.incomplete && totals.sales > 0
}

/**
 * กำไรรวม "ยังคำนวณไม่ได้" — ทุกร้านธุรกิจที่มียอดขายยังไม่ตั้งต้นทุนเลย ⇒ ตัวเลขกำไรคือยอดยืนยันทั้งก้อน
 * แสดงเป็นตัวเลขใหญ่แล้วผู้ขายเชื่อว่าเป็นมาร์จิ้นจริง (critique 2026-10-05 P1) · มีร้านใดร้านหนึ่งตั้งแล้ว = ยังแสดงตัวเลข+ป้าย
 */
export function isTotalProfitUnknown(
  rows: { isPersonal: boolean; status: string; sales: number; missingCost: boolean }[],
): boolean {
  const selling = rows.filter((r) => !r.isPersonal && r.status === 'OK' && r.sales > 0)
  return selling.length > 0 && selling.every((r) => r.missingCost)
}

export const PORTFOLIO_PROFIT_UNKNOWN = 'ยังคำนวณกำไรไม่ได้'
export const PORTFOLIO_PROFIT_UNKNOWN_HINT = 'ร้านที่มียอดขายยังไม่ได้ตั้งต้นทุนเลย เลือกร้านด้านล่างเพื่อไปตั้งต้นทุน'
