/**
 * [blocker] มาสก์ PII ของ guest view — feature 00041 (SRS TFR-002, BR-BOE-02/03)
 *
 * ทำไมต้องเป็น blocker: นี่คือชั้นเดียวที่กันไม่ให้เบอร์/ที่อยู่เต็มของผู้ซื้อหลุดไปหาใครก็ตาม
 * ที่ถือลิงก์ออเดอร์ — ซึ่งเป็นความเสี่ยงที่ user ยอมรับไว้อย่างมีเงื่อนไขตอนเคาะ D-1
 * ("ปิดบางส่วน") ถ้าชั้นนี้เพี้ยน มติ D-1 จะกลายเป็นการเปิดเผยเต็มโดยไม่มีใครรู้
 *
 * 🛑 แดง = ห้าม merge
 */

import { describe, it, expect } from 'vitest'
import {
  maskLast3,
  maskPhoneForGuest,
  maskShippingAddressForGuest,
} from '@/lib/order-pii-mask'

describe('maskLast3', () => {
  it('ยาวกว่า 3 → mask ส่วนหน้า เหลือ 3 ตัวท้าย', () => {
    expect(maskLast3('12345')).toBe('••345')
  })

  it('ยาวเท่ากับ 3 พอดี → mask ทั้งหมด ไม่ใช่คืนค่าเดิม', () => {
    // ถ้าคืน 'บาง' ตรง ๆ = เปิดเผยชื่อตำบลทั้งคำ ขัดเจตนา BR-BOE-03
    expect(maskLast3('บาง')).toBe('•••')
  })

  it('สั้นกว่า 3 → mask เต็มความยาวเดิม ไม่ throw', () => {
    expect(maskLast3('ตา')).toBe('••')
    expect(maskLast3('ก')).toBe('•')
  })

  // จำนวนจุดต้องเท่ากับ "ตัวอักษรที่ตาเห็น" ไม่ใช่จำนวน code point:
  // 'อู่' = อ + สระอู + ไม้เอก = 3 code point แต่คนอ่านเห็นตัวเดียว → ต้องได้ '•' ตัวเดียว
  // (ถ้าได้ '•••' แปลว่าเผลอนับ code point ซึ่งจะทำให้ความยาวที่ mask ดูไม่ตรงกับของจริง)
  it('พยัญชนะที่มีสระ+วรรณยุกต์เกาะ นับเป็นตัวอักษรเดียว', () => {
    expect(maskLast3('อู่')).toBe('•')
  })

  it('string ว่าง → คืนค่าว่าง', () => {
    expect(maskLast3('')).toBe('')
  })

  // 🛑 เคสที่ `slice(-3)` แบบตรงไปตรงมาจะพัง: สระ/วรรณยุกต์ไทยเป็น code point แยกแต่เกาะกับ
  // พยัญชนะตัวหน้า — ตัดด้วย index ดิบจะพรากมันออกมาเป็นสระลอย (◌ื) ที่อ่านไม่ออก
  it('ข้อความไทยที่มีสระ/วรรณยุกต์ → ตัวอักษรท้ายต้องไม่ถูกฉีกจากฐาน', () => {
    const out = maskLast3('เมืองสมุทรปราการ')
    // ท้ายสุดต้องเป็น 'การ' ที่อ่านออกได้ ไม่ใช่เศษที่ขาดฐาน
    expect(out.endsWith('การ')).toBe(true)
    // ส่วนที่เหลือต้องถูกปิดหมด ไม่มีตัวอักษรไทยหลุดออกมานอก 3 ตัวท้าย
    expect(out.replace(/•/g, '')).toBe('การ')
  })

  it('ข้อความไทยที่มีวรรณยุกต์ท้ายคำ → วรรณยุกต์ต้องไปพร้อมพยัญชนะของมัน', () => {
    const out = maskLast3('บางปูใหม่')
    expect(out.replace(/•/g, '')).toBe('ใหม่')
  })
})

describe('maskPhoneForGuest', () => {
  it('เบอร์ไทย 10 หลัก → •••-•••-891', () => {
    expect(maskPhoneForGuest('0812345891')).toBe('•••-•••-891')
  })

  it('เบอร์ที่มีขีด/เว้นวรรค → normalize ก่อนแล้วได้ผลเดียวกัน', () => {
    expect(maskPhoneForGuest('081-234-5891')).toBe('•••-•••-891')
  })

  it('ค่าที่ไม่ใช่เบอร์ (อีเมล) → null ไม่ใช่พยายาม mask ต่อ', () => {
    expect(maskPhoneForGuest('buyer@example.com')).toBeNull()
  })

  it('null / ค่าว่าง → null', () => {
    expect(maskPhoneForGuest(null)).toBeNull()
    expect(maskPhoneForGuest('')).toBeNull()
  })
})

describe('maskShippingAddressForGuest', () => {
  const addr = {
    line1: '45 ถ.สุขุมวิท',
    subdistrict: 'บางปูใหม่',
    district: 'เมืองสมุทรปราการ',
    province: 'สมุทรปราการ',
    postcode: '10280',
  }

  // 🛑 เคสหลักของไฟล์นี้ — province เป็นข้อยกเว้นเพียงตัวเดียว ถ้าเขียนเป็น loop เดียวทั้งก้อน
  // จะพลาดได้ง่ายมาก mutation ที่ต้องทำให้แดง: ให้ province ผ่าน maskLast3 ด้วย
  it('province ไม่ถูก mask แต่ฟิลด์อื่นถูก mask ทุกตัว', () => {
    const out = maskShippingAddressForGuest(addr)!
    expect(out.province).toBe('สมุทรปราการ')
    expect(out.province).not.toContain('•')

    for (const field of ['line1', 'subdistrict', 'district', 'postcode'] as const) {
      expect(out[field]).toContain('•')
      expect(out[field]).not.toBe(addr[field])
    }
  })

  it('postcode โชว์ 3 หลักท้าย', () => {
    expect(maskShippingAddressForGuest(addr)!.postcode).toBe('••280')
  })

  // note เป็น free-text ที่มักมีเบอร์สำรอง/จุดสังเกตปนอยู่ — ต้องไม่มีทางหลุดออกไป
  it('ไม่มี key `note` ในผลลัพธ์เลย (ไม่ใช่แค่ค่าว่าง)', () => {
    const out = maskShippingAddressForGuest({ ...addr, note: 'ฝากไว้หน้าบ้าน โทร 089...' } as never)!
    expect('note' in out).toBe(false)
  })

  it('ฟิลด์ที่ไม่มีค่า → คืนค่าว่าง ไม่ใส่ • ปลอม', () => {
    const out = maskShippingAddressForGuest({ province: 'ชลบุรี' })!
    expect(out.province).toBe('ชลบุรี')
    expect(out.line1).toBe('')
    expect(out.subdistrict).toBe('')
  })

  it('null → null (เคส NO_SHIPPING)', () => {
    expect(maskShippingAddressForGuest(null)).toBeNull()
  })
})
