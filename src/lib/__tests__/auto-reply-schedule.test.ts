/**
 * auto-reply-schedule.test.ts — เวลาทำงานของ DeepBot (feature 00023 เฟส A)
 *
 * เทสชุดนี้เน้น 2 เรื่องที่พลาดง่ายที่สุดและพังแบบเงียบ ๆ:
 *   1) timezone — เซิร์ฟเวอร์รัน UTC ถ้าเทียบผิดจะเพี้ยน 7 ชั่วโมงโดยไม่มี error
 *   2) ช่วงข้ามเที่ยงคืน — ต้องยึด "วันที่เริ่ม" เป็นเจ้าของช่วง ไม่ใช่วันปัจจุบัน
 */

import { describe, it, expect } from 'vitest'
import {
  isWithinSchedule,
  bangkokNowParts,
  isDayEnabled,
  parseHhMm,
  formatHhMm,
  ALL_DAYS_MASK,
  type ActiveSchedule,
} from '@/lib/auto-reply-schedule'

/** เวลาไทยที่อ่านง่าย → Date (UTC) — 2026-08-03 เป็นวันจันทร์ */
const bkk = (iso: string) => new Date(`${iso}+07:00`)

const MON = 1, TUE = 2, WED = 4, THU = 8, FRI = 16, SAT = 32, SUN = 64
const WEEKDAYS = MON | TUE | WED | THU | FRI

const sched = (o: Partial<ActiveSchedule> = {}): ActiveSchedule => ({
  activeScheduleMode: 'WINDOW',
  activeStartMin: 18 * 60, // 18:00
  activeEndMin: 9 * 60, // 09:00 ของวันรุ่งขึ้น
  activeDays: ALL_DAYS_MASK,
  ...o,
})

describe('bangkokNowParts — timezone', () => {
  it('เที่ยงคืนตรงเวลาไทย = นาทีที่ 0 (ไม่ใช่ 17:00 ของ UTC เมื่อวาน)', () => {
    expect(bangkokNowParts(bkk('2026-08-03T00:00:00')).minuteOfDay).toBe(0)
  })

  it('18:00 เวลาไทย = 1080', () => {
    expect(bangkokNowParts(bkk('2026-08-03T18:00:00')).minuteOfDay).toBe(1080)
  })

  it('23:30 ไทย ยังเป็นวันจันทร์ ทั้งที่ UTC ข้ามไปวันอังคารแล้ว', () => {
    // 2026-08-03 23:30 +07:00 = 2026-08-03 16:30 UTC → ยังจันทร์ทั้งคู่; ทดสอบเคสที่ UTC ยังไม่ข้าม
    const p = bangkokNowParts(bkk('2026-08-03T23:30:00'))
    expect(p.isoWeekday).toBe(1)
  })

  it('01:00 ไทยวันอังคาร = อังคาร ทั้งที่ UTC ยังเป็นคืนวันจันทร์', () => {
    // 2026-08-04 01:00 +07:00 = 2026-08-03 18:00 UTC (ยังจันทร์ในสายตา UTC)
    const p = bangkokNowParts(bkk('2026-08-04T01:00:00'))
    expect(p.isoWeekday).toBe(2)
  })

  it('อาทิตย์ = 7 ไม่ใช่ 0', () => {
    expect(bangkokNowParts(bkk('2026-08-09T12:00:00')).isoWeekday).toBe(7)
  })
})

describe('isDayEnabled', () => {
  it('จันทร์=1 อังคาร=2 อาทิตย์=64', () => {
    expect(isDayEnabled(MON, 1)).toBe(true)
    expect(isDayEnabled(MON, 2)).toBe(false)
    expect(isDayEnabled(SUN, 7)).toBe(true)
    expect(isDayEnabled(WEEKDAYS, 6)).toBe(false) // เสาร์
    expect(isDayEnabled(ALL_DAYS_MASK, 7)).toBe(true)
  })
})

describe('โหมด ALWAYS', () => {
  it('ทำงานทุกเวลา แม้ตั้งช่วงเวลาค้างไว้', () => {
    const s = sched({ activeScheduleMode: 'ALWAYS' })
    expect(isWithinSchedule(s, bkk('2026-08-03T12:00:00'))).toBe(true)
    expect(isWithinSchedule(s, bkk('2026-08-03T03:00:00'))).toBe(true)
  })
})

describe('ช่วงในวันเดียว 09:00-18:00', () => {
  const s = sched({ activeStartMin: 540, activeEndMin: 1080 })

  it('10:00 = ทำงาน', () => expect(isWithinSchedule(s, bkk('2026-08-03T10:00:00'))).toBe(true))
  it('08:59 = ยังไม่ถึงเวลา', () => expect(isWithinSchedule(s, bkk('2026-08-03T08:59:00'))).toBe(false))
  it('09:00 ตรง = เริ่มแล้ว (ขอบซ้ายนับรวม)', () =>
    expect(isWithinSchedule(s, bkk('2026-08-03T09:00:00'))).toBe(true))
  it('18:00 ตรง = หมดเวลาแล้ว (ขอบขวาไม่นับรวม)', () =>
    expect(isWithinSchedule(s, bkk('2026-08-03T18:00:00'))).toBe(false))
  it('ตี 3 = นอกเวลา', () => expect(isWithinSchedule(s, bkk('2026-08-03T03:00:00'))).toBe(false))
})

describe('ช่วงข้ามเที่ยงคืน 18:00-09:00 (เคสหลักที่ user ขอ)', () => {
  const s = sched() // ทุกวัน

  it('20:00 = ทำงาน', () => expect(isWithinSchedule(s, bkk('2026-08-03T20:00:00'))).toBe(true))
  it('เที่ยงคืนตรง = ทำงาน (ไม่ตัดตอนข้ามวัน)', () =>
    expect(isWithinSchedule(s, bkk('2026-08-04T00:00:00'))).toBe(true))
  it('ตี 3 = ทำงาน', () => expect(isWithinSchedule(s, bkk('2026-08-04T03:00:00'))).toBe(true))
  it('08:59 = ยังทำงาน', () => expect(isWithinSchedule(s, bkk('2026-08-04T08:59:00'))).toBe(true))
  it('09:00 ตรง = เลิกแล้ว', () => expect(isWithinSchedule(s, bkk('2026-08-04T09:00:00'))).toBe(false))
  it('เที่ยงวัน = นอกเวลา', () => expect(isWithinSchedule(s, bkk('2026-08-04T12:00:00'))).toBe(false))
  it('17:59 = ยังไม่เริ่ม', () => expect(isWithinSchedule(s, bkk('2026-08-03T17:59:00'))).toBe(false))
})

describe('ข้ามคืน + เลือกวัน — ช่วงเป็นของ "วันที่เริ่ม"', () => {
  // เปิดเฉพาะวันจันทร์ 18:00-09:00 = คืนวันจันทร์ถึงเช้าวันอังคาร
  const s = sched({ activeDays: MON })

  it('จันทร์ 20:00 = ทำงาน', () => expect(isWithinSchedule(s, bkk('2026-08-03T20:00:00'))).toBe(true))

  it('อังคาร ตี 3 = ทำงาน เพราะเป็นหางของคืนวันจันทร์', () => {
    // จุดที่พังบ่อยที่สุด: ถ้าเช็คแค่ "วันนี้(อังคาร)เปิดไหม" จะได้ false ทั้งที่ร้านตั้งใจให้ตอบ
    expect(isWithinSchedule(s, bkk('2026-08-04T03:00:00'))).toBe(true)
  })

  it('อังคาร 20:00 = ไม่ทำงาน เพราะคืนวันอังคารไม่ได้เปิดไว้', () =>
    expect(isWithinSchedule(s, bkk('2026-08-04T20:00:00'))).toBe(false))

  it('พุธ ตี 3 = ไม่ทำงาน เพราะหางของคืนวันอังคารที่ปิดอยู่', () =>
    expect(isWithinSchedule(s, bkk('2026-08-05T03:00:00'))).toBe(false))

  it('จันทร์ตี 3 = ไม่ทำงาน เพราะเป็นหางของคืนวันอาทิตย์ที่ปิดอยู่', () =>
    expect(isWithinSchedule(s, bkk('2026-08-03T03:00:00'))).toBe(false))
})

describe('ข้ามคืน จันทร์-ศุกร์ — ขอบสัปดาห์', () => {
  const s = sched({ activeDays: WEEKDAYS })

  it('เสาร์ ตี 3 = ทำงาน เพราะเป็นหางของคืนวันศุกร์', () =>
    expect(isWithinSchedule(s, bkk('2026-08-08T03:00:00'))).toBe(true))

  it('เสาร์ 20:00 = ไม่ทำงาน', () => expect(isWithinSchedule(s, bkk('2026-08-08T20:00:00'))).toBe(false))

  it('จันทร์ ตี 3 = ไม่ทำงาน เพราะหางของคืนวันอาทิตย์ (ทดสอบการวนรอบสัปดาห์)', () =>
    expect(isWithinSchedule(s, bkk('2026-08-03T03:00:00'))).toBe(false))
})

describe('fail-open — ตั้งค่าไม่ครบต้องไม่ทำให้บอทเงียบ', () => {
  it('WINDOW แต่ไม่มีเวลาเริ่ม', () =>
    expect(isWithinSchedule(sched({ activeStartMin: null }), bkk('2026-08-03T12:00:00'))).toBe(true))
  it('WINDOW แต่ไม่มีเวลาสิ้นสุด', () =>
    expect(isWithinSchedule(sched({ activeEndMin: null }), bkk('2026-08-03T12:00:00'))).toBe(true))
  it('โหมดที่ไม่รู้จัก = ทำงานตามปกติ', () =>
    expect(isWithinSchedule(sched({ activeScheduleMode: 'MYSTERY' }), bkk('2026-08-03T03:00:00'))).toBe(true))

  it('ไม่เปิดวันไหนเลย (mask 0) = ไม่ทำงาน — อันนี้เจตนาชัด ไม่ใช่ตั้งค่าไม่ครบ', () =>
    expect(isWithinSchedule(sched({ activeDays: 0 }), bkk('2026-08-03T20:00:00'))).toBe(false))
})

describe('parseHhMm / formatHhMm', () => {
  it('แปลงไปกลับได้ตรง', () => {
    expect(parseHhMm('18:00')).toBe(1080)
    expect(parseHhMm('09:00')).toBe(540)
    expect(parseHhMm('00:00')).toBe(0)
    expect(parseHhMm('23:59')).toBe(1439)
    expect(formatHhMm(1080)).toBe('18:00')
    expect(formatHhMm(540)).toBe('09:00')
    expect(formatHhMm(0)).toBe('00:00')
  })

  it('ค่าผิดรูปแบบ = null ไม่ใช่ NaN', () => {
    expect(parseHhMm('24:00')).toBeNull()
    expect(parseHhMm('18:60')).toBeNull()
    expect(parseHhMm('18.00')).toBeNull()
    expect(parseHhMm('')).toBeNull()
    expect(parseHhMm('ตอนเย็น')).toBeNull()
  })
})
