import { describe, expect, it } from 'vitest'
import { mergeRefreshedFirstPage } from '@/lib/inbox-refresh-merge'

const r = (id: string, v = 0) => ({ id, v })

describe('mergeRefreshedFirstPage', () => {
  // [blocker] prod 2026-09-21: แถวที่หลุดตัวกรอง "พัสดุมีปัญหา" ค้างพร้อมชิปเก่าข้ามคืน
  it('[blocker] หน้าแรกครบทุกแถวแล้ว (ไม่มีหน้าถัดไป) → ทิ้งแถวเดิมที่ไม่ตรงตัวกรองแล้ว', () => {
    const out = mergeRefreshedFirstPage([r('a'), r('solved'), r('b')], [r('a', 1), r('b', 1)], {
      comparable: true,
      hasMore: false,
    })
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
    expect(out.every((i) => i.v === 1)).toBe(true)
  })

  it('ยังมีหน้าถัดไป → เก็บแถวจาก loadMore ไว้ (ต่อท้าย ไม่ซ้ำ)', () => {
    const out = mergeRefreshedFirstPage([r('a'), r('older')], [r('new'), r('a', 1)], {
      comparable: true,
      hasMore: true,
    })
    expect(out.map((i) => i.id)).toEqual(['new', 'a', 'older'])
    expect(out.find((i) => i.id === 'a')?.v).toBe(1)
  })

  it('แถวเดิมเป็นของตัวกรองอื่น → ใช้ผลใหม่ล้วน', () => {
    const out = mergeRefreshedFirstPage([r('x')], [r('a')], { comparable: false, hasMore: true })
    expect(out.map((i) => i.id)).toEqual(['a'])
  })
})
