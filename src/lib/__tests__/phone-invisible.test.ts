import { describe, expect, it } from 'vitest'
import { firstThaiMobile, MOBILE_PHONE_RE, stripInvisible } from '../phone'

// ข้อความจริงจากแชท prod 2026-10-10: คีย์บอร์ดไทยบน iOS แทรก U+200B กลางเบอร์
const ZW = '​'
const pasted = `089913${ZW}010${ZW}5`

describe('เบอร์ที่ติดอักขระล่องหน', () => {
  it('ค่าดิบไม่ผ่านด่าน แต่หลัง stripInvisible ผ่าน', () => {
    expect(MOBILE_PHONE_RE.test(pasted)).toBe(false)
    expect(stripInvisible(pasted)).toBe('0899130105')
    expect(MOBILE_PHONE_RE.test(stripInvisible(pasted))).toBe(true)
  })

  it('หาเบอร์จากข้อความทั้งก้อน (กระจายที่อยู่) ได้', () => {
    expect(firstThaiMobile(`เฉลิมพล${ZW} มูลละออง${ZW}\n${pasted}  \nสรุปคำสั่งซื้อ`)).toBe('0899130105')
  })
})
