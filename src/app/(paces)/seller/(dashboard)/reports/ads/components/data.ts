/**
 * data.ts — ชนิดข้อมูลที่ข้ามเส้น server→client ของรายงานยอดขายตามโฆษณา (feature 00091)
 * serializable ล้วน (ไม่มี Date/Decimal) — มาจาก AdReportRow ของ ad-sales-report.service ตรง ๆ
 */
import type { AdReportRow } from '@/services/ad-sales-report.service'

export type AdViewRow = AdReportRow

export const AD_SORT_KEYS = ['sales', 'orders', 'chats', 'rate'] as const
export type AdSortKey = (typeof AD_SORT_KEYS)[number]
