/**
 * flex-report-charts — กราฟในข้อความรายงาน LINE (EXT 00070 · FR-EXT-09 · T5)
 *
 * pure · ไม่ใช้รูป (ไม่มี node `image`) — วาดด้วย box ที่ height/width เป็น % (ยืนยันกับ LINE validate/push แล้ว)
 * ตัวเลขทุกตัวมาจาก `Trend`/`ShopSummary` ที่ส่งเข้ามา — ไม่คำนวณยอดเอง (HR16)
 * สี: ยอดขาย = แท่งซ้อน เขียว (ยืนยันแล้ว) + เหลือง (รอยืนยัน) — มติ user 2026-10-08 แทน AC-09-6 เดิม ·
 *      จำนวนใบ = ACCENT (วันรายงาน/อันดับ 1) + GRID_GRAY เหมือนเดิม
 * ⚠️ import วนกับ flex-report-blocks (helper/สี) — ใช้ตอนเรียกฟังก์ชันเท่านั้น ไม่มีการใช้ที่ top-level
 */
import { ACCENT, CONFIRMED_GREEN, GRID_GRAY, DANGER, INK, PENDING_YELLOW, SLATE, note, salesTotal, section, text, type Node } from '@/lib/line/flex-report-blocks'
import { weekdayShortTH } from '@/lib/format-date'
import { formatBahtCompact, formatNumberNoSymbol } from '@/lib/format-money'
import type { ShopSummary, Trend } from '@/lib/line-report/types'

export type ChartMeasure = 'sales' | 'orders'

/** ความสูงแท่งสูงสุด (%) — เหลือที่ให้ป้ายตัวเลขเหนือแท่งไม่ทะลุกรอบ 96px */
const BAR_MAX_PCT = 80
const BAR_MIN_PCT = 2
const CHART_HEIGHT = '96px'
/** แถวกราฟเทียบ: เกินนี้ตัด + "…และอีก N ร้าน" (กันบับเบิลโตเกินเพดาน — เท่าเพดานรายร้านระดับย่อ) */
export const COMPARE_ROW_LIMIT = 10

const fmt = (v: number, m: ChartMeasure) => (m === 'sales' ? formatBahtCompact(v).replace('฿', '') : formatNumberNoSymbol(v))
const pctOf = (v: number, max: number, top: number) => (v > 0 && max > 0 ? Math.max(BAR_MIN_PCT, Math.round((v / max) * top)) : 0)
const fill = (): Node => ({ type: 'filler' })

/** ส่วนเหลืองในแท่ง (% ของแท่ง) — มียอดรอยืนยันต้องเห็นอย่างน้อยขีดหนึ่ง */
const pendingPct = (confirmed: number, unconfirmed: number) =>
  unconfirmed > 0 ? Math.max(4, Math.round((unconfirmed / (confirmed + unconfirmed)) * 100)) : 0

/** แท่งซ้อน: เหลือง (รอยืนยัน) อยู่ปลายแท่ง เขียว (ยืนยันแล้ว) อยู่โคน */
function stackedBar(dir: 'vertical' | 'horizontal', confirmed: number, unconfirmed: number, size: Node): Node {
  const y = pendingPct(confirmed, unconfirmed)
  const dim = dir === 'vertical' ? 'height' : 'width'
  const green: Node = { type: 'box', layout: 'vertical', flex: 1, backgroundColor: CONFIRMED_GREEN, contents: [fill()] }
  const yellow: Node = { type: 'box', layout: 'vertical', [dim]: `${y}%`, flex: 0, backgroundColor: PENDING_YELLOW, contents: [fill()] }
  const parts = y >= 100 ? [{ ...yellow, [dim]: undefined, flex: 1 }] : y > 0 ? (dir === 'vertical' ? [yellow, green] : [green, yellow]) : [green]
  return { type: 'box', layout: dir, cornerRadius: '2px', ...size, contents: parts }
}

const swatch = (color: string, h = '8px'): Node => ({ type: 'box', layout: 'vertical', width: '8px', height: h, cornerRadius: '2px', backgroundColor: color, contents: [fill()] })
const legendItem = (color: string, label: string, h?: string): Node[] => [
  swatch(color, h),
  text(label, { size: 'xxs', color: SLATE, flex: 0, wrap: false }),
  { type: 'box', layout: 'vertical', width: '8px', contents: [fill()] },
]
const legendRow = (items: Node[][]): Node => ({ type: 'box', layout: 'horizontal', spacing: 'xs', alignItems: 'center', margin: 'sm', contents: items.flat() })

/** คำอธิบายสีแท่ง (กราฟเทียบรายร้าน) — บรรทัดเดียว */
export const salesLegend = (): Node => legendRow([legendItem(CONFIRMED_GREEN, 'ยืนยันแล้ว'), legendItem(PENDING_YELLOW, 'รอยืนยัน')])

/** จุดย่อยระหว่างวัน — มากพอให้อ่านเป็นเส้น · น้อยพอไม่กินเพดาน 30KB */
const LINE_STEPS = 4
const DOT = '4px'

/**
 * เส้นแนวโน้มแบบจุดต่อกัน — Flex วาดเส้นเฉียงไม่ได้ (ไม่มี node เส้น/หมุน) จึงวางจุด absolute ไล่ระหว่างวัน
 * x = กึ่งกลางคอลัมน์ของวัน · y = สเกลเดียวกับแท่ง (ค่าติดลบชิดพื้น)
 */
function lineDots(values: number[], max: number): Node[] {
  const n = values.length
  const y = (v: number) => (Math.max(0, v) / max) * BAR_MAX_PCT
  const x = (i: number) => ((i + 0.5) / n) * 100
  const dot = (xp: number, yp: number, big: boolean): Node => ({
    type: 'box',
    layout: 'vertical',
    position: 'absolute',
    // LINE รับ % สำหรับ offset (เอกสารยืนยันเฉพาะจำนวนเต็ม) → ปัดเป็นจำนวนเต็ม
    offsetStart: `${Math.round(xp)}%`,
    offsetBottom: `${Math.round(yp)}%`,
    width: big ? '6px' : DOT,
    height: big ? '6px' : DOT,
    cornerRadius: big ? '3px' : '2px',
    backgroundColor: ACCENT,
    contents: [fill()],
  })
  const out: Node[] = []
  for (let i = 0; i < n; i++) {
    out.push(dot(x(i), y(values[i]), true))
    if (i === n - 1) break
    for (let k = 1; k < LINE_STEPS; k++) {
      const t = k / LINE_STEPS
      out.push(dot(x(i) + (x(i + 1) - x(i)) * t, y(values[i]) + (y(values[i + 1]) - y(values[i])) * t, false))
    }
  }
  return out
}

export type TrendChartInput = {
  trend: Trend
  measure: ChartMeasure
  /** คำเรียก "ใบ" (reportOrderWord) — ใช้เมื่อ measure=orders */
  word: string
  /** ค่าใช้จ่ายรายวัน — ส่งมาเมื่อรายงานเปิดเผยค่าใช้จ่ายและรวมได้ → แท่งแดงข้าง ๆ + เส้น = ยอดขาย − ค่าใช้จ่าย */
  expense?: number[]
  /** มีร้านดึงไม่สำเร็จ → ยอดรวมไม่ครบ ต้องบอก (partial-data convention) */
  incomplete?: boolean
}

const bar = (h: string, color: string, flex?: number): Node => ({
  type: 'box', layout: 'vertical', height: h, backgroundColor: color, cornerRadius: '2px', ...(flex ? { flex } : {}), contents: [fill()],
})

export function trendChart({ trend, measure, word, expense, incomplete }: TrendChartInput): Node {
  const sales = measure === 'sales'
  const conf = trend.confirmed.map((v) => Math.max(0, v))
  const pend = trend.unconfirmed.map((v) => Math.max(0, v))
  const values = sales ? conf.map((v, i) => v + (pend[i] ?? 0)) : trend.orders.map((v) => Math.max(0, v))
  const exp = sales && expense ? values.map((_, i) => Math.max(0, expense[i] ?? 0)) : undefined
  // เส้น: ยอดขายรวม หรือ ยอดขาย − ค่าใช้จ่าย เมื่อมีค่าใช้จ่าย (มติ user 2026-10-08)
  const line = sales ? values.map((v, i) => v - (exp?.[i] ?? 0)) : undefined
  const n = values.length
  const max = Math.max(0, ...values, ...(exp ?? []))
  const title = sales ? (exp ? `ยอดขายและค่าใช้จ่าย ${n} วัน` : `ยอดขาย ${n} วัน`) : `${word} ${n} วัน`
  const rows: Node[] = [note(title, { weight: 'bold' })]
  if (max === 0) {
    rows.push(
      { type: 'box', layout: 'vertical', height: '2px', margin: 'md', backgroundColor: GRID_GRAY, contents: [fill()] },
      note(sales ? `ยังไม่มียอดขายใน ${n} วันนี้` : `ยังไม่มี${word}ใน ${n} วันนี้`),
    )
  } else {
    const maxIdx = values.indexOf(Math.max(...values)) // ป้ายเดียวเสมอ ที่ยอดขายสูงสุด (เท่ากัน → แท่งแรก)
    const column = (v: number, i: number): Node[] => {
      const pct = pctOf(v, max, BAR_MAX_PCT)
      if (!sales) return pct > 0 ? [bar(`${pct}%`, i === n - 1 ? ACCENT : GRID_GRAY)] : []
      const pe = exp ? pctOf(exp[i], max, BAR_MAX_PCT) : 0
      if (!exp) return pct > 0 ? [stackedBar('vertical', conf[i], pend[i] ?? 0, { height: `${pct}%` })] : []
      const top = Math.max(pct, pe)
      if (top === 0) return []
      // คู่แท่ง: ยอดขาย (ซ้อนเขียว/เหลือง) | ค่าใช้จ่าย (แดง) — สูงเทียบกับกล่องคู่ที่สูงเท่าแท่งที่สูงกว่า
      const rel = (p: number) => `${Math.round((p / top) * 100)}%`
      return [
        {
          type: 'box',
          layout: 'horizontal',
          height: `${top}%`,
          alignItems: 'flex-end',
          contents: [
            pct > 0 ? stackedBar('vertical', conf[i], pend[i] ?? 0, { height: rel(pct), flex: 1 }) : { type: 'filler' },
            pe > 0 ? bar(rel(pe), DANGER, 1) : { type: 'filler' },
          ],
        },
      ]
    }
    rows.push({
      type: 'box',
      layout: 'horizontal',
      height: CHART_HEIGHT,
      spacing: 'xs',
      alignItems: 'flex-end',
      margin: 'sm',
      contents: [
        ...values.map(
          (v, i) =>
            ({
              type: 'box',
              layout: 'vertical',
              flex: 1,
              justifyContent: 'flex-end',
              contents: [...(i === maxIdx ? [text(fmt(v, measure), { size: 'xxs', align: 'center', weight: 'bold', wrap: false })] : []), ...column(v, i)],
            }) as Node,
        ),
        ...(line ? lineDots(line, max) : []),
      ],
    })
    rows.push({
      type: 'box',
      layout: 'horizontal',
      spacing: 'xs',
      contents: trend.dates.map((d, i) => {
        const color = i === n - 1 ? ACCENT : SLATE
        return {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          alignItems: 'center',
          contents: [
            text(weekdayShortTH(`${d}T00:00:00+07:00`), { size: 'xxs', color, wrap: false }),
            text(String(Number(d.slice(8, 10))), { size: 'xxs', color, wrap: false }),
          ],
        } as Node
      }),
    })
    if (sales) {
      rows.push(
        legendRow([
          legendItem(CONFIRMED_GREEN, 'ยืนยันแล้ว'),
          legendItem(PENDING_YELLOW, 'รอยืนยัน'),
          ...(exp ? [legendItem(DANGER, 'ค่าใช้จ่าย')] : []),
        ]),
        legendRow([legendItem(ACCENT, exp ? 'ยอดขายหลังหักค่าใช้จ่าย' : 'ยอดขายรวม', '3px')]),
      )
    }
  }
  if (incomplete) rows.push(note('ยอดรวมยังไม่ครบ เพราะดึงข้อมูลบางร้านไม่สำเร็จ', { color: DANGER, margin: 'sm' }))
  return section(rows)
}

/** null = ข้ามบล็อก (ร้านสถานะ OK น้อยกว่า 2 ที่เวลาส่ง) — ผู้เรียกบันทึก skipped */
export function compareChart(shops: readonly ShopSummary[], measure: ChartMeasure, word: string): Node | null {
  const ok = shops.filter((s) => s.state === 'OK')
  if (ok.length < 2) return null
  const val = (s: ShopSummary) => (measure === 'sales' ? salesTotal(s) : s.orders)
  const sorted = [...ok].sort((a, b) => val(b) - val(a) || a.shop.name.localeCompare(b.shop.name, 'th'))
  const shown = sorted.slice(0, COMPARE_ROW_LIMIT)
  const max = Math.max(0, val(shown[0]))
  const rows: Node[] = [note(measure === 'sales' ? 'เทียบรายร้าน · ยอดขาย' : `เทียบรายร้าน · ${word}`, { weight: 'bold' })]
  shown.forEach((s, i) => {
    const pct = pctOf(val(s), max, 100)
    rows.push({
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      alignItems: 'center',
      margin: 'sm',
      contents: [
        text(s.shop.name, { size: 'xs', flex: 38, maxLines: 1 }),
        {
          type: 'box',
          layout: 'horizontal',
          flex: 62,
          spacing: 'sm',
          alignItems: 'center',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              flex: 40,
              contents:
                pct === 0
                  ? []
                  : measure === 'sales'
                    ? [stackedBar('horizontal', s.confirmed, s.unconfirmed, { width: `${pct}%`, height: '10px' })]
                    : [{ type: 'box', layout: 'vertical', width: `${pct}%`, height: '10px', backgroundColor: i === 0 ? ACCENT : GRID_GRAY, contents: [fill()] }],
            },
            text(fmt(val(s), measure), { size: 'xxs', flex: 22, align: 'end', color: INK, wrap: false }),
          ],
        },
      ],
    })
  })
  if (sorted.length > shown.length) rows.push(note(`…และอีก ${sorted.length - shown.length} ร้าน`, { margin: 'sm' }))
  if (measure === 'sales' && max > 0) rows.push(salesLegend())
  return section(rows)
}
