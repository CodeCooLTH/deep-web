/**
 * flex-report-charts — กราฟในข้อความรายงาน LINE (EXT 00070 · FR-EXT-09 · T5)
 *
 * pure · ไม่ใช้รูป (ไม่มี node `image`) — วาดด้วย box ที่ height/width เป็น % (ยืนยันกับ LINE validate/push แล้ว)
 * ตัวเลขทุกตัวมาจาก `Trend`/`ShopSummary` ที่ส่งเข้ามา — ไม่คำนวณยอดเอง (HR16)
 * สี: ACCENT (แท่งวันรายงาน/อันดับ 1) + GRID_GRAY (แท่งอื่น) เท่านั้น ห้ามเขียว/แดง (AC-09-6)
 * ⚠️ import วนกับ flex-report-blocks (helper/สี) — ใช้ตอนเรียกฟังก์ชันเท่านั้น ไม่มีการใช้ที่ top-level
 */
import { ACCENT, GRID_GRAY, DANGER, INK, SLATE, note, section, text, type Node } from '@/lib/line/flex-report-blocks'
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

const fmt = (v: number, m: ChartMeasure) => (m === 'sales' ? formatBahtCompact(v) : formatNumberNoSymbol(v))
const pctOf = (v: number, max: number, top: number) => (v > 0 && max > 0 ? Math.max(BAR_MIN_PCT, Math.round((v / max) * top)) : 0)
const fill = (): Node => ({ type: 'filler' })

export type TrendChartInput = {
  trend: Trend
  measure: ChartMeasure
  /** คำเรียก "ใบ" (reportOrderWord) — ใช้เมื่อ measure=orders */
  word: string
  /** "HH:MM" — แท่งสุดท้ายนับถึงเวลานี้ ไม่ใช่ทั้งวัน (AC-09-3) · ไม่ส่ง = ไม่ติดหมายเหตุ */
  partialUntil?: string
  /** มีร้านดึงไม่สำเร็จ → ยอดรวมไม่ครบ ต้องบอก (partial-data convention) */
  incomplete?: boolean
}

export function trendChart({ trend, measure, word, partialUntil, incomplete }: TrendChartInput): Node {
  const values = (measure === 'sales' ? trend.confirmed : trend.orders).map((v) => Math.max(0, v))
  const n = values.length
  const max = Math.max(0, ...values)
  const title = measure === 'sales' ? `แนวโน้มยอดขาย ${n} วัน` : `แนวโน้ม${word} ${n} วัน`
  const rows: Node[] = [note(title, { weight: 'bold' })]
  if (max === 0) {
    rows.push(
      { type: 'box', layout: 'vertical', height: '2px', margin: 'md', backgroundColor: GRID_GRAY, contents: [fill()] },
      note(measure === 'sales' ? `ยังไม่มียอดขายใน ${n} วันนี้` : `ยังไม่มี${word}ใน ${n} วันนี้`),
    )
  } else {
    const maxIdx = values.indexOf(max) // ค่าสูงสุดเท่ากัน → ป้ายที่แท่งแรก (ป้ายเดียวเสมอ)
    rows.push({
      type: 'box',
      layout: 'horizontal',
      height: CHART_HEIGHT,
      spacing: 'xs',
      alignItems: 'flex-end',
      margin: 'sm',
      contents: values.map((v, i) => {
        const pct = pctOf(v, max, BAR_MAX_PCT)
        return {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          justifyContent: 'flex-end',
          contents: [
            ...(i === maxIdx ? [text(fmt(v, measure), { size: 'xxs', align: 'center', weight: 'bold', wrap: false })] : []),
            ...(pct > 0
              ? [{ type: 'box', layout: 'vertical', height: `${pct}%`, backgroundColor: i === n - 1 ? ACCENT : GRID_GRAY, cornerRadius: '2px', contents: [fill()] }]
              : []),
          ],
        } as Node
      }),
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
  }
  if (partialUntil) rows.push(note(`แท่งสุดท้ายนับถึง ${partialUntil} น.`, { margin: 'sm' }))
  if (incomplete) rows.push(note('ยอดรวมยังไม่ครบ เพราะดึงข้อมูลบางร้านไม่สำเร็จ', { color: DANGER, margin: 'sm' }))
  return section(rows)
}

/** null = ข้ามบล็อก (ร้านสถานะ OK น้อยกว่า 2 ที่เวลาส่ง) — ผู้เรียกบันทึก skipped */
export function compareChart(shops: readonly ShopSummary[], measure: ChartMeasure, word: string): Node | null {
  const ok = shops.filter((s) => s.state === 'OK')
  if (ok.length < 2) return null
  const val = (s: ShopSummary) => (measure === 'sales' ? s.confirmed : s.orders)
  const sorted = [...ok].sort((a, b) => val(b) - val(a) || a.shop.name.localeCompare(b.shop.name, 'th'))
  const shown = sorted.slice(0, COMPARE_ROW_LIMIT)
  const max = Math.max(0, val(shown[0]))
  const rows: Node[] = [note(measure === 'sales' ? 'เทียบรายร้าน · ยอดขาย (นับแล้ว)' : `เทียบรายร้าน · ${word}`, { weight: 'bold' })]
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
              contents: pct > 0 ? [{ type: 'box', layout: 'vertical', width: `${pct}%`, height: '10px', backgroundColor: i === 0 ? ACCENT : GRID_GRAY, contents: [fill()] }] : [],
            },
            text(fmt(val(s), measure), { size: 'xxs', flex: 22, align: 'end', color: INK, wrap: false }),
          ],
        },
      ],
    })
  })
  if (sorted.length > shown.length) rows.push(note(`…และอีก ${sorted.length - shown.length} ร้าน`, { margin: 'sm' }))
  return section(rows)
}
