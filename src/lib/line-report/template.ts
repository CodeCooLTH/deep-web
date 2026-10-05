/**
 * template.ts — สัญญาเทมเพลตข้อความรายงาน (EXT 2026-10-05 · FR-LGS-EXT-01/04/05/07) · pure
 *
 * 🛑 ใช้ทั้ง client และ server — ห้าม import prisma / node:* (R-8: ผลต้องเท่ากันสองฝั่ง)
 * type ด้านล่างตรงกับสัญญาในเอกสาร §4 ทุกตัวอักษร — แก้ที่นี่ต้องแก้เอกสารก่อน
 */

export type TemplateV1 = {
  v: 1
  title?: string
  button: { show: boolean; label: string }
  blocks: Block[]
}
export type Block =
  | { id: string; type: 'orders' }
  | { id: string; type: 'sales' }
  | { id: string; type: 'cancelled' }
  | { id: string; type: 'shops'; top3: boolean; profit: boolean }
  | { id: string; type: 'cycle' }
  | { id: string; type: 'profit' }
  | { id: string; type: 'text'; style: { bold: boolean; size: 's' | 'm' | 'l'; color: 'ink' | 'slate' | 'accent' }; runs: Run[] }
  | { id: string; type: 'separator' }
  | { id: string; type: 'chart_trend'; measure: 'sales' | 'orders' }
  | { id: string; type: 'chart_compare'; measure: 'sales' | 'orders' }
export type Run = ({ t: string } | { tok: TokenKey }) & { b?: true; accent?: true }
export type TokenKey =
  | 'shop_name'
  | 'shop_count'
  | 'date_range'
  | 'computed_at'
  | 'orders_count'
  | 'sales_counted'
  | 'sales_pending'
  | 'cancelled_count'
  | 'cycle_sales'
  | 'profit'

export type BlockType = Block['type']

/**
 * ป้ายมาตรฐานคงที่ของโทเคน (ไม่ผันตาม vertical — เพื่อให้ client/server วัดความยาวตรงกัน, AC-EXT-02-4)
 * `orders_count` ใช้ {จำนวนรายการ}: ในเอกสารเขียน {จำนวน{คำ}} ซึ่งมีปีกกาซ้อน parse ไม่ได้ · "รายการ" = คำกลางของ MIXED_ORDER_WORD
 * ป้ายที่ผู้ใช้เห็นในพรีวิว/ข้อความจริงผันตามร้านเอง แต่ต้นฉบับที่พิมพ์ใช้ป้ายนี้เสมอ
 */
export const TOKENS: Record<TokenKey, string> = {
  shop_name: '{ชื่อร้าน}',
  shop_count: '{จำนวนร้าน}',
  date_range: '{วันที่}',
  computed_at: '{เวลาข้อมูล}',
  orders_count: '{จำนวนรายการ}',
  sales_counted: '{ยอดขาย (นับแล้ว)}',
  sales_pending: '{ยังไม่นับ}',
  cancelled_count: '{ยกเลิก}',
  cycle_sales: '{ยอดสะสมรอบ}',
  profit: '{กำไร}',
}
export const TOKEN_KEYS = Object.keys(TOKENS) as TokenKey[]
const TOKEN_BY_LABEL = new Map<string, TokenKey>(TOKEN_KEYS.map((k) => [TOKENS[k], k]))

/** ชนิดที่ใส่ได้ไม่เกินเท่านี้ (ที่ไม่ระบุ = 1) */
export const BLOCK_LIMITS: Record<BlockType, number> = {
  orders: 1, sales: 1, cancelled: 1, shops: 1, cycle: 1, profit: 1, chart_trend: 1, chart_compare: 1, text: 6, separator: 8,
}
export const MAX_BLOCKS = 20
export const MAX_TEXT_LENGTH = 120
export const MAX_TITLE_LENGTH = 60
export const MAX_BUTTON_LABEL = 20
export const DEFAULT_BUTTON_LABEL = 'เปิด Deep'

// ─── แบบมาตรฐาน / flag ─────────────────────────────────────────────────────────

export type TemplateFlags = {
  showOrders: boolean
  showSales: boolean
  showCancelled: boolean
  showTopProducts: boolean
  showProfit: boolean
}
export type DerivedFlags = TemplateFlags & { attachCycleToDaily: boolean }

/** group shape แคบ ๆ ที่ resolveTemplate/defaultTemplateFromFlags ต้องการ — แถว Prisma ส่งเข้ามาได้ตรง ๆ */
export type TemplateGroup = TemplateFlags & {
  attachCycleToDaily: boolean
  monthlyEnabled: boolean
  /** ผู้เรียกต้องผ่าน validateTemplate มาก่อน (service อ่าน Json แล้ว cast) */
  template?: TemplateV1 | null
}

/** แบบมาตรฐาน = เลย์เอาต์ปัจจุบันของกลุ่ม (FR-EXT-01) — id คงที่ เพื่อให้ผลเหมือนเดิมทุกครั้ง (golden/คีย์ React) */
export function defaultTemplateFromFlags(g: TemplateGroup): TemplateV1 {
  const blocks: Block[] = []
  if (g.showOrders) blocks.push({ id: 'std-orders', type: 'orders' })
  if (g.showSales) blocks.push({ id: 'std-sales', type: 'sales' })
  if (g.showCancelled) blocks.push({ id: 'std-cancelled', type: 'cancelled' })
  if (g.showProfit) blocks.push({ id: 'std-profit', type: 'profit' })
  blocks.push({ id: 'std-sep-1', type: 'separator' })
  blocks.push({ id: 'std-shops', type: 'shops', top3: g.showTopProducts, profit: g.showProfit })
  blocks.push({ id: 'std-sep-2', type: 'separator' })
  if (g.showSales && g.attachCycleToDaily && g.monthlyEnabled) blocks.push({ id: 'std-cycle', type: 'cycle' })
  return { v: 1, button: { show: true, label: DEFAULT_BUTTON_LABEL }, blocks }
}

/** ทางเดียวที่ send/command/test/preview เรียก (AC-EXT-01-1) */
export const resolveTemplate = (g: TemplateGroup): TemplateV1 => g.template ?? defaultTemplateFromFlags(g)

const usedTokens = (t: TemplateV1): Set<TokenKey> => {
  const s = new Set<TokenKey>()
  for (const b of t.blocks) if (b.type === 'text') for (const r of b.runs) if ('tok' in r) s.add(r.tok)
  return s
}

/** flag 5 ตัว + attachCycleToDaily ที่เทมเพลตบอก (EXT-07) — โทเคนอื่นนอกจาก profit/cycle_sales ไม่พลิก flag */
export function deriveFlags(t: TemplateV1): DerivedFlags {
  const has = (type: BlockType) => t.blocks.some((b) => b.type === type)
  const shops = t.blocks.find((b): b is Extract<Block, { type: 'shops' }> => b.type === 'shops')
  const toks = usedTokens(t)
  return {
    showOrders: has('orders'),
    showSales: has('sales'),
    showCancelled: has('cancelled'),
    showTopProducts: !!shops?.top3,
    showProfit: has('profit') || !!shops?.profit || toks.has('profit'),
    // monthlyEnabled=false ล้างทิ้งที่ mergeSettings ตามกติกาเดิม — ที่นี่บอกเฉพาะ "เทมเพลตขอ"
    attachCycleToDaily: has('cycle') || toks.has('cycle_sales'),
  }
}

export type TemplateNeeds = DerivedFlags & {
  needSeries: boolean
  needTrend7: boolean
  needCompare: boolean
  needCancelled: boolean
  needTop3: boolean
  needPnl: boolean
  needCycle: boolean
}

/** สิ่งที่ summary ต้องดึง ⊇ flags (EXT-07): โทเคน/กราฟขอข้อมูลได้แม้ไม่มีบล็อกตัวเลข */
export function deriveNeeds(t: TemplateV1): TemplateNeeds {
  const f = deriveFlags(t)
  const toks = usedTokens(t)
  const needTrend7 = t.blocks.some((b) => b.type === 'chart_trend')
  const needCompare = t.blocks.some((b) => b.type === 'chart_compare')
  return {
    ...f,
    needSeries:
      f.showOrders || f.showSales || needTrend7 || needCompare ||
      toks.has('orders_count') || toks.has('sales_counted') || toks.has('sales_pending'),
    needTrend7,
    needCompare,
    needCancelled: f.showCancelled || toks.has('cancelled_count'),
    needTop3: f.showTopProducts,
    needPnl: f.showProfit,
    needCycle: f.attachCycleToDaily,
  }
}

// ─── markup ───────────────────────────────────────────────────────────────────

export type MarkupErrorCode = 'UNCLOSED_BOLD' | 'UNCLOSED_ACCENT' | 'UNCLOSED_TOKEN' | 'UNKNOWN_TOKEN' | 'BAD_NESTING'
export type MarkupResult = { ok: true; runs: Run[] } | { ok: false; code: MarkupErrorCode; message: string; label?: string }

const ERR: Record<Exclude<MarkupErrorCode, 'UNKNOWN_TOKEN'>, string> = {
  UNCLOSED_BOLD: 'ปิดเครื่องหมาย ** ให้ครบ',
  UNCLOSED_ACCENT: 'ปิดเครื่องหมาย ^^ ให้ครบ',
  UNCLOSED_TOKEN: 'ปิดวงเล็บปีกกา } ของตัวแปรให้ครบ',
  BAD_NESTING: 'เครื่องหมาย ** กับ ^^ ต้องปิดซ้อนกันให้ตรงลำดับ',
}

/**
 * `**…**` = ตัวหนา · `^^…^^` = เน้น · `{ป้าย}` = โทเคน · ซ้อนกันได้ (ปิดตามลำดับ)
 * ไม่ครบคู่/ป้ายไม่รู้จัก = error (ไม่ถือเป็นตัวอักษรธรรมดา — E-18) · ไม่มี escape (§11)
 */
export function parseMarkup(src: string): MarkupResult {
  const runs: Run[] = []
  const stack: ('b' | 'a')[] = []
  let buf = ''
  const flush = () => {
    if (!buf) return
    const b = stack.includes('b'), a = stack.includes('a')
    const last = runs[runs.length - 1]
    // รวม text ติดกันที่สไตล์เท่ากัน → รูป normalize เดียว (roundtrip)
    if (last && 't' in last && !!last.b === b && !!last.accent === a) last.t += buf
    else runs.push({ t: buf, ...(b ? { b: true as const } : {}), ...(a ? { accent: true as const } : {}) })
    buf = ''
  }
  for (let i = 0; i < src.length; ) {
    const two = src.slice(i, i + 2)
    if (two === '**' || two === '^^') {
      const k = two === '**' ? 'b' : 'a'
      flush()
      if (stack.includes(k)) {
        if (stack[stack.length - 1] !== k) return { ok: false, code: 'BAD_NESTING', message: ERR.BAD_NESTING }
        stack.pop()
      } else stack.push(k)
      i += 2
    } else if (src[i] === '{') {
      const end = src.indexOf('}', i)
      if (end < 0) return { ok: false, code: 'UNCLOSED_TOKEN', message: ERR.UNCLOSED_TOKEN }
      const label = src.slice(i, end + 1)
      const tok = TOKEN_BY_LABEL.get(label)
      if (!tok) return { ok: false, code: 'UNKNOWN_TOKEN', message: `ไม่รู้จักตัวแปร ${label}`, label }
      flush()
      const b = stack.includes('b'), a = stack.includes('a')
      runs.push({ tok, ...(b ? { b: true as const } : {}), ...(a ? { accent: true as const } : {}) })
      i = end + 1
    } else {
      buf += src[i]
      i += 1
    }
  }
  if (stack.length) {
    const k = stack[stack.length - 1]
    return { ok: false, code: k === 'b' ? 'UNCLOSED_BOLD' : 'UNCLOSED_ACCENT', message: k === 'b' ? ERR.UNCLOSED_BOLD : ERR.UNCLOSED_ACCENT }
  }
  flush()
  return { ok: true, runs }
}

/** runs → markup · เปิด/ปิดเฉพาะที่สไตล์เปลี่ยน (ตัวหนาอยู่นอก เน้นอยู่ใน) เพื่อให้ parse กลับได้รูปเดิม */
export function serializeMarkup(runs: readonly Run[]): string {
  let out = ''
  let open: ('b' | 'a')[] = []
  const MARK = { b: '**', a: '^^' } as const
  for (const r of runs) {
    const want: ('b' | 'a')[] = [...(r.b ? (['b'] as const) : []), ...(r.accent ? (['a'] as const) : [])]
    let k = 0
    while (k < open.length && k < want.length && open[k] === want[k]) k++
    for (let j = open.length - 1; j >= k; j--) out += MARK[open[j]]
    for (let j = k; j < want.length; j++) out += MARK[want[j]]
    open = want
    out += 't' in r ? r.t : TOKENS[r.tok]
  }
  for (let j = open.length - 1; j >= 0; j--) out += MARK[open[j]]
  return out
}

/** ความยาวต้นฉบับ: code point (ไม่ใช่ .length — สระไทยซ้อน/emoji) · โทเคนนับเป็นป้ายมาตรฐาน (AC-EXT-02-4) */
export function authoredLength(runs: readonly Run[]): number {
  let n = 0
  for (const r of runs) n += Array.from('t' in r ? r.t : TOKENS[r.tok]).length
  return n
}
