/**
 * product-sales-month — SSOT ของรายงาน "ยอดขายรายสินค้า" (feature 00063)
 *
 * ทุกอย่างในไฟล์นี้เป็น **ฟังก์ชันบริสุทธิ์** ไม่มี prisma ไม่มี React — เพื่อให้เกณฑ์ที่ตัดสิน
 * ว่าหน้าจอจะพูดอะไร (ป้าย "ขายกระจุก"/"เงียบมาแล้ว N วัน") มีที่ให้เทสจับได้จริง
 * (docs/conventions/ui-boolean-needs-a-testable-home.md — เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม"
 * แต่คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม")
 *
 * 🛑 นิยาม "ขายแล้ว" ของรายงานนี้ = OrderItem ของ Order ที่ `status != 'CANCELLED'`
 * ซึ่งเป็นชุดเดียวกับ `getBestSellerProducts()` (product.service.ts) **ไม่ใช่**
 * `revenueOrderWhere` ที่หน้า /sales และ /expenses ใช้ — เหตุผลอยู่ที่ SALES_BASIS_NOTE
 * ข้างล่าง และต้องถูกแสดงบนหน้าจอเสมอ ไม่ใช่แค่คอมเมนต์ (HR16)
 */

/** คีย์ของแถวรวม "รายการที่พิมพ์เอง" — OrderItem ที่ productId เป็น null ทุกใบตกมารวมที่นี่ */
export const CUSTOM_ITEM_KEY = '__custom__'

/** ชื่อที่แสดงของแถวรวมข้างบน — ห้ามพิมพ์สตริงนี้ซ้ำที่อื่น (HR16) */
export const CUSTOM_ITEM_LABEL = 'รายการที่พิมพ์เอง'

/**
 * คำอธิบายของแถวรวม — 🛑 ต้องแสดงให้ **เห็นได้จริง** ทุก surface ไม่ใช่ซ่อนใน `title=`
 *
 * ป้าย "รายการที่พิมพ์เอง" บอกน้อยกว่าความจริง เพราะแถวนี้รวมสินค้าที่ถูกลบไปแล้วและของจาก
 * การประมูลอยู่ด้วย และ `title=` ไม่ใช่ตัวแทน — มือถือไม่มี hover
 * (docs/conventions/aria-name-requires-supporting-role.md)
 */
export const CUSTOM_ITEM_NOTE =
  'รวมของที่พิมพ์ชื่อเองในแชท ของจากการประมูล และสินค้าที่ลบไปแล้ว — แยกออกจากกันไม่ได้'

/**
 * 🛑 ประโยคนิยาม "ขายแล้ว" ที่ต้องโผล่ใต้กราฟเสมอ
 *
 * ทำไมต้องมี: ระบบนี้มีนิยาม "ยอดขาย" อยู่ 3 ชุดที่ใช้งานจริงพร้อมกันโดยตั้งใจ
 * (`revenueOrderWhere` ของ P&L · `status != CANCELLED` ของสินค้าขายดี · CONFIRMED-only
 * ของหน้าร้านสาธารณะ) — ตัวเลขสองหน้าที่ไม่ตรงกันโดยไม่มีคำอธิบาย คือสิ่งที่ทำให้ผู้ขาย
 * เลิกเชื่อตัวเลขทั้งระบบ ไม่ใช่แค่หน้าเดียว
 */
export const SALES_BASIS_NOTE = 'นับทุกออเดอร์ที่ยังไม่ถูกยกเลิก ไม่ต้องรอลูกค้ายืนยัน'

/**
 * รายละเอียดของนิยามข้างบน — ซ่อนไว้หลังปุ่มขยาย ไม่ใช่กองไว้บนจอ
 *
 * 🛑 แก้ 2026-08-29 หลัง `/impeccable clarify`: ฉบับแรกเขียนว่า "เกณฑ์เดียวกับ *สั่งซื้อแล้ว*
 * ในหน้าสินค้า" ซึ่ง **ผิด** — หน้า `/products` ใช้คำว่า "ขายแล้ว" และนับจาก
 * `status === 'CONFIRMED'` ล้วน (`products/page.tsx:82`) คนละเกณฑ์กับรายงานนี้คนละเรื่อง
 * ผู้ขายที่ทำตามคำแนะนำไปเทียบจะเจอเลขไม่ตรง ซึ่งคือหายนะที่ประโยคนี้ถูกเขียนมาเพื่อกัน
 * ที่ใช้เกณฑ์เดียวกันจริงคือบล็อก "สินค้าขายดี" บนหน้าภาพรวมร้านค้า (`getBestSellerProducts()`
 * → `PRODUCT_VOCAB.soldLine` = "สั่งซื้อแล้ว N ชิ้น")
 * และ `/sales` ก็ไม่ได้นับแค่ "ยืนยันแล้ว" — `revenueOrderWhere` รับ SHIPPED ที่ขนส่งรับของแล้วด้วย
 */
export const SALES_BASIS_DETAIL =
  'เกณฑ์เดียวกับ "สินค้าขายดี" ในหน้าภาพรวมร้านค้า ตัวเลขจึงสูงกว่าหน้า "ภาพรวมกำไร/ขาดทุน" ซึ่งนับเฉพาะใบที่ยืนยันแล้วหรือส่งถึงมือลูกค้าแล้ว'

/**
 * 🛑 คำเตือนของโหมดบาท — ต้องแสดงเมื่อ unit=baht เท่านั้น
 *
 * `Order.discount` และ `Order.vatAmount` เก็บที่ **ระดับออเดอร์** ไม่มีรายบรรทัดสินค้า
 * (`OrderItem` ไม่มีคอลัมน์ทั้งสอง) ⇒ ยอดรายสินค้าบวกกันแล้วจะไม่เท่ากับ `Order.totalAmount`
 * ทางแก้ที่ "ดูถูกต้องกว่า" คือเฉลี่ยส่วนลด/VAT ลงรายบรรทัด — แต่นั่นคือการสร้างนิยาม
 * "ยอดขาย" ชุดที่ 4 ขึ้นมาในระบบ และเป็นตัวเลขที่อธิบายที่มาให้ผู้ขายไม่ได้เลย
 */
export const MONEY_MODE_CAVEAT =
  'ยอดในโหมดนี้คิดจากจำนวน × ราคาต่อชิ้น ยังไม่หักส่วนลดและยังไม่รวม VAT ที่คิดระดับทั้งออเดอร์ — ตัวเลขจึงไม่เท่ากับหน้า "ภาพรวมกำไร/ขาดทุน"'

/**
 * เพดานจำนวนเส้นบนกราฟ = จำนวนโทเคนสีที่ธีมมีให้จริง
 *
 * 🛑 ผูกกับ CHART_COLOR_TOKENS ข้างล่างเสมอ — เพิ่มเพดานโดยไม่มีโทเคนรองรับ แปลว่า
 * ต้อง hardcode hex ซึ่งขัด HR7/HR10 ทันที
 */
export const CHART_SERIES_CAP = 6

/**
 * โทเคนสีของเส้นกราฟ — ส่งเข้า `getColor()` เท่านั้น ห้าม hardcode hex (HR10)
 *
 * ธีมมี 7 โทเคนเชิงหมวดหมู่ แต่ตัดใช้ 6 โดยข้าม `chart-gamma` (#f9bf59 เหลืองอำพัน)
 * เพราะอ่านเป็น "สถานะเตือน" ปนกับ badge warning ในตารางเดียวกัน — `AgentTrendChart.tsx`
 * ข้ามตัวนี้ด้วยเหตุผลเดียวกันอยู่แล้ว
 */
export const CHART_COLOR_TOKENS = [
  'chart-primary',
  'chart-secondary',
  'chart-alpha',
  'chart-beta',
  'chart-delta',
  'chart-zeta',
] as const

/** จำนวนครั้งขั้นต่ำที่ยอมให้ติดป้ายสรุปได้ — ต่ำกว่านี้คือเดา ไม่ใช่สรุป */
export const MIN_EVENTS_FOR_PATTERN = 3

/** จำนวนวันที่เงียบติดกันก่อนจะเรียกว่า "เงียบมาแล้ว" */
export const DORMANT_DAY_THRESHOLD = 14

/** จำนวนวันสูงสุดที่ยอดกระจุกได้ก่อนเรียกว่า "ขายกระจุก" */
export const CONCENTRATED_TOP_DAYS = 3

export type SalesPattern =
  | { kind: 'NONE' }
  | { kind: 'CONCENTRATED' }
  | { kind: 'STEADY' }
  /** `toMonthEnd` = นับถึง "สิ้นเดือนที่ดู" ไม่ใช่ "วันนี้" — เดือนย้อนหลังต้องเป็น true */
  | { kind: 'DORMANT'; days: number; toMonthEnd?: boolean }

/**
 * classifySalesPattern — ป้ายสรุปของสินค้าหนึ่งตัวในเดือนหนึ่ง
 *
 * ลำดับการตัดสิน (user เคาะ 2026-08-29 + ขยายผลตามหลักการเดียวกัน):
 *   1. **DORMANT** — เงียบติดกัน ≥14 วันนับถึงวันอ้างอิง ชนะทุกป้าย
 *      เหตุผล: ป้ายมีไว้ "ชี้สิ่งที่ควรไปดูต่อ" ของที่เงียบมาสองสัปดาห์คือสิ่งนั้น และมันไม่ใช่
 *      "ขายสม่ำเสมอ" อยู่แล้วโดยนิยาม ส่วนการเรียกมันว่า "ขายกระจุก" จะกลบข้อเท็จจริง
 *      ที่ actionable กว่าไว้ข้างหลังคำที่บรรยายรูปร่างเฉย ๆ
 *   2. **CONCENTRATED** — ยอดเกินครึ่งกระจุกอยู่ใน ≤3 วัน (ชนะ STEADY ตามที่ user เคาะ)
 *   3. **STEADY** — มียอดเกินครึ่งของจำนวนวันในเดือน
 *   4. **NONE** — ไม่เข้าเกณฑ์ไหน
 *
 * 🛑 ขายได้น้อยกว่า MIN_EVENTS_FOR_PATTERN ครั้ง = ไม่ติดป้ายเลย ไม่ว่ารูปร่างจะเป็นยังไง
 * ข้อมูล 1-2 ครั้งบอกจังหวะการขายไม่ได้ การติดป้ายคือคำที่ฟังดูมั่นใจโดยไม่มีอะไรรองรับ
 *
 * @param dailyQty  ยอดรายวันเรียงตามวันที่ 1..n (index 0 = วันที่ 1) ความยาว = จำนวนวันในเดือน
 * @param saleEvents จำนวน "ครั้ง" ที่ขายได้ = จำนวนบรรทัดรายการสินค้าในเดือนนั้น
 * @param referenceDayIndex วันอ้างอิงสำหรับนับความเงียบ (0-based) — เดือนปัจจุบันคือ "วันนี้",
 *        เดือนที่ผ่านไปแล้วคือวันสุดท้ายของเดือน
 */
export function classifySalesPattern(
  dailyQty: readonly number[],
  saleEvents: number,
  referenceDayIndex: number,
  /**
   * true = วันอ้างอิงคือสิ้นเดือนที่กำลังดู (เดือนที่ผ่านไปแล้ว) ไม่ใช่ "วันนี้"
   * มีผลกับ *คำ* เท่านั้น ไม่มีผลกับการตัดสิน — ค่าตั้งต้น false เพื่อไม่ให้ผู้เรียกเดิมเปลี่ยนพฤติกรรม
   */
  refIsMonthEnd = false,
): SalesPattern {
  if (saleEvents < MIN_EVENTS_FOR_PATTERN) return { kind: 'NONE' }

  const total = dailyQty.reduce((sum, v) => sum + v, 0)
  if (total <= 0) return { kind: 'NONE' }

  const activeDayIndexes: number[] = []
  for (let i = 0; i < dailyQty.length; i++) {
    if (dailyQty[i] > 0) activeDayIndexes.push(i)
  }
  if (activeDayIndexes.length === 0) return { kind: 'NONE' }

  const lastActive = activeDayIndexes[activeDayIndexes.length - 1]
  const silentDays = referenceDayIndex - lastActive
  if (silentDays >= DORMANT_DAY_THRESHOLD)
    return { kind: 'DORMANT', days: silentDays, toMonthEnd: refIsMonthEnd }

  const topDaysSum = [...dailyQty]
    .sort((a, b) => b - a)
    .slice(0, CONCENTRATED_TOP_DAYS)
    .reduce((sum, v) => sum + v, 0)
  // "เกินครึ่ง" = มากกว่า 50% จริง ๆ ไม่ใช่ ≥ (สินค้าที่ขายวันเว้นวันพอดีจะได้ 50% เป๊ะ
  // ซึ่งไม่ควรอ่านว่า "กระจุก")
  if (topDaysSum > total / 2) return { kind: 'CONCENTRATED' }

  if (activeDayIndexes.length > dailyQty.length / 2) return { kind: 'STEADY' }

  return { kind: 'NONE' }
}

/** ข้อความไทยของป้าย — SSOT ของ *คำ* ห้ามพิมพ์ซ้ำที่ component (HR16) */
export function salesPatternLabel(p: SalesPattern): string | null {
  switch (p.kind) {
    case 'CONCENTRATED':
      return 'ขายกระจุก'
    case 'STEADY':
      return 'ขายสม่ำเสมอ'
    case 'DORMANT':
      // 🛑 เดือนย้อนหลังต้องไม่พูดว่า "มาแล้ว" — ผู้อ่านจะเข้าใจว่านับถึงวันนี้ ทั้งที่นับถึงสิ้นเดือนนั้น
      // (สินค้าที่ขายครั้งสุดท้าย 11 มิ.ย. 2568 จะถูกป้ายว่า "เงียบมาแล้ว 19 วัน" ซึ่งอ่านผิดสนิท)
      return p.toMonthEnd ? `เงียบ ${p.days} วันท้ายเดือน` : `เงียบมาแล้ว ${p.days} วัน`
    case 'NONE':
      return null
  }
}

/** คำอธิบายยาวของป้าย — ใช้ใน title/tooltip และในชีตมือถือ */
export function salesPatternDescription(p: SalesPattern): string | null {
  switch (p.kind) {
    case 'CONCENTRATED':
      return `ยอดเกินครึ่งของเดือนกระจุกอยู่ใน ${CONCENTRATED_TOP_DAYS} วัน`
    case 'STEADY':
      return 'มียอดขายเกินครึ่งของจำนวนวันในเดือน'
    case 'DORMANT':
      return p.toMonthEnd
        ? `ไม่มียอดขายใน ${p.days} วันสุดท้ายของเดือนที่ดูอยู่`
        : `ไม่มียอดขายมาแล้ว ${p.days} วันนับถึงวันนี้`
    case 'NONE':
      return null
  }
}

/* ────────────────────────── เดือนและช่วงเวลา ────────────────────────── */

export type MonthSelection = {
  /** ค.ศ. */
  year: number
  /** 0-based เหมือน Date.getMonth() */
  month0: number
  /** `YYYY-MM` สำหรับใส่กลับใน URL */
  iso: string
  /** true = ค่าที่ส่งมาใช้ไม่ได้/เกินขอบ แล้วถูกดึงกลับ */
  clamped: boolean
}

/** เดือนแรกสุดที่ยอมให้เลือก — ก่อนหน้านี้ไม่มีข้อมูลในระบบแน่นอน */
export const MIN_MONTH_ISO = '2024-01'

/**
 * เพดานบน = เดือนถัดจากเดือนปัจจุบัน 1 เดือน
 * เพราะผู้ขายคีย์วันที่ล่วงหน้าได้ 7 วัน (order-date-window) ⇒ ปลายเดือนจะมีออเดอร์
 * ที่ตกไปอยู่เดือนถัดไปได้จริง การล็อกไว้แค่เดือนปัจจุบันจะทำให้ข้อมูลนั้นดูไม่ได้เลย
 */
export function maxSelectableMonth(now: Date): { year: number; month0: number } {
  const t = new Date(now.getTime() + TZ_OFFSET_MS_LOCAL)
  const y = t.getUTCFullYear()
  const m = t.getUTCMonth()
  return m === 11 ? { year: y + 1, month0: 0 } : { year: y, month0: m + 1 }
}

/** สำเนาเฉพาะกิจของ offset เวลาไทย — ไฟล์นี้ต้องไม่ import อะไรเลยเพื่อให้เทสเบา */
const TZ_OFFSET_MS_LOCAL = 7 * 60 * 60 * 1000

function monthIso(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}`
}

/**
 * parseMonthParam — แปลง `?month=YYYY-MM` เป็นเดือนที่ใช้ได้จริง
 *
 * ค่าที่ผิดรูป/เกินขอบ **ไม่ throw และไม่ 404** — ดึงกลับมาที่เดือนปัจจุบันแล้วติดธง `clamped`
 * ให้หน้าจอบอกผู้ใช้ได้ (ลิงก์เก่าที่ถูกแชร์ต่อกันไม่ควรพาไปหน้าพัง)
 */
export function parseMonthParam(raw: string | undefined | null, now: Date): MonthSelection {
  const nowThai = new Date(now.getTime() + TZ_OFFSET_MS_LOCAL)
  const current = { year: nowThai.getUTCFullYear(), month0: nowThai.getUTCMonth() }

  if (!raw) {
    return { ...current, iso: monthIso(current.year, current.month0), clamped: false }
  }

  const m = /^(\d{4})-(\d{2})$/.exec(raw.trim())
  if (!m) {
    return { ...current, iso: monthIso(current.year, current.month0), clamped: true }
  }

  const year = Number(m[1])
  const month0 = Number(m[2]) - 1
  if (!Number.isInteger(year) || month0 < 0 || month0 > 11) {
    return { ...current, iso: monthIso(current.year, current.month0), clamped: true }
  }

  const max = maxSelectableMonth(now)
  const [minY, minM] = MIN_MONTH_ISO.split('-').map(Number)
  const asNum = year * 12 + month0
  if (asNum < minY * 12 + (minM - 1) || asNum > max.year * 12 + max.month0) {
    return { ...current, iso: monthIso(current.year, current.month0), clamped: true }
  }

  return { year, month0, iso: monthIso(year, month0), clamped: false }
}

/** จำนวนวันของเดือนนั้น (นับตามปฏิทิน ไม่ใช่ 31 ตายตัว) */
export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
}

/** เดือนก่อนหน้า/ถัดไปในรูป `YYYY-MM` — ใช้ทำ href ของปุ่ม ‹ › */
export function shiftMonthIso(iso: string, delta: number): string {
  const [y, m] = iso.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return monthIso(Math.floor(total / 12), ((total % 12) + 12) % 12)
}

/** เดือนนี้เป็นเดือนปัจจุบัน (เวลาไทย) หรือไม่ — ใช้ตัดสินว่าต้องเทาวันอนาคตไหม */
export function isCurrentThaiMonth(year: number, month0: number, now: Date): boolean {
  const t = new Date(now.getTime() + TZ_OFFSET_MS_LOCAL)
  return t.getUTCFullYear() === year && t.getUTCMonth() === month0
}

/**
 * futureFromDayIndex — วันแรก (0-based) ที่ "ยังไม่ถึง" ของเดือนที่กำลังดู
 *
 * 🛑 คืน `null` เมื่อเดือนนั้นจบไปแล้ว — ไม่ใช่คืนความยาวเดือน เพราะสองอย่างนี้ต้องทำให้
 * หน้าจอทำคนละเรื่อง (เดือนที่จบแล้วไม่ควรมีแถบเทาอะไรเลย)
 *
 * เดือนอนาคตทั้งเดือน → 0 (เทาทั้งแถบ)
 */
export function futureFromDayIndex(year: number, month0: number, now: Date): number | null {
  const t = new Date(now.getTime() + TZ_OFFSET_MS_LOCAL)
  const nowNum = t.getUTCFullYear() * 12 + t.getUTCMonth()
  const selNum = year * 12 + month0
  if (selNum < nowNum) return null
  if (selNum > nowNum) return 0
  // เดือนปัจจุบัน: วันนี้ยังนับว่า "ถึงแล้ว" (ข้อมูลของวันนี้กำลังทยอยเข้า)
  return t.getUTCDate()
}

/**
 * referenceDayIndex — วันอ้างอิงสำหรับนับ "เงียบมาแล้วกี่วัน"
 *
 * เดือนปัจจุบัน = วันนี้ · เดือนที่ผ่านไปแล้ว = วันสุดท้ายของเดือน · เดือนอนาคต = วันแรก
 * (ถ้าใช้วันสุดท้ายของเดือนกับเดือนปัจจุบันเสมอ สินค้าที่ขายเมื่อวานจะถูกป้ายว่าเงียบ 20 วัน)
 */
export function referenceDayIndex(year: number, month0: number, now: Date): number {
  const future = futureFromDayIndex(year, month0, now)
  if (future === null) return daysInMonth(year, month0) - 1
  return Math.max(0, future - 1)
}

/* ────────────────────────── การเข้ารหัสแบบย่อ ────────────────────────── */

/**
 * อนุกรมรายวันแบบย่อ: `[dayIndex0based, value][]` เก็บเฉพาะวันที่มียอดจริง
 *
 * ทำไมต้องส่งอนุกรมของสินค้า **ทุกตัว** ลง client: เพื่อให้ติ๊กสลับเส้นบนกราฟและสวิตช์
 * "แสดงสินค้าที่ไม่มียอดขาย" ทำงานได้ทันทีโดยไม่ยิง API (มติข้อ 5 — ไม่มี endpoint ใหม่)
 *
 * 🛑 **ตัวเลขที่วัดจริง 2026-08-29 ไม่ใช่ที่ประมาณไว้ตอนออกแบบ** — ตอนเสนอผมบอกว่า
 * "เล็กลงหลายเท่า" ซึ่งผิด ของจริงคือ:
 *   สินค้า 300 ตัว ขายได้จริง 25 ตัว × 6 วัน → ย่อ 122 KB · เต็ม 156 KB (ประหยัด 22%)
 *   สินค้า 300 ตัว ขายได้ทุกตัว × 20 วัน   → ย่อ 223 KB · เต็ม 181 KB (**แย่กว่า 23%**)
 * จุดคุ้มทุนอยู่ที่ ~9 วันขายต่อสินค้าต่อเดือน เพราะคู่ `[12,7],` กินที่มากกว่า `0,` หลายเท่า
 *
 * เก็บวิธีย่อไว้เพราะข้อมูลจริงมีรูปร่างหางยาว (สินค้าส่วนใหญ่ในร้านไม่มียอดในเดือนใด
 * เดือนหนึ่ง → `[]` แทน array ศูนย์ 31 ตัว) **แต่มันไม่ใช่สิ่งที่ทำให้หน้านี้ไหว** —
 * ตัวเลขรวมอยู่ที่ 120–160 KB ทั้งสองแบบ ซึ่งต่ำกว่าหน้า `/sales` ที่ส่ง 500–800 KB
 * ทุกวันนี้อยู่แล้ว ⇒ ถ้าวันไหนวิธีย่อทำให้โค้ดยุ่งขึ้น เปลี่ยนกลับเป็น array เต็มได้เลย
 * โดยไม่ต้องกลัวเรื่องขนาด
 */
export type SparseSeries = [number, number][]

export function toSparse(dense: readonly number[]): SparseSeries {
  const out: SparseSeries = []
  for (let i = 0; i < dense.length; i++) {
    if (dense[i] !== 0) out.push([i, dense[i]])
  }
  return out
}

export function toDense(sparse: SparseSeries, length: number): number[] {
  const out = new Array<number>(length).fill(0)
  for (const [i, v] of sparse) {
    if (i >= 0 && i < length) out[i] = v
  }
  return out
}

/* ────────────────────────── ความเข้มของแถบรายวัน ────────────────────────── */

/**
 * dayIntensity — ระดับความเข้มของช่องในแถบ 31 ช่อง (0 = ไม่มียอด, 1..4 = อ่อน→เข้ม)
 *
 * แบ่งตามสัดส่วนของ "วันที่ขายดีที่สุดของสินค้าตัวนั้นเอง" ไม่ใช่เทียบข้ามสินค้า —
 * แถบนี้ตอบคำถาม "ตัวนี้ขายวันไหน" ซึ่งเป็นคำถามภายในสินค้าหนึ่งตัว การ normalize ข้ามสินค้า
 * จะทำให้สินค้าที่ขายน้อยกลายเป็นแถบเทาทั้งแถบ แล้วมองไม่ออกเลยว่าขายวันไหน
 */
export function dayIntensity(value: number, maxValue: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || maxValue <= 0) return 0
  const ratio = value / maxValue
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}
