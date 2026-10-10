import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ —
// ถ้าประกาศ db ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError) (เจอปัญหานี้แล้วใน Task 7)
const db = vi.hoisted(() => ({
  externalContact: { upsert: vi.fn(), findUnique: vi.fn() },
  conversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  chatMessage: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  notification: { create: vi.fn() },
  shop: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/services/shop-channel.service', () => ({ getChannelByExternalId: vi.fn() }))
vi.mock('@/lib/facebook/graph', () => ({
  getContactProfile: vi.fn().mockResolvedValue({ name: 'ลูกค้า ทดสอบ', avatarUrl: 'https://x/p.jpg' }),
  /**
   * 🛑 เพิ่ม 2026-08-12 — 3 เทสในไฟล์นี้แดงมานาน เพราะ `ingestInboundMessage` โตขึ้นทีหลัง:
   * attachment ที่ payload ไม่มี URL ตรง ๆ จะถามซ้ำที่ Graph ผ่าน `fetchAttachmentUrl()`
   * mock ที่ประกาศ "เท่าที่ service ใช้ ณ วันเขียน" จึงพัง
   *
   * คืน `null` = "ถามแล้วไม่ได้ URL" ซึ่งตรงกับสิ่งที่ 3 เทสนี้ตั้งใจทดสอบพอดี — เคส
   * mirror ไม่ผ่านต้องไม่กลายเป็นบับเบิลว่างเปล่า
   */
  fetchAttachmentUrl: vi.fn().mockResolvedValue(null),
}))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'c'.repeat(64)
})

import { ingestInboundMessage } from '@/services/channel-chat.service'
import { getChannelByExternalId } from '@/services/shop-channel.service'

const echo = (mid: string, text: string) => ({
  sender: { id: 'PAGE1' },
  recipient: { id: 'PSID_1' },
  timestamp: 1750000000000,
  message: { mid, text, is_echo: true },
})

describe('ingestInboundMessage — ข้อความภายในของ Meta (META_NOTICE)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) => fn(db))
    ;(getChannelByExternalId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ch1', shopId: 'shop1', provider: 'MESSENGER', accessToken: 'tok',
    })
    // ค่าเริ่มต้น: ไม่มี contact เดิม → ทุกเทสยังเรียก getContactProfile ได้เหมือนพฤติกรรมเดิม
    // เทสที่สนใจ I-2 โดยเฉพาะจะ override เอง
    db.externalContact.findUnique.mockResolvedValue(null)
    db.externalContact.upsert.mockResolvedValue({ id: 'ec1', name: 'ลูกค้า ทดสอบ' })
    db.conversation.findUnique.mockResolvedValue(null)
    db.conversation.create.mockResolvedValue({ id: 'conv1', shopId: 'shop1' })
    db.conversation.update.mockResolvedValue({})
    db.shop.findUnique.mockResolvedValue({ userId: 'owner1', shopName: 'ร้าน' })
    db.chatMessage.create.mockResolvedValue({ id: 'm1', createdAt: new Date() })
    // ค่าเริ่มต้น = ยังไม่เคยเห็น mid นี้ (ทางลัด dedupe ไม่ทำงาน) → เทสเดิมทุกตัวเดินเส้นทางเดิม
    db.chatMessage.findUnique.mockResolvedValue(null)
  })

  it('echo "replied to an ad." → เก็บเป็น META_NOTICE และไม่แตะสรุปเธรด', async () => {
    const r = await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: echo('mid.n1', 'สมชาย replied to an ad.') })
    expect(r.status).toBe('STORED')
    expect(db.chatMessage.create.mock.calls[0]![0].data).toMatchObject({ senderRole: 'SHOP', type: 'META_NOTICE' })
    expect(db.conversation.update).not.toHaveBeenCalled()
  })

  it('echo ข้อความร้านจริง → TEXT และอัปเดตสรุปเธรดตามเดิม', async () => {
    await ingestInboundMessage({ provider: 'MESSENGER', pageExternalId: 'PAGE1', event: echo('mid.n2', 'ส่งของแล้วค่ะ') })
    expect(db.chatMessage.create.mock.calls[0]![0].data.type).toBe('TEXT')
    expect(db.conversation.update.mock.calls[0]![0].data.lastSenderRole).toBe('SHOP')
  })

  it('ลูกค้าพิมพ์ตรงคำเดียวกัน (ไม่ใช่ echo) → TEXT ของลูกค้า', async () => {
    await ingestInboundMessage({
      provider: 'MESSENGER',
      pageExternalId: 'PAGE1',
      event: { sender: { id: 'PSID_1' }, recipient: { id: 'PAGE1' }, timestamp: 1750000000000, message: { mid: 'mid.n3', text: 'Lead stage set to Qualified' } },
    })
    expect(db.chatMessage.create.mock.calls[0]![0].data).toMatchObject({ senderRole: 'BUYER', type: 'TEXT' })
  })
})
