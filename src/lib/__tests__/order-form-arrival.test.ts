/**
 * order-form-arrival — การตัดสินใจของฟอร์มสร้างออเดอร์ร้านบริการ (00086 P2-T4)
 *
 * mutation ที่ต้องแดง (ทำแล้วตอนเขียน):
 *  - usesServiceCreateLayout: ถอด `&& !editOrderToken` → หน้าแก้ไขได้ฟอร์มใหม่ [blocker] แดง
 *  - sendsArrivalMode: ถอด `resourceCount > 0` → ร้านไม่มีคิวงานถูกบังคับเลือก [blocker] แดง
 *  - arrivalAppointmentProblem: TIME ไม่ตรวจเวลา / WALK_IN ตรวจวัน → แดง
 */
import { describe, it, expect } from 'vitest'
import {
  ARRIVAL_BOOKED_NEEDS_TIME_MSG,
  ARRIVAL_CHOICE_COPY,
  ARRIVAL_WALK_IN_NEEDS_QUEUE_MSG,
  arrivalAppointmentProblem,
  arrivalBlockIcon,
  arrivalBlockTitle,
  arrivalSubmitLabel,
  arrivalChoiceAfterPrefill,
  sendsArrivalMode,
  usesServiceCreateLayout,
  walkInAppointmentPayload,
  appointmentErrorsToClearOnArrivalChange,
  walkInPreviewText,
} from '../order-form-arrival'
import { ARRIVAL_MODE_META } from '../arrival-mode'

describe('usesServiceCreateLayout', () => {
  it('[blocker] เฉพาะร้านบริการตอนสร้าง', () => {
    expect(usesServiceCreateLayout('SERVICE_QUEUE', undefined)).toBe(true)
  })
  it('[blocker] หน้าแก้ไขของร้านบริการคงฟอร์มเดิม', () => {
    expect(usesServiceCreateLayout('SERVICE_QUEUE', 'tok-1')).toBe(false)
  })
  it.each(['ONLINE_SALES', 'LODGING', 'GENERAL', undefined])('ร้าน %s คงฟอร์มเดิม', (v) => {
    expect(usesServiceCreateLayout(v, undefined)).toBe(false)
  })
})

describe('sendsArrivalMode', () => {
  it('ส่งเมื่อ serviceLayout + เปิดคิวงาน + มีคิวงาน', () => {
    expect(sendsArrivalMode({ serviceLayout: true, resourcesEnabled: true, resourceCount: 2 })).toBe(true)
  })
  it('[blocker] ร้านบริการที่ยังไม่มีคิวงาน ไม่ส่ง (ไม่งั้นบันทึกไม่ได้เลย)', () => {
    expect(sendsArrivalMode({ serviceLayout: true, resourcesEnabled: true, resourceCount: 0 })).toBe(false)
    expect(sendsArrivalMode({ serviceLayout: true, resourcesEnabled: false, resourceCount: 2 })).toBe(false)
  })
  it('[blocker] ไม่ใช่ serviceLayout (ร้านอื่น/หน้าแก้ไข) ไม่ส่ง', () => {
    expect(sendsArrivalMode({ serviceLayout: false, resourcesEnabled: true, resourceCount: 2 })).toBe(false)
  })
})

describe('arrivalChoiceAfterPrefill', () => {
  it('มีวันจากปฏิทิน = จองล่วงหน้าเสมอ แม้กำลังเลือกหน้าร้านอยู่', () => {
    expect(arrivalChoiceAfterPrefill('WALK_IN', true)).toBe('BOOKED')
  })
  it('ไม่มี prefill = คงค่าเดิม · ค่าว่าง = BOOKED', () => {
    expect(arrivalChoiceAfterPrefill('WALK_IN', false)).toBe('WALK_IN')
    expect(arrivalChoiceAfterPrefill(undefined, false)).toBe('BOOKED')
  })
})

describe('arrivalAppointmentProblem', () => {
  const full = { resourceId: 'r1', date: '2026-10-28', startTime: '10:00', endTime: '11:00' }

  it('BOOKED ครบ = ไม่มีปัญหา', () => {
    expect(arrivalAppointmentProblem('BOOKED', full, 'TIME')).toBeNull()
  })
  it('BOOKED ไม่มีคิวงาน → เลือกวันและเวลานัด (ผูกช่องคิวงาน)', () => {
    expect(arrivalAppointmentProblem('BOOKED', { date: '2026-10-28' }, 'TIME')).toEqual({
      code: 'ARRIVAL_BOOKED_NEEDS_TIME',
      field: 'appointment.resourceId',
      message: ARRIVAL_BOOKED_NEEDS_TIME_MSG,
    })
    expect(arrivalAppointmentProblem('BOOKED', undefined, 'DAY')?.code).toBe('ARRIVAL_BOOKED_NEEDS_TIME')
  })
  it('BOOKED ไม่มีวัน → เลือกวันและเวลานัด', () => {
    expect(arrivalAppointmentProblem('BOOKED', { resourceId: 'r1' }, 'DAY')?.field).toBe('appointment.endTime')
  })
  it('BOOKED ร้านแบบระบุเวลา ไม่มีเวลา → ปัญหา · ร้านรายวัน ไม่ต้องมีเวลา', () => {
    const noTime = { resourceId: 'r1', date: '2026-10-28' }
    expect(arrivalAppointmentProblem('BOOKED', noTime, 'TIME')?.message).toBe(ARRIVAL_BOOKED_NEEDS_TIME_MSG)
    expect(arrivalAppointmentProblem('BOOKED', { ...noTime, startTime: '10:00' }, 'TIME')).not.toBeNull()
    expect(arrivalAppointmentProblem('BOOKED', noTime, 'DAY')).toBeNull()
  })
  it('WALK_IN ต้องการแค่คิวงาน — ไม่ถามวัน/เวลา', () => {
    expect(arrivalAppointmentProblem('WALK_IN', { resourceId: 'r1' }, 'TIME')).toBeNull()
    expect(arrivalAppointmentProblem('WALK_IN', {}, 'TIME')).toEqual({
      code: 'ARRIVAL_WALK_IN_NEEDS_QUEUE',
      field: 'appointment.resourceId',
      message: ARRIVAL_WALK_IN_NEEDS_QUEUE_MSG,
    })
  })
  it('ข้อความตรงกับที่ API ตอบ', () => {
    expect(ARRIVAL_BOOKED_NEEDS_TIME_MSG).toBe('เลือกวันและเวลานัด')
    expect(ARRIVAL_WALK_IN_NEEDS_QUEUE_MSG).toBe('เลือกคิวงาน')
  })
})

describe('walkInAppointmentPayload', () => {
  it('[MINOR-1] ส่งแค่คิวงาน — ไม่มี start/end/deposit/durationMin (server อ่านระยะเวลาจากคิวงานเอง)', () => {
    expect(walkInAppointmentPayload('r1')).toEqual({ resourceId: 'r1' })
    expect(Object.keys(walkInAppointmentPayload('r1'))).toEqual(['resourceId'])
  })
})

describe('appointmentErrorsToClearOnArrivalChange (review P2 NIT-3)', () => {
  it('สลับโหมด → ล้าง error ของบล็อกนัดทั้งก้อน', () => {
    expect(appointmentErrorsToClearOnArrivalChange('BOOKED', 'WALK_IN')).toEqual(['appointment'])
    expect(appointmentErrorsToClearOnArrivalChange('WALK_IN', 'BOOKED')).toEqual(['appointment'])
  })
  it('ค่าเดิม / ครั้งแรก / ไม่มีโหมด (ร้านอื่น) → ไม่ล้าง', () => {
    expect(appointmentErrorsToClearOnArrivalChange('BOOKED', 'BOOKED')).toEqual([])
    expect(appointmentErrorsToClearOnArrivalChange(undefined, 'BOOKED')).toEqual([])
    expect(appointmentErrorsToClearOnArrivalChange('BOOKED', undefined)).toEqual([])
  })
})

describe('walkInPreviewText', () => {
  it('เริ่ม HH:MM — ประมาณ HH:MM น. ของวันนี้ ตาม walkInWindow (เวลาไทย)', () => {
    // 2026-10-27 13:04:37 เวลาไทย = 06:04:37Z
    const text = walkInPreviewText(new Date('2026-10-27T06:04:37Z'), 90)
    expect(text).toBe('เริ่ม 13:04 — ประมาณ 14:34 น. ของวันนี้ · ไม่ต้องเลือกวันเวลา · ไม่เก็บมัดจำ')
  })
})

describe('ARRIVAL_CHOICE_COPY', () => {
  it('ป้ายตาม prototype v13', () => {
    expect(ARRIVAL_CHOICE_COPY.BOOKED).toMatchObject({ title: 'จองล่วงหน้า', hint: 'นัดวันและเวลา', icon: 'calendar-event' })
    expect(ARRIVAL_CHOICE_COPY.WALK_IN).toMatchObject({ title: 'หน้าร้าน', hint: 'ลูกค้าอยู่ที่ร้านตอนนี้', icon: 'walk' })
  })
})

describe('arrivalBlockTitle (00086 P2-T5 — หัวบล็อกนัด/คิว มือถือ + เดสก์ท็อปคำเดียวกัน)', () => {
  it('WALK_IN = "เข้าคิววันนี้" · BOOKED = "วันเข้าใช้บริการ"', () => {
    expect(arrivalBlockTitle('WALK_IN')).toBe('เข้าคิววันนี้')
    expect(arrivalBlockTitle('BOOKED')).toBe('วันเข้าใช้บริการ')
  })
  it('[blocker] ไม่มี mode (ร้านอื่น/หน้าแก้ไข) = คำเดิม', () => {
    expect(arrivalBlockTitle(undefined)).toBe('วันเข้าใช้บริการ')
  })
})

describe('arrivalSubmitLabel (00086 v13 — ปุ่มบันทึกบอกผลของงานหน้าร้าน)', () => {
  it('[blocker] WALK_IN = "บันทึกงานบริการ · เข้าคิววันนี้"', () => {
    expect(arrivalSubmitLabel('บันทึกงานบริการ', 'WALK_IN')).toBe('บันทึกงานบริการ · เข้าคิววันนี้')
  })
  it('[blocker] BOOKED / ไม่มี mode (ร้านอื่น/หน้าแก้ไข) = คำเดิมทุกตัวอักษร', () => {
    expect(arrivalSubmitLabel('บันทึกงานบริการ', 'BOOKED')).toBe('บันทึกงานบริการ')
    expect(arrivalSubmitLabel('บันทึกคำสั่งซื้อ', undefined)).toBe('บันทึกคำสั่งซื้อ')
  })
})

describe('arrivalBlockIcon (00086 v13 — ไอคอนเดินหน้า "เข้าคิววันนี้")', () => {
  it('WALK_IN = ไอคอนเดียวกับชิป "หน้าร้าน" · อื่น ๆ = null', () => {
    expect(arrivalBlockIcon('WALK_IN')).toBe(ARRIVAL_MODE_META.WALK_IN.icon)
    expect(arrivalBlockIcon('BOOKED')).toBeNull()
    expect(arrivalBlockIcon(undefined)).toBeNull()
  })
})
