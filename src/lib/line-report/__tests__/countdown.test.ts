import { describe, expect, it } from 'vitest'
import { formatCountdown, isExpired } from '../countdown'

describe('countdown', () => {
  it('formatCountdown: mm:ss · ปัดขึ้น · ไม่ติดลบ', () => {
    expect(formatCountdown(10 * 60_000)).toBe('10:00')
    expect(formatCountdown(9 * 60_000 + 41_000)).toBe('09:41')
    expect(formatCountdown(1)).toBe('00:01')
    expect(formatCountdown(0)).toBe('00:00')
    expect(formatCountdown(-5000)).toBe('00:00')
  })
  it('isExpired: ขอบเท่ากันคือหมด · อ่านไม่ออก/ว่าง = หมด', () => {
    const now = Date.parse('2026-10-05T10:00:00Z')
    expect(isExpired('2026-10-05T10:00:01Z', now)).toBe(false)
    expect(isExpired('2026-10-05T10:00:00Z', now)).toBe(true)
    expect(isExpired('garbage', now)).toBe(true)
    expect(isExpired(null, now)).toBe(true)
  })
})
