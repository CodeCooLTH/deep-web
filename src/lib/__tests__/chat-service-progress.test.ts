import { describe, expect, it } from 'vitest'
import {
  filterActiveServiceOrders,
  serviceProgressStage,
  SERVICE_STAGE_CHIP_META,
} from '../chat-service-progress'
import { APPOINTMENT_STATUS_LABEL } from '../appointments'

// fixture ย่อ — shape เดียวกับที่แถบสถานะในห้องแชทได้รับจริง (CustomerPanelOrder)
const base = {
  status: 'PENDING',
  serviceStart: null as string | null,
  appointmentStatus: null as string | null,
}

const WITH_APPT = { ...base, serviceStart: '2026-08-15T12:00:00.000Z' }

describe('serviceProgressStage', () => {
  it('ยกเลิกทั้งใบ = DONE ไม่ว่านัดอยู่สถานะไหน', () => {
    expect(
      serviceProgressStage({ ...WITH_APPT, status: 'CANCELLED', appointmentStatus: 'SCHEDULED' }),
    ).toBe('DONE')
  })

  it('มีนัดแต่ยังไม่มีสถานะ = SCHEDULED (ค่าตั้งต้นเดียวกับปฏิทินคิวงาน)', () => {
    expect(serviceProgressStage(WITH_APPT)).toBe('SCHEDULED')
  })

  it('ให้บริการแล้ว/ไม่มาตามนัด = DONE — หลุดจากรายการงานค้าง', () => {
    expect(serviceProgressStage({ ...WITH_APPT, appointmentStatus: 'COMPLETED' })).toBe('DONE')
    expect(serviceProgressStage({ ...WITH_APPT, appointmentStatus: 'NO_SHOW' })).toBe('DONE')
  })

  it('ลูกค้ายืนยัน/ขอเลื่อน = ยังเป็นงานค้าง ไม่ใช่ DONE', () => {
    expect(serviceProgressStage({ ...WITH_APPT, appointmentStatus: 'CONFIRMED_BY_BUYER' })).toBe(
      'CONFIRMED_BY_BUYER',
    )
    expect(serviceProgressStage({ ...WITH_APPT, appointmentStatus: 'RESCHEDULE_REQUESTED' })).toBe(
      'RESCHEDULE_REQUESTED',
    )
  })

  it('ไม่มีนัดผูก (walk-in) ที่ยังเปิดอยู่ = PENDING ไม่ใช่ตกหาย (BR-RSV-04)', () => {
    expect(serviceProgressStage(base)).toBe('PENDING')
  })

  it('walk-in ที่ปิดการขายแล้ว = DONE', () => {
    expect(serviceProgressStage({ ...base, status: 'CONFIRMED' })).toBe('DONE')
  })

  /**
   * นี่คือบั๊กที่ user เจอบน prod 2026-08-08: ร้านคิวงานถูกตัดสินด้วยแกนขนส่ง ซึ่งออเดอร์
   * บริการไม่มีวันเดินถึงปลายทางได้เลย จึงค้างอยู่ในแถบสถานะตลอดกาลพร้อมป้าย "รอเลขพัสดุ"
   * เทสนี้ตรึงว่าใบที่จบแล้วต้องหลุดออกจริง ไม่ใช่แค่เปลี่ยนคำบนป้าย
   */
  it('สถานะที่ปิดงานแล้วต้องหลุดจากรายการงานค้างจริง ไม่ใช่แค่เปลี่ยนป้าย', () => {
    const rows = [
      { ...WITH_APPT, appointmentStatus: 'COMPLETED' },
      { ...WITH_APPT, appointmentStatus: 'SCHEDULED' },
      { ...WITH_APPT, status: 'CANCELLED', appointmentStatus: 'SCHEDULED' },
      base, // walk-in ที่ยังเปิดอยู่
    ]
    expect(filterActiveServiceOrders(rows)).toEqual([
      { ...WITH_APPT, appointmentStatus: 'SCHEDULED' },
      base,
    ])
  })
})

describe('SERVICE_STAGE_CHIP_META', () => {
  /**
   * BR-SOV-03 — ป้ายต้องมาจาก APPOINTMENT_STATUS_LABEL ที่เดียว ปฏิทินคิวงาน หน้า /orders
   * และห้องแชทต้องเรียกสถานะเดียวกันด้วยคำเดียวกัน เทสนี้จับกรณีที่มีคนมาตั้งคำใหม่ตรงนี้
   */
  it('ป้ายของสถานะนัดตรงกับ SSOT ไม่มีการตั้งคำใหม่', () => {
    expect(SERVICE_STAGE_CHIP_META.SCHEDULED.label).toBe(APPOINTMENT_STATUS_LABEL.SCHEDULED)
    expect(SERVICE_STAGE_CHIP_META.CONFIRMED_BY_BUYER.label).toBe(
      APPOINTMENT_STATUS_LABEL.CONFIRMED_BY_BUYER,
    )
    expect(SERVICE_STAGE_CHIP_META.RESCHEDULE_REQUESTED.label).toBe(
      APPOINTMENT_STATUS_LABEL.RESCHEDULE_REQUESTED,
    )
  })

  /**
   * Verified-Means-Green — เขียวสงวนไว้กับสิ่งที่เกิดขึ้นแล้วเท่านั้น กองที่ยังเป็นงานค้าง
   * (ยังไม่ถึงวันนัดด้วยซ้ำ) ห้ามเป็นเขียว ไม่งั้นผู้ขายอ่านว่างานจบแล้ว
   */
  it('ไม่มีกองงานค้างช่องไหนใช้สีเขียว (success)', () => {
    for (const meta of Object.values(SERVICE_STAGE_CHIP_META)) {
      expect(meta.cls).not.toContain('success')
    }
  })
})
