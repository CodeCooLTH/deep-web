/**
 * [blocker] feature 00073 — ป้ายสถานะชุดเดียวของงานร้านบริการ (PRD §3.3)
 * แดง = ห้าม merge · ห้ามมีคำของร้านขายของ (จัดส่ง/ได้รับสินค้า) ในชุดนี้
 */
import { describe, expect, it } from 'vitest'
import {
  canCloseServiceJob,
  canReopenServiceJob,
  reviewConfirmsServiceJob,
  deriveServiceStatus,
  resolveServiceStatusBadge,
  SERVICE_STATUS_KEYS,
  SERVICE_STATUS_META,
  serviceStatusLabel,
  type ServiceStatusInput,
} from '../service-status'

const closed = new Date('2026-10-11T07:00:00Z')
const base: ServiceStatusInput = {
  status: 'PENDING',
  appointmentStatus: 'SCHEDULED',
  hasAppointment: true,
  serviceClosedAt: null,
  outstanding: 0,
}
const s = (o: Partial<ServiceStatusInput>) => deriveServiceStatus({ ...base, ...o })

describe('deriveServiceStatus — 10 ป้าย', () => {
  it('ขั้น 1: จองแล้ว (มีนัด) / รับงานแล้ว (walk-in)', () => {
    expect(s({})).toBe('BOOKED')
    expect(s({ appointmentStatus: null, hasAppointment: false })).toBe('WALK_IN')
  })
  it('ขั้น 2: ลูกค้าขอเลื่อน / ลูกค้ายืนยันนัด', () => {
    expect(s({ appointmentStatus: 'RESCHEDULE_REQUESTED' })).toBe('RESCHEDULE_REQUESTED')
    expect(s({ appointmentStatus: 'CONFIRMED_BY_BUYER' })).toBe('APPOINTMENT_CONFIRMED')
  })
  it('ขั้น 3: ปิดงานแล้ว ชำระครบ / ค้าง / ไม่มาตามนัด', () => {
    expect(s({ appointmentStatus: 'COMPLETED', serviceClosedAt: closed })).toBe('CLOSED_PAID')
    expect(s({ appointmentStatus: 'COMPLETED', serviceClosedAt: closed, outstanding: 500 })).toBe('CLOSED_OUTSTANDING')
    expect(s({ appointmentStatus: 'NO_SHOW', serviceClosedAt: closed })).toBe('NO_SHOW')
    expect(s({ appointmentStatus: null, hasAppointment: false, serviceClosedAt: closed })).toBe('CLOSED_PAID')
  })
  it('ขั้น 4: ลูกค้ายืนยันก่อนร้านปิด / สำเร็จ', () => {
    expect(s({ status: 'CONFIRMED' })).toBe('BUYER_CONFIRMED_AWAITING_CLOSE')
    expect(s({ status: 'CONFIRMED', serviceClosedAt: closed })).toBe('DONE')
  })
  it('ยกเลิก / คืนทั้งใบ / ร่าง ชนะทุกอย่าง', () => {
    expect(s({ status: 'CANCELLED', serviceClosedAt: closed })).toBe('CANCELLED')
    expect(s({ status: 'RETURNED', serviceClosedAt: closed })).toBe('RETURNED')
    expect(s({ status: 'DRAFTED' })).toBe('DRAFTED')
  })
  it('ไม่มาตามนัดชนะ CONFIRMED (ข้อมูลเก่าที่ลูกค้าเคยยืนยันงานที่ไม่มาได้)', () => {
    expect(s({ status: 'CONFIRMED', appointmentStatus: 'NO_SHOW', serviceClosedAt: closed })).toBe('NO_SHOW')
  })
})

describe('คำ', () => {
  it('ทุกคีย์มีคำทั้งสองฝั่ง', () => {
    for (const k of SERVICE_STATUS_KEYS) {
      expect(SERVICE_STATUS_META[k].seller.length).toBeGreaterThan(0)
      expect(SERVICE_STATUS_META[k].buyer.length).toBeGreaterThan(0)
    }
  })
  it('[blocker] ไม่มีคำของร้านขายของ (กฎคำตาม vertical — user 2026-10-11)', () => {
    const all = SERVICE_STATUS_KEYS.flatMap((k) => [SERVICE_STATUS_META[k].seller, SERVICE_STATUS_META[k].buyer]).join(' ')
    for (const w of ['จัดส่ง', 'พัสดุ', 'ได้รับสินค้า', 'สินค้า', 'ผู้ซื้อ', 'คำสั่งซื้อ', 'เริ่มให้บริการ']) {
      expect(all).not.toContain(w)
    }
  })
  it('ค้างชำระใส่ยอด · ผู้ไม่เห็นเงินได้ "ปิดงานแล้ว" เฉย ๆ ไม่อ้างว่าชำระครบ', () => {
    expect(serviceStatusLabel('CLOSED_OUTSTANDING', 'seller', 1200)).toBe('ปิดงานแล้ว · ค้าง ฿1,200')
    expect(serviceStatusLabel('CLOSED_PAID', 'seller', null)).toBe('ปิดงานแล้ว')
    const b = resolveServiceStatusBadge({ ...base, appointmentStatus: 'COMPLETED', serviceClosedAt: closed, outstanding: null }, 'seller')
    expect(b.label).toBe('ปิดงานแล้ว')
    expect(b.tone).not.toBe('success')
  })
  it('ลูกค้าเห็นคำฝั่งลูกค้า', () => {
    expect(resolveServiceStatusBadge({ ...base, appointmentStatus: 'NO_SHOW', serviceClosedAt: closed }, 'buyer').label).toBe('ไม่ได้เข้ารับบริการ')
  })
})

describe('ปิด / เปิดงานอีกครั้ง', () => {
  it('ปิดได้เมื่อยังไม่ปิด และไม่ใช่ยกเลิก/คืน/ร่าง', () => {
    expect(canCloseServiceJob({ status: 'PENDING', serviceClosedAt: null })).toBe(true)
    expect(canCloseServiceJob({ status: 'CONFIRMED', serviceClosedAt: null })).toBe(true)
    expect(canCloseServiceJob({ status: 'PENDING', serviceClosedAt: closed })).toBe(false)
    expect(canCloseServiceJob({ status: 'CANCELLED', serviceClosedAt: null })).toBe(false)
    expect(canCloseServiceJob({ status: 'DRAFTED', serviceClosedAt: null })).toBe(false)
  })
  it('เปิดงานอีกครั้งได้เฉพาะก่อนลูกค้ายืนยัน (มติ D2)', () => {
    expect(canReopenServiceJob({ status: 'PENDING', serviceClosedAt: closed })).toBe(true)
    expect(canReopenServiceJob({ status: 'CONFIRMED', serviceClosedAt: closed })).toBe(false)
    expect(canReopenServiceJob({ status: 'PENDING', serviceClosedAt: null })).toBe(false)
  })
})

// feature 00073 FR-012 — ส่งคะแนน = ยืนยันรับบริการ ได้เฉพาะงานที่ร้านปิดแล้ว (ให้บริการแล้ว) และลูกค้ายังไม่ยืนยัน
describe('reviewConfirmsServiceJob', () => {
  const closed = '2026-10-11T10:00:00.000Z'
  const base = { vertical: 'SERVICE_QUEUE', status: 'PENDING', serviceClosedAt: closed, appointmentStatus: 'COMPLETED' }
  it('ร้านปิดงาน (ให้บริการแล้ว) + ลูกค้ายังไม่ยืนยัน → true', () => {
    expect(reviewConfirmsServiceJob(base)).toBe(true)
    expect(reviewConfirmsServiceJob({ ...base, appointmentStatus: null })).toBe(true) // walk-in
  })
  it('ยังไม่ปิด · ไม่มาตามนัด · ยืนยันแล้ว · ยกเลิก → false', () => {
    expect(reviewConfirmsServiceJob({ ...base, serviceClosedAt: null })).toBe(false)
    expect(reviewConfirmsServiceJob({ ...base, appointmentStatus: 'NO_SHOW' })).toBe(false)
    expect(reviewConfirmsServiceJob({ ...base, status: 'CONFIRMED' })).toBe(false)
    expect(reviewConfirmsServiceJob({ ...base, status: 'CANCELLED' })).toBe(false)
  })
  it('[blocker] ร้านขายของ/ที่พัก → false เสมอ', () => {
    expect(reviewConfirmsServiceJob({ ...base, vertical: 'ONLINE_SALES' })).toBe(false)
    expect(reviewConfirmsServiceJob({ ...base, vertical: 'LODGING' })).toBe(false)
  })
})
