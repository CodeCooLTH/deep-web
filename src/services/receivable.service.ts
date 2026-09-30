/**
 * receivable.service.ts — ยอดที่ยังเก็บเงินไม่ครบ (feature 00067 · แท็บ "ยอดเก็บเงิน")
 * SSOT: docs/20 - Features/00067 - Shop Finance Tabs/SRS.md TFR-005
 *
 * 🛑 **นิยาม "ยอดขาย" ของไฟล์นี้ต่างจาก `pnl.service.ts` โดยเจตนา** (Hard Rule 16)
 *   - ที่นี่นับออเดอร์ที่ `status != 'CANCELLED'` — การตามเก็บเงินต้องเห็นบิลที่ลูกค้ายังไม่ยืนยันด้วย
 *     ไม่งั้นใบที่ค้างจ่ายอยู่จริงจะหายไปจากลิสต์ตามเก็บ ซึ่งเป็นเหตุผลทั้งหมดที่ลิสต์นี้มีอยู่
 *   - `pnl.service` นับด้วย `revenueOrderWhere` (ยืนยันแล้ว/ขนส่งรับของแล้ว) เพราะกำไรต้องคิดจาก
 *     เงินที่เป็นของร้านจริงแล้วเท่านั้น
 * ⇒ **ตัวเลขสองแท็บนี้ไม่มีวันเท่ากัน และหน้าจอทั้งสองแท็บต้องเขียนนิยามของตัวเองกำกับเสมอ**
 * (มิเรอร์เหตุผลเดียวกับ `SALES_BASIS_NOTE` ใน product-sales-month.ts)
 */
import { prisma } from '@/lib/prisma'
import { round2 } from '@/lib/round2'
import { formatOrderNo } from '@/lib/order-no'
import { thaiDayKey } from '@/lib/format-date'
import { withoutDrafted } from '@/lib/order-visibility'
import type { ResolvedDateRange } from '@/lib/date-range'

/** ตัวข้อความอยู่ที่ lib (client component ใช้ได้ — ไฟล์นี้ import prisma) · re-export ให้ผู้เรียกเดิม */
export { RECEIVABLE_BASIS_NOTE } from '@/lib/finance-tabs'

export interface ReceivableSummary {
  /** ยอดบิลรวมในช่วง (ไม่นับใบที่ยกเลิก) */
  salesTotal: number
  /** เงินที่บันทึกรับจริงแล้ว (ไม่นับรายการที่ถูกยกเลิก) */
  receivedTotal: number
  /** salesTotal − receivedTotal — client ห้ามคำนวณเอง */
  outstandingTotal: number
  orderCount: number
  /** จำนวนบิลที่ยังค้างรับ (> 0 บาท) */
  outstandingCount: number
}

export interface ReceivableItem {
  orderId: string
  orderNo: string
  publicToken: string
  customerName: string
  /**
   * ห้องแชทต้นทางของบิลใบนี้ — `null` ได้ (ออเดอร์เก่าก่อน 2026-08-12 ไม่มีค่านี้โดยตั้งใจ)
   * 🛑 ห้าม derive จาก `Order → Customer → Conversation` เด็ดขาด นั่นคือบั๊กเดิมที่คอลัมน์นี้
   * ถูกสร้างขึ้นมาแก้ (ลูกค้าคนเดียวมีหลายเธรด แล้วเดาผิดห้อง) — `null` ⇒ client พาไปหน้าบิลแทน
   */
  conversationId: string | null
  /** ชื่อรายการแรกในบิล ใช้บอกว่า "งานอะไร" — ว่างได้ถ้าบิลไม่มีรายการ */
  title: string
  createdAt: string
  totalAmount: number
  receivedAmount: number
  outstandingAmount: number
  /** จำนวนวันตามปฏิทินไทยนับจากวันเปิดบิลถึงวันนี้ */
  daysOutstanding: number
}

export interface ReceivableResult {
  summary: ReceivableSummary
  items: ReceivableItem[]
  nextCursor: string | null
}

/** เพดานต่อหน้า — ผู้เรียกส่งมาได้ แต่ service เป็นคนบังคับขอบเขตสุดท้าย */
export const RECEIVABLE_LIMIT_DEFAULT = 20
export const RECEIVABLE_LIMIT_MAX = 50

const ORDER_SELECT = {
  id: true,
  publicToken: true,
  orderNo: true,
  createdAt: true,
  totalAmount: true,
  buyerName: true,
  conversationId: true,
  items: { select: { name: true }, take: 1 },
  // 🛑 ต้องกรอง voidedAt ที่ระดับ relation — รายการที่ร้านกดยกเลิก (คีย์ผิด) ยังอยู่ในตาราง
  // เพื่อเก็บประวัติ ถ้านับรวมจะได้ "รับแล้ว" มากกว่าความจริงแล้วยอดค้างหายไปเงียบ ๆ
  payments: { where: { voidedAt: null }, select: { amount: true } },
} as const

/**
 * นับจำนวนวันตามปฏิทินไทย — ไม่ใช่ผลต่าง timestamp หาร 86400000
 *
 * บิลที่เปิดเมื่อ 23:30 ของเมื่อวาน ต้องอ่านว่า "ค้าง 1 วัน" ไม่ใช่ "0 วัน" เพราะข้ามวันมาแล้ว
 * และ instant ของ server เป็น UTC บน Vercel จึงตัดวันเองไม่ได้
 */
export function daysOutstandingTH(createdAt: Date | string, now: Date = new Date()): number {
  const a = thaiDayKey(createdAt)
  const b = thaiDayKey(now)
  const toUtc = (key: string) => Date.parse(`${key}T00:00:00Z`)
  const diff = Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
  // บิลที่ลงวันที่ล่วงหน้า (feature 00033 อนุญาตถึง +7 วัน) ยังไม่ถือว่าค้าง
  return diff > 0 ? diff : 0
}

type OrderRow = {
  id: string
  publicToken: string
  orderNo: string | null
  createdAt: Date
  totalAmount: unknown
  buyerName: string | null
  conversationId: string | null
  items: { name: string }[]
  payments: { amount: unknown }[]
}

/**
 * ชื่อที่จะแสดงในลิสต์ — ห้ามคืนสตริงว่าง
 *
 * 🛑 ใช้ `Order.buyerName` เท่านั้น **ห้ามตกไปใช้เบอร์โทรเป็นชื่อ** — payload ของหน้านี้ถูก
 * serialize ลง RSC flight ทั้งก้อน การเอา `buyerContact` มาแสดงเท่ากับส่ง PII ของลูกค้าทุกคน
 * ในช่วงนั้นไปพร้อมกับหน้า (บทเรียน S-C1 2026-06-06: seller page รั่ว PII ลง flight payload
 * เพราะอยู่ใต้ client layout) — และตาราง `Customer` ไม่มีช่องชื่อให้ดึงอยู่แล้ว มีแต่ `phone`
 *
 * แถวที่ชื่อว่างเปล่าอ่านเป็น "ข้อมูลหาย" ทั้งที่จริง ๆ แค่ร้านไม่ได้กรอกชื่อ จึงต้องมีคำแทน
 */
export function receivableDisplayName(row: { buyerName: string | null }): string {
  const fromOrder = row.buyerName?.trim()
  if (fromOrder) return fromOrder
  return 'ไม่ระบุชื่อ'
}

function toItem(row: OrderRow, now: Date): ReceivableItem {
  const totalAmount = round2(Number(row.totalAmount))
  const receivedAmount = round2(row.payments.reduce((s, p) => s + Number(p.amount), 0))
  return {
    orderId: row.id,
    publicToken: row.publicToken,
    orderNo: row.orderNo ?? formatOrderNo(row.publicToken, row.createdAt),
    customerName: receivableDisplayName(row),
    conversationId: row.conversationId,
    title: row.items[0]?.name ?? '',
    createdAt: row.createdAt.toISOString(),
    totalAmount,
    receivedAmount,
    outstandingAmount: round2(totalAmount - receivedAmount),
    daysOutstanding: daysOutstandingTH(row.createdAt, now),
  }
}

export async function getReceivables(
  shopId: string,
  range: ResolvedDateRange,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<ReceivableResult> {
  const limit = Math.min(Math.max(opts.limit ?? RECEIVABLE_LIMIT_DEFAULT, 1), RECEIVABLE_LIMIT_MAX)
  const now = new Date()

  /**
   * ดึงออเดอร์ทั้งช่วงครั้งเดียวแล้วคิดใน memory — เหตุผล:
   * `outstandingAmount` เป็นผลลบของ aggregate ข้ามตาราง กรอง/เรียงที่ระดับ SQL ต้องใช้ subquery
   * ต่อแถว ซึ่งแพงกว่าและอ่านยากกว่า ส่วนจำนวนแถวต่อเดือนของร้านบริการอยู่หลักสิบถึงร้อย
   * (index `Order_shopId_createdAt` รองรับตัวกรองนี้อยู่แล้ว)
   *
   * 🛑 `summary` ต้องคิดจาก **ทุกแถวในช่วง** ไม่ใช่จากหน้าที่กำลังแสดง — ไม่งั้นยอดรวมบนหัว
   * จะเปลี่ยนไปเรื่อย ๆ ตามหน้าที่ผู้ใช้เลื่อนถึง
   */
  const rows = (await prisma.order.findMany({
    where: {
      shopId,
      /**
       * 🛑 ต้องใช้ `withoutDrafted('CANCELLED')` ไม่ใช่ `status: { not: 'CANCELLED' }`
       * ร่างออเดอร์ (00061) อยู่ในตารางเดียวกันด้วย `status='DRAFTED'` — เขียนแค่ not CANCELLED
       * จะนับร่างเป็นยอดค้างรับ แล้วร้านไปทวงเงินจากบิลที่ยังไม่เคยเปิดจริง
       * (Prisma รับ key `status` ได้ครั้งเดียว ⇒ เขียนสองบรรทัดจะทับกันเงียบ ๆ ต้องรวมเป็น notIn)
       */
      ...withoutDrafted('CANCELLED'),
      createdAt: { gte: range.orderRange.gte, lt: range.orderRange.lt },
    },
    select: ORDER_SELECT,
    orderBy: { createdAt: 'asc' },
  })) as unknown as OrderRow[]

  const all = rows.map((r) => toItem(r, now))

  let salesTotal = 0
  let receivedTotal = 0
  for (const it of all) {
    salesTotal += it.totalAmount
    receivedTotal += it.receivedAmount
  }
  salesTotal = round2(salesTotal)
  receivedTotal = round2(receivedTotal)

  /**
   * 🛑 บิลที่บันทึกรับเงินเกินยอด (คีย์ผิด/รวมบิลอื่น) ให้ `outstandingAmount` ติดลบ
   * ต้อง **ไม่อยู่ในลิสต์ตามเก็บ** (ตามเก็บยอดติดลบไม่มีความหมาย) แต่ยังนับใน summary ตามจริง
   * ⇒ `receivedTotal + outstandingTotal = salesTotal` ยังลงตัวเสมอ
   */
  const outstanding = all.filter((it) => it.outstandingAmount > 0)

  // เรียงจากบิลเก่าสุดก่อน = ใบที่ค้างนานที่สุดอยู่บนสุด (เรียงตาม createdAt asc อยู่แล้ว)
  const start = opts.cursor ? outstanding.findIndex((it) => it.orderId === opts.cursor) + 1 : 0
  // cursor ที่หาไม่เจอ → findIndex คืน -1 → start = 0 (เริ่มหน้าแรกใหม่ ไม่ throw ไม่คืนลิสต์ว่าง)
  const page = outstanding.slice(start, start + limit)
  const nextCursor = start + limit < outstanding.length ? (page[page.length - 1]?.orderId ?? null) : null

  return {
    summary: {
      salesTotal,
      receivedTotal,
      outstandingTotal: round2(salesTotal - receivedTotal),
      orderCount: all.length,
      outstandingCount: outstanding.length,
    },
    items: page,
    nextCursor,
  }
}
