import { describe, it, expect } from 'vitest'
import { buildBuyerShipmentView, type ShipmentViewInput } from '../order-shipment-view'

const D = new Date('2026-09-01T03:00:00.000Z')
const ship = {
  trackingNo: 'TH01',
  courierName: 'Flash',
  courierCode: 'FLE',
  carrierStatus: 'in_transit',
  problemAt: D,
  returnStartedAt: D,
  returnedAt: null,
  returnDispatchedAt: null,
  problemCloseOutcome: null,
}

const B = { status: 'SHIPPED', trackingNoticeTiming: 'ON_SAVE' as const }
const KEYS = ['carrierStatus', 'hasIshipTracking', 'hasManualTracking', 'problemAt', 'problemCloseOutcome', 'returnDispatchedAt', 'returnStartedAt', 'returnedAt', 'shipmentTracking']

describe('buildBuyerShipmentView', () => {
  it('iShip fallback ส่ง courierCode ไปด้วย', () => {
    const v = buildBuyerShipmentView({ ...B, shipmentTracking: null, shipments: [ship] })
    expect(v.shipmentTracking).toEqual({ provider: 'Flash', trackingNo: 'TH01', courierCode: 'FLE' })
    expect(v.problemAt).toBe(D.toISOString())
  })

  it('ร้านแจ้งเองมาก่อน iShip เสมอ และ courierCode = null', () => {
    const v = buildBuyerShipmentView({
      ...B,
      shipmentTracking: { provider: 'ไปรษณีย์', trackingNo: 'EX1' },
      shipments: [ship],
    })
    expect(v.shipmentTracking).toEqual({ provider: 'ไปรษณีย์', trackingNo: 'EX1', courierCode: null })
  })

  it('provider fallback: courierName -> courierCode -> "ขนส่ง"', () => {
    const p = (o: object) =>
      buildBuyerShipmentView({ ...B, shipmentTracking: null, shipments: [{ ...ship, ...o }] }).shipmentTracking?.provider
    expect(p({ courierName: null })).toBe('FLE')
    expect(p({ courierName: null, courierCode: null })).toBe('ขนส่ง')
  })

  it('ไม่มีพัสดุ = null ทุกช่อง', () => {
    const v = buildBuyerShipmentView({ ...B, shipmentTracking: null, shipments: [] })
    // 00080: ธง boolean 2 ตัวสำหรับตัดสินขั้น (ไม่ใช่ข้อมูลส่วนตัว) — ที่เหลือ null ทั้งหมด
    const { hasManualTracking, hasIshipTracking, ...rest } = v
    expect([hasManualTracking, hasIshipTracking]).toEqual([false, false])
    expect(Object.values(rest).every((x) => x === null)).toBe(true)
  })

  it('คีย์ที่คืนเป็น allow-list 8 ตัว (6 + ธง boolean 2) แม้ input มี PII แฝง', () => {
    const dirty = {
      ...B,
      shipmentTracking: { provider: 'x', trackingNo: 'y', buyerPhone: '0812345678' },
      shipments: [{ ...ship, recipientName: 'สมชาย', address: 'บ้านเลขที่ 1' }],
      buyerContact: '0812345678',
    } as unknown as ShipmentViewInput
    const v = buildBuyerShipmentView(dirty)
    expect(Object.keys(v).sort()).toEqual(KEYS)
    expect(Object.keys(v.shipmentTracking!).sort()).toEqual(['courierCode', 'provider', 'trackingNo'])
    expect(JSON.stringify(v)).not.toMatch(/0812345678|สมชาย|บ้านเลขที่/)
  })
})
