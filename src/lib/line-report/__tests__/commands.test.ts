import { describe, expect, it } from 'vitest'
import { parseGroupCommand } from '../commands'

describe('parseGroupCommand (AC-22-6)', () => {
  it.each([
    ['สรุปวันนี้', { type: 'TODAY' }],
    ['  สรุปวันนี้  ', { type: 'TODAY' }],
    ['สรุปวันนี้\u3000', { type: 'TODAY' }], // ช่องว่าง ideographic หัวท้าย → NFKC + trim
    ['สรุปวันนี้\n', { type: 'TODAY' }],
    ['สรุปเดือนนี้', { type: 'MONTH' }],
    ['ผูก 482913', { type: 'BIND', code: '482913' }],
    ['ผูก482913', { type: 'BIND', code: '482913' }],
    ['  ผูก   482913 ', { type: 'BIND', code: '482913' }],
    ['ผูก ４８２９１３', { type: 'BIND', code: '482913' }], // เลขเต็มความกว้าง
    ['ผูก 000123', { type: 'BIND', code: '000123' }],
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
    'ผูก 1234567',
    'ผูก 12345a',
    'ผูก 123 456',
    'ผูกกลุ่ม 482913',
    'ผูก 482913 ครับ',
    'bind 482913',
  ])('%j → null', (input) => expect(parseGroupCommand(input)).toBeNull())
})
