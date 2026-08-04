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
  /* ── ค่าใช้จ่าย (feature 00016) — มีเฉพาะเมื่อ caller ส่ง includeFinance=true คือผ่าน gate สิทธิ์แล้ว
        undefined ทั้งชุด = ไม่มีสิทธิ์ดู UI ต้องซ่อนทั้งบล็อก ไม่ใช่แสดง ฿0 ────────────────────── */
  /** ค่าใช้จ่ายที่บันทึกต่อ bucket (บาท) */
  expenseValues?: number[]
  /** กำไรสุทธิต่อ bucket = ยอดที่ยืนยันแล้ว − ต้นทุนสินค้า − ค่าใช้จ่าย (สูตรเดียวกับการ์ด P&L) */
  netProfitValues?: number[]
  /** ค่าใช้จ่ายรวมทั้งช่วง */
  totalExpense?: number
  /** กำไรสุทธิรวมทั้งช่วง */
  netProfit?: number
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
  /** true เฉพาะเมื่อ caller ตรวจ resolveExpenseAccess ผ่านแล้ว — false = ไม่ query ค่าใช้จ่ายเลย
   *  (fail-closed ตั้งแต่ชั้น query ไม่ใช่ไปกรองทีหลังตอน render) */
  includeFinance = false,
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

  /**
   * ขอบเขตของค่าใช้จ่ายต่างจากออเดอร์ 7 ชั่วโมง — Expense.expenseDate เก็บเป็น UTC midnight ของ
   * วันตามปฏิทิน ส่วน Order.createdAt เป็น timestamptz ที่ต้อง shift เข้าเวลาไทยก่อน bucket
   * ถ้าใช้ขอบเดียวกัน ค่าใช้จ่ายของวันที่ 1 เดือนถัดไปจะหลุดเข้ามาในเดือนนี้
   * (ดู "Dual Boundary Design" ใน src/lib/date-range.ts)
   */
  const utcMonthStart = (y: number, m0: number) => new Date(Date.UTC(y, m0, 1))
  const expGte =
    mode === 'daily'
      ? utcMonthStart(period.year, (period.month ?? 1) - 1)
      : utcMonthStart(period.year, 0)
  const expLt =
    mode === 'daily'
      ? utcMonthStart(period.year, (period.month ?? 1))
      : utcMonthStart(period.year + 1, 0)

  // query ช่วงปัจจุบัน + ช่วงก่อนหน้ารวมทีเดียว (prevGte..lt) แล้วแยกบัคเก็ต — ช่วงเล็ก (≤2 เดือน / 2 ปี)
  const [rows, expenseRows] = await Promise.all([
    prisma.order.findMany({
      where: { shopId, status: { not: 'CANCELLED' }, createdAt: { gte: prevGte, lt } },
      select: {
        totalAmount: true,
        createdAt: true,
        status: true,
        // ต้นทุนสินค้า — จำเป็นต่อ "กำไรสุทธิ" ให้ได้สูตรเดียวกับการ์ด P&L ใน /expenses
        // (ถ้าใช้ ยอดยืนยันแล้ว − ค่าใช้จ่าย เฉย ๆ ตัวเลขจะไม่ตรงกับอีกสองหน้า)
        ...(includeFinance ? { items: { select: { cost: true, qty: true } } } : {}),
      },
    }),
    includeFinance
      ? prisma.expense.findMany({
          where: { shopId, expenseDate: { gte: expGte, lt: expLt } },
          select: { amount: true, expenseDate: true },
        })
      : Promise.resolve([]),
  ])

  const values = new Array<number>(bucketCount).fill(0)
  const confirmedValues = new Array<number>(bucketCount).fill(0)
  const unconfirmedValues = new Array<number>(bucketCount).fill(0)
  const cogsValues = new Array<number>(bucketCount).fill(0)
  const expenseValues = new Array<number>(bucketCount).fill(0)
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
        if (r.status === 'CONFIRMED') {
          confirmedValues[idx] += amt
          const items = (r as { items?: { cost: unknown; qty: number }[] }).items
          for (const item of items ?? []) {
            // cost = null คือ "ยังไม่ตั้งต้นทุน" ไม่ใช่ "ต้นทุน 0" — ข้ามไป
            if (item.cost == null) continue
            cogsValues[idx] += Number(item.cost) * item.qty
          }
        } else unconfirmedValues[idx] += amt
      }
      total += amt
    } else if (created >= prevGte && created < gte) {
      prevTotal += amt
    }
  }

  const base = { labels, values, confirmedValues, unconfirmedValues, total, prevTotal, futureFromIndex }
  if (!includeFinance) return base

  for (const e of expenseRows) {
    // expenseDate เก็บที่ UTC midnight ของวันตามปฏิทินอยู่แล้ว — อ่าน bucket ตรง ๆ ไม่ต้อง shift
    const idx = bucketOf(e.expenseDate instanceof Date ? e.expenseDate : new Date(e.expenseDate))
    if (idx >= 0 && idx < bucketCount) expenseValues[idx] += Number(e.amount)
  }

  const netProfitValues = confirmedValues.map((v, i) => v - cogsValues[i] - expenseValues[i])

  return {
    ...base,
    expenseValues,
    netProfitValues,
    totalExpense: expenseValues.reduce((s, v) => s + v, 0),
    netProfit: netProfitValues.reduce((s, v) => s + v, 0),
  }
}
