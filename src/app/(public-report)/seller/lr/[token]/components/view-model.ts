/**
 * view-model.ts — ตรรกะล้วนของหน้าสรุปสาธารณะ (ไม่มี JSX) · ป้าย/สีทุกตัวมาจาก SSOT ไม่พิมพ์เอง
 * ป้ายก้อน: ร้านบริการ "ปิดงานแล้ว/รอปิดงาน" · ร้านอื่น GENERIC_SALES_LEGEND (spec §A12)
 */
import type { Bucket, DetailShop, DetailSnapshotV1, OrderRow } from '@/lib/line-report/detail-snapshot'
import { FINANCE_COLORS } from '@/lib/finance-colors'
import { GENERIC_SALES_LEGEND } from '@/lib/line/flex-report-blocks'
import { formatDateTH } from '@/lib/format-date'

const C = FINANCE_COLORS

type Tone = { label: string; dot: string; chip: string }
const tone = (label: string, c: { dot: string; soft: string; ink: string }): Tone => ({ label, dot: c.dot, chip: `${c.soft} ${c.ink}` })

export const BUCKET_TONE: Record<Bucket['key'], Tone> = {
  CLOSED: tone('ปิดงานแล้ว', C.counted),
  UNCLOSED: tone('รอปิดงาน', C.notCounted),
  COUNTED: tone(GENERIC_SALES_LEGEND.counted, C.confirmed),
  PENDING: tone(GENERIC_SALES_LEGEND.pending ?? 'รอยืนยัน', C.notCounted),
}

/** marker แกนการ์ด: icon + ข้อความ (ไม่เติมสี) */
export const AXIS_MARKER: Record<OrderRow['axis'], { label: string; icon: string; cls: string }> = {
  CONFIRMED: { label: GENERIC_SALES_LEGEND.counted, icon: 'circle-check', cls: 'text-primary' },
  PENDING: { label: GENERIC_SALES_LEGEND.pending ?? 'รอยืนยัน', icon: 'clock', cls: 'text-warning-ink' },
  RETURNED: { label: 'คืนของแล้ว', icon: 'arrow-back-up', cls: 'text-warning-ink' },
}

// ป้ายเหตุผลชุดเดียวกับการ์ดใน LINE (HR16)
export { EXCLUDED_REASON as EXCLUDED_REASON_TH } from '@/lib/line/flex-report-blocks'

export type BarSeg = Bucket & { tone: Tone; pct: number }

/** ส่วนของแท่งสัดส่วน — ยอดจากชุดเต็มใน payload (ไม่ใช่แถวที่ตัดเพดาน) · ยอดรวม 0 = ไม่มี segment */
export function barSegments(buckets: DetailShop['buckets']): BarSeg[] {
  if (!buckets) return []
  const total = buckets.reduce((s, b) => s + b.amount, 0)
  return buckets.map((b) => ({ ...b, tone: BUCKET_TONE[b.key], pct: total > 0 ? (b.amount / total) * 100 : 0 }))
}

/** chip ก้อนของแถว: ร้านบริการ/ทั่วไปใช้ bucket index เดียวกัน · ไม่เปิดยอดขาย = ไม่มี bucket = ไม่มีชิป */
export function rowChip(shop: DetailShop, r: OrderRow): Tone | null {
  if (r.bucket === undefined || !shop.buckets) return null
  if (r.axis === 'RETURNED' && shop.rule === 'GENERAL') return null // คืนของแล้ว: แสดงเป็น marker อย่างเดียว
  return BUCKET_TONE[shop.buckets[r.bucket].key]
}

/** marker แสดงเสมอในร้านบริการ (สองแกน) · ร้านทั่วไปเฉพาะ "คืนของแล้ว" (ชิปเดียวบอกแกนการ์ดอยู่แล้ว) */
export function rowMarker(shop: DetailShop, r: OrderRow) {
  if (shop.rule === 'SERVICE' || r.axis === 'RETURNED') return AXIS_MARKER[r.axis]
  return null
}

export const isMultiDay = (s: DetailSnapshotV1) => s.window.startIso !== s.window.endIso

/** expiresAt เก็บเป็น 00:00 วันที่ 2 (exclusive) — แสดง "สิ้นวัน" = ถอยหนึ่ง ms (spec §A3) */
export const expiryDayText = (expiresAt: string | Date) => formatDateTH(new Date(new Date(expiresAt).getTime() - 1))

/** รูปสินค้าต้องเป็น route first-party ที่เซ็นลายเซ็นเท่านั้น — อย่างอื่นไม่โหลด (หน้าสาธารณะห้ามเรียกของนอก) */
export function safeImageUrl(u: string | undefined): string | undefined {
  if (!u) return undefined
  try {
    const url = new URL(u)
    // origin ต้องเป็นโดเมนผู้ขายของเราเอง — กัน payload ที่ถูกแก้ในฐานชี้รูปภายนอก (security L-1)
    const own = process.env.NEXT_PUBLIC_SELLER_URL ? new URL(process.env.NEXT_PUBLIC_SELLER_URL).origin : null
    return url.protocol === 'https:' && url.origin === own && url.pathname === '/api/line-report/product-image' ? u : undefined
  } catch {
    return undefined
  }
}
