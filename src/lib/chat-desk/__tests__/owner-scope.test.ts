import { describe, expect, it } from 'vitest'
import { pickDeskShop } from '../owner-scope'

describe('pickDeskShop (AC-CD-21/23)', () => {
  const owned = ['A', 'B']
  it('ไม่มีร้านที่เป็นเจ้าของ = ปฏิเสธ (ADMIN)', () => {
    expect(pickDeskShop([], null, 'X')).toBeNull()
    expect(pickDeskShop([], 'X')).toBeNull()
  })
  it('ขอร้านที่ไม่อยู่ในชุด = ปฏิเสธ ไม่ fallback', () => {
    expect(pickDeskShop(owned, 'Z', 'A')).toBeNull()
  })
  it('ขอร้านในชุด = ร้านนั้น (ชนะ active)', () => expect(pickDeskShop(owned, 'B', 'A')).toBe('B'))
  it('ไม่ขอ: active ถ้าเป็นเจ้าของ ไม่งั้นร้านแรก', () => {
    expect(pickDeskShop(owned, null, 'B')).toBe('B')
    expect(pickDeskShop(owned, undefined, 'Z')).toBe('A')
    expect(pickDeskShop(owned)).toBe('A')
  })
})
