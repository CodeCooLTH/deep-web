// order-display.test.ts — Vitest unit tests สำหรับ getOrderTimeline และ display helper อื่น
// ครอบ 7 combinations ที่ Controller กำหนด + กรณีเพิ่มเติม
// Phase 2 additions (S-3, S-13): isCODPayment, isHttpUrl, showSlipZone

import { describe, it, expect } from 'vitest'
import {
  getOrderTimeline,
  isCODPayment,
  isHttpUrl,
  showSlipZone,
  getPaymentBadge,
  canSellerConfirmPayment,
} from './order-display'

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
      ['RETURNED',  'SHIPPED',     'COD'],
    ]
    for (const [s, f, p] of cases) {
      expect(getOrderTimeline(s, f, p)).toHaveLength(3)
    }
  })

  /**
   * 🛑 บั๊กจริงที่เจอบน prod 2026-08-25 (ยังไม่มีใครโดนเพราะ RETURNED มี 0 ใบ)
   *
   * feature 00056 เพิ่ม `RETURNED` ลง DB ตั้งแต่ 08-24 แต่ `type OrderStatus` ไม่ได้ขยายตาม
   * ⇒ `switch` ดู "ครบตามชนิด" ในสายตา tsc ⇒ คืน `undefined` ⇒ `<HorizontalTimeline>` ทำ
   * `steps.map()` = **หน้าออเดอร์ของผู้ซื้อ /o/[token] พังทั้งหน้า**
   */
  it('[blocker] RETURNED ต้องได้ไทม์ไลน์จริง ไม่ใช่ undefined', () => {
    const tl = getOrderTimeline('RETURNED', 'SHIPPED', 'COD')
    expect(tl).toBeDefined()
    expect(Array.isArray(tl)).toBe(true)
    expect(tl.map((s) => s.label)).toEqual(['สั่งซื้อแล้ว', 'ได้รับสินค้า', 'คืนของแล้ว'])
    // ไม่ใช่ `cx` แบบยกเลิก — ของเดินครบเส้นทางจริง ต่างจาก "ไม่เคยส่ง" (HR16 กับ ORDER_STATUS_META)
    expect(tl.map((s) => s.state)).toEqual(['done', 'done', 'fin'])
  })

  /**
   * ด่านกัน "ค่าใหม่โผล่มาแล้วเงียบ" — ตัวที่แดงจริงคือ `tsc` ผ่าน `never` ในฟังก์ชัน
   * ส่วนเทสนี้กันอีกชั้นที่ **runtime** เผื่อค่าที่หลุดมาจาก DB โดยไม่ผ่าน type เลย
   * (เช่น `as OrderStatus` ที่ยังเหลืออยู่ที่อื่น หรือค่าที่ migration เพิ่มแต่ยังไม่ sync type)
   */
  it('[blocker] ค่าที่ไม่รู้จักต้องได้ไทม์ไลน์กลาง ๆ ไม่ใช่ undefined (จอที่บอกไม่ละเอียด > จอขาว)', () => {
    const tl = getOrderTimeline('SOMETHING_NEW' as never, 'SHIPPED', null)
    expect(tl).toBeDefined()
    expect(tl).toHaveLength(3)
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
// feature 00062 (U13): เพิ่ม param ที่ 4 paymentConfirmedAt + field `tone` (SDS TD-003)
// -------------------------------------------------------------------------
describe('getPaymentBadge', () => {
  it('CONFIRMED → ชำระแล้ว + success (เขียว — จุดเดียวที่อนุญาต)', () => {
    const b = getPaymentBadge('CONFIRMED', 'TRANSFER', 'slip-1', null)
    expect(b).toEqual({ label: 'ชำระแล้ว', cls: 'badge bg-success/15 text-success-ink', tone: 'success' })
  })

  it('CONFIRMED + COD → ยังเป็น ชำระแล้ว (status ชนะก่อน isCODPayment check)', () => {
    const b = getPaymentBadge('CONFIRMED', 'COD', null, null)
    expect(b?.label).toBe('ชำระแล้ว')
  })

  // regression: paymentConfirmedAt มีค่าแล้วยัง status===CONFIRMED ต้องยังเขียว ไม่ใช่ "ร้านยืนยันรับเงินแล้ว"
  it('CONFIRMED + TRANSFER + paymentConfirmedAt มีค่า → ยังเป็น ชำระแล้ว/success (status ชนะทุกกิ่งที่เหลือ)', () => {
    const b = getPaymentBadge('CONFIRMED', 'TRANSFER', null, '2026-08-28T10:00:00.000Z')
    expect(b).toEqual({ label: 'ชำระแล้ว', cls: 'badge bg-success/15 text-success-ink', tone: 'success' })
  })

  it('CANCELLED → ยกเลิก + เทา — tone ต้องเป็น neutral ให้ตรงกับ cls (ไม่ใช่ warning)', () => {
    const b = getPaymentBadge('CANCELLED', 'TRANSFER', null, null)
    expect(b).toEqual({ label: 'ยกเลิก', cls: 'badge bg-default-100 text-default-800', tone: 'neutral' })
    expect(b?.cls).not.toContain('success')
  })

  it('PENDING + COD → รอเก็บปลายทาง + info (ไม่ใช่เขียว)', () => {
    const b = getPaymentBadge('PENDING', 'COD', null, null)
    expect(b).toEqual({ label: 'รอเก็บปลายทาง', cls: 'badge bg-info/15 text-info-ink', tone: 'info' })
  })

  it('SHIPPED + COD → รอเก็บปลายทาง (ไม่ใช่แค่ PENDING)', () => {
    const b = getPaymentBadge('SHIPPED', 'เก็บเงินปลายทาง', null, null)
    expect(b?.label).toBe('รอเก็บปลายทาง')
    expect(b?.cls).not.toContain('success')
  })

  it('PENDING + TRANSFER + มีสลิป (ไม่มี paymentConfirmedAt) → รอตรวจสอบสลิป + info (ไม่ใช่เขียว)', () => {
    const b = getPaymentBadge('PENDING', 'TRANSFER', 'slip-abc', null)
    expect(b).toEqual({ label: 'รอตรวจสอบสลิป', cls: 'badge bg-info/15 text-info-ink', tone: 'info' })
  })

  it('PENDING + PROMPTPAY + มีสลิป → รอตรวจสอบสลิป', () => {
    const b = getPaymentBadge('PENDING', 'PROMPTPAY', 'slip-abc', null)
    expect(b?.label).toBe('รอตรวจสอบสลิป')
  })

  it('PENDING + TRANSFER + ไม่มีสลิป → รอชำระ + warning (ไม่ใช่ danger/แดง หรือเขียว)', () => {
    const b = getPaymentBadge('PENDING', 'TRANSFER', null, null)
    expect(b).toEqual({ label: 'รอชำระ', cls: 'badge bg-warning/15 text-warning-ink', tone: 'warning' })
  })

  it('PENDING + PROMPTPAY + ไม่มีสลิป → รอชำระ + warning', () => {
    const b = getPaymentBadge('PENDING', 'PROMPTPAY', undefined, undefined)
    expect(b?.label).toBe('รอชำระ')
    expect(b?.cls).toContain('warning')
  })

  // T14 P4: เดิม return null ทำให้ badge หายเงียบ ๆ เมื่อ paymentMethod เป็น free text/ไม่รู้จัก
  // (เช่น seller กรอกเอง "พร้อมเพย์ 081-234-5678") — ตอนนี้ต้องตอบคำถาม "ได้เงินหรือยัง" ได้เสมอ
  it('PENDING + CASH (ไม่มี paymentConfirmedAt) → badge fallback "ยังไม่ยืนยันการชำระ" + warning (ไม่ใช่เขียว)', () => {
    const b = getPaymentBadge('PENDING', 'CASH', null, null)
    expect(b).toEqual({ label: 'ยังไม่ยืนยันการชำระ', cls: 'badge bg-warning/15 text-warning-ink', tone: 'warning' })
  })

  it('PENDING + paymentMethod null → badge fallback "ยังไม่ยืนยันการชำระ" (ไม่ใช่ null — ไม่หายไปเงียบ ๆ)', () => {
    const b = getPaymentBadge('PENDING', null, null, null)
    expect(b).toEqual({ label: 'ยังไม่ยืนยันการชำระ', cls: 'badge bg-warning/15 text-warning-ink', tone: 'warning' })
  })

  it('PENDING + free-text paymentMethod จริงจากฐาน → ยังได้ badge fallback ไม่ใช่หายไปทั้งหน้า', () => {
    const b = getPaymentBadge('PENDING', 'พร้อมเพย์ 081-234-5678', null, null)
    expect(b).not.toBeNull()
    expect(b?.label).toBe('ยังไม่ยืนยันการชำระ')
    expect(b?.cls).not.toContain('success')
  })

  // -----------------------------------------------------------------------
  // feature 00062 (U13) — "ร้านยืนยันรับเงินแล้ว" (UX-Design-Spec §B8 ตาราง 7 แถว)
  // -----------------------------------------------------------------------

  it('PENDING + TRANSFER + paymentConfirmedAt (Date) → ร้านยืนยันรับเงินแล้ว + tone info (ห้ามเขียว)', () => {
    const b = getPaymentBadge('PENDING', 'TRANSFER', null, new Date('2026-08-28T10:00:00.000Z'))
    expect(b).toEqual({
      label: 'ร้านยืนยันรับเงินแล้ว',
      cls: 'badge bg-info/15 text-info-ink',
      tone: 'info',
    })
  })

  it('PENDING + PROMPTPAY + paymentConfirmedAt (ISO string) → ร้านยืนยันรับเงินแล้ว + tone info', () => {
    const b = getPaymentBadge('PENDING', 'PROMPTPAY', null, '2026-08-28T10:00:00.000Z')
    expect(b).toEqual({
      label: 'ร้านยืนยันรับเงินแล้ว',
      cls: 'badge bg-info/15 text-info-ink',
      tone: 'info',
    })
  })

  it('PENDING + CASH + paymentConfirmedAt → ร้านยืนยันรับเงินแล้ว (CASH นับเป็น transfer-like ด้วย)', () => {
    const b = getPaymentBadge('PENDING', 'CASH', null, '2026-08-28T10:00:00.000Z')
    expect(b?.label).toBe('ร้านยืนยันรับเงินแล้ว')
    expect(b?.tone).toBe('info')
  })

  /**
   * 🛑 [blocker] — เคสหัวใจของ U13: มีทั้งสลิป **และ** paymentConfirmedAt พร้อมกัน
   * ต้องได้ "ร้านยืนยันรับเงินแล้ว" เสมอ (ร้านยืนยันเองชนะ "รอตรวจสอบสลิป" เพราะเป็นสัญญาณ
   * ที่แน่นอนกว่า) — ยืนยันด้วยการ mutation: สลับลำดับกิ่ง paymentConfirmedAt กับ slipFileId
   * ในโค้ดจริง (เอากิ่ง TRANSFER/PROMPTPAY+slipFileId ไปไว้ก่อนกิ่งใหม่) แล้วรันเทสนี้ซ้ำ
   * ต้องได้ "รอตรวจสอบสลิป" (ผิด) → เทสนี้ต้องแดงทันที ถ้าไม่แดงแปลว่าเทสยังไม่ครอบเคสนี้จริง
   */
  it('[blocker] PENDING + TRANSFER + มีทั้งสลิปและ paymentConfirmedAt พร้อมกัน → ร้านยืนยันรับเงินแล้ว (ชนะ "รอตรวจสอบสลิป")', () => {
    const b = getPaymentBadge('PENDING', 'TRANSFER', 'slip-abc', '2026-08-28T10:00:00.000Z')
    expect(b?.label).toBe('ร้านยืนยันรับเงินแล้ว')
    expect(b?.label).not.toBe('รอตรวจสอบสลิป')
    expect(b?.tone).toBe('info')
  })

  it('[blocker] PENDING + PROMPTPAY + มีทั้งสลิปและ paymentConfirmedAt พร้อมกัน → ร้านยืนยันรับเงินแล้ว', () => {
    const b = getPaymentBadge('PENDING', 'PROMPTPAY', 'slip-xyz', new Date())
    expect(b?.label).toBe('ร้านยืนยันรับเงินแล้ว')
  })

  /**
   * 🛑 [blocker] tone ของกิ่งใหม่ห้ามเป็น success — Verified-Means-Green สงวนไว้เฉพาะ
   * status===CONFIRMED เท่านั้น (UX-Design-Spec §B8 "ทำไมเลือก tone info ไม่ใช่ success")
   * mutation: เปลี่ยน tone ของ branch "ร้านยืนยันรับเงินแล้ว" เป็น 'success' → เทสนี้ต้องแดง
   */
  it('[blocker] tone ของ "ร้านยืนยันรับเงินแล้ว" ต้องเป็น info ห้ามเป็น success', () => {
    const b = getPaymentBadge('PENDING', 'TRANSFER', null, '2026-08-28T10:00:00.000Z')
    expect(b?.tone).toBe('info')
    expect(b?.tone).not.toBe('success')
    expect(b?.cls).not.toContain('bg-success')
  })

  it('ไม่มี label ไหนได้ bg-success ยกเว้น "ชำระแล้ว" (Verified-Means-Green regression)', () => {
    const cases: Parameters<typeof getPaymentBadge>[] = [
      ['PENDING', 'COD', null, null],
      ['PENDING', 'TRANSFER', 'slip-1', null],
      ['PENDING', 'TRANSFER', null, null],
      ['PENDING', 'PROMPTPAY', 'slip-1', null],
      ['SHIPPED', 'COD', null, null],
      ['CANCELLED', 'TRANSFER', null, null],
      ['PENDING', 'CASH', null, null],
      ['PENDING', null, null, null],
      // feature 00062 — branch ใหม่ต้องไม่หลุดเข้ากฎ Verified-Means-Green ด้วย
      ['PENDING', 'TRANSFER', null, '2026-08-28T10:00:00.000Z'],
      ['PENDING', 'PROMPTPAY', 'slip-1', new Date()],
      ['PENDING', 'CASH', null, new Date()],
    ]
    for (const [status, pm, slip, confirmedAt] of cases) {
      const b = getPaymentBadge(status, pm, slip, confirmedAt)
      if (b && b.label !== 'ชำระแล้ว') {
        expect(b.cls).not.toContain('success')
        expect(b.tone).not.toBe('success')
      }
    }
  })
})

// -------------------------------------------------------------------------
// feature 00062 (U13): isTransferLikePayment — SSOT "นี่คือการชำระที่ร้านยืนยันเองได้ไหม"
// -------------------------------------------------------------------------
describe('canSellerConfirmPayment — "ร้านกดยืนยันรับเงินเองได้ไหม"', () => {
  for (const pm of ['TRANSFER', 'PROMPTPAY', 'CASH']) {
    it(`${pm} → true`, () => {
      expect(canSellerConfirmPayment(pm)).toBe(true)
    })
  }

  /**
   * 🛑 [blocker] COD ต้อง false เสมอ — `Order.codReceivedAt` เป็นเจ้าของคำถามนั้นอยู่แล้ว
   * และ DB มี CHECK `Order_payment_confirm_exclusive_check` กันสองช่องมีค่าพร้อมกัน
   * mutation: ทำให้คืน true กับ COD → เทสนี้ต้องแดง
   */
  it('[blocker] COD ทุกรูปแบบ → false', () => {
    expect(canSellerConfirmPayment('COD')).toBe(false)
    expect(canSellerConfirmPayment('เก็บเงินปลายทาง')).toBe(false)
    expect(canSellerConfirmPayment('เก็บเงินปลายทาง (COD)')).toBe(false)
  })

  /**
   * 🛑 [blocker] free text / CARD / OTHER / null ต้อง **true** — ไม่ใช่ false
   *
   * นี่คือเคสที่แตกกันจริงในรอบที่สร้างฟีเจอร์นี้: ฝั่งเขียน (`setPaymentConfirmed`) ใช้
   * "ไม่ใช่ COD" ส่วนฝั่งป้ายเคยใช้ equality 3 ค่า ⇒ ออเดอร์ที่ร้านพิมพ์วิธีชำระเอง
   * (มีจริงบน prod เช่น "พร้อมเพย์ 081-234-5678") จะยืนยันได้แต่ป้ายค้างที่
   * "ยังไม่ยืนยันการชำระ" ตลอดไป — mutation: เปลี่ยนกลับเป็น allow-list 3 ค่า → เทสนี้ต้องแดง
   */
  it('[blocker] free text ที่ไม่ใช่ COD → true (ข้อมูลจริงบน prod เป็น free text)', () => {
    expect(canSellerConfirmPayment('พร้อมเพย์ 081-234-5678')).toBe(true)
    expect(canSellerConfirmPayment('CARD')).toBe(true)
    expect(canSellerConfirmPayment('OTHER')).toBe(true)
    expect(canSellerConfirmPayment(null)).toBe(true)
    expect(canSellerConfirmPayment(undefined)).toBe(true)
  })

  /**
   * 🛑 [blocker] ป้ายต้องเปลี่ยนตามทุกค่าที่ฝั่งเขียนยอมรับ (HR16)
   *
   * ผูกสองฝั่งเข้าด้วยกันตรง ๆ: ถ้า `canSellerConfirmPayment` บอกว่ายืนยันได้
   * `getPaymentBadge` ต้องขึ้น "ร้านยืนยันรับเงินแล้ว" เมื่อมี `paymentConfirmedAt`
   * ไม่ใช่ตกไปกิ่ง fallback
   */
  it('[blocker] ทุกค่าที่ยืนยันได้ → ป้ายต้องเป็น "ร้านยืนยันรับเงินแล้ว"', () => {
    for (const pm of ['TRANSFER', 'PROMPTPAY', 'CASH', 'CARD', 'OTHER', 'พร้อมเพย์ 081-234-5678']) {
      expect(canSellerConfirmPayment(pm)).toBe(true)
      expect(getPaymentBadge('PENDING', pm, null, new Date())?.label).toBe('ร้านยืนยันรับเงินแล้ว')
    }
  })
})

/**
 * 🛑 ด่านกัน "cls กับ tone พูดคนละสี" (feature 00062)
 *
 * `cls` ใช้ฝั่งผู้ขาย (Paces/Tailwind) ส่วน `tone` ถูกแปลงเป็นสี MUI ให้ฝั่งผู้ซื้อผ่าน
 * `ORDER_STATUS_TONE_TO_MUI` — ถ้าสองอันไม่ตรงกัน ออเดอร์ใบเดียวกันจะขึ้นคนละสีบนสองจอ
 * โดยไม่มีอะไรฟ้อง (ทั้งคู่เป็นค่าที่ "ถูก" ในตัวเอง) เกิดมาแล้วจริงตอนเพิ่ม tone รอบแรก:
 * ยกเลิก = เทาฝั่งผู้ขาย แต่ส้มฝั่งผู้ซื้อ
 */
describe('[blocker] getPaymentBadge — cls กับ tone ต้องพูดสีเดียวกันทุก branch', () => {
  const CASES: Array<[string, string | null, string | null, Date | null]> = [
    ['CONFIRMED', 'TRANSFER', null, null],
    ['CANCELLED', 'TRANSFER', null, null],
    ['PENDING', 'COD', null, null],
    ['PENDING', 'TRANSFER', null, new Date()],
    ['PENDING', 'TRANSFER', 'file1', null],
    ['PENDING', 'TRANSFER', null, null],
    ['PENDING', 'อะไรก็ไม่รู้', null, null],
  ]

  it('ทุก branch: tone ต้องปรากฏเป็นคำใน cls (หรือเป็น neutral คู่กับ default)', () => {
    for (const [status, pm, slip, confirmed] of CASES) {
      const b = getPaymentBadge(status, pm, slip, confirmed)
      if (!b) continue
      const ok =
        b.tone === 'neutral' ? b.cls.includes('default') : b.cls.includes(b.tone)
      expect(ok, `${status}/${pm}/${slip}/${confirmed} → cls="${b.cls}" tone="${b.tone}"`).toBe(true)
    }
  })
})
