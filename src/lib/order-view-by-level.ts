/**
 * order-view-by-level — ออเดอร์ที่ "ไม่มีเงิน" สำหรับบทบาทที่ระดับเงิน NONE (ช่าง) — 00071 P3 · S-15
 *
 * ทำไมเป็น allow-list ไม่ใช่ deny-list: service ดึง `include` ทั้งแถว (คอลัมน์ใหม่ที่ใครเติมใน schema จะไหลลง
 * response อัตโนมัติ) ถ้าเขียนเป็น "ลบคีย์เงินออก" คอลัมน์เงินตัวใหม่จะรั่วเงียบ ๆ ทุกครั้ง — ที่นี่เป็น
 * "ยอมให้ผ่านเฉพาะคีย์ที่รู้จัก" คีย์ใหม่จึงหายไปเองจนกว่าจะมีคนมาเติมที่นี่ (และเทสจะบังคับให้เติมแบบรู้ตัว)
 * ตัดด้วย "ไม่มีคีย์" ไม่ใช่ null/0 (null = ยังไม่ตั้ง · 0 = โกหก) — docs/conventions/permission-gate-follows-the-row.md
 *
 * ไฟล์บริสุทธิ์ (client import ได้) — ใช้ที่ทุกทางออกของแถวออเดอร์: DAL ของหน้า RSC, GET /api/orders,
 * GET /api/orders/[token], appointments/day, ไทม์ไลน์
 */
import type { OrderEventView } from '@/lib/order-event'

/** คีย์ระดับใบที่หน้ารายการ/รายละเอียดของช่างใช้จริง — ห้ามมีคีย์เงิน (เทส `order-view-by-level.test.ts` บังคับ) */
export const NO_MONEY_ORDER_KEYS = [
  'id', 'publicToken', 'orderNo', 'shortCode', 'status', 'type', 'createdAt', 'salesChannel',
  'fulfillmentMode', 'buyerName', 'buyerContact', 'buyerUserId', 'customerId', 'conversationId',
  'auctionId', 'internalNote', 'shippingAddress',
  // นัดหมาย
  'serviceStart', 'serviceEnd', 'serviceResourceId', 'appointmentStatus', 'rescheduleRequestNote',
  // feature 00086 — แบบการมา (จองล่วงหน้า/หน้าร้าน) ไม่ใช่เงิน · ช่างต้องเห็นว่าลูกค้ายืนรออยู่หรือจองมา
  'arrivalMode',
  // feature 00073 — วันปิดงาน (สถานะงาน ไม่ใช่เงิน) · ช่างปิดงานได้ (O4) จึงต้องเห็นว่าปิดแล้วหรือยัง
  'serviceClosedAt',
  // feature 00078 — เวลาเริ่มงาน (เวลา ไม่ใช่เงิน) · ช่างกดเริ่มงานได้ (O4)
  'serviceStartedAt',
  // feature 00086 P3 — ผู้รับผิดชอบ + เวลาทำเสร็จ (คน/เวลา ไม่ใช่เงิน) · ช่างต้องรู้ว่างานของใคร และทำเสร็จหรือยัง
  'assignedUserId', 'serviceFinishedAt',
  // นัดรับ/ข้อพิพาท (สถานะงาน ไม่ใช่เงิน)
  'handedOverAt', 'disputeOpenedAt', 'disputeResolvedAt', 'accessUrl',
] as const

export const NO_MONEY_ITEM_KEYS = ['id', 'productId', 'name', 'description', 'qty'] as const
/** ไม่มี carrierPrice / estimatedPrice / codFee / codAmount */
export const NO_MONEY_SHIPMENT_KEYS = [
  'id', 'trackingNo', 'courierCode', 'courierName', 'provider', 'carrierStatus', 'carrierStatusAt', 'status',
  'isDryRun', 'direction', 'problemAt', 'problemClosedAt', 'problemCloseOutcome', 'returnStartedAt', 'returnedAt', 'returnDispatchedAt', 'createdAt',
] as const
const TRACKING_KEYS = ['trackingNo', 'provider', 'createdAt'] as const
const RESOURCE_KEYS = ['id', 'name', 'capacity'] as const
const CHANNEL_KEYS = ['avatarUrl', 'provider', 'name'] as const
const BUYER_KEYS = ['id', 'displayName', 'username', 'avatar'] as const
/** feature 00086 — ผู้รับผิดชอบ: ชื่อเท่านั้น (ไม่มีเบอร์/อีเมล/username) */
const ASSIGNEE_KEYS = ['id', 'displayName'] as const
/** feature 00086 — รูป/บันทึกก่อน-หลังทำ · ไม่มี orderId/shopId/createdByUserId (ชื่อคนกดมาทาง createdBy.displayName) */
const JOB_RECORD_KEYS = ['phase', 'note', 'fileIds', 'createdAt'] as const
const JOB_RECORD_CREATOR_KEYS = ['displayName'] as const

/**
 * คีย์ที่ห้ามโผล่ใน payload ของบทบาทระดับ NONE ที่ความลึกใดก็ตาม — ใช้เป็นฉากกั้นในเทส (ไม่ใช่ตัวกรองจริง)
 * `amount` = จำนวนเงินใน meta ของเหตุการณ์/แถวชำระ · `money` = ผล deriveMoney/computeOrderMoney
 */
export const NO_MONEY_FORBIDDEN_KEYS: readonly string[] = [
  'totalAmount', 'discount', 'vatRate', 'vatAmount', 'depositAmount', 'draftStatedTotalAmount', 'price', 'cost',
  'payments', 'payment', 'paymentMethod', 'paymentConfirmedAt', 'codReceivedAt', 'slipFileId', 'money', 'amount',
  'carrierPrice', 'estimatedPrice', 'codFee', 'codAmount', 'refundAmount', 'shippingCost', 'paymentFrom',
  'totalText', 'depositText', 'serviceMoney', 'outstanding', 'totalReceived',
  // 00078 — ต้นทุนส่งเอง (ต้นทุนของร้าน)
  'outboundShippingCost',
]

type Rec = Record<string, unknown>

function pick(src: unknown, keys: readonly string[]): Rec {
  const out: Rec = {}
  if (!src || typeof src !== 'object') return out
  for (const k of keys) if (Object.hasOwn(src, k)) out[k] = (src as Rec)[k]
  return out
}

function pickOne(src: unknown, keys: readonly string[]): Rec | null | undefined {
  return src == null ? (src as null | undefined) : pick(src, keys)
}

/**
 * ออเดอร์ (ผลจาก prisma include ใด ๆ) → รูปที่ไม่มีเงินเลย
 * ลูกที่รู้จักเท่านั้น: items / shipments / shipmentTracking / serviceResource / shopChannel / buyer
 *   + (00086) assignedUser / serviceJobRecords[].createdBy — pick ระดับลูกด้วย allow-list เหมือนกัน
 */
export function toNoMoneyOrder(order: object): Rec {
  const o = order as Rec
  const out = pick(o, NO_MONEY_ORDER_KEYS)
  if (Array.isArray(o.items)) {
    out.items = o.items.map((it: unknown) => {
      const row = pick(it, NO_MONEY_ITEM_KEYS)
      const product = (it as Rec | null)?.product
      if (product && typeof product === 'object') row.product = pick(product, ['images'])
      return row
    })
  }
  if (Array.isArray(o.shipments)) out.shipments = o.shipments.map((s: unknown) => pick(s, NO_MONEY_SHIPMENT_KEYS))
  if ('shipmentTracking' in o) out.shipmentTracking = pickOne(o.shipmentTracking, TRACKING_KEYS)
  if ('serviceResource' in o) out.serviceResource = pickOne(o.serviceResource, RESOURCE_KEYS)
  if ('shopChannel' in o) out.shopChannel = pickOne(o.shopChannel, CHANNEL_KEYS)
  if ('buyer' in o) out.buyer = pickOne(o.buyer, BUYER_KEYS)
  if ('assignedUser' in o) out.assignedUser = pickOne(o.assignedUser, ASSIGNEE_KEYS)
  if (Array.isArray(o.serviceJobRecords)) {
    out.serviceJobRecords = o.serviceJobRecords.map((r: unknown) => {
      const row = pick(r, JOB_RECORD_KEYS)
      // ลูกของลูกก็ allow-list: include createdBy ทั้งแถว User จะไม่ไหลลง payload ของช่าง
      if ((r as Rec | null) && 'createdBy' in (r as Rec)) row.createdBy = pickOne((r as Rec).createdBy, JOB_RECORD_CREATOR_KEYS)
      return row
    })
  }
  return out
}

/**
 * นัดของวัน (GET appointments/day) → ตัดยอด/มัดจำ + ห้องแชทเมื่อไม่มี H1
 * conversationId เป็น null (ไม่ใช่ตัดคีย์) เพราะ type ฝั่งจอกำหนดไว้ว่า null = ไม่มีเธรดให้เปิด
 */
export function toNoMoneyAppointmentDay<T extends object>(item: T, opts: { canChat: boolean }): Omit<T, 'totalAmount' | 'depositAmount'> {
  const { totalAmount: _t, depositAmount: _d, ...rest } = item as T & { totalAmount?: unknown; depositAmount?: unknown }
  const r = rest as Rec
  if (!opts.canChat && 'conversationId' in r) r.conversationId = null
  return r as Omit<T, 'totalAmount' | 'depositAmount'>
}

/**
 * เหตุการณ์ที่เล่าเรื่องเงิน — ช่างไม่เห็นทั้งบรรทัด (label เองก็บอกวิธี/สถานะการชำระ)
 *  - COD_SETTLED: meta.amount + "ขนส่งโอนเงินเก็บปลายทาง" · PAYMENT_CONFIRMED/REVERTED: ร้านรับเงินแล้ว/ถอน
 *  - PAYMENT_METHOD_SYNCED: meta.amount + paymentFrom (วิธีชำระ)
 *  - SYSTEM_CONFIRMED: describeOrderEvent พูดว่า "ยืนยันว่าเก็บเงินปลายทางและโอนเข้าร้านแล้ว" ทุกกรณี
 * ที่เหลือไม่มี amount ใน meta (ยืนยันจาก OrderEventMeta) — ยังคัดคีย์เงินออกซ้ำอีกชั้นเผื่อคนเติม meta ทีหลัง
 */
const MONEY_EVENT_TYPES: ReadonlySet<string> = new Set([
  'COD_SETTLED', 'PAYMENT_CONFIRMED', 'PAYMENT_CONFIRM_REVERTED', 'PAYMENT_METHOD_SYNCED', 'SYSTEM_CONFIRMED',
])

export function filterOrderEventsForNoMoney(events: readonly OrderEventView[]): OrderEventView[] {
  return events
    .filter((e) => !MONEY_EVENT_TYPES.has(e.type))
    .map((e) => {
      const { amount: _a, paymentFrom: _p, ...meta } = e.meta
      return { ...e, meta }
    })
}
