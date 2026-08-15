import { describe, it, expect } from 'vitest'
import { evaluateCommentGate } from '@/services/comment-auto-reply.service'

/** อินพุตที่ผ่านทุกด่าน — แต่ละเทส override เฉพาะช่องที่ทดสอบ */
function ok(over: Partial<Parameters<typeof evaluateCommentGate>[0]> = {}) {
  return {
    isFromPage: false,
    parentExternalId: null,
    isDeleted: false,
    fromExternalId: 'psid-1',
    channelStatus: 'ACTIVE',
    publicEnabled: true,
    publicText: 'ขอบคุณที่สนใจครับ',
    privateEnabled: true,
    privateText: 'สวัสดีครับ',
    hasHumanReply: false,
    ...over,
  }
}

describe('evaluateCommentGate', () => {
  it('ผ่านทุกด่าน', () => {
    expect(evaluateCommentGate(ok())).toEqual({ pass: true })
  })

  it('คอมเมนต์ของเพจเอง -> FROM_PAGE', () => {
    expect(evaluateCommentGate(ok({ isFromPage: true }))).toEqual({ pass: false, reason: 'FROM_PAGE' })
  })

  it('reply ซ้อน -> NOT_TOP_LEVEL', () => {
    expect(evaluateCommentGate(ok({ parentExternalId: '123_456' }))).toEqual({
      pass: false, reason: 'NOT_TOP_LEVEL',
    })
  })

  it('คอมเมนต์ถูกลบ -> COMMENT_DELETED', () => {
    expect(evaluateCommentGate(ok({ isDeleted: true }))).toEqual({ pass: false, reason: 'COMMENT_DELETED' })
  })

  it('ไม่มี fromExternalId -> NO_SENDER_ID (กันซ้ำไม่ได้ ต้องข้าม)', () => {
    expect(evaluateCommentGate(ok({ fromExternalId: null }))).toEqual({
      pass: false, reason: 'NO_SENDER_ID',
    })
  })

  it('เพจโทเคนหมดอายุ -> CHANNEL_INACTIVE', () => {
    expect(evaluateCommentGate(ok({ channelStatus: 'TOKEN_INVALID' }))).toEqual({
      pass: false, reason: 'CHANNEL_INACTIVE',
    })
  })

  it('ปิดทั้ง 2 สวิตช์ -> DISABLED', () => {
    expect(evaluateCommentGate(ok({ publicEnabled: false, privateEnabled: false }))).toEqual({
      pass: false, reason: 'DISABLED',
    })
  })

  it('เปิดสวิตช์แต่ข้อความว่างทั้งคู่ -> DISABLED', () => {
    expect(evaluateCommentGate(ok({ publicText: '  ', privateText: null }))).toEqual({
      pass: false, reason: 'DISABLED',
    })
  })

  it('เปิดแค่สวิตช์เดียวและมีข้อความ -> ผ่าน', () => {
    expect(evaluateCommentGate(ok({ privateEnabled: false, privateText: null }))).toEqual({ pass: true })
  })

  // [blocker] 2026-08-15 — ด่านนี้ต้องไม่รู้จัก "เคยตอบคนนี้บนโพสต์นี้แล้ว" อีกต่อไป
  // เพดานครั้งเดียวต่อคนต่อโพสต์เหลือครอบเฉพาะฝั่งทักแชท และบังคับด้วย partial unique index บน
  // privateAttemptedAt ไม่ใช่ที่ด่านนี้ (BR-CR-A2a/A2b) — ถ้าใครเผลอเติมกลับมา คอมเมนต์ที่ 2
  // ของลูกค้าคนเดิมจะเงียบสนิททั้งแถวอีกครั้ง ซึ่งเป็นบั๊กที่ user เจอเองบน prod
  it('[blocker] ด่านไม่มีช่อง hasAutoLogForPerson แล้ว — คีย์แปลกปลอมต้องไม่ทำให้ตก', () => {
    expect(evaluateCommentGate({ ...ok(), hasAutoLogForPerson: true } as never)).toEqual({ pass: true })
  })

  it('คนในทีมตอบไปแล้ว -> HUMAN_ANSWERED (บอทต้องหลีกทางให้คน)', () => {
    expect(evaluateCommentGate(ok({ hasHumanReply: true }))).toEqual({
      pass: false, reason: 'HUMAN_ANSWERED',
    })
  })

  it('ลำดับด่าน: เป็นคอมเมนต์ของเพจ + ถูกลบ -> รายงาน FROM_PAGE (ด่านแรกชนะ)', () => {
    expect(evaluateCommentGate(ok({ isFromPage: true, isDeleted: true }))).toEqual({
      pass: false, reason: 'FROM_PAGE',
    })
  })
})
