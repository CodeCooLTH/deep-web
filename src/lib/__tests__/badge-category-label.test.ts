/**
 * ด่านของ `badgeCategoryLabel` — ป้ายหมวดเหรียญในหน้าเหรียญเต็มจอ
 *
 * 🛑 เหตุผลที่ต้องมีด่าน ไม่ใช่แค่คอมเมนต์: ป้ายนี้บอกผู้ซื้อว่า "ร้านนี้ได้เหรียญเพราะเรื่องอะไร"
 * ถ้าชนิดเกณฑ์ที่ไม่รู้จักตกไปเป็นหมวดใดหมวดหนึ่งโดยปริยาย มันจะกลายเป็นคำโฆษณาที่ระบบไม่ได้วัด
 * และ **ไม่มี gate ไหนของโปรเจกต์จับได้เลย** เพราะสตริงถูกต้องตามชนิดทุกตัวอักษร
 * (คลาสเดียวกับ ternary ที่ตกท้ายเป็น 'Instagram' 2026-08-12 และ if/else ที่ตกท้ายเป็น
 * Facebook 2026-08-15 — ทั้งสองครั้งตัวการคือ "ค่าตั้งต้น" ไม่ใช่ตัวตรรกะ)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { badgeCategoryLabel } from '../badge-criteria'

describe('badgeCategoryLabel', () => {
  it('[blocker] ชนิดที่ไม่รู้จักต้องคืน null ห้ามตกไปเป็นหมวดใดหมวดหนึ่ง', () => {
    expect(badgeCategoryLabel({ type: 'SOMETHING_NEW_2027' })).toBeNull()
    expect(badgeCategoryLabel({ type: '' })).toBeNull()
    expect(badgeCategoryLabel({})).toBeNull()
    expect(badgeCategoryLabel(null)).toBeNull()
    expect(badgeCategoryLabel('ORDER_COUNT')).toBeNull()
  })

  it('[blocker] เกณฑ์ทุกชนิดที่มีอยู่จริงใน seed ต้องมีหมวด — ไม่งั้นเหรียญจริงจะไม่มีป้าย', () => {
    /* อ่านจาก seed จริงแทนการเขียนรายชื่อไว้ในเทส — เพิ่มเหรียญชนิดใหม่วันหลังแล้วลืมเติมหมวด
       ด่านนี้จะแดงเอง ซึ่งเป็นเหตุผลทั้งหมดที่มันมีอยู่ (ถ้า hardcode รายชื่อ มันจะเขียวตลอดไป) */
    const seed = readFileSync(join(process.cwd(), 'prisma/badge-seed-data.ts'), 'utf8')
    const types = [...seed.matchAll(/criteria:\s*\{\s*type:\s*"([A-Z_]+)"/g)].map((m) => m[1])

    expect(types.length).toBeGreaterThan(10)
    const missing = [...new Set(types)].filter((t) => badgeCategoryLabel({ type: t }) === null)
    expect(missing).toEqual([])
  })

  it('เกณฑ์คนละชนิดที่สื่อเรื่องเดียวกัน ต้องได้หมวดเดียวกัน', () => {
    expect(badgeCategoryLabel({ type: 'FIRST_ORDER' })).toBe(badgeCategoryLabel({ type: 'ORDER_COUNT' }))
    expect(badgeCategoryLabel({ type: 'HIGH_RATING' })).toBe(badgeCategoryLabel({ type: 'PERFECT_RATING' }))
  })
})
