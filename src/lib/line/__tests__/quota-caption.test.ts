import { describe, it, expect } from 'vitest'
import { deriveLineQuotaCaption, type LineQuotaCaptionInput } from '@/lib/line/quota-caption'

// (S-14b, feature 00025 FR-LINE-06) — ครอบทั้ง 8 สถานะในตารางคำของ Design Spec 2026-08-10
// `blocking` พิสูจน์ด้วย mutation แล้ว (ดูคอมเมนต์ในแต่ละข้อ [blocker])

function input(over: Partial<LineQuotaCaptionInput> = {}): LineQuotaCaptionInput {
  return {
    windowOpen: false,
    type: 'limited',
    level: 'OK',
    remaining: 248,
    total: 300,
    stale: false,
    ...over,
  }
}

describe('deriveLineQuotaCaption — หน้าต่างตอบฟรียังเปิด', () => {
  it('[blocker] TC-28: โควตาหมดแต่ยังอยู่ในหน้าต่างฟรี → ห้ามบล็อก', () => {
    // mutation: ย้ายเงื่อนไข EXHAUSTED ขึ้นไปก่อนเช็ค windowOpen → ข้อนี้แดงทันที
    const c = deriveLineQuotaCaption(input({ windowOpen: true, level: 'EXHAUSTED', remaining: 0 }))
    expect(c.blocking).toBe(false)
    expect(c.tone).toBe('warning')
    expect(c.shortText).toContain('ส่งฟรี')
  })

  it('โควตาปกติ → "ส่งฟรี" เงียบ ๆ ไม่มีสีเตือน', () => {
    const c = deriveLineQuotaCaption(input({ windowOpen: true }))
    expect(c).toMatchObject({ shortText: 'ส่งฟรี', tone: 'neutral', blocking: false })
    expect(c.fullText).toBe('ข้อความนี้ส่งฟรี (อยู่ในช่วงตอบด่วน)')
  })

  it('โควตาใกล้หมด → เตือนล่วงหน้าว่าใบถัดไปจะเจออะไร', () => {
    const c = deriveLineQuotaCaption(input({ windowOpen: true, level: 'LOW', remaining: 32 }))
    expect(c).toMatchObject({ tone: 'warning', blocking: false })
    expect(c.fullText).toContain('โควตาใกล้หมด')
  })

  it('อ่านโควตาไม่ได้ (stale) แต่หน้าต่างเปิด → ยังบอกว่าส่งฟรีได้ตามปกติ', () => {
    const c = deriveLineQuotaCaption(input({ windowOpen: true, stale: true, type: 'unknown', level: 'UNKNOWN' }))
    expect(c).toMatchObject({ shortText: 'ส่งฟรี', tone: 'neutral', blocking: false })
  })
})

describe('deriveLineQuotaCaption — หน้าต่างตอบฟรีปิดแล้ว (ใบนี้หักโควตา)', () => {
  it('[blocker] รู้แน่ว่าโควตาหมด → บล็อก (ทางเดียวที่ blocking เป็น true ได้)', () => {
    // mutation: เขียน `blocking: false` ตรงกิ่งนี้ → ข้อนี้แดง · เขียน `blocking: true` ที่กิ่งอื่น
    // → ข้อ "ห้ามบล็อก" ทั้งหลายในไฟล์นี้แดงยกชุด
    const c = deriveLineQuotaCaption(input({ level: 'EXHAUSTED', remaining: 0 }))
    expect(c).toMatchObject({ shortText: 'โควตาหมดแล้ว', tone: 'danger', blocking: true })
  })

  it('[blocker] โควตาหมดแต่ค่าที่มีเป็นค่าเก่า (stale) → ห้ามบล็อก (TD-006)', () => {
    // mutation: ถอด `&& !stale` ออกจากกิ่ง EXHAUSTED → ข้อนี้แดง (หน้าจอจะปิดช่องพิมพ์ด้วยตัวเลข
    // ที่ตัวเองก็ไม่รู้ว่าเก่าแค่ไหน ขณะที่ฝั่ง server ไม่บล็อก = สองมาตรฐาน)
    const c = deriveLineQuotaCaption(input({ level: 'EXHAUSTED', remaining: 0, stale: true }))
    expect(c.blocking).toBe(false)
    expect(c.shortText).toBe('ไม่ทราบยอดโควตา')
  })

  it('โควตาปกติ → เห็นตัวเลขจริงก่อนกดส่ง', () => {
    const c = deriveLineQuotaCaption(input())
    expect(c).toMatchObject({ shortText: 'โควตา 248/300', tone: 'neutral', blocking: false })
    expect(c.fullText).toBe('ใช้โควตา 1 ข้อความ (เหลือ 248/300)')
  })

  it('โควตาใกล้หมด → คำว่า "ใกล้หมด" ติดไปกับตัวเลข', () => {
    const c = deriveLineQuotaCaption(input({ level: 'LOW', remaining: 32 }))
    expect(c).toMatchObject({ shortText: 'เหลือ 32/300 ใกล้หมด', tone: 'warning', blocking: false })
  })

  it('แพ็กเกจไม่จำกัด → ไม่มีตัวเลขให้กังวล', () => {
    const c = deriveLineQuotaCaption(input({ type: 'unlimited', level: 'UNLIMITED', remaining: null, total: null }))
    expect(c).toMatchObject({ shortText: 'ไม่จำกัดโควตา', tone: 'neutral', blocking: false })
  })

  it('ยังไม่เคยอ่านโควตาเลย → บอกตรง ๆ ว่าไม่ทราบ และย้ำว่ายังส่งได้', () => {
    const c = deriveLineQuotaCaption(input({ type: 'unknown', level: 'UNKNOWN', remaining: null, total: null, stale: true }))
    expect(c).toMatchObject({ shortText: 'ไม่ทราบยอดโควตา', tone: 'quiet', blocking: false })
    expect(c.fullText).toContain('ยังส่งได้ตามปกติ')
  })

  it('level บอกว่ายังเหลือ แต่ไม่มีตัวเลขจริง → ห้ามขึ้น "เหลือ null/null"', () => {
    const c = deriveLineQuotaCaption(input({ level: 'OK', remaining: null, total: null }))
    expect(c.shortText).toBe('ไม่ทราบยอดโควตา')
    expect(c.fullText).not.toContain('null')
  })

  it('ตัวเลขหลักพันมีตัวคั่นหลัก (กันอ่านผิดหลักตอนกวาดตา)', () => {
    const c = deriveLineQuotaCaption(input({ remaining: 12_500, total: 35_000 }))
    expect(c.shortText).toBe('โควตา 12,500/35,000')
  })
})

/**
 * (2026-08-10) แคปชันใต้ช่องพิมพ์ถูกยุบเข้าปุ่มส่งตามที่ user สั่ง — ปุ่มจึงกลายเป็น **ช่องทางเดียว**
 * ที่บอกว่าใบนี้หักโควตาหรือไม่ ชุดนี้จึงคุมสัญญาว่า "ปุ่มต้องไม่เงียบในสถานะที่มีเรื่องต้องบอก"
 */
describe('deriveLineQuotaCaption — ข้อความบนปุ่มส่ง (buttonSuffix)', () => {
  it('[blocker] อยู่ในหน้าต่างฟรี → ปุ่มต้องบอกว่า "ฟรี" ทุกกรณี ไม่ว่าโควตาจะเหลือเท่าไหร่', () => {
    // นี่คือสถานะที่เจอบ่อยที่สุดตอนคุยกับลูกค้าจริง (reply token 60 วินาที) — ถ้าปุ่มเงียบตรงนี้
    // ผู้ขายจะแยกไม่ออกเลยว่าใบไหนหักเงินใบไหนฟรี ซึ่งเป็นเหตุผลทั้งหมดที่ S-14b มีอยู่
    for (const over of [{}, { level: 'LOW' as const, remaining: 12 }, { level: 'EXHAUSTED' as const, remaining: 0 }]) {
      const c = deriveLineQuotaCaption(input({ windowOpen: true, ...over }))
      expect(c.buttonSuffix).toBe('ฟรี')
    }
  })

  it('[blocker] หน้าต่างปิด + รู้ยอดจริง → ปุ่มต้องโชว์ "เหลือ/ทั้งหมด" ไม่ใช่เงียบ', () => {
    expect(deriveLineQuotaCaption(input({ remaining: 290, total: 300 })).buttonSuffix).toBe('290/300')
    expect(deriveLineQuotaCaption(input({ level: 'LOW', remaining: 12 })).buttonSuffix).toBe('12/300')
  })

  it('ตัวเลขบนปุ่มใช้ตัวคั่นหลักชุดเดียวกับแคปชัน (ตัวเลขเดียวกันต้องมาจากสูตรเดียว)', () => {
    const c = deriveLineQuotaCaption(input({ remaining: 12_500, total: 35_000 }))
    expect(c.buttonSuffix).toBe('12,500/35,000')
    expect(c.shortText).toContain(c.buttonSuffix!)
  })

  it('เงียบได้เฉพาะ 3 กรณีที่ไม่มีอะไรต้องบอกจริง ๆ', () => {
    // ไม่จำกัดโควตา / อ่านยอดไม่สำเร็จ / โควตาหมด (ปุ่มถูกปิด + มีแถบแดงบอกวิธีแก้อยู่แล้ว)
    expect(deriveLineQuotaCaption(input({ type: 'unlimited' })).buttonSuffix).toBeNull()
    expect(deriveLineQuotaCaption(input({ stale: true })).buttonSuffix).toBeNull()
    const blocked = deriveLineQuotaCaption(input({ level: 'EXHAUSTED', remaining: 0 }))
    expect(blocked.buttonSuffix).toBeNull()
    expect(blocked.blocking).toBe(true)
  })

  it('[blocker] ทุกสถานะที่ปุ่มยังกดได้และหักโควตา ต้องมี suffix — ไม่มีช่องโหว่ให้เงียบ', () => {
    const cases: Partial<LineQuotaCaptionInput>[] = [
      { windowOpen: true },
      { windowOpen: true, level: 'LOW', remaining: 9 },
      { windowOpen: true, level: 'EXHAUSTED', remaining: 0 },
      { remaining: 290, total: 300 },
      { level: 'LOW', remaining: 12 },
    ]
    for (const over of cases) {
      const c = deriveLineQuotaCaption(input(over))
      expect(c.blocking).toBe(false)
      expect(c.buttonSuffix, `สถานะ ${JSON.stringify(over)} ปล่อยให้ปุ่มเงียบ`).not.toBeNull()
    }
  })
})
