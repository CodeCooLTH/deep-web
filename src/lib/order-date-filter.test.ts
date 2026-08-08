/**
 * เทสตัวกรองช่วงเวลาของหน้า /orders (2026-08-08)
 *
 * จุดที่ต้องกันจริง ๆ คือ **ขอบวันตามเวลาไทย** — ของเดิมตัดวันด้วยเวลาเครื่อง ซึ่งบังเอิญ
 * ถูกเพราะเครื่องในไทยตั้ง tz ไทย เทสนี้ยิงด้วย instant ที่ตกคนละวันระหว่าง UTC กับไทย
 * เพื่อพิสูจน์ว่าใช้ปฏิทินไทยจริง ไม่ใช่ผ่านเพราะ tz ของเครื่องที่รันเทส
 */

import { describe, it, expect } from 'vitest'
import { matchesOrderDateFilter, isSpecificDay, isOrderDatePreset } from './order-date-filter'

// 2026-08-01 00:30 น. เวลาไทย = 2026-07-31 17:30 UTC (คนละวันกันใน UTC)
const AUG1_EARLY_BKK = '2026-07-31T17:30:00.000Z'
// 2026-08-01 23:30 น. เวลาไทย = 2026-08-01 16:30 UTC (วันเดียวกันทั้งสองปฏิทิน)
const AUG1_LATE_BKK = '2026-08-01T16:30:00.000Z'
// 2026-07-31 23:30 น. เวลาไทย = 2026-07-31 16:30 UTC
const JUL31_LATE_BKK = '2026-07-31T16:30:00.000Z'

describe('matchesOrderDateFilter — วันเจาะจง', () => {
  it('ออเดอร์ตี 00:30 ของวันที่ 1 ส.ค. ต้องนับเป็นวันที่ 1 ส.ค. (ไม่ใช่ 31 ก.ค. แบบ UTC)', () => {
    expect(matchesOrderDateFilter(AUG1_EARLY_BKK, '2026-08-01')).toBe(true)
    expect(matchesOrderDateFilter(AUG1_EARLY_BKK, '2026-07-31')).toBe(false)
  })

  it('ออเดอร์สี่ทุ่มครึ่งของวันที่ 1 ส.ค. ก็ยังเป็นวันที่ 1 ส.ค.', () => {
    expect(matchesOrderDateFilter(AUG1_LATE_BKK, '2026-08-01')).toBe(true)
  })

  it('ออเดอร์ของวันก่อนหน้าไม่ติดตัวกรองวันที่ 1 ส.ค.', () => {
    expect(matchesOrderDateFilter(JUL31_LATE_BKK, '2026-08-01')).toBe(false)
  })
})

describe('matchesOrderDateFilter — ค่าสำเร็จรูป', () => {
  // "วันนี้" ในมุมของผู้ใช้ = 1 ส.ค. เวลาไทย (ยิงตอนบ่ายโมงไทยของวันนั้น)
  const now = new Date('2026-08-01T06:00:00.000Z')

  it('All ผ่านทุกแถว แม้ไม่มีวันที่', () => {
    expect(matchesOrderDateFilter(null, 'All', now)).toBe(true)
    expect(matchesOrderDateFilter(JUL31_LATE_BKK, 'All', now)).toBe(true)
  })

  it('Today นับตามปฏิทินไทย — ออเดอร์ตี 00:30 ของวันนี้ต้องติด', () => {
    expect(matchesOrderDateFilter(AUG1_EARLY_BKK, 'Today', now)).toBe(true)
    expect(matchesOrderDateFilter(JUL31_LATE_BKK, 'Today', now)).toBe(false)
  })

  it('Last 7 Days ครอบวันเมื่อวาน แต่ไม่ครอบ 8 วันก่อน', () => {
    expect(matchesOrderDateFilter(JUL31_LATE_BKK, 'Last 7 Days', now)).toBe(true)
    expect(matchesOrderDateFilter('2026-07-23T05:00:00.000Z', 'Last 7 Days', now)).toBe(false)
  })

  it('This Year เทียบปีตามปฏิทินไทย', () => {
    expect(matchesOrderDateFilter(AUG1_EARLY_BKK, 'This Year', now)).toBe(true)
    // 31 ธ.ค. 2025 17:00 น. เวลาไทย — ปีที่แล้วจริงทั้งสองปฏิทิน
    expect(matchesOrderDateFilter('2025-12-31T10:00:00.000Z', 'This Year', now)).toBe(false)
  })

  it('ขอบปี: 31 ธ.ค. สองทุ่ม UTC = 1 ม.ค. ตี 3 เวลาไทย → ต้องนับเป็นปีใหม่', () => {
    // เคสนี้คือเหตุผลที่ต้องใช้ thaiDayKey ไม่ใช่ปฏิทิน UTC — ถ้าตัดด้วย UTC จะตอบ false
    expect(matchesOrderDateFilter('2025-12-31T20:00:00.000Z', 'This Year', now)).toBe(true)
  })

  it('แถวที่ไม่มีวันที่ตกทุกตัวกรองที่ไม่ใช่ All', () => {
    expect(matchesOrderDateFilter(null, 'Today', now)).toBe(false)
    expect(matchesOrderDateFilter('', '2026-08-01', now)).toBe(false)
  })

  it('ค่าที่ไม่รู้จัก = ไม่กรอง (fail-open) — ลิงก์เก่าต้องไม่ทำให้หน้าว่างเปล่า', () => {
    expect(matchesOrderDateFilter(JUL31_LATE_BKK, 'Yesterday', now)).toBe(true)
  })
})

describe('ตัวช่วยแยกชนิดของค่า', () => {
  it('isSpecificDay จับเฉพาะรูป YYYY-MM-DD', () => {
    expect(isSpecificDay('2026-08-01')).toBe(true)
    expect(isSpecificDay('Today')).toBe(false)
    expect(isSpecificDay('All')).toBe(false)
    expect(isSpecificDay('2026-8-1')).toBe(false)
  })

  it('preset กับวันเจาะจงต้องไม่ทับกัน — ไม่งั้น UI จะติ๊กถูก 2 แถวพร้อมกัน', () => {
    expect(isOrderDatePreset('2026-08-01')).toBe(false)
    expect(isOrderDatePreset('Today')).toBe(true)
  })
})
