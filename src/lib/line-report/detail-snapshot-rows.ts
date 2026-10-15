/**
 * detail-snapshot-rows.ts — pure: แปลงใบสั่งซื้อ/ค่าใช้จ่าย → แถวใน snapshot (00070 EXT-LINK FR-03/04)
 *
 * PII ถูกตัดที่นี่ที่เดียว: input มี buyerContact ดิบ แต่ OrderRow ไม่มีฟิลด์นั้น (BR-LGS-40)
 */
import { GENERIC_SALES_LEGEND } from '@/lib/line/flex-report-blocks'
import { EXPENSE_CATEGORY_LABEL_TH, type ExpenseCategory } from '@/lib/expense'
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import { maskPhoneForGuest } from '@/lib/order-pii-mask'
import { countsAsRevenue } from '@/lib/order-revenue'
import {
  MAX_CUSTOMER_NAME_LEN,
  MAX_NOTE_LEN,
  MAX_TITLE_LEN,
  type ExpenseRow,
  type OrderRow,
} from './detail-snapshot'

export type DetailRule = 'SERVICE' | 'GENERAL'

export const ruleOf = (vertical: string | null | undefined): DetailRule =>
  usesServiceFinanceRules(vertical) ? 'SERVICE' : 'GENERAL'

export interface OrderRowInput {
  createdAt: Date | string
  status: string
  serviceClosedAt: Date | string | null
  totalAmount: number
  buyerName: string | null
  buyerContact: string | null
  items: { name: string; qty: number }[]
  room: { name: string } | null
  imageUrl?: string
  channel?: string | null
  shipments?: { status: string; isDryRun: boolean; carrierStatus: string | null; direction: string }[] | null
}

/**
 * partition ของชุดใบเดียวกับการ์ด (BR-LGS-39) — SERVICE แบ่งด้วย serviceClosedAt ตรง ๆ
 * 🛑 ห้ามใช้ countsAsServiceRevenue: มันตัด RETURNED/CANCELLED/DRAFTED ผลรวมจะไม่เท่าการ์ด (F-6)
 * 0 = ก้อนแรก (ปิดงานแล้ว/ยืนยันแล้ว) · 1 = ก้อนสอง
 */
export function classifyBucket(
  order: Pick<OrderRowInput, 'status' | 'serviceClosedAt' | 'shipments'>,
  rule: DetailRule,
): 0 | 1 {
  if (rule === 'SERVICE') return order.serviceClosedAt != null ? 0 : 1
  return countsAsRevenue({ status: order.status, shipments: order.shipments }) ? 0 : 1
}

export function bucketLabels(rule: DetailRule): [string, string] {
  return rule === 'SERVICE'
    ? ['ปิดงานแล้ว', 'รอปิดงาน']
    : [GENERIC_SALES_LEGEND.counted, GENERIC_SALES_LEGEND.pending ?? 'รอยืนยัน']
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

/** ชื่อที่ผู้ขายพิมพ์เบอร์/อีเมลมาในช่องชื่อ → ทิ้งทั้งชื่อ (maskPhoneForGuest ไม่ครอบชื่อ) */
function safeCustomerName(name: string | null): string | null {
  const t = (name ?? '').trim()
  if (!t || t.includes('@') || (t.match(/\d/g)?.length ?? 0) >= 7) return null
  return clip(t, MAX_CUSTOMER_NAME_LEN)
}

// ไม่มี item/ห้อง: ป้ายกลาง "รายการ" — ไม่ผันตาม vertical เพราะ input ไม่รู้ vertical (ORDER_VOCAB.noun ผันต่อ vertical ได้ถ้าต้องการ)
const FALLBACK_TITLE = 'รายการ'

function titleOf(i: OrderRowInput): string {
  // shortcut: OrderItem ไม่มีฟิลด์เรียง "ชิ้นแรก" ไม่ deterministic — ยอมรับได้ ถ้าต้องนิ่งให้เพิ่ม orderBy ที่ query
  const first = i.items[0]
  if (first) {
    const more = i.items.length - 1
    const base = more > 0 ? `${first.name} และอีก ${more} รายการ` : first.name
    return clip(base, MAX_TITLE_LEN)
  }
  if (i.room) return clip(i.room.name, MAX_TITLE_LEN)
  return FALLBACK_TITLE
}

/**
 * แกนของการ์ด (ไม่ใช่ OrderStatus ดิบ): หน้าแปลงเป็นป้าย — ใบ SHIPPED ที่ขนส่งรับแล้วต้องเป็น "ยืนยันแล้ว" ตรงหัว
 * RETURNED ไม่เคยเป็น countsAsRevenue จึงเช็คก่อนเพื่อให้ได้ป้ายของตัวเอง
 */
export function axisOf(order: Pick<OrderRowInput, 'status' | 'shipments'>): OrderRow['axis'] {
  if (order.status === 'RETURNED') return 'RETURNED'
  return countsAsRevenue({ status: order.status, shipments: order.shipments }) ? 'CONFIRMED' : 'PENDING'
}

export function toOrderRow(i: OrderRowInput, rule: DetailRule): OrderRow {
  return {
    at: new Date(i.createdAt).toISOString(),
    customerName: safeCustomerName(i.buyerName),
    phoneMasked: maskPhoneForGuest(i.buyerContact),
    title: titleOf(i),
    amount: i.totalAmount,
    ...(i.imageUrl ? { imageUrl: i.imageUrl } : {}),
    ...(i.channel ? { channel: i.channel } : {}),
    axis: axisOf(i),
    bucket: classifyBucket(i, rule),
  }
}

export function toExpenseRow(i: {
  date: Date | string
  category: string
  amount: number
  note: string | null
  system?: boolean
}): ExpenseRow {
  // โน้ตเป็นข้อความอิสระ — ปิดอีเมล/เลขยาว ≥7 หลัก (เบอร์/บัญชี) ก่อนขึ้นหน้าสาธารณะ (security L-2)
  const note = (i.note ?? '').trim().replace(/\S+@\S+/g, '•••').replace(/\d[\d\s-]{5,}\d/g, (m) => (m.replace(/\D/g, '').length >= 7 ? '•••' : m))
  return {
    date: new Date(i.date).toISOString(),
    category: EXPENSE_CATEGORY_LABEL_TH[i.category as ExpenseCategory] ?? i.category,
    amount: i.amount,
    // ตัดที่ 200 ตัวแล้วต่อ … (รวม 201)
    note: note ? (note.length > MAX_NOTE_LEN ? `${note.slice(0, MAX_NOTE_LEN)}…` : note) : null,
    ...(i.system ? { system: true as const } : {}),
  }
}
