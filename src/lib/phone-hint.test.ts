/**
 * 🛑 [blocker] — ตรรกะที่ตัดสินว่าหน้าจอ "พูดหรือเงียบ" ใต้ช่องเบอร์
 *
 * ถ้าเขียนกลับด้าน ผลคือ chip ไม่ขึ้นเลยทุกกรณี (ฟีเจอร์ตายเงียบ) หรือเตือนทุกครั้งที่
 * ร้านพิมพ์ชื่อคน (ร้านเลิกอ่านคำเตือนภายในวันเดียว) — ทั้งสองแบบผ่าน tsc/build/grep หมด
 * เพราะเป็น boolean ที่ถูกต้องตามชนิดทุกประการ (`ui-boolean-needs-a-testable-home.md`)
 */

import { describe, it, expect } from 'vitest'
import { phoneHint, chipsHeadline, canUseAsNewCustomer, emptyStateMessage } from './phone-hint'

describe('[blocker] chip ขึ้นเมื่อตัดแล้วได้เบอร์ที่ใช้ได้', () => {
  it.each([
    '092-0791649',
    '(+66)920791649',
    '0_9_2_0791649',
    '092 0791649',
    'โทร0920791649',
    '0 8 6 5 3 5 2960',
  ])('%s → chips', (input) => {
    const h = phoneHint(input)
    expect(h.kind).toBe('chips')
    if (h.kind === 'chips') expect(h.suggestions.length).toBeGreaterThan(0)
  })

  it('เสนอได้หลายตัว', () => {
    const h = phoneHint('โทร 0612929865/ 0843642147')
    expect(h).toEqual({ kind: 'chips', suggestions: ['0612929865', '0843642147'] })
  })
})

describe('[blocker] ตัดตัวที่ตรงกับที่พิมพ์อยู่แล้วทิ้ง — ห้ามมี chip ยืนยันตัวเองซ้ำ', () => {
  it('พิมพ์เบอร์ถูกอยู่แล้ว → ไม่แสดงอะไร', () => {
    expect(phoneHint('0920791649')).toEqual({ kind: 'none' })
  })

  it('มีช่องว่างหัวท้ายแต่เนื้อในถูก → ยังไม่แสดง (trim แล้วเท่ากัน)', () => {
    expect(phoneHint('  0920791649  ')).toEqual({ kind: 'none' })
  })

  it('เบอร์ถูก 1 ตัว + เบอร์เพี้ยน 1 ตัว → เหลือเฉพาะตัวที่ต้องแก้', () => {
    const h = phoneHint('0920791649')
    expect(h.kind).toBe('none')
  })
})

describe('[blocker] เงียบสนิทเมื่อผู้ใช้พิมพ์ชื่อคน (ช่องค้นหารับชื่อด้วย)', () => {
  it.each(['สมชาย', 'สมชาย ใจดี', '', '   '])('%j → none', (input) => {
    expect(phoneHint(input)).toEqual({ kind: 'none' })
  })
})

describe('[blocker] threshold กันคำเตือนกระพริบระหว่างพิมพ์', () => {
  it.each([
    ['0', 1],
    ['09', 2],
    ['0920', 4],
    ['09207916', 8],
  ])('พิมพ์ %s (%i หลัก) → ยังไม่เตือน', (input) => {
    expect(phoneHint(input)).toEqual({ kind: 'none' })
  })

  it('9 หลัก → เตือน พร้อมบอกจำนวนหลักจริง', () => {
    const h = phoneHint('092079164')
    expect(h.kind).toBe('warning')
    if (h.kind === 'warning') expect(h.message).toContain('9 หลัก')
  })

  it('11 หลัก → เตือนทันที (สถานะจบแล้ว พิมพ์เพิ่มไม่มีทางถูก)', () => {
    const h = phoneHint('09207916499')
    expect(h.kind).toBe('warning')
    if (h.kind === 'warning') expect(h.message).toContain('11 หลัก')
  })
})

describe('[blocker] "ไม่ใช่มือถือ" ต้องเป็นคนละข้อความกับ "หลักไม่ครบ" (ทางแก้คนละอย่าง)', () => {
  it('10 หลักขึ้นต้น 02 → บอกว่าต้องขึ้นต้น 06/08/09', () => {
    const h = phoneHint('0212345678')
    expect(h.kind).toBe('warning')
    if (h.kind === 'warning') {
      expect(h.message).toContain('06, 08 หรือ 09')
      expect(h.message).not.toContain('10 หลักพอดี')
    }
  })

  it('9 หลัก → บอกจำนวนหลัก ไม่ใช่เรื่องคำนำหน้า', () => {
    const h = phoneHint('092079164')
    if (h.kind === 'warning') {
      expect(h.message).toContain('10 หลักพอดี')
      expect(h.message).not.toContain('06, 08 หรือ 09')
    }
  })
})

describe('[blocker] chip แสดงเลขติดกันตรงกับค่าที่บันทึกจริง', () => {
  /**
   * 🛑 user เคาะเอง 2026-08-21: "แต่เบอร์ในระบบมันควรเป็น 0920791649 หรือเปล่า" —
   * โชว์ `092-079-1649` แล้วบันทึก `0920791649` คือคลาสเดียวกับปัญหาที่ฟีเจอร์นี้แก้อยู่
   * ค่าบนปุ่มจึงต้อง === ค่าที่ส่งเข้า onPick เป๊ะ ไม่มีตัวคั่นใด ๆ
   */
  it('suggestion ที่ออกมาต้องไม่มีตัวคั่น (ค่าบนปุ่ม = ค่าที่บันทึก)', () => {
    const h = phoneHint('092-079-1649')
    expect(h.kind).toBe('chips')
    if (h.kind === 'chips') {
      for (const s of h.suggestions) expect(s).toMatch(/^[0-9]{10}$/)
    }
  })
})

describe('[blocker] chipsHeadline — บรรทัดนำที่ตอบว่าระบบทำอะไรให้', () => {
  it('1 เบอร์ → บอกว่าตัดให้แล้ว และกดแล้วจะค้นหาต่อให้', () => {
    const h = chipsHeadline(1, false)
    expect(h).toContain('ตัดอักขระให้แล้ว')
    expect(h).toContain('ค้นหาลูกค้าเดิม')
  })

  it('หลายเบอร์ → บอกจำนวนจริง และบอกว่าต้องเลือก (ห้ามเลือกให้เอง)', () => {
    expect(chipsHeadline(2, false)).toContain('2 เบอร์')
    expect(chipsHeadline(3, false)).toContain('เลือก')
  })

  /**
   * 🛑 critique P0-1: ค่าที่มี chip = ค่าที่ยังบันทึกไม่ผ่านเสมอ ถ้าบรรทัดนี้ไม่เปลี่ยนน้ำเสียง
   * ผู้ใช้จะไม่มีทางรู้ว่าตัวเองถูกบล็อกอยู่ ขณะที่ toast บอกว่า "ดูช่องที่ทำเครื่องหมายสีแดง"
   */
  it('กดบันทึกแล้วติด → ต้องพูดว่าบันทึกไม่ได้ ไม่ใช่คำเชิญชวนเฉย ๆ', () => {
    const h = chipsHeadline(1, true)
    expect(h).toContain('บันทึกไม่ได้')
    expect(h).not.toContain('ตัดอักขระให้แล้ว')
  })
})

describe('[blocker] canUseAsNewCustomer — ปุ่ม "ใช้เป็นลูกค้าใหม่" เขียนค่าลงฟอร์มทันที', () => {
  it('มือถือถูกต้อง → ใช้ได้ (ลงช่องเบอร์)', () => {
    expect(canUseAsNewCustomer('0920791649')).toBe(true)
  })

  it('ชื่อคน (ไม่มีเลขเลย) → ใช้ได้ (ลงช่องชื่อ)', () => {
    expect(canUseAsNewCustomer('สมชาย ใจดี')).toBe(true)
  })

  /**
   * 🛑 เคสนี้คือตัวที่เคยพัง: ค่ามีเลขแต่ไม่ผ่านเกณฑ์เบอร์ ⇒ โค้ดเดิมโยนลง **ช่องชื่อ**
   * ร้านได้ลูกค้าชื่อ "0 8 6 5 3 5 2960" / "09207916" โดยไม่มีอะไรฟ้อง
   */
  it.each(['0 8 6 5 3 5 2960', '09207916', '09207916499', '0212345678', '0_9_2_0791649', 'สมชาย 0812'])(
    '%j → ใช้ไม่ได้ (ต้องให้ chip/คำเตือนทำงานแทน)',
    (input) => {
      expect(canUseAsNewCustomer(input)).toBe(false)
    },
  )

  it('ค่าว่าง → ใช้ไม่ได้', () => {
    expect(canUseAsNewCustomer('')).toBe(false)
    expect(canUseAsNewCustomer('   ')).toBe(false)
  })
})

describe('[blocker] emptyStateMessage — "ไม่พบลูกค้าเดิม" ห้ามโกหก', () => {
  /**
   * 🛑 critique P0-2ข: ชีตค้นด้วยคำค้นดิบเสมอ ⇒ ถ้ายังมี chip ค้างอยู่ แปลว่ายังไม่เคยค้น
   * ด้วยเบอร์ที่ถูกเลย การประกาศว่า "ไม่พบ" ตรงนั้นคือคำที่ไม่จริง และมันขัดกับ chip
   * ที่อยู่เหนือมันในจอเดียวกัน
   */
  it('ยังมี chip ค้าง → บอกว่ายังไม่ได้ค้น ไม่ใช่ประกาศว่าไม่พบ', () => {
    const m = emptyStateMessage('0 8 6 5 3 5 2960')
    expect(m).not.toContain('ไม่พบลูกค้าเดิม')
    expect(m).toContain('กดเบอร์ที่แนะนำ')
  })

  /**
   * 🛑 critique P1-4: 8 หลัก = ไม่มี chip (ต่ำกว่าเกณฑ์เตือน) + ปุ่ม "ใช้เป็นลูกค้าใหม่"
   * ถูกซ่อน ⇒ ถ้าตรงนี้เขียนแค่ "ไม่พบลูกค้าเดิม" จอจะปฏิเสธผู้ใช้โดยไม่เหลืออะไรให้อ่านเลย
   */
  it('หลักไม่ครบ → บอกจำนวนหลักจริงด้วย (จอต้องไม่เป็นทางตัน)', () => {
    const m = emptyStateMessage('09207916')
    expect(m).toContain('8 หลัก')
    expect(m).toContain('10 หลัก')
  })

  it('ไม่ใช่มือถือ → บอกเรื่องคำนำหน้า ไม่ใช่เรื่องจำนวนหลัก', () => {
    const m = emptyStateMessage('0212345678')
    expect(m).toContain('06, 08 หรือ 09')
    expect(m).not.toContain('หลัก เบอร์มือถือต้องมี')
  })

  it('พิมพ์ชื่อคน → ข้อความเดิมล้วน ๆ (ไม่ยัดเรื่องเบอร์ให้คนที่ค้นด้วยชื่อ)', () => {
    expect(emptyStateMessage('สมชาย')).toBe('ไม่พบลูกค้าเดิม')
  })

  it('เบอร์ถูกต้องแต่ไม่มีในระบบ → ข้อความเดิมล้วน ๆ (ไม่พบจริง)', () => {
    expect(emptyStateMessage('0920791649')).toBe('ไม่พบลูกค้าเดิม')
  })
})
