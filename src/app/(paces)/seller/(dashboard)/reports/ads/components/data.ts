/**
 * data.ts — ชนิดข้อมูลที่ข้ามเส้น server→client ของรายงานยอดขายตามโฆษณา (feature 00091)
 * serializable ล้วน (ไม่มี Date/Decimal) — มาจาก AdReport ของ ad-sales-report.service ตรง ๆ
 */
import type { AdReport, AdReportRow } from '@/services/ad-sales-report.service'
import { formatNumberNoSymbol } from '@/lib/format-money'

export type AdViewRow = AdReportRow
/** ทุกอย่างที่การ์ดต้องใช้ ยกเว้นแถวรายแอด (ส่งแยก) */
export type AdReportView = Omit<AdReport, 'rows' | 'hasAnyAdData'>

export const AD_SORT_KEYS = ['sales', 'orders', 'chats', 'rate', 'spend', 'roas'] as const
export type AdSortKey = (typeof AD_SORT_KEYS)[number]

/** "27.8%" — null (ไม่มีแชทให้หาร) = "—" */
export const fmtPct = (v: number | null) => (v === null ? '—' : `${formatNumberNoSymbol(v)}%`)

/** ROAS 2 ตำแหน่ง — null = "—" */
export const fmtRoas = (v: number | null) => (v === null ? '—' : v.toFixed(2))

/** แถวของการ์ดที่แสดงยอดเงินเป็นสัดส่วน — 0 ไม่เป็นปัญหา, ฐาน 0 → 0 (ห้ามหาร 0) */
export const shareOf = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)
