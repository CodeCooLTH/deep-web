/**
 * gauge-state — สถานะเกจ "ความยาวข้อความ" (feature 00070 EXT · FR-EXT-08/11 · spec §3.6) · pure
 *
 * bytes วัดโดย `measureTemplate` ตัวเดียวกับ server (ระดับ 3, ไบต์ UTF-8 ของทั้ง message) — ที่นี่แปลงเป็น % + สีเท่านั้น
 * ปกติ ≤80% = เทากลาง (ไม่ใช่เขียว/primary) · >80% = warning · >100% = danger และบันทึกไม่ได้
 */
export type GaugeLevel = 'ok' | 'warn' | 'over'

export const GAUGE_WARN_RATIO = 0.8

export const GAUGE_COPY = {
  warn: 'ใกล้เต็มที่ LINE รับได้ ถ้าเกิน ระบบจะตัดขายดี 3 อันดับก่อน',
  warnWithChart: 'ใกล้เต็มที่ LINE รับได้ ถ้าเกิน ระบบจะตัด ขายดี 3 อันดับ → กราฟ → ย่อรายร้าน',
  over: 'ข้อความยาวเกินที่ LINE รับได้ ลดข้อความหรือเอาบล็อกออก แล้วบันทึกอีกครั้ง',
} as const

export type GaugeState = {
  level: GaugeLevel
  /** % จริง (อาจเกิน 100) */
  percent: number
  /** ความกว้างไส้ 0..100 */
  fill: number
  fillClass: string
  message: string | null
  blocksSave: boolean
}

export function gaugeState(bytes: number, limit: number, hasChart = false): GaugeState {
  const safeLimit = limit > 0 ? limit : 1
  const percent = Math.round((bytes / safeLimit) * 100)
  const fill = Math.min(100, Math.max(0, percent))
  if (bytes > safeLimit) return { level: 'over', percent, fill, fillClass: 'bg-danger', message: GAUGE_COPY.over, blocksSave: true }
  if (bytes > safeLimit * GAUGE_WARN_RATIO) {
    return { level: 'warn', percent, fill, fillClass: 'bg-warning', message: hasChart ? GAUGE_COPY.warnWithChart : GAUGE_COPY.warn, blocksSave: false }
  }
  return { level: 'ok', percent, fill, fillClass: 'bg-default-400', message: null, blocksSave: false }
}
