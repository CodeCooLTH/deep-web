// badge-row-fit.test.ts — ล็อกกฎ "ปุ่มกางเหรียญโผล่เฉพาะตอนล้นจริง"
//
// ทำไมต้องมีเทส: บั๊กเดิมคือปุ่มโผล่ตลอดแม้ยังเหลือที่ว่างครึ่งแถว ซึ่ง **ไม่มี gate ไหนจับได้เลย**
// tsc เขียว build ผ่าน หน้าจอ render ครบทุกอย่าง — ปุ่มที่ไม่ควรมีก็ยัง "ถูก" ตามชนิดข้อมูล
// ผิดแค่ตรงที่มันตอบคำถามผิดข้อ (ตอบว่า "จอขนาดไหน" แทน "กล่องกว้างพอไหม")
//
// [blocker] แดงเมื่อไหร่ห้าม merge

import { describe, expect, it } from 'vitest'

import { BADGE_ITEM_WIDTH, BADGE_ROW_GAP, badgeRowFit } from '../badge-row-fit'

/** ความกว้างที่พอดีกับ n ใบเป๊ะ ๆ */
const widthFor = (n: number) => n * BADGE_ITEM_WIDTH + (n - 1) * BADGE_ROW_GAP

describe('badgeRowFit', () => {
  it('[blocker] ใส่ได้พอดี → ไม่มี overflow และห้ามกันช่องให้ปุ่ม', () => {
    // เคสจริงที่ user ทัก: 7 เหรียญบนแถวกว้างพอสำหรับ 11 ใบ
    expect(badgeRowFit(widthFor(11), 7)).toEqual({ visible: 7, overflow: 0 })
    // ขอบพอดีเป๊ะ — 7 ใบในที่ของ 7 ใบ ต้องยังไม่ล้น
    expect(badgeRowFit(widthFor(7), 7)).toEqual({ visible: 7, overflow: 0 })
  })

  it('[blocker] ล้นจริงถึงจะมี overflow และต้องกันช่องสุดท้ายไว้ให้ปุ่ม', () => {
    // ที่ว่าง 5 ช่อง มี 7 ใบ → โชว์ 4 (เหลือช่องที่ 5 ให้ปุ่ม) ซ่อน 3
    expect(badgeRowFit(widthFor(5), 7)).toEqual({ visible: 4, overflow: 3 })
    // ขาดไปหนึ่งใบพอดี — 8 ใบในที่ของ 7
    expect(badgeRowFit(widthFor(7), 8)).toEqual({ visible: 6, overflow: 2 })
  })

  it('[blocker] ยังวัดความกว้างไม่ได้ → ถือว่าไม่ล้น ห้ามเดาว่าล้น', () => {
    // เฟรมแรก/SSR: เดาว่าล้นแล้วผิด = เหรียญกระพริบหายตอนโหลด
    expect(badgeRowFit(0, 7)).toEqual({ visible: 7, overflow: 0 })
    expect(badgeRowFit(-1, 7)).toEqual({ visible: 7, overflow: 0 })
  })

  it('แถบแคบมากยังต้องโชว์อย่างน้อย 1 ใบ ไม่ใช่ 0', () => {
    const r = badgeRowFit(20, 7)
    expect(r.visible).toBe(1)
    expect(r.overflow).toBe(6)
  })

  it('ไม่มีเหรียญเลย → ไม่มีอะไรทั้งนั้น', () => {
    expect(badgeRowFit(999, 0)).toEqual({ visible: 0, overflow: 0 })
  })
})
