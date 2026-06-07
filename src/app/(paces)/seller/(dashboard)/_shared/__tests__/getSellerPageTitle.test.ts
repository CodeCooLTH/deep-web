import { describe, it, expect } from 'vitest'
import { getSellerPageTitle } from '../getSellerPageTitle'

describe('getSellerPageTitle', () => {
  it('exact match: /dashboard → ภาพรวมร้านค้า', () => {
    expect(getSellerPageTitle('/dashboard')).toBe('ภาพรวมร้านค้า')
  })

  it('exact match: /orders → คำสั่งซื้อ', () => {
    expect(getSellerPageTitle('/orders')).toBe('คำสั่งซื้อ')
  })

  it('exact match: /products → สินค้า', () => {
    expect(getSellerPageTitle('/products')).toBe('สินค้า')
  })

  it('exact match: /wallet → เครดิต SMS', () => {
    expect(getSellerPageTitle('/wallet')).toBe('เครดิต SMS')
  })

  it('detail route prefix: /orders/abc123 → คำสั่งซื้อ', () => {
    expect(getSellerPageTitle('/orders/abc123')).toBe('คำสั่งซื้อ')
  })

  it('detail route prefix: /products/edit/99 → สินค้า', () => {
    expect(getSellerPageTitle('/products/edit/99')).toBe('สินค้า')
  })

  it('detail route prefix: /customers/detail/5 → ผู้ซื้อ', () => {
    expect(getSellerPageTitle('/customers/detail/5')).toBe('ผู้ซื้อ')
  })

  it('ไม่ match path ไม่รู้จัก → fallback Deep ผู้ขาย', () => {
    expect(getSellerPageTitle('/unknown')).toBe('Deep ผู้ขาย')
  })

  it('ไม่ match root / → fallback', () => {
    expect(getSellerPageTitle('/')).toBe('Deep ผู้ขาย')
  })

  it('ไม่ match /dashboard-extra (false prefix guard)', () => {
    // /dashboard ไม่ควร match /dashboard-extra
    expect(getSellerPageTitle('/dashboard-extra')).toBe('Deep ผู้ขาย')
  })

  it('exact match: /verification → การยืนยันตัวตน', () => {
    expect(getSellerPageTitle('/verification')).toBe('การยืนยันตัวตน')
  })
})
