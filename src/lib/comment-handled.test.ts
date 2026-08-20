import { describe, expect, it } from 'vitest'
import { countUnansweredInThread, isCommentHandled } from './comment-handled'

type C = {
  isFromPage: boolean
  externalCommentId: string
  parentExternalId: string | null
  privateReplySentAt: string | null
  resolvedAt: string | null
  isDeleted: boolean
}
const c = (over: Partial<C> = {}): C => ({
  isFromPage: false,
  externalCommentId: 'x1',
  parentExternalId: null,
  privateReplySentAt: null,
  resolvedAt: null,
  isDeleted: false,
  ...over,
})

/**
 * ตัวเลข "ยังไม่ตอบ" โผล่ 2 ที่บนจอเดียว (แท็บซ้าย = server · ชิปในเธรด = ที่นี่)
 * เกณฑ์หลุดกันเมื่อไหร่ ผู้ขายเห็นสองเลขที่ไม่ตรงกันโดยไม่มี tsc/build ตัวไหนฟ้อง
 */
describe('[blocker] isCommentHandled — ต้อง mirror deriveCommentState ทุกกิ่ง', () => {
  it('คอมเมนต์ลูกค้าที่ไม่มีอะไรเลย = ยังไม่จบงาน', () => {
    expect(isCommentHandled(c(), [c()])).toBe(false)
  })

  it('คอมเมนต์ของเพจเอง = จบ (เพจไม่ต้องตอบตัวเอง)', () => {
    expect(isCommentHandled(c({ isFromPage: true }), [])).toBe(true)
  })

  it('มีคำตอบสาธารณะของเพจอยู่ข้างใต้ = จบ (ไม่ว่าคนหรือบอทเขียน)', () => {
    const target = c({ externalCommentId: 'p1' })
    const all = [target, c({ isFromPage: true, externalCommentId: 'r1', parentExternalId: 'p1' })]
    expect(isCommentHandled(target, all)).toBe(true)
  })

  it('คำตอบที่อยู่ใต้ "คอมเมนต์ใบอื่น" ต้องไม่นับให้ใบนี้', () => {
    const target = c({ externalCommentId: 'p1' })
    const all = [target, c({ isFromPage: true, externalCommentId: 'r1', parentExternalId: 'p2' })]
    expect(isCommentHandled(target, all)).toBe(false)
  })

  it('ทักแชทส่วนตัวสำเร็จแล้ว = จบ (user report 2026-08-09)', () => {
    expect(isCommentHandled(c({ privateReplySentAt: '2026-08-19T00:00:00Z' }), [])).toBe(true)
  })

  it('🛑 ถูกทำเครื่องหมายว่าจัดการแล้ว = จบ — กิ่งที่หายไปจนทำให้ตัวเลขในเธรดค้าง', () => {
    expect(isCommentHandled(c({ resolvedAt: '2026-08-19T00:00:00Z' }), [])).toBe(true)
  })
})

describe('[blocker] countUnansweredInThread', () => {
  it('นับคอมเมนต์ลูกค้าทุกชั้น ไม่ใช่เฉพาะระดับบน (user report 2026-08-03 "ซ้ายบอก 8 panel บอก 7")', () => {
    const all = [
      c({ externalCommentId: 'p1' }),
      c({ externalCommentId: 'r1', parentExternalId: 'p1' }), // ลูกค้าตอบใต้คอมเมนต์อื่น = ยังต้องตอบ
    ]
    expect(countUnansweredInThread(all)).toBe(2)
  })

  it('คอมเมนต์ที่ถูกลบและของเพจเองไม่นับ', () => {
    const all = [c({ isDeleted: true }), c({ isFromPage: true, externalCommentId: 'x2' })]
    expect(countUnansweredInThread(all)).toBe(0)
  })

  it('mark done แล้วเลขต้องลด — เคสที่ critique จับได้', () => {
    const before = [c({ externalCommentId: 'a' }), c({ externalCommentId: 'b' })]
    expect(countUnansweredInThread(before)).toBe(2)
    const after = [c({ externalCommentId: 'a', resolvedAt: '2026-08-19T00:00:00Z' }), c({ externalCommentId: 'b' })]
    expect(countUnansweredInThread(after)).toBe(1)
  })
})
