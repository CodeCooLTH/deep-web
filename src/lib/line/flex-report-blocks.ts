/**
 * flex-report-blocks — ตัวประกอบบล็อกของเทมเพลตรายงาน LINE (EXT 00070 · FR-EXT-04/05/06/13 · T3)
 *
 * pure · ตัวเลขทุกตัวมาจาก `GroupSummary` ที่ส่งเข้ามา (+ combineTotals/profitDisplay เดิม) — ไม่คำนวณยอดเอง (HR16)
 * flex-summary-report.ts เป็นเจ้าของ `buildSummaryReportFlex`/fitToLimits · ไฟล์นี้เป็นเจ้าของ "ข้างในบับเบิล"
 * (ค่าคงที่สี/reportOrderWord ย้ายมาอยู่ที่นี่เพื่อไม่ให้ import วน — flex-summary-report re-export ชื่อเดิมให้)
 */
import { compareChart, trendChart } from '@/lib/line/flex-report-charts'
import { combineTotals } from '@/lib/line-report/aggregate'
import { todayThaiIsoDate } from '@/lib/date-range'
import { TOKENS, type Block, type Run, type TemplateV1, type TokenKey } from '@/lib/line-report/template'
import type { GroupSummary, ReportKind, ShopSummary, Totals } from '@/lib/line-report/types'
import { formatDayMonthTH, formatTimeHM, formatYearTH } from '@/lib/format-date'
import { formatBaht, formatNumberNoSymbol, profitDisplay } from '@/lib/format-money'
import { resolveShopVertical } from '@/lib/lodging'
import { resolveOrderVocab, resolveProductVocab } from '@/lib/seller-menu'

export const ACCENT = '#236dc9'
export const INK = '#2F2B3D'
export const SLATE = '#808390'
export const DANGER = '#d92d20'
/** ให้พรีวิวในหน้าตั้งค่าอ้างสีชุดเดียวกัน (flex-preview-tokens) — เปลี่ยนสีที่นี่แล้วเทสพรีวิวจะฟ้อง */
export const GRID_GRAY = '#D9DBE0'
export const FLEX_COLORS = { ACCENT, INK, SLATE, DANGER, GRID_GRAY } as const

const SHOP_NAME_COMPACT_MAX = 24
const COMPACT_SHOP_LIMIT = 10

export type Node = Record<string, unknown>
/** บล็อก/โทเคนที่ข้ามเพราะ "ไม่พร้อมตามเงื่อนไข" (ไม่รวมกรณีไม่เกี่ยวกับ kind) — ไม่มียอดเงิน */
export type Skipped = { label: string; reason: string }

export const dayText = (iso: string) => `${formatDayMonthTH(`${iso}T00:00:00+07:00`)} ${formatYearTH(`${iso}T00:00:00+07:00`)}`
export const rangeText = (startIso: string, endIso: string) =>
  startIso === endIso ? dayText(startIso) : `${formatDayMonthTH(`${startIso}T00:00:00+07:00`)} – ${dayText(endIso)}`

const EXCLUDED_REASON: Record<string, string> = { LOCKED: 'ถูกล็อก', DELETED: 'ถูกลบ', PURGED: 'ถูกลบ' }

/**
 * คำเรียก "ใบ" ของรายงานนี้ ผันตาม vertical จาก SSOT `ORDER_VOCAB.nounShort` (Q31)
 * ทุกร้านที่นับยอด vertical เดียวกัน → คำของ vertical นั้น · ผสม → "รายการ" (กลางที่สุด ไม่ผูก vertical ใด)
 * ห้ามพิมพ์คำเอง — ร้านบริการอ่านคำว่า "ออเดอร์" แล้วไม่ตรงกับธุรกิจตัวเอง
 */
export const MIXED_ORDER_WORD = 'รายการ'
export function reportOrderWord(shops: readonly Pick<ShopSummary, 'shop' | 'state'>[]): { word: string; mixed: boolean } {
  const counted = shops.filter((s) => s.state !== 'EXCLUDED')
  const verticals = new Set((counted.length > 0 ? counted : shops).map((s) => resolveShopVertical(s.shop.vertical)))
  if (verticals.size > 1) return { word: MIXED_ORDER_WORD, mixed: true }
  return { word: resolveOrderVocab([...verticals][0] ?? 'ONLINE_SALES').nounShort, mixed: false }
}

export const sortShops = (shops: readonly ShopSummary[]) =>
  [...shops].sort(
    (a, b) =>
      Number(a.state === 'ERROR') - Number(b.state === 'ERROR') ||
      b.confirmed - a.confirmed ||
      a.shop.name.localeCompare(b.shop.name, 'th'),
  )

// text ว่าง LINE ปฏิเสธทั้งข้อความ → fallback "-" (ใช้กับข้อความของระบบเท่านั้น — ข้อความอิสระไม่ใช้ fallback นี้, AC-EXT-04-4)
export const text = (t: string, o: Node = {}): Node => ({ type: 'text', text: t || '-', size: 'sm', color: INK, wrap: true, ...o })
export const note = (t: string, o: Node = {}): Node => text(t, { size: 'xs', color: SLATE, ...o })
export const kv = (k: string, v: string, o: { bold?: boolean; color?: string } = {}): Node => ({
  type: 'box',
  layout: 'horizontal',
  spacing: 'md',
  contents: [
    text(k, { flex: 3, color: SLATE }),
    text(v, { flex: 4, align: 'end', weight: o.bold ? 'bold' : 'regular', color: o.color ?? INK }),
  ],
})
export const section = (contents: Node[]): Node => ({ type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents })

function profitRow(p: { netProfit: number; capped: boolean }): Node {
  const d = profitDisplay(p.netProfit, { capped: p.capped })
  return kv(d.label, d.text)
}

// ─── บริบทของข้อความหนึ่งใบ ───────────────────────────────────────────────────────

type Ctx = {
  summary: GroupSummary
  kind: ReportKind
  cycleToDate?: { startIso: string; endIso: string; totals: Totals; failedShops?: number }
  level: number
  shops: ShopSummary[]
  ok: ShopSummary[]
  listed: ShopSummary[]
  excluded: ShopSummary[]
  errors: ShopSummary[]
  /** 🛑 ไม่ใช้ summary.total — ยอดรวมที่แสดงต้องเท่าผลบวกรายร้านที่แสดงพอดี (AC-15-2 / EXT-06-3) */
  t: Totals
  multi: boolean
  ow: { word: string; mixed: boolean }
  has: (type: Block['type']) => boolean
  skipped: Skipped[]
  /** จำนวนกราฟที่ "จะแสดง" (ระดับ 2 ขึ้นไปแสดงหมายเหตุแทน) — fitToLimits ใช้ข้ามระดับตัดกราฟเมื่อไม่มีกราฟ (EXT-08) */
  charts: { n: number }
}

/** กำไรรวม: เฉพาะ ≥2 ร้าน ∧ รวมได้ ∧ ไม่มี ERROR ∧ ทุกร้านที่ OK มีกำไร (กฎเดิม) */
function totalProfit(c: Ctx): { netProfit: number; capped: boolean } | null {
  if (!(c.summary.profitSummable && c.multi && c.errors.length === 0)) return null
  const withProfit = c.ok.filter((s) => s.profit)
  if (withProfit.length !== c.ok.length || c.ok.length === 0) return null
  return { netProfit: withProfit.reduce((n, s) => n + (s.profit?.netProfit ?? 0), 0), capped: withProfit.some((s) => s.profit?.capped) }
}

/** ยอดสะสมรอบที่แสดงได้ไหม — kind/ครบทั้งวัน = ไม่เกี่ยว (เงียบ) · ไม่มี cycleToDate = ไม่พร้อม (log) */
const cycleApplies = (c: Ctx) => c.kind === 'DAILY' && !c.summary.window.fullDay
const cycleAllFailed = (c: Ctx) => {
  const failed = c.cycleToDate?.failedShops ?? 0
  return failed > 0 && failed >= c.summary.shops.filter((x) => x.state !== 'EXCLUDED').length
}

export function makeCtx(
  summary: GroupSummary,
  kind: ReportKind,
  template: TemplateV1,
  level: number,
  cycleToDate: Ctx['cycleToDate'],
  skipped: Skipped[],
): Ctx {
  const shops = sortShops(summary.shops)
  const listed = shops.filter((s) => s.state !== 'EXCLUDED')
  return {
    summary,
    kind,
    cycleToDate,
    level,
    shops,
    ok: shops.filter((s) => s.state === 'OK'),
    listed,
    excluded: shops.filter((s) => s.state === 'EXCLUDED'),
    errors: shops.filter((s) => s.state === 'ERROR'),
    t: combineTotals(summary.shops),
    multi: listed.length > 1,
    ow: reportOrderWord(shops),
    has: (type) => template.blocks.some((b) => b.type === type),
    skipped,
    charts: { n: 0 },
  }
}

// ─── โทเคน (FR-EXT-05) ─────────────────────────────────────────────────────────

/** ป้ายโทเคนที่ใช้ใน diagnostics — {จำนวนรายการ} ผันตามคำของกลุ่มนี้ */
const tokenLabel = (tok: TokenKey, c: Ctx) => (tok === 'orders_count' ? `{จำนวน${c.ow.word}}` : TOKENS[tok])

/** null = คำนวณไม่ได้ในรอบนี้ → ตัดทั้งบล็อกข้อความ (BR-LGS-25 · ห้าม render "-"/"฿0") */
function tokenValue(tok: TokenKey, c: Ctx): string | null {
  const hasOk = c.ok.length > 0
  switch (tok) {
    case 'shop_name':
      return c.listed.length === 0 ? null : c.listed.length === 1 ? c.listed[0].shop.name : `${c.listed.length} ร้าน`
    case 'shop_count':
      return String(c.listed.length)
    case 'date_range':
      return rangeText(c.summary.window.startIso, c.summary.window.endIso)
    case 'computed_at':
      return `${formatTimeHM(c.summary.window.computedAt)} น.`
    case 'orders_count':
      return hasOk ? formatNumberNoSymbol(c.t.orders) : null
    case 'sales_counted':
      return hasOk ? formatBaht(c.t.confirmed) : null
    case 'sales_pending':
      return hasOk ? formatBaht(c.t.unconfirmed) : null
    case 'cancelled_count':
      return hasOk ? formatNumberNoSymbol(c.t.cancelled) : null
    case 'cycle_sales':
      return cycleApplies(c) && c.cycleToDate && !cycleAllFailed(c) ? formatBaht(c.cycleToDate.totals.confirmed) : null
    case 'profit': {
      // ร้านเดียว = กำไรของร้านนั้น (A-3) · หลายร้าน = กฎเดียวกับแถวกำไรรวม
      const p = c.listed.length === 1 ? (c.listed[0].state === 'OK' ? c.listed[0].profit : undefined) : totalProfit(c)
      return p ? profitDisplay(p.netProfit, { capped: p.capped }).text : null
    }
  }
}

const SIZE = { s: 'xs', m: 'sm', l: 'md' } as const
const COLOR = { ink: INK, slate: SLATE, accent: ACCENT } as const

/** ข้อความอิสระ 1 บล็อก = 1 ย่อหน้า · null = ตัดทั้งบล็อก (บันทึก skipped) — span ⇒ ไม่มี `text` บนแม่ (AC-EXT-04-2) */
function renderText(b: Extract<Block, { type: 'text' }>, c: Ctx): Node | null {
  const parts: { s: string; run: Run }[] = []
  for (const run of b.runs) {
    let s: string
    if ('t' in run) s = run.t
    else {
      const v = tokenValue(run.tok, c)
      if (v === null) {
        c.skipped.push({ label: tokenLabel(run.tok, c), reason: 'คำนวณไม่ได้ในรอบนี้' })
        return null
      }
      s = v
    }
    if (s) parts.push({ s, run })
  }
  if (parts.length === 0) return null
  const base = { size: SIZE[b.style.size], color: COLOR[b.style.color], weight: b.style.bold ? 'bold' : 'regular', wrap: true }
  if (!parts.some((p) => p.run.b || p.run.accent)) return { type: 'text', text: parts.map((p) => p.s).join(''), ...base }
  return {
    type: 'text',
    contents: parts.map(({ s, run }) => ({
      type: 'span',
      text: s,
      ...(run.b ? { weight: 'bold' } : {}),
      ...(run.accent ? { color: ACCENT } : {}),
    })),
    ...base,
  }
}

// ─── ส่วนประกอบของบับเบิล ──────────────────────────────────────────────────────────

/** หัวรายงาน — ล็อก: รับจากเทมเพลตได้แค่ title (ผ่านผู้เรียก) · ป้าย "ทดสอบ" ใส่เองเสมอ */
export function renderHead(title: string, c: Pick<Ctx, 'summary' | 'kind' | 'listed'>): Node {
  const { summary, kind, listed } = c
  return section([
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        text(title, { weight: 'bold', size: 'md', flex: 1 }),
        ...(kind === 'TEST' ? [text('ทดสอบ', { size: 'xs', color: DANGER, weight: 'bold', flex: 0, align: 'end', wrap: false })] : []),
      ],
    },
    text(rangeText(summary.window.startIso, summary.window.endIso), { weight: 'bold', color: ACCENT }),
    note(`ข้อมูล ณ ${formatTimeHM(summary.window.computedAt)} น.${listed.length > 1 ? ` · รวม ${listed.length} ร้าน` : ''}`),
  ])
}

/** หมายเหตุอัตโนมัติของยอดรวม — ติดบล็อกแม่ (มติ Q1 = A) ล็อก เอาออกไม่ได้ */
function totalsNotes(c: Ctx): Node[] {
  const out: Node[] = []
  if (c.summary.mixedFinanceRules) out.push(note('ยอดแต่ละร้านคิดตามกติกาของประเภทธุรกิจ', { margin: 'sm' }))
  if (c.errors.length > 0) out.push(note('ยอดรวมยังไม่ครบ เพราะดึงข้อมูลบางร้านไม่สำเร็จ', { color: DANGER, margin: 'sm' }))
  return out
}

const TOTALS_TYPES = new Set<Block['type']>(['orders', 'sales', 'cancelled', 'profit'])

/** orders/sales/cancelled/profit ที่ติดกัน = section เดียว (เหมือน totals เดิม) · แถวเรียงตามบล็อก */
function renderTotals(blocks: Block[], c: Ctx, withNotes: boolean): Node {
  const rows: Node[] = []
  for (const b of blocks) {
    if (b.type === 'orders') rows.push(kv(c.ow.word, `${formatNumberNoSymbol(c.t.orders)}${c.ow.mixed ? '' : ' รายการ'}`))
    else if (b.type === 'sales') {
      rows.push(
        kv('ยอดขาย (นับแล้ว)', formatBaht(c.t.confirmed), { bold: true }),
        note(`ยังไม่นับเป็นยอดขาย ${formatBaht(c.t.unconfirmed)} (รอยืนยัน/รอขนส่งรับ)`),
      )
    } else if (b.type === 'cancelled') rows.push(kv('ยกเลิก', `${formatNumberNoSymbol(c.t.cancelled)} ใบ (ใบที่เปิดในช่วงนี้)`))
    else if (b.type === 'profit') {
      const p = totalProfit(c)
      if (p) rows.push(profitRow(p))
      // ร้านเดียว = โครงสร้างไม่มีแถวรวม (ไม่ใช่ "ไม่พร้อม") → เงียบ
      else if (c.multi) c.skipped.push({ label: 'กำไร', reason: 'รวมกำไรไม่ได้ในรอบนี้' })
    }
  }
  return section([...rows, ...(withNotes ? totalsNotes(c) : [])])
}

/** รายร้าน — null = ไม่มีอะไรให้แสดง (ร้านเดียวไม่มีตัวเลือกเสริม ฯลฯ) · ตัวเลขต่อร้านตาม "การมีบล็อก" orders/sales/cancelled */
function renderShops(b: Extract<Block, { type: 'shops' }>, c: Ctx): Node | null {
  const { level, multi } = c
  const showOrders = c.has('orders'), showSales = c.has('sales'), showCancelled = c.has('cancelled')
  const shopBlocks: Node[] = []
  const visible = level >= 3 ? c.listed.slice(0, COMPACT_SHOP_LIMIT) : c.listed
  for (const s of visible) {
    const rows: Node[] = []
    const name = level >= 3 ? Array.from(s.shop.name).slice(0, SHOP_NAME_COMPACT_MAX).join('') : s.shop.name
    if (s.state === 'ERROR') {
      rows.push(kv(name, 'ดึงข้อมูลไม่สำเร็จ', { bold: true, color: DANGER }))
    } else {
      if (multi) {
        // ส่วนที่เปิดเท่านั้น · ออเดอร์+ยอดขายปิดหมด → ใช้ยกเลิกแทน · ไม่เหลือตัวเลข → ชื่อร้านอย่างเดียว (กำไรมีแถวของตัวเอง)
        const parts: string[] = []
        if (showOrders && level < 3) parts.push(formatNumberNoSymbol(s.orders))
        if (showSales) parts.push(formatBaht(s.confirmed))
        if (parts.length === 0 && showCancelled) parts.push(`ยกเลิก ${formatNumberNoSymbol(s.cancelled)} ใบ`)
        rows.push(parts.length > 0 ? kv(name, parts.join(' · '), { bold: true }) : text(name, { weight: 'bold' }))
      }
      if (level < 3 && b.profit && s.profit) rows.push(profitRow(s.profit))
      if (level < 1 && b.top3 && resolveShopVertical(s.shop.vertical) !== 'LODGING') {
        const vocab = resolveProductVocab(resolveShopVertical(s.shop.vertical))
        const top = s.top3 ?? []
        rows.push(note(`${vocab.bestSellerTitle} 3 อันดับ · นับทุกใบที่ไม่ยกเลิก`, { margin: 'sm' }))
        if (top.length === 0) rows.push(note('ยังไม่มีรายการสินค้าที่ระบุในช่วงนี้'))
        if (s.top3Truncated) rows.push(note('อันดับคำนวณจากข้อมูลบางส่วน (ข้อมูลเดือนนี้มากเกินกำหนด)'))
        top.forEach((r, i) =>
          rows.push({
            type: 'box',
            layout: 'horizontal',
            spacing: 'md',
            contents: [
              text(`${i + 1} ${r.name}`, { flex: 5, maxLines: 2 }),
              text(`${formatNumberNoSymbol(r.qty)} ${vocab.unitLabel}`, { flex: 2, align: 'end', color: SLATE }),
            ],
          }),
        )
      }
    }
    if (rows.length > 0) shopBlocks.push({ type: 'box', layout: 'vertical', margin: 'md', spacing: 'xs', contents: rows })
  }
  if (visible.length < c.listed.length) shopBlocks.push(note(`…และอีก ${c.listed.length - visible.length} ร้าน`, { margin: 'md' }))
  if (shopBlocks.length === 0) return null
  const foot: Node[] = []
  if (b.profit && multi && !c.summary.profitSummable) {
    foot.push(note('กำไรแต่ละร้านคิดตามกติกาของประเภทธุรกิจ จึงไม่รวมเป็นยอดเดียว', { margin: 'md' }))
  }
  if (b.profit && c.ok.some((s) => s.profit?.capped)) {
    foot.push(note('ค่าใช้จ่ายลงตามวันที่บันทึก ไม่เฉลี่ยรายวัน', { margin: 'sm' }))
  }
  return section([...(multi ? [note('แยกรายร้าน', { weight: 'bold' })] : []), ...shopBlocks, ...foot])
}

/** ยอดสะสมรอบ — null = ข้าม (kind/ครบทั้งวัน = เงียบ · ไม่มี cycleToDate = log) */
function renderCycle(c: Ctx): Node | null {
  if (!cycleApplies(c)) return null
  const cy = c.cycleToDate
  if (!cy) {
    c.skipped.push({ label: 'ยอดสะสมรอบ', reason: 'ไม่มียอดสะสมรอบในรอบนี้' })
    return null
  }
  const failed = cy.failedShops ?? 0
  return section([
    note(`ยอดสะสมรอบนี้ ${rangeText(cy.startIso, cy.endIso)}`, { weight: 'bold' }),
    // ทุกร้านล้ม → ฿0 จะอ่านเป็น "ไม่มียอด" ทั้งที่จริงคือไม่รู้ (partial-data-must-be-labeled)
    ...(cycleAllFailed(c)
      ? [note('ดึงข้อมูลไม่สำเร็จ', { color: DANGER })]
      : [
          kv('ยอดขาย (นับแล้ว)', formatBaht(cy.totals.confirmed)),
          ...(failed > 0 ? [note('ยอดรวมยังไม่ครบ เพราะดึงข้อมูลบางร้านไม่สำเร็จ', { color: DANGER, margin: 'sm' })] : []),
        ]),
  ])
}

function renderExcluded(c: Ctx): Node | null {
  if (c.excluded.length === 0) return null
  // ระดับย่อ: ตัดชื่อ + จำกัดจำนวนบรรทัด ไม่งั้นร้านที่ถูกตัดเยอะทำให้เพดาน 30KB ไม่อยู่
  const shownEx = c.level >= 3 ? c.excluded.slice(0, 5) : c.excluded
  const exNotes = shownEx.map((s) =>
    note(
      `ไม่รวมร้าน ${c.level >= 3 ? Array.from(s.shop.name).slice(0, SHOP_NAME_COMPACT_MAX).join('') : s.shop.name} (${EXCLUDED_REASON[s.excludedReason ?? ''] ?? 'ไม่พร้อมใช้งาน'})`,
    ),
  )
  if (shownEx.length < c.excluded.length) exNotes.push(note(`…และอีก ${c.excluded.length - shownEx.length} ร้านที่ไม่รวม`))
  return section(exNotes)
}

const CHART_CUT_NOTE = 'กราฟถูกตัดเพราะข้อความยาวเกินที่ LINE รับได้'

/** กราฟ 1 บล็อก — null = ข้าม (บันทึก skipped) · ระดับ ≥2 = แทนด้วยหมายเหตุ (ข้อความอื่นไม่ถูกตัด, AC-EXT-08-1) */
function renderChart(b: Extract<Block, { type: 'chart_trend' | 'chart_compare' }>, c: Ctx): Node | null {
  const label = b.type === 'chart_trend' ? 'กราฟแนวโน้ม 7 วัน' : 'กราฟเทียบรายร้าน'
  let node: Node | null
  if (b.type === 'chart_trend') {
    const tr = c.summary.trend
    if (!tr || tr.dates.length === 0) {
      c.skipped.push({ label, reason: 'ไม่มีข้อมูลแนวโน้มในรอบนี้' })
      return null
    }
    // แท่งสุดท้าย = วันนี้ที่ยังไม่จบ → นับถึงเวลาคำนวณ (รอบครบทั้งวัน/ย้อนหลัง = ครบวัน ไม่ติดหมายเหตุ)
    const w = c.summary.window
    const partial = !w.fullDay && w.endIso === todayThaiIsoDate(new Date(w.computedAt))
    node = trendChart({
      trend: tr,
      measure: b.measure,
      word: c.ow.word,
      partialUntil: partial ? formatTimeHM(w.computedAt) : undefined,
      incomplete: c.summary.trendPartial,
    })
  } else {
    node = compareChart(c.shops, b.measure, c.ow.word)
    if (!node) {
      c.skipped.push({ label, reason: 'ต้องมีร้านที่ดึงข้อมูลได้อย่างน้อย 2 ร้าน' })
      return null
    }
  }
  c.charts.n++
  if (c.level < 2) return node
  c.skipped.push({ label, reason: CHART_CUT_NOTE })
  return section([note(CHART_CUT_NOTE)])
}

/**
 * ตัวประกอบ body ตามลำดับบล็อกของเทมเพลต (หัวรายงานอยู่นอกฟังก์ชันนี้)
 * - ยุบ separator: ต้น/ท้าย/ติดกัน/ชิดบล็อกที่ไม่ render (FR-EXT-06)
 * - ไม่มีบล็อกตัวเลขเลย: หมายเหตุยอดรวมยังต้องมี (AC-EXT-13-1) → section สมอที่ต้นเนื้อหา ·
 *   ถ้าบล็อกแรกเป็น separator และมี shops ก็คง section (ว่างได้) ไว้ตามพฤติกรรมเดิมของแบบมาตรฐานที่เปิดแต่ Top3 (golden)
 */
export function composeBody(template: TemplateV1, c: Ctx): Node[] {
  type Item = 'sep' | Node
  const items: Item[] = []
  const blocks = template.blocks
  const lastTotals = blocks.reduce((n, b, i) => (TOTALS_TYPES.has(b.type) ? i : n), -1)
  if (lastTotals < 0) {
    const notes = totalsNotes(c)
    if ((blocks[0]?.type === 'separator' && c.has('shops')) || notes.length > 0) items.push(section(notes))
  }
  for (let i = 0; i < blocks.length; ) {
    const b = blocks[i]
    if (TOTALS_TYPES.has(b.type)) {
      let j = i
      while (j < blocks.length && TOTALS_TYPES.has(blocks[j].type)) j++
      items.push(renderTotals(blocks.slice(i, j), c, j - 1 === lastTotals))
      i = j
    } else if (b.type === 'text') {
      let j = i
      const nodes: Node[] = []
      for (; j < blocks.length && blocks[j].type === 'text'; j++) {
        const tb = blocks[j] as Extract<Block, { type: 'text' }>
        const n = renderText(tb, c)
        if (n) {
          nodes.push(n)
          // {ยอดสะสมรอบ} ที่ดึงสำเร็จแค่บางร้าน = ยอดไม่ครบ ต้องบอก (เหมือนบล็อก cycle) · ทุกร้านล้ม → โทเคนเป็น null อยู่แล้ว
          if ((c.cycleToDate?.failedShops ?? 0) > 0 && tb.runs.some((r) => 'tok' in r && r.tok === 'cycle_sales')) {
            nodes.push(note('ยอดสะสมรอบยังไม่ครบ เพราะดึงข้อมูลบางร้านไม่สำเร็จ', { color: DANGER, margin: 'sm' }))
          }
        }
      }
      if (nodes.length > 0) items.push(section(nodes))
      i = j
    } else {
      if (b.type === 'separator') items.push('sep')
      else if (b.type === 'shops') {
        const n = renderShops(b, c)
        if (n) items.push(n)
      } else if (b.type === 'cycle') {
        const n = renderCycle(c)
        if (n) items.push(n)
      } else if (b.type === 'chart_trend' || b.type === 'chart_compare') {
        const n = renderChart(b, c)
        if (n) items.push(n)
      }
      i++
    }
  }
  const body: Node[] = []
  let pendingSep = false
  for (const it of items) {
    if (it === 'sep') pendingSep = body.length > 0
    else {
      if (pendingSep) body.push({ type: 'separator', margin: 'lg' })
      body.push(it)
      pendingSep = false
    }
  }
  const ex = renderExcluded(c)
  // separator คั่นหัวกับเนื้อหา — ไม่มีเนื้อหา (blocks=[]) = มีแต่หัว
  return [...(body.length > 0 ? [{ type: 'separator', margin: 'lg' } as Node] : []), ...body, ...(ex ? [ex] : [])]
}
