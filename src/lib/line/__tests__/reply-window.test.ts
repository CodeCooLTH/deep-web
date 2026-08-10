import { describe, it, expect } from 'vitest'
import { getLineReplyWindowState } from '@/lib/line/reply-window'
import { REPLY_SAFETY_MARGIN_MS } from '@/lib/line/constants'

// (S-14b, feature 00025 TFR-LINE-05) — พิสูจน์ด้วย mutation แล้วทุกข้อที่ติด [blocker]

const now = 1_800_000_000_000
const token = 'reply-token-1'

describe('getLineReplyWindowState', () => {
  it('[blocker] token ถูกใช้ไปแล้ว = ปิด แม้ยังไม่หมดอายุ (LINE ให้ใช้ครั้งเดียว)', () => {
    // mutation: ถอดเงื่อนไข replyTokenUsedAt ออก → ข้อนี้แดง (และหน้าจอจะบอกว่า "ส่งฟรี" ทั้งที่
    // ข้อความถัดไปจะถูกหักโควตาจริง)
    expect(
      getLineReplyWindowState(
        { replyToken: token, replyTokenExpiresAt: new Date(now + 50_000), replyTokenUsedAt: new Date(now - 1) },
        now,
      ),
    ).toEqual({ open: false, msRemaining: 0 })
  })

  it('ไม่มี token / ไม่มีวันหมดอายุ = ปิด', () => {
    expect(
      getLineReplyWindowState({ replyToken: null, replyTokenExpiresAt: new Date(now + 50_000), replyTokenUsedAt: null }, now),
    ).toEqual({ open: false, msRemaining: 0 })
    expect(
      getLineReplyWindowState({ replyToken: token, replyTokenExpiresAt: null, replyTokenUsedAt: null }, now),
    ).toEqual({ open: false, msRemaining: 0 })
  })

  it('token สดและยังไม่ถูกใช้ = เปิด พร้อมเวลาที่เหลือหักกันชนแล้ว', () => {
    const state = getLineReplyWindowState(
      { replyToken: token, replyTokenExpiresAt: new Date(now + 50_000), replyTokenUsedAt: null },
      now,
    )
    expect(state.open).toBe(true)
    expect(state.msRemaining).toBe(50_000 - REPLY_SAFETY_MARGIN_MS)
  })

  it('[blocker] ต้องหักกันชนความปลอดภัยเสมอ — เหลือเท่ากันชนพอดี = ปิดแล้ว', () => {
    // mutation: ลบ `- REPLY_SAFETY_MARGIN_MS` ออก → ข้อนี้แดง (หน้าจอจะบอกว่าฟรีในวินาทีที่ฝั่งส่ง
    // ตัดสินไปแล้วว่าใช้ push — สองนิยามเพี้ยนจากกันทันที)
    expect(
      getLineReplyWindowState(
        { replyToken: token, replyTokenExpiresAt: new Date(now + REPLY_SAFETY_MARGIN_MS), replyTokenUsedAt: null },
        now,
      ),
    ).toEqual({ open: false, msRemaining: 0 })
    expect(
      getLineReplyWindowState(
        { replyToken: token, replyTokenExpiresAt: new Date(now + REPLY_SAFETY_MARGIN_MS + 1), replyTokenUsedAt: null },
        now,
      ).open,
    ).toBe(true)
  })

  it('หมดอายุไปแล้ว = ปิด และ msRemaining ไม่ติดลบ', () => {
    expect(
      getLineReplyWindowState(
        { replyToken: token, replyTokenExpiresAt: new Date(now - 10_000), replyTokenUsedAt: null },
        now,
      ),
    ).toEqual({ open: false, msRemaining: 0 })
  })
})
