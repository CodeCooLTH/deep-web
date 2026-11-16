import { describe, it, expect } from 'vitest'
import { th } from '@/i18n/dictionaries/th'
import { en } from '@/i18n/dictionaries/en'

// 00093 BRD §2: "แชท" ที่ไม่มีคำขยายห้ามใช้บนหน้ารายงานคุณภาพโฆษณา — ต้องเป็น "แชท (Meta)" หรือ "แชทเข้าร้าน" เสมอ · ห้าม "Deep"/"แอด" (กฎคำเดียวกับ 00094 BR-AIR-14/15)
const BARE = /แชท(?! \(Meta\)|เข้าร้าน)/
const BARE_EN = /\bchats?\b(?! \(Meta\)| to shop)/i

describe('adQuality copy', () => {
  it('th: ไม่มีคำว่า "แชท" โดด ๆ ในข้อความของหน้านี้', () => {
    const bad = Object.entries(th.adQuality).filter(([, v]) => BARE.test(v))
    expect(bad).toEqual([])
  })
  it('en: ไม่มี "chat(s)" โดด ๆ (ต้องเป็น Chats (Meta) หรือ chats to shop)', () => {
    const bad = Object.entries(en.adQuality).filter(([, v]) => BARE_EN.test(v))
    expect(bad).toEqual([])
  })
  it('ไม่มีคำว่า "Deep" และ "แอด" ในข้อความของหน้ารายงานโฆษณา 00091/00093', () => {
    const bad = [th.adReport, th.adRevenue, th.adQuality, en.adReport, en.adRevenue, en.adQuality]
      .flatMap((d) => Object.values(d).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v).flatMap((x) => (typeof x === 'string' ? [x] : Object.values(x as object))))))
      .filter((v) => typeof v === 'string' && (/\bDeep\b/.test(v) || /แอด(?!มิน)/.test(v)))
    expect(bad).toEqual([])
  })
  it('สองภาษามีคีย์ชุดเดียวกัน', () => {
    expect(Object.keys(en.adQuality).sort()).toEqual(Object.keys(th.adQuality).sort())
  })
})
