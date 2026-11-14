import { describe, it, expect } from 'vitest'
import { th } from '@/i18n/dictionaries/th'
import { en } from '@/i18n/dictionaries/en'

// 00093 BRD §2: "แชท" ที่ไม่มีคำขยายห้ามใช้บนหน้ารายงานคุณภาพโฆษณา — ต้องเป็น "แชท (Meta)" หรือ "แชท (Deep)" เสมอ
const BARE = /แชท(?! \((Meta|Deep)\))/
const BARE_EN = /\bchats?\b(?! \((Meta|Deep)\))/i

describe('adQuality copy', () => {
  it('th: ไม่มีคำว่า "แชท" โดด ๆ ในข้อความของหน้านี้', () => {
    // ข้อยกเว้นเดียวตามสเปก UX: ชื่อการ์ด ② "ปิดการขายจากแชทของแอด (Deep)" (ต่อท้ายด้วย (Deep) อยู่แล้ว)
    const bad = Object.entries(th.adQuality).filter(([k, v]) => k !== 'h2Title' && BARE.test(v))
    expect(bad).toEqual([])
  })
  it('en: ไม่มี "chat(s)" โดด ๆ (ต้องเป็น Chats (Meta)/(Deep))', () => {
    const bad = Object.entries(en.adQuality).filter(([, v]) => BARE_EN.test(v))
    expect(bad).toEqual([])
  })
  it('สองภาษามีคีย์ชุดเดียวกัน', () => {
    expect(Object.keys(en.adQuality).sort()).toEqual(Object.keys(th.adQuality).sort())
  })
})
