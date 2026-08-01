import { describe, expect, it } from 'vitest'

/**
 * กันบั๊ก "โมเดลแปะ [[NO_ANSWER]] ท้ายคำตอบที่ใช้ได้" กลับมาอีก (เจอจริง 2026-08-01)
 *
 * ตรรกะเดียวกับ stripMarkers ใน ai-enhance.service.ts — คัดมาเป็นฟังก์ชันบริสุทธิ์เพราะ
 * ไฟล์นั้น import lib/gemini ซึ่งเป็น server-only จึงโหลดเข้าเทสตรง ๆ ไม่ได้
 * (ถ้าแก้ตรรกะที่ต้นทาง ต้องแก้ที่นี่ด้วย — เทสนี้คุมพฤติกรรม ไม่ใช่ implementation)
 */
const NO_ANSWER_TOKEN = 'NO_ANSWER'
const MIN_REAL_ANSWER_LEN = 12

function stripMarkers(text: string) {
  const declaredNoAnswer = text.toUpperCase().includes(NO_ANSWER_TOKEN)
  const clean = text
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(new RegExp(NO_ANSWER_TOKEN, 'gi'), '')
    .trim()
  return { clean, declaredNoAnswer }
}

const isReallyNoAnswer = (t: string) => {
  const s = stripMarkers(t)
  return s.declaredNoAnswer && s.clean.length < MIN_REAL_ANSWER_LEN
}

describe('ตัวตัดสิน NO_ANSWER ของ ChatBot', () => {
  it('ตอบไม่ได้จริง — มีแต่ token', () => {
    expect(isReallyNoAnswer('NO_ANSWER')).toBe(true)
    expect(isReallyNoAnswer('[[NO_ANSWER]]')).toBe(true)
    expect(isReallyNoAnswer('  NO_ANSWER  ')).toBe(true)
  })

  it('มีคำตอบจริงแล้วแปะ marker ต่อท้าย = ต้องส่งคำตอบนั้น ไม่ใช่ทิ้ง', () => {
    const raw = 'เรื่องนี้ขอเช็คให้อีกทีนะคะ เดี๋ยวแอดมินมายืนยันค่ะ\n[[NO_ANSWER]]'
    expect(isReallyNoAnswer(raw)).toBe(false)
    expect(stripMarkers(raw).clean).toBe('เรื่องนี้ขอเช็คให้อีกทีนะคะ เดี๋ยวแอดมินมายืนยันค่ะ')
  })

  it('ลอก [[USED:...]] ออกด้วย ไม่ให้ลูกค้าเห็น marker ของระบบ', () => {
    expect(stripMarkers('ราคา 70 บาทค่ะ [[USED:2,3]]').clean).toBe('ราคา 70 บาทค่ะ')
  })

  it('คำตอบปกติที่ไม่มี marker ไม่ถูกแตะ', () => {
    const raw = 'ผ้าเบรคหน้ากับหลังซื้อคู่กันราคา 70 บาทค่ะ'
    expect(isReallyNoAnswer(raw)).toBe(false)
    expect(stripMarkers(raw).clean).toBe(raw)
  })
})
