import { describe, expect, it } from 'vitest'
import { parseGroupCommand } from '../commands'

describe('parseGroupCommand (AC-22-6)', () => {
  it.each([
    ['สรุปวันนี้', { type: 'TODAY' }],
    ['  สรุปวันนี้  ', { type: 'TODAY' }],
    ['สรุปวันนี้\u3000', { type: 'TODAY' }], // ช่องว่าง ideographic หัวท้าย → NFKC + trim
    ['สรุปวันนี้\n', { type: 'TODAY' }],
    ['สรุปเดือนนี้', { type: 'MONTH' }],
    ['ผูก ABCD-2345', { type: 'BIND', code: 'ABCD2345' }],
    ['ผูก ABCD2345', { type: 'BIND', code: 'ABCD2345' }],
    ['ผูกABCD-2345', { type: 'BIND', code: 'ABCD2345' }],
    ['  ผูก   abcd-2345 ', { type: 'BIND', code: 'ABCD2345' }], // ตัวพิมพ์เล็ก
    ['ผูก ＡＢＣＤ－２３４５', { type: 'BIND', code: 'ABCD2345' }], // เต็มความกว้าง (NFKC)
    ['ผูก OIL0-1234', { type: 'BIND', code: '01101234' }], // O→0, I/L→1
    ['ผูก 00000000', { type: 'BIND', code: '00000000' }],
  ])('%j → คำสั่ง', (input, out) => expect(parseGroupCommand(input)).toEqual(out))

  it.each([
    'สรุปวันนี้ครับ',
    'ช่วยสรุปวันนี้หน่อย',
    'สรุปวันนี้ สรุปเดือนนี้',
    'สรุป',
    'สรุป  วันนี้', // ช่องว่างกลางคำ ≠ คำสั่ง (ยุบเหลือ 1 ช่อง แต่ไม่ลบ)
    'วันนี้',
    '',
    '   ',
    'ผูก',
    'ผูก 12345',
    'ผูก 482913', // โค้ด 6 หลักแบบเก่า
    'ผูก ABCD-23456',
    'ผูก ABC-D2345', // ขีดผิดตำแหน่ง
    'ผูก AB-CD-2345', // ขีดมากกว่า 1
    'ผูก ABCD 2345', // ช่องว่างในโค้ด
    'ผูก ABCU-2345', // U ไม่อยู่ในชุด
    'ผูก ABCD-23!5',
    'ผูกกลุ่ม ABCD-2345',
    'ผูก ABCD-2345 ครับ',
    'bind ABCD-2345',
  ])('%j → null', (input) => expect(parseGroupCommand(input)).toBeNull())
})
