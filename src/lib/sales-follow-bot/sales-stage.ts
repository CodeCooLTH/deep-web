// 00095 TFR-FB-01/02 — สถานะการขายของห้อง "คำนวณ" จากออเดอร์ล่าสุด + ตราประทับ + จบรอบ (pure)
// ไม่เก็บเป็นแท็ก/คอลัมน์ (TD-FB-002) · นิยาม "ส่ง/ถึง/ปัญหา" ใช้ deriveShippingStage ตัวเดียว ห้ามเขียนรายชื่อ carrierStatus ซ้ำ (HR16)
import { deriveShippingStage, type ShippingStageKey } from '../order-stage'
import { isCODPayment } from '../order-display'
import type { ParcelCloseOutcome } from '../parcel-close'
import { HOLD_MS, type SalesStageKey } from './constants'

/** ออเดอร์ที่ตัวโหลดข้อเท็จจริง (S-3) ต้องส่งมา — รวมฟิลด์ที่ deriveShippingStage ใช้ + เวลาสำหรับตราประทับ */
export interface StageOrder {
  id: string
  shopId: string
  conversationId: string | null
  isDryRun: boolean
  status: string
  createdAt: Date
  paymentMethod: string | null
  paymentConfirmedAt: Date | null
  codReceivedAt: Date | null
  handedOverAt: Date | null
  // ── ฟิลด์ของ deriveShippingStage ──
  fulfillmentMode: string
  carrierStatus: string | null
  hasShipment: boolean
  hasManualTracking: boolean
  parcelClose: ParcelCloseOutcome | null
  /** OrderShipment.problemAt (ประทับครั้งเดียว) */
  problemAt: Date | null
  /** OrderShipment.deliveredAt (เขียนครั้งเดียว) */
  deliveredAt: Date | null
  events: { type: string; occurredAt: Date }[]
}

export interface SalesStageFacts {
  roomId: string
  shopId: string
  orders: readonly StageOrder[]
  /** createdAt ของ RealBuyerMsg ในห้องภายในขอบ 30 วัน (ลำดับไม่สำคัญ) */
  buyerMsgTimes: readonly Date[]
  now: Date
}

export interface SalesStageResult {
  key: SalesStageKey
  /** null = ไม่พบหลักฐานเวลา → รอบไม่จบเอง + ห้อง NOT_BOUGHT นั้นแนบไม่ได้ */
  stamp: Date | null
  /** ตั้งเมื่อสถานะที่ควรมีตราประทับแต่หาไม่เจอ — ผู้เรียกนับลง log (BR-FB-82 dry-run) */
  anomaly?: 'STAMP_MISSING'
}

/** สถานะออเดอร์ที่รู้จัก — ค่านอกนี้ = null (BR-FB-17) ไม่เดาเป็น NOT_BOUGHT */
export const KNOWN_ORDER_STATUSES = ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED', 'RETURNED'] as const

/**
 * ทุกค่า ShippingStageKey ต้องมีคำตอบ — Record ให้ tsc แดงเมื่อ order-stage.ts เพิ่มกองใหม่ (TC-009)
 * DRAFT = INVALID: E ตัด status DRAFTED ออกแล้ว จึงไม่มีทางเกิด ถ้าเจอ = คืน null (ค่าไม่รู้จัก)
 */
export const SHIPPING_STAGE_CLASS: Record<
  ShippingStageKey,
  'PROBLEM' | 'DONE' | 'SHIPPING' | 'PREPARING' | 'NOT_SHIPPING' | 'INVALID'
> = {
  DRAFT: 'INVALID',
  AWAITING_PARCEL: 'PREPARING',
  AWAITING_DISPATCH: 'PREPARING',
  AWAITING_PICKUP: 'PREPARING',
  SHIPPING: 'SHIPPING',
  // ของถึงปลายทางแล้วแค่รอเงิน COD = สำเร็จ (มติ gochat)
  AWAITING_COD: 'DONE',
  PROBLEM: 'PROBLEM',
  RETURNED: 'PROBLEM',
  DONE: 'DONE',
  NOT_SHIPPING: 'NOT_SHIPPING',
  DELIVERY_FAILED: 'PROBLEM',
}

/** ออเดอร์อ้างอิง E — ใบล่าสุดของห้องนี้ที่ไม่ใช่ร่าง/ทดสอบ (TFR-FB-01) */
export function selectReferenceOrder(orders: readonly StageOrder[], roomId: string, shopId: string): StageOrder | null {
  const cands = orders.filter(
    (o) => o.conversationId === roomId && o.shopId === shopId && o.status !== 'DRAFTED' && !o.isDryRun,
  )
  cands.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
  return cands[0] ?? null
}

/** ตารางแปลง 1-8 ของ TFR-FB-01 — ข้อแรกที่ตรงชนะ (ลำดับสำคัญ: ปัญหา/ยกเลิกต้องมาก่อน "สำเร็จ") */
export function classifyOrder(e: StageOrder): SalesStageKey | null {
  if (!(KNOWN_ORDER_STATUSES as readonly string[]).includes(e.status)) return null
  const cls =
    SHIPPING_STAGE_CLASS[
      deriveShippingStage({
        status: e.status,
        carrierStatus: e.carrierStatus,
        hasShipment: e.hasShipment,
        paymentMethod: e.paymentMethod,
        codReceivedAt: e.codReceivedAt,
        fulfillmentMode: e.fulfillmentMode,
        problemAt: e.problemAt,
        hasManualTracking: e.hasManualTracking,
        parcelClose: e.parcelClose,
      })
    ]
  if (cls === 'INVALID') return null
  // 1
  if (e.status === 'CANCELLED') return 'CANCELLED'
  // 2
  if (e.status === 'RETURNED' || e.parcelClose === 'LOST_ON_RETURN' || cls === 'PROBLEM') return 'PARCEL_PROBLEM'
  // 3
  if (e.status === 'CONFIRMED') return 'COMPLETED'
  // 4
  if (cls === 'DONE') return 'COMPLETED'
  // 5
  if (cls === 'NOT_SHIPPING' && e.handedOverAt) return 'COMPLETED'
  // 6
  if (cls === 'SHIPPING') return 'SHIPPED'
  // 7 — สลิปที่แนบไม่นับ (ไม่มีเวลาประทับ และลูกค้าส่งสลิปทางแชท = ข้อความจริงที่หยุดบอทอยู่แล้ว) · COD นับตั้งแต่เปิดบิล (OD-FB-1)
  if (isCODPayment(e.paymentMethod) || e.paymentConfirmedAt || e.codReceivedAt) return 'ORDER_CONFIRMED'
  // 8
  return 'BILLED'
}

type Agg = 'min' | 'max'

/** รวมผู้สมัครเวลา: ตัดค่า > now ทิ้งก่อน (ห้ามอนาคต) แล้วค่อย min/max — ไม่เหลือ = null */
function aggregate(cands: readonly (Date | null | undefined)[], now: Date, agg: Agg): Date | null {
  const ms = cands.filter((d): d is Date => !!d && d.getTime() <= now.getTime()).map((d) => d.getTime())
  if (ms.length === 0) return null
  return new Date(agg === 'min' ? Math.min(...ms) : Math.max(...ms))
}

/**
 * OrderEvent ทุกชนิดที่ stampOfOrder อ่าน — ตัวโหลดข้อเท็จจริง (S-3) ใช้กรอง event ตอน query
 * เพิ่มชนิดใน stampOfOrder แล้วลืมที่นี่ = stamp เป็น null เงียบ ๆ → มีเทสสแกนซอร์สบังคับ (sales-follow-facts.test.ts)
 */
export const STAMP_EVENT_TYPES = [
  'ORDER_CREATED',
  'MANUAL_DISPATCHED',
  'SHIPMENT_CREATED',
  'SHIPMENT_LINKED',
  'TRACKING_ADDED',
  'SELLER_DELIVERED',
  'BUYER_CONFIRMED',
  'SYSTEM_CONFIRMED',
  'COD_SETTLED',
  'HANDED_OVER',
  'RETURN_RECEIVED',
  'PARCEL_PROBLEM_CLOSED',
  'ORDER_CANCELLED',
] as const

/** เกณฑ์จบรอบ: RealBuyerMsg ที่ createdAt > ค่านี้ = รอบใหม่ (NOT_BOUGHT) · null = สถานะนี้ไม่จบรอบเอง/ไม่มีตราประทับ */
export function roundEndLimit(key: SalesStageKey, stamp: Date | null): Date | null {
  const hold = HOLD_MS[key]
  return hold !== undefined && stamp !== null ? new Date(stamp.getTime() + hold) : null
}

function eventTimes(e: StageOrder, types: readonly string[]): Date[] {
  return e.events.filter((x) => types.includes(x.type)).map((x) => x.occurredAt)
}

/** ตราประทับต่อสถานะ (TFR-FB-02) — ใช้ occurredAt ของเหตุการณ์จริง ไม่ใช่เวลาบันทึก */
export function stampOfOrder(key: SalesStageKey, e: StageOrder, now: Date): Date | null {
  const billed = () => {
    const created = eventTimes(e, ['ORDER_CREATED'])
    return aggregate(created.length > 0 ? created : [e.createdAt], now, 'min')
  }
  switch (key) {
    case 'BILLED':
      return billed()
    case 'ORDER_CONFIRMED':
      return isCODPayment(e.paymentMethod) ? billed() : aggregate([e.paymentConfirmedAt ?? e.codReceivedAt], now, 'min')
    case 'SHIPPED':
      // ไม่มีคอลัมน์ "เวลารับพัสดุครั้งแรก" ที่คงที่ → ใช้ event เป็นตัวแทน (R-FB-6)
      return aggregate(eventTimes(e, ['MANUAL_DISPATCHED', 'SHIPMENT_CREATED', 'SHIPMENT_LINKED', 'TRACKING_ADDED']), now, 'max')
    case 'COMPLETED':
      return aggregate(
        [e.deliveredAt, ...eventTimes(e, ['SELLER_DELIVERED', 'BUYER_CONFIRMED', 'SYSTEM_CONFIRMED', 'COD_SETTLED', 'HANDED_OVER'])],
        now,
        'min',
      )
    case 'PARCEL_PROBLEM':
      return aggregate([e.problemAt, ...eventTimes(e, ['RETURN_RECEIVED', 'PARCEL_PROBLEM_CLOSED'])], now, 'min')
    case 'CANCELLED':
      return aggregate(eventTimes(e, ['ORDER_CANCELLED']), now, 'max')
    case 'NOT_BOUGHT':
      return null
  }
}

/**
 * สถานะการขายของห้อง + ตราประทับ · null = ออเดอร์อ้างอิงมีสถานะที่ไม่รู้จัก (ผู้เรียก: ไม่แนบ/ไม่ตัดสิน STAGE_CHANGED + warn ครั้งเดียว)
 *
 * จบรอบ (ข): COMPLETED/SHIPPED/CANCELLED + RealBuyerMsg ที่ `> stamp + HOLD` → NOT_BOUGHT ตราประทับ = ข้อความแรกที่เกินพัก
 * เทียบเป็นมิลลิวินาทีฝั่ง JS ทั้งตอนแนบและตอนตรวจ (บทเรียน gochat #5)
 */
export function deriveSalesStage(f: SalesStageFacts): SalesStageResult | null {
  const e = selectReferenceOrder(f.orders, f.roomId, f.shopId)
  if (!e) return { key: 'NOT_BOUGHT', stamp: aggregate(f.buyerMsgTimes, f.now, 'min') }

  const key = classifyOrder(e)
  if (key === null) return null

  const stamp = stampOfOrder(key, e, f.now)
  const limitAt = roundEndLimit(key, stamp)
  if (limitAt !== null) {
    const limit = limitAt.getTime()
    // ข้อความแรกที่เกินพัก = ต่ำสุดของที่ > limit (ไม่พึ่งลำดับอาร์เรย์)
    const next = aggregate(
      f.buyerMsgTimes.filter((t) => t.getTime() > limit),
      f.now,
      'min',
    )
    if (next) return { key: 'NOT_BOUGHT', stamp: next }
  }
  return stamp === null ? { key, stamp, anomaly: 'STAMP_MISSING' } : { key, stamp }
}

const warnedUnknown = new Set<string>()
/** เตือนครั้งเดียวต่อ (orderId,status) — คืน true เมื่อเตือนจริง (TC-008) */
export function warnUnknownOrderStatusOnce(orderId: string, status: string, warn: (msg: string) => void = console.warn): boolean {
  const k = `${orderId}|${status}`
  if (warnedUnknown.has(k)) return false
  warnedUnknown.add(k)
  warn(`[sales-follow-bot] unknown order status order=${orderId} status=${status}`)
  return true
}
