/**
 * types.ts — สัญญาข้อมูลของ feature 00068 (รายงานสรุปยอดเข้ากลุ่ม LINE) · SDS §3.1/§3.2
 *
 * 🛑 string union ด้านล่างต้อง **ตรงกับ enum ใน prisma/schema.prisma** (DATABASE.md §3) ทุกตัวอักษร —
 * ไม่ import `@prisma/client` ตั้งใจ: lib ชุดนี้เป็น pure ใช้เทสได้โดยไม่ต้อง generate schema
 */

export type LineReportGroupStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'REMOVED'
/** ตรงกับ enum LineReportDeliveryKind — เรียกสั้นว่า ReportKind ในโค้ดชั้นบน */
export type ReportKind = 'DAILY' | 'MONTHLY' | 'TEST' | 'COMMAND' | 'FINAL_NOTICE'
export type LineReportDeliveryStatus =
  | 'CLAIMED'
  | 'RETRY_PENDING'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED_NO_ORDERS'
  | 'MISSED'
  | 'NO_SENDABLE_SHOPS'
  | 'REPLY_FAILED'
export type LineReportAlertKind = 'BOT_REMOVED' | 'SEND_FAILED' | 'NO_SENDABLE_SHOPS'
export type LineReportRateKind = 'BIND_ATTEMPT' | 'COMMAND'

export type ShopRef = {
  id: string
  name: string
  /** `Shop.vertical` ดิบ — ตัดสินกติกาการเงินด้วย `usesServiceFinanceRules` เท่านั้น */
  vertical: string | null
}

/** ช่วงวันที่ไทย inclusive `[startIso, endIso]` (YYYY-MM-DD) + เวลาที่คำนวณ (ISO UTC) */
export type Window = {
  startIso: string
  endIso: string
  computedAt: string
  /** slot 24:00 = ยอดครบทั้งวัน (ป้าย "ครบทั้งวัน") — ไม่ตั้ง = สะสมถึง computedAt */
  fullDay?: boolean
}

export type DueSlot = {
  slotKey: string
  dateIso: string
  /** นาที 30..1440 (1440 = 24:00) */
  minutes: number
  fireAtMs: number
}

export type Top3Row = { name: string; qty: number; amount: number }

/** กำไรของร้านเดียว — `capped` = ข้อมูลไม่ครบ (ป้ายเพดานจาก profitDisplay) */
export type ShopProfit = { netProfit: number; capped: boolean }

/**
 * ผลของร้านเดียว · `orders`/`cancelled` = จำนวนใบ · `confirmed`/`unconfirmed` = ยอดเงินบาท
 * (confirmedValues / unconfirmedValues ของ getSalesSeries) · ERROR/EXCLUDED ไม่นับในยอดรวม
 */
export type ShopSummary = {
  shop: ShopRef
  state: 'OK' | 'ERROR' | 'EXCLUDED'
  /** เหตุที่ตัดออก (EXCLUDED) เช่น 'LOCKED' | 'DELETED' | 'PURGED' */
  excludedReason?: string
  orders: number
  confirmed: number
  unconfirmed: number
  cancelled: number
  top3?: Top3Row[]
  /** getProductSalesMonth ตัดข้อมูลเพราะชนเพดาน (เดือนใดเดือนหนึ่งในช่วง) — อันดับคำนวณจากข้อมูลบางส่วน ต้องมีหมายเหตุ */
  top3Truncated?: boolean
  profit?: ShopProfit
}

export type Totals = { orders: number; confirmed: number; unconfirmed: number; cancelled: number }

export type GroupSummary = {
  window: Window
  shops: ShopSummary[]
  /** ไม่มีเมื่อกลุ่มมีร้านเดียว */
  total?: Totals
  /** false = ผสมกติกาการเงินต่างกัน ห้ามรวมกำไร */
  profitSummable: boolean
  mixedFinanceRules: boolean
}
