import { describe, it, expect, afterEach } from 'vitest'
import { resolveDue, quickSnooze, reminderFireAt, reminderWindowEnd, FollowUpDueError } from '@/lib/follow-up-time'

const NOW = new Date('2026-09-29T05:00:00Z') // 12:00 ไทย
const iso = (d: Date) => d.toISOString()
const ORIGINAL_TZ = process.env.TZ
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe('resolveDue [blocker AC-ACT-01/18]', () => {
  it('มีเวลา 10:00 ไทย = 03:00Z', () => {
    expect(resolveDue({ date: '2026-09-30', time: '10:00' }, NOW)).toEqual({
      dueAt: new Date('2026-09-30T03:00:00Z'),
      allDay: false,
    })
  })
  it('ทั้งวัน = เที่ยงคืนไทย (17:00Z วันก่อน)', () => {
    expect(resolveDue({ date: '2026-09-30', time: null }, NOW)).toEqual({
      dueAt: new Date('2026-09-29T17:00:00Z'),
      allDay: true,
    })
  })
  it('วันไม่มีจริง/รูปแบบผิด/เวลาผิด → FollowUpDueError', () => {
    expect(() => resolveDue({ date: '2026-02-30', time: null }, NOW)).toThrow(FollowUpDueError)
    expect(() => resolveDue({ date: '2026-9-30', time: null }, NOW)).toThrow(FollowUpDueError)
    expect(() => resolveDue({ date: '2026-09-30', time: '24:00' }, NOW)).toThrow(FollowUpDueError)
    expect(() => resolveDue({ date: '2026-09-30', time: '9:00' }, NOW)).toThrow(FollowUpDueError)
  })
  it('ขอบช่วง: −365/+730 ผ่าน, เกิน 1 วันไม่ผ่าน (นับจากวันนี้ไทย)', () => {
    // วันนี้ไทย = 2026-09-29 → −365 = 2025-09-29, +730 = 2028-09-28
    expect(() => resolveDue({ date: '2025-09-29', time: null }, NOW)).not.toThrow()
    expect(() => resolveDue({ date: '2025-09-28', time: null }, NOW)).toThrow(FollowUpDueError)
    expect(() => resolveDue({ date: '2028-09-28', time: null }, NOW)).not.toThrow()
    expect(() => resolveDue({ date: '2028-09-29', time: null }, NOW)).toThrow(FollowUpDueError)
  })
  it('"วันนี้ไทย" ตัดตามไทย ไม่ใช่ UTC: 23:30 ไทย (UTC ยังเป็นวันเดิม) ขอบเลื่อนตามไทย', () => {
    // เติมไว้ฆ่า mutation ที่ใช้วัน UTC: 16:30Z 09-29 = 23:30 ไทย; ถ้ารู้จักแต่ UTC วันนี้ = 09-29 เท่ากัน
    // จึงใช้ 18:00Z = 01:00 ไทย 09-30 (UTC ยัง 09-29) ⇒ ขอบล่าง 2025-09-30 ผ่าน, 2025-09-29 ไม่ผ่าน
    const n = new Date('2026-09-29T18:00:00Z')
    expect(() => resolveDue({ date: '2025-09-30', time: null }, n)).not.toThrow()
    expect(() => resolveDue({ date: '2025-09-29', time: null }, n)).toThrow(FollowUpDueError)
  })
  it('ผลเท่ากันทุก TZ เครื่อง', () => {
    const res: string[] = []
    for (const tz of ['UTC', 'Asia/Bangkok', 'America/Los_Angeles']) {
      process.env.TZ = tz
      res.push(iso(resolveDue({ date: '2026-09-30', time: '10:00' }, NOW).dueAt))
    }
    expect(new Set(res)).toEqual(new Set(['2026-09-30T03:00:00.000Z']))
  })
})

describe('quickSnooze ข้าม TZ [blocker AC-ACT-14/15]', () => {
  // NOW_2330 = 23:30 ไทย 09-29 (UTC ยัง 09-29 16:30, LA = 09:30) · NOW_0300 = 03:00 ไทย 09-30 (UTC ยัง 09-29 20:00 — ข้ามวันคนละแบบ)
  const NOW_2330 = new Date('2026-09-29T16:30:00Z')
  const NOW_0300 = new Date('2026-09-29T20:00:00Z')
  const EXPECT = {
    [NOW_2330.toISOString()]: {
      TOMORROW_9: ['2026-09-30T02:00:00.000Z', false],
      IN_3_DAYS: ['2026-10-01T17:00:00.000Z', true],
      NEXT_WEEK: ['2026-10-05T17:00:00.000Z', true],
    },
    [NOW_0300.toISOString()]: {
      TOMORROW_9: ['2026-10-01T02:00:00.000Z', false],
      IN_3_DAYS: ['2026-10-02T17:00:00.000Z', true],
      NEXT_WEEK: ['2026-10-06T17:00:00.000Z', true],
    },
  } as const
  for (const tz of ['UTC', 'Asia/Bangkok', 'America/Los_Angeles']) {
    for (const now of [NOW_2330, NOW_0300]) {
      it(`TZ=${tz} now=${now.toISOString()}`, () => {
        process.env.TZ = tz
        for (const p of ['TOMORROW_9', 'IN_3_DAYS', 'NEXT_WEEK'] as const) {
          const r = quickSnooze(p, now)
          const [dueAt, allDay] = EXPECT[now.toISOString()][p]
          expect([iso(r.dueAt), r.allDay]).toEqual([dueAt, allDay])
        }
      })
    }
  }
  it('พรุ่งนี้ 09:00 ที่ 23:30 ไทย = 09:00 ของวันถัดไปตามปฏิทิน ไม่ใช่ +24 ชม. (23:30 ของ 09-30)', () => {
    const r = quickSnooze('TOMORROW_9', NOW_2330)
    expect(r.dueAt.getTime()).not.toBe(NOW_2330.getTime() + 24 * 3600_000)
  })
  it('NEXT_WEEK = +7 วันปฏิทินนับจากวันนี้ไทย', () => {
    const now = new Date('2026-09-29T05:00:00Z')
    expect(iso(quickSnooze('NEXT_WEEK', now).dueAt)).toBe('2026-10-05T17:00:00.000Z')
  })
})

describe('reminderFireAt / reminderWindowEnd', () => {
  it('ทั้งวัน: fire = +9 ชม., window = +24 ชม. · มีเวลา: fire = dueAt, window = +6 ชม.', () => {
    const allDay = { dueAt: new Date('2026-09-29T17:00:00Z'), allDay: true }
    expect(iso(reminderFireAt(allDay))).toBe('2026-09-30T02:00:00.000Z')
    expect(iso(reminderWindowEnd(allDay))).toBe('2026-09-30T16:59:59.999Z')
    const timed = { dueAt: new Date('2026-09-30T03:00:00Z'), allDay: false }
    expect(iso(reminderFireAt(timed))).toBe('2026-09-30T03:00:00.000Z')
    expect(iso(reminderWindowEnd(timed))).toBe('2026-09-30T09:00:00.000Z')
  })
})
