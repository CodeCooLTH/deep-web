import { describe, expect, it } from 'vitest'

import { DEFAULT_APPOINTMENT_DURATION_MIN, walkInWindow } from '@/lib/appointments'

/**
 * BR-SQ-21 — walk-in ต้องมีเวลาเริ่มจริง ไม่ใช่ null แล้วหายจากทุกจอ
 * ผิดที่ตัวนี้ = งานที่ร้านกำลังทำอยู่ไม่โผล่ในตารางงานของวันนั้น
 */
describe('walkInWindow', () => {
  it('[blocker] ต้องปัดวินาที/มิลลิวินาทีทิ้ง', () => {
    /**
     * ถ้าไม่ปัด งานสองใบที่ดูเหมือนต่อกันพอดีบนจอ จะไม่ต่อกันจริงในสายตาของ EXCLUDE
     * constraint (`tstzrange('[)')`) แล้วเกิดช่องว่างเศษวินาทีที่อธิบายไม่ได้
     */
    const { start, end } = walkInWindow(new Date('2026-08-15T13:04:37.812+07:00'), 60)
    expect(start.getSeconds()).toBe(0)
    expect(start.getMilliseconds()).toBe(0)
    expect(end.getSeconds()).toBe(0)
    expect(end.getTime() - start.getTime()).toBe(60 * 60_000)
  })

  it('[blocker] ระยะเวลาไม่สมเหตุสมผล → ตกไปใช้ค่ามาตรฐาน ห้ามคืนช่วงว่าง', () => {
    /**
     * ช่วงว่าง (start === end) ทำให้ `assertValidRange` โยน error แล้วผู้ใช้เห็นแค่
     * "ข้อมูลไม่ถูกต้อง" โดยไม่รู้ว่าอะไรผิด — ปุ่มที่กดแล้วพังโดยไม่บอกเหตุผล
     */
    for (const bad of [0, -30, NaN, null, undefined]) {
      const { start, end } = walkInWindow(new Date('2026-08-15T09:00:00+07:00'), bad)
      expect(end.getTime() - start.getTime(), `duration=${bad}`).toBe(
        DEFAULT_APPOINTMENT_DURATION_MIN * 60_000,
      )
    }
  })

  it('เศษนาทีของระยะเวลาถูกตัดลง ไม่ปัดขึ้น', () => {
    // 45.9 นาที = 45 นาที — ปัดขึ้นทำให้งานกินเวลาของคิวถัดไปโดยที่ไม่มีใครสั่ง
    const { start, end } = walkInWindow(new Date('2026-08-15T09:00:00+07:00'), 45.9)
    expect(end.getTime() - start.getTime()).toBe(45 * 60_000)
  })

  it('ไม่แตะค่า now ที่รับเข้ามา (ฟังก์ชันบริสุทธิ์)', () => {
    const now = new Date('2026-08-15T13:04:37.812+07:00')
    const before = now.getTime()
    walkInWindow(now, 30)
    expect(now.getTime()).toBe(before)
  })
})
