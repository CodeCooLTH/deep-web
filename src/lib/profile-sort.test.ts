import { describe, it, expect } from 'vitest'

import {
  MAX_PROFILE_PRODUCTS,
  isProfileListTruncated,
  nextSortMode,
  sortProfileProducts,
  type ProfileSortMode,
} from './profile-sort'

/**
 * [blocker] feature 00053 — ตัวเรียงกริดสินค้าบนหน้าร้านสาธารณะ (TC-E1, TC-E2)
 *
 * 🛑 ชุดข้อมูลด้านล่างถูกออกแบบให้ **ลำดับของสองเกณฑ์ไม่ตรงกัน** โดยเจตนา (ตัวขายดีที่สุดคือ
 * ตัวที่ถูกใจน้อยที่สุด) — ถ้าใช้ข้อมูลที่เรียงแล้วออกมาเหมือนกันทั้งสองเกณฑ์ การสลับ `soldCount`
 * กับ `likeCount` ในโค้ดจะทำให้เทสยังเขียว = เทสไม่ได้กันสิ่งที่มันอ้างว่ากัน
 * (docs/conventions/mutation-silence-means-weak-corpus.md) **ห้ามลบแถวใดออกเพราะเห็นว่าซ้ำ**
 */
const ITEMS = [
  { id: 'a', soldCount: 1, likeCount: 90 },
  { id: 'b', soldCount: 50, likeCount: 2 },
  { id: 'c', soldCount: 7, likeCount: 40 },
  // ค่าเท่ากับ 'c' ทั้งสองช่อง — ไว้พิสูจน์ความเสถียร (ต้องอยู่หลัง 'c' เสมอ)
  { id: 'd', soldCount: 7, likeCount: 40 },
  // สินค้าที่ยังไม่มีข้อมูลถูกใจเลย (SerializedProduct.likeCount เป็น optional จริง ๆ)
  { id: 'e', soldCount: 3 } as { id: string; soldCount: number; likeCount?: number },
]

const ids = (mode: ProfileSortMode) => sortProfileProducts(ITEMS, mode).map((i) => i.id)

describe('[blocker] sortProfileProducts', () => {
  it('DEFAULT คืนลำดับเดิมทุกประการ', () => {
    expect(ids('DEFAULT')).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('BEST_SELLING เรียงตามยอดขาย มาก→น้อย (ไม่ใช่ยอดถูกใจ)', () => {
    expect(ids('BEST_SELLING')).toEqual(['b', 'c', 'd', 'e', 'a'])
  })

  it('POPULAR เรียงตามยอดถูกใจ มาก→น้อย (ไม่ใช่ยอดขาย)', () => {
    expect(ids('POPULAR')).toEqual(['a', 'c', 'd', 'b', 'e'])
  })

  it('ค่าเท่ากันคงลำดับเดิม (stable) — ไม่งั้นการ์ดสลับที่เองทุก re-render', () => {
    const sorted = sortProfileProducts(ITEMS, 'BEST_SELLING')
    const c = sorted.findIndex((i) => i.id === 'c')
    const d = sorted.findIndex((i) => i.id === 'd')
    expect(c).toBeLessThan(d)
  })

  it('ไม่แก้ array ต้นฉบับ', () => {
    const before = ITEMS.map((i) => i.id)
    sortProfileProducts(ITEMS, 'POPULAR')
    expect(ITEMS.map((i) => i.id)).toEqual(before)
  })

  it('รายการที่ไม่มี likeCount ถูกอ่านเป็น 0 ไม่ใช่ NaN (ไม่ตกไปอยู่ผิดที่)', () => {
    expect(ids('POPULAR').at(-1)).toBe('e')
  })
})

describe('[blocker] nextSortMode', () => {
  it('กดชิปใหม่ → เปลี่ยนไปโหมดนั้น', () => {
    expect(nextSortMode('DEFAULT', 'BEST_SELLING')).toBe('BEST_SELLING')
    expect(nextSortMode('BEST_SELLING', 'POPULAR')).toBe('POPULAR')
  })

  it('กดชิปที่เลือกอยู่ซ้ำ → กลับไป DEFAULT (ทางเดียวที่ผู้ชมยกเลิกการเรียงได้ เพราะไม่มีชิป "ล่าสุด")', () => {
    expect(nextSortMode('BEST_SELLING', 'BEST_SELLING')).toBe('DEFAULT')
    expect(nextSortMode('POPULAR', 'POPULAR')).toBe('DEFAULT')
  })
})

describe('isProfileListTruncated', () => {
  it('น้อยกว่าเพดาน = ครบแล้ว ไม่ต้องมีป้าย', () => {
    expect(isProfileListTruncated(MAX_PROFILE_PRODUCTS - 1)).toBe(false)
  })

  it('ชนเพดานพอดี = ถือว่าอาจมีมากกว่านี้ ต้องมีป้าย', () => {
    expect(isProfileListTruncated(MAX_PROFILE_PRODUCTS)).toBe(true)
  })
})
