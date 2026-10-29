import { describe, it, expect } from 'vitest'
import {
  canCancelPickup,
  parsePickupFilter,
  pickupFilterStatuses,
  pickupStatusView,
} from '@/lib/shipping/pickup-list-view'

describe('00087 pickup-list-view', () => {
  it('ยกเลิกได้เฉพาะ REQUESTED/ACCEPTED', () => {
    expect(canCancelPickup('REQUESTED')).toBe(true)
    expect(canCancelPickup('ACCEPTED')).toBe(true)
    for (const s of ['CLOSED', 'CANCELLED', 'FAILED', 'WHATEVER']) expect(canCancelPickup(s)).toBe(false)
  })

  it('ป้ายสถานะตาม BRD BR-3 + ค่าแปลกไม่พัง', () => {
    expect(pickupStatusView('REQUESTED')).toMatchObject({ label: 'รอขนส่งรับงาน', tone: 'info' })
    expect(pickupStatusView('ACCEPTED')).toMatchObject({ label: 'พนักงานรับงานแล้ว', tone: 'primary' })
    expect(pickupStatusView('CLOSED')).toMatchObject({ label: 'เข้ารับเสร็จแล้ว', tone: 'success' })
    expect(pickupStatusView('CANCELLED')).toMatchObject({ label: 'ยกเลิกแล้ว', tone: 'neutral' })
    expect(pickupStatusView('FAILED')).toMatchObject({ label: 'เรียกรถไม่สำเร็จ', tone: 'danger' })
    expect(pickupStatusView('X').label).toBe('ไม่ทราบสถานะ')
  })

  it('ตัวกรองจาก URL: ค่าไม่รู้จัก = ทั้งหมด · active = REQUESTED+ACCEPTED', () => {
    expect(parsePickupFilter(undefined)).toBe('all')
    expect(parsePickupFilter('hack')).toBe('all')
    expect(parsePickupFilter('active')).toBe('active')
    expect(pickupFilterStatuses('all')).toBeNull()
    expect(pickupFilterStatuses('active')).toEqual(['REQUESTED', 'ACCEPTED'])
    expect(pickupFilterStatuses('failed')).toEqual(['FAILED'])
  })
})
