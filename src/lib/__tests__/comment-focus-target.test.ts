import { describe, it, expect } from 'vitest'
import { pickCommentFocusTarget, type FocusCandidate } from '@/lib/comment-focus-target'

function c(over: Partial<FocusCandidate> & { id: string }): FocusCandidate {
  return {
    externalCommentId: `ext-${over.id}`,
    parentExternalId: null,
    isFromPage: false,
    isDeleted: false,
    createdTime: '2026-08-15T00:00:00.000Z',
    ...over,
  }
}

/** เธรดจริง: ลูกค้า 3 คน โดย c3 (ใหม่สุด) มีคำตอบของเพจแล้ว ส่วน c2 ยังไม่มี */
const THREAD: FocusCandidate[] = [
  c({ id: 'c1', createdTime: '2026-08-10T00:00:00.000Z' }),
  c({ id: 'c2', createdTime: '2026-08-12T00:00:00.000Z' }),
  c({ id: 'c3', createdTime: '2026-08-14T00:00:00.000Z' }),
  c({ id: 'page-reply-c3', isFromPage: true, parentExternalId: 'ext-c3', createdTime: '2026-08-14T01:00:00.000Z' }),
  c({ id: 'page-reply-c1', isFromPage: true, parentExternalId: 'ext-c1', createdTime: '2026-08-10T01:00:00.000Z' }),
]

describe('pickCommentFocusTarget', () => {
  // [blocker] 2026-08-15 — หัวใจของบั๊กที่ user รายงาน: กดแถวคอมเมนต์ใบไหน ต้องไปใบนั้น
  // ถ้าใครถอด clickedCommentId ออก ตัวเลือกจะตกไปใช้กฎ "ใบล่าสุดที่ยังไม่ถูกตอบ" เงียบ ๆ
  // แล้วผลลัพธ์ยัง "ดูถูก" อยู่เสมอ (คืนคอมเมนต์ที่มีจริงในเธรด) จึงไม่มีอะไรจับได้เลยถ้าไม่มีเทสนี้
  it('[blocker] กดคอมเมนต์ใบไหน -> ได้ใบนั้น ไม่ใช่ใบที่กฎเลือกให้', () => {
    expect(pickCommentFocusTarget(THREAD, 'c1')?.id).toBe('c1')
    expect(pickCommentFocusTarget(THREAD, 'c2')?.id).toBe('c2')
    expect(pickCommentFocusTarget(THREAD, 'c3')?.id).toBe('c3')
  })

  // [blocker] ใบที่กดชนะแม้ถูกตอบไปแล้ว — การกดคือเจตนาตรง ๆ ระบบไม่มีสิทธิ์เดาแทนว่า
  // "น่าจะอยากได้ใบที่ยังไม่ถูกตอบมากกว่า" (c3 มีคำตอบของเพจอยู่แล้ว)
  it('[blocker] ใบที่กดถูกตอบไปแล้ว -> ยังต้องได้ใบนั้น ไม่ข้ามไปหาใบที่ยังไม่ถูกตอบ', () => {
    expect(pickCommentFocusTarget(THREAD, 'c3')?.id).toBe('c3')
  })

  it('ไม่ได้กดมาจากแถว (null) -> ใบลูกค้าที่ใหม่สุดที่ยังไม่มีคำตอบของเพจ', () => {
    expect(pickCommentFocusTarget(THREAD, null)?.id).toBe('c2')
  })

  it('ตอบครบทุกใบแล้ว -> ตกไปใช้ใบลูกค้าที่ใหม่สุด', () => {
    const allAnswered = [
      c({ id: 'a', createdTime: '2026-08-10T00:00:00.000Z' }),
      c({ id: 'b', createdTime: '2026-08-14T00:00:00.000Z' }),
      c({ id: 'r-a', isFromPage: true, parentExternalId: 'ext-a' }),
      c({ id: 'r-b', isFromPage: true, parentExternalId: 'ext-b' }),
    ]
    expect(pickCommentFocusTarget(allAnswered, null)?.id).toBe('b')
  })

  // [blocker] คอมเมนต์ของเพจเองห้ามถูกจ่อตอบ ต่อให้ id ตรงกับที่ส่งมา (จ่อตอบตัวเอง = ไร้ความหมาย)
  it('[blocker] id ที่กดชี้ไปที่คอมเมนต์ของเพจเอง -> ตกไปใช้กฎ ไม่ใช่จ่อตอบตัวเอง', () => {
    expect(pickCommentFocusTarget(THREAD, 'page-reply-c3')?.id).toBe('c2')
  })

  it('id ที่กดชี้ไปที่คอมเมนต์ที่ถูกลบ -> ตกไปใช้กฎ', () => {
    const withDeleted = [...THREAD, c({ id: 'gone', isDeleted: true, createdTime: '2026-08-15T00:00:00.000Z' })]
    expect(pickCommentFocusTarget(withDeleted, 'gone')?.id).toBe('c2')
  })

  it('id ที่กดหาไม่เจอในเธรด -> ตกไปใช้กฎ ไม่ throw ไม่คืน null', () => {
    expect(pickCommentFocusTarget(THREAD, 'ไม่มีจริง')?.id).toBe('c2')
  })

  it('เธรดไม่มีคอมเมนต์ลูกค้าเลย -> null (ไม่มีอะไรให้จ่อ)', () => {
    expect(pickCommentFocusTarget([c({ id: 'p', isFromPage: true })], null)).toBeNull()
    expect(pickCommentFocusTarget([], 'c1')).toBeNull()
  })

  it('ไม่แก้ไขอาร์เรย์ที่รับเข้ามา (ผู้เรียกส่ง state ของ React ตรง ๆ)', () => {
    const input = [...THREAD]
    const snapshot = input.map((x) => x.id)
    pickCommentFocusTarget(input, null)
    expect(input.map((x) => x.id)).toEqual(snapshot)
  })
})
