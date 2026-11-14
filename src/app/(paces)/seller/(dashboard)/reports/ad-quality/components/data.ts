/**
 * data.ts — ชนิดข้อมูล/ค่าคงที่ที่ข้ามเส้น server→client ของรายงานคุณภาพโฆษณา (00093) · serializable ล้วน
 * 🛑 ค่าคงที่เกณฑ์ "ส่วนต่างสูง" (BR-AIQ-05) นิยามเดียวใน src/lib/ad-quality-formulas.ts — re-export ที่นี่ให้ UI ใช้
 */
import type { CardStatus } from '@/services/meta-ads-quality.service'
import { formatNumberNoSymbol } from '@/lib/format-money'

export { HIGH_GAP_PCT, HIGH_GAP_MIN_META_CHATS } from '@/lib/ad-quality-formulas'
export type { QualityRow, QualityTotals, CampaignGroup, PlacementView, PlacementLine, Metric } from '@/lib/ad-quality-view'
export type { CardStatus }
export type { AgeGenderRow } from '@/lib/meta-ads-quality'

/** สถานะการเชื่อมของค่าโฆษณา (FR-010) ที่หน้านี้ใช้ร่วมกัน */
export type AdsConn = { state: 'OK' | 'ERROR' | 'NOT_CONNECTED' | 'AUTH' | 'CURRENCY'; accountName: string | null; currency: string | null }

/** "27.6%" 1 ตำแหน่ง — null (ไม่ทราบ/หาร 0) = "—" (ห้ามแสดง 0) */
export const fmtPct1 = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`)
export const fmtInt = (v: number | null) => (v === null ? '—' : formatNumberNoSymbol(v))
export const fmtDec2 = (v: number | null) => (v === null ? '—' : v.toFixed(2))
