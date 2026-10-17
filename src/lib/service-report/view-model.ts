/**
 * ตัวคำนวณรายงานกลางของร้านบริการ (feature 00078 · BRD FR-001)
 *
 * ฟังก์ชันล้วน (ไม่แตะ prisma/React/window) — การ์ดหน้าแรก ชีตมือถือ และหน้า /sales เรียกตัวนี้ตัวเดียว
 * ⇒ ตัวเลขทุกจอตรงกันโดยโครงสร้าง ไม่ใช่เพราะเขียนสูตรซ้ำให้ตรงกัน
 *
 * นิยาม (HR16 · กติกาเดิม 00073 ไม่เปลี่ยน):
 *   ยอดขาย = ปิดงานแล้ว (ตามวันปิดงาน) + ยังไม่ปิดงาน (ตามวันเปิดบิล)
 *   กำไร (งานที่ปิดแล้ว) = ปิดงานแล้ว − ต้นทุนอะไหล่ − ค่าใช้จ่ายร้าน
 *   % เทียบ = ยอดขายช่วงนี้ เทียบช่วงเดียวกันของช่วงก่อน (ถึงวันเดียวกัน) · ช่วงก่อนเป็น 0 = ไม่แสดง
 */
import { THAI_MONTHS_ABBR, toBuddhistYear } from '@/lib/format-date'

import type { ServiceReportView } from '@/lib/report-settings'

import { SERVICE_REPORT_WORDS as W } from './words'

export type ServiceReportMode = 'daily' | 'monthly'

/** ข้อมูลดิบต่อ bucket ที่ตัวโหลดฝั่ง server ส่งมา (serializable — ข้ามเส้น RSC→client ได้) */
export interface ServiceReportData {
  mode: ServiceReportMode
  year: number
  /** 1–12 (daily เท่านั้น) */
  month?: number
  labels: string[]
  closed: number[]
  closedCounts: number[]
  unclosed: number[]
  unclosedCounts: number[]
  cost: number[]
  expense: number[]
  /** bucket แรกที่เป็นอนาคต (ช่วงปัจจุบัน) — ช่วงอดีต = labels.length */
  futureFromIndex: number
  /** ยอดขายช่วงก่อนถึงวัน/เดือนเดียวกัน (ปิดงานแล้ว + ยังไม่ปิดงาน) */
  prevSalesToDate: number
  /** 14 วันล่าสุด — มีเฉพาะเดือนปัจจุบันแบบรายวัน (โหมด "วันนี้" ของการ์ดหน้าแรก) */
  last14?: { labels: string[]; closed: number[]; unclosed: number[] }
}

export type StripDot = 'counted' | 'notCounted' | 'outflow'
export interface StripCell {
  key: 'closed' | 'unclosed' | 'cost' | 'expense'
  label: string
  value: number
  /** ตัวดำเนินการหน้าช่องนี้ (ช่องแรกไม่มี) */
  op?: '+' | '−'
  dot?: StripDot
}

export interface ServiceReportRow {
  /** index ของ bucket (0-based) — ใช้กับกราฟ/โหลดบิลของวันนั้น */
  index: number
  label: string
  jobs: number
  closed: number
  unclosed: number
  cost: number
  expense: number
  /** กำไร (งานที่ปิดแล้ว) */
  profit: number
}

export interface ServiceReportDelta {
  direction: 'up' | 'down'
  pct: number
  compareLabel: string
}

export interface ServiceReportModel {
  hero: { label: string; value: number; tone: 'neutral' | 'profit' | 'loss' }
  delta: ServiceReportDelta | null
  strip: StripCell[]
  /** ชุดกราฟ — ยอดขาย: เขียว(ปิดงานแล้ว)+เหลือง(ยังไม่ปิดงาน) · กำไร: กำไรรายวัน (ติดลบได้) */
  chart: { categories: string[]; series: { key: 'closed' | 'unclosed' | 'profit'; name: string; data: number[] }[]; futureFromIndex: number }
  rows: ServiceReportRow[]
  hasCost: boolean
  totals: { sales: number; closed: number; unclosed: number; cost: number; expense: number; profit: number; jobs: number }
}

const sum = (a: readonly number[]) => a.reduce((s, v) => s + v, 0)
const at = (a: readonly number[] | undefined, i: number) => a?.[i] ?? 0


/**
 * แถบสมการใต้ตัวเลขใหญ่ — ตัวเดียวของการ์ดหน้าแรก (วันนี้/เดือนนี้) และหน้ายอดขายและกำไร
 * ยอดขาย: ปิดงานแล้ว + ยังไม่ปิดงาน · กำไร: ปิดงานแล้ว − ต้นทุนอะไหล่ (ถ้ามี) − ค่าใช้จ่าย
 */
export function stripOf(view: ServiceReportView, t: { closed: number; unclosed: number; cost: number; expense: number }): StripCell[] {
  return view === 'profit'
    ? [
        { key: 'closed', label: W.closed, value: t.closed, dot: 'counted' },
        ...(t.cost > 0 ? [{ key: 'cost' as const, label: W.cost, value: t.cost, op: '−' as const }] : []),
        { key: 'expense', label: W.expense, value: t.expense, op: '−', dot: 'outflow' },
      ]
    : [
        { key: 'closed', label: W.closed, value: t.closed, dot: 'counted' },
        { key: 'unclosed', label: W.unclosed, value: t.unclosed, op: '+', dot: 'notCounted' },
      ]
}

/**
 * ป้ายช่วงที่ใช้เทียบ — บอกชัดว่าเทียบกับอะไร (clarify)
 * รายวันเดือนปัจจุบัน: "1–16 ก.ย." · เดือนอดีต: "ก.ย." · รายเดือนปีปัจจุบัน: "ม.ค.–ต.ค. 2568" · ปีอดีต: "ปี 2568"
 */
export function compareLabelOf(d: Pick<ServiceReportData, 'mode' | 'year' | 'month' | 'futureFromIndex' | 'labels'>): string {
  const full = d.futureFromIndex >= d.labels.length
  if (d.mode === 'daily') {
    const m0 = ((d.month ?? 1) - 2 + 12) % 12
    return full ? THAI_MONTHS_ABBR[m0] : `1–${d.futureFromIndex} ${THAI_MONTHS_ABBR[m0]}`
  }
  return full ? `ปี ${toBuddhistYear(d.year - 1)}` : `${THAI_MONTHS_ABBR[0]}–${THAI_MONTHS_ABBR[d.futureFromIndex - 1]} ${toBuddhistYear(d.year - 1)}`
}

/** % เปลี่ยน — ช่วงก่อนไม่มีฐาน (≤0) = ไม่แสดง (ไม่โชว์ "∞%"/"0%" หลอกตา) */
export function deltaOf(now: number, prev: number, compareLabel: string): ServiceReportDelta | null {
  if (!(prev > 0)) return null
  const pct = Math.round(((now - prev) / prev) * 100)
  return { direction: pct >= 0 ? 'up' : 'down', pct: Math.abs(pct), compareLabel }
}

/** หน้ายอดขายและกำไร + การ์ดหน้าแรกโหมด "เดือนนี้" */
export function buildServiceReport(d: ServiceReportData, view: ServiceReportView): ServiceReportModel {
  const n = d.labels.length
  const profitAt = (i: number) => at(d.closed, i) - at(d.cost, i) - at(d.expense, i)
  const totals = {
    closed: sum(d.closed),
    unclosed: sum(d.unclosed),
    cost: sum(d.cost),
    expense: sum(d.expense),
    jobs: sum(d.closedCounts) + sum(d.unclosedCounts),
    sales: 0,
    profit: 0,
  }
  totals.sales = totals.closed + totals.unclosed
  totals.profit = totals.closed - totals.cost - totals.expense
  const hasCost = totals.cost > 0

  const isProfit = view === 'profit'
  const hero = isProfit
    ? { label: totals.profit < 0 ? W.loss : W.profit, value: totals.profit, tone: (totals.profit < 0 ? 'loss' : 'profit') as 'loss' | 'profit' }
    : { label: W.sales, value: totals.sales, tone: 'neutral' as const }

  const strip = stripOf(view, totals)

  const series = isProfit
    ? [{ key: 'profit' as const, name: W.profit, data: Array.from({ length: n }, (_, i) => profitAt(i)) }]
    : [
        { key: 'closed' as const, name: W.closed, data: d.labels.map((_, i) => at(d.closed, i)) },
        { key: 'unclosed' as const, name: W.unclosed, data: d.labels.map((_, i) => at(d.unclosed, i)) },
      ]

  const rows: ServiceReportRow[] = []
  for (let i = n - 1; i >= 0; i--) {
    const row: ServiceReportRow = {
      index: i,
      label: d.labels[i],
      jobs: at(d.closedCounts, i) + at(d.unclosedCounts, i),
      closed: at(d.closed, i),
      unclosed: at(d.unclosed, i),
      cost: at(d.cost, i),
      expense: at(d.expense, i),
      profit: profitAt(i),
    }
    if (row.jobs || row.closed || row.unclosed || row.cost || row.expense) rows.push(row)
  }

  return {
    hero,
    delta: deltaOf(totals.sales, d.prevSalesToDate, compareLabelOf(d)),
    strip,
    chart: { categories: d.labels, series, futureFromIndex: d.futureFromIndex },
    rows,
    hasCost,
    totals,
  }
}

/**
 * การ์ดหน้าแรกโหมด "วันนี้" — ตัวเลขของวันนี้ + กราฟ 14 วันล่าสุด + เทียบค่าเฉลี่ย 14 วัน
 * กำไรวันนี้ = ปิดงานแล้ววันนี้ − ต้นทุน − ค่าใช้จ่ายวันนี้ (กราฟ 14 วันโหมดกำไรใช้ยอดปิดงานแล้ว − ต้นทุน/ค่าใช้จ่ายไม่ได้
 * เพราะ last14 ไม่มีสองชุดนี้ ⇒ โหมดกำไรแสดงกราฟยอดขาย 14 วันเหมือนเดิม — ตัวเลขใหญ่ยังเป็นกำไร)
 */
export function buildServiceToday(d: ServiceReportData, view: ServiceReportView) {
  const t = Math.max(0, d.futureFromIndex - 1)
  const closed = at(d.closed, t)
  const unclosed = at(d.unclosed, t)
  const cost = at(d.cost, t)
  const expense = at(d.expense, t)
  const profit = closed - cost - expense
  const l14 = d.last14
  const avg14 = l14 ? (sum(l14.closed) + sum(l14.unclosed)) / l14.labels.length : 0
  const isProfit = view === 'profit'
  return {
    hero: isProfit
      ? { label: profit < 0 ? W.loss : W.profit, value: profit, tone: (profit < 0 ? 'loss' : 'profit') as 'loss' | 'profit' }
      : { label: W.sales, value: closed + unclosed, tone: 'neutral' as const },
    // วันนี้ยังไม่มีงาน (0) = ยังเทียบไม่ได้ ไม่ใช่ "ลดลง 100%" — วันยังไม่จบ ⇒ ไม่แสดงบรรทัด % (user 2026-10-17)
    delta: isProfit || closed + unclosed <= 0 ? null : deltaOf(closed + unclosed, avg14, W.avg14),
    strip: stripOf(view, { closed, unclosed, cost, expense }),
    chart: l14
      ? {
          categories: l14.labels,
          series: [
            { key: 'closed' as const, name: W.closed, data: l14.closed },
            { key: 'unclosed' as const, name: W.unclosed, data: l14.unclosed },
          ],
          futureFromIndex: l14.labels.length,
        }
      : null,
  }
}
