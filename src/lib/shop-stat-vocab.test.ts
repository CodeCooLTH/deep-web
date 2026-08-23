import { describe, it, expect } from 'vitest'

import { profileSoldLine } from './shop-stat-vocab'

/**
 * [blocker] feature 00053 — ประโยคยอดสะสมบนการ์ดหน้าร้าน (TC-C1)
 *
 * บรรทัดนี้คือสิ่งเดียวที่ยังพูดแทนร้านได้บนการ์ดเมื่อร้านซ่อนราคา — ผู้ใช้ระบุตรง ๆ 2026-08-23
 * ว่า "ยังต้องมีคำว่า ใช้บริการแล้ว 3 ครั้ง"
 */
describe('[blocker] profileSoldLine', () => {
  it('ร้านขายออนไลน์ → "ขายแล้ว N ชิ้น"', () => {
    expect(profileSoldLine({ itemKind: 'PRODUCT' }, '12')).toBe('ขายแล้ว 12 ชิ้น')
  })

  it('ร้านคิวงาน → "ใช้บริการแล้ว N ครั้ง" (ลักษณนามเปลี่ยนตามกริยา ไม่ใช่แค่เปลี่ยนคำนาม)', () => {
    expect(profileSoldLine({ itemKind: 'PRODUCT', isServiceQueue: true }, '3')).toBe(
      'ใช้บริการแล้ว 3 ครั้ง',
    )
  })

  it('การ์ดห้องพัก → "เข้าพักแล้ว N ครั้ง"', () => {
    expect(profileSoldLine({ itemKind: 'ROOM' }, '8')).toBe('เข้าพักแล้ว 8 ครั้ง')
  })

  it('🛑 ตัวตัดสินคือ "การ์ดใบนี้เป็นอะไร" มาก่อน "ร้านนี้ประเภทอะไร" — ห้องพักในร้านคิวงานยังอ่านว่าเข้าพัก', () => {
    expect(profileSoldLine({ itemKind: 'ROOM', isServiceQueue: true }, '8')).toBe('เข้าพักแล้ว 8 ครั้ง')
  })

  it('ตัวเลขถูกใส่ตามที่ผู้เรียกจัดรูปมา (คั่นหลักแล้ว) ไม่ถูกแปลงซ้ำ', () => {
    expect(profileSoldLine({ itemKind: 'PRODUCT' }, '1,204')).toBe('ขายแล้ว 1,204 ชิ้น')
  })
})
