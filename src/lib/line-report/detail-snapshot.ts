/**
 * detail-snapshot.ts — สัญญาข้อมูลของหน้า "สรุปรายละเอียด" สาธารณะ (00070 EXT 2026-10-14 §4)
 *
 * pure (ไม่ import prisma) · เก็บใน LineReportSnapshot.payload
 * 🛑 strictObject: ไม่มีฟิลด์ buyerContact ดิบ/ที่อยู่/เลขออเดอร์/publicToken/ต้นทุน/กำไร โดยโครงสร้าง
 *    ฟิลด์เกินใน payload = parse ไม่ผ่าน (BR-LGS-40)
 * ตัวเลข/ส่วนที่ exposure ปิด ไม่อยู่ใน payload เลย ⇒ amount/bucket/buckets/total.sales เป็น optional
 */
import * as v from 'valibot'

export const MAX_ROWS_PER_SHOP = 150
export const MAX_EXPENSE_ROWS_PER_SHOP = 100
export const MAX_NOTE_LEN = 200
export const MAX_TITLE_LEN = 80
export const MAX_CUSTOMER_NAME_LEN = 60
export const MAX_PAYLOAD_BYTES = 400 * 1024

const nonNegInt = v.pipe(v.number(), v.integer(), v.minValue(0))

const OrderRowSchema = v.strictObject({
  at: v.string(),
  customerName: v.nullable(v.pipe(v.string(), v.maxLength(MAX_CUSTOMER_NAME_LEN))),
  phoneMasked: v.nullable(v.string()),
  title: v.pipe(v.string(), v.maxLength(MAX_TITLE_LEN)),
  amount: v.optional(v.number()),
  /** รูปสินค้า first-party (ลายเซ็น HMAC) เท่านั้น — ห้ามเก็บ URL ภายนอก (หน้าสาธารณะไม่โหลดของนอก) */
  imageUrl: v.optional(v.pipe(v.string(), v.startsWith('https://'), v.maxLength(500))),
  /** คีย์ช่องทางขาย (FACEBOOK/LINE/…) ไม่ใช่รูปเพจ */
  channel: v.optional(v.pipe(v.string(), v.maxLength(30), v.regex(/^[A-Z_]+$/))),
  axis: v.picklist(['CONFIRMED', 'PENDING', 'RETURNED']),
  bucket: v.optional(v.picklist([0, 1])),
})

const ExpenseRowSchema = v.strictObject({
  date: v.string(),
  category: v.string(),
  amount: v.number(),
  note: v.nullable(v.pipe(v.string(), v.maxLength(MAX_NOTE_LEN + 1))), // +1 = "…"
  system: v.optional(v.literal(true)),
})

const BucketSchema = v.strictObject({
  key: v.picklist(['COUNTED', 'PENDING', 'CLOSED', 'UNCLOSED']),
  label: v.string(),
  count: nonNegInt,
  amount: v.number(),
})

const ShopSchema = v.strictObject({
  name: v.string(),
  state: v.picklist(['OK', 'ERROR', 'EXCLUDED']),
  rule: v.picklist(['SERVICE', 'GENERAL']),
  /** คำเรียกใบ/คำหัวคอลัมน์ ตัดสินที่จุดเขียน (reportOrderWord / resolveProductVocab) — หน้าไม่พิมพ์เอง */
  orderWord: v.string(),
  itemColLabel: v.string(),
  excludedReason: v.optional(v.string()),
  orders: nonNegInt,
  sales: v.optional(v.number()),
  cancelled: v.optional(nonNegInt),
  buckets: v.optional(v.tuple([BucketSchema, BucketSchema])),
  rows: v.array(OrderRowSchema),
  rowsTotal: nonNegInt,
  rowsTruncated: v.boolean(),
  expense: v.optional(
    v.strictObject({
      recorded: v.boolean(),
      total: v.number(),
      rows: v.array(ExpenseRowSchema),
      rowsTotal: nonNegInt,
      rowsTruncated: v.boolean(),
    }),
  ),
  parity: v.optional(v.literal('MISMATCH')),
})

export const DetailSnapshotSchema = v.strictObject({
  v: v.literal(1),
  kind: v.picklist(['DAILY', 'MONTHLY', 'TEST', 'COMMAND']),
  window: v.strictObject({
    startIso: v.string(),
    endIso: v.string(),
    fullDay: v.optional(v.boolean()),
    computedAt: v.string(),
  }),
  title: v.string(),
  orderWord: v.string(),
  orderWordMixed: v.boolean(),
  mixedFinanceRules: v.boolean(),
  expiresAt: v.string(),
  exposure: v.strictObject({
    orders: v.boolean(),
    sales: v.boolean(),
    cancelled: v.boolean(),
    expense: v.boolean(),
  }),
  total: v.strictObject({
    orders: nonNegInt,
    sales: v.optional(v.number()),
    cancelled: v.optional(nonNegInt),
  }),
  shops: v.array(ShopSchema),
})

export type DetailSnapshotV1 = v.InferOutput<typeof DetailSnapshotSchema>
export type DetailShop = DetailSnapshotV1['shops'][number]
export type Bucket = v.InferOutput<typeof BucketSchema>
export type OrderRow = v.InferOutput<typeof OrderRowSchema>
export type ExpenseRow = v.InferOutput<typeof ExpenseRowSchema>

/** ไม่ผ่าน = null (ผู้เรียกแสดงหน้า error เป็นกลาง ไม่ 500 ดิบ) */
export function parseSnapshot(raw: unknown): DetailSnapshotV1 | null {
  const r = v.safeParse(DetailSnapshotSchema, raw)
  return r.success ? r.output : null
}

const sizeOf = (s: DetailSnapshotV1) => Buffer.byteLength(JSON.stringify(s), 'utf8')

/**
 * ลดเพดานแถวต่อร้านลงครึ่งหนึ่งซ้ำจน payload ≤ 400KB
 * ไม่แตะ total/orders/sales/buckets — ยอดมาจากชุดเต็ม ไม่ใช่แถวที่ตัด (partial-data-must-be-labeled)
 * rowsTotal ไม่ถูกแตะ; rowsTruncated = true เมื่อแถวที่เหลือน้อยกว่า rowsTotal
 */
export function fitToBudget(s: DetailSnapshotV1, maxBytes = MAX_PAYLOAD_BYTES): DetailSnapshotV1 {
  let rowCap = MAX_ROWS_PER_SHOP
  let expCap = MAX_EXPENSE_ROWS_PER_SHOP
  const build = (): DetailSnapshotV1 => ({
    ...s,
    shops: s.shops.map((sh) => {
      const rows = sh.rows.slice(0, rowCap)
      const out: DetailShop = { ...sh, rows, rowsTruncated: sh.rowsTruncated || rows.length < sh.rowsTotal }
      if (sh.expense) {
        const er = sh.expense.rows.slice(0, expCap)
        out.expense = { ...sh.expense, rows: er, rowsTruncated: sh.expense.rowsTruncated || er.length < sh.expense.rowsTotal }
      }
      return out
    }),
  })
  let out = build()
  while (sizeOf(out) > maxBytes && (rowCap > 0 || expCap > 0)) {
    rowCap = Math.floor(rowCap / 2)
    expCap = Math.floor(expCap / 2)
    out = build()
  }
  return out
}
