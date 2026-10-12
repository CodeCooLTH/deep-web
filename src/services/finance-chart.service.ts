/**
 * กราฟการเงิน 3 แท็บของร้านบริการ — ชุดตัวเลขรายช่อง (feature 00073 เฟส B · FR-011)
 *
 * ช่วงที่รองรับ (ReportRange): MONTH = รายวันของเดือน · M3/M6/M12 = รายเดือนย้อนหลังนับถึงเดือนที่เลือก
 * · YEAR = รายเดือนของปี
 *
 * 🛑 ไม่มีนิยามเงินใหม่ในไฟล์นี้ (HR16) — ยอดขาย/รับแล้ว/ต้นทุน/ค่าส่ง มาจาก `getSalesSeries`
 * ตัวเดียวกับชีตการเงินและการ์ดหน้าแรก (งานที่ร้านปิดแล้ว ตามวันปิดงาน) · ช่วงรายเดือนที่ข้ามปี
 * ต่อจากชุดรายเดือนของสองปีแล้วตัด ไม่ได้คิดเอง · ค่าใช้จ่ายร้าน = ตาราง Expense ตามวันที่บันทึก
 * + ค่าส่งขาไป + ค่าส่งขากลับของใบคืนที่รับแล้ว — ชุดเดียวกับ `getPnlReport` ของร้านบริการ
 * ⇒ ผลรวมทั้งช่วงต้องเท่ากับแท็บกำไรขาดทุนเสมอ (มีเทส parity)
 *
 * ร้านบริการเท่านั้น — ผู้เรียก (route) กั้นด้วย usesServiceFinanceRules ก่อน
 */
import { prisma } from '@/lib/prisma'
import { TZ_OFFSET_MS } from '@/lib/date-range'
import { THAI_MONTHS_ABBR, toBuddhistYear } from '@/lib/format-date'
import { RETURN_STATUS, sumReturnShippingCost } from '@/lib/order-return'
import { round2 } from '@/lib/round2'
import type { ReportRange } from '@/lib/report-settings'
import { getSalesSeries, type SalesSeries } from '@/services/dashboard.service'

export interface FinanceChartBucket {
  label: string
  /** ยอดขาย = งานที่ร้านปิดแล้ว (ไม่มาตามนัด = มัดจำที่เก็บ) */
  sales: number
  /** รับเงินแล้ว (ส่วนของยอดขายช่องนี้) */
  received: number
  /** ค้างรับ = ยอดขาย − รับแล้ว (ไม่ติดลบ) */
  outstanding: number
  /** ส่วนของค้างรับที่ "ไม่เคยบันทึกรับเงินเลย" — ไม่รู้ ไม่ใช่ค้างแน่ (ดู SalesSeries.unrecordedValues) */
  unrecorded: number
  /** 00073 FR-016 — งานที่ยังไม่ปิด ตามวันเปิดบิล (SalesSeries.unclosedValues) · **ไม่ใช่ยอดขาย ไม่อยู่ใน sales** */
  unclosed: number
  jobs: number
  /** ต้นทุนอะไหล่ของงานที่ปิดในช่องนี้ */
  cost: number
  /** ค่าใช้จ่ายร้าน (บันทึกเอง + ค่าส่งขาไป + ค่าส่งขากลับใบคืน) */
  expense: number
}

export interface FinanceChartData {
  range: ReportRange
  /** ปี/เดือนที่ยึด (เดือน 1-12) — ช่วงรายเดือนนับย้อนจากเดือนนี้ */
  anchor: { year: number; month: number }
  /** ป้ายช่วง เช่น "ต.ค. 2569" · "พ.ค.–ต.ค. 2569" · "ปี 2569" */
  rangeLabel: string
  buckets: FinanceChartBucket[]
  /** index ตั้งแต่นี้ = อนาคต (UI ทำจาง) */
  futureFromIndex: number
  totals: Omit<FinanceChartBucket, 'label'>
  hasMissingCost: boolean
  /** เลื่อนไปช่วงถัดไปได้ไหม (ช่วงปัจจุบัน = ไม่ได้) */
  isCurrent: boolean
}

const MONTHS_OF: Record<Exclude<ReportRange, 'MONTH' | 'YEAR'>, number> = { M3: 3, M6: 6, M12: 12 }
const beYear = (y: number) => toBuddhistYear(y)
const DAY_MS = 24 * 60 * 60 * 1000

function thaiNowParts(now = new Date()) {
  const t = new Date(now.getTime() + TZ_OFFSET_MS)
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 }
}

/** แปลงค่าที่ผู้ใช้ส่งมาให้อยู่ในกรอบ — ไม่เกินเดือน/ปีปัจจุบัน (อนาคตไม่มีข้อมูล) */
export function clampAnchor(anchor: { year?: number; month?: number }, now = new Date()) {
  const cur = thaiNowParts(now)
  let year = Number.isInteger(anchor.year) ? (anchor.year as number) : cur.year
  let month = Number.isInteger(anchor.month) ? (anchor.month as number) : cur.month
  if (month < 1 || month > 12) month = cur.month
  if (year < 2020) year = 2020
  if (year > cur.year || (year === cur.year && month > cur.month)) {
    year = cur.year
    month = cur.month
  }
  return { year, month }
}

/** ช่องรายเดือนจาก series รายเดือน (12 ช่องของปี) — เดือน 1-12 */
type MonthSlot = { year: number; month: number }

function monthSlots(range: ReportRange, anchor: { year: number; month: number }): MonthSlot[] {
  if (range === 'YEAR') return Array.from({ length: 12 }, (_, i) => ({ year: anchor.year, month: i + 1 }))
  const n = MONTHS_OF[range as keyof typeof MONTHS_OF]
  return Array.from({ length: n }, (_, i) => {
    const idx = anchor.year * 12 + (anchor.month - 1) - (n - 1 - i)
    return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
  })
}

/** ขอบเขต instant ของ [เริ่มช่องแรก, หลังช่องสุดท้าย) ตามปฏิทินไทย — ทั้งแบบ timestamptz และแบบ date-only (Expense) */
function windowOf(range: ReportRange, anchor: { year: number; month: number }) {
  if (range === 'MONTH') {
    return {
      orderGte: new Date(Date.UTC(anchor.year, anchor.month - 1, 1) - TZ_OFFSET_MS),
      orderLt: new Date(Date.UTC(anchor.year, anchor.month, 1) - TZ_OFFSET_MS),
      dateGte: new Date(Date.UTC(anchor.year, anchor.month - 1, 1)),
      dateLt: new Date(Date.UTC(anchor.year, anchor.month, 1)),
    }
  }
  const slots = monthSlots(range, anchor)
  const first = slots[0]
  const last = slots[slots.length - 1]
  return {
    orderGte: new Date(Date.UTC(first.year, first.month - 1, 1) - TZ_OFFSET_MS),
    orderLt: new Date(Date.UTC(last.year, last.month, 1) - TZ_OFFSET_MS),
    dateGte: new Date(Date.UTC(first.year, first.month - 1, 1)),
    dateLt: new Date(Date.UTC(last.year, last.month, 1)),
  }
}

export function rangeLabelOf(range: ReportRange, anchor: { year: number; month: number }): string {
  if (range === 'MONTH') return `${THAI_MONTHS_ABBR[anchor.month - 1]} ${beYear(anchor.year)}`
  if (range === 'YEAR') return `ปี ${beYear(anchor.year)}`
  const slots = monthSlots(range, anchor)
  const a = slots[0]
  const b = slots[slots.length - 1]
  return a.year === b.year
    ? `${THAI_MONTHS_ABBR[a.month - 1]}–${THAI_MONTHS_ABBR[b.month - 1]} ${beYear(b.year)}`
    : `${THAI_MONTHS_ABBR[a.month - 1]} ${beYear(a.year)}–${THAI_MONTHS_ABBR[b.month - 1]} ${beYear(b.year)}`
}

/** เลื่อนช่วงทั้งช่วง (ปุ่ม ‹ ›) — MONTH/M3/M6/M12 เลื่อนทีละขนาดช่วง · YEAR ทีละปี */
export function shiftAnchor(range: ReportRange, anchor: { year: number; month: number }, dir: -1 | 1) {
  if (range === 'YEAR') return { year: anchor.year + dir, month: dir === 1 ? 12 : 12 }
  const step = range === 'MONTH' ? 1 : MONTHS_OF[range]
  const idx = anchor.year * 12 + (anchor.month - 1) + dir * step
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

/** ช่องรายวัน/รายเดือนของ "ค่าใช้จ่ายร้าน" (Expense.expenseDate เก็บเป็นเที่ยงคืน UTC ของวันตามปฏิทิน) */
function expenseBucketIndex(range: ReportRange, slots: MonthSlot[] | null, d: Date): number {
  if (range === 'MONTH') return d.getUTCDate() - 1
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  return (slots ?? []).findIndex((s) => s.year === y && s.month === m)
}

export async function getFinanceChartData(
  shopId: string,
  vertical: string,
  range: ReportRange,
  anchorIn: { year?: number; month?: number },
  now = new Date(),
): Promise<FinanceChartData> {
  const anchor = range === 'YEAR'
    ? { year: clampAnchor({ year: anchorIn.year, month: 1 }, now).year, month: 12 }
    : clampAnchor(anchorIn, now)
  const cur = thaiNowParts(now)
  const win = windowOf(range, anchor)
  const slots = range === 'MONTH' ? null : monthSlots(range, anchor)

  // ── ยอดขาย/รับแล้ว/ต้นทุน/ค่าส่ง — จาก getSalesSeries ตัวเดียวกับชีต (includeFinance = เจ้าของผ่านด่านแล้วที่ route)
  let pieces: { series: SalesSeries; pick: number[] }[]
  if (range === 'MONTH') {
    const s = await getSalesSeries(shopId, 'daily', { year: anchor.year, month: anchor.month }, true, vertical)
    pieces = [{ series: s, pick: s.labels.map((_, i) => i) }]
  } else {
    const years = [...new Set(slots!.map((s) => s.year))]
    const byYear = new Map(
      await Promise.all(
        years.map(async (y) => [y, await getSalesSeries(shopId, 'monthly', { year: y }, true, vertical)] as const),
      ),
    )
    // เรียงตามช่อง — ช่องละหนึ่ง index ของปีนั้น
    pieces = slots!.map((sl) => ({ series: byYear.get(sl.year)!, pick: [sl.month - 1] }))
  }

  const buckets: FinanceChartBucket[] = []
  let hasMissingCost = false
  let futureFromIndex = -1
  for (let p = 0; p < pieces.length; p++) {
    const { series, pick } = pieces[p]
    hasMissingCost ||= series.hasMissingCost === true
    for (const i of pick) {
      const sales = series.values[i] ?? 0
      const received = series.receivedValues?.[i] ?? 0
      const slot = slots?.[p]
      const label =
        range === 'MONTH'
          ? series.labels[i]
          : slot && (slot.month === 1 || p === 0) && range !== 'YEAR'
            ? `${THAI_MONTHS_ABBR[slot.month - 1]} ${String(beYear(slot.year)).slice(2)}`
            : THAI_MONTHS_ABBR[(slot?.month ?? i + 1) - 1]
      // ช่องอนาคต: รายวัน = ตาม futureFromIndex ของ series · รายเดือน = เดือนที่เลยเดือนปัจจุบัน
      const isFuture =
        range === 'MONTH'
          ? i >= series.futureFromIndex
          : slot != null && (slot.year > cur.year || (slot.year === cur.year && slot.month > cur.month))
      if (isFuture && futureFromIndex < 0) futureFromIndex = buckets.length
      buckets.push({
        label,
        sales,
        received,
        outstanding: Math.max(0, sales - received),
        unrecorded: series.unrecordedValues?.[i] ?? 0,
        unclosed: series.unclosedValues?.[i] ?? 0,
        jobs: series.orderCounts[i] ?? 0,
        cost: series.cogsValues?.[i] ?? 0,
        expense: series.shippingValues?.[i] ?? 0,
      })
    }
  }
  if (futureFromIndex < 0) futureFromIndex = buckets.length

  // ── ค่าใช้จ่ายร้านที่บันทึกเอง + ค่าส่งขากลับของใบคืนที่รับแล้ว (ชุดเดียวกับ getPnlReport)
  const [expenses, returns] = await Promise.all([
    prisma.expense.findMany({
      where: { shopId, expenseDate: { gte: win.dateGte, lt: win.dateLt } },
      select: { amount: true, expenseDate: true },
    }),
    prisma.orderReturn.findMany({
      where: { shopId, status: RETURN_STATUS.RECEIVED, receivedAt: { gte: win.dateGte, lt: win.dateLt } },
      select: {
        receivedAt: true,
        countAsCost: true,
        shippingCost: true,
        shipment: { select: { carrierPrice: true, estimatedPrice: true } },
      },
    }),
  ])
  for (const e of expenses) {
    const idx = expenseBucketIndex(range, slots, e.expenseDate)
    if (idx >= 0 && idx < buckets.length) buckets[idx].expense += Number(e.amount)
  }
  for (const r of returns) {
    if (!r.receivedAt) continue
    // ใบคืนตัดช่วงด้วย expenseRange (date-only) แบบเดียวกับ P&L — วันที่ตาม UTC ของ instant นั้น
    const idx = expenseBucketIndex(range, slots, new Date(Math.floor(r.receivedAt.getTime() / DAY_MS) * DAY_MS))
    if (idx < 0 || idx >= buckets.length) continue
    buckets[idx].expense += sumReturnShippingCost([
      {
        countAsCost: r.countAsCost,
        shippingCost: r.shippingCost != null ? Number(r.shippingCost) : null,
        carrierPrice: r.shipment?.carrierPrice != null ? Number(r.shipment.carrierPrice) : null,
        estimatedPrice: r.shipment?.estimatedPrice != null ? Number(r.shipment.estimatedPrice) : null,
      },
    ]).total
  }

  for (const b of buckets) {
    b.sales = round2(b.sales)
    b.received = round2(b.received)
    b.outstanding = round2(b.outstanding)
    b.unrecorded = round2(b.unrecorded)
    b.unclosed = round2(b.unclosed)
    b.cost = round2(b.cost)
    b.expense = round2(b.expense)
  }
  const sum = (k: keyof Omit<FinanceChartBucket, 'label'>) => round2(buckets.reduce((s, b) => s + b[k], 0))
  return {
    range,
    anchor,
    rangeLabel: rangeLabelOf(range, anchor),
    buckets,
    futureFromIndex,
    totals: {
      sales: sum('sales'),
      received: sum('received'),
      outstanding: sum('outstanding'),
      unrecorded: sum('unrecorded'),
      unclosed: sum('unclosed'),
      jobs: buckets.reduce((s, b) => s + b.jobs, 0),
      cost: sum('cost'),
      expense: sum('expense'),
    },
    hasMissingCost,
    isCurrent:
      range === 'YEAR'
        ? anchor.year >= cur.year
        : anchor.year > cur.year || (anchor.year === cur.year && anchor.month >= cur.month),
  }
}

/** มัดจำรับล่วงหน้า = เงินที่รับไว้แล้ว (ไม่ถูก void) ของงานที่ยังไม่ปิด/ไม่ยกเลิก — ภาพ ณ ตอนนี้ ไม่ปนยอดขาย */
export async function getAdvanceDeposits(shopId: string): Promise<{ amount: number; jobs: number }> {
  const rows = await prisma.orderPayment.findMany({
    where: {
      shopId,
      voidedAt: null,
      order: { serviceClosedAt: null, status: { notIn: ['CANCELLED', 'RETURNED', 'DRAFTED'] } },
    },
    select: { amount: true, orderId: true },
  })
  return {
    amount: round2(rows.reduce((s, r) => s + Number(r.amount), 0)),
    jobs: new Set(rows.map((r) => r.orderId)).size,
  }
}
