import { describe, it, expect } from 'vitest'

import {
  describeDraftExpiry,
  compareByDraftExpiry,
  DRAFT_EXPIRY_WARN_MS,
} from '@/lib/auto-order-draft-expiry'

const NOW = Date.parse('2026-09-05T10:00:00.000Z')
const at = (ms: number) => new Date(NOW + ms)
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe('describeDraftExpiry (00061 หน้า C ข้อ 2)', () => {
  it('[blocker] ≤24 ชม. ต้องเปลี่ยนโทนเป็นเตือน และพูดเป็น "ชั่วโมง" ไม่ใช่ "วัน"', () => {
    // "เหลือ 1 วัน" ตอนเหลือจริง 3 ชั่วโมง = การบอกให้ชะล่าใจ
    const r = describeDraftExpiry(at(3 * HOUR), NOW)
    expect(r?.tone).toBe('warning')
    expect(r?.text).toBe('หมดอายุใน 3 ชม.')
  })

  it('[blocker] เกิน 24 ชม. = โทนเงียบ พูดเป็นวัน', () => {
    const r = describeDraftExpiry(at(3 * DAY), NOW)
    expect(r?.tone).toBe('muted')
    expect(r?.text).toBe('หมดอายุใน 3 วัน')
  })

  it('[blocker] เส้นแบ่งอยู่ที่ 24 ชม. พอดี ไม่ใช่ 23 หรือ 25', () => {
    expect(describeDraftExpiry(at(DRAFT_EXPIRY_WARN_MS), NOW)?.tone).toBe('warning')
    expect(describeDraftExpiry(at(DRAFT_EXPIRY_WARN_MS + 1), NOW)?.tone).toBe('muted')
  })

  it('[blocker] หมดอายุแล้วต้องพูดว่า "หมดอายุแล้ว" ไม่ใช่ "เหลือ 0 วัน"', () => {
    // เกิดจริงได้: ตัวกวาดวิ่งทุก 2 นาที ⇒ มีช่วงที่ร่างหมดอายุแล้วแต่ยังโผล่บนจอ
    const r = describeDraftExpiry(at(-HOUR), NOW)
    expect(r?.text).toBe('หมดอายุแล้ว')
    expect(r?.tone).toBe('danger')
  })

  it('ปัดขึ้นเสมอ — เหลือ 90 นาที ต้องอ่านว่า 2 ชม. ไม่ใช่ 1', () => {
    expect(describeDraftExpiry(at(90 * 60 * 1000), NOW)?.text).toBe('หมดอายุใน 2 ชม.')
  })

  it('ไม่ใช่ร่าง / ค่าเสีย → ไม่มีป้าย', () => {
    expect(describeDraftExpiry(null, NOW)).toBeNull()
    expect(describeDraftExpiry(undefined, NOW)).toBeNull()
    expect(describeDraftExpiry('ไม่ใช่วันที่', NOW)).toBeNull()
  })

  it('มี ariaLabel เต็มประโยคเสมอ — ป้ายสั้นบนจอไม่บอกว่าตัวเลขคืออะไร', () => {
    for (const offset of [-HOUR, 3 * HOUR, 3 * DAY]) {
      const r = describeDraftExpiry(at(offset), NOW)
      expect(r?.ariaLabel.length).toBeGreaterThan((r?.text.length ?? 0) + 3)
    }
  })
})

describe('compareByDraftExpiry', () => {
  it('[blocker] ใกล้หมดอายุก่อน — กลับหัวกับ createdAt DESC ของหน้า', () => {
    const rows = [
      { id: 'far', expiresAt: at(6 * DAY).toISOString() },
      { id: 'near', expiresAt: at(2 * HOUR).toISOString() },
      { id: 'mid', expiresAt: at(2 * DAY).toISOString() },
    ]
    expect([...rows].sort(compareByDraftExpiry).map((r) => r.id)).toEqual(['near', 'mid', 'far'])
  })

  it('แถวที่ไม่มี expiresAt ไปท้ายสุดเสมอ', () => {
    const rows = [
      { id: 'none', expiresAt: null },
      { id: 'near', expiresAt: at(HOUR).toISOString() },
    ]
    expect([...rows].sort(compareByDraftExpiry).map((r) => r.id)).toEqual(['near', 'none'])
  })
})
