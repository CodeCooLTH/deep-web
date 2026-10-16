import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { presenceKeyFor } from '../presence-key'

const SHOP = '9b1c0000-0000-4000-8000-000000000001'
const USER = 'u1000000-0000-4000-8000-000000000002'
const prev = process.env.NEXTAUTH_SECRET

describe('presenceKeyFor — คีย์ทึบ (AC-CD-30)', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = 'test-secret-a'
  })
  afterEach(() => {
    if (prev === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = prev
  })

  it('คงที่ · 22 ตัว base64url · ไม่มี userId/shopId ในสตริง', () => {
    const k = presenceKeyFor(SHOP, USER)
    expect(k).toBe(presenceKeyFor(SHOP, USER))
    expect(k).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(k).not.toContain(USER)
    expect(k).not.toContain(SHOP)
  })

  it('ต่างร้าน/ต่างคน/ต่าง secret → ต่างกัน', () => {
    const base = presenceKeyFor(SHOP, USER)
    expect(presenceKeyFor('other-shop', USER)).not.toBe(base)
    expect(presenceKeyFor(SHOP, 'other-user')).not.toBe(base)
    process.env.NEXTAUTH_SECRET = 'test-secret-b'
    expect(presenceKeyFor(SHOP, USER)).not.toBe(base)
  })

  it('ขาด secret → throw (route ตอบ 500)', () => {
    delete process.env.NEXTAUTH_SECRET
    expect(() => presenceKeyFor(SHOP, USER)).toThrow()
  })

  it('คั่นด้วย : กันชนข้ามคู่ (a:bc ≠ ab:c)', () => {
    expect(presenceKeyFor('a', 'bc')).not.toBe(presenceKeyFor('ab', 'c'))
  })
})
