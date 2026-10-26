import { describe, it, expect } from 'vitest'
import * as v from 'valibot'
import {
  decideLossPhase,
  canCloseParcelProblem,
  needsRefundAnswer,
  parcelCloseExcludesRevenue,
  isCodForParcelClose,
  hasParcelCloseConflict,
  shouldOfferParcelClose,
  type CanCloseInput,
} from '@/lib/parcel-close'
import { ParcelCloseBodySchema } from '@/lib/validations'

const none = { deliveredAt: null, hasDeliveredEvent: false, orderStatus: 'SHIPPED' }

describe('decideLossPhase', () => {
  it('T-DEC-1 ไม่มีหลักฐาน → A/NONE', () => {
    expect(decideLossPhase(none)).toEqual({ outcome: 'DELIVERY_FAILED', basis: 'NONE' })
  })
  it('T-DEC-2 deliveredAt → B/DELIVERED_AT', () => {
    expect(decideLossPhase({ ...none, deliveredAt: new Date() })).toEqual({ outcome: 'LOST_ON_RETURN', basis: 'DELIVERED_AT' })
  })
  it('T-DEC-3/4 event delivered / payment_success → B/EVENT (flag จาก service)', () => {
    expect(decideLossPhase({ ...none, hasDeliveredEvent: true })).toEqual({ outcome: 'LOST_ON_RETURN', basis: 'EVENT' })
  })
  it('T-DEC-5 CONFIRMED → B/ORDER_CONFIRMED', () => {
    expect(decideLossPhase({ ...none, orderStatus: 'CONFIRMED' })).toEqual({ outcome: 'LOST_ON_RETURN', basis: 'ORDER_CONFIRMED' })
  })
  it('T-DEC-6 มีทั้ง 3 → DELIVERED_AT; มี event+CONFIRMED → EVENT', () => {
    expect(decideLossPhase({ deliveredAt: new Date(), hasDeliveredEvent: true, orderStatus: 'CONFIRMED' }).basis).toBe('DELIVERED_AT')
    expect(decideLossPhase({ deliveredAt: null, hasDeliveredEvent: true, orderStatus: 'CONFIRMED' }).basis).toBe('EVENT')
  })
})

describe('parcelCloseExcludesRevenue', () => {
  it('T-EXC-1 ผล A ทุกชุด → true', () => {
    for (const cod of [true, false]) for (const r of [null, true, false])
      expect(parcelCloseExcludesRevenue('DELIVERY_FAILED', cod, r)).toBe(true)
  })
  it('T-EXC-2 B+COD → true แม้ refunded=false', () => {
    expect(parcelCloseExcludesRevenue('LOST_ON_RETURN', true, false)).toBe(true)
    expect(parcelCloseExcludesRevenue('LOST_ON_RETURN', true, null)).toBe(true)
  })
  it('T-EXC-3 B+โอน+คืนเงิน → true', () => {
    expect(parcelCloseExcludesRevenue('LOST_ON_RETURN', false, true)).toBe(true)
  })
  it('T-EXC-4 B+โอน+ไม่คืน → false', () => {
    expect(parcelCloseExcludesRevenue('LOST_ON_RETURN', false, false)).toBe(false)
  })
  it('T-EXC-5 COD ใช้ isCODPayment ตัวเดียวกับ stage', () => {
    for (const p of ['cod', 'COD', 'เก็บเงินปลายทาง', 'ชำระปลายทาง']) expect(isCodForParcelClose(p)).toBe(true)
    for (const p of ['transfer', 'โอนเงิน', null]) expect(isCodForParcelClose(p)).toBe(false)
  })
})

const base = (): CanCloseInput => ({
  shipment: { status: 'CREATED', isDryRun: false, direction: 'FORWARD', carrierStatus: 'issue', problemAt: null, problemClosedAt: null },
  order: { status: 'SHIPPED', fulfillmentMode: 'SHIPPED', vertical: 'ONLINE_SALES' },
})
const mk = (s: Partial<CanCloseInput['shipment']> = {}, o: Partial<CanCloseInput['order']> = {}): CanCloseInput => {
  const b = base()
  return { shipment: { ...b.shipment, ...s }, order: { ...b.order, ...o } }
}

describe('canCloseParcelProblem', () => {
  it('T-CAN-1 ตารางรหัส', () => {
    expect(canCloseParcelProblem(mk())).toEqual({ ok: true })
    const rows: [CanCloseInput, string][] = [
      [mk({ isDryRun: true }), 'NOT_ACTIVE'],
      [mk({ status: 'FAILED' }), 'NOT_ACTIVE'],
      [mk({ direction: 'RETURN' }), 'NOT_FORWARD'],
      [mk({ problemClosedAt: new Date() }), 'ALREADY_CLOSED'],
      [mk({}, { status: 'CANCELLED' }), 'ORDER_FINISHED'],
      [mk({}, { status: 'RETURNED' }), 'ORDER_FINISHED'],
      [mk({}, { status: 'DRAFTED' }), 'ORDER_FINISHED'],
      [mk({}, { fulfillmentMode: 'PICKUP' }), 'NOT_SHIPPED_MODE'],
      [mk({}, { fulfillmentMode: 'NO_SHIPPING' }), 'NOT_SHIPPED_MODE'],
      [mk({}, { vertical: 'SERVICE_QUEUE' }), 'SERVICE_SHOP_UNSUPPORTED'],
      [mk({ carrierStatus: 'delivered' }), 'NOT_IN_PROBLEM'],
    ]
    for (const [i, code] of rows) expect(canCloseParcelProblem(i)).toEqual({ ok: false, code })
  })
  it('T-CAN-2 progress + problemAt (ค้างเหนียว) ปิดได้', () => {
    expect(canCloseParcelProblem(mk({ carrierStatus: 'progress', problemAt: new Date() }))).toEqual({ ok: true })
  })
})

describe('needsRefundAnswer', () => {
  it('T-NEED-1 เฉพาะ B ∧ ไม่ COD', () => {
    expect(needsRefundAnswer('LOST_ON_RETURN', false)).toBe(true)
    expect(needsRefundAnswer('LOST_ON_RETURN', true)).toBe(false)
    expect(needsRefundAnswer('DELIVERY_FAILED', false)).toBe(false)
    expect(needsRefundAnswer('DELIVERY_FAILED', true)).toBe(false)
  })
})

describe('hasParcelCloseConflict', () => {
  const closedAt = new Date('2026-10-20T00:00:00Z')
  const later = new Date('2026-10-21T00:00:00Z')
  const c = (outcome: 'DELIVERY_FAILED' | 'LOST_ON_RETURN', carrierStatus: string, at: Date) =>
    hasParcelCloseConflict({ outcome, carrierStatus, carrierStatusAt: at, closedAt })
  it('T-CON-1', () => {
    expect(c('DELIVERY_FAILED', 'delivered', later)).toBe(true)
    expect(c('DELIVERY_FAILED', 'issue', later)).toBe(false)
    expect(c('LOST_ON_RETURN', 'issue', later)).toBe(false)
    expect(c('LOST_ON_RETURN', 'return_success', later)).toBe(true)
    expect(c('DELIVERY_FAILED', 'delivered', closedAt)).toBe(false)
  })
})

describe('ParcelCloseBodySchema', () => {
  const ok = (b: object) => v.safeParse(ParcelCloseBodySchema, { expectedOutcome: 'DELIVERY_FAILED', ...b }).success
  it('T-VAL-1', () => {
    expect(ok({ reason: 'OTHER' })).toBe(false)
    expect(ok({ reason: 'OTHER', note: 'abcd' })).toBe(false)
    expect(ok({ reason: 'OTHER', note: 'abcde' })).toBe(true)
    expect(ok({ reason: 'OTHER', note: 'a'.repeat(200) })).toBe(true)
    expect(ok({ reason: 'OTHER', note: 'a'.repeat(201) })).toBe(false)
    expect(ok({ reason: 'XXX' })).toBe(false)
    expect(ok({ reason: 'FIRE' })).toBe(true)
  })
})

describe('shouldOfferParcelClose', () => {
  const base = { status: 'CREATED', isDryRun: false, carrierStatus: 'issue', problemAt: null, problemClose: null }
  it('issue → true', () => expect(shouldOfferParcelClose(base)).toBe(true))
  it('ใบ progress ที่เคยมีปัญหา (problemAt) → true', () =>
    expect(shouldOfferParcelClose({ ...base, carrierStatus: 'progress', problemAt: '2026-10-20T00:00:00Z' })).toBe(true))
  it('ปกติ ไม่เคยมีปัญหา → false', () =>
    expect(shouldOfferParcelClose({ ...base, carrierStatus: 'progress' })).toBe(false))
  it('ปิดแล้ว / dry-run / ไม่ใช่ CREATED → false', () => {
    expect(shouldOfferParcelClose({ ...base, problemClose: { outcome: 'DELIVERY_FAILED' } })).toBe(false)
    expect(shouldOfferParcelClose({ ...base, isDryRun: true })).toBe(false)
    expect(shouldOfferParcelClose({ ...base, status: 'CANCELLED' })).toBe(false)
  })
})
