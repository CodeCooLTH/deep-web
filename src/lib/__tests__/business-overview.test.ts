import { describe, it, expect } from 'vitest'
import { marginPercent, financeHrefFor } from '../business-overview'

describe('marginPercent (TC-006)', () => {
  it('revenue 0 / ติดลบ → null', () => {
    expect(marginPercent(0, 5)).toBeNull()
    expect(marginPercent(-10, 5)).toBeNull()
  })
  it('ขาดทุนไม่ clamp', () => expect(marginPercent(1000, -200)).toBe(-20))
  it('ปัด 2 ตำแหน่ง', () => expect(marginPercent(3, 1)).toBe(33.33))
})

describe('financeHrefFor (TC-010)', () => {
  it('ร้านบริการ → /sales?tab=pnl', () => expect(financeHrefFor('SERVICE_QUEUE', 'range=7d')).toBe('/sales?tab=pnl&range=7d'))
  it('ร้านอื่น → /expenses', () => {
    expect(financeHrefFor('ONLINE_SALES', 'range=7d')).toBe('/expenses?range=7d')
    expect(financeHrefFor('LODGING', 'range=month')).toBe('/expenses?range=month')
  })
})
