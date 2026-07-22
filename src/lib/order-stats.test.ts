// order-stats.test.ts — Vitest unit tests สำหรับ computeCompletionRate
// เคสบังคับจาก Controller: ตัวหาร 0 → null, ทุก order confirmed → 100, ครึ่งต่อครึ่ง → 50, ปัดเศษ

import { describe, it, expect } from 'vitest'
import { computeCompletionRate } from './order-stats'

describe('computeCompletionRate', () => {
  it('ตัวหาร 0 (ยังไม่มี order จบเลย — ร้านใหม่) → null (ห้ามคืน 0)', () => {
    expect(computeCompletionRate(0, 0)).toBeNull()
  })

  it('ทุก order confirmed (ไม่มี cancel เลย) → 100', () => {
    expect(computeCompletionRate(10, 0)).toBe(100)
  })

  it('ครึ่งต่อครึ่ง (5 confirmed / 5 cancelled) → 50', () => {
    expect(computeCompletionRate(5, 5)).toBe(50)
  })

  it('ปัดเศษขึ้น: 2 confirmed / 1 cancelled → 67 (66.67 ปัดขึ้น)', () => {
    expect(computeCompletionRate(2, 1)).toBe(67)
  })

  it('ปัดเศษลง: 1 confirmed / 2 cancelled → 33 (33.33 ปัดลง)', () => {
    expect(computeCompletionRate(1, 2)).toBe(33)
  })

  it('ไม่มี confirmed เลย ทั้งหมดยกเลิก → 0 (ไม่ใช่ null เพราะมีออเดอร์จบแล้ว 5 รายการ)', () => {
    expect(computeCompletionRate(0, 5)).toBe(0)
  })
})
