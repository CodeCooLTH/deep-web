import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SaveAutoNotifyTemplateSchema, SetAutoNotifyCapSchema, AutoNotifySwitchBodySchema } from '../schemas'

const ok = (s: v.GenericSchema, x: unknown) => v.safeParse(s, x).success

describe('[blocker] SetAutoNotifyCapSchema ขอบ 1..20 (TC-137)', () => {
  it.each([1, 5, 20])('%s ผ่าน', (n) => expect(ok(SetAutoNotifyCapSchema, { dailyCapPerRoom: n })).toBe(true))
  it.each([0, 21, -1, 5.5, '5', null, NaN])('%s ตก', (n) => expect(ok(SetAutoNotifyCapSchema, { dailyCapPerRoom: n })).toBe(false))
})

describe('[blocker] SaveAutoNotifyTemplateSchema นับ code point (TC-181)', () => {
  const body = (b: string) => ({ body: b, expectedUpdatedAt: null })
  it('500 ผ่าน 501 ตก (อีโมจิ)', () => {
    expect(ok(SaveAutoNotifyTemplateSchema, body('😀'.repeat(500)))).toBe(true)
    expect(ok(SaveAutoNotifyTemplateSchema, body('😀'.repeat(501)))).toBe(false)
  })
  it('อีโมจิ 251 ตัว (.length=502) ผ่าน', () => {
    expect(ok(SaveAutoNotifyTemplateSchema, body('😀'.repeat(251)))).toBe(true)
  })
  it('ว่าง/NUL/lone surrogate ตก', () => {
    expect(ok(SaveAutoNotifyTemplateSchema, body(''))).toBe(false)
    expect(ok(SaveAutoNotifyTemplateSchema, body('   '))).toBe(false)
    expect(ok(SaveAutoNotifyTemplateSchema, body('a\u0000'))).toBe(false)
    expect(ok(SaveAutoNotifyTemplateSchema, body('a\uD800'))).toBe(false)
  })
  it('expectedUpdatedAt: null หรือ ISO เท่านั้น', () => {
    expect(ok(SaveAutoNotifyTemplateSchema, { body: 'x', expectedUpdatedAt: '2026-10-17T00:00:00.000Z' })).toBe(true)
    expect(ok(SaveAutoNotifyTemplateSchema, { body: 'x', expectedUpdatedAt: 'เมื่อวาน' })).toBe(false)
    expect(ok(SaveAutoNotifyTemplateSchema, { body: 'x' })).toBe(false)
  })
})

describe('AutoNotifySwitchBodySchema', () => {
  it('boolean เท่านั้น', () => {
    expect(ok(AutoNotifySwitchBodySchema, { enabled: true })).toBe(true)
    expect(ok(AutoNotifySwitchBodySchema, { enabled: 'true' })).toBe(false)
  })
})
