import { describe, it, expect } from 'vitest'
import {
  countUnansweredComments,
  visibleTopLevelComments,
  type CommentVisibilityRow,
} from '../comment-tree-visibility'

/**
 * feature 00038 — "ตัวเลขซ้ายต้องตรงกับของในเธรด" (impeccable critique 2026-08-09 รอบ 2 · P1)
 *
 * `CommentsClient.tsx` มีคอมเมนต์เตือนเรื่อง "ซ้ายบอก 8 แต่ panel บอก 7" อยู่ **3 ที่** แล้วบั๊ก
 * คลาสนี้ยังกลับมาได้อีกรอบ ผ่านการตัด top-level ของเพจทิ้งซึ่งพาลูกหายไปด้วย — คำเตือนสามอัน
 * ไม่ได้กันอันที่สี่ เทสชุดนี้กัน
 */

const row = (
  id: string,
  opts: Partial<Omit<CommentVisibilityRow, 'externalCommentId'>> = {},
): CommentVisibilityRow => ({
  externalCommentId: id,
  parentExternalId: opts.parentExternalId ?? null,
  isFromPage: opts.isFromPage ?? false,
  isDeleted: opts.isDeleted ?? false,
})

describe('visibleTopLevelComments', () => {
  it('คอมเมนต์ลูกค้าระดับบนแสดงเสมอ', () => {
    const list = [row('c1'), row('c2')]
    expect(visibleTopLevelComments(list, false).map((c) => c.externalCommentId)).toEqual(['c1', 'c2'])
  })

  it('คอมเมนต์ของเพจที่ไม่มีใครตอบ ถูกซ่อนเป็นค่าตั้งต้น', () => {
    const list = [row('p1', { isFromPage: true }), row('c1')]
    expect(visibleTopLevelComments(list, false).map((c) => c.externalCommentId)).toEqual(['c1'])
  })

  it('[blocker] คอมเมนต์ของเพจที่มีลูกค้ามาตอบข้างใต้ ต้องไม่ถูกตัด — ไม่งั้นคำถามหายทั้งกิ่ง', () => {
    // เคสจริงที่เครื่องมือสร้างเอง: กดส่งตอนยังไม่เลือกจะตอบใคร = คอมเมนต์ระดับบนของเพจ
    // แล้วลูกค้ามาตอบใต้นั้น ถ้าตัดพ่อทิ้ง `children.get(พ่อ)` ไม่มีใครเรียก ลูกหายไปด้วย
    const list = [row('p1', { isFromPage: true }), row('c1', { parentExternalId: 'p1' })]
    expect(visibleTopLevelComments(list, false).map((c) => c.externalCommentId)).toEqual(['p1'])
  })

  it('[blocker] เธรดที่มองเห็นต้องครอบคอมเมนต์ลูกค้าที่ยังไม่ตอบ "ครบทุกใบ" เท่าที่ตัวนับซ้ายนับ', () => {
    // นี่คือ invariant ตัวจริง: ผลรวมที่เห็นในเธรด ต้องไม่น้อยกว่าตัวเลขบนแถวซ้าย
    const list = [
      row('p1', { isFromPage: true }),
      row('q1', { parentExternalId: 'p1' }), // ลูกค้าถามใต้คอมเมนต์ของเพจ — เคยหายไปทั้งใบ
      row('q2'),
      row('p2', { isFromPage: true, parentExternalId: 'q2' }), // เพจตอบ q2 แล้ว
    ]
    const total = countUnansweredComments(list)
    expect(total).toBe(1) // เหลือ q1 ใบเดียว

    const tops = visibleTopLevelComments(list, false)
    const reachable = new Set<string>()
    for (const t of tops) {
      reachable.add(t.externalCommentId)
      for (const c of list) if (c.parentExternalId === t.externalCommentId) reachable.add(c.externalCommentId)
    }
    const unansweredReachable = list.filter(
      (c) =>
        !c.isFromPage &&
        !c.isDeleted &&
        !list.some((x) => x.isFromPage && x.parentExternalId === c.externalCommentId) &&
        reachable.has(c.externalCommentId),
    ).length
    expect(unansweredReachable).toBe(total)
  })

  it('คำตอบที่ถูกลบไม่นับเป็น "ลูกค้ามาตอบ" — กิ่งที่เหลือแต่ของที่ถูกลบไม่มีอะไรให้ทำต่อ', () => {
    const list = [
      row('p1', { isFromPage: true }),
      row('c1', { parentExternalId: 'p1', isDeleted: true }),
    ]
    expect(visibleTopLevelComments(list, false)).toEqual([])
  })

  it('showShopComments = แสดงคอมเมนต์ของเพจทั้งหมด', () => {
    const list = [row('p1', { isFromPage: true }), row('c1')]
    expect(visibleTopLevelComments(list, true).map((c) => c.externalCommentId)).toEqual(['p1', 'c1'])
  })
})

describe('countUnansweredComments — ต้องนับทุกชั้น เหมือนฝั่ง server', () => {
  it('คอมเมนต์ลูกค้าที่อยู่ลึกก็ยังนับ', () => {
    const list = [row('p1', { isFromPage: true }), row('q1', { parentExternalId: 'p1' })]
    expect(countUnansweredComments(list)).toBe(1)
  })

  it('มีคำตอบของเพจอยู่ข้างใต้แล้ว = ตอบแล้ว', () => {
    const list = [row('q1'), row('a1', { isFromPage: true, parentExternalId: 'q1' })]
    expect(countUnansweredComments(list)).toBe(0)
  })

  it('คอมเมนต์ที่ถูกลบไม่นับ · คอมเมนต์ของเพจเองไม่นับ', () => {
    const list = [row('q1', { isDeleted: true }), row('p1', { isFromPage: true })]
    expect(countUnansweredComments(list)).toBe(0)
  })
})
