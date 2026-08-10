/**
 * `ingestPostbackEvent` — ลูกค้ากดปุ่ม (Get Started/persistent menu/button template) ยืดหน้าต่าง
 * เวลาตอบกลับ (feature 00043, TFR-HA-03, SDS §8.3)
 *
 * ต้นแบบไฟล์เทส: channel-chat-referral-window.test.ts (ingestAdReferral — รูปร่างใกล้เคียงที่สุด:
 * หา channel → หา contact → หา conversation → updateMany แบบ "เขียนเฉพาะเมื่อใหม่กว่าเดิม")
 *
 * vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ — ถ้าประกาศ db ด้วย
 * const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ดู channel-chat-ingest.test.ts)
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const db = vi.hoisted(() => ({
  externalContact: { findUnique: vi.fn() },
  conversation: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/services/shop-channel.service', () => ({ getChannelByExternalId: vi.fn() }))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'c'.repeat(64)
})

import { ingestPostbackEvent } from '@/services/channel-chat.service'
import { getChannelByExternalId } from '@/services/shop-channel.service'

const base = {
  provider: 'MESSENGER',
  pageExternalId: 'PAGE1',
  contactExternalId: 'PSID_1',
}

describe('ingestPostbackEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getChannelByExternalId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ch1',
      shopId: 'shop1',
      provider: 'MESSENGER',
      accessToken: 'tok',
    })
    db.externalContact.findUnique.mockResolvedValue({ id: 'contact1' })
    db.conversation.findUnique.mockResolvedValue({ id: 'conv1' })
    db.conversation.updateMany.mockResolvedValue({ count: 1 })
  })

  it('#1 ไม่พบ ShopChannel → ไม่ throw, ไม่เรียก updateMany', async () => {
    ;(getChannelByExternalId as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    await expect(
      ingestPostbackEvent({ ...base, timestamp: 1_750_000_000_000 }),
    ).resolves.toBeUndefined()
    expect(db.conversation.updateMany).not.toHaveBeenCalled()
  })

  it('#2 (BR-HA-11) contactExternalId === pageExternalId → ไม่เรียก updateMany เลย', async () => {
    await ingestPostbackEvent({
      provider: 'MESSENGER',
      pageExternalId: 'PAGE1',
      contactExternalId: 'PAGE1',
      timestamp: 1_750_000_000_000,
    })
    expect(db.conversation.updateMany).not.toHaveBeenCalled()
  })

  it('#3 ไม่พบ ExternalContact ที่มีอยู่ก่อน → ไม่เรียก updateMany, ไม่สร้างแถวใหม่ (TD-HA-01)', async () => {
    db.externalContact.findUnique.mockResolvedValue(null)
    await ingestPostbackEvent({ ...base, timestamp: 1_750_000_000_000 })
    expect(db.conversation.updateMany).not.toHaveBeenCalled()
    expect(db.conversation.create).not.toHaveBeenCalled()
  })

  it('#3b ไม่พบ Conversation ที่มีอยู่ก่อน → ไม่เรียก updateMany, ไม่สร้างแถวใหม่ (TD-HA-01)', async () => {
    db.conversation.findUnique.mockResolvedValue(null)
    await ingestPostbackEvent({ ...base, timestamp: 1_750_000_000_000 })
    expect(db.conversation.updateMany).not.toHaveBeenCalled()
    expect(db.conversation.create).not.toHaveBeenCalled()
  })

  it('[blocker] #4 พบ conversation, event ใหม่กว่า lastInboundAt เดิม → updateMany ถูกเรียกด้วย where.OR ที่มีทั้ง {lastInboundAt:null} และ {lastInboundAt:{lt:at}}', async () => {
    const ts = 1_750_000_000_000
    await ingestPostbackEvent({ ...base, timestamp: ts })

    expect(db.conversation.updateMany).toHaveBeenCalledTimes(1)
    const arg = db.conversation.updateMany.mock.calls[0]![0]
    expect(arg.where.id).toBe('conv1')
    expect(arg.data).toEqual({ lastInboundAt: new Date(ts) })
    // พิสูจน์ที่ระดับ WHERE clause เพราะ unit test ไม่มี DB จริงให้ดูผลลัพธ์ตรง ๆ — ทั้งสองเงื่อนไข
    // ต้องอยู่ครบ ไม่งั้น postback ที่มาช้ากว่า (สลับลำดับ) จะดันเวลาถอยหลังได้
    expect(arg.where.OR).toEqual([{ lastInboundAt: null }, { lastInboundAt: { lt: new Date(ts) } }])
  })

  it('#5 event มาทาง standby (ไม่มี field พิเศษ) → ทำงานเหมือนแถวที่ไม่ใช่ standby ทุกประการ', async () => {
    // ฟังก์ชันไม่มี parameter `standby` เลย — เรียกแบบเดียวกับ #4 เพื่อพิสูจน์ว่า route เรียกได้
    // โดยไม่ต้องผ่านค่านี้ (SDS §8.3 #5)
    const ts = 1_750_000_000_000
    await ingestPostbackEvent({ ...base, timestamp: ts })
    expect(db.conversation.updateMany).toHaveBeenCalledTimes(1)
  })

  it('#6 ไม่มี timestamp (undefined) → ใช้ new Date() แทน ไม่ throw', async () => {
    await expect(ingestPostbackEvent({ ...base })).resolves.toBeUndefined()
    expect(db.conversation.updateMany).toHaveBeenCalledTimes(1)
    const arg = db.conversation.updateMany.mock.calls[0]![0]
    expect(arg.data.lastInboundAt).toBeInstanceOf(Date)
  })
})
