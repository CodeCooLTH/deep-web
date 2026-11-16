/**
 * orders-filter — SSOT ของ "ตัวกรองทั้งชุด" ในหน้า /orders (โมดัลเดียวทุกจอ · 2026-11-15)
 *
 * pure module — ห้าม import prisma/server-only/React (ใช้ทั้ง OrdersList, โมดัล, และเทส)
 *
 * ทำไมรวมไว้ที่เดียว: เดิมตัวกรองกระจายเป็น TanStack column filter (สถานะ/ขนส่ง/ช่วงเวลา — หายเมื่อรีเฟรช)
 * + useState ของมือถือ + `?stage=` ใน URL ⇒ สองจอกรองไม่เท่ากัน และ predicate ถูกเขียนซ้ำคนละที่
 * ตอนนี้ทุกแกนอยู่ใน URL และใช้ predicate ตัวเดียว (docs/conventions/sibling-surface-parity.md,
 * ui-boolean-needs-a-testable-home.md)
 *
 * "แถวละ N" ไม่ใช่ตัวกรอง — ไม่อยู่ในไฟล์นี้ ไม่นับ badge ไม่ถูกล้าง
 */
import { SHIPPING_STAGE_LABEL } from './order-stage'
import { isAppointmentStatus } from './appointment-stage'
import { isOrderDatePreset, isSpecificDay, matchesOrderDateFilter } from './order-date-filter'

/** ค่าพิเศษของ `?ad=` = ออเดอร์ที่ไม่ได้มาจากโฆษณา (ไม่ชนกับ adId เพราะ adId เป็นตัวเลขล้วน) */
export const AD_NONE = 'none'
export const ORDER_TYPE_KEYS = ['PHYSICAL', 'DIGITAL', 'SERVICE'] as const
export const FULFILLMENT_KEYS = ['SHIPPED', 'PICKUP'] as const
/** พารามิเตอร์ URL ที่โมดัลนี้เป็นเจ้าของ — ล้าง/เขียนทับเฉพาะชุดนี้ ไม่แตะ `q`/`work`/`apptDay` */
export const ORDERS_FILTER_PARAMS = ['status', 'stage', 'appt', 'fulfillment', 'courier', 'date', 'type', 'ad'] as const

const AD_ID_RE = /^\d{1,30}$/
const COURIER_MAX = 80

export type OrdersFilters = {
  /** Order.status ดิบ · null = ทั้งหมด */
  status: string | null
  stage: string | null
  /** 'NONE' | AppointmentStatus */
  appt: string | null
  fulfillment: (typeof FULFILLMENT_KEYS)[number] | null
  /** ชื่อขนส่งที่แสดงจริง หรือ 'NONE' (ยังไม่เปิดพัสดุ) */
  courier: string | null
  /** 'All' | preset | 'YYYY-MM-DD' */
  date: string
  type: (typeof ORDER_TYPE_KEYS)[number] | null
  /** OR ภายในแกนนี้ · มี AD_NONE ปนได้ */
  ads: string[]
}

export const EMPTY_ORDERS_FILTERS: OrdersFilters = {
  status: null,
  stage: null,
  appt: null,
  fulfillment: null,
  courier: null,
  date: 'All',
  type: null,
  ads: [],
}

type ParamSource = { get(k: string): string | null; getAll(k: string): string[] }

/** ค่าที่ validate จากข้อมูลจริงของหน้าได้เท่านั้น (สถานะที่ร้านมี · ขนส่งที่เคยใช้) — ไม่ส่ง = ตรวจแค่รูปร่าง */
export type KnownValues = { status?: ReadonlySet<string>; courier?: ReadonlySet<string> }

/**
 * อ่านตัวกรองจาก URL — ค่าที่ไม่รู้จักถูกทิ้งเงียบ ๆ (fail-open) ไม่ throw
 * ลิงก์เก่า/พิมพ์มั่วต้องไม่ทำให้หน้าว่างเปล่าโดยไม่มีคำอธิบาย
 */
export function parseOrdersFilters(params: ParamSource, known: KnownValues = {}): OrdersFilters {
  const status = params.get('status')
  const stage = params.get('stage')
  const appt = params.get('appt')
  const fulfillment = params.get('fulfillment')
  const courier = params.get('courier')
  const date = params.get('date')
  const type = params.get('type')
  const ads = [...new Set(params.getAll('ad').filter((v) => v === AD_NONE || AD_ID_RE.test(v)))]

  return {
    status:
      status && status !== 'all' && /^[A-Z_]{1,30}$/.test(status) && (!known.status || known.status.has(status))
        ? status
        : null,
    stage: stage && stage in SHIPPING_STAGE_LABEL ? stage : null,
    appt: appt === 'NONE' || isAppointmentStatus(appt) ? appt : null,
    fulfillment: (FULFILLMENT_KEYS as readonly string[]).includes(fulfillment ?? '')
      ? (fulfillment as OrdersFilters['fulfillment'])
      : null,
    courier:
      courier && courier.length <= COURIER_MAX && (!known.courier || known.courier.has(courier)) ? courier : null,
    date: date && date !== 'All' && (isOrderDatePreset(date) || isSpecificDay(date)) ? date : 'All',
    type: (ORDER_TYPE_KEYS as readonly string[]).includes(type ?? '') ? (type as OrdersFilters['type']) : null,
    ads,
  }
}

/** คู่ key/value ที่ต้องเขียนลง URL — แกนที่เป็นค่าตั้งต้นไม่ถูกเขียน (URL สะอาด) · `ad` ซ้ำได้หลายตัว */
export function serializeOrdersFilters(f: OrdersFilters): [string, string][] {
  const out: [string, string][] = []
  if (f.status) out.push(['status', f.status])
  if (f.stage) out.push(['stage', f.stage])
  if (f.appt) out.push(['appt', f.appt])
  if (f.fulfillment) out.push(['fulfillment', f.fulfillment])
  if (f.courier) out.push(['courier', f.courier])
  if (f.date !== 'All') out.push(['date', f.date])
  if (f.type) out.push(['type', f.type])
  for (const ad of f.ads) out.push(['ad', ad])
  return out
}

/** จำนวนแกนที่เปิดอยู่ (badge บนปุ่ม) — โฆษณากี่ตัวก็นับ 1 · ไม่นับคำค้นและแถวละ N */
export function countActiveFilters(f: OrdersFilters): number {
  return (
    (f.status ? 1 : 0) +
    (f.stage ? 1 : 0) +
    (f.appt ? 1 : 0) +
    (f.fulfillment ? 1 : 0) +
    (f.courier ? 1 : 0) +
    (f.date !== 'All' ? 1 : 0) +
    (f.type ? 1 : 0) +
    (f.ads.length > 0 ? 1 : 0)
  )
}

/** ฟิลด์ขั้นต่ำที่ predicate อ่าน — OrderRow เข้ากันได้โดยโครง (ไฟล์นี้ไม่ import จาก app/) */
export type FilterableOrder = {
  status: string
  shippingStage?: string | null
  appointment?: { stage: string } | null
  fulfillmentMode?: string | null
  orderType: string
  createdAtISO: string
  ad?: { adId: string } | null
}

/** ออเดอร์ผ่านตัวกรองทุกแกนไหน — AND ระหว่างแกน · OR ภายในโฆษณา */
export function matchesOrdersFilters<T extends FilterableOrder>(
  o: T,
  f: OrdersFilters,
  courierKeyOf: (o: T) => string | null,
  now?: Date,
): boolean {
  if (f.status && o.status !== f.status) return false
  if (f.stage && o.shippingStage !== f.stage) return false
  if (f.appt === 'NONE') {
    if (o.appointment) return false
  } else if (f.appt && o.appointment?.stage !== f.appt) return false
  if (f.fulfillment && o.fulfillmentMode !== f.fulfillment) return false
  if (f.courier) {
    const k = courierKeyOf(o)
    if (f.courier === 'NONE' ? k !== null : k !== f.courier) return false
  }
  if (f.type && o.orderType !== f.type) return false
  if (f.date !== 'All' && !matchesOrderDateFilter(o.createdAtISO, f.date, now)) return false
  if (f.ads.length > 0 && !f.ads.includes(o.ad ? o.ad.adId : AD_NONE)) return false
  return true
}

export type AdFilterOption = {
  adId: string
  adTitle: string | null
  adPhotoFileId: string | null
  count: number
}

/**
 * ตัวเลือกโฆษณา = เฉพาะแอดที่มีออเดอร์อย่างน้อย 1 ใบในชุดที่โหลด · เรียงจำนวนมาก→น้อย
 * ชื่อ/รูปเป็นภาพนิ่งต่อใบ — adId เดียวชื่อต่างกันใช้ของใบล่าสุด
 * `none` = ออเดอร์ที่ไม่มีแอด (นิยามเดียวกับ /reports/ads)
 */
export function buildAdOptions(
  orders: readonly { createdAtISO: string; ad?: { adId: string; adTitle: string | null; adPhotoFileId: string | null } | null }[],
): { ads: AdFilterOption[]; noneCount: number } {
  const byId = new Map<string, AdFilterOption & { latest: string }>()
  let noneCount = 0
  for (const o of orders) {
    if (!o.ad) {
      noneCount += 1
      continue
    }
    const cur = byId.get(o.ad.adId)
    if (!cur) {
      byId.set(o.ad.adId, {
        adId: o.ad.adId,
        adTitle: o.ad.adTitle,
        adPhotoFileId: o.ad.adPhotoFileId,
        count: 1,
        latest: o.createdAtISO,
      })
    } else {
      cur.count += 1
      if (o.createdAtISO > cur.latest) {
        cur.latest = o.createdAtISO
        cur.adTitle = o.ad.adTitle
        cur.adPhotoFileId = o.ad.adPhotoFileId
      }
    }
  }
  const ads = [...byId.values()]
    .sort((a, b) => b.count - a.count || a.adId.localeCompare(b.adId))
    .map(({ latest: _latest, ...rest }) => rest)
  return { ads, noneCount }
}
