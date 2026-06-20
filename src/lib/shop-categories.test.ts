import { describe, it, expect } from 'vitest'
import { SHOP_CATEGORY_KEYS, SHOP_CATEGORY_LABELS, isShopCategory } from './shop-categories'

describe('shop-categories', () => {
  it('has 10 keys with a Thai label each', () => {
    expect(SHOP_CATEGORY_KEYS.length).toBe(10)
    for (const k of SHOP_CATEGORY_KEYS) {
      expect(typeof SHOP_CATEGORY_LABELS[k]).toBe('string')
      expect(SHOP_CATEGORY_LABELS[k].length).toBeGreaterThan(0)
    }
  })
  it('isShopCategory accepts known keys and rejects others', () => {
    expect(isShopCategory('fashion')).toBe(true)
    expect(isShopCategory('other')).toBe(true)
    expect(isShopCategory('nope')).toBe(false)
    expect(isShopCategory('')).toBe(false)
  })
})
