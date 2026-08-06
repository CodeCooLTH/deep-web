import { describe, it, expect } from 'vitest'
import { thaiDayKey, formatOrderDateLabel } from '../format-date'

describe('thaiDayKey', () => {
  it('เที่ยงวันไทย → วันนั้น', () => {
    // 2026-08-06 12:00 ICT = 2026-08-06T05:00:00Z
    expect(thaiDayKey('2026-08-06T05:00:00Z')).toBe('2026-08-06')
  })

  it('00:30 น. เวลาไทย ยังเป็นวันเดียวกัน ไม่ถอยไปวันก่อน', () => {
    // 2026-08-06 00:30 ICT = 2026-08-05T17:30:00Z — เคสที่ toISOString().slice(0,10) เคยพัง
    expect(thaiDayKey('2026-08-05T17:30:00Z')).toBe('2026-08-06')
  })

  it('23:30 น. เวลาไทย ยังไม่ข้ามไปวันถัดไป', () => {
    // 2026-08-06 23:30 ICT = 2026-08-06T16:30:00Z
    expect(thaiDayKey('2026-08-06T16:30:00Z')).toBe('2026-08-06')
  })

  it('ค่าไม่ valid → สตริงว่าง', () => {
    expect(thaiDayKey('ไม่ใช่วันที่')).toBe('')
    expect(thaiDayKey(null)).toBe('')
  })
})

describe('formatOrderDateLabel', () => {
  const now = '2026-08-06T05:00:00Z' // 6 ส.ค. 2026 12:00 ICT

  it('วันเดียวกัน → "วันนี้ HH:mm น."', () => {
    expect(formatOrderDateLabel('2026-08-06T02:12:00Z', now)).toBe('วันนี้ 09:12 น.')
  })

  it('วันก่อนหน้า → "เมื่อวาน HH:mm น."', () => {
    // 2026-08-05 21:14 ICT = 2026-08-05T14:14:00Z
    expect(formatOrderDateLabel('2026-08-05T14:14:00Z', now)).toBe('เมื่อวาน 21:14 น.')
  })

  it('เก่ากว่านั้น → วันที่เต็มเป็น พ.ศ.', () => {
    // 2026-07-28 21:14 ICT = 2026-07-28T14:14:00Z
    expect(formatOrderDateLabel('2026-07-28T14:14:00Z', now)).toBe('28 ก.ค. 2569 21:14 น.')
  })

  it('วันในอนาคต → วันที่เต็ม ไม่ใช่ "วันนี้"', () => {
    // 2026-08-10 10:00 ICT
    expect(formatOrderDateLabel('2026-08-10T03:00:00Z', now)).toBe('10 ส.ค. 2569 10:00 น.')
  })
})
