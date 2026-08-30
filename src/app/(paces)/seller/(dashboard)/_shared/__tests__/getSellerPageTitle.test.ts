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

  it('exact match: /wallet → กระเป๋าเงิน', () => {
    expect(getSellerPageTitle('/wallet')).toBe('กระเป๋าเงิน')
  })

  it('detail route prefix: /orders/abc123 → คำสั่งซื้อ', () => {
    expect(getSellerPageTitle('/orders/abc123')).toBe('คำสั่งซื้อ')
  })

  it('detail route prefix: /products/edit/99 → สินค้า', () => {
    expect(getSellerPageTitle('/products/edit/99')).toBe('สินค้า')
  })

  // ป้ายจริงคือ "ลูกค้า" มาตั้งแต่ก่อนหน้านี้ — เทสเดิมค้างคำว่า "ผู้ซื้อ" ไว้จนแดงเงียบ ๆ
  it('detail route prefix: /customers/detail/5 → ลูกค้า', () => {
    expect(getSellerPageTitle('/customers/detail/5')).toBe('ลูกค้า')
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

  // เปลี่ยนป้ายเป็น "ระดับร้าน" 2026-08-04 (เทสเดิมค้างคำว่า "การยืนยันตัวตน" ซึ่งเลิกใช้ไปนานแล้ว
  // — ป้ายก่อนหน้านี้คือ "ยืนยันตน" ก็ยังไม่ตรงกับที่เทสเขียนอยู่ดี)
  it('exact match: /verification → ระดับร้าน', () => {
    expect(getSellerPageTitle('/verification')).toBe('ระดับร้าน')
  })

  it('รายการที่เพิ่งเพิ่มเข้าเมนูก็มีชื่อหน้า: /settings/channels → ช่องทางการขาย', () => {
    // ก่อนเพิ่มเข้าเมนู หน้านี้ตกไป fallback "Deep ผู้ขาย" บน topbar มือถือ
    expect(getSellerPageTitle('/settings/channels')).toBe('ช่องทางการขาย')
  })

  describe('orderLabel override (ป้าย /orders ผันตามประเภทกิจการ)', () => {
    it('ส่ง override มา → ใช้ค่านั้นทั้ง /orders และ detail route', () => {
      expect(getSellerPageTitle('/orders', 'บิลเข้าพัก')).toBe('บิลเข้าพัก')
      expect(getSellerPageTitle('/orders/abc123', 'ใบสั่งงาน')).toBe('ใบสั่งงาน')
    })

    it('ไม่ส่ง override → คงป้ายตั้งต้นจากเมนู', () => {
      expect(getSellerPageTitle('/orders/abc123')).toBe('คำสั่งซื้อ')
    })

    it('override ไม่รั่วไปหน้าอื่น', () => {
      expect(getSellerPageTitle('/products', 'บิลเข้าพัก')).toBe('สินค้า')
      // guard ขอบ segment — /orders ต้องไม่ไปจับ /orders-foo
      expect(getSellerPageTitle('/orders-foo', 'บิลเข้าพัก')).toBe('Deep ผู้ขาย')
    })
  })
})

/**
 * 🛑 [blocker] — ด่านของ "ชื่อหน้าซ้ำสองที่" ที่หน้า `/reports/products` พึ่งพา
 *
 * หน้านั้น **ซ่อน `<h4>` ชื่อหน้าของตัวเองบนมือถือ** (2026-08-30) ด้วยเหตุผลว่าหัวแอป
 * พิมพ์คำเดียวกันอยู่แล้ว — ซึ่งจริงก็ต่อเมื่อ route ยังอยู่ใน `sellerMenuItems`
 * วันที่มีคนถอดเมนูออกหรือแก้ป้าย หัวจอมือถือจะกลายเป็น `FALLBACK` ("Deep ผู้ขาย")
 * **เงียบ ๆ โดยที่หน้าไม่มีชื่ออะไรเหลืออยู่เลย** — `tsc`/build/เทสอื่นมองไม่เห็นเพราะ
 * ทั้งสองฝั่งถูกตามชนิดทุกตัวอักษร สิ่งที่ผิดคือข้อสมมติที่เชื่อมมันไว้
 */
describe('[blocker] หน้าที่ซ่อนชื่อของตัวเองบนมือถือ ต้องได้ชื่อจากหัวแอปจริง', () => {
  it('/reports/products ต้องไม่ตกไปที่ค่าสำรอง', () => {
    expect(getSellerPageTitle('/reports/products')).toBe('ยอดขายรายสินค้า')
  })
})
