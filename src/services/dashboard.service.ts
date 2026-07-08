/**
 * dashboard.service.ts — aggregate ข้อมูล command center ที่ต้อง query ข้ามช่วงเวลา
 *
 * getSalesSeries — ยอดขายต่อวัน/เดือน สำหรับ Sales Chart (การ์ด mini + full sheet)
 *   ยอด = sum Order.totalAmount ของ order ที่ status != CANCELLED, group by createdAt (tz ไทย)
 *   ไม่มี migration — อ่าน Order เดิม.
 */

import { prisma } from '@/lib/prisma'

// เดือนไทยแบบย่อ — label แกน x โหมดรายเดือน
const THAI_MONTHS_ABBR = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

// Asia/Bangkok = UTC+7 คงที่ (ไม่มี DST) — bucket วัน/เดือนตามปฏิทินไทย
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000

export type SalesSeriesMode = 'daily' | 'monthly'

export interface SalesSeries {
  /** label แกน x — daily: "1".."N"; monthly: "ม.ค.".."ธ.ค." */
  labels: string[]
  /** ยอดขายรวมต่อ bucket (บาท) — ยาวเท่า labels */
  values: number[]
  /** ยอดขายส่วนที่ buyer ยืนยันแล้ว (status CONFIRMED) ต่อ bucket — ใช้แท่งสี stacked */
  confirmedValues: number[]
  /** ยอดขายส่วนที่ยังไม่ยืนยัน (PENDING/SHIPPED) ต่อ bucket — ใช้แท่งสี stacked */
  unconfirmedValues: number[]
  /** ยอดรวมทั้งช่วง */
  total: number
  /** ยอดรวมช่วงก่อนหน้า (เดือนก่อน / ปีก่อน) — ใช้คำนวณ %เทียบ */
  prevTotal: number
  /** index ตั้งแต่นี้ไป = อนาคต (เกินวันนี้/เดือนนี้) → UI ทำแท่งจาง; = labels.length ถ้าช่วงเป็นอดีตทั้งหมด */
  futureFromIndex: number
}

// UTC instant ของเวลาไทยเที่ยงคืนวันที่ 1 เดือน month0 (0-11) — Date.UTC normalize เดือนติดลบ/เกิน 11 ให้เอง
const thaiMonthStartUtc = (year: number, month0: number): Date =>
  new Date(Date.UTC(year, month0, 1) - TZ_OFFSET_MS)

// จำนวนวันในเดือน month0 ปี year
const daysInMonth = (year: number, month0: number): number =>
  new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()

export async function getSalesSeries(
  shopId: string,
  mode: SalesSeriesMode,
  period: { year: number; month?: number },
): Promise<SalesSeries> {
  // "ตอนนี้" ตามเวลาไทย — ใช้ตัดสินว่า bucket ไหนเป็นอนาคต
  const thaiNow = new Date(Date.now() + TZ_OFFSET_MS)
  const nowYear = thaiNow.getUTCFullYear()
  const nowMonth0 = thaiNow.getUTCMonth()

  let gte: Date
  let lt: Date
  let prevGte: Date
  let labels: string[]
  let bucketCount: number
  let bucketOf: (thaiShifted: Date) => number
  let futureFromIndex: number

  if (mode === 'daily') {
    const { year } = period
    const month0 = (period.month ?? 1) - 1 // period.month = 1-12
    bucketCount = daysInMonth(year, month0)
    gte = thaiMonthStartUtc(year, month0)
    lt = thaiMonthStartUtc(year, month0 + 1)
    prevGte = thaiMonthStartUtc(year, month0 - 1)
    labels = Array.from({ length: bucketCount }, (_, i) => String(i + 1))
    bucketOf = (t) => t.getUTCDate() - 1
    // เดือนนี้จริง → วันถัดจากวันนี้เป็นต้นไป = อนาคต (index วันนี้ = date-1, ไม่จาง)
    futureFromIndex =
      year === nowYear && month0 === nowMonth0 ? thaiNow.getUTCDate() : bucketCount
  } else {
    const { year } = period
    bucketCount = 12
    gte = thaiMonthStartUtc(year, 0)
    lt = thaiMonthStartUtc(year + 1, 0)
    prevGte = thaiMonthStartUtc(year - 1, 0)
    labels = [...THAI_MONTHS_ABBR]
    bucketOf = (t) => t.getUTCMonth()
    // ปีนี้จริง → เดือนถัดจากเดือนนี้เป็นต้นไป = อนาคต
    futureFromIndex = year === nowYear ? nowMonth0 + 1 : bucketCount
  }

  // query ช่วงปัจจุบัน + ช่วงก่อนหน้ารวมทีเดียว (prevGte..lt) แล้วแยกบัคเก็ต — ช่วงเล็ก (≤2 เดือน / 2 ปี)
  const rows = await prisma.order.findMany({
    where: { shopId, status: { not: 'CANCELLED' }, createdAt: { gte: prevGte, lt } },
    select: { totalAmount: true, createdAt: true, status: true },
  })

  const values = new Array<number>(bucketCount).fill(0)
  const confirmedValues = new Array<number>(bucketCount).fill(0)
  const unconfirmedValues = new Array<number>(bucketCount).fill(0)
  let total = 0
  let prevTotal = 0

  for (const r of rows) {
    const amt = Number(r.totalAmount) // Prisma Decimal → number
    const created = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)
    if (created >= gte && created < lt) {
      const shifted = new Date(created.getTime() + TZ_OFFSET_MS)
      const idx = bucketOf(shifted)
      if (idx >= 0 && idx < bucketCount) {
        values[idx] += amt
        // แยกยอด buyer ยืนยันแล้ว vs ยังไม่ยืนยัน (PENDING/SHIPPED) สำหรับแท่งสี stacked
        if (r.status === 'CONFIRMED') confirmedValues[idx] += amt
        else unconfirmedValues[idx] += amt
      }
      total += amt
    } else if (created >= prevGte && created < gte) {
      prevTotal += amt
    }
  }

  return { labels, values, confirmedValues, unconfirmedValues, total, prevTotal, futureFromIndex }
}
