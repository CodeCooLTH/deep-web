import { describe, expect, it } from 'vitest'
import { deriveServiceWorkStage } from '../service-work-stage'

const now = new Date('2026-10-10T06:00:00Z')
const past = new Date('2026-10-10T05:00:00Z')
const future = new Date('2026-10-10T08:00:00Z')
const d = (status: string, appointmentStatus: string | null, serviceEnd: Date | null = null) =>
  deriveServiceWorkStage({ status, appointmentStatus, serviceEnd, now })

describe('deriveServiceWorkStage', () => {
  it('รอเข้ารับบริการ: walk-in ไม่มีนัด · นัดที่ยังไม่ถึงและลูกค้ายังไม่ยืนยัน · ขอเลื่อน', () => {
    expect(d('PENDING', null)).toBe('AWAITING_SERVICE')
    expect(d('PENDING', 'SCHEDULED', future)).toBe('AWAITING_SERVICE')
    expect(d('PENDING', 'RESCHEDULE_REQUESTED', future)).toBe('AWAITING_SERVICE')
  })
  it('ยืนยันแล้ว: ลูกค้ายืนยันนัด และยังไม่เลยเวลา', () => {
    expect(d('PENDING', 'CONFIRMED_BY_BUYER', future)).toBe('APPT_CONFIRMED')
    expect(d('PENDING', 'CONFIRMED_BY_BUYER', null)).toBe('APPT_CONFIRMED')
  })
  it('รอปิดงาน: เลยเวลานัดแล้วแต่ร้านยังไม่กดผล (ทั้งยืนยัน/ไม่ยืนยัน)', () => {
    expect(d('PENDING', 'SCHEDULED', past)).toBe('AWAITING_CLOSE')
    expect(d('PENDING', 'CONFIRMED_BY_BUYER', past)).toBe('AWAITING_CLOSE')
  })
  it('รอลูกค้ายืนยัน: ให้บริการแล้ว (COMPLETED) หรือเริ่มให้บริการ (SHIPPED)', () => {
    expect(d('PENDING', 'COMPLETED', past)).toBe('AWAITING_BUYER')
    expect(d('SHIPPED', null)).toBe('AWAITING_BUYER')
  })
  it('ไม่อยู่ในไทล์ไหน: ปิดแล้ว · ยกเลิก · ร่าง · ไม่มาตามนัด', () => {
    expect(d('CONFIRMED', 'COMPLETED', past)).toBeNull()
    expect(d('CANCELLED', null)).toBeNull()
    expect(d('DRAFTED', null)).toBeNull()
    expect(d('PENDING', 'NO_SHOW', past)).toBeNull()
  })
})
