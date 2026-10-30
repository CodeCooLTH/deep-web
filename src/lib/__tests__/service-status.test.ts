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
  serviceArrivalOf,
  type ServiceStatusInput,
} from '../service-status'
import { APPOINTMENT_STAGE_KEYS, APPOINTMENT_STAGE_META, appointmentStageBadge } from '../appointment-stage'

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
  it('ขั้น 1: จองแล้ว (มีนัด) / งานหน้าร้าน (walk-in)', () => {
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

// ─── 00086 P3 — กำลังให้บริการ / ทำเสร็จ · รอปิดงาน (ฝั่งร้านเท่านั้น) ───────────────────────────────
describe('00086 deriveServiceStatus + serviceStartedAt/serviceFinishedAt', () => {
  const T = '2026-10-27T03:00:00.000Z'
  const inputs = [
    { status: 'PENDING', appointmentStatus: 'SCHEDULED', hasAppointment: true, serviceClosedAt: null },
    { status: 'PENDING', appointmentStatus: null, hasAppointment: false, serviceClosedAt: null },
    { status: 'PENDING', appointmentStatus: 'RESCHEDULE_REQUESTED', hasAppointment: true, serviceClosedAt: null },
    { status: 'PENDING', appointmentStatus: 'CONFIRMED_BY_BUYER', hasAppointment: true, serviceClosedAt: null },
    { status: 'PENDING', appointmentStatus: null, hasAppointment: false, serviceClosedAt: T, outstanding: 50 },
    { status: 'PENDING', appointmentStatus: null, hasAppointment: false, serviceClosedAt: T, outstanding: 0 },
    { status: 'PENDING', appointmentStatus: 'NO_SHOW', hasAppointment: true, serviceClosedAt: T },
    { status: 'CONFIRMED', appointmentStatus: null, hasAppointment: false, serviceClosedAt: null },
    { status: 'CONFIRMED', appointmentStatus: null, hasAppointment: false, serviceClosedAt: T },
    { status: 'CANCELLED', appointmentStatus: null, hasAppointment: false, serviceClosedAt: null },
    { status: 'RETURNED', appointmentStatus: null, hasAppointment: false, serviceClosedAt: T },
    { status: 'DRAFTED', appointmentStatus: null, hasAppointment: false, serviceClosedAt: null },
  ]

  it('ไม่ส่ง started/finished (หน้าลูกค้า · จอเดิม) = 12 ป้ายเดิมเป๊ะ · ส่ง null ก็เท่าเดิม', () => {
    for (const i of inputs) {
      const before = deriveServiceStatus(i)
      expect(SERVICE_STATUS_KEYS).toContain(before)
      expect(['IN_SERVICE', 'FINISHED_AWAITING_CLOSE']).not.toContain(before)
      expect(deriveServiceStatus({ ...i, serviceStartedAt: null, serviceFinishedAt: null })).toBe(before)
    }
  })

  it('เริ่มแล้ว → กำลังให้บริการ · ทำเสร็จแล้ว → ทำเสร็จ · รอปิดงาน (ชนะป้ายนัดทุกแบบ)', () => {
    for (const i of inputs.slice(0, 4)) {
      expect(deriveServiceStatus({ ...i, serviceStartedAt: T })).toBe('IN_SERVICE')
      expect(deriveServiceStatus({ ...i, serviceStartedAt: T, serviceFinishedAt: T })).toBe('FINISHED_AWAITING_CLOSE')
    }
  })

  it('ปิดงาน / ไม่มาตามนัด / ลูกค้ายืนยัน / ยกเลิก / คืน / ร่าง ชนะขั้นระหว่างทำงาน', () => {
    for (const i of inputs.slice(4)) {
      expect(deriveServiceStatus({ ...i, serviceStartedAt: T, serviceFinishedAt: T })).toBe(deriveServiceStatus(i))
    }
  })

  it('คำฝั่งร้านตาม BRD FR-009/010 ตรงตัว', () => {
    const b = { status: 'PENDING', appointmentStatus: null, hasAppointment: false, serviceClosedAt: null }
    expect(resolveServiceStatusBadge({ ...b, serviceStartedAt: T }, 'seller').label).toBe('กำลังให้บริการ')
    expect(resolveServiceStatusBadge({ ...b, serviceStartedAt: T, serviceFinishedAt: T }, 'seller').label).toBe('ทำเสร็จ · รอปิดงาน')
  })
})

describe('00086 FR-001 — งานหน้าร้าน (arrivalMode) = ป้าย WALK_IN แม้มีเวลาเริ่ม', () => {
  it('[blocker] มีเวลาเริ่ม + WALK_IN ⇒ WALK_IN ไม่ใช่ BOOKED ("จองแล้ว") · ร้าน "รอเริ่มงาน" · ลูกค้า "รับงานแล้ว"', () => {
    expect(s({ arrivalMode: 'WALK_IN' })).toBe('WALK_IN')
    expect(resolveServiceStatusBadge({ ...base, arrivalMode: 'WALK_IN' }, 'seller').label).toBe('รอเริ่มงาน')
    expect(resolveServiceStatusBadge({ ...base, arrivalMode: 'WALK_IN' }, 'buyer').label).toBe('รับงานแล้ว')
  })

  // มติ user 2026-10-30 — ป้ายฝั่งร้านต้องไม่ใช้คำ "รับงาน" (ชนกับปุ่ม "รับงานนี้" ที่ช่างกดรับ ทั้งที่ยังไม่มีใครรับ)
  it('[blocker] ป้ายฝั่งร้านทุกตัวไม่มีคำ "รับงาน" — ไม่ชนกับปุ่ม "รับงานนี้"', () => {
    for (const k of SERVICE_STATUS_KEYS) expect(SERVICE_STATUS_META[k].seller).not.toContain('รับงาน')
  })

  it('[blocker] ไม่ส่ง arrivalMode (undefined) ⇒ ผลเดิมทุกกรณี (ตารางเทียบทุกสถานะ)', () => {
    const statuses = ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED', 'RETURNED', 'DRAFTED']
    const appts = [null, 'SCHEDULED', 'CONFIRMED_BY_BUYER', 'RESCHEDULE_REQUESTED', 'COMPLETED', 'NO_SHOW']
    for (const status of statuses)
      for (const appointmentStatus of appts)
        for (const hasAppointment of [true, false])
          for (const serviceClosedAt of [null, closed]) {
            const o: ServiceStatusInput = { status, appointmentStatus, hasAppointment, serviceClosedAt, outstanding: 0 }
            const legacy = deriveServiceStatus(o)
            expect(deriveServiceStatus({ ...o, arrivalMode: undefined })).toBe(legacy)
            expect(deriveServiceStatus({ ...o, arrivalMode: null })).toBe(legacy)
            // จองล่วงหน้า/ยังไม่ระบุเวลา ไม่เปลี่ยนผลเลย — เปลี่ยนได้แค่ WALK_IN
            expect(deriveServiceStatus({ ...o, arrivalMode: 'BOOKED' })).toBe(legacy)
            expect(deriveServiceStatus({ ...o, arrivalMode: 'UNSCHEDULED' })).toBe(legacy)
          }
  })

  it('[blocker] WALK_IN ไม่ทับสถานะที่สำคัญกว่า — ปิดงาน/ลูกค้ายืนยัน/ไม่มาตามนัด/ยกเลิก/เริ่มงานแล้ว ชนะเสมอ', () => {
    expect(s({ arrivalMode: 'WALK_IN', serviceClosedAt: closed })).toBe('CLOSED_PAID')
    expect(s({ arrivalMode: 'WALK_IN', status: 'CONFIRMED' })).toBe('BUYER_CONFIRMED_AWAITING_CLOSE')
    expect(s({ arrivalMode: 'WALK_IN', appointmentStatus: 'NO_SHOW' })).toBe('NO_SHOW')
    expect(s({ arrivalMode: 'WALK_IN', status: 'CANCELLED' })).toBe('CANCELLED')
    expect(s({ arrivalMode: 'WALK_IN', serviceStartedAt: closed })).toBe('IN_SERVICE')
    expect(s({ arrivalMode: 'WALK_IN', serviceStartedAt: closed, serviceFinishedAt: closed })).toBe('FINISHED_AWAITING_CLOSE')
  })

  it('คำขอเลื่อน/ยืนยันนัดของลูกค้าชนะ WALK_IN — ร้านต้องเห็นคำขอ ไม่ถูกกลบด้วย "รอเริ่มงาน"', () => {
    expect(s({ arrivalMode: 'WALK_IN', appointmentStatus: 'RESCHEDULE_REQUESTED' })).toBe('RESCHEDULE_REQUESTED')
    expect(s({ arrivalMode: 'WALK_IN', appointmentStatus: 'CONFIRMED_BY_BUYER' })).toBe('APPOINTMENT_CONFIRMED')
    expect(s({ arrivalMode: 'WALK_IN', appointmentStatus: 'SCHEDULED' })).toBe('WALK_IN')
    // จองล่วงหน้ายังเดินขั้นนัดตามเดิม
    expect(s({ arrivalMode: 'BOOKED', appointmentStatus: 'RESCHEDULE_REQUESTED' })).toBe('RESCHEDULE_REQUESTED')
    expect(s({ arrivalMode: 'BOOKED', appointmentStatus: 'CONFIRMED_BY_BUYER' })).toBe('APPOINTMENT_CONFIRMED')
  })
})

describe('serviceArrivalOf — แบบการมาจากแถวออเดอร์', () => {
  const created = '2026-10-27T03:00:00.000Z'
  const sameTime = created
  const farFuture = '2026-10-30T03:00:00.000Z'

  it('ค่าที่ร้านเลือกชนะสูตร', () => {
    expect(serviceArrivalOf({ arrivalMode: 'BOOKED', serviceStart: sameTime, createdAt: created })).toBe('BOOKED')
    expect(serviceArrivalOf({ arrivalMode: 'WALK_IN', serviceStart: farFuture, createdAt: created })).toBe('WALK_IN')
  })

  it('[blocker] ใบเก่าไม่มีค่าเก็บ ⇒ สูตรเดิม (ชุดเดียวกับ backfill 20261027100200)', () => {
    expect(serviceArrivalOf({ arrivalMode: null, serviceStart: sameTime, createdAt: created })).toBe('WALK_IN')
    expect(serviceArrivalOf({ arrivalMode: null, serviceStart: farFuture, createdAt: created })).toBe('BOOKED')
    expect(serviceArrivalOf({ arrivalMode: null, serviceStart: null, createdAt: created })).toBe('UNSCHEDULED')
  })

  it('[blocker] ไม่มี createdAt (ผู้เรียกเก่า) ⇒ เชื่อได้แค่ค่าที่เก็บ · ไม่มีอะไรเลย = undefined (ป้ายเดิม)', () => {
    expect(serviceArrivalOf({ arrivalMode: 'WALK_IN', serviceStart: sameTime })).toBe('WALK_IN')
    expect(serviceArrivalOf({ serviceStart: sameTime })).toBeUndefined()
    expect(serviceArrivalOf({ arrivalMode: 'LATER', serviceStart: sameTime, createdAt: null })).toBeUndefined()
  })
})

describe('appointmentStageBadge — ป้ายการ์ดนัด (ตารางงานรายวัน · การ์ด "การนัดหมาย")', () => {
  it('[blocker] SCHEDULED + WALK_IN ⇒ "รอเริ่มงาน" (ไม่ใช่ "นัดแล้ว")', () => {
    expect(appointmentStageBadge('SCHEDULED', 'WALK_IN')).toEqual({
      label: SERVICE_STATUS_META.WALK_IN.seller,
      cls: SERVICE_STATUS_META.WALK_IN.cls,
      icon: SERVICE_STATUS_META.WALK_IN.icon,
    })
    expect(appointmentStageBadge('SCHEDULED', 'WALK_IN').label).toBe('รอเริ่มงาน')
  })

  it('[blocker] ไม่ส่ง arrival / จองล่วงหน้า / สถานะอื่น ⇒ ป้ายเดิมทุกตัว', () => {
    for (const st of APPOINTMENT_STAGE_KEYS) {
      expect(appointmentStageBadge(st)).toBe(APPOINTMENT_STAGE_META[st])
      expect(appointmentStageBadge(st, 'BOOKED')).toBe(APPOINTMENT_STAGE_META[st])
      if (st !== 'SCHEDULED') expect(appointmentStageBadge(st, 'WALK_IN')).toBe(APPOINTMENT_STAGE_META[st])
    }
    expect(appointmentStageBadge('SCHEDULED', 'BOOKED').label).toBe('นัดแล้ว')
  })
})
