/**
 * เทส SSOT ของ chip แนะนำเบอร์ (feat 00014 ext 2026-08-21)
 *
 * 🛑 [blocker] — แดงเมื่อไหร่ห้าม merge
 *
 * สัญญาข้อเดียวที่ถ้าหลุดแล้วฟีเจอร์นี้กลายเป็นตัวสร้างความเสียหายแทน:
 *   **เบอร์ที่ chip เสนอ ต้องผ่านด่านบันทึกได้เสมอ**
 *   (chip เสนออะไรที่กดแล้วเด้ง = ระบบโกหกร้านต่อหน้า)
 *
 * 🛑 เทสชุดแรกจึงป้อน output ของ chip เข้า **`CreateOrderSchema` ตัวจริง** ไม่ใช่ regex
 * ที่เทสเขียนขึ้นเอง — ไม่งั้นเป็น tautology (เทสยืนยันแค่ว่า "โค้ดทำตามที่คนเขียนเทสคิด"
 * ไม่ใช่ว่า "คนเขียนคิดถูก") ซึ่งเป็นกับดักที่โปรเจกต์นี้เจอมาแล้วหลายรอบ
 */

import { describe, it, expect } from 'vitest'
import * as v from 'valibot'
import { suggestThaiMobile, firstThaiMobile, MOBILE_PHONE_RE, normalizePhone } from './phone'
import { CreateOrderSchema } from './validations'

/** payload ออเดอร์ที่ถูกต้องขั้นต่ำ — เปลี่ยนเฉพาะ buyerContact เพื่อทดสอบด่านจริง */
const orderWith = (buyerContact: string) => ({
  items: [{ name: 'สินค้า', qty: 1, price: 100 }],
  type: 'PHYSICAL',
  buyerContact,
})

const savesOk = (phone: string) => v.safeParse(CreateOrderSchema, orderWith(phone)).success

describe('[blocker] เบอร์ที่ chip เสนอ ต้องบันทึกผ่านด่านจริงเสมอ', () => {
  // ข้อความที่ลูกค้าส่งมาจริงจากหน้างาน + ก้อนปนเปื้อนที่ต้องไม่หลุด
  const inputs = [
    '0 8 6 5 3 5 2960', // ← เคสจากภาพหน้าจอที่ user รายงาน
    '092-0791649',
    '(+66)920791649',
    '0_9_2_0791649',
    '092 0791649',
    'โทร0920791649',
    '66920791649',
    '+66 92 079 1649',
    'สมชาย ใจดี\n99/9 ม.5 ต.บางรัก จ.ชลบุรี 20000 โทร 0812345678',
    'โทร 0612929865/ 0843642147',
    '0920791649 25',
    '09207916',
    '09207916499',
    '0212345678',
    'สมชาย',
    '',
    '0865352960865352960',
    // 🛑 3 บรรทัดนี้มีไว้ให้ mutation จับได้ — ถ้าใครผ่อนเกณฑ์ของ chip ให้รับ 9 หลัก
    // (หรือรับ prefix นอก 06/08/09) อินพุตพวกนี้จะผลิต suggestion ที่บันทึกไม่ผ่านทันที
    // ก่อนมีบรรทัดพวกนี้ เทสทั้งไฟล์เขียวแม้ผ่อนเกณฑ์ เพราะไม่มีอินพุตไหนผลิต 9 หลักได้เลย
    '092079164',
    '0920791649 092079164',
    '021234567',
  ]

  it.each(inputs)('ทุก suggestion ของ %j ผ่าน CreateOrderSchema', (input) => {
    for (const s of suggestThaiMobile(input).suggestions) {
      expect(savesOk(s), `chip เสนอ "${s}" จาก "${input}" แต่บันทึกไม่ผ่าน`).toBe(true)
    }
  })

  it('ด่านจริงปฏิเสธเบอร์ที่ chip ไม่มีวันเสนอ (กัน schema หลุดกลับไปหลวม)', () => {
    expect(savesOk('0212345678')).toBe(false) // 10 หลักแต่ไม่ใช่มือถือ
    expect(savesOk('0712345678')).toBe(false)
    expect(savesOk('092079164')).toBe(false) // 9 หลัก
    expect(savesOk('09207916499')).toBe(false) // 11 หลัก
    expect(savesOk('092 0791649')).toBe(false) // มีช่องว่าง
  })
})

describe('5 รูปแบบจริงจากหน้างาน (user รายงาน 2026-08-21)', () => {
  it.each([
    ['092-0791649', '0920791649'],
    ['(+66)920791649', '0920791649'],
    ['0_9_2_0791649', '0920791649'],
    ['092 0791649', '0920791649'],
    ['โทร0920791649', '0920791649'],
  ])('%s → %s', (input, expected) => {
    expect(suggestThaiMobile(input).suggestions).toEqual([expected])
  })

  it('เคสจากภาพหน้าจอ — เว้นวรรคทีละหลัก', () => {
    expect(suggestThaiMobile('0 8 6 5 3 5 2960').suggestions).toEqual(['0865352960'])
  })
})

describe('ห้ามเลื่อนหน้าต่าง — ต้อง "ทั้งก้อนพอดีเป๊ะ" เท่านั้น', () => {
  it('ก้อนยาวเกินไม่เสนออะไรเลย (ไม่ใช่เสนอ 10 ตัวเลื่อนทีละหลัก)', () => {
    const r = suggestThaiMobile('0865352960865352960')
    expect(r.suggestions).toEqual([])
    expect(r.reason).toBe('too-long')
  })

  it('ขาดหรือเกินแม้หลักเดียว = ไม่เสนอ', () => {
    expect(suggestThaiMobile('09207916').suggestions).toEqual([])
    expect(suggestThaiMobile('09207916499').suggestions).toEqual([])
  })
})

describe('ช่องว่างเป็นได้ทั้งตัวคั่นในเบอร์ และตัวคั่นระหว่างเบอร์กับเลขอื่น', () => {
  it('รวมทั้งก้อน — 092 0791649', () => {
    expect(suggestThaiMobile('092 0791649').suggestions).toEqual(['0920791649'])
  })

  it('แยกก้อนย่อย — 0920791649 25 (เลขข้างหลังไม่ใช่ส่วนของเบอร์)', () => {
    expect(suggestThaiMobile('0920791649 25').suggestions).toEqual(['0920791649'])
  })
})

describe('เสนอได้หลายตัว (สูงสุด 3) — ห้ามเลือกตัวแรกให้เอง', () => {
  it('2 เบอร์คั่นด้วย /', () => {
    expect(suggestThaiMobile('โทร 0612929865/ 0843642147').suggestions).toEqual([
      '0612929865',
      '0843642147',
    ])
  })

  it('เกิน 3 ตัดที่ 3', () => {
    const r = suggestThaiMobile('0611111111/0822222222/0933333333/0644444444')
    expect(r.suggestions).toHaveLength(3)
  })

  it('เบอร์ซ้ำนับครั้งเดียว', () => {
    expect(suggestThaiMobile('0920791649 / 092-079-1649').suggestions).toEqual(['0920791649'])
  })
})

describe('ก้อนที่อยู่ต้องไม่กลายเป็นเบอร์', () => {
  it('บ้านเลขที่ / หมู่ / รหัสไปรษณีย์ ไม่ถูกเสนอ', () => {
    const r = suggestThaiMobile(
      'สมชาย ใจดี\n99/9 ซอยสุขุมวิท 24 แขวงคลองตัน เขตคลองเตย กรุงเทพ 10110',
    )
    expect(r.suggestions).toEqual([])
  })

  it('ที่อยู่ + เบอร์ปนกัน เสนอเฉพาะเบอร์', () => {
    const r = suggestThaiMobile(
      'ชื่อผู้รับ: จักรสิน\nที่อยู่: 233ม.13ต.โพนงามอ.หนองหานจ.อุดรธานี41130\nเบอร์โทร: 0988480695',
    )
    expect(r.suggestions).toEqual(['0988480695'])
  })
})

describe('reason — ข้อความเตือนต้องบอกสาเหตุที่ถูก (ทางแก้คนละอย่าง)', () => {
  it('ไม่มีเลขเลย = พิมพ์ชื่อคน → เงียบสนิท', () => {
    expect(suggestThaiMobile('สมชาย')).toEqual({
      suggestions: [],
      reason: 'no-digits',
      digitCount: 0,
    })
    expect(suggestThaiMobile('').reason).toBe('no-digits')
  })

  it('10 หลักแต่ไม่ใช่มือถือ → not-mobile (ไม่ใช่ too-short/too-long)', () => {
    const r = suggestThaiMobile('021234567 8')
    expect(r.reason).toBe('not-mobile')
    expect(r.digitCount).toBe(10)
  })

  it('หลักไม่พอ → too-short พร้อมจำนวนหลัก', () => {
    expect(suggestThaiMobile('09207916')).toMatchObject({ reason: 'too-short', digitCount: 8 })
  })

  it('หลักเกิน → too-long พร้อมจำนวนหลัก', () => {
    expect(suggestThaiMobile('09207916499')).toMatchObject({ reason: 'too-long', digitCount: 11 })
  })
})

describe('firstThaiMobile — สำหรับผู้เรียกที่เติมค่าให้เลยโดยไม่ถาม', () => {
  it('คืนตัวแรกที่เจอ', () => {
    expect(firstThaiMobile('โทร 0612929865/ 0843642147')).toBe('0612929865')
  })

  it('ไม่เจอ → null', () => {
    expect(firstThaiMobile('สมชาย ใจดี')).toBeNull()
  })

  it('รับรูปแบบที่ regex เดิมของ parse-order-message มองไม่เห็น', () => {
    expect(firstThaiMobile('0_9_2_0791649')).toBe('0920791649')
    expect(firstThaiMobile('(+66)920791649')).toBe('0920791649')
  })
})

describe('[blocker] normalizePhone ต้องคงเกณฑ์หลวมไว้ — ห้ามบีบตามด่านขาเข้า', () => {
  /**
   * 🛑 บน prod มี 13 ออเดอร์ที่ buyerContact เป็น 00000000xx (ข้อมูลเดโมของทีมรีวิว
   * Meta/Apple) — normalizePhone ถูกใช้ที่ order-access.service.ts เพื่อตัดสินว่า
   * "ผู้ซื้อเปิดออเดอร์ตัวเองได้ไหม" ถ้าบีบให้เท่า MOBILE_PHONE_RE จอฝั่งผู้ซื้อของ
   * ใบพวกนั้นจะเปลี่ยนพฤติกรรมย้อนหลังทันทีโดยไม่มีใครขอ (Hard Rule 16 / ext 2026-08-21)
   */
  it('ยังรับเบอร์เก่าที่ด่านขาเข้าปฏิเสธแล้ว', () => {
    expect(normalizePhone('0000000000')).toBe('0000000000')
    expect(normalizePhone('0212345678')).toBe('0212345678')
    expect(MOBILE_PHONE_RE.test('0000000000')).toBe(false)
    expect(MOBILE_PHONE_RE.test('0212345678')).toBe(false)
  })

  it('สองเกณฑ์ต้องไม่เท่ากัน (ถ้าเท่ากันเมื่อไหร่ = มีคนไปบีบตัวที่ห้ามบีบ)', () => {
    const loose = ['0000000000', '0112345678', '0212345678', '0712345678']
    expect(loose.every((p) => normalizePhone(p) !== null)).toBe(true)
    expect(loose.some((p) => MOBILE_PHONE_RE.test(p))).toBe(false)
  })
})
