import { describe, it, expect } from 'vitest'
import { normalizePhone } from '@/lib/phone'

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
