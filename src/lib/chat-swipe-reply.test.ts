import { describe, expect, it } from 'vitest'

import {
  SWIPE_REPLY_MAX,
  SWIPE_REPLY_TRIGGER,
  swipeDistance,
  swipeIconOpacity,
  swipeLock,
  swipeOffset,
  swipeReached,
} from './chat-swipe-reply'

describe('chat-swipe-reply — ปัดตอบกลับเท่าแอปผู้ขาย', () => {
  it('ข้อความลูกค้าปัดขวา · ข้อความเราปัดซ้าย', () => {
    expect(swipeDistance(40, false)).toBe(40)
    expect(swipeDistance(-40, true)).toBe(40)
    expect(swipeDistance(40, true)).toBe(-40)
  })

  it('ตามนิ้วจนถึงระยะ แล้วหน่วง ไม่เกินเพดาน · ผิดทาง = ไม่ขยับ', () => {
    expect(swipeOffset(-30)).toBe(0)
    expect(swipeOffset(30)).toBe(30)
    expect(swipeOffset(SWIPE_REPLY_TRIGGER)).toBe(SWIPE_REPLY_TRIGGER)
    expect(swipeOffset(SWIPE_REPLY_TRIGGER + 10)).toBeCloseTo(SWIPE_REPLY_TRIGGER + 3)
    expect(swipeOffset(1000)).toBe(SWIPE_REPLY_MAX)
    expect(swipeOffset(Number.NaN)).toBe(0)
  })

  it('ไอคอนชัดขึ้นตามระยะ · ถึงระยะ = ตอบกลับ', () => {
    expect(swipeIconOpacity(0)).toBe(0)
    expect(swipeIconOpacity(32)).toBe(0.5)
    expect(swipeIconOpacity(500)).toBe(1)
    expect(swipeReached(SWIPE_REPLY_TRIGGER - 1)).toBe(false)
    expect(swipeReached(SWIPE_REPLY_TRIGGER)).toBe(true)
  })

  it('ล็อกแนวนอน — เลื่อนเธรดขึ้นลงต้องไม่ติด · ปัดผิดทางไม่ติด', () => {
    expect(swipeLock(5, 3, false)).toBe('pending')
    expect(swipeLock(20, 4, false)).toBe('swipe')
    expect(swipeLock(-20, 4, true)).toBe('swipe')
    expect(swipeLock(-20, 4, false)).toBe('cancel')
    expect(swipeLock(20, 4, true)).toBe('cancel')
    expect(swipeLock(5, 13, false)).toBe('cancel')
  })
})
