// 00095 TC-001..014, 020..027 — สถานะการขาย + ตราประทับ + จบรอบ (ตาราง input→output)
import { describe, expect, it, vi } from 'vitest'
import { countsAsCustomerOrder } from '../../customer-behavior'
import { IN_TRANSIT_CARRIER_STATUSES, PROBLEM_CARRIER_STATUSES } from '../../iship/status'
import { deriveShippingStage, type ShippingStageKey } from '../../order-stage'
import { DAY_MS, HOLD_MS, SALES_STAGE_KEYS, type SalesStageKey } from '../constants'
import {
  KNOWN_ORDER_STATUSES,
  SHIPPING_STAGE_CLASS,
  deriveSalesStage,
  warnUnknownOrderStatusOnce,
  type StageOrder,
} from '../sales-stage'

const T0 = new Date('2026-11-20T03:00:00.000Z')
const at = (ms: number) => new Date(T0.getTime() + ms)
const ROOM = 'room-1'
const SHOP = 'shop-1'

let seq = 0
const order = (o: Partial<StageOrder> = {}): StageOrder => ({
  id: `o-${++seq}`,
  shopId: SHOP,
  conversationId: ROOM,
  isDryRun: false,
  status: 'PENDING',
  createdAt: at(-5 * DAY_MS),
  paymentMethod: 'โอน',
  paymentConfirmedAt: null,
  codReceivedAt: null,
  handedOverAt: null,
  fulfillmentMode: 'SHIPPED',
  carrierStatus: null,
  hasShipment: false,
  hasManualTracking: false,
  parcelClose: null,
  problemAt: null,
  deliveredAt: null,
  events: [],
  ...o,
})

const derive = (orders: StageOrder[], buyerMsgTimes: Date[] = [], now = T0) =>
  deriveSalesStage({ roomId: ROOM, shopId: SHOP, orders, buyerMsgTimes, now })

// Record → tsc แดงเมื่อ order-stage.ts เพิ่มกองใหม่แล้วสูตรไม่ครอบ (TC-009)
const RECIPE: Record<ShippingStageKey, Partial<StageOrder>> = {
  DRAFT: { status: 'DRAFTED' },
  AWAITING_PARCEL: {},
  AWAITING_DISPATCH: { hasManualTracking: true },
  AWAITING_PICKUP: { hasShipment: true },
  SHIPPING: { hasShipment: true, carrierStatus: IN_TRANSIT_CARRIER_STATUSES[0] },
  AWAITING_COD: { hasShipment: true, carrierStatus: 'delivered', paymentMethod: 'COD' },
  PROBLEM: { hasShipment: true, carrierStatus: PROBLEM_CARRIER_STATUSES[0] },
  RETURNED: { hasShipment: true, carrierStatus: 'return' },
  DONE: { hasShipment: true, carrierStatus: 'delivered' },
  NOT_SHIPPING: { fulfillmentMode: 'PICKUP' },
  DELIVERY_FAILED: { hasShipment: true, parcelClose: 'DELIVERY_FAILED', carrierStatus: 'issue' },
}
const STAGES = Object.keys(RECIPE) as ShippingStageKey[]
const stageOf = (o: StageOrder) =>
  deriveShippingStage({
    status: o.status,
    carrierStatus: o.carrierStatus,
    hasShipment: o.hasShipment,
    paymentMethod: o.paymentMethod,
    codReceivedAt: o.codReceivedAt,
    fulfillmentMode: o.fulfillmentMode,
    problemAt: o.problemAt,
    hasManualTracking: o.hasManualTracking,
    parcelClose: o.parcelClose,
  })
const keyOf = (o: StageOrder) => derive([o])?.key ?? null

describe('TC-001 ไม่มีออเดอร์อ้างอิง → NOT_BOUGHT', () => {
  const cases: [string, StageOrder[]][] = [
    ['ไม่มีออเดอร์', []],
    ['มีแต่ร่าง DRAFTED', [order({ status: 'DRAFTED' })]],
    ['มีแต่ทดสอบ isDryRun', [order({ isDryRun: true })]],
    ['ออเดอร์ของห้องอื่น', [order({ conversationId: 'room-x' })]],
    ['ออเดอร์ของร้านอื่น', [order({ shopId: 'shop-x' })]],
    ['ออเดอร์นอกห้อง (conversationId=null — R-FB-3)', [order({ conversationId: null })]],
  ]
  it.each(cases)('%s', (_n, orders) => {
    expect(derive(orders, [at(-DAY_MS)])).toEqual({ key: 'NOT_BOUGHT', stamp: at(-DAY_MS) })
  })
})

describe('TC-002..007, 009 ตารางครบทุก ShippingStageKey', () => {
  it('สูตรสร้าง stage ได้ตรงทุกค่า (กันตารางหลอก)', () => {
    for (const s of STAGES) expect(stageOf(order(RECIPE[s]))).toBe(s)
    // ทุก stage มีคลาสในตาราง SHIPPING_STAGE_CLASS
    expect(Object.keys(SHIPPING_STAGE_CLASS).sort()).toEqual([...STAGES].sort())
  })

  // PENDING · ไม่มีสัญญาณชำระ
  const PENDING_UNPAID: Record<ShippingStageKey, SalesStageKey | null> = {
    DRAFT: 'NOT_BOUGHT', // ร่างถูกตัดจาก E ตั้งแต่ต้น ไม่ถึงตารางแปลง
    AWAITING_PARCEL: 'BILLED',
    AWAITING_DISPATCH: 'BILLED',
    AWAITING_PICKUP: 'BILLED',
    SHIPPING: 'SHIPPED',
    AWAITING_COD: 'COMPLETED',
    PROBLEM: 'PARCEL_PROBLEM',
    RETURNED: 'PARCEL_PROBLEM',
    DONE: 'COMPLETED',
    NOT_SHIPPING: 'BILLED',
    DELIVERY_FAILED: 'PARCEL_PROBLEM',
  }
  it.each(STAGES)('PENDING × %s (ยังไม่ชำระ)', (s) => {
    expect(keyOf(order(RECIPE[s]))).toBe(PENDING_UNPAID[s])
  })

  // TC-006: กองที่ "ยังไม่ส่ง" × สัญญาณชำระ 4 แบบ
  const PREP: ShippingStageKey[] = ['AWAITING_PARCEL', 'AWAITING_DISPATCH', 'AWAITING_PICKUP', 'NOT_SHIPPING']
  const PAY: [string, Partial<StageOrder>, SalesStageKey][] = [
    ['COD', { paymentMethod: 'เก็บเงินปลายทาง' }, 'ORDER_CONFIRMED'],
    ['paymentConfirmedAt', { paymentConfirmedAt: at(-DAY_MS) }, 'ORDER_CONFIRMED'],
    ['codReceivedAt', { codReceivedAt: at(-DAY_MS) }, 'ORDER_CONFIRMED'],
    ['ไม่มีสัญญาณ', {}, 'BILLED'],
    // TC-014: สลิปไม่นับ — ไม่มีฟิลด์ slip ใน StageOrder โดยตั้งใจ (ไม่มีเวลาให้ประทับ) จึงเทียบเท่ากรณีไม่มีสัญญาณ
  ]
  describe.each(PREP)('%s', (s) => {
    it.each(PAY)('%s', (_n, pay, want) => {
      expect(keyOf(order({ ...RECIPE[s], ...pay }))).toBe(want)
    })
  })
  it('TC-007 กำลังส่ง ไม่ว่าจะชำระหรือไม่ = SHIPPED (ไม่ตกเป็น ORDER_CONFIRMED)', () => {
    expect(keyOf(order({ ...RECIPE.SHIPPING, paymentConfirmedAt: at(-DAY_MS) }))).toBe('SHIPPED')
    expect(keyOf(order({ ...RECIPE.SHIPPING }))).toBe('SHIPPED')
    expect(keyOf(order({ ...RECIPE.SHIPPING, paymentMethod: 'COD' }))).toBe('SHIPPED')
    // ส่งเองกด "จัดส่งแล้ว" = status SHIPPED ไม่มีพัสดุ
    expect(keyOf(order({ status: 'SHIPPED' }))).toBe('SHIPPED')
  })
  it('TC-004 นัดรับที่มอบแล้ว = COMPLETED · ยังไม่มอบ ≠ COMPLETED (TC-005)', () => {
    expect(keyOf(order({ ...RECIPE.NOT_SHIPPING, handedOverAt: at(-DAY_MS) }))).toBe('COMPLETED')
    expect(keyOf(order({ ...RECIPE.NOT_SHIPPING }))).not.toBe('COMPLETED')
  })

  it.each(STAGES)('TC-002 CANCELLED × %s = CANCELLED (ชนะทุกกอง)', (s) => {
    expect(keyOf(order({ ...RECIPE[s], status: 'CANCELLED' }))).toBe('CANCELLED')
  })
  it.each(STAGES)('TC-003 RETURNED × %s = PARCEL_PROBLEM', (s) => {
    expect(keyOf(order({ ...RECIPE[s], status: 'RETURNED' }))).toBe('PARCEL_PROBLEM')
  })
  it('TC-003 ปิดพัสดุ LOST_ON_RETURN = PARCEL_PROBLEM', () => {
    expect(keyOf(order({ ...RECIPE.RETURNED, parcelClose: 'LOST_ON_RETURN' }))).toBe('PARCEL_PROBLEM')
  })
  const PROBLEM_STAGES: ShippingStageKey[] = ['PROBLEM', 'RETURNED', 'DELIVERY_FAILED']
  it.each(STAGES.filter((s) => s !== 'DRAFT'))('TC-004 CONFIRMED × %s', (s) => {
    const o = order({ ...RECIPE[s], status: 'CONFIRMED' })
    expect(keyOf(o)).toBe(PROBLEM_STAGES.includes(stageOf(o)) ? 'PARCEL_PROBLEM' : 'COMPLETED')
  })
  it.each(['DONE', 'AWAITING_COD'] as const)('TC-004 stage %s = COMPLETED', (s) => {
    expect(keyOf(order(RECIPE[s]))).toBe('COMPLETED')
  })
})

describe('TC-010 ลำดับกฎ (M-01 สลับกฎ 2/3/4 ต้องแดง)', () => {
  it('CANCELLED + พัสดุมีปัญหา → CANCELLED', () => {
    expect(keyOf(order({ ...RECIPE.PROBLEM, status: 'CANCELLED' }))).toBe('CANCELLED')
  })
  it('RETURNED + stage DONE → PARCEL_PROBLEM', () => {
    expect(stageOf(order({ ...RECIPE.DONE, status: 'RETURNED' }))).toBe('DONE')
    expect(keyOf(order({ ...RECIPE.DONE, status: 'RETURNED' }))).toBe('PARCEL_PROBLEM')
  })
  it('CONFIRMED + stage PROBLEM → PARCEL_PROBLEM', () => {
    expect(keyOf(order({ ...RECIPE.PROBLEM, status: 'CONFIRMED' }))).toBe('PARCEL_PROBLEM')
  })
  it('CONFIRMED + SHIPPING → COMPLETED', () => {
    expect(keyOf(order({ ...RECIPE.SHIPPING, status: 'CONFIRMED' }))).toBe('COMPLETED')
  })
  it('LOST_ON_RETURN + stage DONE (ปิดพัสดุ) → PARCEL_PROBLEM ไม่ใช่ COMPLETED', () => {
    const o = order({ ...RECIPE.DONE, parcelClose: 'LOST_ON_RETURN' })
    expect(stageOf(o)).toBe('DONE')
    expect(keyOf(o)).toBe('PARCEL_PROBLEM')
  })
})

describe('TC-008 สถานะไม่รู้จัก → null (ไม่ใช่ NOT_BOUGHT)', () => {
  it.each(['WEIRD', '', 'NO_SHOW'])('status=%j', (status) => {
    expect(derive([order({ status })])).toBeNull()
  })
  it('สถานะที่รู้จักทั้ง 5 ไม่เป็น null', () => {
    for (const s of KNOWN_ORDER_STATUSES) expect(keyOf(order({ status: s }))).not.toBeNull()
  })
  it('warn ครั้งเดียวต่อ (orderId,status)', () => {
    const warn = vi.fn()
    expect(warnUnknownOrderStatusOnce('ox', 'WEIRD', warn)).toBe(true)
    expect(warnUnknownOrderStatusOnce('ox', 'WEIRD', warn)).toBe(false)
    expect(warnUnknownOrderStatusOnce('ox', 'WEIRD2', warn)).toBe(true)
    expect(warnUnknownOrderStatusOnce('oy', 'WEIRD', warn)).toBe(true)
    expect(warn).toHaveBeenCalledTimes(3)
  })
})

describe('TC-011/012 เลือกออเดอร์อ้างอิง', () => {
  it('ใบเก่า COMPLETED + ใบใหม่ BILLED → BILLED ทันที ไม่ผ่านกติกาจบรอบ', () => {
    const old = order({ status: 'CONFIRMED', createdAt: at(-10 * DAY_MS), events: [{ type: 'BUYER_CONFIRMED', occurredAt: at(-3 * DAY_MS) }] })
    const fresh = order({ createdAt: at(-HOURS(1)) })
    expect(derive([old, fresh])?.key).toBe('BILLED')
    expect(derive([fresh, old])?.key).toBe('BILLED')
  })
  it('createdAt เท่ากัน ตัดสินที่ id DESC (ผลเดียวกันทุกลำดับอินพุต)', () => {
    const a = order({ id: 'aaa', status: 'CANCELLED', createdAt: at(-DAY_MS) })
    const b = order({ id: 'bbb', createdAt: at(-DAY_MS) })
    expect(derive([a, b])?.key).toBe('BILLED')
    expect(derive([b, a])?.key).toBe('BILLED')
  })
  it('ใบล่าสุด CANCELLED ส่วนใบก่อนหน้า COMPLETED → CANCELLED', () => {
    const done = order({ status: 'CONFIRMED', createdAt: at(-10 * DAY_MS) })
    const cancelled = order({ status: 'CANCELLED', createdAt: at(-DAY_MS), events: [{ type: 'ORDER_CANCELLED', occurredAt: at(-HOURS(2)) }] })
    expect(derive([done, cancelled])).toEqual({ key: 'CANCELLED', stamp: at(-HOURS(2)) })
  })
})

describe('TC-013 สอดคล้องกับ countsAsCustomerOrder', () => {
  const carriers = [null, 'delivered', 'return', 'return_success', 'issue', 'in_transit']
  const statuses = ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED', 'RETURNED', 'DRAFTED']
  it('ใบที่ไม่นับเป็นการซื้อ ไม่เคยได้ COMPLETED/SHIPPED/ORDER_CONFIRMED/BILLED', () => {
    for (const status of statuses)
      for (const c of carriers) {
        const o = order({ status, hasShipment: c !== null, carrierStatus: c })
        const counts = countsAsCustomerOrder({ status, appointmentStatus: null, activeShipmentCarrierStatus: c } as never)
        if (!counts) expect(['NOT_BOUGHT', 'CANCELLED', 'PARCEL_PROBLEM'], `${status}/${c}`).toContain(keyOf(o))
      }
  })
})

describe('TC-014 OD-FB-1 COD = ORDER_CONFIRMED ตั้งแต่เปิดบิล', () => {
  it('COD ยังไม่ส่ง', () => {
    expect(keyOf(order({ paymentMethod: 'COD' }))).toBe('ORDER_CONFIRMED')
  })
})

function HOURS(n: number) {
  return n * 60 * 60 * 1000
}

describe('TC-020 ตราประทับต่อสถานะ', () => {
  it('BILLED = ORDER_CREATED.occurredAt (ไม่มี → createdAt)', () => {
    const withEv = order({ createdAt: at(-9 * DAY_MS), events: [{ type: 'ORDER_CREATED', occurredAt: at(-2 * DAY_MS) }] })
    expect(derive([withEv])).toEqual({ key: 'BILLED', stamp: at(-2 * DAY_MS) })
    expect(derive([order({ createdAt: at(-9 * DAY_MS) })])).toEqual({ key: 'BILLED', stamp: at(-9 * DAY_MS) })
  })
  it('ORDER_CONFIRMED โอน = paymentConfirmedAt · COD = เหมือน BILLED', () => {
    const pay = order({ createdAt: at(-9 * DAY_MS), paymentConfirmedAt: at(-3 * DAY_MS) })
    expect(derive([pay])).toEqual({ key: 'ORDER_CONFIRMED', stamp: at(-3 * DAY_MS) })
    const cod = order({ paymentMethod: 'COD', createdAt: at(-9 * DAY_MS), paymentConfirmedAt: at(-3 * DAY_MS) })
    expect(derive([cod])).toEqual({ key: 'ORDER_CONFIRMED', stamp: at(-9 * DAY_MS) })
  })
  it('SHIPPED = max ของ event ส่งออก', () => {
    const o = order({
      ...RECIPE.SHIPPING,
      events: [
        { type: 'SHIPMENT_CREATED', occurredAt: at(-5 * DAY_MS) },
        { type: 'TRACKING_ADDED', occurredAt: at(-4 * DAY_MS) },
        { type: 'MANUAL_DISPATCHED', occurredAt: at(-3 * DAY_MS) },
        { type: 'SHIPMENT_LINKED', occurredAt: at(-6 * DAY_MS) },
        { type: 'ORDER_EDITED', occurredAt: at(-DAY_MS) }, // ไม่ใช่ผู้สมัคร
      ],
    })
    expect(derive([o])).toEqual({ key: 'SHIPPED', stamp: at(-3 * DAY_MS) })
  })
  it('COMPLETED = min ของที่มีค่า', () => {
    const o = order({
      ...RECIPE.DONE,
      deliveredAt: at(-4 * DAY_MS),
      events: [
        { type: 'SELLER_DELIVERED', occurredAt: at(-5 * DAY_MS) },
        { type: 'BUYER_CONFIRMED', occurredAt: at(-2 * DAY_MS) },
        { type: 'COD_SETTLED', occurredAt: at(-1 * DAY_MS) },
      ],
    })
    expect(derive([o])).toEqual({ key: 'COMPLETED', stamp: at(-5 * DAY_MS) })
    expect(derive([order({ ...RECIPE.DONE, deliveredAt: at(-4 * DAY_MS) })])?.stamp).toEqual(at(-4 * DAY_MS))
    expect(derive([order({ ...RECIPE.NOT_SHIPPING, handedOverAt: at(-DAY_MS), events: [{ type: 'HANDED_OVER', occurredAt: at(-DAY_MS) }] })])?.stamp).toEqual(at(-DAY_MS))
  })
  it('PARCEL_PROBLEM = min(problemAt, RETURN_RECEIVED, PARCEL_PROBLEM_CLOSED)', () => {
    const o = order({
      ...RECIPE.PROBLEM,
      problemAt: at(-4 * DAY_MS),
      events: [
        { type: 'RETURN_RECEIVED', occurredAt: at(-6 * DAY_MS) },
        { type: 'PARCEL_PROBLEM_CLOSED', occurredAt: at(-2 * DAY_MS) },
      ],
    })
    expect(derive([o])).toEqual({ key: 'PARCEL_PROBLEM', stamp: at(-6 * DAY_MS) })
  })
  it('CANCELLED = ORDER_CANCELLED.occurredAt ไม่ใช่เวลาบันทึก', () => {
    const o = order({ status: 'CANCELLED', createdAt: at(-9 * DAY_MS), events: [{ type: 'ORDER_CANCELLED', occurredAt: at(-7 * DAY_MS) }] })
    expect(derive([o])?.stamp).toEqual(at(-7 * DAY_MS))
  })
})

describe('TC-021 ตัดอนาคต (M-04) · ไม่มีผู้สมัคร = stamp null', () => {
  const sh = (events: { type: string; occurredAt: Date }[]) => order({ ...RECIPE.SHIPPING, events })
  it('ค่าอนาคตถูกทิ้ง ค่าปกติยังอยู่', () => {
    expect(
      derive([sh([{ type: 'SHIPMENT_CREATED', occurredAt: at(-HOURS(2)) }, { type: 'TRACKING_ADDED', occurredAt: at(HOURS(5)) }])])?.stamp,
    ).toEqual(at(-HOURS(2)))
  })
  it('มีแต่อนาคต / ไม่มีเลย → null + anomaly', () => {
    expect(derive([sh([{ type: 'TRACKING_ADDED', occurredAt: at(1) }])])).toEqual({ key: 'SHIPPED', stamp: null, anomaly: 'STAMP_MISSING' })
    expect(derive([sh([])])).toEqual({ key: 'SHIPPED', stamp: null, anomaly: 'STAMP_MISSING' })
  })
  it('stamp = now พอดียังนับ (ตัดเฉพาะ > now)', () => {
    expect(derive([sh([{ type: 'TRACKING_ADDED', occurredAt: T0 }])])?.stamp).toEqual(T0)
  })
  it('stamp null ⇒ รอบไม่จบเอง แม้ลูกค้าทักหลังนานแค่ไหน', () => {
    expect(derive([sh([])], [at(-1)])).toMatchObject({ key: 'SHIPPED', stamp: null })
  })
})

describe('TC-022/023 จบรอบแบบ "เกินจริง" (M-03 `>` เป็น `>=` ต้องแดง)', () => {
  const S = at(-400 * DAY_MS)
  const now = at(0)
  const completed = () => order({ ...RECIPE.DONE, deliveredAt: S })
  const shipped = () => order({ ...RECIPE.SHIPPING, events: [{ type: 'TRACKING_ADDED', occurredAt: S }] })
  const cancelled = () => order({ status: 'CANCELLED', events: [{ type: 'ORDER_CANCELLED', occurredAt: S }] })
  const plus = (ms: number) => new Date(S.getTime() + ms)

  it('COMPLETED พัก 7 วัน', () => {
    expect(derive([completed()], [plus(7 * DAY_MS)], now)).toEqual({ key: 'COMPLETED', stamp: S })
    expect(derive([completed()], [plus(7 * DAY_MS + 1)], now)).toEqual({ key: 'NOT_BOUGHT', stamp: plus(7 * DAY_MS + 1) })
    expect(derive([completed()], [plus(7 * DAY_MS - HOURS(1))], now)?.key).toBe('COMPLETED')
  })
  it('SHIPPED พัก 14 วัน', () => {
    expect(derive([shipped()], [plus(14 * DAY_MS)], now)?.key).toBe('SHIPPED')
    expect(derive([shipped()], [plus(14 * DAY_MS + 1)], now)).toEqual({ key: 'NOT_BOUGHT', stamp: plus(14 * DAY_MS + 1) })
  })
  it('CANCELLED พัก 0: ทักพอดี stamp ยัง CANCELLED · +1ms = รอบใหม่', () => {
    expect(derive([cancelled()], [plus(0)], now)?.key).toBe('CANCELLED')
    expect(derive([cancelled()], [plus(1)], now)).toEqual({ key: 'NOT_BOUGHT', stamp: plus(1) })
  })
  it('BILLED / ORDER_CONFIRMED / PARCEL_PROBLEM ไม่จบรอบเอง ไม่ว่ากี่วัน', () => {
    const billed = order({ createdAt: S })
    const confirmed = order({ paymentConfirmedAt: S, createdAt: S })
    const problem = order({ ...RECIPE.PROBLEM, problemAt: S })
    for (const o of [billed, confirmed, problem]) expect(derive([o], [plus(365 * DAY_MS)], now)?.key).toBe(o === billed ? 'BILLED' : o === confirmed ? 'ORDER_CONFIRMED' : 'PARCEL_PROBLEM')
  })
  it('ตัวเลขพักมาจาก constants.ts (TC-026)', () => {
    expect(HOLD_MS).toEqual({ COMPLETED: 7 * DAY_MS, SHIPPED: 14 * DAY_MS, CANCELLED: 0 })
  })
  it('ข้อความแรกที่เกินพักเป็นตราประทับรอบใหม่ (ไม่ใช่ข้อความหลังสุด) · ลำดับอาร์เรย์ไม่สำคัญ', () => {
    const msgs = [plus(30 * DAY_MS), plus(8 * DAY_MS), plus(3 * DAY_MS)]
    expect(derive([completed()], msgs, now)).toEqual({ key: 'NOT_BOUGHT', stamp: plus(8 * DAY_MS) })
  })
  it('TC-027 ออเดอร์ใหม่ในรอบเดียวกัน ย้ายสถานะทันทีโดยไม่ผ่านกติกาพัก', () => {
    const done = order({ ...RECIPE.DONE, deliveredAt: at(-3 * DAY_MS), createdAt: at(-9 * DAY_MS) })
    const fresh = order({ createdAt: at(-HOURS(1)) })
    expect(derive([done, fresh], [at(-HOURS(2))])?.key).toBe('BILLED')
  })
})

describe('TC-024/025 ตราประทับ NOT_BOUGHT', () => {
  it('ไม่มี E → ข้อความแรกของห้อง (ไม่ใช่ล่าสุด)', () => {
    expect(derive([], [at(-DAY_MS), at(-3 * DAY_MS), at(-2 * DAY_MS)])).toEqual({ key: 'NOT_BOUGHT', stamp: at(-3 * DAY_MS) })
  })
  it('ไม่มี RealBuyerMsg เลย → NOT_BOUGHT stamp=null (แนบไม่ได้)', () => {
    expect(derive([], [])).toEqual({ key: 'NOT_BOUGHT', stamp: null })
  })
  it('stamp คงที่เมื่อมีข้อความใหม่ในรอบเดิม (แนบครั้งเดียวต่อรอบ OD-FB-3)', () => {
    const first = derive([], [at(-3 * DAY_MS)])
    const later = derive([], [at(-3 * DAY_MS), at(-HOURS(1))])
    expect(later).toEqual(first)
  })
})

describe('ครบทุกสถานะการขายมีตัวอย่างอย่างน้อยหนึ่งใบ', () => {
  it('7 ค่า', () => {
    const seen = new Set<string>()
    seen.add(derive([])!.key)
    for (const s of STAGES) {
      const k = keyOf(order(RECIPE[s]))
      if (k) seen.add(k)
    }
    seen.add(keyOf(order({ paymentConfirmedAt: at(-DAY_MS) }))!)
    seen.add(keyOf(order({ status: 'CANCELLED' }))!)
    expect([...seen].sort()).toEqual([...SALES_STAGE_KEYS].sort())
  })
})
