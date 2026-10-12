import { describe, expect, it } from 'vitest'
import { deriveServiceWorkStage } from '../service-work-stage'

const now = new Date('2026-10-10T06:00:00Z')
const past = new Date('2026-10-10T05:00:00Z')
const future = new Date('2026-10-10T08:00:00Z')
const closedAt = new Date('2026-10-10T05:30:00Z')
const d = (
  status: string,
  appointmentStatus: string | null,
  serviceEnd: Date | null = null,
  serviceClosedAt: Date | null = null,
) => deriveServiceWorkStage({ status, appointmentStatus, serviceEnd, serviceClosedAt, now })

describe('deriveServiceWorkStage', () => {
  it('รอเข้ารับบริการ: walk-in ไม่มีนัด · นัดที่ยังไม่ถึงและลูกค้ายังไม่ยืนยัน · ขอเลื่อน', () => {
    expect(d('PENDING', null)).toBe('AWAITING_SERVICE')
    expect(d('PENDING', 'SCHEDULED', future)).toBe('AWAITING_SERVICE')
    expect(d('PENDING', 'RESCHEDULE_REQUESTED', future)).toBe('AWAITING_SERVICE')
  })
  it('ลูกค้ายืนยันนัด: ลูกค้ายืนยันนัด และยังไม่เลยเวลา', () => {
    expect(d('PENDING', 'CONFIRMED_BY_BUYER', future)).toBe('APPT_CONFIRMED')
    expect(d('PENDING', 'CONFIRMED_BY_BUYER', null)).toBe('APPT_CONFIRMED')
  })
  it('รอปิดงาน: เลยเวลานัดแล้วแต่ร้านยังไม่ปิดงาน (ทั้งยืนยัน/ไม่ยืนยัน)', () => {
    expect(d('PENDING', 'SCHEDULED', past)).toBe('AWAITING_CLOSE')
    expect(d('PENDING', 'CONFIRMED_BY_BUYER', past)).toBe('AWAITING_CLOSE')
  })
  it('[00073] รอปิดงาน: ลูกค้ายืนยันรับบริการไปก่อน แต่ร้านยังไม่ปิด (ยอดยังไม่เข้า)', () => {
    expect(d('CONFIRMED', null)).toBe('AWAITING_CLOSE')
    expect(d('CONFIRMED', 'CONFIRMED_BY_BUYER', future)).toBe('AWAITING_CLOSE')
  })
  it('[00073] รอลูกค้ายืนยัน: ร้านปิดงานแล้ว (อ่านจาก serviceClosedAt) และลูกค้ายังไม่ยืนยัน', () => {
    expect(d('PENDING', 'COMPLETED', past, closedAt)).toBe('AWAITING_BUYER')
    expect(d('PENDING', null, null, closedAt)).toBe('AWAITING_BUYER') // walk-in ปิดแล้ว
    expect(d('SHIPPED', null, null, closedAt)).toBe('AWAITING_BUYER') // ข้อมูลเก่าที่ปิดย้อนหลัง
    // ข้อมูลเก่าก่อนมี serviceClosedAt: ลงผลแล้วถือว่าปิด
    expect(d('PENDING', 'COMPLETED', past)).toBe('AWAITING_BUYER')
  })
  it('ไม่อยู่ในไทล์ไหน: จบแล้ว · ยกเลิก · ร่าง · คืนทั้งใบ · ไม่มาตามนัด', () => {
    expect(d('CONFIRMED', 'COMPLETED', past, closedAt)).toBeNull()
    expect(d('CONFIRMED', null, null, closedAt)).toBeNull()
    expect(d('CANCELLED', null)).toBeNull()
    expect(d('DRAFTED', null)).toBeNull()
    expect(d('RETURNED', null, null, closedAt)).toBeNull()
    expect(d('PENDING', 'NO_SHOW', past, closedAt)).toBeNull()
    expect(d('PENDING', 'NO_SHOW', past)).toBeNull()
  })
})
