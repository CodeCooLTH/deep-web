import { describe, expect, it } from 'vitest'
import { insertAtSelection, singleLine, wrapSelection } from '../markup-edit'
import { parseMarkup } from '@/lib/line-report/template'

describe('insertAtSelection', () => {
  it('แทรกที่เคอร์เซอร์ + เคอร์เซอร์อยู่หลังป้าย', () => {
    expect(insertAtSelection('สรุป วันนี้', 5, 5, '{ยอดขาย (นับแล้ว)}')).toEqual({
      text: 'สรุป {ยอดขาย (นับแล้ว)}วันนี้', selStart: 5 + '{ยอดขาย (นับแล้ว)}'.length, selEnd: 5 + '{ยอดขาย (นับแล้ว)}'.length,
    })
  })
  it('มีช่วงเลือก = แทนที่ช่วงนั้น · ช่วงกลับด้านก็ได้ · เกินความยาวถูกตัดเข้าช่วง', () => {
    expect(insertAtSelection('abcdef', 4, 1, 'X').text).toBe('aXef')
    expect(insertAtSelection('abc', 99, 99, 'X').text).toBe('abcX')
    expect(insertAtSelection('abc', -5, -1, 'X').text).toBe('Xabc')
  })
  it('ผลที่ได้ parse ผ่านเมื่อป้ายถูก', () => {
    expect(parseMarkup(insertAtSelection('', 0, 0, '{ชื่อร้าน}').text).ok).toBe(true)
  })
})

describe('wrapSelection', () => {
  it('ไม่ได้เลือก = null', () => {
    expect(wrapSelection('abc', 1, 1, '**')).toBeNull()
  })
  it('ห่อคำที่เลือก คงช่วงเลือกไว้ที่คำเดิม', () => {
    expect(wrapSelection('ยอดดีมาก', 3, 8, '**')).toEqual({ text: 'ยอด**ดีมาก**', selStart: 5, selEnd: 10 })
    expect(wrapSelection('abc def', 4, 7, '^^')).toEqual({ text: 'abc ^^def^^', selStart: 6, selEnd: 9 })
  })
  it('ผลที่ได้ parse เป็น run ตัวหนา/เน้น', () => {
    const r = wrapSelection('a b c', 2, 3, '**')!
    const p = parseMarkup(r.text)
    expect(p.ok && p.runs).toEqual([{ t: 'a ' }, { t: 'b', b: true }, { t: ' c' }])
  })
})

describe('singleLine', () => {
  it('บรรทัดใหม่ทุกแบบเป็นช่องว่าง (schema ปฏิเสธ \\n)', () => {
    expect(singleLine('a\nb\r\nc\rd')).toBe('a b c d')
  })
})
