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

  /**
   * [blocker] เคสจริงบน prod (user เจอเอง 2026-08-20 พร้อมภาพเทียบกับ Facebook)
   *
   * ลูกค้าคอมเมนต์ใต้โพสต์อัลบั้ม **2 ใบ ระดับบนทั้งคู่** (ภาพจาก Facebook ยืนยัน: อยู่ใต้โพสต์
   * ตรง ๆ ไม่ซ้อนใต้ใคร) แต่ Meta ส่ง `parent_id` มาเป็น **id ของอัลบั้ม ไม่ใช่ id ของคอมเมนต์**
   * ⇒ เราบันทึกเป็น "reply ของคอมเมนต์ที่ไม่มีอยู่จริง" ⇒ ตัวประกอบต้นไม้ทิ้งทั้งคู่
   * ⇒ ผู้ขายเห็น "ยังไม่ตอบ 2" คู่กับ "ยังไม่มีความคิดเห็นในโพสต์นี้" บนจอเดียวกัน
   * และคำว่า "สนใจ" ของลูกค้าค้างอยู่ 7 วันโดยไม่มีใครเห็น (ทั้ง prod มี 8 ใบแบบนี้ 9 โพสต์ 3 เพจ)
   *
   * 🛑 ตาข่ายนี้ต้องอยู่ **แยกจาก** การแก้ตัวจำแนกตอน ingest — ตัวนั้นกันรูปแบบที่เรารู้จักแล้ว
   * ส่วนตัวนี้กันรูปแบบที่ Meta ยังไม่เคยส่งมาให้เห็น กติกาคือ **ทุกแถวที่ตัวนับนับ ต้องมีที่ยืน
   * บนหน้าจอเสมอ** ไม่ว่า payload จะหน้าตาอย่างไร
   */
  it('[blocker] reply ที่หาแม่ไม่เจอในชุดข้อมูล ต้องถูกยกขึ้นเป็นระดับบน ไม่ใช่หล่นหาย', () => {
    const list = [
      row('c1', { parentExternalId: 'ghost' }),
      row('c2', { parentExternalId: 'ghost' }),
    ]
    expect(visibleTopLevelComments(list, false).map((c) => c.externalCommentId)).toEqual(['c1', 'c2'])
  })

  it('[blocker] จำนวนที่เห็นในเธรดต้องไม่น้อยกว่าที่ตัวนับนับ แม้ทุกใบจะกำพร้า', () => {
    const list = [
      row('c1', { parentExternalId: 'ghost' }),
      row('c2', { parentExternalId: 'ghost' }),
      row('c3'),
    ]
    const visible = visibleTopLevelComments(list, false)
    const reachable = new Set(visible.map((c) => c.externalCommentId))
    for (const c of list) {
      if (c.parentExternalId && reachable.has(c.parentExternalId)) reachable.add(c.externalCommentId)
    }
    expect(reachable.size).toBe(countUnansweredComments(list))
  })

  it('กำพร้าที่เป็นของเพจเอง ยังถูกซ่อนตามกติกาเดิม — การยกขึ้นระดับบนไม่ใช่ใบเบิกให้โผล่', () => {
    const list = [row('p1', { isFromPage: true, parentExternalId: 'ghost' }), row('c1')]
    expect(visibleTopLevelComments(list, false).map((c) => c.externalCommentId)).toEqual(['c1'])
  })

  it('reply ที่แม่อยู่ในชุดข้อมูลจริง ต้องยังเป็นลูกเหมือนเดิม ไม่ถูกยกขึ้นมาลอย', () => {
    const list = [row('c1'), row('c2', { parentExternalId: 'c1' })]
    expect(visibleTopLevelComments(list, false).map((c) => c.externalCommentId)).toEqual(['c1'])
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
