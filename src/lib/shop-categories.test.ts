import { describe, it, expect } from 'vitest'
import { SHOP_CATEGORY_KEYS, SHOP_CATEGORY_LABELS, isShopCategory } from './shop-categories'

describe('shop-categories', () => {
  it('has 25 keys with a Thai label each', () => {
    // 25 = 10 เดิม (feature 00001) + 15 ที่เพิ่ม 2026-08-04 — เลขนี้เป็น guard ว่ามีคนเพิ่ม/ลบ
    // หมวดโดยไม่ได้ตั้งใจ ไม่ใช่กฎธุรกิจ. เพิ่มหมวดใหม่แล้วอัปเดตเลขนี้ได้ตามปกติ
    expect(SHOP_CATEGORY_KEYS.length).toBe(25)
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
