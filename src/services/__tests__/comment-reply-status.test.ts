import { describe, it, expect } from 'vitest'
import { deriveCommentState, derivePostState } from '@/services/page-comment.service'

describe('deriveCommentState', () => {
  it('ไม่มีคำตอบของเพจเลย -> UNANSWERED', () => {
    expect(deriveCommentState([])).toBe('UNANSWERED')
  })

  it('มีแต่คอมเมนต์ของลูกค้าคนอื่น -> UNANSWERED', () => {
    expect(deriveCommentState([{ isFromPage: false, isAutoReply: false }])).toBe('UNANSWERED')
  })

  it('คำตอบของเพจทั้งหมดเป็นของบอท -> BOT_ANSWERED', () => {
    expect(deriveCommentState([{ isFromPage: true, isAutoReply: true }])).toBe('BOT_ANSWERED')
  })

  it('มีคำตอบของคนปนอยู่ -> HUMAN_ANSWERED', () => {
    expect(
      deriveCommentState([
        { isFromPage: true, isAutoReply: true },
        { isFromPage: true, isAutoReply: false },
      ]),
    ).toBe('HUMAN_ANSWERED')
  })
})

describe('derivePostState — ตัวที่แย่ที่สุดชนะ', () => {
  it('มีอันที่ยังไม่ตอบแม้อันเดียว -> UNANSWERED', () => {
    expect(derivePostState(['HUMAN_ANSWERED', 'BOT_ANSWERED', 'UNANSWERED'])).toBe('UNANSWERED')
  })

  it('ไม่มีอันที่ยังไม่ตอบ แต่มีบอทตอบ -> BOT_ANSWERED', () => {
    expect(derivePostState(['HUMAN_ANSWERED', 'BOT_ANSWERED'])).toBe('BOT_ANSWERED')
  })

  it('คนตอบหมดทุกอัน -> HUMAN_ANSWERED', () => {
    expect(derivePostState(['HUMAN_ANSWERED', 'HUMAN_ANSWERED'])).toBe('HUMAN_ANSWERED')
  })

  it('โพสต์ไม่มีคอมเมนต์เลย -> HUMAN_ANSWERED (ไม่มีอะไรค้าง จึงต้องไม่ขึ้นตัวนับ)', () => {
    expect(derivePostState([])).toBe('HUMAN_ANSWERED')
  })
})
