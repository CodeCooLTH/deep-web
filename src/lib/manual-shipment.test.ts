import { describe, expect, it } from 'vitest'
import {
  canMarkDelivered,
  canMarkDispatched,
  isAwaitingDispatch,
  isManualShipment,
  type ManualShipmentFacts,
} from './manual-shipment'

const base: ManualShipmentFacts = {
  status: 'PENDING',
  fulfillmentMode: 'SHIPPED',
  hasManualTracking: true,
  hasLiveIshipShipment: false,
}
const f = (o: Partial<ManualShipmentFacts>) => ({ ...base, ...o })

describe('manual-shipment', () => {
  it.each([
    // [ชื่อเคส, facts, awaiting, canDispatch, canDeliver]
    ['ส่งเอง + PENDING = รอจัดส่ง', f({}), true, true, false],
    ['ส่งเอง + SHIPPED (รวมใบเก่า)', f({ status: 'SHIPPED' }), false, false, true],
    ['ส่งเอง + CONFIRMED', f({ status: 'CONFIRMED' }), false, false, false],
    ['ส่งเอง + CANCELLED', f({ status: 'CANCELLED' }), false, false, false],
    ['ส่งเอง + DRAFTED', f({ status: 'DRAFTED' }), false, false, false],
    ['ยังไม่มีเลข', f({ hasManualTracking: false }), false, false, false],
    ['iShip live + PENDING (ผูกทับ — iShip ชนะ)', f({ hasLiveIshipShipment: true }), false, false, false],
    ['iShip live + SHIPPED', f({ status: 'SHIPPED', hasLiveIshipShipment: true }), false, false, false],
    ['นัดรับ (PICKUP)', f({ fulfillmentMode: 'PICKUP' }), false, false, false],
    ['ไม่ต้องส่ง (NO_SHIPPING / ร้านบริการ)', f({ fulfillmentMode: 'NO_SHIPPING', status: 'SHIPPED' }), false, false, false],
  ])('%s', (_n, facts, awaiting, dispatch, deliver) => {
    expect(isAwaitingDispatch(facts)).toBe(awaiting)
    expect(canMarkDispatched(facts)).toBe(dispatch)
    expect(canMarkDelivered(facts)).toBe(deliver)
  })

  it('isManualShipment ไม่ขึ้นกับสถานะ', () => {
    expect(isManualShipment(f({ status: 'CONFIRMED' }))).toBe(true)
    expect(isManualShipment(f({ hasLiveIshipShipment: true }))).toBe(false)
  })
})
