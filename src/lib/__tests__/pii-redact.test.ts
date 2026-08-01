import { describe, expect, it } from 'vitest'
import { redactPii } from '../pii-redact'

describe('redactPii', () => {
  it('แทนเบอร์มือถือไทยทุกรูปแบบที่ลูกค้าพิมพ์จริง', () => {
    for (const raw of ['0812345678', '081-234-5678', '081 234 5678', '+66812345678', '+66 81-234-5678']) {
      const r = redactPii(`ติดต่อ ${raw} ได้เลย`)
      expect(r.text, raw).toBe('ติดต่อ [เบอร์โทร] ได้เลย')
      expect(r.found).toContain('PHONE')
    }
  })

  it('แทนเบอร์บ้าน 9 หลัก', () => {
    expect(redactPii('โทร 021234567').text).toBe('โทร [เบอร์โทร]')
  })

  it('แทนอีเมล', () => {
    const r = redactPii('ส่งใบเสร็จมาที่ some.one+tag@example.co.th นะคะ')
    expect(r.text).toBe('ส่งใบเสร็จมาที่ [อีเมล] นะคะ')
    expect(r.found).toContain('EMAIL')
  })

  it('เลขบัตรประชาชน 13 หลักต้องไม่ถูกเบอร์โทรกินไปก่อน', () => {
    const r = redactPii('เลขบัตร 1234567890123')
    expect(r.text).toBe('เลขบัตร [เลขบัตรประชาชน]')
    expect(r.found).toEqual(['NATIONAL_ID'])
  })

  it('แทนเลขบัญชีธนาคาร', () => {
    const r = redactPii('โอนเข้า 1234567890 ธนาคารกสิกร')
    expect(r.text).toBe('โอนเข้า [เลขบัญชี] ธนาคารกสิกร')
  })

  it('แทนทั้งบรรทัดเมื่อเป็นที่อยู่เต็มรูปแบบ', () => {
    const r = redactPii('ชื่อ สมชาย\n99/1 หมู่ 2 ต.บางรัก อ.เมือง จ.ชลบุรี 20000\nส่งพรุ่งนี้ได้ไหม')
    expect(r.text).toBe('ชื่อ สมชาย\n[ที่อยู่]\nส่งพรุ่งนี้ได้ไหม')
    expect(r.found).toContain('ADDRESS')
  })

  it('ไม่แตะข้อความที่ไม่มี PII — ราคาและจำนวนต้องรอด', () => {
    const raw = 'สินค้าตัวนี้ 590 บาท สั่ง 2 ชิ้นลดเหลือ 1100 ไหมคะ'
    const r = redactPii(raw)
    expect(r.text).toBe(raw)
    expect(r.found).toEqual([])
  })

  it('รหัสไปรษณีย์ลอย ๆ ที่ไม่มีคำบอกตำแหน่ง ไม่ถือเป็นที่อยู่', () => {
    const raw = 'ส่งไป 20000 ค่าส่งเท่าไร'
    expect(redactPii(raw).text).toBe(raw)
  })
})
