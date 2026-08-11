/**
 * appointment-day-view — เทส [blocker] ของตรรกะการ์ดคิวงานรายวัน
 *
 * ทำไมต้องมี: ทั้งสี่ฟังก์ชันในไฟล์นั้นตัดสิน "จอจะแสดง/ไม่แสดงอะไร" ซึ่งเขียนกลับด้านแล้ว
 * **ผ่านทุก gate ของโปรเจกต์** (tsc/build/detector/theme-guard/grep) เพราะชนิดถูกทุกตัวอักษร
 * สิ่งที่ผิดคือความหมาย (ui-boolean-needs-a-testable-home.md)
 *
 * 🛑 แดงเมื่อไหร่ห้าม merge
 *
 * พิสูจน์ด้วย mutation แล้ว (2026-08-11 — คืนตรรกะผิดกลับไปแล้วต้องแดงจริง):
 *   คีย์กลุ่ม `${start}|${end}` → `${start}`                    → แดง 1 (สองช่วงเริ่มพร้อมกันถูกยุบ)
 *   `now >= start` → `now > start` ใน appointmentCardAction     → แดง 1 (เคสถึงเวลาพอดี)
 *   ย้าย branch RESCHEDULE_REQUESTED ไปไว้หลังเช็คเวลา          → แดง 1 (ขอเลื่อนก่อนถึงเวลาได้ none)
 *   ถอด `items.length === 0` ออกจาก isSlotFullyClosed           → แดง 1 (vacuous truth)
 *   `every` → `some` ใน isSlotFullyClosed                        → แดง 1 (เหลือค้างใบเดียวก็ยุบ)
 *
 * หมายเหตุ: ชื่อเทสห้ามมีอักขระ emoji (theme-guard HR12 สแกน string ในไฟล์ ไม่ใช่แค่ JSX)
 * เคสที่สำคัญที่สุดจึงขึ้นต้นด้วย "[สำคัญ]" แทนเครื่องหมาย
 */

import { describe, expect, it } from 'vitest'
import {
  appointmentCardAction,
  groupAppointmentsBySlot,
  isClosedAppointment,
  isSlotFullyClosed,
  shiftDayKey,
  summarizeDay,
  type DayViewItem,
} from '../appointment-day-view'

/** เวลาไทย → ISO (UTC+7) — เขียนเป็นตัวช่วยเพราะ fixture ทั้งไฟล์คิดเป็นเวลาไทย */
function th(day: number, hh: number, mm = 0): string {
  return new Date(Date.UTC(2026, 7, day, hh - 7, mm)).toISOString()
}

function item(over: Partial<DayViewItem> & { orderToken: string }): DayViewItem {
  return {
    start: th(15, 9),
    end: th(15, 10),
    appointmentStatus: 'SCHEDULED',
    ...over,
  }
}

describe('groupAppointmentsBySlot', () => {
  it('ยุบนัดที่ช่วงเวลาเหมือนกันเป๊ะเข้ากลุ่มเดียว และเรียงตามเวลาเริ่ม', () => {
    const groups = groupAppointmentsBySlot([
      item({ orderToken: 'b', start: th(15, 10), end: th(15, 11) }),
      item({ orderToken: 'a1' }),
      item({ orderToken: 'a2' }),
    ])
    expect(groups.map((g) => g.items.length)).toEqual([2, 1])
    expect(groups[0].label).toBe('09:00 – 10:00')
    expect(groups[1].label).toBe('10:00 – 11:00')
  })

  it('[สำคัญ] เริ่มเวลาเดียวกันแต่จบคนละเวลา = คนละกลุ่ม (คีย์ต้องเป็นคู่ start+end)', () => {
    const groups = groupAppointmentsBySlot([
      item({ orderToken: 'a', start: th(15, 9), end: th(15, 10) }),
      item({ orderToken: 'b', start: th(15, 9), end: th(15, 11) }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.label)).toEqual(['09:00 – 10:00', '09:00 – 11:00'])
  })

  it('กลุ่ม "ทั้งวัน" อยู่บนสุดเสมอ แม้จะมีนัดเช้ากว่า', () => {
    const groups = groupAppointmentsBySlot([
      item({ orderToken: 'เช้า', start: th(15, 6), end: th(15, 7) }),
      item({ orderToken: 'ทั้งวัน', start: th(15, 0), end: th(16, 0) }),
    ])
    expect(groups[0].allDay).toBe(true)
    expect(groups[0].items[0].orderToken).toBe('ทั้งวัน')
    expect(groups[0].label).toBe('')
    expect(groups[1].allDay).toBe(false)
  })

  it('คีย์ของกลุ่มไม่ซ้ำกัน (ใช้เป็น React key ได้)', () => {
    const groups = groupAppointmentsBySlot([
      item({ orderToken: 'a' }),
      item({ orderToken: 'b', start: th(15, 10), end: th(15, 11) }),
      item({ orderToken: 'c', start: th(15, 0), end: th(16, 0) }),
    ])
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length)
  })

  it('ไม่มีนัด = ไม่มีกลุ่ม', () => {
    expect(groupAppointmentsBySlot([])).toEqual([])
  })
})

describe('appointmentCardAction', () => {
  const now = new Date(th(15, 10, 30))

  it('ยังไม่ถึงเวลานัด = ไม่มีปุ่ม (BR-RSV-34 — ไม่ใช่ปุ่ม disabled)', () => {
    expect(
      appointmentCardAction({ startISO: th(15, 14), appointmentStatus: 'SCHEDULED', now }),
    ).toBe('none')
  })

  it('[สำคัญ] ถึงเวลาพอดี (start === now) = กดปิดผลได้แล้ว', () => {
    expect(
      appointmentCardAction({ startISO: th(15, 10, 30), appointmentStatus: 'SCHEDULED', now }),
    ).toBe('close')
  })

  it('เลยเวลามาแล้วและยังไม่ปิดผล = โชว์ปุ่มปิดผล', () => {
    expect(
      appointmentCardAction({ startISO: th(15, 9), appointmentStatus: 'SCHEDULED', now }),
    ).toBe('close')
    expect(
      appointmentCardAction({
        startISO: th(15, 9),
        appointmentStatus: 'CONFIRMED_BY_BUYER',
        now,
      }),
    ).toBe('close')
  })

  it('ปิดผลไปแล้ว = ไม่มีปุ่ม', () => {
    for (const s of ['COMPLETED', 'NO_SHOW']) {
      expect(appointmentCardAction({ startISO: th(15, 9), appointmentStatus: s, now })).toBe(
        'none',
      )
    }
  })

  it('[สำคัญ] ลูกค้าขอเลื่อน = ปุ่มเลือกเวลาใหม่ แม้ยังไม่ถึงเวลานัด', () => {
    expect(
      appointmentCardAction({
        startISO: th(15, 14),
        appointmentStatus: 'RESCHEDULE_REQUESTED',
        now,
      }),
    ).toBe('reschedule')
  })

  it('สถานะ null = ถือเป็นนัดแล้ว (ตรงกับ default ของปฏิทิน)', () => {
    expect(appointmentCardAction({ startISO: th(15, 9), appointmentStatus: null, now })).toBe(
      'close',
    )
  })

  it('เวลาเสีย = ไม่มีปุ่ม ไม่ใช่ crash', () => {
    expect(appointmentCardAction({ startISO: 'ไม่ใช่วันที่', appointmentStatus: null, now })).toBe(
      'none',
    )
  })
})

describe('isSlotFullyClosed', () => {
  it('ปิดผลครบทุกใบ = ยุบได้', () => {
    expect(
      isSlotFullyClosed([
        item({ orderToken: 'a', appointmentStatus: 'COMPLETED' }),
        item({ orderToken: 'b', appointmentStatus: 'NO_SHOW' }),
      ]),
    ).toBe(true)
  })

  it('[สำคัญ] เหลือค้างใบเดียวก็ห้ามยุบ', () => {
    expect(
      isSlotFullyClosed([
        item({ orderToken: 'a', appointmentStatus: 'COMPLETED' }),
        item({ orderToken: 'b', appointmentStatus: 'SCHEDULED' }),
      ]),
    ).toBe(false)
  })

  it('[สำคัญ] กลุ่มว่างห้ามยุบ (vacuous truth ของ every)', () => {
    expect(isSlotFullyClosed([])).toBe(false)
  })
})

describe('isClosedAppointment', () => {
  it('รับค่าดิบจาก API ที่เป็น null/ค่าแปลกได้', () => {
    expect(isClosedAppointment(null)).toBe(false)
    expect(isClosedAppointment(undefined)).toBe(false)
    expect(isClosedAppointment('ค่าที่ไม่รู้จัก')).toBe(false)
    expect(isClosedAppointment('COMPLETED')).toBe(true)
  })
})

describe('summarizeDay', () => {
  it('นับเฉพาะใบที่ปิดผลจริง — CONFIRMED_BY_BUYER ไม่นับว่าจบ', () => {
    const s = summarizeDay([
      item({ orderToken: 'a', appointmentStatus: 'COMPLETED' }),
      item({ orderToken: 'b', appointmentStatus: 'NO_SHOW' }),
      item({ orderToken: 'c', appointmentStatus: 'CONFIRMED_BY_BUYER' }),
      item({ orderToken: 'd', appointmentStatus: 'SCHEDULED' }),
    ])
    expect(s).toEqual({ total: 4, completed: 1, noShow: 1, closed: 2 })
  })
})

describe('shiftDayKey', () => {
  it('ข้ามเดือนและข้ามปีได้', () => {
    expect(shiftDayKey('2026-08-15', 1)).toBe('2026-08-16')
    expect(shiftDayKey('2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftDayKey('2026-09-01', -1)).toBe('2026-08-31')
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDayKey('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('ปีอธิกสุรทิน', () => {
    expect(shiftDayKey('2028-02-28', 1)).toBe('2028-02-29')
    expect(shiftDayKey('2026-02-28', 1)).toBe('2026-03-01')
  })
})
