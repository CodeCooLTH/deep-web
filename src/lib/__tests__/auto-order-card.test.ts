import { describe, it, expect } from 'vitest'

import {
  resolveAutoOrderCardState,
  autoOrderCardAccent,
  describeTotalMismatch,
  describeMissingAddressParts,
  sortCardReasons,
  CARD_REASON_ORDER,
} from '@/lib/auto-order-card'

/**
 * 00061 หน้า B — ตรรกะของการ์ดผลลัพธ์
 *
 * 🛑 ทุกข้อในนี้เป็นสิ่งที่ "เขียนกลับด้านแล้วยังคอมไพล์ผ่านและหน้าตายังดูปกติ" —
 * ต้องมีเทสจับ ไม่ใช่เทอร์นารีกลาง JSX (ui-boolean-needs-a-testable-home.md)
 */
describe('resolveAutoOrderCardState', () => {
  it('[blocker] ยังไม่มีแถว Order ผูก = กำลังอ่าน', () => {
    expect(resolveAutoOrderCardState({ order: null })).toBe('READING')
  })

  it('[blocker] PROCESSING_FAILED ต้องแยกจากร่างเชิงเนื้อหา', () => {
    // ใช้หน้าตาเดียวกันแล้วผู้ขายจะไปแก้เทมเพลตที่ถูกอยู่แล้ววนไปเรื่อย ๆ
    expect(
      resolveAutoOrderCardState({
        order: { status: 'DRAFTED', draftReasons: ['PROCESSING_FAILED'], isDryRun: false },
      }),
    ).toBe('SYSTEM_FAILED')
    expect(
      resolveAutoOrderCardState({
        order: { status: 'DRAFTED', draftReasons: ['NO_PHONE'], isDryRun: false },
      }),
    ).toBe('DRAFT')
  })

  it('[blocker] ร่างที่ถูกทิ้ง/หมดอายุต้องเป็น DISCARDED ไม่ใช่ DRAFT', () => {
    // ไม่มีสถานะนี้ = การ์ดจะโชว์ปุ่ม "แก้ไข/ทิ้งร่าง" ของสิ่งที่ไม่มีอยู่แล้ว
    expect(
      resolveAutoOrderCardState({ order: { status: 'CANCELLED', draftReasons: [], isDryRun: false } }),
    ).toBe('DISCARDED')
  })

  it('สถานะออเดอร์จริงทุกตัว = CREATED', () => {
    for (const status of ['PENDING', 'SHIPPED', 'CONFIRMED', 'RETURNED']) {
      expect(resolveAutoOrderCardState({ order: { status, draftReasons: [], isDryRun: false } })).toBe(
        'CREATED',
      )
    }
  })
})

describe('autoOrderCardAccent', () => {
  it('[blocker] CREATED = น้ำเงิน ไม่ใช่เขียว (Verified-Means-Green สงวนให้ "ผู้ซื้อยืนยันแล้ว")', () => {
    expect(autoOrderCardAccent('CREATED')).toContain('primary')
    expect(autoOrderCardAccent('CREATED')).not.toContain('success')
  })

  it('[blocker] SYSTEM_FAILED ใช้สีกลาง ไม่ใช่สีเตือน — ไม่ใช่ความผิดใคร', () => {
    expect(autoOrderCardAccent('SYSTEM_FAILED')).not.toContain('warning')
    expect(autoOrderCardAccent('DRAFT')).toContain('warning')
  })
})

describe('describeTotalMismatch', () => {
  it('[blocker] ส่วนต่างเป็นตัวเด่น ตัวเลขดิบเป็นตัวอ้างอิง (BR-ACO-17)', () => {
    const r = describeTotalMismatch(790, 840)
    expect(r.headline).toContain('ต่างกัน ฿50')
    expect(r.detail).toContain('790')
    expect(r.detail).toContain('840')
    // ตัวเลขดิบต้องไม่อยู่ในบรรทัดเด่น — ไม่งั้นสิ่งที่ต้องรู้ก่อนถูกกลบ
    expect(r.headline).not.toContain('790')
  })

  it('ส่วนต่างเป็นค่าสัมบูรณ์ — พิมพ์เกินหรือขาดก็อ่านว่า "ต่างกัน" เท่ากัน', () => {
    expect(describeTotalMismatch(900, 840).headline).toBe(describeTotalMismatch(780, 840).headline)
  })
})

describe('describeMissingAddressParts', () => {
  it('[blocker] ขาด 1 ส่วน = ระบุชื่อ · ขาด ≥2 = บอกจำนวน (งบพื้นที่ 32 ตัวอักษร/บรรทัด)', () => {
    expect(describeMissingAddressParts({ line1: 'x', province: 'y', postcode: null })).toBe(
      ' — ขาดรหัสไปรษณีย์',
    )
    expect(describeMissingAddressParts({ line1: 'x', province: null, postcode: null })).toBe(
      ' — ขาด 2 ส่วน',
    )
    expect(describeMissingAddressParts(null)).toBe(' — ขาด 3 ส่วน')
  })

  it('ครบแล้ว = ไม่มีคำต่อท้าย', () => {
    expect(describeMissingAddressParts({ line1: 'x', province: 'y', postcode: '10110' })).toBe('')
    // ช่องว่างล้วนไม่นับว่ามี
    expect(describeMissingAddressParts({ line1: '  ', province: 'y', postcode: '10110' })).toBe(
      ' — ขาดที่อยู่',
    )
  })
})

describe('sortCardReasons', () => {
  it('[blocker] วันที่ต้องอยู่ก่อนรายการสินค้า — ตรงลำดับช่องใน QuickForm', () => {
    // 🛑 ร่างแรกของ ux วางวันที่ไว้ท้ายสุดด้วยสมมติฐานที่ผิด ⇒ ผู้ขายไล่แก้จากบนลงล่างแล้ว
    // ข้ามช่องวันที่ไปโดยไม่รู้ตัว แล้วต้องเลื่อนย้อนกลับขึ้นไป
    expect(CARD_REASON_ORDER.indexOf('DATE_OUT_OF_WINDOW')).toBeLessThan(
      CARD_REASON_ORDER.indexOf('NO_ITEMS'),
    )
    expect(sortCardReasons(['TOTAL_MISMATCH', 'NO_ITEMS', 'DATE_OUT_OF_WINDOW', 'NO_PHONE'])).toEqual([
      'NO_PHONE',
      'DATE_OUT_OF_WINDOW',
      'NO_ITEMS',
      'TOTAL_MISMATCH',
    ])
  })

  it('ค่าที่ไม่รู้จักถูกตัดทิ้ง ไม่ทำให้ทั้งการ์ดพัง', () => {
    expect(sortCardReasons(['NO_PHONE', 'ค่าที่ไม่รู้จัก'])).toEqual(['NO_PHONE'])
  })
})
