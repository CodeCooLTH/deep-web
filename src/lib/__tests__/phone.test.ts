import { describe, it, expect } from 'vitest'
import { isLoginPhone, normalizePhone } from '@/lib/phone'

describe('normalizePhone', () => {
  it('รับเบอร์ไทย valid', () => expect(normalizePhone('0812345678')).toBe('0812345678'))
  it('strip space/dash', () => expect(normalizePhone('081-234 5678')).toBe('0812345678'))
  it('เบอร์สั้น/ผิด → null', () => {
    expect(normalizePhone('123')).toBeNull()
    expect(normalizePhone('66812345678')).toBeNull()
    expect(normalizePhone('1812345678')).toBeNull()
  })
  it('email/ว่าง → null', () => {
    expect(normalizePhone('a@b.com')).toBeNull()
    expect(normalizePhone('')).toBeNull()
  })
})

/**
 * [blocker] เบอร์บัญชีทดสอบต้องเข้าระบบได้บนเครื่อง dev — และต้องเข้าไม่ได้บน production
 *
 * 🛑 บั๊กที่เทสนี้กัน: `lib/otp.ts` ยอมรับ `0000000001`/`123456` อยู่แล้วนอก production
 * แต่ด่านขาเข้า (ช่องกรอก + `/api/otp/send`) ปฏิเสธตั้งแต่แรก หลังบีบ `MOBILE_PHONE_RE`
 * เป็น `^0[689][0-9]{8}$` เมื่อ 2026-08-21 ⇒ **บัญชีทดสอบทั้งชุดตายเงียบ ๆ**
 * ทั้งสองฝั่ง "ถูก" ในตัวเอง จึงไม่มี tsc/build/เทสตัวไหนฟ้อง
 */
describe('[blocker] isLoginPhone — บัญชีทดสอบ dev', () => {
  const TEST_PHONES = ['0000000001', '0000000009']

  it('เบอร์มือถือจริงผ่านทุก env', () => {
    for (const p of ['0812345678', '0912345678', '0612345678']) {
      expect(isLoginPhone(p), p).toBe(true)
    }
  })

  it('เบอร์บัญชีทดสอบผ่านนอก production (ค่า NODE_ENV ของ vitest = test)', () => {
    for (const p of TEST_PHONES) expect(isLoginPhone(p), p).toBe(true)
  })

  it('เบอร์บัญชีทดสอบถูกปฏิเสธบน production', () => {
    const prev = process.env.NODE_ENV
    // @ts-expect-error — NODE_ENV เป็น readonly ในชนิดของ Node แต่เขียนทับได้จริงตอนรัน
    process.env.NODE_ENV = 'production'
    try {
      for (const p of TEST_PHONES) expect(isLoginPhone(p), p).toBe(false)
      expect(isLoginPhone('0812345678')).toBe(true)
    } finally {
      // @ts-expect-error — ดูข้างบน
      process.env.NODE_ENV = prev
    }
  })

  it('ยังปฏิเสธเบอร์ที่ผิดรูปแบบจริง ๆ ไม่ว่า env ไหน', () => {
    for (const p of ['0712345678', '081234567', '08123456789', '1234567890', '']) {
      expect(isLoginPhone(p), p).toBe(false)
    }
  })
})
