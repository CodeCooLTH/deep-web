// 00095-ext FR-FA-5/BR-FA-8 — ดึงสิทธิ์คุมเธรดคืนจาก Business Suite (pure)
import { describe, expect, it } from 'vitest'
import { MIN_MS } from '../constants'
import { afterClaim, BORROW_RETRY_MS, mayReclaim, META_BUSINESS_AI_APP_ID, RECLAIM_RETRY_MS, reclaimBackoffActive, OTHER_APP_CONTROLS_RE, shouldBorrowFromMetaAi, decideReplyHandoff, buildReplyHandoffNote } from '../thread-control'

const gate = (o: Partial<Parameters<typeof mayReclaim>[0]> = {}) =>
  mayReclaim({ channel: 'MESSENGER', metaAiHolding: false, ownerAppId: null, lastHandover: null, ...o })

describe('afterClaim', () => {
  it('TAKEN → ส่งรอบเดิมใหม่ทันที', () => expect(afterClaim({ outcome: 'TAKEN' })).toEqual({ action: 'RESEND' }))
  it('REQUESTED → ยังไม่ส่ง ลองใหม่ tick หน้า (ไม่ข้ามถาวร)', () => expect(afterClaim({ outcome: 'REQUESTED' })).toEqual({ action: 'RETRY_LATER' }))
  it('ROUTING_NOT_ENABLED → SKIP เหตุผลใหม่ที่บอกทางแก้', () =>
    expect(afterClaim({ outcome: 'FAILED', reason: 'ROUTING_NOT_ENABLED' })).toEqual({ action: 'SKIP', reason: 'ROUTING_NOT_ENABLED' }))
  it('TOKEN_INVALID → SKIP เหตุผลให้เชื่อมเพจใหม่', () =>
    expect(afterClaim({ outcome: 'FAILED', reason: 'TOKEN_INVALID' })).toEqual({ action: 'SKIP', reason: 'CHANNEL_TOKEN_INVALID' }))
  it('UNKNOWN → SKIP แบบเดิม (OTHER_APP_CONTROLS)', () =>
    expect(afterClaim({ outcome: 'FAILED', reason: 'UNKNOWN' })).toEqual({ action: 'SKIP', reason: 'OTHER_APP_CONTROLS' }))
})

describe('mayReclaim — ห้ามแย่งจาก Meta AI', () => {
  it('ไม่มีหลักฐาน Meta AI → ถือว่า Business Suite ดึงคืนได้ (Messenger + IG)', () => {
    expect(gate()).toEqual({ ok: true })
    expect(gate({ channel: 'INSTAGRAM', ownerAppId: '263902037430900' })).toEqual({ ok: true })
  })
  it('LINE/DEEP ไม่มีเจ้าของเธรด → NOT_META', () => {
    expect(gate({ channel: 'LINE' })).toEqual({ ok: false, reason: 'NOT_META' })
    expect(gate({ channel: 'DEEP' })).toEqual({ ok: false, reason: 'NOT_META' })
  })
  it('Meta AI ถือห้องตามสูตร → ไม่แตะ [M-ai]', () => expect(gate({ metaAiHolding: true })).toEqual({ ok: false, reason: 'META_AI' }))
  it('เจ้าของที่สังเกตได้คือ Business AI → ไม่แตะ', () => expect(gate({ ownerAppId: META_BUSINESS_AI_APP_ID })).toEqual({ ok: false, reason: 'META_AI' }))
  it('handover ล่าสุดเป็น take ของ Business AI (axon_take_thread_control) → ไม่แตะ', () => {
    expect(gate({ lastHandover: { kind: 'take', metadata: 'axon_take_thread_control' } })).toEqual({ ok: false, reason: 'META_AI' })
    // event อื่นล่าสุด (เช่น เราเองขอ/คนใน Business Suite) ไม่ถือเป็นหลักฐาน AI
    expect(gate({ lastHandover: { kind: 'request', metadata: 'deep-seller-takeover:REQUESTED' } })).toEqual({ ok: true })
  })
})

describe('reclaimBackoffActive', () => {
  const now = new Date('2026-11-16T12:00:00Z')
  it('ไม่เคยล้ม → ไม่รอ · ล้มไม่ถึง 5 นาที → รอ · ครบ 5 นาที → ลองใหม่', () => {
    expect(reclaimBackoffActive(null, now)).toBe(false)
    expect(reclaimBackoffActive(new Date(now.getTime() - 4 * MIN_MS), now)).toBe(true)
    expect(reclaimBackoffActive(new Date(now.getTime() - RECLAIM_RETRY_MS), now)).toBe(false)
  })
})

it('ตรงถ้อยคำของ Meta', () => {
  expect(OTHER_APP_CONTROLS_RE.test('(#10) Message failed to send because another app is controlling this thread now.')).toBe(true)
  expect(OTHER_APP_CONTROLS_RE.test('WINDOW_CLOSED')).toBe(false)
})

describe('shouldBorrowFromMetaAi — ยืมห้องจาก Meta AI (2026-11-16)', () => {
  const now = new Date('2026-11-16T10:00:00Z')
  const base = { channel: 'MESSENGER', dueIfNotHeld: true, lastFailedBorrowAt: null as Date | null, now }
  it('ห้อง Messenger/IG ที่ถึงเวลาส่ง + ไม่เคยยืมล้ม = ยืม', () => {
    expect(shouldBorrowFromMetaAi(base)).toBe(true)
    expect(shouldBorrowFromMetaAi({ ...base, channel: 'INSTAGRAM' })).toBe(true)
  })
  it('LINE / ยังไม่ถึงเวลาส่ง = ไม่ยืม (ไม่ยิง Graph เปล่า ๆ)', () => {
    expect(shouldBorrowFromMetaAi({ ...base, channel: 'LINE' })).toBe(false)
    expect(shouldBorrowFromMetaAi({ ...base, dueIfNotHeld: false })).toBe(false)
  })
  it('ยืมล้มไม่ถึง 30 นาที = ไม่ยิงซ้ำ · ครบ 30 นาที = ลองใหม่', () => {
    expect(shouldBorrowFromMetaAi({ ...base, lastFailedBorrowAt: new Date(now.getTime() - BORROW_RETRY_MS + 1000) })).toBe(false)
    expect(shouldBorrowFromMetaAi({ ...base, lastFailedBorrowAt: new Date(now.getTime() - BORROW_RETRY_MS) })).toBe(true)
  })
})

describe('decideReplyHandoff — ส่งห้องต่อเมื่อลูกค้าตอบ (FR-FA-7)', () => {
  const d = decideReplyHandoff
  it('ADMIN: ดึงคืนเฉพาะเมื่อ Meta AI ถือห้อง · ไม่ถือ = ไม่ยิง Graph', () => {
    expect(d({ channel: 'MESSENGER', setting: 'ADMIN', metaAiHolds: true })).toBe('TAKE_BACK')
    expect(d({ channel: 'INSTAGRAM', setting: 'ADMIN', metaAiHolds: true })).toBe('TAKE_BACK')
    expect(d({ channel: 'MESSENGER', setting: 'ADMIN', metaAiHolds: false })).toBe('NONE')
  })
  it('META_AI: ส่งให้ Business AI · ถืออยู่แล้ว = ไม่ยิง', () => {
    expect(d({ channel: 'MESSENGER', setting: 'META_AI', metaAiHolds: false })).toBe('PASS_TO_META_AI')
    expect(d({ channel: 'MESSENGER', setting: 'META_AI', metaAiHolds: true })).toBe('NONE')
  })
  it('LINE = ไม่มี Graph ทุกค่าตั้ง', () => {
    for (const setting of ['ADMIN', 'META_AI'] as const) for (const metaAiHolds of [true, false]) expect(d({ channel: 'LINE', setting, metaAiHolds })).toBe('NONE')
  })
})

describe('buildReplyHandoffNote', () => {
  it('ข้อความตามสเปก 3 แบบ + LINE นับเป็นแอดมินเสมอ', () => {
    expect(buildReplyHandoffNote({ channel: 'MESSENGER', setting: 'ADMIN', failed: false })).toBe('ลูกค้าตอบแล้ว — ส่งต่อให้แอดมิน')
    expect(buildReplyHandoffNote({ channel: 'MESSENGER', setting: 'META_AI', failed: false })).toBe('ลูกค้าตอบแล้ว — ส่งต่อให้ Meta AI')
    expect(buildReplyHandoffNote({ channel: 'INSTAGRAM', setting: 'META_AI', failed: true })).toBe('ลูกค้าตอบแล้ว — ส่งต่อให้ Meta AI ไม่สำเร็จ (เพจยังไม่ได้ตั้ง Conversation Routing) ห้องอยู่กับแอดมิน')
    expect(buildReplyHandoffNote({ channel: 'LINE', setting: 'META_AI', failed: false })).toBe('ลูกค้าตอบแล้ว — ส่งต่อให้แอดมิน')
  })
})
