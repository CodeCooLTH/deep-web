import { describe, expect, it } from 'vitest'
import { normalizeParts, partsToText, textToParts } from '../editor-text'

describe('[blocker] editor-text round-trip (TC-180)', () => {
  const CASES: Record<string, string> = {
    ไทยวรรณยุกต์ซ้อน: 'สวัสดีค่ะ คุณ{ชื่อลูกค้า} ก้ำ ผู้ชี้ นี้ เกี๊ยว ๆ',
    อีโมจิ: 'ขอบคุณค่ะ 😀👨‍👩‍👧 {ชื่อร้าน} 🙏',
    ขึ้นบรรทัดใหม่: 'บรรทัด 1\nบรรทัด 2\n\n{ลิงก์คำสั่งซื้อ}\n',
    ตัวแปรติดกัน: '{ชื่อร้าน}{ชื่อลูกค้า}{เลขคำสั่งซื้อ}',
    ตัวแปรเดี่ยว: '{ยอดสุทธิ}',
    วงเล็บไม่ครบ: 'a { b } c {',
    วงเล็บซ้อน: '{{ชื่อ}}',
    ว่าง: '',
  }
  it.each(Object.entries(CASES))('%s เท่าเดิมทุกอักษร', (_n, s) => {
    expect(partsToText(textToParts(s))).toBe(s)
  })

  it('ตัวแปรติดกันได้ชิ้นส่วนตามลำดับ (ไม่สลับ)', () => {
    expect(textToParts('ก{ข}{ค}ง')).toEqual([
      { type: 'text', text: 'ก' },
      { type: 'var', name: 'ข' },
      { type: 'var', name: 'ค' },
      { type: 'text', text: 'ง' },
    ])
  })

  it('normalizeParts รวมข้อความติดกัน ทิ้งว่าง', () => {
    expect(
      normalizeParts([
        { type: 'text', text: 'a' },
        { type: 'text', text: '' },
        { type: 'text', text: 'b' },
        { type: 'var', name: 'x' },
      ]),
    ).toEqual([
      { type: 'text', text: 'ab' },
      { type: 'var', name: 'x' },
    ])
  })
})
