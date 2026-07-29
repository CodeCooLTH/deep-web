import { describe, it, expect } from 'vitest'
import { normalizeMessage } from '@/lib/auto-reply-normalize'

// feature 00023 — TestCase.md กลุ่ม A (TC-NORM-01..07; TC-NORM-08 เป็น integration ผ่าน pipeline
// จริงไม่ใช่ unit ของฟังก์ชันนี้ ข้ามที่นี่)

describe('normalizeMessage', () => {
  it('TC-NORM-01: ตัดช่องว่างหัวท้ายและยุบช่องว่างซ้ำ (รวม tab/newline)', () => {
    expect(normalizeMessage('   สนใจ    ครับ   ')).toBe('สนใจ ครับ')
    expect(normalizeMessage('สนใจ\t\tครับ')).toBe('สนใจ ครับ')
    expect(normalizeMessage('สนใจ\n\nครับ')).toBe('สนใจ ครับ')
  })

  it('TC-NORM-02: ไม่แยกตัวพิมพ์เล็ก/ใหญ่ของภาษาอังกฤษ', () => {
    expect(normalizeMessage('COD')).toBe('cod')
    expect(normalizeMessage('cod')).toBe('cod')
    expect(normalizeMessage('Cod')).toBe('cod')
    expect(normalizeMessage('cOd')).toBe('cod')
    expect(normalizeMessage('มี COD ไหม')).toContain('cod')
  })

  it('TC-NORM-03: ตัดวรรคตอน/เครื่องหมายท้ายประโยค แต่ไม่ตัดอักขระไทย', () => {
    expect(normalizeMessage('สนใจ!!')).toBe('สนใจ')
    expect(normalizeMessage('สนใจ!!!')).toBe('สนใจ')
    expect(normalizeMessage('ราคา???')).toBe('ราคา')
    expect(normalizeMessage('สนใจ...')).toBe('สนใจ')
    expect(normalizeMessage('สนใจ ๆ')).toBe('สนใจ')
    expect(normalizeMessage('สนใจ~')).toBe('สนใจ')
  })

  it('TC-NORM-04: Unicode NFC/NFD ที่ประกอบอักขระต่างกันต้องเทียบกันได้', () => {
    const nfc = 'ค่ะ'.normalize('NFC')
    const nfd = 'ค่ะ'.normalize('NFD')
    const outNfc = normalizeMessage(nfc)
    const outNfd = normalizeMessage(nfd)
    expect(outNfc).toBe(outNfd)
    expect(outNfc).toBe(outNfc.normalize('NFC'))
  })

  const interestVariants = [
    'สนใจ',
    'สนใจครับ',
    'สนใจค่ะ',
    'สนใจคับ',
    'สนใจจ้า',
    'สนใจ!!',
    '  สนใจ   ครับ  ',
    'สนใจCRAB',
  ]

  it.each(interestVariants)(
    'TC-NORM-05 [BLOCKER]: ชุดคำ "สนใจ" ทุกรูปแบบต้อง CONTAINS ผ่าน: %s',
    (input) => {
      expect(normalizeMessage(input)).toContain('สนใจ')
    }
  )

  it('TC-NORM-06: normalize ต้อง idempotent — normalizeMessage(normalizeMessage(x)) === normalizeMessage(x)', () => {
    for (const c of interestVariants) {
      const once = normalizeMessage(c)
      expect(normalizeMessage(once)).toBe(once)
    }
  })

  it('TC-NORM-07: คำที่มีช่องว่างภายในต้องยังตรง แต่ระบบไม่ตัดช่องว่างทิ้งทั้งหมด', () => {
    expect(normalizeMessage('ส่ง  ฟรี   ไหม')).toBe('ส่ง ฟรี ไหม')
    expect(normalizeMessage('ร้านนี้ส่ง ฟรี ไหมครับ')).toContain('ส่ง ฟรี ไหม')
    expect(normalizeMessage('ส่งฟรีไหม')).not.toContain('ส่ง ฟรี ไหม')
  })

  // เคสเพิ่มเติมจากตารางตัวอย่าง TFR-007 ที่ TestCase.md กลุ่ม A ไม่ได้แยกเป็นเคสของตัวเอง
  it('AC-010-01: รวมชนิดช่องว่าง NBSP/ZWSP เป็นช่องว่างปกติตัวเดียว', () => {
    expect(normalizeMessage('สนใจ ครับ')).toBe('สนใจ ครับ') // NBSP
    expect(normalizeMessage('สนใจ​ค่ะ')).toBe('สนใจ ค่ะ') // ZWSP
  })

  it('AC-010-03: ลบ emoji ทิ้ง', () => {
    expect(normalizeMessage('สนใจครับ\u{1F60D}\u{1F60D}')).toBe('สนใจครับ')
  })

  it('AC-010-03: ตัวคั่นคำภาษาอังกฤษแทนด้วยช่องว่าง (cash-on-delivery)', () => {
    expect(normalizeMessage('cash-on-delivery')).toBe('cash on delivery')
  })

  it('รับค่าว่าง: null/undefined -> สตริงว่าง', () => {
    expect(normalizeMessage(null)).toBe('')
    expect(normalizeMessage(undefined)).toBe('')
  })

  it('TFR-008 edge: สตริงที่มีแต่วรรคตอน -> สตริงว่าง (ไม่เข้าสู่ matcher)', () => {
    expect(normalizeMessage('!!!')).toBe('')
  })
})
