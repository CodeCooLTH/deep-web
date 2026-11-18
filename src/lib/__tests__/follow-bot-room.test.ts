import { describe, expect, it, vi } from 'vitest'
import type { PanelRun, PanelStep } from '@/services/sales-follow-bot.service'
import { chipTone, createDebounced, createLatestGate, formatRemaining, nextRoundSummary, nextStepIndex, runOf, sentRounds, stepRowKind, stopControl } from '../follow-bot-room'

const U = { day: 'วัน', hour: 'ชม.', minute: 'นาที' }
const step = (index: number, state: PanelStep['state'], dueAt: string | null = null): PanelStep => ({
  index, state, delayMin: 60, sentAt: null, dueAt, reasonText: null,
})
const run = (over: Partial<PanelRun> = {}): PanelRun => ({
  runId: 'r', botName: 'ตามคนถามราคา', stageLabel: 'ยังไม่ซื้อ', holdReason: null, holdText: null,
  awaitingShop: false, canStop: true, finalPending: null,
  steps: [step(1, 'SENT'), step(2, 'PENDING', '2026-11-16T09:40:00.000Z'), step(3, 'PENDING', '2026-11-16T11:40:00.000Z')],
  ...over,
})

describe('runOf', () => {
  it('available:false / ไม่มี run / ยังไม่โหลด = null', () => {
    expect(runOf({ available: false })).toBeNull()
    expect(runOf({ available: true, run: null })).toBeNull()
    expect(runOf(null)).toBeNull()
  })
  it('มี run = คืน run', () => {
    const r = run()
    expect(runOf({ available: true, run: r })).toBe(r)
  })
})

describe('chipTone', () => {
  it('ร้านค้างตอบ = warning · นอกนั้น info', () => {
    expect(chipTone({ awaitingShop: true })).toBe('warning')
    expect(chipTone({ awaitingShop: false })).toBe('info')
  })
})

describe('sentRounds / nextStepIndex', () => {
  it('นับเฉพาะ SENT — ข้าม/ล้มไม่นับ', () => {
    expect(sentRounds([step(1, 'SENT'), step(2, 'SKIPPED'), step(3, 'FAILED')])).toBe(1)
  })
  it('รอบถัดไปคือ PENDING/SENDING แรก · ไม่เหลือ = -1', () => {
    expect(nextStepIndex(run().steps)).toBe(1)
    expect(nextStepIndex([step(1, 'SENT'), step(2, 'SENDING')])).toBe(1)
    expect(nextStepIndex([step(1, 'SENT'), step(2, 'FAILED')])).toBe(-1)
  })
})

describe('formatRemaining', () => {
  it.each([
    [25 * 60_000, '25 นาที'],
    [30_000, '1 นาที'],
    [60 * 60_000, '1 ชม.'],
    [130 * 60_000, '2 ชม. 10 นาที'],
    [(24 * 60 + 3 * 60 + 30) * 60_000, '1 วัน 3 ชม.'],
    [24 * 60 * 60_000, '1 วัน'],
  ])('%i ms -> %s', (ms, out) => expect(formatRemaining(ms, U)).toBe(out))
})

describe('nextRoundSummary', () => {
  const now = Date.parse('2026-11-16T07:30:00.000Z')
  it('ร้านค้างตอบชนะทุกอย่าง (ไม่แสดงเวลาที่ไม่จริง)', () => {
    expect(nextRoundSummary(run({ awaitingShop: true, holdText: 'พัก' }), now)).toEqual({ kind: 'afterReply' })
  })
  it('พัก = ข้อความพักจาก server', () => {
    expect(nextRoundSummary(run({ holdText: 'Meta AI กำลังตอบ' }), now)).toEqual({ kind: 'hold', text: 'Meta AI กำลังตอบ' })
  })
  it('ปกติ = รอบถัดไป + เวลาที่เหลือ (รอบที่ n จาก N)', () => {
    expect(nextRoundSummary(run(), now)).toEqual({
      kind: 'due', n: 2, total: 3, remainingMs: 130 * 60_000, dueAt: '2026-11-16T09:40:00.000Z',
    })
  })
  it('เลยเวลาแล้ว = remainingMs 0 ไม่ติดลบ', () => {
    const s = nextRoundSummary(run(), Date.parse('2026-11-16T10:00:00.000Z'))
    expect(s).toMatchObject({ kind: 'due', remainingMs: 0 })
  })
  it('ไม่มีรอบเหลือ/ไม่มี dueAt = null', () => {
    expect(nextRoundSummary(run({ steps: [step(1, 'SENT')] }), now)).toBeNull()
    expect(nextRoundSummary(run({ steps: [step(1, 'PENDING', null)] }), now)).toBeNull()
  })
})

describe('stepRowKind', () => {
  it('PENDING ถัดไปที่มีเวลา = next · ไม่มีเวลา = waiting', () => {
    expect(stepRowKind(step(2, 'PENDING', '2026-11-16T09:40:00.000Z'), true)).toBe('next')
    expect(stepRowKind(step(2, 'PENDING', null), true)).toBe('waiting')
    expect(stepRowKind(step(3, 'PENDING', '2026-11-16T11:40:00.000Z'), false)).toBe('waiting')
  })
  it('state อื่นแมปตรงตัว', () => {
    expect(stepRowKind(step(1, 'SENT'), false)).toBe('sent')
    expect(stepRowKind(step(1, 'SENDING'), true)).toBe('sending')
    expect(stepRowKind(step(1, 'SKIPPED'), false)).toBe('skipped')
    expect(stepRowKind(step(1, 'FAILED'), false)).toBe('failed')
  })
})

describe('stopControl', () => {
  it('canStop=false = ล็อก + ต้องมีเหตุผล · กำลังหยุด = ล็อกแต่ไม่ขึ้นเหตุผล', () => {
    expect(stopControl({ canStop: false }, false)).toEqual({ disabled: true, showReason: true })
    expect(stopControl({ canStop: true }, true)).toEqual({ disabled: true, showReason: false })
    expect(stopControl({ canStop: true }, false)).toEqual({ disabled: false, showReason: false })
  })
})

describe('createLatestGate', () => {
  it('คำตอบของคำขอเก่า (ตอบกลับลำดับ/ห้องเก่า) ไม่ใช่ล่าสุด', () => {
    const g = createLatestGate()
    const a = g.next()
    const b = g.next()
    expect(g.isLatest(a)).toBe(false)
    expect(g.isLatest(b)).toBe(true)
  })
})

describe('createDebounced', () => {
  it('เรียกรัว ๆ ใน 800ms = ยิงครั้งเดียวหลังเงียบ · cancel = ไม่ยิง', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = createDebounced(fn, 800)
    d.call(); vi.advanceTimersByTime(500); d.call(); vi.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
    d.call(); d.cancel(); vi.advanceTimersByTime(2000)
    expect(fn).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
