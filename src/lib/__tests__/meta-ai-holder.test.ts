import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  metaAiHoldingUntilMs,
  decideMetaAiHolding,
  withMetaAiHold,
  isMetaAiHolding,
  metaAiNowBucket,
  META_PAGE_INBOX_APP_ID as PAGE,
  META_IG_INBOX_APP_ID as IG,
  type MetaAiFacts,
} from '../meta-ai-holder'

const OUR = '1570859340799126'
const H = 3_600_000
const T0 = Date.UTC(2026, 9, 17, 0, 0, 0)

// echo AI ของ Page Inbox ที่เวลา T0 และ lastMessage = echo เดียวกัน (สภาพหลัง ingest)
const base = (o: Partial<MetaAiFacts> = {}): MetaAiFacts => ({
  metaForeignEchoAt: new Date(T0),
  metaForeignEchoAppId: PAGE,
  metaForeignEchoAi: true,
  metaForeignEchoAdminText: false,
  lastMessageAt: new Date(T0),
  lastSenderRole: 'SHOP',
  metaOwnerAppId: null,
  metaOwnerObservedAt: null,
  ...o,
})

describe('metaAiHoldingUntilMs (TFR-002)', () => {
  it('AI echo ของ Page Inbox → ถือถึง echoAt + 24 ชม.', () => {
    expect(metaAiHoldingUntilMs(base(), OUR)).toBe(T0 + 24 * H)
  })
  it('IG Inbox ก็ถือ', () => {
    expect(metaAiHoldingUntilMs(base({ metaForeignEchoAppId: IG }), OUR)).toBe(T0 + 24 * H)
  })
  it.each([
    ['ไม่มี echo เลย', base({ metaForeignEchoAt: null })],
    ['Page Inbox แต่ไม่มีธง AI (คนพิมพ์ใน Business Suite)', base({ metaForeignEchoAi: null })],
    ['ai_generated=false', base({ metaForeignEchoAi: false })],
    ['มี admin_text', base({ metaForeignEchoAdminText: true })],
    ['แอปอื่นที่ไม่ใช่แอปกลาง Meta', base({ metaForeignEchoAppId: '165907476854626' })],
    ['app_id เป็นของเรา', base({ metaForeignEchoAppId: OUR })],
    ['ไม่มี app_id', base({ metaForeignEchoAppId: null })],
    ['มีข้อความฝั่งร้านของเราใหม่กว่า echo AI', base({ lastMessageAt: new Date(T0 + 1), lastSenderRole: 'SHOP' })],
    ['pass ให้เรา ใหม่กว่า echo AI', base({ metaOwnerAppId: OUR, metaOwnerObservedAt: new Date(T0 + 1000) })],
  ])('ไม่ถือ: %s', (_n, f) => {
    expect(metaAiHoldingUntilMs(f, OUR)).toBeNull()
  })
  it('ลูกค้าพิมพ์หลัง AI echo → AI ยังถืออยู่ (ไม่ตัด)', () => {
    expect(metaAiHoldingUntilMs(base({ lastMessageAt: new Date(T0 + 5000), lastSenderRole: 'BUYER' }), OUR)).toBe(T0 + 24 * H)
  })
  it('owner เป็นเราแต่เก่ากว่า echo AI → ยังถือ', () => {
    expect(metaAiHoldingUntilMs(base({ metaOwnerAppId: OUR, metaOwnerObservedAt: new Date(T0 - 1000) }), OUR)).toBe(T0 + 24 * H)
  })
  it('ไม่ตั้ง FB_CHAT_APP_ID (null) → ยังตัดสินจาก app กลาง + ai ได้ ไม่เดาว่าใครเป็นเรา', () => {
    expect(metaAiHoldingUntilMs(base(), null)).toBe(T0 + 24 * H)
    expect(metaAiHoldingUntilMs(base({ metaOwnerAppId: OUR, metaOwnerObservedAt: new Date(T0 + 1) }), null)).toBe(T0 + 24 * H)
  })
  it('รับ Date และ number เท่ากัน', () => {
    expect(metaAiHoldingUntilMs(base({ metaForeignEchoAt: T0, lastMessageAt: T0 }), OUR)).toBe(T0 + 24 * H)
  })
})

describe('decideMetaAiHolding — ขอบ 24 ชม.', () => {
  it.each([
    ['23:59', 24 * H - 60_000, true],
    ['24:00 พอดี', 24 * H, false],
    ['24:01', 24 * H + 60_000, false],
  ])('%s', (_n, dt, expected) => {
    expect(decideMetaAiHolding(base(), T0 + dt, OUR)).toBe(expected)
  })
})

describe('withMetaAiHold', () => {
  it('เติม primitive และตัดคอลัมน์ดิบ 6 ตัวออก', () => {
    const out = withMetaAiHold({ id: 'c1', ...base() }, OUR) as Record<string, unknown>
    expect(out.metaAiHoldUntilMs).toBe(T0 + 24 * H)
    for (const k of ['metaOwnerAppId', 'metaOwnerObservedAt', 'metaForeignEchoAt', 'metaForeignEchoAppId', 'metaForeignEchoAi', 'metaForeignEchoAdminText'])
      expect(k in out).toBe(false)
    expect(out.id).toBe('c1')
  })
})

describe('ข้อห้ามของสูตร', () => {
  const src = readFileSync(join(__dirname, '../meta-ai-holder.ts'), 'utf8')
  it('ไม่ import prisma และไม่อ่าน viaStandby/marker', () => {
    expect(src).not.toMatch(/from ['"][^'"]*prisma/)
    // ตัดคอมเมนต์ออกก่อน — คอมเมนต์อธิบายข้อห้ามได้
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/viaStandby|marker/i)
  })
})

describe('isMetaAiHolding / nowBucket — ขอบหมดอายุฝั่ง UI', () => {
  it('null/undefined = ไม่ถือ · until > bucket = ถือ · until === bucket = หมด', () => {
    expect(isMetaAiHolding(null, T0)).toBe(false)
    expect(isMetaAiHolding(undefined, T0)).toBe(false)
    expect(isMetaAiHolding(T0 + 1, T0)).toBe(true)
    expect(isMetaAiHolding(T0, T0)).toBe(false)
    expect(isMetaAiHolding(T0 - 1, T0)).toBe(false)
  })
  it('bucket ปัดลงทีละ 5 นาที และคงที่ในก้อนเดียวกัน', () => {
    const b = metaAiNowBucket(T0 + 7 * 60_000)
    expect(b % (5 * 60_000)).toBe(0)
    expect(metaAiNowBucket(b + 4 * 60_000)).toBe(b)
    expect(metaAiNowBucket(b + 5 * 60_000)).toBe(b + 5 * 60_000)
  })
})
