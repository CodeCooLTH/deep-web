/**
 * flex-summary-report — Flex ของรายงานสรุปยอดเข้ากลุ่ม LINE (feature 00070 · SDS §3.1)
 *
 * pure: ไม่รู้จัก prisma/network · เงินใช้ `formatBaht` · กำไรใช้ `profitDisplay` (HR16) ·
 * วันที่/เวลาใช้ format-date กลาง — ห้ามเขียนรูปแบบเองในไฟล์นี้
 * สี: accent น้ำเงิน #236dc9 (ผู้อ่านคือเจ้าของร้านฝั่ง seller — ห้ามม่วง HR7) · ไม่มี emoji
 */
import type { LineFlexMessage } from '@/lib/line/flex-order-card'
import { combineTotals } from '@/lib/line-report/aggregate'
import { sellerDashboardUrl } from '@/lib/line-report/config'
import type { GroupSummary, ReportKind, ShopSummary, Totals } from '@/lib/line-report/types'
import { formatDayMonthTH, formatTimeHM, formatYearTH } from '@/lib/format-date'
import { formatBaht, formatNumberNoSymbol, profitDisplay } from '@/lib/format-money'
import { resolveShopVertical } from '@/lib/lodging'
import { resolveOrderVocab, resolveProductVocab } from '@/lib/seller-menu'

const ACCENT = '#236dc9'
const INK = '#2F2B3D'
const SLATE = '#808390'
const DANGER = '#d92d20'
/** ให้พรีวิวในหน้าตั้งค่าอ้างสีชุดเดียวกัน (flex-preview-tokens) — เปลี่ยนสีที่นี่แล้วเทสพรีวิวจะฟ้อง */
export const FLEX_COLORS = { ACCENT, INK, SLATE, DANGER } as const

const ALT_TEXT_MAX = 1500
/** LINE: bubble ≤ 30KB — เผื่อไว้ใช้ 30,000 ไบต์ (ไม่ใช่ 30*1024) */
const BUBBLE_MAX_BYTES = 30_000
const MAX_MESSAGES = 5
const SHOP_NAME_COMPACT_MAX = 24
const COMPACT_SHOP_LIMIT = 10

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

export type SummaryReportInput = {
  summary: GroupSummary
  kind: ReportKind
  flags: ReportFlags
  /** ยอดสะสมรอบ (แสดงเฉพาะรายวันที่ไม่ใช่ครบทั้งวัน) */
  /** `failedShops` = จำนวนร้านที่ดึงยอดสะสมไม่สำเร็จ (ไม่นับในยอด) — > 0 ต้องมีหมายเหตุ · ทุกร้านล้ม = ไม่แสดง ฿0 */
  cycleToDate?: { startIso: string; endIso: string; totals: Totals; failedShops?: number }
  /** push รวมรายวัน+รายเดือน → ข้อความที่ 2 */
  monthly?: GroupSummary
  titleOverride?: string
}

const dayText = (iso: string) => `${formatDayMonthTH(`${iso}T00:00:00+07:00`)} ${formatYearTH(`${iso}T00:00:00+07:00`)}`
const rangeText = (startIso: string, endIso: string) =>
  startIso === endIso ? dayText(startIso) : `${formatDayMonthTH(`${startIso}T00:00:00+07:00`)} – ${dayText(endIso)}`

const EXCLUDED_REASON: Record<string, string> = { LOCKED: 'ถูกล็อก', DELETED: 'ถูกลบ', PURGED: 'ถูกลบ' }

const BASE_TITLE: Record<string, string> = {
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

const sortShops = (shops: readonly ShopSummary[]) =>
  [...shops].sort(
    (a, b) =>
      Number(a.state === 'ERROR') - Number(b.state === 'ERROR') ||
      b.confirmed - a.confirmed ||
      a.shop.name.localeCompare(b.shop.name, 'th'),
  )

type Node = Record<string, unknown>
// text ว่าง LINE ปฏิเสธทั้งข้อความ → fallback "-"
const text = (t: string, o: Node = {}): Node => ({ type: 'text', text: t || '-', size: 'sm', color: INK, wrap: true, ...o })
const note = (t: string, o: Node = {}): Node => text(t, { size: 'xs', color: SLATE, ...o })
const kv = (k: string, v: string, o: { bold?: boolean; color?: string } = {}): Node => ({
  type: 'box',
  layout: 'horizontal',
  spacing: 'md',
  contents: [
    text(k, { flex: 3, color: SLATE }),
    text(v, { flex: 4, align: 'end', weight: o.bold ? 'bold' : 'regular', color: o.color ?? INK }),
  ],
})
const section = (contents: Node[]): Node => ({ type: 'box', layout: 'vertical', margin: 'lg', spacing: 'xs', contents })

function profitRow(p: { netProfit: number; capped: boolean }): Node {
  const d = profitDisplay(p.netProfit, { capped: p.capped })
  return kv(d.label, d.text)
}

/** level 0 = เต็ม · 1 = ตัด Top3 · 2 = ย่อรายร้าน (ชื่อสั้น + ยอดขายอย่างเดียว) */
function renderBubble(input: SummaryReportInput, summary: GroupSummary, kind: ReportKind, level: number): Node {
  const f = normFlags(input.flags)
  const { showProfit } = f
  const shops = sortShops(summary.shops)
  const ok = shops.filter((s) => s.state === 'OK')
  const listed = shops.filter((s) => s.state !== 'EXCLUDED')
  const excluded = shops.filter((s) => s.state === 'EXCLUDED')
  const errors = shops.filter((s) => s.state === 'ERROR')
  // 🛑 ไม่ใช้ summary.total — ยอดรวมที่แสดงต้องเท่าผลบวกรายร้านที่แสดงพอดี (AC-15-2)
  const t = combineTotals(summary.shops)
  const multi = listed.length > 1
  const ow = reportOrderWord(shops)

  const head: Node[] = [
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        text(titleOf(kind, summary, input.titleOverride), { weight: 'bold', size: 'md', flex: 1 }),
        ...(kind === 'TEST'
          ? [text('ทดสอบ', { size: 'xs', color: DANGER, weight: 'bold', flex: 0, align: 'end', wrap: false })]
          : []),
      ],
    },
    text(rangeText(summary.window.startIso, summary.window.endIso), { weight: 'bold', color: ACCENT }),
    note(`ข้อมูล ณ ${formatTimeHM(summary.window.computedAt)} น.${multi ? ` · รวม ${listed.length} ร้าน` : ''}`),
  ]

  const totals: Node[] = []
  if (f.showOrders) totals.push(kv(ow.word, `${formatNumberNoSymbol(t.orders)}${ow.mixed ? '' : ' รายการ'}`))
  if (f.showSales) {
    totals.push(
      kv('ยอดขาย (นับแล้ว)', formatBaht(t.confirmed), { bold: true }),
      note(`ยังไม่นับเป็นยอดขาย ${formatBaht(t.unconfirmed)} (รอยืนยัน/รอขนส่งรับ)`),
    )
  }
  if (f.showCancelled) totals.push(kv('ยกเลิก', `${formatNumberNoSymbol(t.cancelled)} ใบ (ใบที่เปิดในช่วงนี้)`))
  if (showProfit && summary.profitSummable && multi && errors.length === 0) {
    const withProfit = ok.filter((s) => s.profit)
    if (withProfit.length === ok.length && ok.length > 0) {
      totals.push(
        profitRow({
          netProfit: withProfit.reduce((n, s) => n + (s.profit?.netProfit ?? 0), 0),
          capped: withProfit.some((s) => s.profit?.capped),
        }),
      )
    }
  }
  if (summary.mixedFinanceRules) totals.push(note('ยอดแต่ละร้านคิดตามกติกาของประเภทธุรกิจ', { margin: 'sm' }))
  if (errors.length > 0) totals.push(note('ยอดรวมยังไม่ครบ เพราะดึงข้อมูลบางร้านไม่สำเร็จ', { color: DANGER, margin: 'sm' }))

  const body: Node[] = [section(head), { type: 'separator', margin: 'lg' }, section(totals)]

  // รายร้าน
  const shopBlocks: Node[] = []
  const visible = level >= 2 ? listed.slice(0, COMPACT_SHOP_LIMIT) : listed
  for (const s of visible) {
    const rows: Node[] = []
    const name = level >= 2 ? Array.from(s.shop.name).slice(0, SHOP_NAME_COMPACT_MAX).join('') : s.shop.name
    if (s.state === 'ERROR') {
      rows.push(kv(name, 'ดึงข้อมูลไม่สำเร็จ', { bold: true, color: DANGER }))
    } else {
      if (multi) {
        // ส่วนที่เปิดเท่านั้น · ออเดอร์+ยอดขายปิดหมด → ใช้ยกเลิกแทน · ไม่เหลือตัวเลข → ชื่อร้านอย่างเดียว (กำไรมีแถวของตัวเอง)
        const parts: string[] = []
        if (f.showOrders && level < 2) parts.push(formatNumberNoSymbol(s.orders))
        if (f.showSales) parts.push(formatBaht(s.confirmed))
        if (parts.length === 0 && f.showCancelled) parts.push(`ยกเลิก ${formatNumberNoSymbol(s.cancelled)} ใบ`)
        rows.push(parts.length > 0 ? kv(name, parts.join(' · '), { bold: true }) : text(name, { weight: 'bold' }))
      }
      if (level < 2 && showProfit && s.profit) rows.push(profitRow(s.profit))
      if (level < 1 && f.showTopProducts && resolveShopVertical(s.shop.vertical) !== 'LODGING') {
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
  if (visible.length < listed.length) shopBlocks.push(note(`…และอีก ${listed.length - visible.length} ร้าน`, { margin: 'md' }))
  if (shopBlocks.length > 0) {
    const foot: Node[] = []
    if (showProfit && multi && !summary.profitSummable) {
      foot.push(note('กำไรแต่ละร้านคิดตามกติกาของประเภทธุรกิจ จึงไม่รวมเป็นยอดเดียว', { margin: 'md' }))
    }
    if (showProfit && ok.some((s) => s.profit?.capped)) {
      foot.push(note('ค่าใช้จ่ายลงตามวันที่บันทึก ไม่เฉลี่ยรายวัน', { margin: 'sm' }))
    }
    body.push(
      { type: 'separator', margin: 'lg' },
      section([...(multi ? [note('แยกรายร้าน', { weight: 'bold' })] : []), ...shopBlocks, ...foot]),
    )
  }

  // ยอดสะสมรอบมีแต่ยอดขาย → ปิดยอดขาย = ไม่มีตัวเลขให้แสดง ตัดทั้งบล็อก
  if (f.showSales && input.cycleToDate && kind === 'DAILY' && !summary.window.fullDay) {
    const c = input.cycleToDate
    const failed = c.failedShops ?? 0
    const allFailed = failed > 0 && failed >= summary.shops.filter((x) => x.state !== 'EXCLUDED').length
    body.push(
      { type: 'separator', margin: 'lg' },
      section([
        note(`ยอดสะสมรอบนี้ ${rangeText(c.startIso, c.endIso)}`, { weight: 'bold' }),
        // ทุกร้านล้ม → ฿0 จะอ่านเป็น "ไม่มียอด" ทั้งที่จริงคือไม่รู้ (partial-data-must-be-labeled)
        ...(allFailed
          ? [note('ดึงข้อมูลไม่สำเร็จ', { color: DANGER })]
          : [
              kv('ยอดขาย (นับแล้ว)', formatBaht(c.totals.confirmed)),
              ...(failed > 0 ? [note('ยอดรวมยังไม่ครบ เพราะดึงข้อมูลบางร้านไม่สำเร็จ', { color: DANGER, margin: 'sm' })] : []),
            ]),
      ]),
    )
  }
  if (excluded.length > 0) {
    // ระดับย่อ: ตัดชื่อ + จำกัดจำนวนบรรทัด ไม่งั้นร้านที่ถูกตัดเยอะทำให้เพดาน 30KB ไม่อยู่
    const shownEx = level >= 2 ? excluded.slice(0, 5) : excluded
    const exNotes = shownEx.map((s) =>
      note(
        `ไม่รวมร้าน ${level >= 2 ? Array.from(s.shop.name).slice(0, SHOP_NAME_COMPACT_MAX).join('') : s.shop.name} (${EXCLUDED_REASON[s.excludedReason ?? ''] ?? 'ไม่พร้อมใช้งาน'})`,
      ),
    )
    if (shownEx.length < excluded.length) exNotes.push(note(`…และอีก ${excluded.length - shownEx.length} ร้านที่ไม่รวม`))
    body.push(section(exNotes))
  }

  const bubble: Node = { type: 'bubble', size: 'mega', body: { type: 'box', layout: 'vertical', contents: body } }
  const url = sellerDashboardUrl()
  if (url) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'button', style: 'primary', color: ACCENT, height: 'sm', action: { type: 'uri', label: 'เปิด Deep', uri: url } }],
    }
  }
  return bubble
}

function renderAltText(input: SummaryReportInput, summary: GroupSummary, kind: ReportKind, level: number): string {
  const t = combineTotals(summary.shops)
  const ow = reportOrderWord(summary.shops)
  const f = normFlags(input.flags)
  const parts = [`${kind === 'TEST' ? '[ทดสอบ] ' : ''}${titleOf(kind, summary, input.titleOverride)} ${rangeText(summary.window.startIso, summary.window.endIso)}`]
  if (f.showOrders) parts.push(`${ow.word} ${formatNumberNoSymbol(t.orders)}${ow.mixed ? '' : ' รายการ'}`)
  if (f.showSales) parts.push(`ยอดขาย ${formatBaht(t.confirmed)}`)
  if (f.showCancelled) parts.push(`ยกเลิก ${formatNumberNoSymbol(t.cancelled)} ใบ`)
  const ok = summary.shops.filter((s) => s.state === 'OK')
  if (f.showProfit && summary.profitSummable && ok.length > 1 && ok.every((s) => s.profit)) {
    const d = profitDisplay(
      ok.reduce((n, s) => n + (s.profit?.netProfit ?? 0), 0),
      { capped: ok.some((s) => s.profit?.capped) },
    )
    parts.push(`${d.label} ${d.text}`)
  }
  if (summary.shops.some((s) => s.state === 'ERROR')) parts.push('ยอดรวมยังไม่ครบ')
  parts.push(`ข้อมูล ณ ${formatTimeHM(summary.window.computedAt)} น.`)
  // level ≥3 = ย่อ altText เหลือแค่ตัวเลขสรุป (ตัดรายร้าน)
  if (level < 3) for (const s of sortShops(summary.shops)) if (s.state === 'OK' && summary.shops.length > 1) parts.push(f.showSales ? `${s.shop.name} ${formatBaht(s.confirmed)}` : s.shop.name)
  return Array.from(parts.join(' · ')).slice(0, ALT_TEXT_MAX).join('')
}

/** Flex message พร้อมส่ง LINE ตรง (มี `type: 'flex'`) */
export type ReportFlexMessage = LineFlexMessage & { type: 'flex' }

/** ตัวสร้างใหม่ตามระดับการตัดทอน — เก็บไว้ให้ fitToLimits เรียกซ้ำ (ไม่ใส่ key แปลกลง JSON ที่ส่ง LINE) */
const rebuilders = new WeakMap<LineFlexMessage, (level: number) => LineFlexMessage>()

function build(input: SummaryReportInput, summary: GroupSummary, kind: ReportKind, level = 0): ReportFlexMessage {
  const msg: ReportFlexMessage = {
    // 🛑 LINE บังคับ `type` ในทุก message object — `LineFlexMessage` ของ flex-order-card ไม่มีฟิลด์นี้
    // เพราะ adapter แชท (line-adapter.ts) เติมให้ตอนส่ง แต่บอทรายงานส่ง JSON นี้ตรง → ขาดแล้ว LINE ตอบ 400
    // (เจอบน prod 2026-10-05: ส่งทดสอบ/ตอบคำสั่งล้มทุกครั้ง)
    type: 'flex',
    altText: renderAltText(input, summary, kind, level),
    contents: renderBubble(input, summary, kind, level),
  }
  rebuilders.set(msg, (l) => build(input, summary, kind, l))
  return msg
}

export function buildSummaryReportFlex(input: SummaryReportInput): ReportFlexMessage[] {
  const out = [build(input, input.summary, input.kind)]
  if (input.monthly) out.push(build({ ...input, titleOverride: undefined, cycleToDate: undefined }, input.monthly, 'MONTHLY'))
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

const bytes = (m: LineFlexMessage) => Buffer.byteLength(JSON.stringify(m.contents), 'utf8')

/**
 * ตัดทอนให้อยู่ในเพดาน LINE (altText ≤1500 · bubble ≤30KB · ≤5 ข้อความ)
 * 🛑 ต้องรับ object ที่ `buildSummaryReportFlex` สร้างเองเท่านั้น (ผูกด้วย identity ผ่าน WeakMap) —
 * ข้อความที่ clone/โหลดจาก JSON ตัดได้แค่ altText
 * ลำดับ: Top3 → ย่อรายร้าน → altText · ไม่แตะยอดรวม/ป้ายช่วงเวลา/ข้อมูล ณ
 */
export function fitToLimits(messages: LineFlexMessage[]): LineFlexMessage[] {
  return messages.slice(0, MAX_MESSAGES).map((m) => {
    const rebuild = rebuilders.get(m)
    let cur = m
    for (let level = 1; rebuild && bytes(cur) > BUBBLE_MAX_BYTES && level <= 3; level++) cur = rebuild(level)
    if (Array.from(cur.altText).length > ALT_TEXT_MAX) cur = { ...cur, altText: Array.from(cur.altText).slice(0, ALT_TEXT_MAX).join('') }
    return cur
  })
}
