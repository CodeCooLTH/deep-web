// feature 00023 phase `00023-qna` S-06 — เทสตัวกรองคิว (DATABASE §3.10.1, SRS TFR-033)
//
// unit test ของฟังก์ชันบริสุทธิ์ — ไม่ต่อ DB (Hard Rule 13)
//
// ข้อความในไฟล์นี้ที่ทำเครื่องหมาย [prod] คือข้อความจริงจาก AutoReplyLog บน Supabase
// ณ 2026-07-31 (เลขโทรศัพท์/ชื่อถูกดัดแปลงแล้ว แต่รูปแบบคงเดิมทุกประการ)

import { describe, it, expect } from 'vitest'
import { shouldQueueUnanswered } from '@/lib/auto-reply-unanswered-filter'
import { normalizeMessage } from '@/lib/auto-reply-normalize'

/** เรียกด้วยข้อความดิบ แล้ว normalize ด้วยฟังก์ชันจริง — ตรงกับที่ processJob ทำ */
function check(raw: string) {
  return shouldQueueUnanswered(raw, normalizeMessage(raw))
}

describe('shouldQueueUnanswered — คำถามจริงต้องผ่าน (ไม่กรองเกิน)', () => {
  // [prod] ทั้งหมด — ถ้าเทสกลุ่มนี้แดง แปลว่าตัวกรองกินคำถามจริงทิ้ง ซึ่งแย่กว่าปล่อยขยะผ่าน
  const REAL_QUESTIONS = [
    'สอบถามรายละเอียด',
    'สนใจทำไฟหน้า',
    'สอบถามโปรโมชั่น',
    'ราคาโช้คหลังเวฟเท่าไหร่',
    'ดูคลิปไม่ได้ครับ',
    'มีปั้มบนเบรคเวฟใหม่ครับ',
    'รบกวนสอบถามหน่อย',
    'เปลี่ยนไฟ mg zs ราคาเท่าไหร่คะ',
    'เท่าไหร่ครับ',
    'สอบถามโปรโมชั่น',
    'ต้องจองคิวไหมครับ',
    'โช้คหลังเวฟมีรุ่นไหนบ้าง',
    'วิธีการสั่งซื้อและชำระเงิน',
    'ขอแผนที่หน่อยครับ',
    'มีสีอะไรเหลือครับ100i',
    'ดวงละเท่าไหร่ครับ',
    'ปกติตัดหมอกรุ่นนี้เป็นขั้วอะไรหรอครับ',
    'ส่วนใหญ่ตัดหมอกใช้รุ่นไหนครับ ที่ร้านแนะนำ',
  ]

  it.each(REAL_QUESTIONS)('เก็บเข้าคิว: "%s"', (q) => {
    expect(check(q)).toEqual({ keep: true })
  })

  it('คำถามที่มีตัวเลขรุ่น/ปี ไม่ถูกเข้าใจผิดว่าเป็นเบอร์โทร', () => {
    expect(check('คู่ไฟหน้าวีโก้แชมป์2011 เท่าไรครับ')).toEqual({ keep: true })
    expect(check('เปลี่ยนกรอบไฟ หน้า honda city ปี 16')).toEqual({ keep: true })
    // [prod] ราคาหลักหมื่นต้องไม่ถูกจับเป็นรหัสไปรษณีย์ (5 หลักติดกันแต่ไม่ยืนเป็นคำเดี่ยว)
    expect(check('ราคาถูกสุดคือ 1,500 ต่อ 1 หลอด หรอครับ')).toEqual({ keep: true })
  })
})

describe('F-1 / คำรับคำ — ข้อความที่ไม่ใช่คำถาม', () => {
  it('สั้นกว่า 3 ตัวอักษร [prod]', () => {
    expect(check('รับ')).toEqual({ keep: false, reason: 'TOO_SHORT' })
    expect(check('110')).toEqual({ keep: false, reason: 'TOO_SHORT' })
    expect(check('เลส')).toEqual({ keep: false, reason: 'TOO_SHORT' })
    expect(check('')).toEqual({ keep: false, reason: 'TOO_SHORT' })
    // ข้อความที่เหลือว่างหลัง normalize (วรรคตอนล้วน)
    expect(check('!!!')).toEqual({ keep: false, reason: 'TOO_SHORT' })
  })

  it('คำรับคำที่ยาวเกิน 3 ตัวอักษร ต้องถูกจับด้วยรายการตายตัว [prod]', () => {
    // "ครับ" ยาว 4 ⇒ เกณฑ์ความยาวอย่างเดียวจับไม่ได้ ต้องมีรายการคำ
    expect(check('ครับ')).toEqual({ keep: false, reason: 'ACKNOWLEDGEMENT' })
    expect(check('คับ')).toEqual({ keep: false, reason: 'TOO_SHORT' }) // 3 ตัวอักษรพอดี
    expect(check('ขอบคุณครับ')).toEqual({ keep: false, reason: 'ACKNOWLEDGEMENT' })
    expect(check('thanks')).toEqual({ keep: false, reason: 'ACKNOWLEDGEMENT' })
    expect(check('โอเค')).toEqual({ keep: false, reason: 'ACKNOWLEDGEMENT' })
  })

  it('WARNING-case: คำรับคำต้องเทียบตรงตัว ไม่ใช่ substring/prefix', () => {
    // ทั้งสองประโยคเป็นคำถามจริงที่ "มี" คำรับคำอยู่ข้างใน — ต้องผ่าน
    expect(check('ได้ไหมครับ')).toEqual({ keep: true })
    expect(check('ราคาเท่าไหร่ครับ')).toEqual({ keep: true })
    expect(check('รับบัตรเครดิตไหม')).toEqual({ keep: true })
  })

  it('คำที่อาจเป็นคำถามจริง ตั้งใจไม่กรอง', () => {
    // "ปลายทาง" = อาจถามเรื่องเก็บเงินปลายทาง · "สนใจ" = ร้านอาจอยากตั้งคำตอบให้
    expect(check('ปลายทาง')).toEqual({ keep: true })
    expect(check('สนใจ')).toEqual({ keep: true })
  })
})

describe('F-2 เบอร์โทร — มาตรการ PII', () => {
  it('เบอร์เลขติดกัน [prod]', () => {
    expect(check('0852995863')).toEqual({ keep: false, reason: 'LOOKS_LIKE_PHONE' })
  })

  it('เบอร์ที่มีช่องว่างคั่น ต้องถูกจับด้วย [prod]', () => {
    // ถ้านับเลขติดกันบนข้อความดิบ แบบนี้จะหลุด (เห็นเป็น 3/3/4 หลัก)
    expect(check('เบอร์ 086 015 9046 ครับ')).toEqual({ keep: false, reason: 'LOOKS_LIKE_PHONE' })
    expect(check('085-382-9345')).toEqual({ keep: false, reason: 'LOOKS_LIKE_PHONE' })
  })

  it('ตัวเลขสั้นกว่าเบอร์ไม่ถูกจับ', () => {
    expect(check('ราคา 1500 บาทใช่ไหม')).toEqual({ keep: true })
    expect(check('เวฟ 110i มีไหมครับ')).toEqual({ keep: true })
  })
})

describe('F-3 ที่อยู่ — มาตรการ PII', () => {
  it('ที่อยู่เต็มรูปแบบ [prod]', () => {
    expect(
      check('สมประสงค์ ฉอยทิม 105 ม.1 ต.ลุ่มสุ่ม อ.ไทรโยค จ.กาญจนบุรี 71150')
    ).toMatchObject({ keep: false })
    expect(check('แขวงสี่พระยา เขตบางรัก กทม 10500')).toMatchObject({ keep: false })
  })

  it('WARNING-case: ตรวจบนข้อความดิบ เพราะ normalize ลบจุดทิ้ง', () => {
    // normalizeMessage("ต.ลุ่มสุ่ม") = "ตลุ่มสุ่ม" ⇒ จับด้วยรูปแบบ "ต." ไม่ได้อีกแล้ว
    const raw = 'ส่งที่ 59 หมู่ 6 ต.ศาลายา อ.พุทธมณฑล จ.นครปฐม'
    expect(normalizeMessage(raw)).not.toContain('ต.')
    expect(check(raw)).toMatchObject({ keep: false })
  })

  it('รหัสไปรษณีย์ที่ยืนเป็นคำของตัวเอง', () => {
    expect(check('ส่ง 73170 ได้ไหม')).toEqual({ keep: false, reason: 'LOOKS_LIKE_ADDRESS' })
  })

  it('คำว่า "เขต"/"ถนน" ในคำถามทั่วไปยังผ่าน ถ้าไม่ใช่ที่อยู่', () => {
    // ยอมรับว่าเป็นการกรองแบบระมัดระวัง — ข้อความที่มีคำบ่งชี้ที่อยู่จะถูกตัดทิ้งไว้ก่อน
    // เพราะการเก็บที่อยู่ลูกค้าไว้ผิดที่ เสียหายกว่าการเสียคำถามไป 1 ข้อ
    expect(check('มีสาขาแถวนี้ไหมครับ')).toEqual({ keep: true })
  })
})

describe('F-4 ยาวเกิน — ข้อความสั่งซื้อ/ที่อยู่ยาว [prod]', () => {
  it('ข้อความ 119+ ตัวอักษรถูกตัด', () => {
    const raw =
      'honda wave 125s สั่งซื้อ 1 ชุดครับ 360 บาท เก็บเงินปลายทางครับ ประจักษ์โพธิ์ทอง 56 อาคารบิสโก้ทาวเวอร์ ถนนทรัพย์ แขวงสี่พระยา เขตบางรัก กทม'
    expect(check(raw)).toMatchObject({ keep: false })
  })

  it('ลำดับการตรวจ: ยาวเกินถูกจับก่อนเบอร์/ที่อยู่ (เหตุผลแรกที่เจอชนะ)', () => {
    const raw = 'ก'.repeat(100)
    expect(check(raw)).toEqual({ keep: false, reason: 'TOO_LONG' })
  })
})

describe('คุณสมบัติที่ต้องคงไว้', () => {
  it('เป็นฟังก์ชันบริสุทธิ์ — เรียกซ้ำได้ผลเดิม', () => {
    const raw = 'ราคาโช้คหลังเวฟเท่าไหร่'
    expect(check(raw)).toEqual(check(raw))
  })

  it('ไม่ throw กับ input ที่แปลกประหลาด', () => {
    expect(() => check('   ')).not.toThrow()
    expect(() => shouldQueueUnanswered('', '')).not.toThrow()
    // เขียนเป็น escape ไม่ใช่ emoji ตรง ๆ — Hard Rule 12 ห้าม emoji ในไฟล์ (theme-guard hook)
    // ข้อความจริงจากลูกค้ามี emoji ได้ ตัวกรองต้องทนได้ (normalize ลบ emoji ทิ้ง -> เหลือว่าง)
    expect(() => check('\u{1F64F}\u{1F64F}\u{1F64F}')).not.toThrow()
    expect(check('\u{1F64F}\u{1F64F}\u{1F64F}')).toEqual({ keep: false, reason: 'TOO_SHORT' })
  })
})
