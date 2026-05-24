import { describe, it, expect } from 'vitest'

import { parseIsNewUser } from './otp-account'

describe('parseIsNewUser', () => {
  it('คืน true เมื่อ isNewUser=true', () => {
    expect(parseIsNewUser({ isNewUser: true })).toBe(true)
  })

  it('คืน false เมื่อ isNewUser=false', () => {
    expect(parseIsNewUser({ isNewUser: false })).toBe(false)
  })

  it('default true เมื่อไม่มี field (API omit จาก DB error)', () => {
    expect(parseIsNewUser({ message: 'OTP sent' })).toBe(true)
    expect(parseIsNewUser({})).toBe(true)
  })

  it('default true เมื่อ isNewUser ไม่ใช่ boolean', () => {
    expect(parseIsNewUser({ isNewUser: 'yes' })).toBe(true)
    expect(parseIsNewUser({ isNewUser: 1 })).toBe(true)
    expect(parseIsNewUser({ isNewUser: null })).toBe(true)
  })

  it('default true เมื่อ input ไม่ใช่ object', () => {
    expect(parseIsNewUser(null)).toBe(true)
    expect(parseIsNewUser(undefined)).toBe(true)
    expect(parseIsNewUser('string')).toBe(true)
  })
})
