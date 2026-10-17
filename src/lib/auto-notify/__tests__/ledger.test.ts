import { describe, expect, it } from 'vitest'
import { AUTO_NOTIFY_LEDGER_REASONS } from '../ledger-constants'
import {
  LEDGER_FIXED_KEY,
  TRACKING_NOTICE_MAX,
  mapFailureToLedgerReason,
  normalizeTrackingKey,
  thaiDayStart,
} from '../ledger'

describe('[blocker] thaiDayStart — วันไทย ไม่ใช่ UTC (TC-137 / M-18)', () => {
  const ICT = (s: string) => Date.parse(`${s}+07:00`)
  it('23:59 ไทยยังอยู่ในวันเดิม · 00:00 ไทยขึ้นวันใหม่', () => {
    expect(thaiDayStart(ICT('2026-10-17T23:59:59.999')).getTime()).toBe(ICT('2026-10-17T00:00:00.000'))
    expect(thaiDayStart(ICT('2026-10-18T00:00:00.000')).getTime()).toBe(ICT('2026-10-18T00:00:00.000'))
    expect(thaiDayStart(ICT('2026-10-17T00:00:00.000')).getTime()).toBe(ICT('2026-10-17T00:00:00.000'))
  })
  it('เวลา 03:00 ไทย (=20:00 UTC เมื่อวาน) เริ่มวันที่เวลาไทยของวันนั้น ไม่ใช่เที่ยงคืน UTC', () => {
    const now = ICT('2026-10-17T03:00:00.000')
    expect(thaiDayStart(now).getTime()).toBe(ICT('2026-10-17T00:00:00.000'))
    expect(thaiDayStart(now).toISOString()).toBe('2026-10-16T17:00:00.000Z')
  })
  it('รับ Date ได้', () => {
    expect(thaiDayStart(new Date(ICT('2026-10-17T12:00:00.000'))).toISOString()).toBe('2026-10-16T17:00:00.000Z')
  })
})

describe('key / เพดาน', () => {
  it('normalizeTrackingKey: trim + UPPER', () => {
    expect(normalizeTrackingKey('  th123abc ')).toBe('TH123ABC')
    expect(normalizeTrackingKey('TH123ABC')).toBe('TH123ABC')
  })
  it('ค่าคงที่', () => {
    expect(LEDGER_FIXED_KEY).toBe('-')
    expect(TRACKING_NOTICE_MAX).toBe(3)
  })
})

describe('mapFailureToLedgerReason (SDS §7.4)', () => {
  it.each([
    ['WINDOW_CLOSED', 'WINDOW_CLOSED'],
    ['QUOTA_EXCEEDED', 'QUOTA_EXCEEDED'],
    ['CONTACT_BLOCKED', 'REJECTED_BY_PLATFORM'],
    ['CHANNEL_NOT_ACTIVE', 'REJECTED_BY_PLATFORM'],
    ['TOKEN_INVALID', 'REJECTED_BY_PLATFORM'],
    ['LINE_UNAVAILABLE', 'REJECTED_BY_PLATFORM'],
    ['SEND_FAILED:190', 'REJECTED_BY_PLATFORM'],
    ['อะไรก็ไม่รู้', 'REJECTED_BY_PLATFORM'],
    ['', 'REJECTED_BY_PLATFORM'],
    [null, 'REJECTED_BY_PLATFORM'],
    ['CONVERSATION_NOT_FOUND', 'NOT_ELIGIBLE_ANYMORE'],
    ['FORBIDDEN', 'NOT_ELIGIBLE_ANYMORE'],
    ['INVALID_ACTOR', 'NOT_ELIGIBLE_ANYMORE'],
  ])('%s → %s', (code, reason) => {
    expect(mapFailureToLedgerReason(code)).toBe(reason)
  })
  it('ผลทุกค่าอยู่ใน CHECK ของ DB', () => {
    for (const c of ['WINDOW_CLOSED', 'QUOTA_EXCEEDED', 'X', 'FORBIDDEN']) {
      expect(AUTO_NOTIFY_LEDGER_REASONS).toContain(mapFailureToLedgerReason(c))
    }
  })
})
