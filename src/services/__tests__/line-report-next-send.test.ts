import { describe, expect, it } from 'vitest'
import { nextSendAtOf } from '@/services/line-report-group.service'

const th = (iso: string, hm: string) => new Date(`${iso}T${hm}:00+07:00`).getTime()
const now = new Date('2026-10-01T12:00:00+07:00')
const base = { dailyEnabled: false, monthlyEnabled: false, cutoffDay: 5 as number | null, dailyTimes: [540] }

describe('nextSendAtOf = min(รายวัน, รายเดือน)', () => {
  it('รายเดือนอย่างเดียว → ไม่ null', () => {
    expect(nextSendAtOf({ ...base, monthlyEnabled: true }, now)).toBe(th('2026-10-06', '09:00'))
  })
  it('รายวันอย่างเดียว', () => {
    expect(nextSendAtOf({ ...base, dailyEnabled: true }, now)).toBe(th('2026-10-02', '09:00'))
  })
  it('เปิดทั้งคู่ → อันที่เร็วกว่า', () => {
    expect(nextSendAtOf({ ...base, dailyEnabled: true, monthlyEnabled: true }, now)).toBe(th('2026-10-02', '09:00'))
    // รายเดือนมาก่อนรายวันถัดไป: ตอนนี้ 5 ต.ค. 12:00 รายวันถัดไป 6 ต.ค. 09:00 = เท่ากับรายเดือน
    expect(nextSendAtOf({ ...base, dailyEnabled: true, monthlyEnabled: true, dailyTimes: [540, 1440] }, new Date('2026-10-05T12:00:00+07:00'))).toBe(th('2026-10-05', '24:00'.replace('24:00', '00:00')) + 86_400_000)
  })
  it('ปิดหมด → null', () => {
    expect(nextSendAtOf(base, now)).toBeNull()
  })
})
