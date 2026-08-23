import { describe, expect, it } from 'vitest'

import { OTP_LENGTH, distributeOtpPaste, otpFocusIndexAfterPaste } from '../otp-paste'

/**
 * ช่อง OTP แบบช่องละหลักมี `maxLength={1}` ⇒ เบราว์เซอร์ **ตัดของที่วางเหลือตัวแรกตัวเดียว
 * เงียบ ๆ** ไม่ throw ไม่ warn — ผู้ใช้ที่ก็อปรหัสจากแบนเนอร์ SMS มาวางจะเห็นเลขโผล่หลักเดียว
 * แล้วอ่านว่า "ระบบพัง" ไม่ใช่ "ฉันทำผิด". ไม่มี gate ไหนของโปรเจกต์จับคลาสนี้ได้เลย
 * เพราะโค้ดถูกทุกตัวอักษร สิ่งที่ขาดคือ handler ที่ไม่เคยถูกเขียน
 */

const empty = ['', '', '', '', '', '']

describe('distributeOtpPaste', () => {
  it('[blocker] วางรหัสเต็ม 6 หลักที่ช่องแรก → เข้าครบทุกช่อง', () => {
    expect(distributeOtpPaste(empty, 0, '123456')).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('[blocker] ตัดอักขระที่ไม่ใช่ตัวเลขก่อนเสมอ — คนก็อปมาทั้งประโยค', () => {
    expect(distributeOtpPaste(empty, 0, 'รหัส OTP ของคุณคือ 987 654')).toEqual([
      '9',
      '8',
      '7',
      '6',
      '5',
      '4',
    ])
  })

  it('วางกลางทาง → เติมจากช่องนั้นไป ไม่ยุ่งกับช่องก่อนหน้า', () => {
    expect(distributeOtpPaste(['1', '2', '', '', '', ''], 2, '3456')).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ])
  })

  it('ล้นเกินช่องสุดท้าย → ทิ้งส่วนเกิน ห้ามวนกลับช่องแรก', () => {
    expect(distributeOtpPaste(empty, 4, '123456')).toEqual(['', '', '', '', '1', '2'])
  })

  it('วางของที่ไม่มีตัวเลขเลย → คืนของเดิมทั้งชุด (ผู้เรียกจะได้ไม่ preventDefault)', () => {
    const current = ['9', '', '', '', '', '']
    expect(distributeOtpPaste(current, 0, 'abc-')).toEqual(current)
  })

  it('ไม่กลายพันธุ์อาร์เรย์เดิม', () => {
    const current = [...empty]
    distributeOtpPaste(current, 0, '123456')
    expect(current).toEqual(empty)
  })
})

describe('otpFocusIndexAfterPaste', () => {
  it('[blocker] วางครบ 6 หลัก → โฟกัสช่องสุดท้าย ไม่ใช่ช่องที่ 7 ซึ่งไม่มีอยู่', () => {
    /**
     * ถ้าคืน "ช่องถัดไป" โฟกัสจะหลุดออกนอกกลุ่ม input ทั้งก้อนเมื่อวางเต็ม —
     * ผู้ใช้ที่กด Backspace ต่อจะไม่ได้แก้เลขที่เพิ่งวาง
     */
    expect(otpFocusIndexAfterPaste(0, '123456')).toBe(OTP_LENGTH - 1)
  })

  it('วางไม่เต็ม → โฟกัสช่องสุดท้ายที่เพิ่งถูกเติม', () => {
    expect(otpFocusIndexAfterPaste(0, '123')).toBe(2)
  })

  it('วางล้น → ไม่เกินช่องสุดท้าย', () => {
    expect(otpFocusIndexAfterPaste(4, '123456')).toBe(OTP_LENGTH - 1)
  })

  it('ไม่มีตัวเลข → อยู่ช่องเดิม', () => {
    expect(otpFocusIndexAfterPaste(3, 'abc')).toBe(3)
  })
})
