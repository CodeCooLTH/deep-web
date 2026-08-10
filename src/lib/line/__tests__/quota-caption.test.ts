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
