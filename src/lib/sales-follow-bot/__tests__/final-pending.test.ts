import { describe, it, expect } from 'vitest'
import { finalPendingOf } from '../final-pending'

const now = new Date('2026-11-18T10:00:00Z')
const sent = new Date('2026-11-18T08:00:00Z')
const run = { status: 'DONE', lastSentAt: sent, finalActionAt: null as Date | null }
const bot = { finalAction: 'SPAM' as const, finalDelayMin: 1440 }

describe('finalPendingOf', () => {
  it('คำนวณ dueAt = lastSentAt + delay', () => {
    expect(finalPendingOf(run, bot, now)).toEqual({ kind: 'SPAM', dueAt: new Date('2026-11-19T08:00:00Z') })
  })
  it('NONE / ทำแล้ว / ยัง ACTIVE / ไม่มีรอบที่ส่ง = null', () => {
    expect(finalPendingOf(run, { ...bot, finalAction: 'NONE' }, now)).toBeNull()
    expect(finalPendingOf({ ...run, finalActionAt: now }, bot, now)).toBeNull()
    expect(finalPendingOf({ ...run, status: 'ACTIVE' }, bot, now)).toBeNull()
    expect(finalPendingOf({ ...run, lastSentAt: null }, bot, now)).toBeNull()
  })
  it('เลยกรอบ lookback = null · เลยเวลาแต่ยังในกรอบ = ยัง pending', () => {
    expect(finalPendingOf(run, bot, new Date('2026-12-30T00:00:00Z'))).toBeNull()
    expect(finalPendingOf(run, bot, new Date('2026-11-20T00:00:00Z'))?.kind).toBe('SPAM')
  })
})
