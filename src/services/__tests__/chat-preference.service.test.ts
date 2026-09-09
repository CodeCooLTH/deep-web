import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  sellerChatPreference: { findUnique: vi.fn(), upsert: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { getInboxSortMode, setInboxSortMode } from '@/services/chat-preference.service'

/**
 * 00018 ส่วนขยาย 2026-09-09 — ค่าตั้งกล่องแชทต่อ (ผู้ใช้ × ร้าน)
 * [blocker] lazy default: "ไม่มีแถว" ต้องแปลว่าค่าตั้งต้น ไม่ใช่ error/ไม่ใช่สถานะพิเศษ
 * ถ้าข้อนี้พัง ผู้ใช้ทุกคนที่ยังไม่เคยตั้งค่าจะเปิดกล่องแชทไม่ได้ (AC-SORT-04)
 */
describe('getInboxSortMode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('[blocker] ไม่มีแถว → LAST_MESSAGE (ไม่ throw ไม่สร้างแถว)', async () => {
    db.sellerChatPreference.findUnique.mockResolvedValue(null)
    expect(await getInboxSortMode('u1', 's1')).toBe('LAST_MESSAGE')
    expect(db.sellerChatPreference.upsert).not.toHaveBeenCalled()
  })

  it('มีแถว → คืนค่าที่เก็บไว้', async () => {
    db.sellerChatPreference.findUnique.mockResolvedValue({ inboxSort: 'LAST_CUSTOMER_MESSAGE' })
    expect(await getInboxSortMode('u1', 's1')).toBe('LAST_CUSTOMER_MESSAGE')
  })

  it('[blocker] ค่าในฐานที่อ่านไม่ออก → ตกไปค่าตั้งต้น ไม่ทำให้ทั้งหน้าพัง', async () => {
    db.sellerChatPreference.findUnique.mockResolvedValue({ inboxSort: 'OLDEST_FIRST' })
    expect(await getInboxSortMode('u1', 's1')).toBe('LAST_MESSAGE')
  })

  it('อ่านด้วยคีย์ (userId, shopId) เสมอ — ไม่ใช่ userId เดี่ยว', async () => {
    db.sellerChatPreference.findUnique.mockResolvedValue(null)
    await getInboxSortMode('u1', 's1')
    expect(db.sellerChatPreference.findUnique.mock.calls[0]![0].where).toEqual({
      userId_shopId: { userId: 'u1', shopId: 's1' },
    })
  })
})

describe('setInboxSortMode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upsert ด้วยคีย์คู่ และคืนค่าที่บันทึกจริง', async () => {
    db.sellerChatPreference.upsert.mockResolvedValue({})
    const saved = await setInboxSortMode('u1', 's1', 'LAST_CUSTOMER_MESSAGE')
    expect(saved).toBe('LAST_CUSTOMER_MESSAGE')
    const call = db.sellerChatPreference.upsert.mock.calls[0]![0]
    expect(call.where).toEqual({ userId_shopId: { userId: 'u1', shopId: 's1' } })
    expect(call.create).toEqual({ userId: 'u1', shopId: 's1', inboxSort: 'LAST_CUSTOMER_MESSAGE' })
    expect(call.update).toEqual({ inboxSort: 'LAST_CUSTOMER_MESSAGE' })
  })

  it('[blocker] ค่าที่ไม่รู้จักถูกบีบเป็นค่าตั้งต้นก่อนลงฐาน (CHECK ที่ DB เป็นด่านสุดท้าย ไม่ใช่ด่านแรก)', async () => {
    db.sellerChatPreference.upsert.mockResolvedValue({})
    const saved = await setInboxSortMode('u1', 's1', 'ANYTHING' as never)
    expect(saved).toBe('LAST_MESSAGE')
    expect(db.sellerChatPreference.upsert.mock.calls[0]![0].update).toEqual({ inboxSort: 'LAST_MESSAGE' })
  })
})
