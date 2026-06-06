import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkApiRateLimit, clientIp } from './api-rate-limit'

describe('checkApiRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('ผ่านครบ max ครั้ง แล้วครั้งถัดไป fail', () => {
    const key = 't1-' + Math.random() // key เฉพาะ test (store เป็น globalThis singleton)
    for (let i = 0; i < 3; i++) expect(checkApiRateLimit(key, 3, 60_000)).toBe(true)
    expect(checkApiRateLimit(key, 3, 60_000)).toBe(false)
  })

  it('reset หลังพ้น window', () => {
    const key = 't2-' + Math.random()
    for (let i = 0; i < 3; i++) checkApiRateLimit(key, 3, 60_000)
    expect(checkApiRateLimit(key, 3, 60_000)).toBe(false)
    vi.advanceTimersByTime(61_000) // เลย window
    expect(checkApiRateLimit(key, 3, 60_000)).toBe(true)
  })

  it('แยก bucket ต่อ key', () => {
    const a = 'a-' + Math.random(), b = 'b-' + Math.random()
    expect(checkApiRateLimit(a, 1, 60_000)).toBe(true)
    expect(checkApiRateLimit(a, 1, 60_000)).toBe(false)
    expect(checkApiRateLimit(b, 1, 60_000)).toBe(true) // b ไม่โดน a
  })
})

describe('clientIp', () => {
  const mk = (h: Record<string, string>) =>
    ({ headers: new Headers(h) }) as unknown as Request
  it('x-real-ip มาก่อน', () => {
    expect(clientIp(mk({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4')
  })
  it('fallback x-forwarded-for leftmost', () => {
    expect(clientIp(mk({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }))).toBe('5.6.7.8')
  })
  it('ไม่มี header → unknown', () => {
    expect(clientIp(mk({}))).toBe('unknown')
  })
})
