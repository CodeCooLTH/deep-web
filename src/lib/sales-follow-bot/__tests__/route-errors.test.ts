// 00095 TC-106 + SDS §7 — ทุก Error class ใน errors.ts ต้องมี branch ใน route-errors (เพิ่ม class แล้วลืม = 500 = เทสแดง)
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/shop-api-guard', () => ({
  jsonNoStore: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
}))

import * as errors from '../errors'
import { salesFollowErrorResponse, validationErrorResponse } from '../route-errors'

type Res = { body: Record<string, unknown>; status: number }
const call = (e: unknown) => salesFollowErrorResponse(e, 'test') as unknown as Res

const CLASSES = (Object.entries(errors) as [string, unknown][]).filter(
  (e): e is [string, new () => Error] => typeof e[1] === 'function' && (e[1] as { prototype: unknown }).prototype instanceof Error,
)

describe('TC-106 registry ของ error class เทียบ route-errors', () => {
  it('มี class อย่างน้อย 8 ตัว (กันสแกนว่างเปล่า)', () => {
    expect(CLASSES.length).toBeGreaterThanOrEqual(8)
  })
  it.each(CLASSES)('%s ไม่ตกเป็น 500', (_n, Cls) => {
    const r = call(new Cls())
    expect(r.status, `${Cls.name} ไม่มี branch ใน route-errors.ts`).not.toBe(500)
    expect(r.body.error).not.toBe('INTERNAL_ERROR')
  })
})

describe('ตารางแปลง SDS §7', () => {
  it('NotFound → 404 NOT_FOUND', () => {
    expect(call(new errors.SalesFollowBotNotFoundError())).toEqual({ body: { error: 'NOT_FOUND' }, status: 404 })
  })
  it('Stale → 409 BOT_STALE + currentUpdatedAt', () => {
    const d = new Date('2026-11-16T09:00:00.000Z')
    expect(call(new errors.SalesFollowBotStaleError(d))).toEqual({ body: { error: 'BOT_STALE', currentUpdatedAt: d.toISOString() }, status: 409 })
  })
  it('ChannelConflict → 409 CHANNEL_CONFLICT + conflicts', () => {
    const conflicts = [{ channelId: 'c', botId: 'b', botName: 'n' }]
    expect(call(new errors.SalesFollowBotChannelConflictError(conflicts))).toEqual({ body: { error: 'CHANNEL_CONFLICT', conflicts }, status: 409 })
  })
  it('ChannelNotFound → 400 · TagNotFound → 400 + names', () => {
    expect(call(new errors.SalesFollowBotChannelNotFoundError())).toEqual({ body: { error: 'CHANNEL_NOT_FOUND' }, status: 400 })
    expect(call(new errors.SalesFollowBotTagNotFoundError(['x']))).toEqual({ body: { error: 'TAG_NOT_FOUND', names: ['x'] }, status: 400 })
  })
  it.each(['TEST_ROOMS_REQUIRED', 'TEST_ROOM_NOT_FOUND', 'TEST_ROOMS_TOO_MANY'] as const)('TestRooms %s → 400', (code) => {
    expect(call(new errors.SalesFollowBotTestRoomsError(code))).toEqual({ body: { error: code }, status: 400 })
  })
  it('NotAvailable: ไม่อยู่นำร่อง 403 · ไม่ใช่ ONLINE_SALES 409', () => {
    expect(call(new errors.SalesFollowBotNotAvailableError('FEATURE_NOT_ENABLED'))).toEqual({ body: { error: 'FEATURE_NOT_ENABLED' }, status: 403 })
    expect(call(new errors.SalesFollowBotNotAvailableError('NOT_AVAILABLE_FOR_SHOP'))).toEqual({ body: { error: 'NOT_AVAILABLE_FOR_SHOP' }, status: 409 })
  })
  it('Validation → 400 VALIDATION_ERROR + issues', () => {
    const issues = [{ code: 'NO_CONDITION' as const, path: 'rules' }]
    expect(call(new errors.SalesFollowBotValidationError(issues))).toEqual({ body: { error: 'VALIDATION_ERROR', issues }, status: 400 })
    expect(validationErrorResponse(issues)).toEqual({ body: { error: 'VALIDATION_ERROR', issues }, status: 400 })
  })
  it('error อื่น → 500 INTERNAL_ERROR และไม่ log ข้อความ (ข้อมูลลูกค้า)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(call(new Error('เบอร์ 0812345678'))).toEqual({ body: { error: 'INTERNAL_ERROR' }, status: 500 })
    expect(JSON.stringify(spy.mock.calls)).not.toContain('0812345678')
    spy.mockRestore()
  })
})
