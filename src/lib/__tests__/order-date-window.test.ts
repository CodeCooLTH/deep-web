import { describe, it, expect } from 'vitest'
import {
  ORDER_BACKDATE_DAYS,
  ORDER_FUTUREDATE_DAYS,
  orderDateWindow,
  isOrderDateInWindow,
  orderDateRejectReason,
} from '../order-date-window'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 7, 6, 2, 12, 0) // 6 ส.ค. 2026 09:12 น. เวลาไทย

describe('orderDateWindow', () => {
  it('ขอบล่าง = now − 90 วัน, ขอบบน = now + 7 วัน', () => {
    const w = orderDateWindow(NOW)
    expect(w.minMs).toBe(NOW - ORDER_BACKDATE_DAYS * DAY)
    expect(w.maxMs).toBe(NOW + ORDER_FUTUREDATE_DAYS * DAY)
  })
})

describe('isOrderDateInWindow', () => {
  it('ตอนนี้ = ผ่าน', () => {
    expect(isOrderDateInWindow(NOW, NOW)).toBe(true)
  })

  it('เมื่อคืน 21:14 = ผ่าน (เคสหลักของฟีเจอร์นี้)', () => {
    expect(isOrderDateInWindow(NOW - 12 * 60 * 60 * 1000, NOW)).toBe(true)
  })

  it('ขอบพอดีทั้งสองด้าน = ผ่าน (inclusive)', () => {
    expect(isOrderDateInWindow(NOW - 90 * DAY, NOW)).toBe(true)
    expect(isOrderDateInWindow(NOW + 7 * DAY, NOW)).toBe(true)
  })

  it('เกินขอบ 1 วินาที = ตก', () => {
    expect(isOrderDateInWindow(NOW - 90 * DAY - 1000, NOW)).toBe(false)
    expect(isOrderDateInWindow(NOW + 7 * DAY + 1000, NOW)).toBe(false)
  })

  it('NaN = ตก (fail-closed)', () => {
    expect(isOrderDateInWindow(NaN, NOW)).toBe(false)
  })

  it('Infinity = ตก', () => {
    expect(isOrderDateInWindow(Infinity, NOW)).toBe(false)
    expect(isOrderDateInWindow(-Infinity, NOW)).toBe(false)
  })
})

describe('orderDateRejectReason', () => {
  it('ค่าที่ใช้ได้ → null', () => {
    expect(orderDateRejectReason(NOW, NOW)).toBeNull()
  })

  it('ค่าที่ใช้ไม่ได้ → ข้อความไทยที่บอกทั้งสองขอบ', () => {
    const reason = orderDateRejectReason(NOW - 100 * DAY, NOW)
    expect(reason).toContain('90')
    expect(reason).toContain('7')
  })
})
