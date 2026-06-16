import { describe, it, expect } from 'vitest'
import { normalizeSlug, isValidSlugFormat, isReservedSlug } from './shop-slug'

describe('shop-slug', () => {
  it('normalizes to lowercase trimmed', () => {
    expect(normalizeSlug('  My-Shop  ')).toBe('my-shop')
  })
  it('validates format a-z0-9-, 3..30, no leading/trailing hyphen', () => {
    expect(isValidSlugFormat('myshop')).toBe(true)
    expect(isValidSlugFormat('my-shop-1')).toBe(true)
    expect(isValidSlugFormat('ab')).toBe(false)
    expect(isValidSlugFormat('-abc')).toBe(false)
    expect(isValidSlugFormat('abc-')).toBe(false)
    expect(isValidSlugFormat('a_b')).toBe(false)
    expect(isValidSlugFormat('a'.repeat(31))).toBe(false)
  })
  it('flags reserved words', () => {
    expect(isReservedSlug('admin')).toBe(true)
    expect(isReservedSlug('auth')).toBe(true)
    expect(isReservedSlug('myshop')).toBe(false)
  })
})
