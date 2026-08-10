// order-display.test.ts — Vitest unit tests สำหรับ getOrderTimeline และ display helper อื่น
// ครอบ 7 combinations ที่ Controller กำหนด + กรณีเพิ่มเติม
// Phase 2 additions (S-3, S-13): isCODPayment, isHttpUrl, showSlipZone

import { describe, it, expect } from 'vitest'
import { getOrderTimeline, isCODPayment, isHttpUrl, showSlipZone, getPaymentBadge } from './order-display'

// -------------------------------------------------------------------------
// getOrderTimeline
// -------------------------------------------------------------------------
describe('getOrderTimeline', () => {
  it('PENDING transfer physical → step[0] done, step[1] รอชำระเงิน/cur, step[2] จัดส่ง/up', () => {
    const tl = getOrderTimeline('PENDING', 'SHIPPED', 'พร้อมเพย์')
    expect(tl).toHaveLength(3)
    expect(tl[0]).toEqual({ label: 'สั่งซื้อแล้ว', state: 'done' })
    expect(tl[1]).toEqual({ label: 'รอชำระเงิน', state: 'cur' })
    expect(tl[2]).toEqual({ label: 'จัดส่ง', state: 'up' })
  })

  it('PENDING COD physical → step[1] รอยืนยัน/cur', () => {
    const tl = getOrderTimeline('PENDING', 'SHIPPED', 'COD')
    expect(tl[1]).toEqual({ label: 'รอยืนยัน', state: 'cur' })
    expect(tl[2]).toEqual({ label: 'จัดส่ง', state: 'up' })
  })

  it('PENDING digital (NO_SHIPPING) → [สั่งซื้อแล้ว/done, ส่งมอบแล้ว/cur, ยืนยันรับ/up]', () => {
    const tl = getOrderTimeline('PENDING', 'NO_SHIPPING', null)
    expect(tl).toEqual([
      { label: 'สั่งซื้อแล้ว', state: 'done' },
      { label: 'ส่งมอบแล้ว',  state: 'cur'  },
      { label: 'ยืนยันรับ',    state: 'up'   },
    ])
  })

  it('SHIPPED physical → [ยืนยันแล้ว/done, กำลังจัดส่ง/cur, ได้รับสินค้า/up]', () => {
    const tl = getOrderTimeline('SHIPPED', 'SHIPPED', 'โอนเงิน')
    expect(tl).toEqual([
      { label: 'ยืนยันแล้ว',   state: 'done' },
      { label: 'กำลังจัดส่ง',  state: 'cur'  },
      { label: 'ได้รับสินค้า',  state: 'up'   },
    ])
  })

  it('CONFIRMED physical → [ยืนยันแล้ว/done, จัดส่งแล้ว/done, ได้รับแล้ว/fin]', () => {
    const tl = getOrderTimeline('CONFIRMED', 'SHIPPED', 'โอนเงิน')
    expect(tl).toEqual([
      { label: 'ยืนยันแล้ว', state: 'done' },
      { label: 'จัดส่งแล้ว', state: 'done' },
      { label: 'ได้รับแล้ว', state: 'fin'  },
    ])
  })

  it('CONFIRMED digital → [สั่งซื้อแล้ว/done, ส่งมอบแล้ว/done, ได้รับแล้ว/fin]', () => {
    const tl = getOrderTimeline('CONFIRMED', 'NO_SHIPPING', undefined)
    expect(tl).toEqual([
      { label: 'สั่งซื้อแล้ว', state: 'done' },
      { label: 'ส่งมอบแล้ว',   state: 'done' },
      { label: 'ได้รับแล้ว',    state: 'fin'  },
    ])
  })

  it('CANCELLED physical → [สั่งซื้อแล้ว/done, ยกเลิก/cx, จัดส่ง/mute]', () => {
    const tl = getOrderTimeline('CANCELLED', 'SHIPPED', 'โอนเงิน')
    expect(tl).toEqual([
      { label: 'สั่งซื้อแล้ว', state: 'done' },
      { label: 'ยกเลิก',       state: 'cx'   },
      { label: 'จัดส่ง',       state: 'mute' },
    ])
  })

  it('CANCELLED digital → step[2] ยืนยันรับ/mute (ไม่ใช่ จัดส่ง)', () => {
    const tl = getOrderTimeline('CANCELLED', 'NO_SHIPPING', null)
    expect(tl[2]).toEqual({ label: 'ยืนยันรับ', state: 'mute' })
  })

  it('ทุก path คืน array ความยาว 3 เสมอ', () => {
    const cases: Parameters<typeof getOrderTimeline>[] = [
      ['PENDING',   'SHIPPED',     'โอนเงิน'],
      ['PENDING',   'SHIPPED',     'COD'],
      ['PENDING',   'NO_SHIPPING', null],
      ['SHIPPED',   'SHIPPED',     'โอนเงิน'],
      ['CONFIRMED', 'SHIPPED',     'โอนเงิน'],
      ['CONFIRMED', 'NO_SHIPPING', undefined],
      ['CANCELLED', 'SHIPPED',     'โอนเงิน'],
      ['CANCELLED', 'NO_SHIPPING', null],
    ]
    for (const [s, f, p] of cases) {
      expect(getOrderTimeline(s, f, p)).toHaveLength(3)
    }
  })
})

// -------------------------------------------------------------------------
// Phase 2: isCODPayment (S-13)
// -------------------------------------------------------------------------
describe('isCODPayment', () => {
  it('ตรวจจับ "COD" uppercase → true', () => {
    expect(isCODPayment('COD')).toBe(true)
  })

  it('ตรวจจับ "cod" lowercase → true (case-insensitive)', () => {
    expect(isCODPayment('cod')).toBe(true)
  })

  it('ตรวจจับ "เก็บเงินปลายทาง (COD)" → true', () => {
    expect(isCODPayment('เก็บเงินปลายทาง (COD)')).toBe(true)
  })

  it('ตรวจจับ "ปลายทาง" → true', () => {
    expect(isCODPayment('ปลายทาง')).toBe(true)
  })

  it('ตรวจจับ "เก็บเงิน" → true', () => {
    expect(isCODPayment('เก็บเงิน')).toBe(true)
  })

  it('โอนเงิน → false', () => {
    expect(isCODPayment('โอนเงิน')).toBe(false)
  })

  it('พร้อมเพย์ → false', () => {
    expect(isCODPayment('พร้อมเพย์ 0812345678')).toBe(false)
  })

  it('null → false', () => {
    expect(isCODPayment(null)).toBe(false)
  })

  it('undefined → false', () => {
    expect(isCODPayment(undefined)).toBe(false)
  })

  it('string ว่าง → false', () => {
    expect(isCODPayment('')).toBe(false)
  })
})

// -------------------------------------------------------------------------
// Phase 2: isHttpUrl (S-3, S-13)
// -------------------------------------------------------------------------
describe('isHttpUrl', () => {
  // accept
  it('http://x.com → true', () => {
    expect(isHttpUrl('http://x.com')).toBe(true)
  })

  it('https://x.com → true', () => {
    expect(isHttpUrl('https://x.com')).toBe(true)
  })

  it('https://example.com/path?q=1 → true', () => {
    expect(isHttpUrl('https://example.com/path?q=1')).toBe(true)
  })

  // reject — dangerous schemes
  it('javascript:alert(1) → false (กัน stored-XSS)', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
  })

  it('data:text/html,x → false', () => {
    expect(isHttpUrl('data:text/html,x')).toBe(false)
  })

  it('ftp://x → false', () => {
    expect(isHttpUrl('ftp://x')).toBe(false)
  })

  it('mailto:a@b.com → false', () => {
    expect(isHttpUrl('mailto:a@b.com')).toBe(false)
  })

  // reject — not parseable / empty / whitespace
  it('string ว่าง → false', () => {
    expect(isHttpUrl('')).toBe(false)
  })

  it('whitespace เท่านั้น → false', () => {
    expect(isHttpUrl('   ')).toBe(false)
  })

  it('ข้อความไม่ใช่ URL → false', () => {
    expect(isHttpUrl('notaurl')).toBe(false)
  })
})

// -------------------------------------------------------------------------
// Phase 2: showSlipZone (S-3, S-13)
// -------------------------------------------------------------------------
describe('showSlipZone', () => {
  it('PENDING + transfer (พร้อมเพย์) → true', () => {
    expect(showSlipZone('PENDING', 'พร้อมเพย์ 0812345678')).toBe(true)
  })

  it('PENDING + โอนเงิน → true', () => {
    expect(showSlipZone('PENDING', 'โอนเงิน')).toBe(true)
  })

  it('PENDING + null (ไม่ระบุวิธีชำระ) → true', () => {
    // ไม่ใช่ COD → ต้องแสดง zone เพื่อ buyer แนบสลิป
    expect(showSlipZone('PENDING', null)).toBe(true)
  })

  it('PENDING + COD (เก็บเงินปลายทาง (COD)) → false', () => {
    expect(showSlipZone('PENDING', 'เก็บเงินปลายทาง (COD)')).toBe(false)
  })

  it('PENDING + COD uppercase → false', () => {
    expect(showSlipZone('PENDING', 'COD')).toBe(false)
  })

  it('SHIPPED + transfer → false (order เดินหน้าแล้ว)', () => {
    expect(showSlipZone('SHIPPED', 'พร้อมเพย์')).toBe(false)
  })

  it('CONFIRMED + transfer → false', () => {
    expect(showSlipZone('CONFIRMED', 'โอนเงิน')).toBe(false)
  })

  it('CANCELLED + transfer → false', () => {
    expect(showSlipZone('CANCELLED', 'โอนเงิน')).toBe(false)
  })

  it('SHIPPED + COD → false', () => {
    expect(showSlipZone('SHIPPED', 'COD')).toBe(false)
  })
})

// -------------------------------------------------------------------------
// T5: getPaymentBadge — badge สถานะการชำระเงิน (Verified-Means-Green)
// -------------------------------------------------------------------------
describe('getPaymentBadge', () => {
  it('CONFIRMED → ชำระแล้ว + success (เขียว — จุดเดียวที่อนุญาต)', () => {
    const b = getPaymentBadge('CONFIRMED', 'TRANSFER', 'slip-1')
    expect(b).toEqual({ label: 'ชำระแล้ว', cls: 'badge bg-success/15 text-success-ink' })
  })

  it('CONFIRMED + COD → ยังเป็น ชำระแล้ว (status ชนะก่อน isCODPayment check)', () => {
    const b = getPaymentBadge('CONFIRMED', 'COD', null)
    expect(b?.label).toBe('ชำระแล้ว')
  })

  it('CANCELLED → ยกเลิก + default (ไม่ใช่เขียว)', () => {
    const b = getPaymentBadge('CANCELLED', 'TRANSFER', null)
    expect(b).toEqual({ label: 'ยกเลิก', cls: 'badge bg-default-100 text-default-800' })
    expect(b?.cls).not.toContain('success')
  })

  it('PENDING + COD → รอเก็บปลายทาง + info (ไม่ใช่เขียว)', () => {
    const b = getPaymentBadge('PENDING', 'COD', null)
    expect(b).toEqual({ label: 'รอเก็บปลายทาง', cls: 'badge bg-info/15 text-info-ink' })
  })

  it('SHIPPED + COD → รอเก็บปลายทาง (ไม่ใช่แค่ PENDING)', () => {
    const b = getPaymentBadge('SHIPPED', 'เก็บเงินปลายทาง', null)
    expect(b?.label).toBe('รอเก็บปลายทาง')
    expect(b?.cls).not.toContain('success')
  })

  it('PENDING + TRANSFER + มีสลิป → รอตรวจสอบสลิป + info (ไม่ใช่เขียว)', () => {
    const b = getPaymentBadge('PENDING', 'TRANSFER', 'slip-abc')
    expect(b).toEqual({ label: 'รอตรวจสอบสลิป', cls: 'badge bg-info/15 text-info-ink' })
  })

  it('PENDING + PROMPTPAY + มีสลิป → รอตรวจสอบสลิป', () => {
    const b = getPaymentBadge('PENDING', 'PROMPTPAY', 'slip-abc')
    expect(b?.label).toBe('รอตรวจสอบสลิป')
  })

  it('PENDING + TRANSFER + ไม่มีสลิป → รอชำระ + warning (ไม่ใช่ danger/แดง หรือเขียว)', () => {
    const b = getPaymentBadge('PENDING', 'TRANSFER', null)
    expect(b).toEqual({ label: 'รอชำระ', cls: 'badge bg-warning/15 text-warning-ink' })
  })

  it('PENDING + PROMPTPAY + ไม่มีสลิป → รอชำระ + warning', () => {
    const b = getPaymentBadge('PENDING', 'PROMPTPAY', undefined)
    expect(b?.label).toBe('รอชำระ')
    expect(b?.cls).toContain('warning')
  })

  // T14 P4: เดิม return null ทำให้ badge หายเงียบ ๆ เมื่อ paymentMethod เป็น free text/ไม่รู้จัก
  // (เช่น seller กรอกเอง "พร้อมเพย์ 081-234-5678") — ตอนนี้ต้องตอบคำถาม "ได้เงินหรือยัง" ได้เสมอ
  it('PENDING + CASH (วิธีที่ไม่รู้จัก) → badge fallback "ยังไม่ยืนยันการชำระ" + warning (ไม่ใช่เขียว)', () => {
    const b = getPaymentBadge('PENDING', 'CASH', null)
    expect(b).toEqual({ label: 'ยังไม่ยืนยันการชำระ', cls: 'badge bg-warning/15 text-warning-ink' })
  })

  it('PENDING + paymentMethod null → badge fallback "ยังไม่ยืนยันการชำระ" (ไม่ใช่ null — ไม่หายไปเงียบ ๆ)', () => {
    const b = getPaymentBadge('PENDING', null, null)
    expect(b).toEqual({ label: 'ยังไม่ยืนยันการชำระ', cls: 'badge bg-warning/15 text-warning-ink' })
  })

  it('PENDING + free-text paymentMethod จริงจากฐาน → ยังได้ badge fallback ไม่ใช่หายไปทั้งหน้า', () => {
    const b = getPaymentBadge('PENDING', 'พร้อมเพย์ 081-234-5678', null)
    expect(b).not.toBeNull()
    expect(b?.label).toBe('ยังไม่ยืนยันการชำระ')
    expect(b?.cls).not.toContain('success')
  })

  it('ไม่มี label ไหนได้ bg-success ยกเว้น "ชำระแล้ว" (Verified-Means-Green regression)', () => {
    const cases: Parameters<typeof getPaymentBadge>[] = [
      ['PENDING', 'COD', null],
      ['PENDING', 'TRANSFER', 'slip-1'],
      ['PENDING', 'TRANSFER', null],
      ['PENDING', 'PROMPTPAY', 'slip-1'],
      ['SHIPPED', 'COD', null],
      ['CANCELLED', 'TRANSFER', null],
      ['PENDING', 'CASH', null],
      ['PENDING', null, null],
    ]
    for (const [status, pm, slip] of cases) {
      const b = getPaymentBadge(status, pm, slip)
      if (b && b.label !== 'ชำระแล้ว') {
        expect(b.cls).not.toContain('success')
      }
    }
  })
})
