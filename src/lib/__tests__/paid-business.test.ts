import { describe, it, expect } from 'vitest'
import { isPaidBusinessShop } from '../paid-business'

const ok = { kind: 'BUSINESS', packageLockedAt: null, ownerSubscriptionStatus: 'ACTIVE' }

describe('isPaidBusinessShop (TC-003)', () => {
  it('ร้าน BUSINESS ไม่ล็อก เจ้าของ ACTIVE → นับ', () => expect(isPaidBusinessShop(ok)).toBe(true))
  it('PERSONAL → ไม่นับ', () => expect(isPaidBusinessShop({ ...ok, kind: 'PERSONAL' })).toBe(false))
  it('ร้านถูกล็อก → ไม่นับ', () => expect(isPaidBusinessShop({ ...ok, packageLockedAt: new Date() })).toBe(false))
  it('เจ้าของ LOCKED_RENEWAL_FAILED → ไม่นับ', () =>
    expect(isPaidBusinessShop({ ...ok, ownerSubscriptionStatus: 'LOCKED_RENEWAL_FAILED' })).toBe(false))
  it('ไม่มี subscription (FREE) → ไม่นับ', () => {
    expect(isPaidBusinessShop({ ...ok, ownerSubscriptionStatus: null })).toBe(false)
    expect(isPaidBusinessShop({ ...ok, ownerSubscriptionStatus: undefined })).toBe(false)
  })
})
