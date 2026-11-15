/**
 * data.ts — ชนิด/ค่าคงที่ที่ใช้ร่วมกันของหน้า "วิเคราะห์ยอดขายจากโฆษณา" (00091 เฟส 3)
 * serializable ล้วน (ข้ามเส้น server→client) — ตัวเลขทั้งหมดมาจาก ad-revenue-report.service ไม่มีสูตรในไฟล์นี้ (HR16)
 */
import type { AdMetrics } from '@/lib/ad-revenue-view'
import type { AdRevenueReport } from '@/services/ad-revenue-report.service'

export const AD_REVENUE_TABS = ['summary', 'campaigns', 'quality', 'products', 'customers', 'time', 'coverage'] as const
export type AdRevenueTab = (typeof AD_REVENUE_TABS)[number]
/** id ของแผงเนื้อหา — ผูก aria-controls ของแท็บ (อยู่ที่นี่เพราะ page.tsx เป็น server component อ่านค่าจากไฟล์ 'use client' ไม่ได้) */
export const PANEL_ID = 'ad-revenue-panel'
export const DEFAULT_TAB: AdRevenueTab = 'summary'

/** ค่าผิด/ไม่ใส่ → สรุป (ไม่ขึ้น 404) */
export const parseTab = (v: string | undefined | null): AdRevenueTab => (AD_REVENUE_TABS as readonly string[]).includes(v ?? '') ? (v as AdRevenueTab) : DEFAULT_TAB

/** แท็บที่ใช้ค่าโฆษณา → ต้องมีแบนเนอร์เมื่อ Meta ไม่ OK */
export const TABS_NEEDING_SPEND: readonly AdRevenueTab[] = ['summary', 'campaigns', 'customers']

/** ค่าใน URL ของกลุ่ม "ไม่ทราบ" (แคมเปญ/ชุดโฆษณา) */
export const UNKNOWN_ID = '__unknown'

export type SpendInfo = AdRevenueReport['spend']
export type { AdMetrics, AdRevenueReport }

/** แอดแบบย่อสำหรับแสดงชื่อ/รูป — ส่งเฉพาะที่แท็บต้องใช้ ลด payload */
export type AdLite = Pick<AdMetrics, 'adId' | 'adTitle' | 'adPhotoFileId'>

/** % ทุกจุดบนหน้าใช้ตัวเดียว: ทศนิยม 1 ตำแหน่งคงที่ · null = "—" */
export const pct1 = (v: number) => v.toFixed(1)
export const fmtPct = (v: number | null) => (v === null ? '—' : `${pct1(v)}%`)

/** ชื่อสถานะออเดอร์ตาม vocab ของร้าน (orderStatusMetaFor) — page ส่งลงมา ห้ามตั้งคำเอง */
export type StatusLabels = Record<'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED' | 'RETURNED', string>

export const spendIsOk = (s: SpendInfo) => s.state === 'OK'
