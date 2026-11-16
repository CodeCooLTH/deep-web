// 00095-ext FR-FA-5/BR-FA-8 — ดึงสิทธิ์คุมเธรดคืนจาก Business Suite (pure)
import { describe, expect, it } from 'vitest'
import { MIN_MS } from '../constants'
import { afterClaim, mayReclaim, META_BUSINESS_AI_APP_ID, RECLAIM_RETRY_MS, reclaimBackoffActive, OTHER_APP_CONTROLS_RE } from '../thread-control'

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
