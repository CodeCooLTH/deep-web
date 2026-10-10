import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveSessionActiveShop as r } from '../session-active-shop'

describe('resolveSessionActiveShop', () => {
  it('(a) BUSINESS + membership ERROR → ไม่ใช่ OWNER ของ BUSINESS ถอยไป personal', () => {
    // personal = OWNER ของร้านตัวเองเท่านั้น ไม่ใช่ของร้าน BUSINESS ที่ token ชี้
    expect(r({ personalShopId: 'p', tokenActiveShopId: 'b', membership: 'ERROR' })).toEqual({ activeShopId: 'p', role: 'OWNER' })
  })
  it('(a2) ERROR + ไม่มี personal → null/null', () => {
    expect(r({ personalShopId: null, tokenActiveShopId: 'b', membership: 'ERROR' })).toEqual({ activeShopId: null, role: null })
  })
  it('(b) PERSONAL → OWNER', () => {
    expect(r({ personalShopId: 'p', tokenActiveShopId: 'p', membership: null })).toEqual({ activeShopId: 'p', role: 'OWNER' })
  })
  it('(c) token ชี้ร้านที่ไม่ได้เป็นสมาชิก → personal', () => {
    expect(r({ personalShopId: 'p', tokenActiveShopId: 'b', membership: null })).toEqual({ activeShopId: 'p', role: 'OWNER' })
  })
  it('(d) ไม่มี personal ไม่มีสมาชิก → null', () => {
    expect(r({ personalShopId: null, tokenActiveShopId: 'b', membership: null })).toEqual({ activeShopId: null, role: null })
  })
  it('(f) membership ของร้านอื่น (shopId ไม่ตรง token) → ไม่ใช้ ถอยไป personal', () => {
    expect(r({ personalShopId: 'p', tokenActiveShopId: 'b', membership: { shopId: 'other', role: 'OWNER' } })).toEqual({ activeShopId: 'p', role: 'OWNER' })
  })
  it('(e) สมาชิก ADMIN ที่ valid → ADMIN', () => {
    expect(r({ personalShopId: 'p', tokenActiveShopId: 'b', membership: { shopId: 'b', role: 'ADMIN' } })).toEqual({ activeShopId: 'b', role: 'ADMIN' })
  })
})

describe('auth.ts source guard', () => {
  it('ไม่มี fallback กำหนด "OWNER" ให้ activeShopRole นอก pure function', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/auth.ts'), 'utf8')
    expect(src).not.toMatch(/activeShopRole\s*(:[^=\n]+)?=\s*["']OWNER["']/)
    expect(src).toContain('resolveSessionActiveShop')
  })
})
