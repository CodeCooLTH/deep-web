/**
 * sales-chart-buckets — รวมแถวรายวันเป็นแท่งรายสัปดาห์เมื่อช่วงยาวเกินอ่าน (2026-10-01)
 *
 * ช่วงกำหนดเองยาวได้ถึง 366 วัน — กราฟรายวัน 366 แท่งบนจอ ~1,000px ได้แท่งกว้างไม่ถึง 1px
 * (audit responsive) ⇒ เกิน `MAX_DAILY_BARS` วัน ให้รวม 7 วันติดกันเป็นแท่งเดียว
 * **เฉพาะกราฟ** — ตารางรายวันข้างล่างยังเป็นรายวันเหมือนเดิม (ตัวเลขเป๊ะอยู่ที่ตาราง)
 *
 * รวมเป็นช่วงละ 7 วันนับจากวันแรกของช่วงที่เลือก (ไม่ใช่สัปดาห์ปฏิทิน) — ทุกแท่งยาวเท่ากัน
 * ยกเว้นแท่งสุดท้ายที่อาจสั้นกว่า · ผลรวมทุกแท่ง = ผลรวมรายวันเสมอ (ไม่มีวันหลุด/นับซ้ำ)
 */

/** เกินกี่วันถึงรวมเป็นรายสัปดาห์ — 62 = สองเดือนเต็ม ยังอ่านแท่งรายวันได้บนมือถือ */
export const MAX_DAILY_BARS = 62
const WEEK = 7

export type DayLike = {
  date: string
  revenue: number
  unconfirmedRevenue: number
  shippingCost?: number
  received?: number
}

export type ChartBucket = {
  /** วันแรก/วันสุดท้ายของแท่ง ("YYYY-MM-DD") — รายวันจะเท่ากัน */
  start: string
  end: string
  revenue: number
  unconfirmedRevenue: number
  shippingCost: number
  received: number
}

export function bucketForChart(rows: DayLike[], maxDaily = MAX_DAILY_BARS): { weekly: boolean; buckets: ChartBucket[] } {
  const weekly = rows.length > maxDaily
  const size = weekly ? WEEK : 1
  const buckets: ChartBucket[] = []
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size)
    buckets.push({
      start: chunk[0].date,
      end: chunk[chunk.length - 1].date,
      revenue: chunk.reduce((s, r) => s + r.revenue, 0),
      unconfirmedRevenue: chunk.reduce((s, r) => s + r.unconfirmedRevenue, 0),
      shippingCost: chunk.reduce((s, r) => s + (r.shippingCost ?? 0), 0),
      received: chunk.reduce((s, r) => s + (r.received ?? 0), 0),
    })
  }
  return { weekly, buckets }
}
