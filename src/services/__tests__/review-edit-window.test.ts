/**
 * [blocker] หน้าต่างแก้ไข/ลบรีวิว 24 ชม. — feature 00041 (BR-BOE-17)
 *
 * กฎนี้มีไว้กัน "เปลี่ยนใจหลังร้านโทรมา" (PRD §6.1) ⇒ ขอบเขตต้องแม่น ไม่ใช่ประมาณ
 *
 * 🛑 ต้องมีทั้ง 2 เคสประกบขอบเขต (พอดี 24 ชม. / เกิน 1ms) ถึงจะจับ mutation `<=` ↔ `<` ได้
 * ถ้าเหลือเคสเดียวจะมีทิศที่ mutation รอดไปได้เงียบ ๆ
 *
 * แดง = ห้าม merge
 */

import { describe, it, expect } from 'vitest'
import { canEditReview, REVIEW_EDIT_WINDOW_MS } from '@/services/review.service'

const T = new Date('2026-08-10T09:00:00.000Z')
const at = (ms: number) => new Date(T.getTime() + ms)

describe('canEditReview', () => {
  it('ค่าคงที่คือ 24 ชั่วโมงพอดี', () => {
    expect(REVIEW_EDIT_WINDOW_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('เพิ่งโพสต์ → แก้ได้', () => {
    expect(canEditReview(T, T)).toBe(true)
  })

  it('ผ่านไป 23 ชม. 59 นาที 59 วิ → ยังแก้ได้', () => {
    expect(canEditReview(T, at(86_399_000))).toBe(true)
  })

  // ── ขอบเขตที่ต้องประกบ ──
  it('พอดี 24 ชม. เป๊ะ → ยังแก้ได้ (กฎเป็น inclusive)', () => {
    expect(canEditReview(T, at(REVIEW_EDIT_WINDOW_MS))).toBe(true)
  })

  it('เกินไป 1 มิลลิวินาที → แก้ไม่ได้', () => {
    expect(canEditReview(T, at(REVIEW_EDIT_WINDOW_MS + 1))).toBe(false)
  })
  // ────────────────────────

  it('ผ่านไป 25 ชม. → แก้ไม่ได้', () => {
    expect(canEditReview(T, at(25 * 60 * 60 * 1000))).toBe(false)
  })

  // เวลาที่ใช้ต้องเป็น createdAt ของใบแรกเสมอ — ถ้าเผลอไปนับจาก updatedAt การแก้ทีละนิด
  // จะยืดหน้าต่างไปได้เรื่อย ๆ ไม่รู้จบ ซึ่งเท่ากับไม่มีหน้าต่างเลย
  it('signature รับแค่ createdAt + now — ไม่มีช่องให้ส่ง updatedAt เข้ามา', () => {
    expect(canEditReview.length).toBeLessThanOrEqual(2)
  })
})
