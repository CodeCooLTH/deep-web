/**
 * validations.ts — Valibot schemas ของ owner API (SRS §8) · ไฟล์ feature-local (SDS TD-008)
 * กฎข้ามฟิลด์ (เช่น เปิดรายวันต้องมีเวลา) ตรวจที่ service บน state ที่รวมแล้ว ไม่ใช่ที่นี่
 */
import * as v from 'valibot'
import { authoredLength, BLOCK_LIMITS, MAX_BLOCKS, MAX_BUTTON_LABEL, MAX_TEXT_LENGTH, MAX_TITLE_LENGTH, TOKEN_KEYS, type BlockType, type TemplateV1 } from '@/lib/line-report/template'

export const ShopIdsSchema = v.pipe(
  v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
  v.minLength(1, 'เลือกร้านได้ 1–10 ร้าน'),
  v.maxLength(10, 'เลือกร้านได้ 1–10 ร้าน'),
  v.check((a) => new Set(a).size === a.length, 'เลือกร้านซ้ำกันไม่ได้'),
)

export const SlotMinutesSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(30),
  v.maxValue(1440),
  v.check((n) => n % 30 === 0, 'เวลาต้องเป็นทีละ 30 นาที'),
)

export const DailyTimesSchema = v.pipe(
  v.array(SlotMinutesSchema),
  v.maxLength(4, 'ตั้งได้ไม่เกิน 4 เวลา'),
  v.check((a) => new Set(a).size === a.length, 'เลือกเวลาซ้ำกันไม่ได้'),
)

/** null = สิ้นเดือน */
export const CutoffDaySchema = v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(31)))

export const CreateBindCodeSchema = v.object({
  shopIds: ShopIdsSchema,
  acknowledged: v.literal(true, 'ต้องยืนยันรับทราบก่อนสร้างโค้ด'),
})

export const UpdateSettingsSchema = v.pipe(
  v.strictObject({
    dailyEnabled: v.optional(v.boolean()),
    dailyTimes: v.optional(DailyTimesSchema),
    monthlyEnabled: v.optional(v.boolean()),
    cutoffDay: v.optional(CutoffDaySchema),
    showOrders: v.optional(v.boolean()),
    showSales: v.optional(v.boolean()),
    showCancelled: v.optional(v.boolean()),
    showTopProducts: v.optional(v.boolean()),
    showProfit: v.optional(v.boolean()),
    skipWhenNoOrders: v.optional(v.boolean()),
    attachCycleToDaily: v.optional(v.boolean()),
    confirmProfit: v.optional(v.boolean()),
  }),
  v.check((o) => Object.values(o).some((x) => x !== undefined), 'ต้องส่งอย่างน้อย 1 ค่า'),
)

export const ReplaceShopsSchema = v.object({ shopIds: ShopIdsSchema })
export const GroupIdParam = v.pipe(v.string(), v.minLength(1), v.maxLength(64))

export type CreateBindCodeInput = v.InferOutput<typeof CreateBindCodeSchema>
export type UpdateSettingsInput = v.InferOutput<typeof UpdateSettingsSchema>
export type ReplaceShopsInput = v.InferOutput<typeof ReplaceShopsSchema>

// ─── เทมเพลตข้อความ (EXT-02) ─────────────────────────────────────────────────────
// ข้อความของ v.check = รหัสกฎ (TemplateRule) — validateTemplate แปลงเป็น `rule` ให้ UI/route ใช้ต่อ

export type TemplateRule =
  | 'SHAPE' | 'EXTRA_FIELD' | 'BLOCK_TYPE' | 'TYPE_LIMIT' | 'TOTAL_LIMIT' | 'DUPLICATE_ID' | 'STYLE' | 'MEASURE'
  | 'TOKEN' | 'RUN_SHAPE' | 'TEXT_TOO_LONG' | 'TEXT_EMPTY' | 'TEXT_NEWLINE' | 'TITLE' | 'BUTTON_LABEL'

const cpLen = (s: string) => Array.from(s).length
const IdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(64))
const MeasureSchema = v.picklist(['sales', 'orders'], 'MEASURE')
const flagOnly = v.optional(v.literal(true))

const RunSchema = v.pipe(
  v.strictObject({
    t: v.optional(v.pipe(v.string(), v.minLength(1, 'RUN_SHAPE'), v.check((s) => !/[\r\n]/.test(s), 'TEXT_NEWLINE'))),
    tok: v.optional(v.picklist(TOKEN_KEYS, 'TOKEN')),
    b: flagOnly,
    accent: flagOnly,
  }),
  v.check((r) => (r.t === undefined) !== (r.tok === undefined), 'RUN_SHAPE'),
)

const TextBlockSchema = v.pipe(
  v.strictObject({
    id: IdSchema,
    type: v.literal('text'),
    style: v.strictObject({
      bold: v.boolean(),
      size: v.picklist(['s', 'm', 'l'], 'STYLE'),
      color: v.picklist(['ink', 'slate', 'accent'], 'STYLE'),
    }),
    runs: v.pipe(v.array(RunSchema), v.minLength(1, 'TEXT_EMPTY'), v.maxLength(60, 'TEXT_TOO_LONG')),
  }),
  // ข้อความว่างหลัง trim = บันทึกไม่ได้ (ไม่ส่ง "-") · โทเคนนับเป็นเนื้อหา
  v.check((b) => b.runs.some((r) => r.tok !== undefined || (r.t ?? '').trim() !== ''), 'TEXT_EMPTY'),
  // run ที่รูปผิด (RUN_SHAPE) ถูกรายงานไปแล้ว — ข้ามการนับแทนที่จะ throw
  v.check((b) => !b.runs.every((r) => (r.t === undefined) !== (r.tok === undefined)) || authoredLength(b.runs as never) <= MAX_TEXT_LENGTH, 'TEXT_TOO_LONG'),
)

const BlockSchema = v.variant(
  'type',
  [
    v.strictObject({ id: IdSchema, type: v.literal('orders') }),
    v.strictObject({ id: IdSchema, type: v.literal('sales') }),
    v.strictObject({ id: IdSchema, type: v.literal('cancelled') }),
    v.strictObject({ id: IdSchema, type: v.literal('shops'), top3: v.boolean(), profit: v.boolean() }),
    v.strictObject({ id: IdSchema, type: v.literal('cycle') }),
    v.strictObject({ id: IdSchema, type: v.literal('profit') }),
    v.strictObject({ id: IdSchema, type: v.literal('expense') }),
    v.strictObject({ id: IdSchema, type: v.literal('net_sales') }),
    TextBlockSchema,
    v.strictObject({ id: IdSchema, type: v.literal('separator') }),
    v.strictObject({ id: IdSchema, type: v.literal('chart_trend'), measure: MeasureSchema }),
    v.strictObject({ id: IdSchema, type: v.literal('chart_compare'), measure: MeasureSchema }),
  ],
  'BLOCK_TYPE',
)

const nonEmptyMax = (max: number, code: TemplateRule) =>
  v.pipe(v.string(), v.check((s) => s.trim() !== '' && cpLen(s) <= max && !/[\r\n]/.test(s), code))

export const TemplateSchema = v.strictObject({
  v: v.literal(1),
  title: v.optional(nonEmptyMax(MAX_TITLE_LENGTH, 'TITLE')),
  button: v.strictObject({ show: v.boolean(), label: nonEmptyMax(MAX_BUTTON_LABEL, 'BUTTON_LABEL') }),
  blocks: v.pipe(
    v.array(BlockSchema),
    v.maxLength(MAX_BLOCKS, 'TOTAL_LIMIT'),
    v.check((bs) => {
      const n: Partial<Record<BlockType, number>> = {}
      for (const b of bs) n[b.type] = (n[b.type] ?? 0) + 1
      return (Object.keys(n) as BlockType[]).every((k) => n[k]! <= BLOCK_LIMITS[k])
    }, 'TYPE_LIMIT'),
    v.check((bs) => new Set(bs.map((b) => b.id)).size === bs.length, 'DUPLICATE_ID'),
  ),
})

export type TemplateValidation = { ok: true; template: TemplateV1 } | { ok: false; rule: TemplateRule; blockId?: string }

const KNOWN_RULES = new Set<string>([
  'TYPE_LIMIT', 'TOTAL_LIMIT', 'DUPLICATE_ID', 'STYLE', 'MEASURE', 'TOKEN', 'RUN_SHAPE', 'TEXT_TOO_LONG', 'TEXT_EMPTY',
  'TEXT_NEWLINE', 'TITLE', 'BUTTON_LABEL', 'BLOCK_TYPE',
])

/** ตัวเดียวกันทั้ง client (ปุ่มบันทึก) และ server (ตรวจซ้ำ) — รายงาน issue แรก + id บล็อกที่ผิด (ถ้าอยู่ในบล็อก) */
export function validateTemplate(input: unknown): TemplateValidation {
  const r = v.safeParse(TemplateSchema, input)
  if (r.success) return { ok: true, template: r.output as unknown as TemplateV1 }
  const issue = r.issues[0]
  let blockId: string | undefined
  const path = issue.path ?? []
  for (let i = 1; i < path.length; i++) {
    const item = path[i], prev = path[i - 1]
    if (prev.key === 'blocks' && typeof item.key === 'number') {
      const id = (item.value as { id?: unknown } | undefined)?.id
      if (typeof id === 'string') blockId = id
    }
  }
  const rule: TemplateRule =
    issue.type === 'strict_object' && issue.expected === 'never' ? 'EXTRA_FIELD' : KNOWN_RULES.has(issue.message) ? (issue.message as TemplateRule) : 'SHAPE'
  return blockId ? { ok: false, rule, blockId } : { ok: false, rule }
}
