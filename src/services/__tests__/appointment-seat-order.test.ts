import { describe, it, expect } from 'vitest'
import { seatTryOrder } from '@/services/appointment.service'

/**
 * ตัวจัดลำดับที่นั่ง (2026-08-10) — จุดประสงค์เดียวคือ "ลองที่ที่น่าจะว่างก่อน" เพื่อไม่ให้เสีย
 * round trip ไปกับที่นั่งที่ชนแน่ ๆ ขณะถือ advisory lock อยู่
 *
 * สิ่งที่เทสชุดนี้เฝ้าจริง ๆ คือ invariant ข้อเดียว: **ห้ามตัดที่นั่งไหนทิ้ง** เพราะถ้าตัดได้
 * ระบบจะรายงาน "เต็ม" ทั้งที่ยังจองได้ ซึ่งเป็นอาการที่ไม่มีชั้นไหนตรวจเจอเลย
 */
describe('seatTryOrder', () => {
  it('ที่ว่างขึ้นก่อน ที่ถูกจองไปต่อท้าย', () => {
    expect(seatTryOrder(5, [1, 2, 3])).toEqual([4, 5, 1, 2, 3])
  })

  it('ยังไม่มีใครจอง → เรียง 1..capacity ตามเดิม (พฤติกรรมเดิมทุกประการ)', () => {
    expect(seatTryOrder(4, [])).toEqual([1, 2, 3, 4])
  })

  it('เต็มทุกที่นั่ง → ยังคืนครบทุกตัว ไม่ใช่ลิสต์ว่าง (ต้องปล่อยให้ constraint เป็นคนบอกว่าเต็ม)', () => {
    // ถ้าคืนลิสต์ว่าง ลูปจะข้ามไป throw AppointmentSlotFullError ทันทีโดยไม่ลองสักครั้ง
    // ซึ่งอ่านผลจากค่าที่อาจ stale แทนที่จะอ่านจาก EXCLUDE constraint — ผิดหลักของ BR-RSV-18.1
    expect(seatTryOrder(3, [1, 2, 3])).toEqual([1, 2, 3])
  })

  it('ค่าที่เพี้ยน (นอกช่วง/ซ้ำ/0/ติดลบ) ต้องไม่ทำให้ที่นั่งหาย', () => {
    const order = seatTryOrder(4, [0, -1, 99, 2, 2])
    expect([...order].sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
    expect(order).toEqual([1, 3, 4, 2])
  })

  it('invariant: ผลลัพธ์เป็น permutation ของ 1..capacity เสมอ ทุกชุด taken ที่เป็นไปได้', () => {
    // ไล่ทุก subset ของ 1..6 (64 ชุด) — ครอบพอที่จะยืนยันว่าไม่มีเคสไหนตกหล่น
    const capacity = 6
    const expected = [1, 2, 3, 4, 5, 6]
    for (let mask = 0; mask < 1 << capacity; mask++) {
      const taken = expected.filter((s) => mask & (1 << (s - 1)))
      const order = seatTryOrder(capacity, taken)
      expect([...order].sort((a, b) => a - b)).toEqual(expected)
      // และที่ว่างต้องมาก่อนที่ถูกจองเสมอ ไม่ใช่แค่ครบ
      const firstTakenAt = order.findIndex((s) => taken.includes(s))
      const lastFreeAt = order.reduce((acc, s, i) => (taken.includes(s) ? acc : i), -1)
      if (firstTakenAt !== -1 && lastFreeAt !== -1) expect(lastFreeAt).toBeLessThan(firstTakenAt)
    }
  })
})
