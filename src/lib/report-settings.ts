/**
 * ตั้งค่ารายงานการเงิน — ร้านบริการเท่านั้น (feature 00073 เฟส B · PRD §3.6 · BRD FR-010/011)
 *
 * เก็บที่ `Shop.reportSettings` (JSON · null = ยังไม่เคยตั้ง) — ไม่ใช่ตารางแยก เพราะ layout ของ
 * ร้านโหลดแถว Shop อยู่แล้วทุกหน้า ⇒ อ่านค่านี้ได้โดยไม่เพิ่ม query (เมนู "ค่าใช้จ่าย" ต้องรู้ทุกหน้า)
 *
 * 🛑 หลักที่ห้ามหลุด (PRD §3.6 Business Rules):
 *   1. ยังไม่เคยตั้ง = เห็นเหมือนวันนี้ทุกอย่าง ยกเว้น "มัดจำรับล่วงหน้า" (ปิด) — `DEFAULT_REPORT_SETTINGS`
 *   2. เปลี่ยนแค่ "แสดงอะไร แบบไหน" — **วิธีนับเงินไม่เปลี่ยน** · ปิด = ซ่อน ไม่ลบข้อมูล
 *   3. รายงานกลุ่ม LINE ไม่อ่านค่านี้ (แต่ละกลุ่มมีสวิตช์ของตัวเอง — 00070)
 *   4. ร้านที่ไม่ใช่บริการ: `resolveReportSettings` คืนค่าตั้งต้นเสมอ ไม่ว่าแถวจะมีอะไร
 *
 * ไฟล์บริสุทธิ์ (ไม่แตะ prisma/window) — RSC และ client เรียกตัวเดียวกันได้ · ทุก boolean ที่ตัดสิน
 * ว่าจอจะ "พูดอะไร" อยู่ที่นี่ให้เทสจับได้ (docs/conventions/ui-boolean-needs-a-testable-home.md)
 */
import * as v from 'valibot'

import { usesServiceFinanceRules } from './finance-rules'
import { DEFAULT_FINANCE_TAB, FINANCE_TABS, type FinanceTab } from './finance-tabs'

/** รูปแบบกราฟของร้าน — ตั้งครั้งเดียว ใช้ทุกกราฟการเงินของร้าน */
export const REPORT_CHART_STYLES = ['STACKED', 'GROUPED', 'LINE', 'AREA'] as const
export type ReportChartStyle = (typeof REPORT_CHART_STYLES)[number]

/** ช่วงเวลาเริ่มต้นของกราฟการเงิน — MONTH = รายวันของเดือนนี้ (หน้าตาวันนี้) · ที่เหลือ = รายเดือน */
export const REPORT_RANGES = ['MONTH', 'M3', 'M6', 'M12', 'YEAR'] as const
export type ReportRange = (typeof REPORT_RANGES)[number]

/** ตัวเลขหลักบนการ์ดยอดขาย (หน้าแรกมือถือ + ภาพรวมร้านคอม) — มติ user 2026-10-12 */
export const REPORT_HEADLINES = ['SALES', 'RECEIVED', 'NET_PROFIT'] as const
export type ReportHeadline = (typeof REPORT_HEADLINES)[number]

export interface ReportSettings {
  /** รับเงินแล้ว / ค้างรับ */
  receivables: boolean
  /** มัดจำรับล่วงหน้า (งานที่ยังไม่ปิด) — ไม่ปนยอดขาย */
  advanceDeposit: boolean
  /** จำนวนงาน + เฉลี่ยต่องาน + เส้นจำนวนงานในกราฟ */
  jobCount: boolean
  /** ต้นทุนอะไหล่ (ORDER_VOCAB.costNoun ของร้านบริการ) */
  partCost: boolean
  /** ค่าใช้จ่ายร้าน (ตาราง Expense) */
  shopExpense: boolean
  /** กำไรขาดทุน */
  pnl: boolean
  chartStyle: ReportChartStyle
  defaultRange: ReportRange
  /** ตัวเลขหลักบนการ์ด — ใช้ผ่าน `resolveHeadline` เสมอ (ถอยเป็นยอดขายเมื่อสวิตช์ต้นทางปิด) */
  headline: ReportHeadline
}

/** ยังไม่เคยตั้ง = เหมือนวันนี้ (มัดจำล่วงหน้าปิด · กราฟแท่งซ้อน · รายวันของเดือนนี้) */
export const DEFAULT_REPORT_SETTINGS: Readonly<ReportSettings> = Object.freeze({
  receivables: true,
  advanceDeposit: false,
  jobCount: true,
  partCost: true,
  shopExpense: true,
  pnl: true,
  chartStyle: 'STACKED',
  defaultRange: 'MONTH',
  headline: 'SALES',
})

/** schema ของคำขอบันทึก — ทุกช่อง optional (ส่งเฉพาะที่เปลี่ยน) · ช่องที่ไม่รู้จักถูกตัดทิ้ง */
export const UpdateReportSettingsSchema = v.object({
  receivables: v.optional(v.boolean()),
  advanceDeposit: v.optional(v.boolean()),
  jobCount: v.optional(v.boolean()),
  partCost: v.optional(v.boolean()),
  shopExpense: v.optional(v.boolean()),
  pnl: v.optional(v.boolean()),
  chartStyle: v.optional(v.picklist(REPORT_CHART_STYLES)),
  defaultRange: v.optional(v.picklist(REPORT_RANGES)),
  headline: v.optional(v.picklist(REPORT_HEADLINES)),
})
export type UpdateReportSettingsInput = v.InferOutput<typeof UpdateReportSettingsSchema>

/**
 * อ่านค่าที่เก็บไว้ (JSON ดิบจาก DB) → ค่าครบทุกช่อง
 *
 * fail-safe: ค่าเพี้ยน/ช่องหาย/ชนิดผิด → ใช้ค่าตั้งต้นของช่องนั้น (ไม่ throw — จอการเงินต้องเปิดได้เสมอ)
 * ร้านที่ไม่ใช่บริการ → ค่าตั้งต้นเสมอ (ข้อ 4 หัวไฟล์)
 */
export function resolveReportSettings(raw: unknown, vertical: string | null | undefined): ReportSettings {
  const base: ReportSettings = { ...DEFAULT_REPORT_SETTINGS }
  if (!usesServiceFinanceRules(vertical)) return base
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return base
  const r = raw as Record<string, unknown>
  const bool = (k: keyof ReportSettings) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (base[k] as boolean))
  return {
    receivables: bool('receivables'),
    advanceDeposit: bool('advanceDeposit'),
    jobCount: bool('jobCount'),
    partCost: bool('partCost'),
    shopExpense: bool('shopExpense'),
    pnl: bool('pnl'),
    chartStyle: (REPORT_CHART_STYLES as readonly string[]).includes(r.chartStyle as string)
      ? (r.chartStyle as ReportChartStyle)
      : base.chartStyle,
    defaultRange: (REPORT_RANGES as readonly string[]).includes(r.defaultRange as string)
      ? (r.defaultRange as ReportRange)
      : base.defaultRange,
    headline: (REPORT_HEADLINES as readonly string[]).includes(r.headline as string)
      ? (r.headline as ReportHeadline)
      : base.headline,
  }
}

/** รวมค่าที่บันทึกไว้กับคำขอแก้ — คืนค่าครบทุกช่องสำหรับเขียนลง DB */
export function mergeReportSettings(current: ReportSettings, patch: UpdateReportSettingsInput): ReportSettings {
  const next = { ...current }
  for (const [k, val] of Object.entries(patch) as [keyof ReportSettings, unknown][]) {
    if (val !== undefined) (next as Record<string, unknown>)[k] = val
  }
  return next
}

/** ค่าตรงกับค่าตั้งต้นทุกช่องไหม — ใช้บอกบนหน้าตั้งค่าว่า "ยังเป็นค่าเริ่มต้น" */
export function isDefaultReportSettings(s: ReportSettings): boolean {
  return (Object.keys(DEFAULT_REPORT_SETTINGS) as (keyof ReportSettings)[]).every(
    (k) => s[k] === DEFAULT_REPORT_SETTINGS[k],
  )
}

// ─── สิ่งที่จอ "แสดง" ตามตั้งค่า (ตัวตัดสินชุดเดียวของทุกจอ) ─────────────────────────────

/** แท็บ/เมนู "ค่าใช้จ่าย" มีเมื่อเปิดค่าใช้จ่ายร้าน (ดีไซน์บอร์ด 8: ปิด → แท็บและเมนูหาย ข้อมูลไม่ถูกลบ) · ต้นทุนอะไหล่อยู่แท็บกำไรขาดทุน */
export function showsExpenseTab(s: ReportSettings): boolean {
  return s.shopExpense
}

/**
 * กำไรที่แสดง = ยอดขาย − (ต้นทุน ถ้าเปิด) − (ค่าใช้จ่ายร้าน ถ้าเปิด)
 *
 * 🛑 ปิดต้นทุน/ค่าใช้จ่ายแล้วตัวเลขไม่ใช่ "กำไรสุทธิ" ตามนิยามระบบอีกต่อไป (HR16) ⇒ ต้องติดป้าย
 * บอกว่าไม่ได้หักอะไร (`profitExclusions`) — ห้ามแสดงคำว่ากำไรสุทธิเปล่า ๆ
 */
export function profitShown(
  s: ReportSettings,
  n: { revenue: number; cogs: number; expense: number },
): number {
  return n.revenue - (s.partCost ? n.cogs : 0) - (s.shopExpense ? n.expense : 0)
}

/** สิ่งที่ "ไม่ได้หัก" ในกำไรที่แสดง (ตามตั้งค่า) — ว่าง = หักครบ = กำไรสุทธิตามนิยามระบบ */
export function profitExclusions(s: ReportSettings, costNoun: string): string[] {
  const out: string[] = []
  if (!s.partCost) out.push(costNoun)
  if (!s.shopExpense) out.push('ค่าใช้จ่ายร้าน')
  return out
}

/** ป้ายสั้นของกำไรที่หักไม่ครบ: "ยังไม่หักต้นทุนอะไหล่ · ค่าใช้จ่ายร้าน (ปิดไว้ในตั้งค่ารายงาน)" */
export function profitExclusionNote(s: ReportSettings, costNoun: string): string | null {
  const ex = profitExclusions(s, costNoun)
  return ex.length === 0 ? null : `ยังไม่หัก${ex.join(' · ')} (ปิดไว้ในตั้งค่ารายงาน)`
}

/** ชื่อหน้าตั้งค่า + url — ที่เดียว (เมนู/ลิงก์จากหน้าการเงินใช้ตัวเดียวกัน) */
export const REPORT_SETTINGS_URL = '/settings/reports'
export const REPORT_SETTINGS_LABEL = 'ตั้งค่ารายงาน'

// ─── แท็บของหน้าการเงิน (ชีตมือถือ + /sales) ────────────────────────────────────────────

/**
 * แท็บที่มองเห็นตามตั้งค่า — ลำดับเดิมของ FINANCE_TABS · "ยอดเก็บเงิน" มีเสมอ (ยอดขายเปิดเสมอ)
 * ค่าตั้งต้น = ครบ 3 แท็บ (เหมือนก่อนมีตั้งค่า)
 */
export function visibleFinanceTabs(s: ReportSettings): FinanceTab[] {
  return FINANCE_TABS.filter((t) => (t === 'pnl' ? s.pnl : t === 'expense' ? showsExpenseTab(s) : true))
}

/**
 * แท็บที่จะเปิดจริง — ค่าจาก URL ที่ถูกซ่อน/ไม่รู้จัก ถอยไปแท็บตั้งต้นที่มองเห็น
 * (กำไรขาดทุนถ้าเปิด ไม่งั้นยอดเก็บเงิน) — fail-closed เหมือน resolveFinanceTab
 */
export function resolveVisibleFinanceTab(raw: string | string[] | null | undefined, s: ReportSettings): FinanceTab {
  const visible = visibleFinanceTabs(s)
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value === 'string' && (visible as string[]).includes(value)) return value as FinanceTab
  return visible.includes(DEFAULT_FINANCE_TAB) ? DEFAULT_FINANCE_TAB : 'collect'
}

/** ป้ายแท็บ "ยอดเก็บเงิน" — ปิดรับเงิน/ค้างรับแล้วแท็บนี้ไม่ได้พูดเรื่องการเก็บเงิน ⇒ "ยอดขาย" */
export function collectTabLabel(s: ReportSettings): string {
  return s.receivables ? 'ยอดเก็บเงิน' : 'ยอดขาย'
}

/**
 * ตัวเลขหลักที่ใช้จริง — ตัวที่เลือกไว้แต่สวิตช์ต้นทางถูกปิดภายหลัง ถอยเป็นยอดขาย
 * (รับเงินแล้วต้องเปิด "รับเงินแล้ว/ค้างรับ" · กำไรสุทธิต้องเปิด "กำไรขาดทุน")
 */
export function resolveHeadline(s: ReportSettings): ReportHeadline {
  if (s.headline === 'RECEIVED' && !s.receivables) return 'SALES'
  if (s.headline === 'NET_PROFIT' && !s.pnl) return 'SALES'
  return s.headline
}
