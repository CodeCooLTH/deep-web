// [blocker] ข้อตรวจอัตโนมัติขั้น 1 (feature 00060 · T8 งานที่ 3)
//
// 🛑 ข้อที่แพงที่สุดของไฟล์นี้: แหล่งข้อมูลล่มแล้ว fallback เป็น PASS = ออกคำรับรองเท็จ
//    ให้ร้านที่อยู่ในฐานมิจฉาชีพจริง โดยไม่มี error สักตัวและหน้าจอดูปกติทุกประการ

import { describe, expect, it, vi, beforeEach } from 'vitest'

const shopFindUnique = vi.fn()
const userFindUnique = vi.fn()
const orderCount = vi.fn()
const roomFindMany = vi.fn()
const maxVerificationLevel = vi.fn()
const scamSearch = vi.fn()
const recordCheckOutcome = vi.fn()
const collectRoomDuplicateFacts = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    shop: { findUnique: (...a: unknown[]) => shopFindUnique(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    order: { count: (...a: unknown[]) => orderCount(...a) },
    room: { findMany: (...a: unknown[]) => roomFindMany(...a) },
  },
}))
vi.mock('@/services/verification.service', () => ({
  getMaxVerificationLevel: (...a: unknown[]) => maxVerificationLevel(...a),
}))
vi.mock('@/services/scam-report.service', () => ({
  searchScamByIdentifier: (...a: unknown[]) => scamSearch(...a),
}))
vi.mock('@/services/room-image-fingerprint.service', () => ({
  collectRoomDuplicateFacts: (...a: unknown[]) => collectRoomDuplicateFacts(...a),
}))
vi.mock('@/services/inspection-result.service', () => ({
  recordCheckOutcome: (...a: unknown[]) => recordCheckOutcome(...a),
}))

const { runAutomaticStep1Checks } = await import('@/services/inspection-auto-check.service')

const NOW = new Date('2026-09-05T03:00:00.000Z')
const recordedKeys = () =>
  recordCheckOutcome.mock.calls.map((c) => (c[0] as { checkKey: string }).checkKey).sort()
const outcomeOf = (key: string) =>
  (recordCheckOutcome.mock.calls.find((c) => (c[0] as { checkKey: string }).checkKey === key)?.[0] as
    | { outcome: string }
    | undefined)?.outcome

beforeEach(() => {
  vi.clearAllMocks()
  shopFindUnique.mockResolvedValue({
    userId: 'owner-1',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    chatResponseRate: 92,
    chatMedianResponseSec: 120,
    chatResponseSampleSize: 8,
  })
  userFindUnique.mockResolvedValue({ phone: '0812345678' })
  orderCount.mockResolvedValue(0)
  roomFindMany.mockResolvedValue([{ id: 'room-a', images: ['a.jpg'] }])
  collectRoomDuplicateFacts.mockResolvedValue(
    new Map([['room-a', { totalImageCount: 1, hashedImageCount: 1, copiedFromOtherShopCount: 0, lookupFailed: false }]]),
  )
  maxVerificationLevel.mockResolvedValue(1)
  scamSearch.mockResolvedValue({ found: false })
  recordCheckOutcome.mockResolvedValue({ changed: false, resultId: 'res-1' })
})

describe('runAutomaticStep1Checks', () => {
  it('ร้านปกติ → บันทึกเฉพาะข้อที่ตัดสินได้จริง 3 ข้อ ที่เหลือรายงานเป็น skip ไม่ใช่หายเงียบ', async () => {
    const s = await runAutomaticStep1Checks({ shopId: 'shop-1', planStep: 1, now: NOW })
    expect(recordedKeys()).toEqual([
      'account_age',
      'chat_response_speed',
      'complaints',
      'duplicate_listing',
      'phone_identity',
      'scam_db',
    ])
    expect(outcomeOf('scam_db')).toBe('PASS')
    expect(s.recorded).toBe(6)
    // 🛑 ตั้งแต่ปิด OQ-12/OQ-13 (2026-09-06) ทั้ง 6 ข้อตัดสินได้จริง — ถ้าเคสนี้กลับไปมี
    //    CRITERIA_NOT_DECIDED/NO_DETECTOR อีก แปลว่ามีคนถอดเกณฑ์ออกโดยไม่ได้ตั้งใจ
    expect(s.skipped).toEqual({ NO_SOURCE_DATA: 0, CRITERIA_NOT_DECIDED: 0, NO_DETECTOR: 0 })
  })

  it('🛑 mutation: ค้นฐานมิจฉาชีพล้มแล้ว fallback เป็น PASS → เคสนี้ต้องแดง', async () => {
    scamSearch.mockRejectedValue(new Error('upstream down'))
    const s = await runAutomaticStep1Checks({ shopId: 'shop-1', planStep: 1, now: NOW })
    expect(recordedKeys()).not.toContain('scam_db')
    expect(s.skipped.NO_SOURCE_DATA).toBe(1)
  })

  it('เจ้าของร้านไม่มีเบอร์ = ค้นไม่ได้ ไม่ใช่ "ไม่พบในฐาน"', async () => {
    userFindUnique.mockResolvedValue({ phone: null })
    await runAutomaticStep1Checks({ shopId: 'shop-1', planStep: 1, now: NOW })
    expect(scamSearch).not.toHaveBeenCalled()
    expect(recordedKeys()).not.toContain('scam_db')
  })

  it('พบในฐานมิจฉาชีพ → FAIL (ไม่มีป้ายขึ้นสาธารณะ แต่ต้องถูกบันทึกไว้)', async () => {
    scamSearch.mockResolvedValue({ found: true })
    await runAutomaticStep1Checks({ shopId: 'shop-1', planStep: 4, now: NOW })
    expect(outcomeOf('scam_db')).toBe('FAIL')
  })

  it('🛑 mutation: นับข้อร้องเรียนโดยไม่กรองเรื่องที่ปิดแล้ว → เคสนี้ต้องแดง', async () => {
    await runAutomaticStep1Checks({ shopId: 'shop-1', planStep: 1, now: NOW })
    expect(orderCount.mock.calls[0]?.[0]).toMatchObject({
      where: { shopId: 'shop-1', disputeOpenedAt: { not: null }, disputeResolvedAt: null },
    })
  })

  it('มีข้อร้องเรียนค้าง → FAIL', async () => {
    orderCount.mockResolvedValue(1)
    await runAutomaticStep1Checks({ shopId: 'shop-1', planStep: 1, now: NOW })
    expect(outcomeOf('complaints')).toBe('FAIL')
  })

  it('🛑 ทุกการเขียนต้องผ่าน recordCheckOutcome และไม่ผูกกับรอบตรวจ (ข้ออัตโนมัติไม่มีรอบ)', async () => {
    await runAutomaticStep1Checks({ shopId: 'shop-1', planStep: 2, now: NOW })
    for (const [arg] of recordCheckOutcome.mock.calls) {
      expect(arg).toMatchObject({ shopId: 'shop-1', roundId: null, planStep: 2, now: NOW })
      // ข้อระดับร้าน roomId ต้องเป็น null · ข้อรายหลังต้องมี id ของหลังนั้นจริง ๆ
      const { checkKey, roomId } = arg as { checkKey: string; roomId: string | null }
      expect(roomId).toBe(checkKey === 'duplicate_listing' ? 'room-a' : null)
    }
  })

  it('🛑 ข้อรายหลังต้องตัดสินแยกทีละหลัง ไม่ใช่ตัดสินครั้งเดียวแล้วเขียนผลเดียวกันทุกหลัง', async () => {
    roomFindMany.mockResolvedValue([
      { id: 'room-clean', images: ['a.jpg'] },
      { id: 'room-copied', images: ['b.jpg'] },
    ])
    collectRoomDuplicateFacts.mockResolvedValue(
      new Map([
        ['room-clean', { totalImageCount: 1, hashedImageCount: 1, copiedFromOtherShopCount: 0, lookupFailed: false }],
        ['room-copied', { totalImageCount: 1, hashedImageCount: 1, copiedFromOtherShopCount: 1, lookupFailed: false }],
      ]),
    )
    await runAutomaticStep1Checks({ shopId: 'shop-1', planStep: 1, now: NOW })
    const dup = recordCheckOutcome.mock.calls
      .map((c) => c[0] as { checkKey: string; roomId: string | null; outcome: string })
      .filter((a) => a.checkKey === 'duplicate_listing')
    expect(dup).toHaveLength(2)
    expect(dup.find((d) => d.roomId === 'room-clean')?.outcome).toBe('PASS')
    expect(dup.find((d) => d.roomId === 'room-copied')?.outcome).toBe('FAIL')
  })

  it('🛑 mutation: อ่าน Shop.chatResponseRate ดิบโดยข้ามเกณฑ์ตัวอย่างขั้นต่ำ → เคสนี้ต้องแดง', async () => {
    // ตัวอย่าง 1 บทสนทนา: หน้าร้านสาธารณะเลือกจะไม่พูดอะไรเลย ฝั่งตรวจสอบก็ต้องเงียบเหมือนกัน
    shopFindUnique.mockResolvedValue({
      userId: 'owner-1',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      chatResponseRate: 100,
      chatMedianResponseSec: 60,
      chatResponseSampleSize: 1,
    })
    await runAutomaticStep1Checks({ shopId: 'shop-1', planStep: 1, now: NOW })
    expect(recordedKeys()).not.toContain('chat_response_speed')
  })

  it('ร้านที่เพิ่งเปิดยังไม่ถึง 30 วัน → account_age = FAIL (ฝั่งผู้ซื้อยุบเป็น "ยังไม่มีข้อมูล")', async () => {
    shopFindUnique.mockResolvedValue({
      userId: 'owner-1',
      createdAt: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000),
      chatResponseRate: 92,
      chatMedianResponseSec: 120,
      chatResponseSampleSize: 8,
    })
    await runAutomaticStep1Checks({ shopId: 'shop-1', planStep: 1, now: NOW })
    expect(outcomeOf('account_age')).toBe('FAIL')
  })

  it('รันซ้ำในวันเดียวกันให้ผลเท่าเดิม — ความ idempotent อยู่ที่ recordCheckOutcome (TD-002)', async () => {
    const a = await runAutomaticStep1Checks({ shopId: 'shop-1', planStep: 1, now: NOW })
    const b = await runAutomaticStep1Checks({ shopId: 'shop-1', planStep: 1, now: NOW })
    expect(b).toEqual(a)
  })

  it('ร้านที่หาไม่เจอ → ไม่ throw และไม่เขียนอะไรเลย', async () => {
    shopFindUnique.mockResolvedValue(null)
    const s = await runAutomaticStep1Checks({ shopId: 'ghost', planStep: 1, now: NOW })
    expect(s.recorded).toBe(0)
    expect(recordCheckOutcome).not.toHaveBeenCalled()
  })
})
