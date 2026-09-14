import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatChatBubbleTime, isSameBangkokDay } from '@/lib/format-date'

// 🛑 ทุกเคสอยู่ในช่วง 00:00–07:00 น. ไทย = วัน UTC ต่างจากวันไทย ⇒ เทียบวัน UTC แล้วต้องแดง
describe('[blocker] isSameBangkokDay — วันตามปฏิทินไทย ไม่ใช่ UTC (R22)', () => {
  it('23:50 เมื่อคืน กับ 00:30 วันนี้ (ไทย) = คนละวัน แม้เป็นวัน UTC เดียวกัน', () => {
    expect(isSameBangkokDay('2026-09-13T23:50:00+07:00', '2026-09-14T00:30:00+07:00')).toBe(false)
  })

  it('00:10 กับ 08:00 วันเดียวกัน (ไทย) = วันเดียวกัน แม้เป็นคนละวัน UTC', () => {
    expect(isSameBangkokDay('2026-09-14T00:10:00+07:00', '2026-09-14T08:00:00+07:00')).toBe(true)
  })
})

describe('[blocker] formatChatBubbleTime — แถวเวลาใต้บับเบิล (R22)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('วันนี้ = ชม.:นาที ล้วน', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T08:00:00+07:00'))
    expect(formatChatBubbleTime('2026-09-14T00:10:00+07:00')).toBe('00:10')
  })

  it('เมื่อคืนหลังเที่ยงคืนไม่นาน = บอกว่าเมื่อวาน ไม่ใช่ขึ้นแค่เวลา', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T00:30:00+07:00'))
    expect(formatChatBubbleTime('2026-09-13T23:50:00+07:00')).toBe('เมื่อวาน 23:50')
  })

  it('เก่ากว่านั้น = วันที่ย่อ + เวลา · ต่างปีมีปี พ.ศ.', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T08:00:00+07:00'))
    expect(formatChatBubbleTime('2026-09-12T14:03:00+07:00')).toBe('12 ก.ย. 14:03')
    expect(formatChatBubbleTime('2025-09-12T14:03:00+07:00')).toBe('12 ก.ย. 68 14:03')
  })
})
