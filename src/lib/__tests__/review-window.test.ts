/**
 * [blocker] หน้าต่างแก้ไขรีวิว 24 ชม. — feature 00041 (BR-BOE-17)
 *
 * ทำไมเป็น blocker: ฟังก์ชันชุดนี้ถูกเรียกจาก **สองฝั่งที่ต้องเห็นตรงกัน** — client ใช้ตัดสิน
 * ว่าจะโชว์ปุ่มแก้ไข/ลบไหม, server ใช้เป็นด่านจริงที่ปฏิเสธคำขอ. ถ้ามันเพี้ยน อาการคือ
 * "ปุ่มโชว์อยู่แต่กดแล้วขึ้น error" ซึ่งผู้ใช้จะกดซ้ำเพราะเชื่อว่าตัวเองทำผิด
 *
 * 🛑 แดง = ห้าม merge
 */

import { describe, it, expect } from 'vitest'

import { REVIEW_EDIT_WINDOW_MS, canEditReview, formatEditWindowLeft } from '../review-window'

const CREATED = new Date('2026-08-10T00:00:00.000Z')
const at = (ms: number) => new Date(CREATED.getTime() + ms)

describe('canEditReview', () => {
  it('เพิ่งเขียน → แก้ได้', () => {
    expect(canEditReview(CREATED, at(0))).toBe(true)
  })

  it('ผ่านไป 23 ชม. 59 นาที → ยังแก้ได้', () => {
    expect(canEditReview(CREATED, at(REVIEW_EDIT_WINDOW_MS - 60_000))).toBe(true)
  })

  // ขอบพอดี 24 ชม. เป๊ะยังผ่าน (`<=`) — เลือกทางที่เอื้อผู้ใช้ตรงเส้นแบ่ง
  it('ครบ 24 ชม. พอดี → ยังแก้ได้', () => {
    expect(canEditReview(CREATED, at(REVIEW_EDIT_WINDOW_MS))).toBe(true)
  })

  it('เกิน 24 ชม. ไป 1 มิลลิวินาที → แก้ไม่ได้แล้ว', () => {
    expect(canEditReview(CREATED, at(REVIEW_EDIT_WINDOW_MS + 1))).toBe(false)
  })
})

describe('formatEditWindowLeft', () => {
  it('เหลือ 6 ชม. 12 นาที', () => {
    const elapsed = REVIEW_EDIT_WINDOW_MS - (6 * 60 + 12) * 60_000

    expect(formatEditWindowLeft(CREATED.toISOString(), at(elapsed))).toBe('แก้ไขได้อีก 6 ชม. 12 นาที')
  })

  // เหลือไม่ถึงชั่วโมง ต้องไม่อ่านว่า "อีก 0 ชม. 12 นาที"
  it('เหลือไม่ถึงชั่วโมง → บอกเป็นนาทีอย่างเดียว', () => {
    const elapsed = REVIEW_EDIT_WINDOW_MS - 12 * 60_000

    expect(formatEditWindowLeft(CREATED.toISOString(), at(elapsed))).toBe('แก้ไขได้อีก 12 นาที')
  })

  // 🛑 หมดเวลาแล้วต้องคืน '' ไม่ใช่ "หมดเวลาแล้ว" — ผู้เรียกจะไม่ render อะไรเลย
  // รีวิวยังแสดงอยู่ปกติ ไม่มีอะไรผิดพลาดที่ต้องแจ้ง
  it('หมดเวลาแล้ว → คืนสตริงว่าง', () => {
    expect(formatEditWindowLeft(CREATED.toISOString(), at(REVIEW_EDIT_WINDOW_MS + 1))).toBe('')
  })

  it('ตรงเส้น 24 ชม. พอดี → ยังไม่ว่าง (สอดคล้องกับ canEditReview)', () => {
    expect(formatEditWindowLeft(CREATED.toISOString(), at(REVIEW_EDIT_WINDOW_MS))).not.toBe('')
  })
})

// นิยามเดียวทั้งระบบ (HR16) — service ต้อง re-export ตัวนี้ ห้ามเขียนสูตร 24 ชม.ขึ้นมาเอง
describe('SSOT', () => {
  it('REVIEW_EDIT_WINDOW_MS = 24 ชั่วโมง', () => {
    expect(REVIEW_EDIT_WINDOW_MS).toBe(86_400_000)
  })
})
