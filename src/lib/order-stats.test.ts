// order-stats.test.ts — Vitest unit tests สำหรับ computeCompletionRate
// เคสบังคับจาก Controller: ตัวหาร 0 → null, ทุก order confirmed → 100, ครึ่งต่อครึ่ง → 50, ปัดเศษ

import { describe, it, expect } from 'vitest'
import { computeCompletionRate, COMPLETION_RATE_MIN_SAMPLE } from './order-stats'

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

  // ── sample gate (Impeccable critique P0-2) ──
  // เดิมไม่มี gate → ร้านที่มีออเดอร์จบ 1 รายการโชว์ "100% สำเร็จ" บนหน้าที่คนใช้
  // ตัดสินใจโอนเงิน = สถิติที่ฟังดูพิสูจน์แล้วทั้งที่ n=1 ไม่พิสูจน์อะไร
  // gate นี้คือหัวใจของ fix ห้ามลบโดยไม่อ่านเหตุผลใน order-stats.ts ก่อน

  it('n=1 (สำเร็จ 1 รายการ) → null ไม่ใช่ 100 — มิจฉาชีพสร้างออเดอร์ปลอม 1 ใบได้ใน 5 นาที', () => {
    expect(computeCompletionRate(1, 0)).toBeNull()
  })

  it('n=2 → null (ยังไม่ถึงเกณฑ์)', () => {
    expect(computeCompletionRate(2, 0)).toBeNull()
    expect(computeCompletionRate(1, 1)).toBeNull()
  })

  it('n=3 → เริ่มแสดงค่า (ขอบล่างของ gate พอดี)', () => {
    expect(computeCompletionRate(3, 0)).toBe(100)
    expect(computeCompletionRate(2, 1)).toBe(67)
  })

  it('gate ใช้ยอดรวมออเดอร์ที่จบแล้ว ไม่ใช่เฉพาะ confirmed — 0 สำเร็จ / 3 ยกเลิก ต้องแสดง 0%', () => {
    expect(computeCompletionRate(0, 3)).toBe(0)
  })

  it('COMPLETION_RATE_MIN_SAMPLE ต้องตรงกับ gate ของ metric อื่นในระบบ (rating/chat response = 3)', () => {
    expect(COMPLETION_RATE_MIN_SAMPLE).toBe(3)
  })
})
