import { describe, it, expect } from 'vitest'
import { customerAvatarSignal } from '@/lib/customer-signal'

describe('customerAvatarSignal', () => {
  it('null/0 → NONE ไม่มีขอบ', () => {
    for (const v of [null, undefined, 0, -1]) {
      expect(customerAvatarSignal(v)).toEqual({ ring: false, plate: null, kind: 'NONE' })
    }
  })
  it('1 → NEW ตะกร้า', () => expect(customerAvatarSignal(1)).toEqual({ ring: true, plate: 'cart', kind: 'NEW' }))
  it('2..9 → REGULAR ตัวเลข', () => {
    expect(customerAvatarSignal(2)).toEqual({ ring: true, plate: 2, kind: 'REGULAR' })
    expect(customerAvatarSignal(9)).toEqual({ ring: true, plate: 9, kind: 'REGULAR' })
  })
  it('≥10 → 9+', () => {
    expect(customerAvatarSignal(10).plate).toBe('9+')
    expect(customerAvatarSignal(250).plate).toBe('9+')
  })
})
