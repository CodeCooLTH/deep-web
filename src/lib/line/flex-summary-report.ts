/**
 * flex-summary-report — Flex ของรายงานสรุปยอดเข้ากลุ่ม LINE (feature 00070 · SDS §3.1)
 *
 * pure: ไม่รู้จัก prisma/network · เงินใช้ `formatBaht` · กำไรใช้ `profitDisplay` (HR16) ·
 * วันที่/เวลาใช้ format-date กลาง — ห้ามเขียนรูปแบบเองในไฟล์นี้
 * สี: accent น้ำเงิน #236dc9 (ผู้อ่านคือเจ้าของร้านฝั่ง seller — ห้ามม่วง HR7) · ไม่มี emoji
 */
import type { LineFlexMessage } from '@/lib/line/flex-order-card'
import {
  ACCENT,
  composeBody,
  dayText,
  FLEX_COLORS,
  makeCtx,
  MIXED_ORDER_WORD,
  rangeText,
  renderHead,
  money,
  noBaht,
  salesTotal,
  reportOrderWord,
  sortShops,
  text,
  totalFinance,
  type Node,
  type Skipped,
} from '@/lib/line/flex-report-blocks'
import { combineTotals } from '@/lib/line-report/aggregate'
import { sellerDashboardUrl } from '@/lib/line-report/config'
import { DEFAULT_BUTTON_LABEL, defaultTemplateFromFlags, deriveFlags, type TemplateV1 } from '@/lib/line-report/template'
import type { GroupSummary, ReportKind, Totals } from '@/lib/line-report/types'
import { formatTimeHM } from '@/lib/format-date'
import { expenseDisplay, formatNumberNoSymbol, netSalesDisplay, profitDisplay } from '@/lib/format-money'

// ชื่อเดิมที่โมดูลอื่น/เทสอ้างถึง — ตัวจริงย้ายไป flex-report-blocks (กัน import วน)
export { FLEX_COLORS, MIXED_ORDER_WORD, reportOrderWord }

const ALT_TEXT_MAX = 1500
/** LINE: bubble ≤ 30KB — เผื่อไว้ใช้ 30,000 ไบต์ (ไม่ใช่ 30*1024) */
const BUBBLE_MAX_BYTES = 30_000
const MAX_MESSAGES = 5

/** ธงตัวชี้วัดของกลุ่ม (FR-LGS-12) — false = ไม่มีตัวเลข/คำของตัวชี้วัดนั้นในข้อความเลย */
export type ReportFlags = {
  showOrders: boolean
  showSales: boolean
  showCancelled: boolean
  showTopProducts: boolean
  showProfit: boolean
}

/** DB CHECK + service บังคับ ≥1 ตัวอยู่แล้ว — กันไว้อีกชั้น: ปิดหมด = แสดงจำนวนออเดอร์ (ไม่ส่งข้อความที่ไม่มีตัวเลข) */
const normFlags = (f: ReportFlags): ReportFlags =>
  f.showOrders || f.showSales || f.showCancelled || f.showTopProducts || f.showProfit ? f : { ...f, showOrders: true }

/** ค่าตั้งต้นของคอลัมน์ (ใช้เมื่อผู้เรียกไม่ส่งทั้ง template และ flags) */
const COLUMN_DEFAULT_FLAGS: ReportFlags = { showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: false }

export type SummaryReportInput = {
  summary: GroupSummary
  kind: ReportKind
  /** เทมเพลตของกลุ่ม (จาก resolveTemplate) — ไม่ส่ง = แบบมาตรฐานจาก `flags` (ผลเหมือนเดิมทุกไบต์) */
  template?: TemplateV1
  /** ใช้เมื่อไม่ส่ง `template` เท่านั้น (เส้นทางเดิม) */
  flags?: ReportFlags
  /** ยอดสะสมรอบ (แสดงเฉพาะรายวันที่ไม่ใช่ครบทั้งวัน) */
  /** `failedShops` = จำนวนร้านที่ดึงยอดสะสมไม่สำเร็จ (ไม่นับในยอด) — > 0 ต้องมีหมายเหตุ · ทุกร้านล้ม = ไม่แสดง ฿0 */
  cycleToDate?: { startIso: string; endIso: string; totals: Totals; failedShops?: number }
  /** push รวมรายวัน+รายเดือน → ข้อความที่ 2 */
  monthly?: GroupSummary
  /** ชนะ `template.title` (พฤติกรรมเดิม) · ใช้กับข้อความแรกเท่านั้น */
  titleOverride?: string
}

/** แบบมาตรฐานจาก flag — ยอดสะสมรอบเปิดตาม showSales เหมือนเดิม (ตัวตัดสินจริงคือ cycleToDate ที่ผู้เรียกส่งมา) */
function templateOf(input: SummaryReportInput): TemplateV1 {
  if (input.template) return input.template
  return defaultTemplateFromFlags({ ...normFlags(input.flags ?? COLUMN_DEFAULT_FLAGS), attachCycleToDaily: true, monthlyEnabled: true })
}

export const BASE_TITLE: Record<string, string> = {
  DAILY: 'รายงานยอดรายวัน',
  MONTHLY: 'รายงานยอดรายเดือน',
  TEST: 'รายงานยอด (ทดสอบ)',
  COMMAND: 'รายงานสรุปยอด',
}

function titleOf(kind: ReportKind, s: GroupSummary, override?: string): string {
  if (override) return override
  if (s.window.fullDay) return `สรุปวันที่ ${dayText(s.window.startIso)} (ครบทั้งวัน)`
  return BASE_TITLE[kind] ?? 'รายงานสรุปยอด'
}

/** level 0 = เต็ม · 1 = ตัด Top3 · 2 = ตัดกราฟ (+หมายเหตุ) · 3 = ย่อรายร้าน (ชื่อสั้น + ยอดขายอย่างเดียว) · 4 = ย่อ altText (FR-EXT-08) */
function renderBubble(input: SummaryReportInput, summary: GroupSummary, kind: ReportKind, level: number, skipped: Skipped[], meta: { charts: number }): Node {
  const template = templateOf(input)
  const c = makeCtx(summary, kind, template, level, input.cycleToDate, skipped)
  // title: titleOverride ชนะ template.title · ชนะป้ายครบทั้งวัน ตามเดิม
  const head = renderHead(titleOf(kind, summary, input.titleOverride || template.title), c)
  const bubble: Node = { type: 'bubble', size: 'mega', body: { type: 'box', layout: 'vertical', contents: [head, ...composeBody(template, c)] } }
  meta.charts = c.charts.n
  const url = sellerDashboardUrl()
  if (url && template.button.show) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'button', style: 'primary', color: ACCENT, height: 'sm', action: { type: 'uri', label: template.button.label || DEFAULT_BUTTON_LABEL, uri: url } },
      ],
    }
  }
  return bubble
}

function renderAltText(input: SummaryReportInput, summary: GroupSummary, kind: ReportKind, level: number): string {
  const t = combineTotals(summary.shops)
  const ow = reportOrderWord(summary.shops)
  const f = normFlags(deriveFlags(templateOf(input)))
  const title = `${titleOf(kind, summary, input.titleOverride || templateOf(input).title)} ${rangeText(summary.window.startIso, summary.window.endIso)}`
  // จอล็อก/รายการแชทตัดราว 40–60 ตัวอักษร → ยอดขายต้องมาก่อนชื่อรายงาน (critique 2026-10-08)
  const parts = f.showSales
    ? [`ยอดขาย ${money(salesTotal(t))}`, ...(t.unconfirmed > 0 ? [`รอยืนยัน ${money(t.unconfirmed)}`] : []), title]
    : [title]
  if (kind === 'TEST') parts[0] = `[ทดสอบ] ${parts[0]}`
  if (f.showOrders) parts.push(`${ow.word} ${formatNumberNoSymbol(t.orders)}${ow.mixed ? '' : ' รายการ'}`)
  if (f.showCancelled) parts.push(`ยกเลิก ${formatNumberNoSymbol(t.cancelled)} ใบ`)
  const ok = summary.shops.filter((s) => s.state === 'OK')
  if (f.showProfit && summary.profitSummable && ok.length > 1 && ok.every((s) => s.profit)) {
    const d = profitDisplay(
      ok.reduce((n, s) => n + (s.profit?.netProfit ?? 0), 0),
      { capped: ok.some((s) => s.profit?.capped) },
    )
    parts.push(`${d.label} ${noBaht(d.text)}`)
  }
  // บล็อกการเงินใหม่ไม่มี flag ใน deriveFlags → เช็คจาก template.blocks ตรง ๆ · เงื่อนไขรวมได้เดียวกับแถวในบับเบิล (ctx เดียวกัน)
  const tpl = templateOf(input)
  const wantExp = tpl.blocks.some((b) => b.type === 'expense'), wantNet = tpl.blocks.some((b) => b.type === 'net_sales')
  if (wantExp || wantNet) {
    const fin = totalFinance(makeCtx(summary, kind, tpl, level, undefined, []))
    if (fin && wantExp) { const d = expenseDisplay(fin.expense, { recorded: fin.expenseRecorded }); parts.push(`${d.label} ${noBaht(d.text)}`) }
    if (fin && wantNet) { const d = netSalesDisplay(fin.netSales, { capped: !fin.expenseRecorded }); parts.push(`${d.label} ${noBaht(d.text)}`) }
  }
  if (summary.shops.some((s) => s.state === 'ERROR')) parts.push('ยอดรวมยังไม่ครบ')
  parts.push(`ข้อมูล ณ ${formatTimeHM(summary.window.computedAt)} น.`)
  // level ≥4 = ย่อ altText เหลือแค่ตัวเลขสรุป (ตัดรายร้าน)
  if (level < 4) for (const s of sortShops(summary.shops)) if (s.state === 'OK' && summary.shops.length > 1) parts.push(f.showSales ? `${s.shop.name} ${money(salesTotal(s))}` : s.shop.name)
  return Array.from(parts.join(' · ')).slice(0, ALT_TEXT_MAX).join('')
}

/** Flex message พร้อมส่ง LINE ตรง (มี `type: 'flex'`) */
export type ReportFlexMessage = LineFlexMessage & { type: 'flex' }

/** ตัวสร้างใหม่ตามระดับการตัดทอน — เก็บไว้ให้ fitToLimits เรียกซ้ำ (ไม่ใส่ key แปลกลง JSON ที่ส่ง LINE) */
const rebuilders = new WeakMap<LineFlexMessage, (level: number) => LineFlexMessage>()
/** บล็อก/โทเคนที่ถูกข้ามในข้อความใบนั้น — อยู่นอก JSON ที่ส่ง LINE (EXT-06) */
const skippedOf = new WeakMap<LineFlexMessage, Skipped[]>()
/** จำนวนกราฟที่ข้อความใบนั้นแสดงอยู่ — 0 = ระดับตัดกราฟไม่เปลี่ยนผล ข้ามได้ */
const chartsOf = new WeakMap<LineFlexMessage, number>()

function build(input: SummaryReportInput, summary: GroupSummary, kind: ReportKind, level = 0): ReportFlexMessage {
  const skipped: Skipped[] = []
  const meta = { charts: 0 }
  const msg: ReportFlexMessage = {
    // 🛑 LINE บังคับ `type` ในทุก message object — `LineFlexMessage` ของ flex-order-card ไม่มีฟิลด์นี้
    // เพราะ adapter แชท (line-adapter.ts) เติมให้ตอนส่ง แต่บอทรายงานส่ง JSON นี้ตรง → ขาดแล้ว LINE ตอบ 400
    // (เจอบน prod 2026-10-05: ส่งทดสอบ/ตอบคำสั่งล้มทุกครั้ง)
    type: 'flex',
    altText: renderAltText(input, summary, kind, level),
    contents: renderBubble(input, summary, kind, level, skipped, meta),
  }
  chartsOf.set(msg, meta.charts)
  rebuilders.set(msg, (l) => build(input, summary, kind, l))
  skippedOf.set(msg, skipped)
  return msg
}

export function buildSummaryReportFlex(input: SummaryReportInput): ReportFlexMessage[] {
  const out = [build(input, input.summary, input.kind)]
  if (input.monthly) out.push(build({ ...input, titleOverride: undefined, template: input.template && { ...input.template, title: undefined }, cycleToDate: undefined }, input.monthly, 'MONTHLY'))
  return out
}

/** สิ่งที่ถูกข้ามในชุดข้อความ (รวมทุกใบ ไม่ซ้ำ) — ใช้เขียน Delivery.summary / ตอบ skipped[] ของส่งทดสอบ */
export function collectSkipped(messages: readonly LineFlexMessage[]): Skipped[] {
  const seen = new Set<string>()
  const out: Skipped[] = []
  for (const m of messages) {
    for (const s of skippedOf.get(m) ?? []) {
      const k = `${s.label}\u0000${s.reason}`
      if (!seen.has(k)) {
        seen.add(k)
        out.push(s)
      }
    }
  }
  return out
}

/** ข้อความสั้น ๆ (ข้อความสุดท้าย/แจ้งเตือน) — ไม่มีตัวเลขยอด */
export function buildPlainNotice(msg: string): ReportFlexMessage {
  return {
    type: 'flex',
    altText: Array.from(msg || '-').slice(0, ALT_TEXT_MAX).join(''),
    contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [text(msg)] } },
  }
}

const encoder = new TextEncoder()
/** ไบต์ UTF-8 ของสตริง — TextEncoder (รันบน client ได้) ให้ค่าเท่า Buffer.byteLength ทุกกรณี (AC-EXT-08-3) */
export const bytesOf = (s: string) => encoder.encode(s).length
const bytes = (m: LineFlexMessage) => bytesOf(JSON.stringify(m.contents))

export const REPORT_BUBBLE_MAX_BYTES = BUBBLE_MAX_BYTES
export const REPORT_MAX_LEVEL = 4

/** ตัดทอนที่ระดับที่กำหนดตรง ๆ (ใช้ตัววัดตอนบันทึกเทมเพลต) — รับ object จาก buildSummaryReportFlex เท่านั้น */
export function rebuildAtLevel(m: LineFlexMessage, level: number): LineFlexMessage {
  return rebuilders.get(m)?.(level) ?? m
}

/**
 * ตัดทอนให้อยู่ในเพดาน LINE (altText ≤1500 · bubble ≤30KB · ≤5 ข้อความ)
 * 🛑 ต้องรับ object ที่ `buildSummaryReportFlex` สร้างเองเท่านั้น (ผูกด้วย identity ผ่าน WeakMap) —
 * ข้อความที่ clone/โหลดจาก JSON ตัดได้แค่ altText
 * ลำดับ (FR-EXT-08): Top3 → กราฟ → ย่อรายร้าน → ย่อ altText · ข้ามระดับกราฟเมื่อข้อความไม่มีกราฟ (ผลเท่าเดิมทุกไบต์)
 * ไม่แตะยอดรวม/ป้ายช่วงเวลา/ข้อมูล ณ/ข้อความอิสระ
 */
export function fitToLimits(messages: LineFlexMessage[]): LineFlexMessage[] {
  return messages.slice(0, MAX_MESSAGES).map((m) => {
    const rebuild = rebuilders.get(m)
    let cur = m
    for (let level = 1; rebuild && bytes(cur) > BUBBLE_MAX_BYTES && level <= REPORT_MAX_LEVEL; level++) {
      if (level === 2 && !chartsOf.get(m)) continue
      cur = rebuild(level)
    }
    if (Array.from(cur.altText).length > ALT_TEXT_MAX) cur = { ...cur, altText: Array.from(cur.altText).slice(0, ALT_TEXT_MAX).join('') }
    // ใบที่ rebuild มี skipped ของตัวเองแล้ว (รวมหมายเหตุกราฟถูกตัด) — คัดลอกเฉพาะใบที่เป็น clone (ตัด altText)
    if (cur !== m && !skippedOf.has(cur)) skippedOf.set(cur, skippedOf.get(m) ?? [])
    return cur
  })
}
