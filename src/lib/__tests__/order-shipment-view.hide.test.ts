import { describe, it, expect } from 'vitest'
import { buildBuyerShipmentView, shouldHideManualTracking } from '../order-shipment-view'

// 00080 S-12 — ซ่อนเลขส่งเองที่ server ระหว่างรอจัดส่ง เมื่อร้านเลือก ON_DISPATCH
const tracking = { provider: 'Kerry', trackingNo: 'SECRET123' }
const base = { status: 'PENDING', trackingNoticeTiming: 'ON_DISPATCH' as const, shipmentTracking: tracking, shipments: [] }

describe('shouldHideManualTracking / buildBuyerShipmentView', () => {
  it('PENDING + ON_DISPATCH + เลขส่งเอง → ตัดเลขออก (ไม่มี string เลขใน payload)', () => {
    expect(shouldHideManualTracking(base)).toBe(true)
    const v = buildBuyerShipmentView(base)
    expect(v.shipmentTracking).toBeNull()
    expect(JSON.stringify(v)).not.toContain('SECRET123')
  })
  it.each([
    ['ON_SAVE', { ...base, trackingNoticeTiming: 'ON_SAVE' as const }],
    ['SHIPPED', { ...base, status: 'SHIPPED' }],
    ['CONFIRMED', { ...base, status: 'CONFIRMED' }],
  ])('แสดงเหมือนเดิม: %s', (_n, o) => {
    expect(buildBuyerShipmentView(o).shipmentTracking?.trackingNo).toBe('SECRET123')
  })
  it('มีพัสดุ iShip = ไม่ซ่อน', () => {
    const ish = { ...base, shipments: [{ trackingNo: 'IS', courierName: 'x', courierCode: 'x', carrierStatus: null, problemAt: null, returnStartedAt: null, returnedAt: null, returnDispatchedAt: null }] }
    expect(shouldHideManualTracking(ish)).toBe(false)
  })
})
