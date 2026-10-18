import { describe, it, expect } from 'vitest'
import { resolveManualShipmentAt, computeShippingSpeed } from '../shipping-speed'

// 00080 TD-002 — เวลา "ส่งออก" ของส่งเอง = dispatchedAt ?? createdAt (FAST_SHIPPING)
describe('resolveManualShipmentAt', () => {
  const t0 = new Date('2026-10-01T00:00:00Z')
  const saved = new Date('2026-10-01T02:00:00Z') // บันทึกเลข
  const dispatched = new Date('2026-10-04T00:00:00Z') // กด "จัดส่งแล้ว"

  it('มี dispatchedAt → ใช้ dispatchedAt (ไม่ใช่เวลาบันทึกเลข)', () => {
    expect(resolveManualShipmentAt({ createdAt: saved, dispatchedAt: dispatched })).toEqual(dispatched)
    const s = computeShippingSpeed([
      { orderCreatedAt: t0, keyedInAt: t0, ishipShipmentEventAt: null, ishipShipmentRowAt: null, manualShipmentAt: resolveManualShipmentAt({ createdAt: saved, dispatchedAt: dispatched }) },
    ])
    expect(s.avgHours).toBe(72) // ไม่ใช่ 2 ชม.
  })
  it('ใบเก่า dispatchedAt null → createdAt · ไม่มีแถว → null', () => {
    expect(resolveManualShipmentAt({ createdAt: saved, dispatchedAt: null })).toEqual(saved)
    expect(resolveManualShipmentAt(null)).toBeNull()
  })
})
