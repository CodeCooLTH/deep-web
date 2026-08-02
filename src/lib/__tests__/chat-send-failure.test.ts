import { describe, it, expect } from 'vitest'
import { describeSendFailure } from '../chat-send-failure'

describe('describeSendFailure', () => {
  it('แปลง #551 (ผู้รับไม่พร้อมรับข้อความ) เป็นไทย พร้อมบอกว่าต้องทำอะไรต่อ', () => {
    const out = describeSendFailure("(#551) This person isn't available right now.")
    expect(out.text).toContain('ลูกค้า')
    expect(out.text).toContain('รอ')
    expect(out.text).not.toMatch(/[A-Za-z]{4,}/) // ไม่มีประโยคอังกฤษหลงเหลือ
    expect(out.metaCode).toBe(551)
    expect(out.known).toBe(true)
  })

  it('แปลง #190 (token เพจหมดอายุ) เป็น "เชื่อม Page ใหม่"', () => {
    const out = describeSendFailure('Error validating access token: Session has expired. (#190)')
    expect(out.text).toContain('เชื่อม Facebook Page ใหม่')
    expect(out.metaCode).toBe(190)
    expect(out.known).toBe(true)
  })

  it('จับหน้าต่าง 24 ชม. จากถ้อยคำ ไม่ใช่จากเลข code อย่างเดียว', () => {
    const out = describeSendFailure(
      '(#10) This message is sent outside of allowed window.',
    )
    expect(out.text).toContain('24 ชั่วโมง')
    expect(out.known).toBe(true)
  })

  it('message = ประโยคเต็ม ขึ้นต้นเหมือนกันทุกกรณี (badge กับ toast ต้องพูดตรงกัน)', () => {
    for (const raw of [null, '(#551) x', '(#99999) y', 'ส่งข้อความไม่สำเร็จ']) {
      const out = describeSendFailure(raw)
      expect(out.message).toBe(`ส่งไม่สำเร็จ — ${out.text}`)
    }
  })

  it('จับ rate limit', () => {
    const out = describeSendFailure('(#613) Calls to this api have exceeded the rate limit.')
    expect(out.text).toContain('ลองใหม่')
    expect(out.known).toBe(true)
  })

  it('error ที่ยังไม่รู้จัก — คงข้อความดิบไว้ให้ซัพพอร์ตอ่าน ไม่กลืนหาย', () => {
    const raw = '(#12345) Something nobody has seen before.'
    const out = describeSendFailure(raw)
    expect(out.known).toBe(false)
    expect(out.text).toContain(raw)
    expect(out.metaCode).toBe(12345)
  })

  it('ข้อความไทยที่ระบบเราสร้างเอง — ส่งผ่านตามเดิม ไม่ต้องแปลซ้ำ', () => {
    const out = describeSendFailure('ส่งข้อความไม่สำเร็จ')
    expect(out.text).toBe('ส่งข้อความไม่สำเร็จ')
    expect(out.known).toBe(false)
    expect(out.metaCode).toBeNull()
  })

  it('ไม่มีเหตุผลติดมาเลย', () => {
    expect(describeSendFailure(null).text).toBe('ไม่ทราบสาเหตุ')
    expect(describeSendFailure('   ').text).toBe('ไม่ทราบสาเหตุ')
  })
})
