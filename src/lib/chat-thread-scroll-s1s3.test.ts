import { describe, expect, it } from 'vitest'
import {
  CHAT_CLOCK_FAST_MS,
  CHAT_CLOCK_LABEL_WINDOW_MS,
  CHAT_CLOCK_SLOW_MS,
  chatClockIntervalMs,
  scrollTopAfterPrepend,
} from './chat-thread-scroll'

describe('scrollTopAfterPrepend [blocker]', () => {
  it('บวก prevTop ด้วย (ผู้ใช้ไม่ได้อยู่บนสุดพอดี)', () => {
    expect(scrollTopAfterPrepend({ prevTop: 120, prevHeight: 2000, nextHeight: 3500 })).toBe(1620)
  })
  it('อยู่บนสุดพอดี = ส่วนต่างความสูงล้วน', () => {
    expect(scrollTopAfterPrepend({ prevTop: 0, prevHeight: 2000, nextHeight: 3500 })).toBe(1500)
  })
  it('ความสูงไม่โต (ไม่มีอะไรเพิ่ม) = ไม่ขยับ ไม่ติดลบ', () => {
    expect(scrollTopAfterPrepend({ prevTop: 50, prevHeight: 2000, nextHeight: 1900 })).toBe(50)
  })
})

describe('chatClockIntervalMs [blocker]', () => {
  it('LINE = 1 วิเสมอ แม้เหลือเวลาเยอะ', () => {
    expect(chatClockIntervalMs({ isLine: true, remainingMs: 10 * CHAT_CLOCK_LABEL_WINDOW_MS })).toBe(CHAT_CLOCK_FAST_MS)
  })
  it('ช่องอื่น ≤ 4 ชม. = 1 วิ (ป้ายโชว์วินาที)', () => {
    expect(chatClockIntervalMs({ isLine: false, remainingMs: CHAT_CLOCK_LABEL_WINDOW_MS })).toBe(CHAT_CLOCK_FAST_MS)
    expect(chatClockIntervalMs({ isLine: false, remainingMs: 1000 })).toBe(CHAT_CLOCK_FAST_MS)
  })
  it('ช่องอื่น > 4 ชม. = 30 วิ', () => {
    expect(chatClockIntervalMs({ isLine: false, remainingMs: CHAT_CLOCK_LABEL_WINDOW_MS + 1 })).toBe(CHAT_CLOCK_SLOW_MS)
  })
})
