// phone-mask.test.ts — Vitest unit tests สำหรับ maskPhone
// T7 (S-11): ครอบกรณีเบอร์ถูก format และ invalid inputs ทุกประเภท

import { describe, it, expect } from 'vitest'
import { maskPhone } from './phone-mask'

describe('maskPhone', () => {
  // --- กรณีปกติ: เบอร์ไทย 10 หลัก ---
  it('0812345678 → 081-xxx-5678', () => {
    expect(maskPhone('0812345678')).toBe('081-xxx-5678')
  })

  it('0987654321 → 098-xxx-4321', () => {
    expect(maskPhone('0987654321')).toBe('098-xxx-4321')
  })

  // --- กรณี invalid: คืน *** เสมอ ---
  it('สั้นเกิน (3 หลัก) → ***', () => {
    expect(maskPhone('123')).toBe('***')
  })

  it('string ว่าง → ***', () => {
    expect(maskPhone('')).toBe('***')
  })

  it('11 หลัก (เกิน) → ***', () => {
    expect(maskPhone('08123456789')).toBe('***')
  })

  it('10 ตัวอักษรที่ไม่ใช่ตัวเลข → ***', () => {
    expect(maskPhone('abcdefghij')).toBe('***')
  })

  it('เบอร์ที่มี dash อยู่แล้ว (081-234-5678) → *** เพราะ /^\\d{10}$/ ไม่ผ่าน', () => {
    expect(maskPhone('081-234-5678')).toBe('***')
  })
})
