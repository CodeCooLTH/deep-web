// reviewer-display.test.ts — ล็อกกฎ "ห้ามหลุด PII ของผู้รีวิวออกหน้าสาธารณะ"
//
// หน้าโปรไฟล์ร้านเปิดได้โดยไม่ต้องล็อกอิน ค่าที่ฟังก์ชันนี้คืนจะถูก serialize ลง flight payload
// ให้ทุกคนอ่านได้จาก view-source — ถ้าหลุดค่าดิบออกไปแม้แต่เคสเดียว ก็คือเปิดเผยเบอร์/อีเมล
// ของลูกค้าจริงต่อสาธารณะ และ **ไม่มี gate ไหนของโปรเจกต์จับได้** เพราะสตริงที่หลุดก็ยังเป็น
// สตริงที่ถูกต้องตามชนิดทุกประการ
//
// [blocker] แดงเมื่อไหร่ห้าม merge

import { describe, expect, it } from 'vitest'

import { maskedReviewerName } from '../reviewer-display'

describe('maskedReviewerName', () => {
  it('[blocker] ห้ามคืนเบอร์เต็มไม่ว่ากรณีใด', () => {
    const out = maskedReviewerName(null, '0812345678')
    expect(out).not.toContain('2345')
    expect(out).toBe('081-xxx-5678')
  })

  it('[blocker] ห้ามคืนอีเมลเต็ม', () => {
    const out = maskedReviewerName(null, 'somchai@gmail.com')
    expect(out).not.toContain('somchai')
    expect(out).toBe('so•••••@gmail.com')
  })

  it('[blocker] ชื่อจริงต้องเหลือแค่ตัวแรกของแต่ละคำ', () => {
    expect(maskedReviewerName('สมชาย ใจดี', null)).toBe('ส•••• ใ•••')
    expect(maskedReviewerName('John Smith', null)).toBe('J••• S••••')
  })

  it('[blocker] รูปแบบที่ไม่รู้จัก → "ผู้ซื้อ" ไม่ใช่คืนค่าดิบ', () => {
    // รูปแบบที่เราไม่รู้จักแปลว่าไม่รู้ว่าส่วนไหนอ่อนไหว — เดาแล้วโชว์บางส่วนอันตรายกว่าไม่โชว์
    expect(maskedReviewerName(null, 'LINE:@somchai_shop')).toBe('ผู้ซื้อ')
    expect(maskedReviewerName(null, '+66812345678')).toBe('ผู้ซื้อ')
  })

  it('ไม่มีข้อมูลเลย → "ผู้ซื้อ"', () => {
    expect(maskedReviewerName(null, null)).toBe('ผู้ซื้อ')
    expect(maskedReviewerName('   ', '  ')).toBe('ผู้ซื้อ')
  })

  it('ชื่อมาก่อนเบอร์เสมอ', () => {
    expect(maskedReviewerName('สมชาย', '0812345678')).toBe('ส••••')
  })
})
