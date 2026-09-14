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

// [blocker] HR17 2026-09-29: รวม mergeRefreshedFirstPage (main) + patchConversationRows (branch delta)
// ต้องได้ทั้งสองอย่าง — ทิ้งแถวที่หลุดตัวกรองเมื่อไม่มีหน้าถัดไป และคง object เดิมของแถวที่ค่าไม่เปลี่ยน
describe('mergeRefreshedFirstPage + identity', () => {
  it('ไม่มีหน้าถัดไป: ทิ้งแถวที่หลุด แต่แถวที่ค่าเท่าเดิมเป็น object เดิม', () => {
    const a = { id: 'a', v: 1, o: { x: 1 } }
    const gone = { id: 'gone', v: 1, o: { x: 1 } }
    const out = mergeRefreshedFirstPage([a, gone], [{ id: 'a', v: 1, o: { x: 1 } }], { comparable: true, hasMore: false })
    expect(out.map((i) => i.id)).toEqual(['a'])
    expect(out[0]).toBe(a)
  })
  it('ไม่มีอะไรเปลี่ยนเลย: คืน array เดิม', () => {
    const prev = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }]
    const out = mergeRefreshedFirstPage(prev, [{ id: 'a', v: 1 }, { id: 'b', v: 2 }], { comparable: true, hasMore: true })
    expect(out).toBe(prev)
  })
})
