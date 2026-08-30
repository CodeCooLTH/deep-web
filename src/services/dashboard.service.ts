/**
 * dashboard.service.ts — aggregate ข้อมูล command center ที่ต้อง query ข้ามช่วงเวลา
 *
 * getSalesSeries — ยอดขายต่อวัน/เดือน สำหรับ Sales Chart (การ์ด mini + full sheet)
 *   ยอด = sum Order.totalAmount ของ order ที่ status != CANCELLED, group by createdAt (tz ไทย)
 *   ไม่มี migration — อ่าน Order เดิม.
 */

import { prisma } from '@/lib/prisma'
import { TZ_OFFSET_MS } from '@/lib/date-range'
import { countsAsRevenue } from '@/lib/order-revenue'
import { deriveShippingStage } from '@/lib/order-stage'
import { canonicalProvince, isKnownProvince } from '@/lib/parse-order-message'

// เดือนไทยแบบย่อ — label แกน x โหมดรายเดือน
const THAI_MONTHS_ABBR = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

export type SalesSeriesMode = 'daily' | 'monthly'

/**
 * แปลงแถวออเดอร์ที่ query มาเป็น input ของ deriveShippingStage — "พัสดุที่นับ" ต้องเป็นใบ
 * active ล่าสุด (status='CREATED', ไม่ใช่ dry-run ตาม BR-ISHIP-60/61) เหมือน getShippingStageCounts
 * เป๊ะ ๆ ไม่งั้นเงิน COD ที่ชีตบอกกับไทล์หน้าแรกจะนับคนละใบ
 *
 * กรอง/เรียงที่นี่แทนที่จะทำใน query เพราะ query เดียวกันนี้ป้อน countsAsRevenue ด้วย
 * ซึ่งต้องเห็นพัสดุครบทุกใบ (มันเช็ค .some() เอง) — take:1 ใน query จะเปลี่ยนนิยามยอดขายไปเงียบ ๆ
 */
type StageRow = {
  status: string
  /** feature 00062 — `deriveShippingStage()` ต้องใช้ตัดสินก่อนทุกกิ่ง (ออเดอร์นัดรับไม่มีพัสดุ) */
  fulfillmentMode: string
  paymentMethod?: string | null
  codReceivedAt?: Date | string | null
  shipments?: { status: string; isDryRun: boolean; carrierStatus: string | null; createdAt: Date }[] | null
}
const toShippingStageInput = (r: StageRow) => {
  const active = (r.shipments ?? [])
    .filter((s) => s.status === 'CREATED' && !s.isDryRun)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return {
    status: r.status,
    carrierStatus: active[0]?.carrierStatus ?? null,
    hasShipment: active.length > 0,
    paymentMethod: r.paymentMethod ?? null,
    codReceivedAt: r.codReceivedAt ?? null,
    fulfillmentMode: r.fulfillmentMode,
  }
}

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
  /**
   * ยอดเงินของออเดอร์ที่ยังอยู่กอง "รอเงิน COD" ต่อ bucket (บาท) — user สั่ง 2026-08-07
   *
   * นิยามผูกกับ `deriveShippingStage(...) === 'AWAITING_COD'` ตัวเดียวกับไทล์บน Command Center
   * และชิปกรองในหน้า /orders (user เลือกเอง 2026-08-07) — ห้ามเขียนเงื่อนไข COD ใหม่ที่นี่
   * ไม่งั้นตัวเลขบนชีตยอดขายกับไทล์หน้าแรกจะพูดคนละเรื่องเรื่องเงินก้อนเดียวกัน
   *
   * เป็น "ส่วนย่อยของยอดขายวันนั้น" ไม่ใช่ก้อนใหม่: ใบ COD ที่ส่งถึงแล้วนับเป็นยอดขายไปแล้ว
   * (countsAsRevenue) คอลัมน์นี้ตอบว่าเงินก้อนไหนในยอดนั้นยังไม่เข้ามือร้าน
   */
  codPendingValues: number[]
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
   * ยอดขายราย **วัน** ของ 14 วันล่าสุดนับถึงวันนี้ (index 13 = วันนี้) — ข้ามเดือนได้
   * มีเฉพาะเมื่อกำลังดู "เดือนปัจจุบันแบบรายวัน" เท่านั้น (ช่วงอื่น "14 วันล่าสุด" ไม่มีความหมาย)
   *
   * ไม่ต้อง query เพิ่ม: คิวรีเดิมครอบ prevGte..lt (2 เดือน) อยู่แล้ว ต้นเดือนจึงดึงวันของเดือนก่อนได้
   * — 13 วันย้อนหลังจากวันที่ 1 ยังตกอยู่ในเดือนก่อนเสมอ (เดือนสั้นสุด 28 วัน) ไม่มีทางหลุดกรอบคิวรี
   *
   * แยก 2 ก้อนตามนิยาม countsAsRevenue เดียวกับกราฟเดือน เพื่อให้แท่งซ้อนได้ —
   * ยอดรวมของวันหนึ่ง = confirmed[i] + unconfirmed[i] (เดิมเก็บเป็นก้อนเดียวจึงซ้อนไม่ได้)
   */
  last14Confirmed?: number[]
  last14Unconfirmed?: number[]
  /** label ของ 14 วันล่าสุด — "24 ก.ค." เมื่อขึ้นเดือนใหม่/ตัวแรก, "25" สำหรับวันถัดไปในเดือนเดียวกัน */
  last14Labels?: string[]
  /* ── ค่าส่ง (feature 00016 ส่วนขยาย 2026-08-09) — มีเฉพาะเมื่อ caller ส่ง includeFinance=true
        คือผ่าน gate สิทธิ์แล้ว undefined ทั้งชุด = ไม่มีสิทธิ์ดู UI ต้องซ่อนทั้งบล็อก ไม่ใช่แสดง ฿0
        🛑 **ไม่ใช่ค่าใช้จ่ายที่ร้านบันทึกเองในหน้า /expenses** — ชุดนี้คือค่าส่งที่ขนส่งคิดจริง
        (`OrderShipment.carrierPrice` + `codFee`) เท่านั้น ────────────────────────────────────── */
  /** ค่าส่งจริง+ค่าธรรมเนียม COD ต่อ bucket (บาท) — คู่กับ `values` (ทุกใบ) */
  shippingValues?: number[]

  receivedValues?: number[]
  /**
   * ยอดขายของใบที่ **ไม่มีบันทึกการรับเงินเลยสักรายการ** ต่อ bucket
   *
   * 🛑 มีไว้แยก "รู้ว่าค้าง" ออกจาก **"ไม่รู้"** — ใบที่ไม่เคยบันทึกรับเงิน ระบบไม่มีทางรู้ว่า
   * เก็บเงินไปแล้วหรือยัง (ร้านอาจเก็บสดแล้วไม่ได้กดบันทึก) การเอายอดนั้นไปแสดงเป็น "ค้างรับ"
   * สีเตือน = **ยืนยันสิ่งที่ไม่รู้** ซึ่งอ่านได้ว่า "ลูกค้ายังไม่จ่าย" ทั้งที่อาจจ่ายแล้ว
   * (`partial-data-must-be-labeled-or-filled.md` — ตัวเลขบางส่วนที่หน้าตาเหมือนตัวเลขที่ครบแล้ว
   * อันตรายกว่าไม่มีตัวเลข)
   *
   * เคสจริง 2026-08-23 (ร้าน BT Premium): ใบวันที่ 1 ส.ค. สถานะ `CONFIRMED` (งานจบแล้ว)
   * แต่ไม่มีแถว `OrderPayment` เลย ⇒ ตารางขึ้น "ค้างรับ ฿300" สีส้มทั้งที่งานปิดไปแล้ว
   */
  unrecordedValues?: number[]
  /**
   * นับ "งาน" ตามสถานะ — ทั้งช่วง (ไม่ใช่รายช่อง) · เฉพาะร้าน SERVICE_QUEUE
   *
   * 🛑 **รวมใบที่ยกเลิกด้วย** ต่างจากทุกตัวเลขอื่นในไฟล์นี้ที่ตัด `CANCELLED` ทิ้งตั้งแต่ query
   * — งานที่ยกเลิกคือสิ่งที่ร้านบริการต้องเห็น (เดือน ส.ค. 2569 ร้านตัวอย่างยกเลิก 2 จาก 10
   * แล้วไม่มีทางรู้จากหน้านี้เลย) การซ่อนมันคือการรายงานเดือนที่ดูดีกว่าความจริง
   *
   * 4 กลุ่ม **ไม่ทับกันและบวกกันได้ `total` พอดี** — เรียงตามความเด็ดขาดของสถานะ:
   *   ยกเลิก (ชนะทุกอย่าง) → เสร็จแล้ว → ไม่มาตามนัด → ที่เหลือคือยังไม่ถึงคิว
   * ⇒ ใบที่ `CANCELLED` + `appointmentStatus='COMPLETED'` นับเป็น **ยกเลิก** อย่างเดียว
   * (มีจริงบนฐาน: `CANCELLED/CONFIRMED_BY_BUYER` และ `CANCELLED/SCHEDULED`)
   */
  jobStatusCounts?: {
    total: number
    completed: number
    noShow: number
    cancelled: number
    /** ที่เหลือ — นัดไว้/กำลังทำ/ยังไม่ถึงคิว (รวมใบที่ไม่มี appointmentStatus) */
    upcoming: number
  }
  /**
   * 🛑 ต้นทุนสินค้า (COGS) มี **สองชุด** ในไฟล์นี้ และ **จะไม่มีวันเท่ากัน** — วางติดกันตาม HR16
   * ทั้งคู่ถูกต้องในตัวเอง ต่างกันแค่ "นับต้นทุนของออเดอร์ชุดไหน" ซึ่งต้องเลือกให้ตรงกับ
   * ตัวตั้งที่เอาไปลบ ไม่งั้นหน้าจอจะโชว์สมการที่ลบตามด้วยมือแล้วไม่ลงตัว:
   *
   *   cogsValues          = ต้นทุนของ **ทุกออเดอร์ใน bucket** → คู่กับ `values` (ยอดขายทั้งหมด)
   *   cogsConfirmedValues = ต้นทุนเฉพาะใบที่นับเป็นรายได้แล้ว → คู่กับ `confirmedValues`
   *
   * ชีต "ยอดขายและกำไร" ใช้ตัวแรก เพราะคอลัมน์ที่มันลบออกคือ "ยอดขาย" ซึ่งรวมใบรอยืนยัน
   * (user เคาะ 2026-08-08: กำไร = ยอดขาย − (ต้นทุนสินค้า + ค่าใช้จ่าย))
   * การ์ด P&L / netProfitValues ใช้ตัวหลัง เพราะมันลบออกจาก "ยอดที่ยืนยันแล้ว" — สูตรเดียวกับ /expenses
   *
   * cost = null คือ "ยังไม่ตั้งต้นทุน" ทั้งสองชุดจึง **ข้าม** ไม่ใช่นับเป็น 0 → ตัวเลขที่ได้เป็น
   * "ต้นทุนเท่าที่รู้" กำไรที่คำนวณจากมันจึงเป็น **เพดานบน** เสมอ (นิยามเดียวกับ src/lib/order-profit.ts)
   */
  cogsValues?: number[]
  /** ต้นทุนสินค้ารวมทั้งช่วง (ชุดทุกออเดอร์ — คู่กับ `total`) */
  totalCogs?: number
  /** ต้นทุนสินค้าเฉพาะใบที่นับเป็นรายได้แล้ว ต่อ bucket — คู่กับ `confirmedValues` (ดูบล็อกบน) */
  cogsConfirmedValues?: number[]
  /** กำไรต่อ bucket = ยอดที่ยืนยันแล้ว − ต้นทุนสินค้า(เฉพาะใบที่ยืนยัน) − ค่าส่ง(เฉพาะใบที่ยืนยัน)
   *  🛑 ไม่หักค่าใช้จ่ายอื่นของร้าน จึง **ไม่เท่ากับ** กำไรสุทธิที่หน้า /expenses (SALES_PROFIT_FORMULA) */
  netProfitValues?: number[]
  /** ค่าส่งรวมทั้งช่วง (คู่กับ `total`) */
  totalShipping?: number
  /**
   * จำนวนพัสดุต่อ bucket ที่ **ยังไม่ถูกขนส่งคิดเงิน** (ขนส่งยังไม่เข้ารับ → `carrierPrice` ยัง null)
   *
   * 🛑 มีไว้เพื่อบอกว่าตัวเลขค่าส่งของ bucket นั้น **ยังไม่ครบ** — ไม่มีตัวนี้ หน้าจอจะแสดงยอด
   * บางส่วนอย่างเงียบ ๆ แล้วผู้ขายอ่านว่า "ค่าส่งวันนั้นถูกจัง" (เคสจริง 2026-08-10: วันที่ 9
   * มี 31 ออเดอร์ แต่มีราคาแค่ 7 ใบ จอขึ้น ฿328.88 ทั้งที่ของจริงน่าจะราว ฿1,100+)
   */
  pendingShipmentValues?: number[]
  /** จำนวนพัสดุทั้งช่วงที่ยังไม่ถูกคิดเงิน — > 0 = ตัวเลขค่าส่ง/กำไรทั้งหน้าเป็นเพดานบน */
  pendingShipmentCount?: number
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
  /** ประเภทกิจการของร้าน — `'SERVICE_QUEUE'` เท่านั้นที่ได้คอลัมน์เงินรับจริงรายวัน
   *  ไม่ส่งมา = ไม่คิดชุดนั้นเลย (ไม่เสีย query ให้ร้านที่ไม่ได้ใช้) */
  vertical?: string,
): Promise<SalesSeries> {
  /** ร้านบริการไหม — ตัวเดียวที่เปิดคอลัมน์เงินรับจริง (ไม่ใช่ร้านบริการ = ไม่เสีย query ให้เลย) */
  const isServiceShop = vertical === 'SERVICE_QUEUE'

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
  const [rows, jobStatusRows] = await Promise.all([
    prisma.order.findMany({
      where: { shopId, status: { not: 'CANCELLED' }, createdAt: { gte: prevGte, lt } },
      select: {
        totalAmount: true,
        createdAt: true,
        status: true,
        // ไทล์ "รอเงิน COD" ต้องรู้ว่าใบนี้เก็บเงินปลายทางไหม และร้านกดว่าได้เงินแล้วหรือยัง
        // (ชุดเดียวกับที่ getShippingStageCounts ส่งเข้า deriveShippingStage — ขาดช่องใดช่องหนึ่ง
        //  แล้วตัวเลขบนชีตกับไทล์หน้าแรกจะไม่ตรงกันทั้งที่เรียกฟังก์ชันเดียวกัน)
        paymentMethod: true,
        codReceivedAt: true,
        // feature 00062 — ออเดอร์นัดรับ/ไม่มีการส่งของ ต้องไม่ถูกนับเป็น "รอเงิน COD"
        fulfillmentMode: true,
        // ต้องรู้ว่าขนส่งรับของไปแล้วหรือยัง — เกณฑ์ "นับเป็นยอดขาย" ไม่ได้ดูแค่ status
        // (SSOT: lib/order-revenue.ts) select แคบ ๆ ไม่ให้ payload บวม
        // createdAt: ใช้หา "พัสดุ active ใบล่าสุด" ให้ deriveShippingStage — ที่นี่กรอง/เรียงใน TS
        // ไม่ใช่ใน query เพราะ countsAsRevenue ต้องเห็นพัสดุทุกใบ (มันเช็ค .some() เอง)
        shipments: {
          // carrierPrice/codFee = ต้นทุนค่าส่งจริงที่ขนส่งคิด (D-EXT-10, 2026-08-09) — ชีตยอดขาย
          // ใช้เป็นก้อน "ค่าส่ง" ที่หักออกจากกำไร  null = ขนส่งยังไม่เข้ารับ iShip จึงยังไม่คิดเงิน
          // **ไม่ใช่ ฿0** (0 จะอ่านว่าส่งฟรีแล้วกำไรสูงเกินจริงเงียบ ๆ)
          select: {
            status: true,
            isDryRun: true,
            // countsAsRevenue() บังคับ field นี้ (feature 00056) — พัสดุขากลับไม่ใช่ยอดขาย
            direction: true,
            carrierStatus: true,
            createdAt: true,
            carrierPrice: true,
            estimatedPrice: true,
            codFee: true,
          },
        },
        // ต้นทุนสินค้า — จำเป็นต่อ "กำไรสุทธิ" ให้ได้สูตรเดียวกับการ์ด P&L ใน /expenses
        // (ถ้าใช้ ยอดยืนยันแล้ว − ค่าใช้จ่าย เฉย ๆ ตัวเลขจะไม่ตรงกับอีกสองหน้า)
        ...(includeFinance ? { items: { select: { cost: true, qty: true } } } : {}),
        /**
         * เงินที่รับจริงของใบนี้ — เฉพาะร้านบริการ
         *
         * 🛑 ดึงมาใน query **เดียวกับออเดอร์** ไม่ใช่ query แยกที่ group ด้วย `receivedAt`
         * เพราะคอลัมน์นี้ต้องลงแถวตาม *วันที่ขาย* ให้ตรงกับ `values` (ดูเหตุผลเต็มที่ประกาศ
         * type) — query แยกจะได้ชุดออเดอร์คนละชุดและคนละแกนเวลาโดยไม่มีอะไรฟ้อง
         *
         * `voidedAt: null` = ตัดรายการที่ร้านกดยกเลิกเพราะกรอกผิด (ประวัติยังอยู่ แต่ไม่ใช่เงิน)
         *
         * หมายเหตุ: `where` ของ query นี้กินช่วงก่อนหน้าด้วย (`prevGte`) เพื่อคิด %เทียบ ⇒ payments
         * ของออเดอร์ช่วงก่อนหน้าถูกดึงมาด้วยแต่ไม่ถูกนับ (ลูปข้างล่างสะสมเฉพาะในช่วงปัจจุบัน)
         * — ไม่ใช่บั๊ก และตัดออกไม่ได้เพราะ Prisma กรอง relation รายแถวไม่ได้
         */
        ...(isServiceShop
          ? { payments: { where: { voidedAt: null }, select: { amount: true } } }
          : {}),
      },
    }),
    /**
     * นับงานตามสถานะ — เฉพาะร้านบริการ
     *
     * 🛑 **ต้องเป็น query แยก** ไม่ใช่เอาจาก `rows` ข้างบน เพราะ `rows` ตัด `CANCELLED` ทิ้ง
     * ตั้งแต่ `where` และการไปแก้ `where` นั้นจะเปลี่ยนตัวเลขทุกตัวในหน้า (ยอดขาย/กราฟ/ตาราง)
     * ซึ่งเสี่ยงกว่ามากเมื่อเทียบกับ aggregate เล็ก ๆ ตัวหนึ่ง
     *
     * perf: อยู่ใน `Promise.all` **ก้อนเดิม** ⇒ ขนานกับ query หลัก **ไม่เพิ่ม wall time**
     * และเป็น `groupBy` (ฐานข้อมูลนับให้) ไม่ดึงแถวมานับในแอป · ช่วงแคบ (≤1 เดือน/1 ปี)
     * และ where ขึ้นต้นด้วย `shopId` ตรงกับ index ที่มีอยู่
     */
    isServiceShop
      ? prisma.order.groupBy({
          by: ['status', 'appointmentStatus'],
          where: { shopId, createdAt: { gte, lt } },
          _count: { _all: true },
        })
      : Promise.resolve(null),
  ])

  const values = new Array<number>(bucketCount).fill(0)
  const confirmedValues = new Array<number>(bucketCount).fill(0)
  const unconfirmedValues = new Array<number>(bucketCount).fill(0)
  const orderCounts = new Array<number>(bucketCount).fill(0)
  const codPendingValues = new Array<number>(bucketCount).fill(0)
  const cogsValues = new Array<number>(bucketCount).fill(0)
  const cogsConfirmedValues = new Array<number>(bucketCount).fill(0)
  /** ค่าส่งจริง+ค่าธรรมเนียม COD ต่อ bucket — คู่กับ `values` (ทุกใบ) เหมือน cogsValues */
  const shippingValues = new Array<number>(bucketCount).fill(0)
  /** ชุดเฉพาะใบที่นับเป็นยอดขายแล้ว — คู่กับ `confirmedValues` เหมือน cogsConfirmedValues */
  const shippingConfirmedValues = new Array<number>(bucketCount).fill(0)
  /** พัสดุที่ยังไม่ถูกคิดเงินต่อ bucket — ทำให้ยอดค่าส่งของ bucket นั้นเป็นแค่บางส่วน */
  const pendingShipmentValues = new Array<number>(bucketCount).fill(0)
  /* เงินรับจริงของร้านบริการ — คู่กับ `values` (นับทุกใบที่ไม่ถูกยกเลิก) ไม่ใช่คู่กับ
     `confirmedValues` เพราะร้านเก็บมัดจำตั้งแต่ก่อนงานจบ ตัวหารกับตัวตั้งต้องเป็นชุดเดียวกัน */
  const receivedValues = isServiceShop ? new Array<number>(bucketCount).fill(0) : undefined
  /* ยอดขายของใบที่ไม่มีบันทึกรับเงินเลย — ตัวแยก "ค้างจริง" ออกจาก "ไม่รู้" (ดูประกาศ type) */
  const unrecordedValues = isServiceShop ? new Array<number>(bucketCount).fill(0) : undefined
  let total = 0
  let prevTotal = 0
  let prevTotalToDate = 0

  /**
   * 14 วันล่าสุด — เตรียมขอบเขตเป็น "UTC instant ของเที่ยงคืนไทย" เพื่อให้หาร 86400000 ได้ตรง ๆ
   * (tz ไทยเป็น offset คงที่ ไม่มี DST ขอบวันจึงห่างกัน 24 ชม.เป๊ะเสมอ)
   * มีเฉพาะตอนดูเดือนปัจจุบันแบบรายวัน — ช่วงอื่น "14 วันล่าสุด" เทียบกับอะไรไม่ได้
   */
  const isCurrentDaily =
    mode === 'daily' && period.year === nowYear && (period.month ?? 1) - 1 === nowMonth0
  const DAY_MS = 24 * 60 * 60 * 1000
  const RECENT_DAYS = 14
  const todayStartMs = isCurrentDaily
    ? Date.UTC(nowYear, nowMonth0, thaiNow.getUTCDate()) - TZ_OFFSET_MS
    : 0
  const recentStartMs = todayStartMs - (RECENT_DAYS - 1) * DAY_MS
  const last14Confirmed = isCurrentDaily ? new Array<number>(RECENT_DAYS).fill(0) : undefined
  const last14Unconfirmed = isCurrentDaily ? new Array<number>(RECENT_DAYS).fill(0) : undefined

  for (const r of rows) {
    const amt = Number(r.totalAmount) // Prisma Decimal → number
    const created = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)

    // นับแยกจากบล็อกช่วงปัจจุบัน/ก่อนหน้าด้านล่าง เพราะหน้าต่าง 14 วันคาบเกี่ยวสองเดือนได้
    if (last14Confirmed && last14Unconfirmed) {
      const off = Math.floor((created.getTime() - recentStartMs) / DAY_MS)
      // ใช้ countsAsRevenue ตัวเดียวกับกราฟเดือน — ถ้าแยกนิยามกัน สองกราฟบนการ์ดใบเดียวกัน
      // จะบอกว่าออเดอร์เดียวกันอยู่คนละก้อน
      if (off >= 0 && off < RECENT_DAYS) {
        if (countsAsRevenue(r)) last14Confirmed[off] += amt
        else last14Unconfirmed[off] += amt
      }
    }

    if (created >= gte && created < lt) {
      const shifted = new Date(created.getTime() + TZ_OFFSET_MS)
      const idx = bucketOf(shifted)
      if (idx >= 0 && idx < bucketCount) {
        values[idx] += amt
        orderCounts[idx] += 1

        if (receivedValues && unrecordedValues) {
          const payments = (r as { payments?: { amount: unknown }[] }).payments
          /* 🛑 นับจาก **จำนวนแถวที่ยังไม่ถูกยกเลิก** (query กรอง `voidedAt: null` มาแล้ว)
             ไม่ใช่จากยอดรวมเป็น 0 — ใบที่บันทึกรับ ฿0 ไว้จริง (เช่นแถมให้) คือ "รู้ว่าไม่มีเงินเข้า"
             ซึ่งคนละความหมายกับ "ไม่เคยบันทึก" ที่แปลว่าไม่รู้ */
          if ((payments?.length ?? 0) === 0) unrecordedValues[idx] += amt
          for (const p of payments ?? []) {
            const paid = Number(p.amount)
            receivedValues[idx] += paid
          }
        }
        /**
         * ต้นทุนของใบนี้ — คิดครั้งเดียวแล้วลงทั้งสองชุด (ดูบล็อก "COGS มีสองชุด" ที่ประกาศ type)
         * ต้องอยู่ **นอก** if ของ countsAsRevenue: `cogsValues` คู่กับ `values` ซึ่งนับทุกใบ
         * ถ้าเก็บเฉพาะใบที่ยืนยัน คอลัมน์ "ต้นทุนสินค้า" บนชีตจะว่างในวันที่ยังไม่มีใครยืนยัน
         * ทั้งที่คอลัมน์ "ยอดขาย" บรรทัดเดียวกันมีตัวเลข → กำไรของแถวนั้นจะสูงเกินจริง
         */
        const items = (r as { items?: { cost: unknown; qty: number }[] }).items
        let rowCogs = 0
        for (const item of items ?? []) {
          // cost = null คือ "ยังไม่ตั้งต้นทุน" ไม่ใช่ "ต้นทุน 0" — ข้ามไป
          if (item.cost == null) continue
          rowCogs += Number(item.cost) * item.qty
        }
        cogsValues[idx] += rowCogs

        /**
         * ค่าส่งจริง + ค่าธรรมเนียมเก็บเงินปลายทางของใบนี้ (D-EXT-10, 2026-08-09)
         *
         * อยู่ **นอก** if ของ countsAsRevenue ด้วยเหตุผลเดียวกับ COGS เป๊ะ: `shippingValues` คู่กับ
         * `values` ซึ่งนับทุกใบ ถ้าเก็บเฉพาะใบที่ยืนยัน คอลัมน์ "ค่าส่ง" บนชีตจะว่างในวันที่ยังไม่มี
         * ใครยืนยัน ทั้งที่คอลัมน์ "ยอดขาย" บรรทัดเดียวกันมีตัวเลข → กำไรของแถวนั้นสูงเกินจริง
         *
         * `carrierPrice == null` = ยังไม่ถูกคิดเงิน (ขนส่งยังไม่เข้ารับ) ข้ามไป ไม่ใช่บวก 0
         */
        const activeShipment = (
          r as {
            shipments?: {
              status: string
              isDryRun: boolean
              carrierPrice: unknown
              estimatedPrice: unknown
              codFee: unknown
            }[]
          }
        ).shipments?.find((sp) => sp.status === 'CREATED' && !sp.isDryRun)
        let rowShipping = 0
        if (activeShipment) {
          /**
           * ลำดับความน่าเชื่อถือ: ราคาจริง → ราคาประมาณตอนสร้าง → ไม่มีเลย
           *
           * iShip ไม่เปิดราคาจริงจนกว่าขนส่งจะเข้ารับและชั่ง (ใบ status=1 คืน discount_price=0)
           * ระหว่างนั้นใช้ค่าประมาณไปก่อนดีกว่าปล่อยว่าง — แต่ **ต้องนับว่ายังไม่ใช่ตัวจริง**
           * (`pendingShipmentValues`) เพราะค่าประมาณคิดจากน้ำหนักที่ร้านแจ้ง ซึ่งมักน้อยกว่า
           * ที่ชั่งได้จริง (92/151 ใบ) ตัวเลขจึงเป็นเพดานล่าง ไม่ใช่คำตอบสุดท้าย
           *
           * `codFee` บวกได้เสมอไม่ว่าราคาส่งจะมาหรือยัง — iShip คิดจาก % ของยอด COD จึงรู้
           * ตั้งแต่วินาทีที่สร้างพัสดุ (ยืนยัน 2026-08-10: ใบ status=1 มี cod_fee=12.63 แล้ว)
           */
          const price = activeShipment.carrierPrice ?? activeShipment.estimatedPrice
          if (price != null) rowShipping += Number(price)
          rowShipping += Number(activeShipment.codFee ?? 0)
          shippingValues[idx] += rowShipping
          if (activeShipment.carrierPrice == null) pendingShipmentValues[idx] += 1
        }

        // แยกยอดที่ "นับเป็นยอดขายแล้ว" (ผู้ซื้อยืนยัน หรือขนส่งรับของไปแล้ว) ออกจากที่ยังไม่นับ
        if (countsAsRevenue(r)) {
          confirmedValues[idx] += amt
          cogsConfirmedValues[idx] += rowCogs
          shippingConfirmedValues[idx] += rowShipping
        } else unconfirmedValues[idx] += amt

        // "รอเงิน COD" ของวันนั้น — ยอดเต็มของใบที่ยังอยู่กองนี้ (ไม่ใช่ codAmount ของพัสดุ
        // เพราะใบที่ร้านแจ้งเลขเองไม่มีแถว OrderShipment ให้อ่าน แต่ก็ยังเป็นเงินที่รอเก็บอยู่ดี)
        if (deriveShippingStage(toShippingStageInput(r)) === 'AWAITING_COD') {
          codPendingValues[idx] += amt
        }
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

  /** label ของ 14 วันล่าสุด — ใส่ชื่อเดือนเฉพาะตัวแรกกับวันที่ข้ามเดือน (ที่เหลือรกโดยไม่ได้ข้อมูลเพิ่ม) */
  const last14Labels = last14Confirmed
    ? Array.from({ length: RECENT_DAYS }, (_, i) => {
        const d = new Date(recentStartMs + i * DAY_MS + TZ_OFFSET_MS)
        const day = d.getUTCDate()
        return i === 0 || day === 1 ? `${day} ${THAI_MONTHS_ABBR[d.getUTCMonth()]}` : String(day)
      })
    : undefined

  /**
   * 🛑 `depositValues`/`receivedValues` อยู่ใน `base` **ไม่ได้อยู่หลังด่าน `includeFinance`**
   * โดยตั้งใจ — `includeFinance` เป็นสิทธิ์ของ "ต้นทุน/ค่าใช้จ่าย" (Business Package)
   * ส่วนเงินที่ร้านรับมาเองเป็นข้อมูลของร้านที่เห็นได้อยู่แล้วทุกที่ (หน้าออเดอร์/คิวงาน)
   * เอาไปผูกกับแพ็กเกจ = ซ่อนเงินของตัวเองจากเจ้าของเงิน
   */
  /**
   * แปลงผล groupBy เป็น 4 กลุ่มที่ไม่ทับกัน — ลำดับการตัดสินสำคัญ (ดูประกาศ `jobStatusCounts`)
   * ยกเลิกชนะทุกอย่าง เพราะงานที่ยกเลิกแล้วไม่ใช่ "งานที่เสร็จ" ต่อให้เคยติดธง COMPLETED ไว้
   */
  const jobStatusCounts = jobStatusRows
    ? jobStatusRows.reduce(
        (acc, r) => {
          const n = r._count._all
          acc.total += n
          if (r.status === 'CANCELLED') acc.cancelled += n
          else if (r.appointmentStatus === 'COMPLETED') acc.completed += n
          else if (r.appointmentStatus === 'NO_SHOW') acc.noShow += n
          else acc.upcoming += n
          return acc
        },
        { total: 0, completed: 0, noShow: 0, cancelled: 0, upcoming: 0 },
      )
    : undefined

  const base = {
    labels, values, confirmedValues, unconfirmedValues, orderCounts, codPendingValues,
    total, prevTotal, prevTotalToDate, futureFromIndex,
    ...(last14Confirmed && last14Unconfirmed
      ? { last14Confirmed, last14Unconfirmed, last14Labels }
      : {}),
    ...(receivedValues && unrecordedValues ? { receivedValues, unrecordedValues } : {}),
    ...(jobStatusCounts ? { jobStatusCounts } : {}),
  }
  if (!includeFinance) return base

  /**
   * 🛑 ไม่นับค่าใช้จ่ายที่ร้านบันทึกเองในหน้า /expenses แล้ว (มติ user 2026-08-09)
   * ชีตนี้เหลือ **ยอดขาย − (ต้นทุนสินค้า + ค่าส่ง)** ค่าใช้จ่ายอื่นของร้านยังอยู่ที่หน้า /expenses
   * ดูเหตุผลที่สองหน้าไม่เท่ากันใน SALES_PROFIT_FORMULA (src/lib/format-money.ts)
   */
  const netProfitValues = confirmedValues.map(
    (v, i) => v - cogsConfirmedValues[i] - shippingConfirmedValues[i],
  )

  return {
    ...base,
    shippingValues,
    pendingShipmentValues,
    netProfitValues,
    cogsValues,
    cogsConfirmedValues,
    totalCogs: cogsValues.reduce((s, v) => s + v, 0),
    totalShipping: shippingValues.reduce((s, v) => s + v, 0),
    pendingShipmentCount: pendingShipmentValues.reduce((s, v) => s + v, 0),
    netProfit: netProfitValues.reduce((s, v) => s + v, 0),
  }
}

// ─── การ์ดเดสก์ท็อป: ช่องทางการขาย + ยอดขายตามจังหวัด ─────────────────────────
// ทั้งสองตัวคิดจาก "เดือนตามปฏิทินไทย" ชุดเดียวกับ getSalesSeries(mode='daily')
// — user เคาะ 2026-08-05 ว่าทุกการ์ดบนแดชบอร์ดต้องพูดถึงช่วงเวลาเดียวกัน

/** ขอบเขต [gte, lt) ตามปฏิทินไทยของ period — ใช้ร่วมกันทั้งสองฟังก์ชันด้านล่าง
 *  มี `day` = ขอบเขต 1 วัน (filter "วันนี้" บนแดชบอร์ดเดสก์ท็อป) · ไม่มี = ทั้งเดือนตามเดิม */
function thaiMonthRange(period: { year: number; month: number; day?: number }) {
  const month0 = period.month - 1
  if (period.day != null) {
    const gte = new Date(Date.UTC(period.year, month0, period.day) - TZ_OFFSET_MS)
    return { gte, lt: new Date(gte.getTime() + 24 * 60 * 60 * 1000) }
  }
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
  period: { year: number; month: number; day?: number },
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
  period: { year: number; month: number; day?: number },
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
      // direction: countsAsRevenue() บังคับ (feature 00056) — พัสดุขากลับไม่ใช่ยอดขาย
      shipments: { select: { status: true, isDryRun: true, carrierStatus: true, direction: true } },
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
