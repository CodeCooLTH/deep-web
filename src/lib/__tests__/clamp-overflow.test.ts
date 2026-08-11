// clamp-overflow.test.ts — ล็อกกฎ "ปุ่มดูเพิ่มเติมโผล่เฉพาะตอนข้อความล้นจริง"
//
// คลาสเดียวกับปุ่มกางเหรียญที่ user ทักเมื่อ 2026-08-10 ("ต้องมีเฉพาะกรณีมันล้นสิ") —
// ปุ่มที่โผล่ทั้งที่ไม่มีอะไรให้กางเพิ่ม ผ่าน tsc/build/detector หมด เพราะมันเป็น boolean
// ที่ถูกต้องตามชนิดทุกประการ ผิดแค่ความหมาย
//
// [blocker] แดงเมื่อไหร่ห้าม merge

import { describe, expect, it } from 'vitest'

import { isClampOverflowing } from '../clamp-overflow'

describe('isClampOverflowing', () => {
  it('[blocker] ล้นจริงถึงจะ true', () => {
    expect(isClampOverflowing(120, 48)).toBe(true)
  })

  it('[blocker] พอดีเป๊ะ ไม่ถือว่าล้น', () => {
    expect(isClampOverflowing(48, 48)).toBe(false)
  })

  it('[blocker] ต่างกัน 1px = sub-pixel ไม่ใช่การล้น', () => {
    // เบราว์เซอร์ปัด scrollHeight/clientHeight เป็นจำนวนเต็มคนละทิศได้ — ถ้าไม่เผื่อ
    // ปุ่มจะโผล่กับข้อความที่กดแล้วไม่มีอะไรเพิ่ม
    expect(isClampOverflowing(49, 48)).toBe(false)
    expect(isClampOverflowing(50, 48)).toBe(true)
  })

  it('[blocker] ยังวัดไม่ได้ (0) → ไม่ล้น ห้ามเดาว่าล้น', () => {
    expect(isClampOverflowing(0, 0)).toBe(false)
    expect(isClampOverflowing(120, 0)).toBe(false)
  })
})
