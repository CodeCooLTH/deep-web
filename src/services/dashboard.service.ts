/**
 * dashboard.service.ts — aggregate ข้อมูล command center ที่ต้อง query ข้ามช่วงเวลา
 *
 * getSalesSeries — ยอดขายต่อวัน/เดือน สำหรับ Sales Chart (การ์ด mini + full sheet)
 *   ยอด = sum Order.totalAmount ของ order ที่ status != CANCELLED, group by createdAt (tz ไทย)
 *   ไม่มี migration — อ่าน Order เดิม.
 */

import { prisma } from '@/lib/prisma'
import { countsAsRevenue } from '@/lib/order-revenue'
import { canonicalProvince, isKnownProvince } from '@/lib/parse-order-message'

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
  /**
   * จำนวนคำสั่งซื้อต่อ bucket (ใบ) — เส้นบนกราฟการ์ดยอดขาย (user สั่ง 2026-08-05)
   *
   * ทำไมต้องมีแยกจาก values: แท่งบอก "เงิน" เส้นบอก "จำนวนครั้ง" — คนละหน่วยกัน
   * วันที่ยอดสูงเพราะขายได้หลายใบ กับวันที่ยอดสูงเพราะใบเดียวก้อนใหญ่ แยกออกจากกันไม่ได้เลย
   * ถ้าดูแต่ความสูงของแท่ง
   */
  orderCounts: number[]
  /** ยอดรวมทั้งช่วง */
  total: number
  /** ยอดรวมช่วงก่อนหน้า (เดือนก่อน / ปีก่อน) — ใช้คำนวณ %เทียบ */
  prevTotal: number
  /**
   * ยอดรวมช่วงก่อนหน้า **นับถึง bucket เดียวกับที่ช่วงปัจจุบันเดินมาถึง** — ตัวที่ควรใช้เทียบ %
   *
   * ทำไมต้องมี: `prevTotal` คือเดือนก่อน *ทั้งเดือน* แต่ `total` คือเดือนนี้ *เท่าที่ผ่านมา*
   * วันที่ 4 จึงเอา 4 วันไปหารด้วย 31 วัน ได้ ▼80%+ ทุกเดือนต้นเดือน ทั้งที่อาจขายดีกว่าเดิม
   * (บั๊กที่มีมาตลอด — ยังไม่เคยมีใครเห็นเพราะร้านที่เดือนก่อนยอด 0 จะถูกซ่อน % อยู่แล้ว)
   *
   * ช่วงที่จบไปแล้ว (ดูเดือนย้อนหลัง) → futureFromIndex = bucketCount → ค่านี้ = prevTotal พอดี
   */
  prevTotalToDate: number
  /** index ตั้งแต่นี้ไป = อนาคต (เกินวันนี้/เดือนนี้) → UI ทำแท่งจาง; = labels.length ถ้าช่วงเป็นอดีตทั้งหมด */
  futureFromIndex: number
  /**
   * ยอดขายราย **วัน** ของ 7 วันล่าสุดนับถึงวันนี้ (index 6 = วันนี้) — ข้ามเดือนได้
   * มีเฉพาะเมื่อกำลังดู "เดือนปัจจุบันแบบรายวัน" เท่านั้น (ช่วงอื่น "7 วันล่าสุด" ไม่มีความหมาย)
   *
   * ไม่ต้อง query เพิ่ม: คิวรีเดิมครอบ prevGte..lt (2 เดือน) อยู่แล้ว ต้นเดือนจึงดึงวันของเดือนก่อนได้
   */
  last7Days?: number[]
  /** label ของ last7Days — "29 ก.ค." เมื่อขึ้นเดือนใหม่/ตัวแรก, "30" สำหรับวันถัดไปในเดือนเดียวกัน */
  last7Labels?: string[]
  /* ── ค่าใช้จ่าย (feature 00016) — มีเฉพาะเมื่อ caller ส่ง includeFinance=true คือผ่าน gate สิทธิ์แล้ว
        undefined ทั้งชุด = ไม่มีสิทธิ์ดู UI ต้องซ่อนทั้งบล็อก ไม่ใช่แสดง ฿0 ────────────────────── */
  /** ค่าใช้จ่ายที่บันทึกต่อ bucket (บาท) */
  expenseValues?: number[]
  /** ต้นทุนสินค้าที่ขายได้ (COGS) ต่อ bucket — คำนวณอยู่แล้วในลูป เดิมแค่ไม่เคยส่งออกมา
   *  ชีตต้องใช้เพื่อให้ "ยืนยันแล้ว − เงินออก = กำไร" ลบกันได้จริงบนหน้าจอ (เงินออก = COGS + ค่าใช้จ่าย) */
  cogsValues?: number[]
  /** ต้นทุนสินค้ารวมทั้งช่วง */
  totalCogs?: number
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
        // ต้องรู้ว่าขนส่งรับของไปแล้วหรือยัง — เกณฑ์ "นับเป็นยอดขาย" ไม่ได้ดูแค่ status
        // (SSOT: lib/order-revenue.ts) select แคบ ๆ 3 คอลัมน์ ไม่ให้ payload บวม
        shipments: { select: { status: true, isDryRun: true, carrierStatus: true } },
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
  const orderCounts = new Array<number>(bucketCount).fill(0)
  const cogsValues = new Array<number>(bucketCount).fill(0)
  const expenseValues = new Array<number>(bucketCount).fill(0)
  let total = 0
  let prevTotal = 0
  let prevTotalToDate = 0

  /**
   * 7 วันล่าสุด — เตรียมขอบเขตเป็น "UTC instant ของเที่ยงคืนไทย" เพื่อให้หาร 86400000 ได้ตรง ๆ
   * (tz ไทยเป็น offset คงที่ ไม่มี DST ขอบวันจึงห่างกัน 24 ชม.เป๊ะเสมอ)
   * มีเฉพาะตอนดูเดือนปัจจุบันแบบรายวัน — ช่วงอื่น "7 วันล่าสุด" เทียบกับอะไรไม่ได้
   */
  const isCurrentDaily =
    mode === 'daily' && period.year === nowYear && (period.month ?? 1) - 1 === nowMonth0
  const DAY_MS = 24 * 60 * 60 * 1000
  const todayStartMs = isCurrentDaily
    ? Date.UTC(nowYear, nowMonth0, thaiNow.getUTCDate()) - TZ_OFFSET_MS
    : 0
  const sevenStartMs = todayStartMs - 6 * DAY_MS
  const last7Days = isCurrentDaily ? new Array<number>(7).fill(0) : undefined

  for (const r of rows) {
    const amt = Number(r.totalAmount) // Prisma Decimal → number
    const created = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)

    // นับแยกจากบล็อกช่วงปัจจุบัน/ก่อนหน้าด้านล่าง เพราะหน้าต่าง 7 วันคาบเกี่ยวสองเดือนได้
    if (last7Days) {
      const off = Math.floor((created.getTime() - sevenStartMs) / DAY_MS)
      if (off >= 0 && off < 7) last7Days[off] += amt
    }

    if (created >= gte && created < lt) {
      const shifted = new Date(created.getTime() + TZ_OFFSET_MS)
      const idx = bucketOf(shifted)
      if (idx >= 0 && idx < bucketCount) {
        values[idx] += amt
        orderCounts[idx] += 1
        // แยกยอดที่ "นับเป็นยอดขายแล้ว" (ผู้ซื้อยืนยัน หรือขนส่งรับของไปแล้ว) ออกจากที่ยังไม่นับ
        if (countsAsRevenue(r)) {
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
      /**
       * เทียบแบบวันต่อวัน: นับเฉพาะ bucket ที่ช่วงปัจจุบันเดินมาถึงแล้ว
       * `bucketOf` คืน index จาก "วันที่ในเดือน" (daily) หรือ "เดือนในปี" (monthly) โดยไม่สนว่าปี/เดือนไหน
       * จึงป้อน timestamp ของช่วงก่อนหน้าเข้าไปตรง ๆ ได้ ไม่ต้องเขียนตัวแปลงใหม่
       */
      const shiftedPrev = new Date(created.getTime() + TZ_OFFSET_MS)
      if (bucketOf(shiftedPrev) < futureFromIndex) prevTotalToDate += amt
    }
  }

  /** label ของ 7 วันล่าสุด — ใส่ชื่อเดือนเฉพาะตัวแรกกับวันที่ข้ามเดือน (ที่เหลือรกโดยไม่ได้ข้อมูลเพิ่ม) */
  const last7Labels = last7Days
    ? Array.from({ length: 7 }, (_, i) => {
        const d = new Date(sevenStartMs + i * DAY_MS + TZ_OFFSET_MS)
        const day = d.getUTCDate()
        return i === 0 || day === 1 ? `${day} ${THAI_MONTHS_ABBR[d.getUTCMonth()]}` : String(day)
      })
    : undefined

  const base = {
    labels, values, confirmedValues, unconfirmedValues, orderCounts,
    total, prevTotal, prevTotalToDate, futureFromIndex,
    ...(last7Days ? { last7Days, last7Labels } : {}),
  }
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
    cogsValues,
    totalCogs: cogsValues.reduce((s, v) => s + v, 0),
    totalExpense: expenseValues.reduce((s, v) => s + v, 0),
    netProfit: netProfitValues.reduce((s, v) => s + v, 0),
  }
}

// ─── การ์ดเดสก์ท็อป: ช่องทางการขาย + ยอดขายตามจังหวัด ─────────────────────────
// ทั้งสองตัวคิดจาก "เดือนตามปฏิทินไทย" ชุดเดียวกับ getSalesSeries(mode='daily')
// — user เคาะ 2026-08-05 ว่าทุกการ์ดบนแดชบอร์ดต้องพูดถึงช่วงเวลาเดียวกัน

/** ขอบเขตเดือนไทย [gte, lt) ของ period — ใช้ร่วมกันทั้งสองฟังก์ชันด้านล่าง */
function thaiMonthRange(period: { year: number; month: number }) {
  const month0 = period.month - 1
  return { gte: thaiMonthStartUtc(period.year, month0), lt: thaiMonthStartUtc(period.year, month0 + 1) }
}

export interface SalesChannelSlice {
  /** ค่าดิบของ Order.salesChannel — ฝั่ง UI แปลงเป็นชื่อ/โลโก้ด้วย getSalesChannelDisplay() */
  channel: string
  orderCount: number
}

/**
 * สัดส่วนออเดอร์ต่อช่องทางการขายในเดือนที่ระบุ (มาก→น้อย)
 *
 * นับ "ใบ" ไม่ใช่ "เงิน" เพราะการ์ดตอบคำถาม "ลูกค้ามาจากทางไหน" — ออเดอร์ก้อนใหญ่ใบเดียว
 * ไม่ควรทำให้ช่องทางนั้นดูเป็นแหล่งลูกค้าหลัก
 *
 * ออเดอร์ที่ salesChannel เป็น null (สร้างก่อนมีฟิลด์นี้ / ไม่ได้เลือก) นับรวมเป็น OTHER
 * ไม่ใช่ทิ้ง — ไม่งั้นผลรวมบนโดนัทจะไม่เท่ากับจำนวนออเดอร์จริงของเดือนนั้น
 */
export async function getSalesChannelBreakdown(
  shopId: string,
  period: { year: number; month: number },
): Promise<SalesChannelSlice[]> {
  const { gte, lt } = thaiMonthRange(period)
  const rows = await prisma.order.groupBy({
    by: ['salesChannel'],
    where: { shopId, status: { not: 'CANCELLED' }, createdAt: { gte, lt } },
    _count: { _all: true },
  })

  const merged = new Map<string, number>()
  for (const r of rows) {
    const key = r.salesChannel ?? 'OTHER'
    merged.set(key, (merged.get(key) ?? 0) + r._count._all)
  }

  return Array.from(merged, ([channel, orderCount]) => ({ channel, orderCount })).sort(
    (a, b) => b.orderCount - a.orderCount,
  )
}

export interface ProvinceSalesRow {
  /** ชื่อจังหวัดสะกดตามชุดข้อมูล iShip — ตรงกับ properties.name ใน public/data/thailand-provinces.json */
  province: string
  orderCount: number
  revenue: number
}

export interface ProvinceSales {
  /** เรียงรายได้มาก→น้อย */
  rows: ProvinceSalesRow[]
  /** รายได้รวมของออเดอร์ "ที่มีการจัดส่ง" เท่านั้น — ไม่ใช่รายได้รวมทั้งร้าน (ดู doc ของฟังก์ชัน) */
  shippedRevenue: number
  /** จำนวนจังหวัดที่มีออเดอร์อย่างน้อย 1 ใบ */
  provinceCount: number
  /** ออเดอร์จัดส่งที่ยังไม่รู้จังหวัด (ที่อยู่ว่าง/สะกดไม่ตรงชุดข้อมูล) — ต้องบอกผู้ใช้ ห้ามกลืนหาย */
  unknownCount: number
}

/**
 * ยอดขายรายจังหวัดของเดือนที่ระบุ สำหรับการ์ดแผนที่บนแดชบอร์ด
 *
 * [ขอบเขตที่ user เคาะ 2026-08-05]
 * - นับเฉพาะออเดอร์ที่ "มีการจัดส่ง" — ตัด salesChannel = STOREFRONT ออกทั้งหมด เพราะขายหน้าร้าน
 *   ไม่มีที่อยู่ผู้รับโดยธรรมชาติ ถ้าเอามารวมมันจะไปกองอยู่ในถัง "ไม่ระบุจังหวัด" แล้วอ่านเหมือน
 *   ร้านกรอกที่อยู่ไม่ครบ ทั้งที่ไม่มีอะไรผิด
 * - รายได้ใช้เกณฑ์เดียวกับการ์ดอื่น (countsAsRevenue) ห้ามเขียนเกณฑ์ซ้ำเอง — SSOT lib/order-revenue.ts
 * - ใบที่ยังไม่นับเป็นยอดขายยัง "นับหัว" ในจำนวนออเดอร์ของจังหวัดอยู่ (ของส่งไปแล้วจริง)
 *
 * ทำไม aggregate ใน JS: Order.shippingAddress เป็นคอลัมน์ Json — groupBy ตรง ๆ ไม่ได้ และช่วงข้อมูล
 * แค่เดือนเดียวของร้านเดียว จึงถูกกว่าการทำ generated column/ดัชนีเพิ่ม
 */
export async function getProvinceSales(
  shopId: string,
  period: { year: number; month: number },
): Promise<ProvinceSales> {
  const { gte, lt } = thaiMonthRange(period)
  const rows = await prisma.order.findMany({
    where: {
      shopId,
      status: { not: 'CANCELLED' },
      createdAt: { gte, lt },
      // ขายหน้าร้านไม่เข้าแผนที่ (ดู doc ด้านบน) — ครอบ null ด้วย เพราะ `not` ใน Prisma
      // ไม่ match แถวที่เป็น null เอง ต้องเขียน OR ให้ชัด
      OR: [{ salesChannel: null }, { salesChannel: { not: 'STOREFRONT' } }],
    },
    select: {
      totalAmount: true,
      shippingAddress: true,
      status: true,
      shipments: { select: { status: true, isDryRun: true, carrierStatus: true } },
    },
  })

  const acc = new Map<string, ProvinceSalesRow>()
  let unknownCount = 0
  let shippedRevenue = 0

  for (const o of rows) {
    const addr = o.shippingAddress as { province?: unknown } | null
    const raw = canonicalProvince(typeof addr?.province === 'string' ? addr.province : undefined)
    // สะกดไม่ตรงชุดข้อมูล = จับคู่กับแผนที่ไม่ได้ → ตีเป็น "ไม่ระบุ" ตั้งแต่ต้นทาง
    const province = isKnownProvince(raw) ? raw : undefined
    const revenue = countsAsRevenue(o) ? Number(o.totalAmount) : 0
    shippedRevenue += revenue

    if (!province) {
      unknownCount += 1
      continue
    }
    const cur = acc.get(province)
    if (cur) {
      cur.orderCount += 1
      cur.revenue += revenue
    } else {
      acc.set(province, { province, orderCount: 1, revenue })
    }
  }

  return {
    rows: Array.from(acc.values()).sort((a, b) => b.revenue - a.revenue || b.orderCount - a.orderCount),
    shippedRevenue,
    provinceCount: acc.size,
    unknownCount,
  }
}
