import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { isCashPayment, paymentMethodDetail, paymentMethodLabel } from '@/lib/order-display'
import { needsPayoutAccount } from '@/lib/shop-payout'

/**
 * [blocker] ป้ายวิธีชำระเงินต้องแตก **3 ทาง** และต้องตรงกับ `needsPayoutAccount()` เสมอ
 *
 * อาการที่เห็นบนจอจริง 2026-08-30 (ออเดอร์ DP2569088167E09A, ร้านตั้ง `paymentMethod = 'CASH'`):
 *
 *     ┌──────────────────────────┐
 *     │  💳  โอนเข้าบัญชี         │   ← ป้ายที่ UI แตกเอง 2 ทาง (COD / ไม่ใช่ COD)
 *     │      CASH                │   ← ค่าดิบของร้าน
 *     └──────────────────────────┘
 *
 * กล่องเดียวบอกสองอย่างที่ขัดกันเอง แล้ว *ยังไม่มีบัญชีให้โอน* ด้วย เพราะฝั่งข้อมูล
 * (`needsPayoutAccount`) รู้มาตลอดว่า CASH ไม่ใช่การโอน — ความรู้นั้นอยู่ที่เดียวใน
 * `shop-payout.ts` และ UI ไม่เคยได้เห็น
 *
 * 🛑 แดง = ห้าม merge
 */
describe('[blocker] paymentMethodLabel', () => {
  it('CASH → "เงินสด" ไม่ใช่ "โอนเข้าบัญชี" (เคสที่พังบนจอจริง)', () => {
    expect(paymentMethodLabel('CASH')).toBe('เงินสด')
  })

  it('COD / ปลายทาง → ชำระเมื่อได้รับสินค้า', () => {
    expect(paymentMethodLabel('COD')).toBe('ชำระเมื่อได้รับสินค้า')
    expect(paymentMethodLabel('เก็บเงินปลายทาง')).toBe('ชำระเมื่อได้รับสินค้า')
  })

  it('TRANSFER / PROMPTPAY / ค่าที่ไม่รู้จัก → โอนเข้าบัญชี', () => {
    expect(paymentMethodLabel('TRANSFER')).toBe('โอนเข้าบัญชี')
    expect(paymentMethodLabel('PROMPTPAY')).toBe('โอนเข้าบัญชี')
    expect(paymentMethodLabel('ผ่อนกับร้าน')).toBe('โอนเข้าบัญชี')
    expect(paymentMethodLabel(null)).toBe('โอนเข้าบัญชี')
  })

  it('🛑 ป้ายกับกล่องบัญชีต้องไม่ขัดกัน: พูดว่า "โอนเข้าบัญชี" ⇔ needsPayoutAccount', () => {
    /* เกณฑ์เดียวกันเป๊ะ — ไม่ใช่ "คล้ายกัน" ถ้าวันหนึ่งใครแก้ข้างใดข้างหนึ่ง เทสนี้ต้องแดง */
    for (const pm of ['CASH', 'เงินสด', 'COD', 'ปลายทาง', 'TRANSFER', 'PROMPTPAY', 'ผ่อนกับร้าน', '', null]) {
      expect(paymentMethodLabel(pm) === 'โอนเข้าบัญชี').toBe(needsPayoutAccount(pm))
    }
  })

  it('COD ที่มีคำว่า cash ปนอยู่ ต้องยังเป็นปลายทาง (COD ชนะเสมอ)', () => {
    expect(isCashPayment('COD cash')).toBe(false)
    expect(paymentMethodLabel('COD cash')).toBe('ชำระเมื่อได้รับสินค้า')
  })
})

describe('[blocker] paymentMethodDetail', () => {
  it('ค่าที่ป้ายอธิบายครบแล้ว → null (ไม่โชว์ซ้ำ)', () => {
    expect(paymentMethodDetail('CASH')).toBeNull()
    expect(paymentMethodDetail('cash')).toBeNull()
    expect(paymentMethodDetail(' TRANSFER ')).toBeNull()
    expect(paymentMethodDetail('เงินสด')).toBeNull()
    expect(paymentMethodDetail('')).toBeNull()
    expect(paymentMethodDetail(null)).toBeNull()
  })

  it('ร้านพิมพ์รายละเอียดเพิ่ม → ต้องโชว์ตามที่ร้านพิมพ์', () => {
    expect(paymentMethodDetail('โอน SCB 123-4-5678')).toBe('โอน SCB 123-4-5678')
  })
})

/**
 * ตัวกันระดับไฟล์: ห้าม UI แตกป้ายเอง 2 ทางอีก — เคสนี้กลับมาได้ง่ายมากเพราะเขียนสั้นกว่า
 * การ import ตัวช่วย ('โอนเข้าบัญชี' เป็น string literal ที่พิมพ์ทับได้ในบรรทัดเดียว)
 */
describe('[blocker] ไม่มีใครพิมพ์ป้ายเองนอก order-display.ts', () => {
  const ROOT = join(__dirname, '..', '..')
  const FILES = [
    join(ROOT, 'app', '(marketing)', 'o', '[token]', 'OrderDetailMobile.tsx'),
    join(ROOT, 'app', '(marketing)', 'o', '[token]', 'PaymentSummaryCard.tsx'),
  ]

  for (const f of FILES) {
    it(`${f.split('/').pop()} ต้องเรียก paymentMethodLabel() ไม่ใช่พิมพ์ 'โอนเข้าบัญชี' เอง`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).toContain('paymentMethodLabel(')
      expect(src).not.toContain("'โอนเข้าบัญชี'")
    })
  }
})
