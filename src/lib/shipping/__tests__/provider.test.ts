import { describe, it, expect } from 'vitest'
import {
  providerLabel, shipmentSourceLabel, shipmentApiBase, hasUsableShipment, isCodManualConfirmNotice,
} from '../provider'

describe('shipping/provider (pure)', () => {
  it('shipmentSourceLabel แยก Flash ตรง / Flash ผ่าน iShip / ขนส่งอื่น', () => {
    expect(shipmentSourceLabel({ provider: 'FLASH' })).toBe('Flash (บัญชีของร้านเอง)')
    expect(shipmentSourceLabel({ provider: 'ISHIP', courierCode: 'FlashExpressA', courierName: 'Flash Thunder' })).toBe('Flash ผ่าน iShip')
    expect(shipmentSourceLabel({ provider: 'ISHIP', courierCode: 'KerryExpress', courierName: 'Kerry' })).toBe('Kerry')
  })
  it('shipmentApiBase / providerLabel', () => {
    expect(shipmentApiBase('FLASH')).toBe('/api/seller/flash')
    expect(shipmentApiBase('ISHIP')).toBe('/api/seller/iship')
    expect(providerLabel('FLASH')).toBe('Flash Express')
  })
  it('hasUsableShipment: FAILED และ NEEDS_REVIEW ใช้ไม่ได้', () => {
    expect(hasUsableShipment('FAILED')).toBe(false)
    expect(hasUsableShipment('NEEDS_REVIEW')).toBe(false)
    expect(hasUsableShipment('CREATED')).toBe(true)
    expect(hasUsableShipment('PENDING')).toBe(true)
  })
  it('isCodManualConfirmNotice เฉพาะ FLASH ที่มี COD', () => {
    expect(isCodManualConfirmNotice('FLASH', 100)).toBe(true)
    expect(isCodManualConfirmNotice('FLASH', 0)).toBe(false)
    expect(isCodManualConfirmNotice('ISHIP', 100)).toBe(false)
  })
})
